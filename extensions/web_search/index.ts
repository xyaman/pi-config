import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
	DEFAULT_MAX_BYTES,
	DEFAULT_MAX_LINES,
	formatSize,
	truncateHead,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Type } from "typebox";

// Parse a simple .env file: skip comments/blank lines, split on first =, trim quotes.
function parseEnv(text: string): Record<string, string> {
	const env: Record<string, string> = {};
	for (const line of text.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq === -1) continue;
		let key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		// Strip surrounding quotes
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		env[key] = value;
	}
	return env;
}

// Load API keys from .env at repo root, falling back to process.env.
async function loadKeys(): Promise<{ brave?: string; tavily?: string }> {
	try {
		const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
		const env = parseEnv(await readFile(join(root, ".env"), "utf8"));
		return {
			brave: env.BRAVE_API_KEY || process.env.BRAVE_API_KEY,
			tavily: env.TAVILY_API_KEY || process.env.TAVILY_API_KEY,
		};
	} catch {
		return {
			brave: process.env.BRAVE_API_KEY,
			tavily: process.env.TAVILY_API_KEY,
		};
	}
}

interface Result {
	title: string;
	url: string;
	description: string;
}

interface Details {
	provider: "brave" | "tavily";
	query: string;
	resultCount: number;
	truncated?: boolean;
	tempFile?: string;
}

const Params = Type.Object({
	query: Type.String({ description: "Search query" }),
	max_results: Type.Optional(
		Type.Number({ description: "Maximum results to return (1-10, default 5)" }),
	),
});



// Try Brave Search. Returns null on any failure except user cancellation.
async function searchBrave(
	query: string,
	max: number,
	key: string,
	signal?: AbortSignal,
): Promise<Result[] | null> {
	try {
		const url = new URL("https://api.search.brave.com/api/v1/web/search");
		url.searchParams.set("q", query);
		url.searchParams.set("count", String(max));

		const res = await fetch(url.toString(), {
			headers: { "X-Subscription-Token": key, Accept: "application/json" },
			signal,
		});
		if (!res.ok) return null;

		const data = (await res.json()) as {
			web?: { results?: Array<{ title: string; url: string; description: string }> };
		};
		return (data.web?.results ?? []).map((r) => ({
			title: r.title,
			url: r.url,
			description: r.description,
		}));
	} catch (err) {
		if (signal?.aborted) throw err;
		return null;
	}
}

// Search Tavily (last resort — throws on any failure).
async function searchTavily(
	query: string,
	max: number,
	key: string,
	signal?: AbortSignal,
): Promise<Result[]> {
	let res: Response;
	try {
		res = await fetch("https://api.tavily.com/search", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				api_key: key,
				query,
				max_results: max,
				search_depth: "basic",
			}),
			signal,
		});
	} catch (err) {
		if (signal?.aborted) throw err;
		throw new Error(
			`Tavily request failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}

	if (!res.ok) {
		const body = await res.text().catch(() => "");
		throw new Error(`Tavily API error (${res.status}): ${body || res.statusText}`);
	}

	try {
		const data = (await res.json()) as {
			results?: Array<{ title: string; url: string; content: string }>;
		};
		return (data.results ?? []).map((r) => ({
			title: r.title,
			url: r.url,
			description: r.content,
		}));
	} catch (err) {
		if (signal?.aborted) throw err;
		throw new Error(
			`Tavily response parsing failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

// Format results for the LLM, truncating if necessary.
async function formatResults(
	query: string,
	results: Result[],
	provider: "brave" | "tavily",
	requestedMax: number,
) {
	let text = `Query: "${query}"\nProvider: ${provider}\nResults: ${results.length} (requested ${requestedMax})\n\n`;
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		text += `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.description}\n\n`;
	}
	if (results.length === 0) {
		text += "No results found.\n";
	}

	const t = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
	const details: Details = { provider, query, resultCount: results.length };

	if (t.truncated) {
		const dir = await mkdtemp(join(tmpdir(), "pi-web-search-"));
		const file = join(dir, "results.txt");
		await writeFile(file, text, "utf8");
		details.truncated = true;
		details.tempFile = file;
		t.content +=
			`\n\n[Output truncated: showing ${t.outputLines} of ${t.totalLines} lines (${formatSize(t.outputBytes)} of ${formatSize(t.totalBytes)}). Full output saved to: ${file}]`;
	}

	return {
		content: [{ type: "text" as const, text: t.content }],
		details,
	};
}

export default function (pi: ExtensionAPI) {
	pi.registerTool({
		name: "web_search",
		label: "Web Search",
		description:
			"Search the web for current information. Uses Brave Search first; falls back to Tavily if Brave fails. Returns an error if both providers are unavailable.",
		promptSnippet: "Search the web for current information, facts, documentation, or news",
		promptGuidelines: [
			"Use web_search when the user asks for current events, recent documentation, or facts that may have changed after the knowledge cutoff.",
			"Use web_search before claiming a library version, API, or package is the latest.",
			"Keep max_results small (3-5) unless the user explicitly needs many sources.",
		],
		parameters: Params,

		async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
			const query = params.query;
			const max = Math.min(Math.max(1, params.max_results ?? 5), 10);
			const keys = await loadKeys();

			let results: Result[] | null = null;
			let provider: "brave" | "tavily" = "tavily";

			if (keys.brave) {
				results = await searchBrave(query, max, keys.brave, signal);
				if (results) provider = "brave";
			}

			if (!results) {
				if (!keys.tavily) {
					throw new Error(
						"Brave Search failed (or is not configured) and no TAVILY_API_KEY is set. Both search providers are unavailable.",
					);
				}
				results = await searchTavily(query, max, keys.tavily, signal);
				provider = "tavily";
			}

			return formatResults(query, results, provider, max);
		},

		renderCall(args, theme, _context) {
			let text = theme.fg("toolTitle", theme.bold("web_search "));
			text += theme.fg("accent", `"${args.query}"`);
			if (args.max_results) {
				text += theme.fg("dim", ` max=${args.max_results}`);
			}
			return new Text(text, 0, 0);
		},

		renderResult(result, { expanded, isPartial }, theme, _context) {
			if (isPartial) {
				return new Text(theme.fg("warning", "Searching..."), 0, 0);
			}

			const details = result.details as Details | undefined;
			const text = result.content[0];
			const content = text?.type === "text" ? text.text : "";

			if (!details || details.resultCount === 0) {
				return new Text(theme.fg("dim", "No results"), 0, 0);
			}

			let display =
				theme.fg("success", `${details.resultCount} results`) +
				theme.fg("muted", ` via ${details.provider}`);
			if (details.truncated) {
				display += theme.fg("warning", " (truncated)");
			}

			if (expanded) {
				const lines = content.split("\n");
				for (const line of lines.slice(0, 30)) {
					display += `\n${theme.fg("dim", line)}`;
				}
				if (lines.length > 30) {
					display += `\n${theme.fg("muted", "...")}`;
				}
				if (details.tempFile) {
					display += `\n${theme.fg("dim", `Full output: ${details.tempFile}`)}`;
				}
			}

			return new Text(display, 0, 0);
		},
	});
}

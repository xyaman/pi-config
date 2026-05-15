import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
	let noEditMode = false;

	// Toggle via /noedit command.
	pi.registerCommand("noedit", {
		description: "Toggle no-edit mode (blocks edit/write tools)",
		handler: async (_args, ctx) => {
			noEditMode = !noEditMode;
			const msg = noEditMode ? "🔒 No-edit mode ON" : "🔓 No-edit mode OFF";
			const level = noEditMode ? "warning" : "info";
			ctx.ui.notify(msg, level);
			ctx.ui.setStatus("no-edit", noEditMode ? "🔒 NO-EDIT" : undefined);
		},
	});

	// Make the agent aware: inject a system prompt restriction before each turn.
	pi.on("before_agent_start", async (event) => {
		if (!noEditMode) return;

		return {
			systemPrompt:
				event.systemPrompt +
				"\n\n[NO-EDIT MODE IS ACTIVE] You MUST NOT modify any files. Do not call the `edit` or `write` tools under any circumstance. You may still use all other tools (read, bash, grep, find, ls, web_search, etc.) freely. Provide analysis, explanations, and code suggestions only. The user will apply changes manually.",
		};
	});

	// Safety net: block edit/write at the tool call level if the agent ignores the prompt.
	pi.on("tool_call", async (event, ctx) => {
		if (!noEditMode) return;
		if (event.toolName !== "edit" && event.toolName !== "write") return;

		ctx.ui.notify(`Blocked ${event.toolName}: no-edit mode is active`, "warning");
		return {
			block: true,
			reason: "No-edit mode is active. Use /noedit to disable it before modifying files.",
		};
	});
}

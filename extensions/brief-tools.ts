/**
 * Brief Tools — compact, muted rendering for built-in tools
 *
 * Shows each tool call as a single line:
 *   [ ] tool_name: file          (pending)
 *   [✓] tool_name: file          (success)
 *   [✗] tool_name: file          (error)
 *
 * No background boxes. Muted palette. Expanded mode shows full output.
 *
 * Install via pi package:
 *   pi install git:github.com/xyaman/pi-config
 */

import type {
  BashToolDetails,
  EditToolDetails,
  ExtensionAPI,
  ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createFindTool,
  createGrepTool,
  createLsTool,
  createReadTool,
  createWriteTool,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { homedir } from "os";

function shortenPath(path: string): string {
  const home = homedir();
  if (path.startsWith(home)) {
    return `~${path.slice(home.length)}`;
  }
  return path;
}

function iconFor(context: {
  state?: Record<string, unknown>;
  isError?: boolean;
}): string {
  const isError = context.isError ?? false;
  const isDone = context.state?.done === true;
  if (isError) return "[✗]";
  if (isDone) return "[✓]";
  return "[ ]";
}

function markDone(context: { state?: Record<string, unknown>; invalidate?: () => void }) {
  if (!context.state?.done) {
    context.state = { ...(context.state || {}), done: true };
    context.invalidate?.();
  }
}

const toolCache = new Map<string, ReturnType<typeof createBuiltInTools>>();

function createBuiltInTools(cwd: string) {
  return {
    read: createReadTool(cwd),
    bash: createBashTool(cwd),
    edit: createEditTool(cwd),
    write: createWriteTool(cwd),
    find: createFindTool(cwd),
    grep: createGrepTool(cwd),
    ls: createLsTool(cwd),
  };
}

function getTools(cwd: string) {
  let tools = toolCache.get(cwd);
  if (!tools) {
    tools = createBuiltInTools(cwd);
    toolCache.set(cwd, tools);
  }
  return tools;
}

export default function (pi: ExtensionAPI) {
  // -----------------------------------------------------------------------
  // read
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "read",
    label: "read",
    description: getTools(process.cwd()).read.description,
    parameters: getTools(process.cwd()).read.parameters,
    renderShell: "self",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getTools(ctx.cwd).read.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const icon = iconFor(context);
      const path = shortenPath(args.path || "");
      let line = `${theme.fg("muted", icon)} ${theme.fg("muted", "read:")} ${theme.fg("text", path)}`;
      if (args.offset || args.limit) {
        const parts: string[] = [];
        if (args.offset) parts.push(`offset=${args.offset}`);
        if (args.limit) parts.push(`limit=${args.limit}`);
        line += theme.fg("dim", ` {${parts.join(", ")}}`);
      }
      return new Text(line, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      if (!isPartial) markDone(context);
      if (!expanded) return new Text("", 0, 0);
      if (isPartial) return new Text(theme.fg("dim", "..."), 0, 0);

      const content = result.content[0];
      if (content?.type === "image") {
        return new Text(theme.fg("muted", "(image)"), 0, 0);
      }
      if (content?.type !== "text") {
        return new Text("", 0, 0);
      }

      const details = result.details as ReadToolDetails | undefined;
      let text = content.text;
      if (details?.truncation?.truncated) {
        text += `\n${theme.fg("dim", "[truncated]")}`;
      }
      return new Text(
        text
          .split("\n")
          .map((l) => theme.fg("muted", l))
          .join("\n"),
        0,
        0,
      );
    },
  });

  // -----------------------------------------------------------------------
  // bash
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: getTools(process.cwd()).bash.description,
    parameters: getTools(process.cwd()).bash.parameters,
    renderShell: "self",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getTools(ctx.cwd).bash.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const icon = iconFor(context);
      const cmd = args.command || "";
      const shortCmd = cmd.length > 60 ? `${cmd.slice(0, 57)}...` : cmd;
      let line = `${theme.fg("muted", icon)} ${theme.fg("muted", "bash:")} ${theme.fg("text", shortCmd)}`;
      if (args.timeout) {
        line += theme.fg("dim", ` (timeout: ${args.timeout}s)`);
      }
      return new Text(line, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      if (!isPartial) markDone(context);
      if (!expanded) return new Text("", 0, 0);
      if (isPartial) return new Text(theme.fg("dim", "..."), 0, 0);

      const content = result.content[0];
      if (content?.type !== "text") return new Text("", 0, 0);

      const details = result.details as BashToolDetails | undefined;
      let text = content.text;
      if (details?.truncation?.truncated) {
        text += `\n${theme.fg("dim", "[truncated]")}`;
      }
      return new Text(
        text
          .split("\n")
          .map((l) => theme.fg("muted", l))
          .join("\n"),
        0,
        0,
      );
    },
  });

  // -----------------------------------------------------------------------
  // edit
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: getTools(process.cwd()).edit.description,
    parameters: getTools(process.cwd()).edit.parameters,
    renderShell: "self",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getTools(ctx.cwd).edit.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const icon = iconFor(context);
      const path = shortenPath(args.path || "");
      const edits = Array.isArray(args.edits) ? args.edits.length : 0;
      let line = `${theme.fg("muted", icon)} ${theme.fg("muted", "edit:")} ${theme.fg("text", path)}`;
      if (edits > 0) {
        line += theme.fg("dim", ` (${edits} block${edits > 1 ? "s" : ""})`);
      }
      return new Text(line, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      if (!isPartial) markDone(context);
      if (!expanded) return new Text("", 0, 0);
      if (isPartial) return new Text(theme.fg("dim", "..."), 0, 0);

      const content = result.content[0];
      if (content?.type !== "text") return new Text("", 0, 0);

      const details = result.details as EditToolDetails | undefined;
      if (content.text.startsWith("Error")) {
        return new Text(theme.fg("error", content.text), 0, 0);
      }

      let text = content.text;
      if (details?.diff) {
        text = details.diff
          .split("\n")
          .map((l) => {
            if (l.startsWith("+") && !l.startsWith("+++")) {
              return theme.fg("muted", l);
            } else if (l.startsWith("-") && !l.startsWith("---")) {
              return theme.fg("muted", l);
            } else {
              return theme.fg("dim", l);
            }
          })
          .join("\n");
      }
      return new Text(text, 0, 0);
    },
  });

  // -----------------------------------------------------------------------
  // write
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "write",
    label: "write",
    description: getTools(process.cwd()).write.description,
    parameters: getTools(process.cwd()).write.parameters,
    renderShell: "self",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getTools(ctx.cwd).write.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const icon = iconFor(context);
      const path = shortenPath(args.path || "");
      const lineCount = args.content ? args.content.split("\n").length : 0;
      let line = `${theme.fg("muted", icon)} ${theme.fg("muted", "write:")} ${theme.fg("text", path)}`;
      if (lineCount > 0) {
        line += theme.fg("dim", ` (${lineCount} lines)`);
      }
      return new Text(line, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      if (!isPartial) markDone(context);
      if (!expanded) return new Text("", 0, 0);
      if (isPartial) return new Text(theme.fg("dim", "..."), 0, 0);

      const content = result.content[0];
      if (content?.type === "text" && content.text.startsWith("Error")) {
        return new Text(theme.fg("error", content.text), 0, 0);
      }
      return new Text("", 0, 0);
    },
  });

  // -----------------------------------------------------------------------
  // grep
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "grep",
    label: "grep",
    description: getTools(process.cwd()).grep.description,
    parameters: getTools(process.cwd()).grep.parameters,
    renderShell: "self",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getTools(ctx.cwd).grep.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const icon = iconFor(context);
      const pattern = args.pattern || "";
      const path = shortenPath(args.path || ".");
      let line = `${theme.fg("muted", icon)} ${theme.fg("muted", "grep:")} ${theme.fg("text", `/${pattern}/`)} ${theme.fg("dim", `in ${path}`)}`;
      if (args.glob) {
        line += theme.fg("dim", ` (${args.glob})`);
      }
      return new Text(line, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      if (!isPartial) markDone(context);
      if (!expanded) return new Text("", 0, 0);
      if (isPartial) return new Text(theme.fg("dim", "..."), 0, 0);

      const content = result.content[0];
      if (content?.type !== "text") return new Text("", 0, 0);
      return new Text(
        content.text
          .split("\n")
          .map((l) => theme.fg("muted", l))
          .join("\n"),
        0,
        0,
      );
    },
  });

  // -----------------------------------------------------------------------
  // find
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "find",
    label: "find",
    description: getTools(process.cwd()).find.description,
    parameters: getTools(process.cwd()).find.parameters,
    renderShell: "self",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getTools(ctx.cwd).find.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const icon = iconFor(context);
      const pattern = args.pattern || "";
      const path = shortenPath(args.path || ".");
      let line = `${theme.fg("muted", icon)} ${theme.fg("muted", "find:")} ${theme.fg("text", pattern)} ${theme.fg("dim", `in ${path}`)}`;
      return new Text(line, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      if (!isPartial) markDone(context);
      if (!expanded) return new Text("", 0, 0);
      if (isPartial) return new Text(theme.fg("dim", "..."), 0, 0);

      const content = result.content[0];
      if (content?.type !== "text") return new Text("", 0, 0);
      return new Text(
        content.text
          .split("\n")
          .map((l) => theme.fg("muted", l))
          .join("\n"),
        0,
        0,
      );
    },
  });

  // -----------------------------------------------------------------------
  // ls
  // -----------------------------------------------------------------------
  pi.registerTool({
    name: "ls",
    label: "ls",
    description: getTools(process.cwd()).ls.description,
    parameters: getTools(process.cwd()).ls.parameters,
    renderShell: "self",

    async execute(toolCallId, params, signal, onUpdate, ctx) {
      return getTools(ctx.cwd).ls.execute(toolCallId, params, signal, onUpdate);
    },

    renderCall(args, theme, context) {
      const icon = iconFor(context);
      const path = shortenPath(args.path || ".");
      let line = `${theme.fg("muted", icon)} ${theme.fg("muted", "ls:")} ${theme.fg("text", path)}`;
      return new Text(line, 0, 0);
    },

    renderResult(result, { expanded, isPartial }, theme, context) {
      if (!isPartial) markDone(context);
      if (!expanded) return new Text("", 0, 0);
      if (isPartial) return new Text(theme.fg("dim", "..."), 0, 0);

      const content = result.content[0];
      if (content?.type !== "text") return new Text("", 0, 0);
      return new Text(
        content.text
          .split("\n")
          .map((l) => theme.fg("muted", l))
          .join("\n"),
        0,
        0,
      );
    },
  });
}

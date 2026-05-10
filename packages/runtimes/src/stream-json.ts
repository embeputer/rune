import type { RuneEvent } from "./types";

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [k: string]: JsonValue };

/**
 * Wraps an async iterable of stdout/stderr/exit RuneEvents from a CLI that
 * emits one JSON object per line, and yields events with formatted plain-text
 * stdout. Non-JSON lines pass through unchanged.
 *
 * `format(value)` should return:
 *  - a string → emitted as stdout
 *  - null     → swallowed (system events, etc.)
 *  - undefined → fallback: pretty-printed JSON
 */
export async function* parseStreamJson(
  events: AsyncIterable<RuneEvent>,
  format: (value: JsonValue) => string | null | undefined,
): AsyncGenerator<RuneEvent> {
  let buffer = "";

  function flushLine(line: string): RuneEvent[] {
    const trimmed = line.trim();
    if (!trimmed) return [];
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(trimmed) as JsonValue;
    } catch {
      return [{ type: "stdout", data: `${line}\n` }];
    }
    const out = format(parsed);
    if (out === null) return [];
    if (out === undefined) {
      return [{ type: "stdout", data: `${JSON.stringify(parsed, null, 2)}\n` }];
    }
    return out ? [{ type: "stdout", data: out }] : [];
  }

  for await (const ev of events) {
    if (ev.type === "stdout") {
      buffer += ev.data;
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        for (const out of flushLine(line)) yield out;
      }
    } else if (ev.type === "stderr") {
      yield ev;
    } else if (ev.type === "exit") {
      if (buffer) {
        for (const out of flushLine(buffer)) yield out;
        buffer = "";
      }
      yield ev;
    }
  }
}

/**
 * Format a cursor-agent stream-json event line. cursor-agent diverges from
 * Claude Code in two important ways:
 *
 *   1. Tool activity is surfaced as standalone `tool_call` events (with
 *      subtype `started` / `completed`) rather than inline `tool_use` /
 *      `tool_result` blocks inside assistant content.
 *
 *   2. With `--stream-partial-output`, every text delta is its own
 *      `assistant` event. The CLI also emits two duplicate flush events
 *      per turn that we must drop, distinguishable by the presence/absence
 *      of `timestamp_ms` and `model_call_id` (see Cursor docs):
 *
 *        | timestamp_ms | model_call_id | meaning              | action |
 *        | -----------  | ------------- | -------------------- | ------ |
 *        | present      | absent        | streaming delta      | EMIT   |
 *        | present      | present       | pre-tool-call flush  | SKIP   |
 *        | absent       | absent        | end-of-turn flush    | SKIP   |
 *
 * Spec: https://cursor.com/docs/cli/reference/output-format
 */
export function formatCursorAgentStreamEvent(value: JsonValue): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, JsonValue>;
  const type = typeof v.type === "string" ? v.type : "";

  if (type === "system") {
    const subtype = typeof v.subtype === "string" ? v.subtype : "";
    if (subtype === "init") {
      const model = typeof v.model === "string" ? v.model : "";
      // A tiny header so the user immediately sees the agent has started, even
      // if the first reasoning step takes a few seconds.
      return model ? `▸ ${model}\n\n` : "▸ Starting…\n\n";
    }
    return null;
  }

  // User events are the echoed prompt — never useful in chat output.
  if (type === "user") return null;

  if (type === "assistant") {
    const hasTs = v.timestamp_ms !== undefined && v.timestamp_ms !== null;
    const hasModelCallId = v.model_call_id !== undefined && v.model_call_id !== null;
    // Only the live deltas have timestamp_ms AND no model_call_id. The two
    // flush variants would re-emit text we've already streamed.
    if (!hasTs || hasModelCallId) return null;

    const message = v.message;
    if (!message || typeof message !== "object" || Array.isArray(message)) return null;
    const content = (message as Record<string, JsonValue>).content;
    return formatContentBlocks(content);
  }

  if (type === "tool_call") {
    const subtype = typeof v.subtype === "string" ? v.subtype : "";
    if (subtype !== "started") return null; // ignore `completed` to keep noise down

    const toolCall = v.tool_call;
    if (!toolCall || typeof toolCall !== "object" || Array.isArray(toolCall)) return null;
    const tc = toolCall as Record<string, JsonValue>;

    // The tool wrapper key is the tool name (e.g. readToolCall, writeToolCall,
    // runTerminalCommand, ...). Strip the camelCase suffix for a friendlier
    // label and summarize the args' most-likely-relevant field.
    const toolKey = Object.keys(tc)[0] ?? "tool";
    const inner = tc[toolKey];
    const args =
      inner && typeof inner === "object" && !Array.isArray(inner)
        ? ((inner as Record<string, JsonValue>).args as JsonValue | undefined)
        : undefined;

    const friendly = humanizeCursorToolName(toolKey);
    const summary = summarizeToolInput(args);
    return `\n· ${friendly}${summary ? ` ${summary}` : ""}\n`;
  }

  // `result` events are the terminal summary — we already have the text.
  if (type === "result") return null;

  return null;
}

function humanizeCursorToolName(key: string): string {
  // Examples seen: readToolCall, writeToolCall, runTerminalCommand, listDirToolCall.
  return key
    .replace(/ToolCall$/i, "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .toLowerCase();
}

/**
 * Format a Claude Code stream-json event line.
 * Spec: https://docs.anthropic.com/en/docs/claude-code/cli-reference
 */
export function formatAnthropicStreamEvent(value: JsonValue): string | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, JsonValue>;
  const type = typeof v.type === "string" ? v.type : "";

  if (type === "system") return null;
  if (type === "result") {
    const subtype = typeof v.subtype === "string" ? v.subtype : "";
    if (subtype === "success") return null;
    const error = typeof v.error === "string" ? v.error : null;
    return error ? `\n[error] ${error}\n` : null;
  }

  if (type === "assistant") {
    const message = v.message;
    if (!message || typeof message !== "object" || Array.isArray(message)) return null;
    const content = (message as Record<string, JsonValue>).content;
    return formatContentBlocks(content);
  }

  if (type === "user") {
    // `user` stream events are EITHER the initial prompt echoed back OR
    // tool_result blocks being fed to the assistant. We only want the latter
    // — the prompt already lives in the editor pane, so emitting it again
    // would duplicate it into the output.
    const message = v.message;
    if (!message || typeof message !== "object" || Array.isArray(message)) return null;
    const content = (message as Record<string, JsonValue>).content;
    return formatToolResultsOnly(content);
  }

  if (type === "tool_use" || type === "tool_result") {
    return formatContentBlocks([v]);
  }

  return null;
}

function formatToolResultsOnly(content: JsonValue | undefined): string | null {
  if (content === undefined || content === null) return null;
  const blocks = Array.isArray(content) ? content : [content];
  const out: string[] = [];
  for (const block of blocks) {
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const b = block as Record<string, JsonValue>;
    if (b.type !== "tool_result") continue;
    const inner = b.content;
    const text = typeof inner === "string" ? inner : formatContentBlocks(inner) ?? "";
    const trimmed = text.trim();
    if (!trimmed) continue;
    const oneline = trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
    out.push(`  ↳ ${oneline.replace(/\n/g, " ")}\n`);
  }
  return out.length ? out.join("") : null;
}

function formatContentBlocks(content: JsonValue | undefined): string | null {
  if (content === undefined || content === null) return null;
  const blocks = Array.isArray(content) ? content : [content];
  const out: string[] = [];
  for (const block of blocks) {
    if (typeof block === "string") {
      out.push(block);
      continue;
    }
    if (typeof block !== "object" || block === null || Array.isArray(block)) continue;
    const b = block as Record<string, JsonValue>;
    const t = typeof b.type === "string" ? b.type : "";

    if (t === "text") {
      const text = typeof b.text === "string" ? b.text : "";
      if (text) out.push(text);
    } else if (t === "tool_use") {
      const name = typeof b.name === "string" ? b.name : "tool";
      const input = b.input;
      const summary = summarizeToolInput(input);
      out.push(`\n· ${name}${summary ? ` ${summary}` : ""}\n`);
    } else if (t === "tool_result") {
      const inner = b.content;
      const text = typeof inner === "string" ? inner : formatContentBlocks(inner) ?? "";
      const trimmed = text.trim();
      if (trimmed) {
        const oneline = trimmed.length > 200 ? `${trimmed.slice(0, 200)}…` : trimmed;
        out.push(`  ↳ ${oneline.replace(/\n/g, " ")}\n`);
      }
    } else if (t === "thinking") {
      // Skip chain-of-thought
    }
  }
  return out.length ? out.join("") : null;
}

function summarizeToolInput(input: JsonValue | undefined): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) return "";
  const i = input as Record<string, JsonValue>;
  const candidates = ["path", "file_path", "command", "url", "query", "pattern"];
  for (const key of candidates) {
    const val = i[key];
    if (typeof val === "string") {
      return val.length > 80 ? `${val.slice(0, 80)}…` : val;
    }
  }
  return "";
}

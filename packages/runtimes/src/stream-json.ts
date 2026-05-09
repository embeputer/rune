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
 * Format a Cursor Agent / Claude Code stream-json event line.
 * Spec: https://docs.anthropic.com/en/docs/claude-code/cli-reference (claude)
 *       cursor-agent uses a near-identical event stream.
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

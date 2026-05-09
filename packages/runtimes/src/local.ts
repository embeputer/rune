import type { RuntimeId } from "@rune/shared";
import { probeVersion, spawnRuntime } from "./spawn-helper";
import { formatAnthropicStreamEvent, parseStreamJson } from "./stream-json";
import type { ExecuteInput, RuneEvent, Runtime } from "./types";

abstract class CliRuntime implements Runtime {
  abstract id: RuntimeId;
  abstract bin: string;
  abstract buildArgs(input: ExecuteInput): { args: string[]; promptStdin?: string };

  async isAvailable(): Promise<boolean> {
    return (await probeVersion(this.bin)) !== null;
  }

  async version(): Promise<string | null> {
    return probeVersion(this.bin);
  }

  execute(input: ExecuteInput): AsyncIterable<RuneEvent> {
    const { args, promptStdin } = this.buildArgs(input);
    return spawnRuntime({
      cmd: this.bin,
      args,
      cwd: input.cwd,
      signal: input.signal,
      promptStdin,
    });
  }
}

export class CursorAgentRuntime extends CliRuntime {
  id: RuntimeId = "cursor-agent";
  bin = "cursor-agent";
  buildArgs(input: ExecuteInput) {
    // `--trust` skips the "Trust this directory?" prompt that otherwise blocks
    // headless execution. Prompt is piped via stdin to avoid shell quoting issues.
    return {
      args: ["-p", "--trust", "--output-format", "stream-json"],
      promptStdin: input.prompt,
    };
  }
  execute(input: ExecuteInput) {
    return parseStreamJson(super.execute(input), formatAnthropicStreamEvent);
  }
}

export class ClaudeCodeRuntime extends CliRuntime {
  id: RuntimeId = "claude-code";
  bin = "claude";
  buildArgs(input: ExecuteInput) {
    return {
      args: ["-p", "--dangerously-skip-permissions", "--output-format", "stream-json", "--verbose"],
      promptStdin: input.prompt,
    };
  }
  execute(input: ExecuteInput) {
    return parseStreamJson(super.execute(input), formatAnthropicStreamEvent);
  }
}

export class CodexRuntime extends CliRuntime {
  id: RuntimeId = "codex";
  bin = "codex";
  buildArgs(input: ExecuteInput) {
    // codex exec reads prompt via stdin when no positional arg is provided.
    return {
      args: ["exec", "--json", "-"],
      promptStdin: input.prompt,
    };
  }
}

export class DroidRuntime extends CliRuntime {
  id: RuntimeId = "droid";
  bin = "droid";
  buildArgs(input: ExecuteInput) {
    return {
      args: ["exec", "-"],
      promptStdin: input.prompt,
    };
  }
}

export const localRuntimes: Runtime[] = [
  new CursorAgentRuntime(),
  new ClaudeCodeRuntime(),
  new CodexRuntime(),
  new DroidRuntime(),
];

export const localRuntimesById: Record<string, Runtime> = Object.fromEntries(
  localRuntimes.map((r) => [r.id, r]),
);

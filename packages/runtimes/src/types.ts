import type { RuntimeId } from "@rune/shared";

export type RuneEvent =
  | { type: "stdout"; data: string }
  | { type: "stderr"; data: string }
  | { type: "exit"; code: number; error?: string };

export interface ExecuteInput {
  prompt: string;
  cwd: string;
  signal?: AbortSignal;
  /** Required for cursor-cloud: GitHub repo in `owner/name` form */
  github_repo?: string | null;
  github_branch?: string | null;
}

export interface Runtime {
  id: RuntimeId;
  isAvailable(): Promise<boolean>;
  version(): Promise<string | null>;
  execute(input: ExecuteInput): AsyncIterable<RuneEvent>;
}

export class RuntimeUnavailableError extends Error {
  constructor(
    public runtimeId: RuntimeId,
    message: string,
  ) {
    super(message);
    this.name = "RuntimeUnavailableError";
  }
}

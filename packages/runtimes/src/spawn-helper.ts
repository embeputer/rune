import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import type { RuneEvent } from "./types";

export interface SpawnOpts {
  cmd: string;
  args: string[];
  cwd: string;
  /** If true, write prompt to stdin and close. */
  promptStdin?: string;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

/**
 * Spawn a CLI and yield stdout/stderr chunks as RuneEvents.
 * Cross-platform: uses shell on Windows to resolve .cmd shims.
 */
export async function* spawnRuntime(opts: SpawnOpts): AsyncGenerator<RuneEvent> {
  const isWin = process.platform === "win32";
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawn(opts.cmd, opts.args, {
      cwd: opts.cwd,
      signal: opts.signal,
      shell: isWin,
      windowsHide: true,
      env: { ...process.env, ...opts.env },
    }) as ChildProcessWithoutNullStreams;
  } catch (err) {
    yield { type: "exit", code: -1, error: `failed to spawn ${opts.cmd}: ${(err as Error).message}` };
    return;
  }

  if (opts.promptStdin !== undefined) {
    try {
      child.stdin.write(opts.promptStdin);
      child.stdin.end();
    } catch {
      // ignore
    }
  }

  const queue: RuneEvent[] = [];
  let resolveNext: (() => void) | null = null;
  let done = false;
  let exitCode = 0;
  let exitErr: string | undefined;

  const push = (ev: RuneEvent) => {
    queue.push(ev);
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  };

  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => push({ type: "stdout", data: chunk }));
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => push({ type: "stderr", data: chunk }));

  child.on("error", (err) => {
    exitErr = err.message;
  });
  child.on("close", (code) => {
    exitCode = code ?? 0;
    done = true;
    if (resolveNext) {
      const r = resolveNext;
      resolveNext = null;
      r();
    }
  });

  while (true) {
    while (queue.length > 0) {
      yield queue.shift()!;
    }
    if (done) break;
    await new Promise<void>((resolve) => {
      resolveNext = resolve;
    });
  }
  yield { type: "exit", code: exitCode, error: exitErr };
}

/**
 * Probe a CLI's --version. Returns the trimmed first line, or null on failure.
 */
export async function probeVersion(cmd: string): Promise<string | null> {
  return new Promise((resolve) => {
    const isWin = process.platform === "win32";
    let child: ChildProcessWithoutNullStreams;
    try {
      child = spawn(cmd, ["--version"], {
        shell: isWin,
        windowsHide: true,
      }) as ChildProcessWithoutNullStreams;
    } catch {
      resolve(null);
      return;
    }
    let out = "";
    child.stdout?.on("data", (c) => {
      out += c.toString();
    });
    child.stderr?.on("data", (c) => {
      out += c.toString();
    });
    child.on("error", () => resolve(null));
    child.on("close", (code) => {
      if (code === 0 && out.trim()) {
        resolve(out.trim().split(/\r?\n/)[0] ?? null);
      } else {
        resolve(null);
      }
    });
    setTimeout(() => {
      try {
        child.kill();
      } catch {}
      resolve(null);
    }, 4000);
  });
}

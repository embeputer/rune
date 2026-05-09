import { spawn } from "node:child_process";
import { platform } from "node:os";
import type { WebSocket } from "ws";

/**
 * Line-mode shell over a WebSocket. We pipe stdin/stdout/stderr of a child
 * shell process to/from the socket. This is NOT a real PTY — interactive
 * apps that probe a TTY (vim, htop, password prompts) won't work. It's
 * sufficient for git/npm/pnpm/ls/build commands which is the chat-mode
 * use case. Swap in `node-pty` later if needed.
 */

export type ShellKind = "pwsh" | "bash" | "zsh" | "cmd" | "sh" | "auto";

export function parseShell(value: string | null): ShellKind {
  switch (value) {
    case "pwsh":
    case "bash":
    case "zsh":
    case "cmd":
    case "sh":
      return value;
    default:
      return "auto";
  }
}

interface AttachOptions {
  cwd: string;
  shell: ShellKind;
}

interface ControlFrame {
  type: "stdin" | "resize" | "signal";
  data?: string;
  cols?: number;
  rows?: number;
  signal?: NodeJS.Signals;
}

export async function attachShellToSocket(ws: WebSocket, opts: AttachOptions): Promise<void> {
  const { command, args } = resolveShell(opts.shell);

  const child = spawn(command, args, {
    cwd: opts.cwd,
    env: process.env,
    windowsHide: true,
  });

  let closed = false;

  const sendStdout = (chunk: Buffer | string) => {
    if (ws.readyState !== ws.OPEN) return;
    ws.send(typeof chunk === "string" ? chunk : chunk.toString("utf8"));
  };

  child.stdout.on("data", sendStdout);
  child.stderr.on("data", sendStdout);
  child.on("error", (err) => {
    if (ws.readyState === ws.OPEN) {
      ws.send(`\n[pty error] ${err.message}\n`);
    }
  });
  child.on("exit", (code, signal) => {
    closed = true;
    try {
      if (ws.readyState === ws.OPEN) {
        ws.send(`\n[exit code=${code ?? "?"}${signal ? ` signal=${signal}` : ""}]\n`);
        ws.close(1000);
      }
    } catch {
      // ignore
    }
  });

  ws.on("message", (raw) => {
    if (closed) return;
    const text = typeof raw === "string" ? raw : Buffer.isBuffer(raw) ? raw.toString("utf8") : "";
    if (!text) return;
    // Treat anything not starting with `{"type":` as raw stdin to keep
    // typing latency low. Control frames are JSON.
    if (text.startsWith("{")) {
      try {
        const frame = JSON.parse(text) as ControlFrame;
        if (frame.type === "stdin" && typeof frame.data === "string") {
          child.stdin.write(frame.data);
          return;
        }
        if (frame.type === "signal" && frame.signal) {
          try {
            child.kill(frame.signal);
          } catch {
            // ignore
          }
          return;
        }
        if (frame.type === "resize") {
          // No PTY → resize is a no-op but we accept the frame so xterm
          // doesn't error. Could pass to node-pty later.
          return;
        }
      } catch {
        // fall through to stdin
      }
    }
    child.stdin.write(text);
  });

  ws.on("close", () => {
    closed = true;
    try {
      child.kill();
    } catch {
      // ignore
    }
  });

  ws.on("error", () => {
    closed = true;
    try {
      child.kill();
    } catch {
      // ignore
    }
  });
}

function resolveShell(kind: ShellKind): { command: string; args: string[] } {
  const isWin = platform() === "win32";
  if (kind === "pwsh" || (kind === "auto" && isWin)) {
    return { command: "pwsh", args: ["-NoLogo"] };
  }
  if (kind === "cmd") return { command: "cmd.exe", args: [] };
  if (kind === "zsh") return { command: "zsh", args: ["-i"] };
  if (kind === "bash") return { command: "bash", args: ["-i"] };
  if (kind === "sh") return { command: "sh", args: ["-i"] };
  // auto + unix: prefer $SHELL, fall back to bash
  const shell = process.env.SHELL ?? "/bin/bash";
  return { command: shell, args: ["-i"] };
}

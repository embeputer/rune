import type { RuntimeId } from "@rune/shared";
import type { ExecuteInput, RuneEvent, Runtime } from "./types";
import { RuntimeUnavailableError } from "./types";

const CURSOR_API_BASE = process.env.CURSOR_API_BASE ?? "https://api.cursor.com";

export interface CursorCloudOptions {
  apiKey?: string;
  model?: string;
  pollIntervalMs?: number;
  maxPollMs?: number;
}

interface CursorAgent {
  id: string;
  status: "RUNNING" | "FINISHED" | "FAILED" | "CANCELLED" | string;
  summary?: string;
  target?: { branch?: string; url?: string };
}

interface CursorConversation {
  messages: Array<{
    id: string;
    role: "user" | "assistant" | string;
    text?: string;
    type?: string;
  }>;
}

/**
 * Adapter for Cursor's Background Agents API.
 *
 * Reference: https://cursor.com/docs/background-agent
 *
 * Required inputs on the call: `github_repo` ("owner/name"). `github_branch`
 * is optional and falls back to `main` when not provided.
 */
export class CursorCloudRuntime implements Runtime {
  id: RuntimeId = "cursor-cloud";
  private opts: Required<CursorCloudOptions>;

  constructor(opts: CursorCloudOptions = {}) {
    this.opts = {
      apiKey: opts.apiKey ?? process.env.CURSOR_API_KEY ?? "",
      model: opts.model ?? "auto",
      pollIntervalMs: opts.pollIntervalMs ?? 3000,
      maxPollMs: opts.maxPollMs ?? 30 * 60 * 1000,
    };
  }

  async isAvailable(): Promise<boolean> {
    return Boolean(this.opts.apiKey);
  }

  async version(): Promise<string | null> {
    return this.opts.apiKey ? "cloud" : null;
  }

  async *execute(input: ExecuteInput): AsyncIterable<RuneEvent> {
    if (!this.opts.apiKey) {
      yield {
        type: "exit",
        code: 1,
        error: "CURSOR_API_KEY not set; cannot dispatch to Cursor Cloud Agent.",
      };
      return;
    }
    if (!input.github_repo) {
      yield {
        type: "exit",
        code: 1,
        error: "Cursor Cloud requires a linked GitHub repo on the project.",
      };
      return;
    }

    const repoUrl = input.github_repo.startsWith("http")
      ? input.github_repo
      : `https://github.com/${input.github_repo}`;

    let agent: CursorAgent;
    try {
      agent = await this.createAgent(input.prompt, repoUrl, input.github_branch ?? "main");
    } catch (err) {
      yield { type: "exit", code: 1, error: `failed to create agent: ${(err as Error).message}` };
      return;
    }

    yield { type: "stdout", data: `→ Cursor Cloud agent ${agent.id} created\n` };

    const startedAt = Date.now();
    const seenMessages = new Set<string>();
    let lastStatus = agent.status;

    while (Date.now() - startedAt < this.opts.maxPollMs) {
      if (input.signal?.aborted) {
        try {
          await this.cancelAgent(agent.id);
        } catch {}
        yield { type: "exit", code: 130, error: "aborted" };
        return;
      }

      await sleep(this.opts.pollIntervalMs);

      let conv: CursorConversation | null = null;
      try {
        conv = await this.fetchConversation(agent.id);
      } catch (err) {
        yield { type: "stderr", data: `poll error: ${(err as Error).message}\n` };
      }
      if (conv) {
        for (const msg of conv.messages) {
          if (seenMessages.has(msg.id)) continue;
          seenMessages.add(msg.id);
          if (msg.role === "user") continue;
          if (msg.text) {
            yield { type: "stdout", data: `${msg.text}\n` };
          }
        }
      }

      let updated: CursorAgent | null = null;
      try {
        updated = await this.fetchAgent(agent.id);
      } catch (err) {
        yield { type: "stderr", data: `status error: ${(err as Error).message}\n` };
        continue;
      }
      if (updated.status !== lastStatus) {
        yield { type: "stdout", data: `→ status: ${updated.status}\n` };
        lastStatus = updated.status;
      }
      if (
        updated.status === "FINISHED" ||
        updated.status === "FAILED" ||
        updated.status === "CANCELLED"
      ) {
        const code = updated.status === "FINISHED" ? 0 : 1;
        if (updated.summary) {
          yield { type: "stdout", data: `\n${updated.summary}\n` };
        }
        yield { type: "exit", code };
        return;
      }
    }

    yield { type: "exit", code: 1, error: "cursor-cloud: timed out" };
  }

  private async createAgent(prompt: string, repoUrl: string, ref?: string): Promise<CursorAgent> {
    const res = await fetch(`${CURSOR_API_BASE}/v0/agents`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify({
        prompt: { text: prompt },
        source: { repository: repoUrl, ...(ref ? { ref } : {}) },
        model: this.opts.model === "auto" ? undefined : this.opts.model,
      }),
    });
    if (!res.ok) {
      throw new Error(`${res.status} ${await res.text().catch(() => "")}`);
    }
    return (await res.json()) as CursorAgent;
  }

  private async fetchAgent(id: string): Promise<CursorAgent> {
    const res = await fetch(`${CURSOR_API_BASE}/v0/agents/${encodeURIComponent(id)}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as CursorAgent;
  }

  private async fetchConversation(id: string): Promise<CursorConversation> {
    const res = await fetch(
      `${CURSOR_API_BASE}/v0/agents/${encodeURIComponent(id)}/conversation`,
      { headers: this.headers() },
    );
    if (!res.ok) throw new Error(`${res.status}`);
    return (await res.json()) as CursorConversation;
  }

  private async cancelAgent(id: string): Promise<void> {
    await fetch(`${CURSOR_API_BASE}/v0/agents/${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: this.headers(),
    });
  }

  private headers() {
    return {
      Authorization: `Bearer ${this.opts.apiKey}`,
      "Content-Type": "application/json",
    };
  }
}

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}


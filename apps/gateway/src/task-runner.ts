import { localRuntimesById, CursorCloudRuntime, type Runtime } from "@rune/runtimes";
import type { RuntimeId, TaskPayload } from "@rune/shared";
import type { GatewayConfig } from "./config";
import { writeRuneToDisk } from "./file-watcher";
import { ensureDir, exists } from "./paths";
import type { RuneSupabase } from "./supabase";
import type { UserSettingsCache } from "./user-settings";

const FLUSH_MS = 600;

export class TaskRunner {
  constructor(
    private supabase: RuneSupabase,
    private cfg: GatewayConfig,
    private settings: UserSettingsCache,
  ) {}

  async dispatch(taskId: string): Promise<void> {
    // Atomic claim — only one gateway picks up the task.
    const { data: claimed } = await this.supabase
      .from("tasks")
      .update({ status: "running", claimed_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();
    if (!claimed) return;

    const runtime = this.resolveRuntime(claimed.runtime as RuntimeId);
    if (!runtime) {
      const reason =
        claimed.runtime === "cursor-cloud"
          ? "cursor-cloud requires a Cursor API key — set one in Account → Cursor Cloud Agent."
          : `runtime "${claimed.runtime}" not available on this gateway`;
      await this.fail(taskId, reason);
      return;
    }

    const messageId = (claimed as { message_id?: string | null }).message_id ?? null;

    if (messageId) {
      await this.supabase
        .from("rune_messages")
        .update({ status: "streaming", content: "" })
        .eq("id", messageId);
      await this.supabase
        .from("runes")
        .update({ status: "running" })
        .eq("id", claimed.rune_id);
    } else {
      await this.supabase
        .from("runes")
        .update({ status: "running", output: "" })
        .eq("id", claimed.rune_id);
    }

    const payload = claimed.payload as TaskPayload;
    let cwd = payload.cwd ?? this.cfg.workspace_root;
    if (!(await exists(cwd))) {
      try {
        await ensureDir(cwd);
      } catch {
        // proceed; runtime may fail explicitly
      }
    }

    const ac = new AbortController();
    let totalOutput = "";
    let lastFlush = 0;
    let exitCode = 0;
    let exitErr: string | undefined;

    try {
      for await (const ev of runtime.execute({
        prompt: payload.prompt,
        cwd,
        signal: ac.signal,
        github_repo: payload.github_repo ?? null,
        github_branch: payload.github_branch ?? null,
      })) {
        if (ev.type === "stdout" || ev.type === "stderr") {
          totalOutput += ev.data;
          if (Date.now() - lastFlush > FLUSH_MS) {
            await this.flush(taskId, claimed.rune_id, messageId, totalOutput);
            lastFlush = Date.now();
          }
        } else if (ev.type === "exit") {
          exitCode = ev.code;
          exitErr = ev.error;
        }
      }
    } catch (err) {
      exitCode = 1;
      exitErr = (err as Error).message;
    }

    await this.flush(taskId, claimed.rune_id, messageId, totalOutput);

    const finalStatus = exitCode === 0 ? "done" : "error";
    await this.supabase
      .from("tasks")
      .update({
        status: finalStatus,
        error: exitErr ?? null,
        output: totalOutput,
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);
    if (messageId) {
      await this.supabase
        .from("rune_messages")
        .update({
          status: exitCode === 0 ? "done" : "error",
          content: totalOutput,
          error: exitErr ?? null,
        })
        .eq("id", messageId);
      await this.supabase
        .from("runes")
        .update({ status: finalStatus })
        .eq("id", claimed.rune_id);
    } else {
      await this.supabase
        .from("runes")
        .update({ status: finalStatus, output: totalOutput })
        .eq("id", claimed.rune_id);
    }

    // Persist rune body to disk so the local file reflects state. Skip for
    // chat mode (messageId set) since the body isn't authored there.
    if (messageId) return;
    try {
      const { data: rune } = await this.supabase
        .from("runes")
        .select("slug, title, body, runtime")
        .eq("id", claimed.rune_id)
        .maybeSingle();
      const { data: project } = await this.supabase
        .from("projects")
        .select("local_path, is_external")
        .eq("id", (await this.runeProjectId(claimed.rune_id)) ?? "")
        .maybeSingle();
      if (rune && project) {
        await writeRuneToDisk({
          localPath: project.local_path,
          isExternal: project.is_external,
          slug: rune.slug,
          title: rune.title,
          body: rune.body,
          runtime: rune.runtime,
          status: finalStatus,
        });
      }
    } catch (err) {
      console.error("[task] disk write failed", err);
    }
  }

  private resolveRuntime(id: RuntimeId): Runtime | null {
    if (id === "cursor-cloud") {
      const apiKey = this.settings.getCursorApiKey();
      if (!apiKey) return null;
      return new CursorCloudRuntime({ apiKey });
    }
    return localRuntimesById[id] ?? null;
  }

  private async runeProjectId(runeId: string): Promise<string | null> {
    const { data } = await this.supabase
      .from("runes")
      .select("project_id")
      .eq("id", runeId)
      .maybeSingle();
    return data?.project_id ?? null;
  }

  private async flush(
    taskId: string,
    runeId: string,
    messageId: string | null,
    output: string,
  ) {
    await this.supabase.from("tasks").update({ output }).eq("id", taskId);
    if (messageId) {
      await this.supabase
        .from("rune_messages")
        .update({ content: output })
        .eq("id", messageId);
    } else {
      await this.supabase.from("runes").update({ output }).eq("id", runeId);
    }
  }

  private async fail(taskId: string, message: string) {
    await this.supabase
      .from("tasks")
      .update({
        status: "error",
        error: message,
        completed_at: new Date().toISOString(),
      })
      .eq("id", taskId);
  }
}

import {
  newRuneFrontmatter,
  parseRuneFile,
  serializeRuneFile,
  slugify,
} from "@rune/shared";
import { FSWatcher, watch as chokidarWatch } from "chokidar";
import { readFile, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import type { GatewayConfig } from "./config";
import { ensureDir, runeFolderFor } from "./paths";
import type { RuneSupabase } from "./supabase";

interface WatchedProject {
  id: string;
  slug: string;
  local_path: string;
  is_external: boolean;
  watcher: FSWatcher;
}

export class ProjectWatchers {
  private watched = new Map<string, WatchedProject>();
  private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
  constructor(
    private supabase: RuneSupabase,
    private cfg: GatewayConfig,
  ) {}

  async syncFromDb() {
    const { data } = await this.supabase
      .from("projects")
      .select("id, slug, local_path, is_external")
      .eq("user_id", this.cfg.user_id);
    const ids = new Set((data ?? []).map((p) => p.id));
    for (const id of [...this.watched.keys()]) {
      if (!ids.has(id)) {
        const w = this.watched.get(id);
        await w?.watcher.close();
        this.watched.delete(id);
      }
    }
    for (const p of data ?? []) {
      if (!this.watched.has(p.id)) await this.watch(p);
    }
  }

  private async watch(project: {
    id: string;
    slug: string;
    local_path: string;
    is_external: boolean;
  }) {
    const folder = runeFolderFor(project.local_path, project.is_external);
    try {
      await ensureDir(folder);
    } catch {
      // skip if path doesn't exist
      return;
    }
    const watcher = chokidarWatch(`${folder.replace(/\\/g, "/")}/*.md`, {
      ignoreInitial: false,
      awaitWriteFinish: { stabilityThreshold: 200, pollInterval: 100 },
    });
    watcher.on("add", (p) => this.scheduleSync(project.id, p));
    watcher.on("change", (p) => this.scheduleSync(project.id, p));
    watcher.on("unlink", (p) => this.handleUnlink(project.id, p));
    this.watched.set(project.id, { ...project, watcher });
  }

  private scheduleSync(projectId: string, filepath: string) {
    const key = `${projectId}::${filepath}`;
    const prev = this.debounceTimers.get(key);
    if (prev) clearTimeout(prev);
    const t = setTimeout(() => this.syncFile(projectId, filepath), 250);
    this.debounceTimers.set(key, t);
  }

  private async syncFile(projectId: string, filepath: string) {
    try {
      const raw = await readFile(filepath, "utf8");
      const parsed = parseRuneFile(raw);
      const slug = slugify(basename(filepath, ".md"));
      const { data: existing } = await this.supabase
        .from("runes")
        .select("id")
        .eq("project_id", projectId)
        .eq("slug", slug)
        .maybeSingle();
      if (existing) {
        await this.supabase
          .from("runes")
          .update({
            title: parsed.frontmatter.title,
            body: parsed.body,
            frontmatter: parsed.frontmatter,
            runtime: parsed.frontmatter.runtime,
          })
          .eq("id", existing.id);
      } else {
        await this.supabase.from("runes").insert({
          project_id: projectId,
          user_id: this.cfg.user_id,
          slug,
          title: parsed.frontmatter.title,
          body: parsed.body,
          frontmatter: parsed.frontmatter,
          runtime: parsed.frontmatter.runtime,
          status: parsed.frontmatter.status,
        });
      }
    } catch (err) {
      console.error("[watcher] sync failed", filepath, err);
    }
  }

  private async handleUnlink(projectId: string, filepath: string) {
    const slug = slugify(basename(filepath, ".md"));
    await this.supabase
      .from("runes")
      .delete()
      .eq("project_id", projectId)
      .eq("slug", slug);
  }

  async closeAll() {
    for (const w of this.watched.values()) {
      await w.watcher.close();
    }
    this.watched.clear();
  }
}

/**
 * Write a rune's content back to disk after an execute completes (or anytime).
 */
export async function writeRuneToDisk(opts: {
  localPath: string;
  isExternal: boolean;
  slug: string;
  title: string;
  body: string;
  runtime: string;
  status: string;
}): Promise<string> {
  const folder = runeFolderFor(opts.localPath, opts.isExternal);
  await ensureDir(folder);
  const filepath = join(folder, `${opts.slug}.md`);
  let createdAt = new Date().toISOString();
  try {
    const s = await stat(filepath);
    createdAt = s.birthtime.toISOString();
  } catch {
    // new file
  }
  const text = serializeRuneFile({
    frontmatter: newRuneFrontmatter({
      title: opts.title,
      runtime: opts.runtime as never,
      status: opts.status as never,
      created_at: createdAt,
    }),
    body: opts.body,
  });
  const { writeFile } = await import("node:fs/promises");
  await writeFile(filepath, text, "utf8");
  return filepath;
}

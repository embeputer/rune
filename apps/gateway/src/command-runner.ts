import { slugify } from "@rune/shared";
import { basename, join } from "node:path";
import type { GatewayConfig } from "./config";
import { pickFolder } from "./folder-picker";
import {
  ensureDir,
  exists,
  listMarkdownFiles,
  readGitRemote,
  rename,
  runeFolderFor,
  safeResolve,
} from "./paths";
import type { RuneSupabase } from "./supabase";

export class CommandRunner {
  constructor(
    private supabase: RuneSupabase,
    private cfg: GatewayConfig,
    private onSignOut?: () => Promise<void>,
  ) {}

  async dispatch(cmd: {
    id: string;
    kind: string;
    payload: unknown;
  }): Promise<void> {
    await this.supabase
      .from("gateway_commands")
      .update({ status: "running" })
      .eq("id", cmd.id);
    try {
      let result: unknown = null;
      let signOutAfter = false;
      if (cmd.kind === "pick-folder") result = await this.pickFolder();
      else if (cmd.kind === "import-folder") result = await this.importFolder(cmd.payload);
      else if (cmd.kind === "relocate-project") result = await this.relocateProject(cmd.payload);
      else if (cmd.kind === "scan-folder") result = await this.scanFolder(cmd.payload);
      else if (cmd.kind === "sign-out") {
        result = { ok: true };
        signOutAfter = true;
      } else throw new Error(`unknown command kind: ${cmd.kind}`);
      await this.supabase
        .from("gateway_commands")
        .update({
          status: "done",
          result: result as never,
          completed_at: new Date().toISOString(),
        })
        .eq("id", cmd.id);
      if (signOutAfter) {
        // Hand off to the gateway lifecycle: clear local config and shutdown.
        // Run after the status update so the dashboard sees the command done.
        try {
          await this.onSignOut?.();
        } catch (err) {
          console.error("[cmd] sign-out cleanup failed", err);
        }
      }
    } catch (err) {
      await this.supabase
        .from("gateway_commands")
        .update({
          status: "error",
          error: (err as Error).message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", cmd.id);
    }
  }

  private async pickFolder(): Promise<{ path: string } | null> {
    const path = await pickFolder("Pick a folder for Rune");
    return path ? { path } : null;
  }

  private async importFolder(payload: unknown): Promise<unknown> {
    const data = payload as { path?: string; name?: string };
    if (!data.path) throw new Error("missing path");
    const abs = safeResolve(data.path);
    if (!(await exists(abs))) throw new Error(`path does not exist: ${abs}`);
    const isExternal = !abs.startsWith(this.cfg.workspace_root);
    const folder = runeFolderFor(abs, isExternal);
    await ensureDir(folder);
    const githubRepo = await readGitRemote(abs);

    const name = data.name ?? basename(abs);
    const baseSlug = slugify(name);
    const { data: existing } = await this.supabase
      .from("projects")
      .select("slug")
      .eq("user_id", this.cfg.user_id);
    const taken = new Set((existing ?? []).map((p) => p.slug));
    let slug = baseSlug;
    if (taken.has(slug)) {
      let n = 2;
      while (taken.has(`${slug}-${n}`)) n++;
      slug = `${slug}-${n}`;
    }

    const { data: project, error } = await this.supabase
      .from("projects")
      .insert({
        user_id: this.cfg.user_id,
        name,
        slug,
        local_path: abs,
        is_external: isExternal,
        github_repo: githubRepo,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    // Initial scan to import any existing rune .md files
    await this.scanFolderById(project.id, abs, isExternal);
    return { project_id: project.id, slug: project.slug, github_repo: githubRepo };
  }

  private async relocateProject(payload: unknown): Promise<unknown> {
    const data = payload as { project_id?: string; dest_path?: string };
    if (!data.project_id || !data.dest_path) throw new Error("missing project_id or dest_path");
    const dest = safeResolve(data.dest_path);
    const { data: project } = await this.supabase
      .from("projects")
      .select("*")
      .eq("id", data.project_id)
      .eq("user_id", this.cfg.user_id)
      .maybeSingle();
    if (!project) throw new Error("project not found");
    if (await exists(dest)) {
      throw new Error(`destination already exists: ${dest}`);
    }
    if (await exists(project.local_path)) {
      await rename(project.local_path, dest);
    } else {
      await ensureDir(dest);
    }
    const newExternal = !dest.startsWith(this.cfg.workspace_root);
    if (newExternal) {
      // Move bare *.md into a .rune subfolder so the folder root is clean.
      const dotRune = join(dest, ".rune");
      await ensureDir(dotRune);
      const mds = await listMarkdownFiles(dest);
      for (const md of mds) {
        const moved = join(dotRune, basename(md));
        try {
          await rename(md, moved);
        } catch {
          // ignore individual failures
        }
      }
    }
    const { error } = await this.supabase
      .from("projects")
      .update({ local_path: dest, is_external: newExternal })
      .eq("id", project.id);
    if (error) throw new Error(error.message);
    return { project_id: project.id, local_path: dest, is_external: newExternal };
  }

  private async scanFolder(payload: unknown): Promise<unknown> {
    const data = payload as { project_id?: string };
    if (!data.project_id) throw new Error("missing project_id");
    const { data: project } = await this.supabase
      .from("projects")
      .select("id, local_path, is_external")
      .eq("id", data.project_id)
      .eq("user_id", this.cfg.user_id)
      .maybeSingle();
    if (!project) throw new Error("not found");
    const count = await this.scanFolderById(project.id, project.local_path, project.is_external);
    return { project_id: project.id, count };
  }

  private async scanFolderById(
    projectId: string,
    localPath: string,
    isExternal: boolean,
  ): Promise<number> {
    const folder = runeFolderFor(localPath, isExternal);
    const mds = await listMarkdownFiles(folder);
    let imported = 0;
    for (const md of mds) {
      try {
        const { readFile } = await import("node:fs/promises");
        const raw = await readFile(md, "utf8");
        const { parseRuneFile, slugify: slug } = await import("@rune/shared");
        const parsed = parseRuneFile(raw);
        const s = slug(basename(md, ".md"));
        const { data: existing } = await this.supabase
          .from("runes")
          .select("id")
          .eq("project_id", projectId)
          .eq("slug", s)
          .maybeSingle();
        if (existing) continue;
        await this.supabase.from("runes").insert({
          project_id: projectId,
          user_id: this.cfg.user_id,
          slug: s,
          title: parsed.frontmatter.title,
          body: parsed.body,
          frontmatter: parsed.frontmatter,
          status: parsed.frontmatter.status,
          runtime: parsed.frontmatter.runtime,
        });
        imported++;
      } catch (err) {
        console.error("[scan] skipping", md, err);
      }
    }
    return imported;
  }
}

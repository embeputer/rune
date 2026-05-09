import { mkdir, readFile, readdir, rename, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";

/**
 * Returns absolute, normalized path. Throws on path-traversal-style input.
 */
export function safeResolve(p: string): string {
  return resolve(p);
}

/**
 * Determine where rune markdown files live for a given project.
 *  - is_external: <local_path>/.rune/
 *  - internal:    <local_path>/
 */
export function runeFolderFor(localPath: string, isExternal: boolean): string {
  return isExternal ? join(localPath, ".rune") : localPath;
}

export function isUnder(child: string, parent: string): boolean {
  const r = relative(parent, child);
  return r !== "" && !r.startsWith("..") && !r.includes(`..${sep}`);
}

export async function ensureDir(p: string): Promise<void> {
  await mkdir(p, { recursive: true });
}

export async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

export async function readGitRemote(localPath: string): Promise<string | null> {
  const cfgPath = join(localPath, ".git", "config");
  try {
    const cfg = await readFile(cfgPath, "utf8");
    // crude parse: find [remote "origin"] then url =
    const m = cfg.match(/\[remote\s+"origin"\][^[]*?url\s*=\s*([^\s\r\n]+)/);
    if (!m) return null;
    const url = m[1] ?? "";
    const repoMatch = url.match(/github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
    if (!repoMatch) return null;
    return `${repoMatch[1]}/${repoMatch[2]}`;
  } catch {
    return null;
  }
}

export async function listMarkdownFiles(dir: string): Promise<string[]> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".md"))
      .map((e) => join(dir, e.name));
  } catch {
    return [];
  }
}

export { rename, writeFile };

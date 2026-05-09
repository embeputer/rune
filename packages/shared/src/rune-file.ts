import matter from "gray-matter";
import { ulid } from "ulid";
import { RuneFrontmatterSchema, type RuneFrontmatter } from "./types";

export interface ParsedRuneFile {
  frontmatter: RuneFrontmatter;
  body: string;
}

export function parseRuneFile(raw: string): ParsedRuneFile {
  const parsed = matter(raw);
  const fm = RuneFrontmatterSchema.parse({
    id: parsed.data.id ?? ulid(),
    title: parsed.data.title ?? "Untitled",
    runtime: parsed.data.runtime ?? "cursor-agent",
    status: parsed.data.status ?? "idle",
    created_at: parsed.data.created_at ?? new Date().toISOString(),
    updated_at: parsed.data.updated_at,
  });
  return { frontmatter: fm, body: parsed.content.trim() };
}

export function serializeRuneFile(input: ParsedRuneFile): string {
  const { frontmatter, body } = input;
  return matter.stringify(`\n${body.trim()}\n`, frontmatter);
}

export function newRuneFrontmatter(
  partial: Partial<RuneFrontmatter> & { title: string },
): RuneFrontmatter {
  const now = new Date().toISOString();
  return RuneFrontmatterSchema.parse({
    id: partial.id ?? ulid(),
    title: partial.title,
    runtime: partial.runtime ?? "cursor-agent",
    status: partial.status ?? "idle",
    created_at: partial.created_at ?? now,
    updated_at: partial.updated_at ?? now,
  });
}

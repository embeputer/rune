import { newRuneFrontmatter, slugify, type RuneFrontmatter } from "@rune/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  title: z.string().min(1).max(120),
  body: z.string().default(""),
  runtime: z
    .enum(["cursor-agent", "claude-code", "codex", "droid", "cursor-cloud"])
    .default("cursor-agent"),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: existing } = await supabase
    .from("runes")
    .select("slug")
    .eq("project_id", projectId);
  const taken = new Set((existing ?? []).map((r) => r.slug));
  let slug = slugify(parsed.data.title);
  if (taken.has(slug)) {
    let n = 2;
    while (taken.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }

  const fm: RuneFrontmatter = newRuneFrontmatter({
    title: parsed.data.title,
    runtime: parsed.data.runtime,
  });

  const { data: rune, error } = await supabase
    .from("runes")
    .insert({
      project_id: projectId,
      user_id: user.id,
      slug,
      title: parsed.data.title,
      body: parsed.data.body,
      frontmatter: fm,
      status: "idle",
      runtime: parsed.data.runtime,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ rune });
}

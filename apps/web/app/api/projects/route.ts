import { slugify } from "@rune/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({ name: z.string().min(1).max(80) });

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("projects")
    .select("slug")
    .eq("user_id", user.id);
  const taken = new Set((existing ?? []).map((p) => p.slug));
  let slug = slugify(parsed.data.name);
  if (taken.has(slug)) {
    let n = 2;
    while (taken.has(`${slug}-${n}`)) n++;
    slug = `${slug}-${n}`;
  }

  const { data: gateway } = await supabase
    .from("gateways")
    .select("workspace_root")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const workspaceRoot = gateway?.workspace_root ?? "";
  const sep = workspaceRoot.includes("\\") ? "\\" : "/";
  const localPath = workspaceRoot ? `${workspaceRoot}${sep}${slug}` : slug;

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name: parsed.data.name,
      slug,
      local_path: localPath,
      is_external: false,
    })
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project });
}

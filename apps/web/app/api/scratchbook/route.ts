import { newRuneFrontmatter, type RuntimeId } from "@rune/shared";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Creates a new scratch project — a quick-start container whose folder name
 * is just the project's UUID inside the gateway workspace root.
 *
 * The user can rename / relocate it later (existing project settings flow).
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const projectId = crypto.randomUUID();
  const slug = projectId;
  const today = new Date().toISOString().slice(0, 10);
  const name = `Scratch — ${today}`;

  const { data: gateway } = await supabase
    .from("gateways")
    .select("workspace_root")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const workspaceRoot = gateway?.workspace_root ?? "";
  const sep = workspaceRoot.includes("\\") ? "\\" : "/";
  const localPath = workspaceRoot ? `${workspaceRoot}${sep}${projectId}` : projectId;

  const { data: project, error: projErr } = await supabase
    .from("projects")
    .insert({
      id: projectId,
      user_id: user.id,
      name,
      slug,
      local_path: localPath,
      is_external: false,
      is_scratch: true,
    })
    .select("*")
    .single();
  if (projErr) {
    return NextResponse.json({ error: projErr.message }, { status: 500 });
  }

  const runtime: RuntimeId = "cursor-agent";
  const runeSlug = "notes";
  const { data: rune, error: runeErr } = await supabase
    .from("runes")
    .insert({
      project_id: project.id,
      user_id: user.id,
      slug: runeSlug,
      title: "notes",
      body: "",
      frontmatter: newRuneFrontmatter({ title: "notes", runtime }),
      status: "idle",
      runtime,
    })
    .select("*")
    .single();
  if (runeErr) {
    await supabase.from("projects").delete().eq("id", project.id);
    return NextResponse.json({ error: runeErr.message }, { status: 500 });
  }

  return NextResponse.json({ project, rune });
}

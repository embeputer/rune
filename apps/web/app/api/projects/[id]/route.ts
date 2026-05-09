import { uniqueSlug } from "@rune/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Deletes a project (and cascades to its runes/tasks via FKs).
 *
 * The on-disk folder is intentionally NOT removed — Rune treats local files as
 * the user's; we only own the DB rows. To clean the folder, the user can do so
 * manually (or we could add a separate "wipe folder" gateway command later).
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { error } = await supabase
    .from("projects")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

const PatchBody = z.object({
  name: z.string().trim().min(1).max(120),
});

/**
 * Renames a project in the DB (name + slug) and — for non-external projects —
 * enqueues a `relocate-project` gateway command so the on-disk folder name
 * follows. External projects are renamed in-app only; we don't touch the
 * user's pre-existing folder structure.
 *
 * The gateway updates `local_path` itself once the rename completes; until
 * then, the DB still points at the old path, which is fine because the rename
 * is atomic on the gateway side and the file watcher resyncs on `projects`
 * changes.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PatchBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "not found" }, { status: 404 });

  const { data: siblings } = await supabase
    .from("projects")
    .select("slug")
    .eq("user_id", user.id)
    .neq("id", id);
  const taken = new Set((siblings ?? []).map((p) => p.slug));
  const newSlug = uniqueSlug(parsed.data.name, taken);

  // Compute the new folder path for non-external projects (rename in place
  // alongside the existing parent dir). External projects keep `local_path`
  // unchanged so we don't reach into the user's own filesystem layout.
  let nextLocalPath: string | null = null;
  if (!project.is_external && project.local_path) {
    const sep = project.local_path.includes("\\") ? "\\" : "/";
    const idx = project.local_path.lastIndexOf(sep);
    const parent = idx >= 0 ? project.local_path.slice(0, idx) : "";
    const candidate = parent ? `${parent}${sep}${newSlug}` : newSlug;
    if (candidate !== project.local_path) nextLocalPath = candidate;
  }

  let commandId: string | null = null;
  if (nextLocalPath) {
    const { data: gateway } = await supabase
      .from("gateways")
      .select("id")
      .eq("user_id", user.id)
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!gateway) {
      return NextResponse.json(
        { error: "No gateway connected — start the gateway to rename the local folder." },
        { status: 409 },
      );
    }
    const { data: cmd, error: cmdErr } = await supabase
      .from("gateway_commands")
      .insert({
        user_id: user.id,
        gateway_id: gateway.id,
        kind: "relocate-project",
        payload: { project_id: id, dest_path: nextLocalPath },
      })
      .select("id")
      .single();
    if (cmdErr) return NextResponse.json({ error: cmdErr.message }, { status: 500 });
    commandId = cmd.id;
  }

  const { data: updated, error } = await supabase
    .from("projects")
    .update({ name: parsed.data.name, slug: newSlug })
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ project: updated, command_id: commandId });
}

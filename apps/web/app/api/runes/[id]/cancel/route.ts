import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/runes/:id/cancel — terminate any in-flight chat turn for this rune.
 *
 * The web app marks the relevant rows as cancelled/error in Supabase. The
 * gateway listens to the same realtime stream and aborts the local child
 * process when it sees `tasks.status` flip to "cancelled". This endpoint also
 * clears stale "streaming" messages whose owning gateway died mid-stream so
 * the UI can recover without a manual refresh.
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: rune, error: runeErr } = await supabase
    .from("runes")
    .select("id")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (runeErr || !rune) return NextResponse.json({ error: "rune not found" }, { status: 404 });

  // 1. Cancel any queued/running tasks for this rune. The gateway will pick
  //    up the UPDATE via realtime and abort the running child process.
  const { data: cancelledTasks } = await supabase
    .from("tasks")
    .update({
      status: "cancelled",
      error: "cancelled by user",
      completed_at: new Date().toISOString(),
    })
    .eq("rune_id", rune.id)
    .eq("user_id", user.id)
    .in("status", ["queued", "running"])
    .select("id");

  // 2. Mark any pending/streaming assistant messages on this rune as errored.
  //    Use status=error rather than adding a new state — the existing schema
  //    treats both "task failed" and "user cancelled" as terminal "error".
  const { data: cancelledMessages } = await supabase
    .from("rune_messages")
    .update({
      status: "error",
      error: "cancelled by user",
    })
    .eq("rune_id", rune.id)
    .eq("user_id", user.id)
    .eq("role", "assistant")
    .in("status", ["pending", "streaming"])
    .select("id");

  // 3. Reset the rune itself so the sidebar/status indicators stop spinning.
  await supabase
    .from("runes")
    .update({ status: "idle" })
    .eq("id", rune.id)
    .eq("user_id", user.id);

  return NextResponse.json({
    cancelled_tasks: cancelledTasks?.length ?? 0,
    cancelled_messages: cancelledMessages?.length ?? 0,
  });
}

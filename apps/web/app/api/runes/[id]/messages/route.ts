import type { RuntimeId } from "@rune/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const HEARTBEAT_GRACE_MS = 60_000;

const PostBody = z.object({
  content: z.string().trim().min(1).max(20_000),
});

/**
 * GET /api/runes/:id/messages — list chat messages (oldest first).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data: messages, error } = await supabase
    .from("rune_messages")
    .select("*")
    .eq("rune_id", id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ messages: messages ?? [] });
}

/**
 * POST /api/runes/:id/messages — append a user turn, create a pending
 * assistant turn, and enqueue a task that bundles the rolled-up history
 * as the prompt. Returns both message rows immediately so the UI can
 * render them and stream onto the assistant row via realtime.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PostBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const { data: rune, error: runeErr } = await supabase
    .from("runes")
    .select("id, project_id, runtime")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (runeErr || !rune) return NextResponse.json({ error: "rune not found" }, { status: 404 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, local_path, github_repo, github_branch")
    .eq("id", rune.project_id)
    .maybeSingle();
  if (!project) return NextResponse.json({ error: "project not found" }, { status: 404 });

  const runtime = rune.runtime as RuntimeId;
  if (runtime === "cursor-cloud") {
    return NextResponse.json(
      { error: "Chat mode does not support cursor-cloud yet — pick a local runtime." },
      { status: 400 },
    );
  }

  // Pick an online gateway. Chat mode is local-only for now.
  const { data: gateway } = await supabase
    .from("gateways")
    .select("id, status, last_seen_at")
    .eq("user_id", user.id)
    .eq("status", "online")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (
    !gateway ||
    Date.now() - new Date(gateway.last_seen_at).getTime() > HEARTBEAT_GRACE_MS
  ) {
    return NextResponse.json(
      { error: "No online gateway. Start the gateway daemon to chat." },
      { status: 409 },
    );
  }

  // Insert user message + pending assistant message.
  const nowUser = new Date().toISOString();
  const { data: userMsg, error: userMsgErr } = await supabase
    .from("rune_messages")
    .insert({
      rune_id: rune.id,
      user_id: user.id,
      role: "user",
      content: parsed.data.content,
      status: "done",
      created_at: nowUser,
    })
    .select("*")
    .single();
  if (userMsgErr || !userMsg) {
    return NextResponse.json({ error: userMsgErr?.message ?? "insert failed" }, { status: 500 });
  }

  const { data: assistantMsg, error: aErr } = await supabase
    .from("rune_messages")
    .insert({
      rune_id: rune.id,
      user_id: user.id,
      role: "assistant",
      content: "",
      status: "pending",
      runtime,
    })
    .select("*")
    .single();
  if (aErr || !assistantMsg) {
    return NextResponse.json({ error: aErr?.message ?? "insert failed" }, { status: 500 });
  }

  // Roll up history into a single prompt blob. Newer agents handle long
  // context; we hand them the full conversation each turn.
  const { data: history } = await supabase
    .from("rune_messages")
    .select("role, content")
    .eq("rune_id", rune.id)
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  const transcript =
    (history ?? [])
      .filter((m) => m.role === "user" || (m.role === "assistant" && m.content))
      .map((m) => (m.role === "user" ? `User: ${m.content}` : `Assistant: ${m.content}`))
      .join("\n\n") || `User: ${parsed.data.content}`;

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      rune_id: rune.id,
      gateway_id: gateway.id,
      runtime,
      status: "queued",
      message_id: assistantMsg.id,
      payload: {
        prompt: transcript,
        cwd: project.local_path,
        github_repo: project.github_repo,
        github_branch: project.github_branch,
      },
    })
    .select("*")
    .single();
  if (taskErr || !task) {
    return NextResponse.json({ error: taskErr?.message ?? "task insert failed" }, { status: 500 });
  }

  // Link the assistant message to the task so the UI can show status.
  await supabase
    .from("rune_messages")
    .update({ task_id: task.id, status: "streaming" })
    .eq("id", assistantMsg.id);

  await supabase.from("runes").update({ status: "queued" }).eq("id", rune.id);

  return NextResponse.json({
    user_message: userMsg,
    assistant_message: { ...assistantMsg, task_id: task.id, status: "streaming" },
    task,
  });
}

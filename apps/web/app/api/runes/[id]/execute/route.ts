import { CursorCloudRuntime } from "@rune/runtimes";
import type { RuntimeId } from "@rune/shared";
import { NextResponse } from "next/server";
import { createClient, createServiceClient } from "@/lib/supabase/server";

const HEARTBEAT_GRACE_MS = 60_000;

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
    .select("id, project_id, body, runtime")
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
    if (!project.github_repo) {
      return NextResponse.json(
        { error: "Link a GitHub repo on this project to use Cursor Cloud." },
        { status: 400 },
      );
    }
    const { data: settings } = await supabase
      .from("user_settings")
      .select("cursor_api_key")
      .eq("user_id", user.id)
      .maybeSingle();
    const apiKey = settings?.cursor_api_key ?? "";
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "Cursor API key not configured. Add one in Account → Cursor Cloud Agent.",
        },
        { status: 400 },
      );
    }
    return runCloud({
      taskInsertUserId: user.id,
      runeId: rune.id,
      prompt: rune.body,
      githubRepo: project.github_repo,
      githubBranch: project.github_branch,
      apiKey,
    });
  }

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
      { error: "No online gateway. Start the gateway daemon or use Cursor Cloud." },
      { status: 409 },
    );
  }

  const { data: task, error: taskErr } = await supabase
    .from("tasks")
    .insert({
      user_id: user.id,
      rune_id: rune.id,
      gateway_id: gateway.id,
      runtime,
      status: "queued",
      payload: {
        prompt: rune.body,
        cwd: project.local_path,
        github_repo: project.github_repo,
        github_branch: project.github_branch,
      },
    })
    .select("*")
    .single();
  if (taskErr) return NextResponse.json({ error: taskErr.message }, { status: 500 });

  await supabase.from("runes").update({ status: "queued", output: null }).eq("id", rune.id);

  return NextResponse.json({ task });
}

async function runCloud({
  taskInsertUserId,
  runeId,
  prompt,
  githubRepo,
  githubBranch,
  apiKey,
}: {
  taskInsertUserId: string;
  runeId: string;
  prompt: string;
  githubRepo: string;
  githubBranch: string | null;
  apiKey: string;
}) {
  const service = await createServiceClient();
  const { data: task, error } = await service
    .from("tasks")
    .insert({
      user_id: taskInsertUserId,
      rune_id: runeId,
      gateway_id: null,
      runtime: "cursor-cloud",
      status: "running",
      payload: { prompt, github_repo: githubRepo, github_branch: githubBranch },
      output: "",
      claimed_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error || !task) {
    return NextResponse.json({ error: error?.message ?? "insert failed" }, { status: 500 });
  }

  await service.from("runes").update({ status: "running", output: "" }).eq("id", runeId);

  // Stream in the background using waitUntil-style fire-and-forget.
  void (async () => {
    const runtime = new CursorCloudRuntime({ apiKey });
    let buffer = "";
    let lastFlush = 0;
    let totalOutput = "";
    try {
      for await (const ev of runtime.execute({
        prompt,
        cwd: ".",
        github_repo: githubRepo,
        github_branch: githubBranch,
      })) {
        if (ev.type === "stdout" || ev.type === "stderr") {
          buffer += ev.data;
          totalOutput += ev.data;
          if (Date.now() - lastFlush > 600) {
            await service.from("tasks").update({ output: totalOutput }).eq("id", task.id);
            await service.from("runes").update({ output: totalOutput }).eq("id", runeId);
            lastFlush = Date.now();
            buffer = "";
          }
        } else if (ev.type === "exit") {
          await service
            .from("tasks")
            .update({
              output: totalOutput,
              status: ev.code === 0 ? "done" : "error",
              error: ev.error ?? null,
              completed_at: new Date().toISOString(),
            })
            .eq("id", task.id);
          await service
            .from("runes")
            .update({
              output: totalOutput,
              status: ev.code === 0 ? "done" : "error",
            })
            .eq("id", runeId);
        }
      }
    } catch (err) {
      await service
        .from("tasks")
        .update({
          status: "error",
          error: (err as Error).message,
          completed_at: new Date().toISOString(),
        })
        .eq("id", task.id);
      await service.from("runes").update({ status: "error" }).eq("id", runeId);
    }
  })();

  return NextResponse.json({ task });
}

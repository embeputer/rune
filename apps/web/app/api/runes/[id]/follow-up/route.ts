import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  message: z.string().trim().min(1).max(20_000),
});

/**
 * Append a follow-up turn to the rune's body and re-execute. The body grows
 * as a chat transcript, so the agent always sees full conversation context
 * on every run. The previous output is captured into the body before kickoff
 * so the next agent invocation has it.
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

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data: rune, error: runeErr } = await supabase
    .from("runes")
    .select("id, body, output")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (runeErr || !rune) return NextResponse.json({ error: "rune not found" }, { status: 404 });

  const previousBody = rune.body ?? "";
  const previousOutput = (rune.output ?? "").trim();

  const blocks: string[] = [previousBody.replace(/\s+$/, "")];
  if (previousOutput) {
    blocks.push("\n\n---\n\n## Previous response\n\n" + previousOutput);
  }
  blocks.push("\n\n---\n\n## Follow-up\n\n" + parsed.data.message);

  const newBody = blocks.join("");

  const { error: updateErr } = await supabase
    .from("runes")
    .update({ body: newBody })
    .eq("id", id)
    .eq("user_id", user.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  // Delegate to the existing execute route so cursor-cloud / gateway dispatch
  // stays in one place. Use an internal fetch with the same auth cookie.
  const origin = new URL(request.url).origin;
  const exec = await fetch(`${origin}/api/runes/${id}/execute`, {
    method: "POST",
    headers: { cookie: request.headers.get("cookie") ?? "" },
  });
  const execJson = await exec.json().catch(() => ({}));
  if (!exec.ok) {
    return NextResponse.json(execJson, { status: exec.status });
  }
  return NextResponse.json({ ok: true, ...execJson, body: newBody });
}

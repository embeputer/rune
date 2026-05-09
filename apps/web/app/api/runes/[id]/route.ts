import type { RuneMode, RuntimeId } from "@rune/shared";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({
  title: z.string().min(1).max(120).optional(),
  body: z.string().optional(),
  runtime: z
    .enum(["cursor-agent", "claude-code", "codex", "droid", "cursor-cloud"])
    .optional(),
  mode: z.enum(["doc", "chat"]).optional(),
});

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

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const updates: { title?: string; body?: string; runtime?: RuntimeId; mode?: RuneMode } = {};
  if (parsed.data.title !== undefined) updates.title = parsed.data.title;
  if (parsed.data.body !== undefined) updates.body = parsed.data.body;
  if (parsed.data.runtime !== undefined) updates.runtime = parsed.data.runtime;
  if (parsed.data.mode !== undefined) updates.mode = parsed.data.mode;
  if (Object.keys(updates).length === 0) return NextResponse.json({ ok: true });

  const { data: rune, error } = await supabase
    .from("runes")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select("*")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rune });
}

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
  const { error } = await supabase.from("runes").delete().eq("id", id).eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

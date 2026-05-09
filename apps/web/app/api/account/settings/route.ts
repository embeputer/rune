import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const PutBody = z.object({
  cursor_api_key: z
    .string()
    .trim()
    .min(1)
    .max(512)
    .regex(/^crsr_[A-Za-z0-9_-]+$/, "Cursor API keys start with `crsr_`")
    .nullable(),
});

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 6) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data } = await supabase
    .from("user_settings")
    .select("cursor_api_key, username, accent_color, updated_at")
    .eq("user_id", user.id)
    .maybeSingle();

  return NextResponse.json({
    cursor_api_key_masked: maskKey(data?.cursor_api_key ?? null),
    cursor_api_key_set: Boolean(data?.cursor_api_key),
    username: data?.username ?? null,
    accent_color: data?.accent_color ?? null,
    updated_at: data?.updated_at ?? null,
  });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PutBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, cursor_api_key: parsed.data.cursor_api_key },
      { onConflict: "user_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    cursor_api_key_masked: maskKey(parsed.data.cursor_api_key),
    cursor_api_key_set: Boolean(parsed.data.cursor_api_key),
  });
}

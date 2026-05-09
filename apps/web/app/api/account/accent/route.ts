import { NextResponse } from "next/server";
import { z } from "zod";
import { ACCENT_KEYS, isAccentKey } from "@/lib/accents";
import { createClient } from "@/lib/supabase/server";

/**
 * Persists the user's chosen accent preset key. Pass `null` to revert to the
 * design-system default (no override).
 */
const PutBody = z.object({
  accent_color: z
    .string()
    .nullable()
    .refine((v) => v === null || isAccentKey(v), {
      message: `Must be one of: ${ACCENT_KEYS.join(", ")}`,
    }),
});

export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PutBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid" },
      { status: 400 },
    );
  }

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, accent_color: parsed.data.accent_color },
      { onConflict: "user_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ accent_color: parsed.data.accent_color });
}

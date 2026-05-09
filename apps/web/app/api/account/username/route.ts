import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const USERNAME_RE = /^[a-z0-9_-]{2,32}$/;

const PutBody = z.object({
  username: z
    .string()
    .trim()
    .min(2, "Username must be at least 2 characters")
    .max(32, "Username must be 32 characters or fewer")
    .regex(USERNAME_RE, "Use lowercase letters, digits, underscore, or hyphen")
    .nullable(),
});

/**
 * Check whether a candidate username is available for the current user.
 *
 * GET /api/account/username?candidate=<name>
 *   → { available: boolean, valid: boolean, reason?: string }
 *
 * "Valid" means it matches the format rules; "available" means no other user
 * has it claimed (case-insensitive). The current user's own existing username
 * is reported as available so the form can show "no change needed".
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(request.url);
  const raw = url.searchParams.get("candidate")?.trim().toLowerCase() ?? "";
  if (!raw) {
    return NextResponse.json({ valid: false, available: false, reason: "Empty" });
  }
  if (!USERNAME_RE.test(raw)) {
    return NextResponse.json({
      valid: false,
      available: false,
      reason: "2–32 chars: lowercase letters, digits, _ or -",
    });
  }

  const { data: hit } = await supabase
    .from("user_settings")
    .select("user_id")
    .eq("username", raw)
    .maybeSingle();

  if (hit && hit.user_id !== user.id) {
    return NextResponse.json({ valid: true, available: false, reason: "Taken" });
  }
  return NextResponse.json({ valid: true, available: true });
}

/**
 * Set or clear the current user's username. Pass `null` to clear.
 *
 * Returns 409 if the username is already taken (rare race after a successful
 * GET availability check, but the unique index is the source of truth).
 */
export async function PUT(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const parsed = PutBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  }

  const next = parsed.data.username?.toLowerCase() ?? null;

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, username: next },
      { onConflict: "user_id" },
    );
  if (error) {
    // Postgres unique-violation (race vs the availability check or a concurrent
    // claim) — surface as 409 so the UI can prompt for a different name.
    if (error.code === "23505") {
      return NextResponse.json({ error: "Username already taken" }, { status: 409 });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ username: next });
}

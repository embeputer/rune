import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

/**
 * Persists the avatar URL after a client-side upload to the `avatars` bucket.
 *
 * The actual upload happens in the browser via the Supabase client (which has
 * the user's JWT). Once the file lands in `avatars/<user_id>/<filename>`, the
 * client posts the public URL here and we record it on `user_settings`.
 *
 * Pass `{ avatar_url: null }` to clear the avatar; the route also best-effort
 * deletes the previous object so we don't leak storage on each replace.
 */
const PutBody = z.object({
  avatar_url: z.string().url().nullable(),
});

function pathFromPublicUrl(url: string): string | null {
  // Public URLs look like:
  //   <project>.supabase.co/storage/v1/object/public/avatars/<user_id>/<file>
  const m = url.match(/\/storage\/v1\/object\/public\/avatars\/(.+)$/);
  return m?.[1] ?? null;
}

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

  const next = parsed.data.avatar_url;

  // If a URL was provided, sanity-check it points at *this* user's folder
  // so an attacker can't claim someone else's uploaded image as theirs.
  if (next) {
    const path = pathFromPublicUrl(next);
    if (!path || !path.startsWith(`${user.id}/`)) {
      return NextResponse.json({ error: "avatar_url must point at your own folder" }, { status: 400 });
    }
  }

  // Fetch the existing avatar so we can clean it up after replace/clear.
  const { data: existing } = await supabase
    .from("user_settings")
    .select("avatar_url")
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: user.id, avatar_url: next },
      { onConflict: "user_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort cleanup of the previous file (if it was distinct from the new
  // one). Failures here are silent — the storage RLS will reject anything we
  // shouldn't be able to touch anyway.
  const oldPath = existing?.avatar_url ? pathFromPublicUrl(existing.avatar_url) : null;
  const newPath = next ? pathFromPublicUrl(next) : null;
  if (oldPath && oldPath !== newPath) {
    try {
      await supabase.storage.from("avatars").remove([oldPath]);
    } catch {}
  }

  return NextResponse.json({ avatar_url: next });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

/**
 * Generates a one-shot "pairing token" the user can paste into
 * `bun run apps/gateway/src/cli.ts login`. The token bundles everything the
 * gateway needs to bootstrap a Supabase client and stand up a session.
 *
 * The refresh_token rotates on first gateway use, so re-running this endpoint
 * (or the user signing out) invalidates any previously generated token.
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const payload = {
    v: 1,
    supabase_url: env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_anon_key: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    user_id: session.user.id,
    access_token: session.access_token,
    refresh_token: session.refresh_token,
  };
  const token = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");

  return NextResponse.json({ token });
}

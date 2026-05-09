import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Force-removes a gateway from Supabase. The local config on the user's
 * machine is NOT touched (that requires the gateway itself to act on a
 * `sign-out` command — see ./sign-out/route.ts).
 *
 * Use this for stale/dead gateways the user can no longer reach. If the
 * gateway is currently online it will silently keep heartbeating against a
 * deleted row (updates affect 0 rows) until the user manually stops it.
 */
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

  const { error } = await supabase
    .from("gateways")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}

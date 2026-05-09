import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Remotely sign a gateway out: enqueue a `sign-out` command so the daemon
 * deletes its local `~/.rune/config.json` and exits cleanly.
 *
 * The actual cleanup happens daemon-side once the command is picked up. The
 * caller can poll `/api/gateway-commands/:id` to know when the daemon has
 * acknowledged the sign-out.
 *
 * If the gateway is offline this just queues the command — it'll be picked up
 * the next time the gateway starts. For dead/unreachable gateways, use
 * `DELETE /api/gateways/:id` to force-remove the row instead.
 */
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

  // Confirm the gateway belongs to this user before queueing.
  const { data: gateway } = await supabase
    .from("gateways")
    .select("id, status, last_seen_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!gateway) return NextResponse.json({ error: "gateway not found" }, { status: 404 });

  const { data: cmd, error } = await supabase
    .from("gateway_commands")
    .insert({
      user_id: user.id,
      gateway_id: id,
      kind: "sign-out",
      payload: {},
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    command_id: cmd.id,
    gateway_status: gateway.status,
    last_seen_at: gateway.last_seen_at,
  });
}

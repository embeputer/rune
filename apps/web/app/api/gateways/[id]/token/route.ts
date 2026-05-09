import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * GET /api/gateways/:id/token
 * Returns the gateway's `client_token` for the calling user. Browser uses
 * it to authenticate direct calls to `127.0.0.1:7777` (diffs / terminal).
 * RLS on `gateways` already restricts visibility to the owner.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("gateways")
    .select("id, client_token, status, last_seen_at")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (!data.client_token) {
    return NextResponse.json(
      { error: "Gateway has not registered a client token yet — restart it." },
      { status: 503 },
    );
  }
  return NextResponse.json({
    id: data.id,
    client_token: data.client_token,
    status: data.status,
    last_seen_at: data.last_seen_at,
  });
}

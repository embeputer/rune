import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.object({ dest_path: z.string().min(1) });

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

  const { data: gateway } = await supabase
    .from("gateways")
    .select("id")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!gateway) {
    return NextResponse.json({ error: "No gateway connected." }, { status: 409 });
  }

  const { data: cmd, error } = await supabase
    .from("gateway_commands")
    .insert({
      user_id: user.id,
      gateway_id: gateway.id,
      kind: "relocate-project",
      payload: { project_id: id, dest_path: parsed.data.dest_path },
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ command_id: cmd.id });
}

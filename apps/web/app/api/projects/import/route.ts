import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Body = z.union([
  z.object({ pick: z.literal(true) }),
  z.object({ path: z.string().min(1), name: z.string().optional() }),
]);

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const json = await request.json().catch(() => null);
  const parsed = Body.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const { data: gateway } = await supabase
    .from("gateways")
    .select("id, status, last_seen_at")
    .eq("user_id", user.id)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!gateway) {
    return NextResponse.json(
      { error: "No gateway connected. Start the gateway daemon first." },
      { status: 409 },
    );
  }

  const isPick = "pick" in parsed.data && parsed.data.pick;

  const { data: cmd, error } = await supabase
    .from("gateway_commands")
    .insert({
      user_id: user.id,
      gateway_id: gateway.id,
      kind: isPick ? "pick-folder" : "import-folder",
      payload: isPick
        ? { title: "Pick a folder to import as a Rune project" }
        : { path: (parsed.data as { path: string }).path },
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ command_id: cmd.id });
}

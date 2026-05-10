import type { RuneMessageRow } from "@rune/shared";
import { notFound } from "next/navigation";
import { RuneEditorPage } from "@/components/rune-editor-page";
import { createClient } from "@/lib/supabase/server";

const HEARTBEAT_GRACE_MS = 60_000;

export default async function RunePage({
  params,
}: {
  params: Promise<{ slug: string; runeSlug: string }>;
}) {
  const { slug, runeSlug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("user_id", user.id)
    .eq("slug", slug)
    .maybeSingle();
  if (!project) notFound();

  const { data: rune } = await supabase
    .from("runes")
    .select("*")
    .eq("project_id", project.id)
    .eq("slug", runeSlug)
    .maybeSingle();
  if (!rune) notFound();

  const [{ data: messages }, { data: gateway }] = await Promise.all([
    supabase
      .from("rune_messages")
      .select("*")
      .eq("rune_id", rune.id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true }),
    supabase
      .from("gateways")
      .select("id, status, last_seen_at, client_token")
      .eq("user_id", user.id)
      .eq("status", "online")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  // Resolve "online and recently heartbeating" once on the server so the
  // client doesn't have to round-trip to /api/gateways/:id/token on mount.
  // The gateway's client_token comes straight along on the same query.
  const isFresh =
    gateway && Date.now() - new Date(gateway.last_seen_at).getTime() <= HEARTBEAT_GRACE_MS;
  const onlineGatewayId = isFresh ? gateway.id : null;
  const onlineGatewayToken = isFresh ? (gateway.client_token ?? null) : null;

  return (
    <div className="flex h-screen flex-col">
      <RuneEditorPage
        rune={{
          id: rune.id,
          slug: rune.slug,
          title: rune.title,
          body: rune.body,
          runtime: rune.runtime,
          status: rune.status,
          mode: rune.mode,
          output: rune.output,
        }}
        project={{
          id: project.id,
          name: project.name,
          slug: project.slug,
          localPath: project.local_path,
          githubRepo: project.github_repo,
          isScratch: project.is_scratch,
        }}
        cloudReady={Boolean(project.github_repo)}
        initialMessages={(messages ?? []) as RuneMessageRow[]}
        onlineGatewayId={onlineGatewayId}
        onlineGatewayToken={onlineGatewayToken}
      />
    </div>
  );
}

import type { RuneMessageRow } from "@rune/shared";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { RuneEditorPage } from "@/components/rune-editor-page";
import { Button } from "@/components/ui/button";
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
      .select("id, status, last_seen_at")
      .eq("user_id", user.id)
      .eq("status", "online")
      .order("last_seen_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const onlineGatewayId =
    gateway && Date.now() - new Date(gateway.last_seen_at).getTime() <= HEARTBEAT_GRACE_MS
      ? gateway.id
      : null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-6 py-3">
        <Button asChild variant="ghost" size="sm" className="-ml-2">
          <Link href={`/projects/${project.slug}`}>
            <ChevronLeft className="h-3.5 w-3.5" /> {project.name}
          </Link>
        </Button>
      </header>
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
          localPath: project.local_path,
          githubRepo: project.github_repo,
          isScratch: project.is_scratch,
        }}
        cloudReady={Boolean(project.github_repo)}
        initialMessages={(messages ?? []) as RuneMessageRow[]}
        onlineGatewayId={onlineGatewayId}
      />
    </div>
  );
}

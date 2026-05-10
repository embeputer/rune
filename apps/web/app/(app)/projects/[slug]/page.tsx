import { Cloud, FolderGit2, FolderOpen, Settings } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { NewRuneButton } from "@/components/new-rune-button";
import { ProjectRuneList } from "@/components/project-rune-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
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

  const { data: runes } = await supabase
    .from("runes")
    .select("id, slug, title, status, runtime, updated_at")
    .eq("project_id", project.id)
    .order("created_at", { ascending: true });

  return (
    <div className="flex h-screen flex-col">
      <header className="flex flex-col gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-3 md:flex-row md:items-center md:justify-between md:px-6 md:py-4">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-1.5 md:gap-2">
            <h1 className="min-w-0 truncate text-base font-semibold md:text-lg">
              {project.name}
            </h1>
            {project.is_external ? (
              <Badge variant="outline">
                <FolderOpen className="mr-1 h-3 w-3" /> external
              </Badge>
            ) : (
              <Badge variant="outline">
                <FolderGit2 className="mr-1 h-3 w-3" /> in workspace
              </Badge>
            )}
            {project.github_repo ? (
              <Badge variant="accent" className="max-w-full truncate">
                <Cloud className="mr-1 h-3 w-3 shrink-0" />
                <span className="truncate">{project.github_repo}</span>
              </Badge>
            ) : null}
          </div>
          <div className="truncate font-mono text-[11px] text-[var(--color-fg-subtle)] md:text-xs">
            {project.local_path}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${project.slug}/settings`}>
              <Settings className="h-3.5 w-3.5" /> Settings
            </Link>
          </Button>
          <NewRuneButton projectId={project.id} projectSlug={project.slug} />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-3 py-4 md:px-6 md:py-6">
        <ProjectRuneList projectSlug={project.slug} runes={runes ?? []} />
      </div>
    </div>
  );
}

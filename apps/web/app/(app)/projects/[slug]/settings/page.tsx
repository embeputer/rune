import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { GithubLinkCard } from "@/components/github-link-card";
import { ProjectDangerZone } from "@/components/project-danger-zone";
import { ProjectIdentityCard } from "@/components/project-identity-card";
import { RelocateCard } from "@/components/relocate-card";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export default async function ProjectSettingsPage({
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

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-6 py-4">
        <div className="space-y-1">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href={`/projects/${project.slug}`}>
              <ChevronLeft className="h-3.5 w-3.5" /> {project.name}
            </Link>
          </Button>
          <h1 className="text-lg font-semibold">Settings</h1>
        </div>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <ProjectIdentityCard
          projectId={project.id}
          initialName={project.name}
          initialSlug={project.slug}
          isExternal={project.is_external}
          isScratch={project.is_scratch}
        />
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
          <h2 className="mb-2 text-sm font-semibold">Path</h2>
          <div className="font-mono text-xs text-[var(--color-fg-muted)]">{project.local_path}</div>
          <div className="mt-1 text-xs text-[var(--color-fg-subtle)]">
            {project.is_external
              ? "External — runes live in .rune/ inside this folder."
              : "Inside the gateway workspace root."}
          </div>
        </section>
        <GithubLinkCard
          projectId={project.id}
          githubRepo={project.github_repo}
          githubBranch={project.github_branch}
          defaultBranch={project.github_default_branch}
        />
        {!project.is_external && (
          <RelocateCard projectId={project.id} currentPath={project.local_path} />
        )}
        <ProjectDangerZone
          projectId={project.id}
          projectName={project.name}
          isScratch={project.is_scratch}
        />
      </div>
    </div>
  );
}

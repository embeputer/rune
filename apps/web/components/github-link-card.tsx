"use client";

import { Github } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function GithubLinkCard({
  projectId,
  githubRepo,
  githubBranch,
  defaultBranch,
}: {
  projectId: string;
  githubRepo: string | null;
  githubBranch: string | null;
  defaultBranch: string | null;
}) {
  const router = useRouter();
  const [repo, setRepo] = useState(githubRepo ?? "");
  const [branch, setBranch] = useState(githubBranch ?? defaultBranch ?? "main");
  const [busy, setBusy] = useState(false);

  async function link(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/link-github`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repo_url: repo, branch: branch || undefined }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error ?? "Failed");
      return;
    }
    toast.success("Linked GitHub repo");
    router.refresh();
  }

  async function unlink() {
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/link-github`, { method: "DELETE" });
    setBusy(false);
    if (!res.ok) {
      toast.error("Failed");
      return;
    }
    setRepo("");
    setBranch("main");
    toast.success("Unlinked");
    router.refresh();
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Github className="h-4 w-4" /> GitHub link
        </h2>
        {githubRepo ? (
          <Badge variant="success">linked</Badge>
        ) : (
          <Badge variant="outline">required for Cursor Cloud</Badge>
        )}
      </div>
      <p className="mb-4 text-xs text-[var(--color-fg-muted)]">
        Linking a repo enables the <code>cursor-cloud</code> runtime for runes in this project.
        Cursor Cloud Agents operate on the linked repository.
      </p>
      <form onSubmit={link} className="space-y-3">
        <Input
          placeholder="https://github.com/owner/repo  or  owner/repo"
          value={repo}
          onChange={(e) => setRepo(e.target.value)}
          required
        />
        <Input
          placeholder={`branch (defaults to ${defaultBranch ?? "main"})`}
          value={branch}
          onChange={(e) => setBranch(e.target.value)}
        />
        <div className="flex gap-2">
          <Button type="submit" disabled={busy || !repo.trim()}>
            {busy ? "Linking…" : githubRepo ? "Update link" : "Link repo"}
          </Button>
          {githubRepo && (
            <Button type="button" variant="outline" onClick={unlink} disabled={busy}>
              Unlink
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

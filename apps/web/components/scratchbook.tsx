"use client";

import { FilePlus, NotebookPen, Pencil, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  RenameProjectDialog,
  type RenameProjectResult,
} from "@/components/rename-project-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type ScratchSummary = {
  id: string;
  name: string;
  slug: string;
  local_path: string;
  created_at: string;
};

export function Scratchbook({ scratches: initial }: { scratches: ScratchSummary[] }) {
  const router = useRouter();
  const [scratches, setScratches] = useState(initial);
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<ScratchSummary | null>(null);

  async function newScratch() {
    setCreating(true);
    try {
      const res = await fetch("/api/scratchbook", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to create scratch");
      router.push(`/projects/${json.project.slug}/runes/${json.rune.slug}`);
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function applyRename(next: RenameProjectResult) {
    setScratches((s) =>
      s.map((p) =>
        p.id === next.id
          ? { ...p, name: next.name, slug: next.slug, local_path: next.local_path }
          : p,
      ),
    );
    router.refresh();
  }

  async function deleteScratch(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Runes are removed from Rune; the folder on disk is left alone.`)) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      setScratches((s) => s.filter((p) => p.id !== id));
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-6 py-3">
        <div className="text-xs text-[var(--color-fg-subtle)]">
          {scratches.length === 0
            ? "No scratch projects yet."
            : `${scratches.length} scratch project${scratches.length === 1 ? "" : "s"}.`}
        </div>
        <Button onClick={newScratch} disabled={creating}>
          <FilePlus className="h-3.5 w-3.5" /> {creating ? "Creating…" : "New scratch"}
        </Button>
      </div>

      <RenameProjectDialog
        open={renaming !== null}
        onOpenChange={(o) => {
          if (!o) setRenaming(null);
        }}
        project={
          renaming
            ? {
                id: renaming.id,
                name: renaming.name,
                slug: renaming.slug,
                is_external: false,
              }
            : null
        }
        onRenamed={applyRename}
      />

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {scratches.length === 0 ? (
          <EmptyState onCreate={newScratch} creating={creating} />
        ) : (
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {scratches.map((s) => (
              <li key={s.id} className="group relative">
                <Link
                  href={`/projects/${s.slug}`}
                  className="flex h-full flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-4 transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-bg-elev-2)]"
                >
                  <div className="flex min-w-0 items-center gap-2 pr-14">
                    <NotebookPen className="h-4 w-4 shrink-0 text-[var(--color-fg-muted)]" />
                    <span className="truncate text-sm font-medium">{s.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="px-1.5 py-0 text-[9px]">
                      scratch
                    </Badge>
                    <code className="truncate font-mono text-[11px] text-[var(--color-fg-subtle)]">
                      {s.id.slice(0, 8)}…
                    </code>
                  </div>
                  <div className="truncate font-mono text-[11px] text-[var(--color-fg-subtle)]">
                    {s.local_path}
                  </div>
                </Link>
                <div className="absolute right-2 top-2 flex gap-0.5 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenaming(s);
                    }}
                    aria-label={`Rename ${s.name}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-fg-subtle)] hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg)]"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      deleteScratch(s.id, s.name);
                    }}
                    disabled={deletingId === s.id}
                    aria-label={`Delete ${s.name}`}
                    className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--color-fg-subtle)] hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-danger)] disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onCreate, creating }: { onCreate: () => void; creating: boolean }) {
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-dashed border-[var(--color-border)] px-6 py-12 text-center">
      <NotebookPen className="h-8 w-8 text-[var(--color-fg-subtle)]" />
      <div>
        <h2 className="text-sm font-semibold">Start a scratch project</h2>
        <p className="mt-1 text-xs text-[var(--color-fg-muted)]">
          Each scratch is a real project under <code className="font-mono">rune/&lt;id&gt;</code>.
          Dump notes as runes; rename or relocate it later when it's worth keeping.
        </p>
      </div>
      <Button onClick={onCreate} disabled={creating}>
        <FilePlus className="h-3.5 w-3.5" /> {creating ? "Creating…" : "New scratch"}
      </Button>
    </div>
  );
}

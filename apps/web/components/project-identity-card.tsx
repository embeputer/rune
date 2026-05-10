"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Inline rename card for the project settings page. Avoids the modal-based
 * RenameProjectDialog because the settings page is the place mobile users
 * reach for rename/delete (no hover affordances available on touch).
 *
 * Uses PATCH /api/projects/:id under the hood. For non-external projects
 * the server enqueues a `relocate-project` gateway command so the on-disk
 * folder name follows the new slug.
 */
export function ProjectIdentityCard({
  projectId,
  initialName,
  initialSlug,
  isExternal,
  isScratch,
}: {
  projectId: string;
  initialName: string;
  initialSlug: string;
  isExternal: boolean;
  isScratch: boolean;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [busy, setBusy] = useState(false);

  const dirty = name.trim().length > 0 && name.trim() !== initialName;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dirty || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Rename failed");
      toast.success(
        json.command_id ? "Renamed — folder rename queued on gateway" : "Renamed",
      );
      // The slug changes too — push to the new URL so the page state stays in sync.
      if (json.project?.slug && json.project.slug !== initialSlug) {
        router.push(`/projects/${json.project.slug}/settings`);
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Pencil className="h-4 w-4" />
        {isScratch ? "Rename scratch" : "Rename project"}
      </h2>
      <p className="mb-4 text-xs text-[var(--color-fg-muted)]">
        {isExternal
          ? "Updates the name and URL slug. The external folder on disk is left as-is."
          : "Updates the name and URL slug. The on-disk folder is renamed alongside via the connected gateway."}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Project name"
          maxLength={120}
          disabled={busy}
          className="flex-1"
          aria-label="Project name"
        />
        <Button type="submit" disabled={!dirty || busy} className="sm:w-auto">
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
    </section>
  );
}

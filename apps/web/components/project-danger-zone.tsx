"use client";

import { Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Mobile-safe delete card. Uses a "type the project name to confirm" pattern
 * instead of a native `confirm()` dialog (which is awkward on touch and
 * sometimes blocked entirely in mobile browsers).
 *
 * Calls DELETE /api/projects/:id, which cascades to runes/tasks via FKs.
 * The on-disk folder is intentionally left alone — Rune treats local files
 * as the user's.
 *
 * After delete, scratches return to /scratchbook and regular projects to /.
 */
export function ProjectDangerZone({
  projectId,
  projectName,
  isScratch,
}: {
  projectId: string;
  projectName: string;
  isScratch: boolean;
}) {
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [armed, setArmed] = useState(false);

  const matches = confirmText.trim() === projectName;

  async function deleteProject() {
    if (!matches || busy) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Delete failed");
      toast.success(`Deleted "${projectName}"`);
      router.push(isScratch ? "/scratchbook" : "/");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-danger)]/40 bg-[var(--color-bg-elev)] p-5">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-danger)]">
        <Trash2 className="h-4 w-4" />
        Delete {isScratch ? "scratch" : "project"}
      </h2>
      <p className="mb-4 text-xs text-[var(--color-fg-muted)]">
        Removes the {isScratch ? "scratch" : "project"} and all of its runes from Rune. The folder
        on disk is <strong>left untouched</strong> — you can clean it up manually if you want.
      </p>

      {!armed ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => setArmed(true)}
          className="border-[var(--color-danger)]/50 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Delete this {isScratch ? "scratch" : "project"}…
        </Button>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-fg-muted)]">
            Type{" "}
            <code className="rounded bg-[var(--color-bg)] px-1 py-0.5 font-mono text-[var(--color-fg)]">
              {projectName}
            </code>{" "}
            to confirm.
          </p>
          <Input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={projectName}
            disabled={busy}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={`Type ${projectName} to confirm deletion`}
          />
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setArmed(false);
                setConfirmText("");
              }}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="danger"
              onClick={deleteProject}
              disabled={!matches || busy}
            >
              {busy ? "Deleting…" : `Delete ${isScratch ? "scratch" : "project"}`}
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

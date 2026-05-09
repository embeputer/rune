"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export type RenameProjectResult = {
  id: string;
  name: string;
  slug: string;
  local_path: string;
};

export function RenameProjectDialog({
  open,
  onOpenChange,
  project,
  onRenamed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: { id: string; name: string; slug: string; is_external: boolean } | null;
  onRenamed: (next: RenameProjectResult) => void;
}) {
  const [name, setName] = useState(project?.name ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(project?.name ?? "");
  }, [project?.id, project?.name]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    if (trimmed === project.name) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Rename failed");
      onRenamed({
        id: json.project.id,
        name: json.project.name,
        slug: json.project.slug,
        local_path: json.project.local_path,
      });
      toast.success(
        json.command_id
          ? "Renamed — folder rename queued on gateway"
          : "Renamed",
      );
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename project</DialogTitle>
          <DialogDescription>
            {project?.is_external
              ? "Updates the name and URL slug. The external folder on disk is left as-is."
              : "Updates the name, URL slug, and folder name on disk. Requires a connected gateway."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Project name"
            maxLength={120}
            disabled={busy}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Renaming…" : "Rename"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

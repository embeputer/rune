"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

export function NewRuneDialog({
  open,
  onOpenChange,
  projectId,
  projectSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string | null;
  projectSlug: string | null;
}) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle("");
      setBody("");
      setBusy(false);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || !projectSlug) return;
    setBusy(true);
    const res = await fetch(`/api/projects/${projectId}/runes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      toast.error(json.error ?? "Failed to create rune");
      return;
    }
    onOpenChange(false);
    router.push(`/projects/${projectSlug}/runes/${json.rune.slug}`);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New rune</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <Input
            autoFocus
            placeholder="Title — what does this rune do?"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <Textarea
            placeholder="Describe the task in plain markdown…"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={8}
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
            <Button type="submit" disabled={busy || !title.trim()}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

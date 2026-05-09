"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
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

export function ImportProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}) {
  const router = useRouter();
  const [path, setPath] = useState("");
  const [busy, setBusy] = useState<"pick" | "import" | null>(null);

  async function pickViaGateway() {
    setBusy("pick");
    try {
      const res = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pick: true }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const picked = await pollGatewayCommand(json.command_id);
      if (picked && typeof picked === "object" && "path" in picked) {
        setPath(String((picked as { path: string }).path));
      } else {
        toast.message("Pick cancelled");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!path.trim()) return;
    setBusy("import");
    try {
      const res = await fetch("/api/projects/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const result = await pollGatewayCommand(json.command_id);
      if (result && typeof result === "object" && "project_id" in result && "slug" in result) {
        toast.success("Project imported");
        onOpenChange(false);
        setPath("");
        router.push(`/projects/${(result as { slug: string }).slug}`);
        router.refresh();
      } else {
        throw new Error("Import did not return a project");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import existing folder</DialogTitle>
          <DialogDescription>
            Register a folder anywhere on your gateway machine as a Rune project. Rune metadata
            will live in <code>.rune/</code>.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="C:\Users\you\projects\my-app"
              value={path}
              onChange={(e) => setPath(e.target.value)}
              required
            />
            <Button
              type="button"
              variant="outline"
              onClick={pickViaGateway}
              disabled={busy !== null}
            >
              {busy === "pick" ? "Picking…" : "Browse…"}
            </Button>
          </div>
          <p className="text-xs text-[var(--color-fg-subtle)]">
            Browse opens a native folder picker on your gateway machine.
          </p>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy !== null}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy !== null || !path.trim()}>
              {busy === "import" ? "Importing…" : "Import"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

async function pollGatewayCommand(commandId: string): Promise<unknown> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60_000) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(`/api/gateway-commands/${commandId}`);
    if (!res.ok) continue;
    const json = await res.json();
    if (json.status === "done") return json.result;
    if (json.status === "error") throw new Error(json.error ?? "gateway error");
  }
  throw new Error("timeout waiting for gateway");
}

"use client";

import { Move } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function RelocateCard({
  projectId,
  currentPath,
}: {
  projectId: string;
  currentPath: string;
}) {
  const router = useRouter();
  const [dest, setDest] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!dest.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/relocate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dest_path: dest }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const result = await pollGatewayCommand(json.command_id);
      toast.success("Project relocated");
      router.refresh();
      void result;
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Move className="h-4 w-4" /> Move out of workspace
      </h2>
      <p className="mb-4 text-xs text-[var(--color-fg-muted)]">
        Move this project to another folder on your gateway machine. Rune metadata will be moved
        into a hidden <code>.rune/</code> subdir inside the destination so your project root stays
        clean.
      </p>
      <div className="mb-3 font-mono text-xs text-[var(--color-fg-subtle)]">
        From: {currentPath}
      </div>
      <form onSubmit={submit} className="space-y-3">
        <Input
          placeholder="C:\Users\you\projects\my-app"
          value={dest}
          onChange={(e) => setDest(e.target.value)}
          required
        />
        <Button type="submit" disabled={busy || !dest.trim()}>
          {busy ? "Moving…" : "Relocate"}
        </Button>
      </form>
    </section>
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

"use client";

import { Check, Copy, Terminal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function PairGatewayCard() {
  const [token, setToken] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function generate() {
    setBusy(true);
    try {
      const res = await fetch("/api/account/pair-gateway", { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setToken(json.token);
      setCopied(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!token) return;
    await navigator.clipboard.writeText(token);
    setCopied(true);
    toast.success("Pairing token copied");
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <h2 className="text-sm font-semibold">Pair a Gateway</h2>
        </div>
        <Badge variant="outline" className="text-[10px]">
          local agent
        </Badge>
      </div>
      <p className="mb-3 text-xs text-[var(--color-fg-muted)]">
        Generates a one-shot pairing token bundling your Supabase session.
        Paste it into <code className="font-mono">rune login</code> on your
        machine to authenticate the gateway daemon. The token rotates whenever
        you refresh — only the latest one is usable.
      </p>

      {!token && (
        <Button onClick={generate} disabled={busy}>
          {busy ? "Generating…" : "Generate pairing token"}
        </Button>
      )}

      {token && (
        <div className="space-y-3">
          <div className="rounded-md bg-[var(--color-bg-elev-2)] p-3">
            <code className="block max-h-32 overflow-y-auto break-all font-mono text-[10px] leading-relaxed">
              {token}
            </code>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={copy} size="sm">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{" "}
              {copied ? "Copied" : "Copy token"}
            </Button>
            <Button onClick={generate} size="sm" variant="ghost" disabled={busy}>
              Regenerate
            </Button>
          </div>
          <pre className="overflow-x-auto rounded-md bg-[var(--color-bg-elev-2)] p-3 text-[11px] text-[var(--color-fg-muted)]">
            <code>{`# In your repo:
bun run apps/gateway/src/cli.ts login
#   → paste the token when prompted
#   → pick a workspace folder (default: ~/rune)

# Then start the daemon:
pnpm dev:gateway`}</code>
          </pre>
        </div>
      )}
    </section>
  );
}

"use client";

import { Cpu, LogOut, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { type GatewaySummary } from "@/components/gateway-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { cn, formatRelative } from "@/lib/utils";

const HEARTBEAT_GRACE_MS = 60_000;

export function GatewayListCard({ initial }: { initial: GatewaySummary[] }) {
  const [gateways, setGateways] = useState<GatewaySummary[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("gateway-list")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "gateways" },
        async () => {
          const { data } = await supabase
            .from("gateways")
            .select("id, name, status, last_seen_at, capabilities")
            .order("created_at", { ascending: true });
          if (data) setGateways(data as GatewaySummary[]);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function signOut(g: GatewaySummary) {
    const fresh =
      g.status === "online" &&
      Date.now() - new Date(g.last_seen_at).getTime() < HEARTBEAT_GRACE_MS;
    const msg = fresh
      ? `Sign out "${g.name}"? Its local config will be cleared and the daemon will stop.`
      : `Sign out "${g.name}"? It looks offline — the request will sit queued until it next connects.`;
    if (!confirm(msg)) return;
    setBusyId(g.id);
    try {
      const res = await fetch(`/api/gateways/${g.id}/sign-out`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Sign out failed");
      toast.success(
        fresh
          ? "Sign-out queued — gateway will exit shortly"
          : "Sign-out queued for next connect",
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(g: GatewaySummary) {
    if (
      !confirm(
        `Remove "${g.name}" from the dashboard? This does NOT clear local config — use Sign out for that.`,
      )
    ) {
      return;
    }
    setBusyId(g.id);
    try {
      const res = await fetch(`/api/gateways/${g.id}`, { method: "DELETE" });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Remove failed");
      }
      setGateways((prev) => prev.filter((row) => row.id !== g.id));
      toast.success("Gateway removed");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <h2 className="text-sm font-semibold">Linked gateways</h2>
        </div>
        <Badge variant="outline" className="text-[10px]">
          {gateways.length} linked
        </Badge>
      </div>
      {gateways.length === 0 ? (
        <p className="text-xs text-[var(--color-fg-muted)]">
          No gateways yet. Pair one from the card above and run{" "}
          <code className="rounded bg-[var(--color-border)] px-1 font-mono">pnpm dev:gateway</code> on your machine.
        </p>
      ) : (
        <ul className="space-y-2">
          {gateways.map((g) => {
            const fresh =
              g.status === "online" &&
              Date.now() - new Date(g.last_seen_at).getTime() < HEARTBEAT_GRACE_MS;
            const runtimes = (g.capabilities?.runtimes ?? []).filter((r) => r.available);
            return (
              <li
                key={g.id}
                className="flex flex-col gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-2 w-2 rounded-full",
                        fresh
                          ? "bg-[var(--color-success)] shadow-[0_0_6px_var(--color-success)]"
                          : "bg-[var(--color-fg-subtle)]",
                      )}
                    />
                    <span className="truncate text-sm font-medium">{g.name}</span>
                    <Badge variant={fresh ? "success" : "outline"}>
                      {fresh ? "online" : "offline"}
                    </Badge>
                  </div>
                  <div className="text-[11px] text-[var(--color-fg-subtle)]">
                    last seen {formatRelative(g.last_seen_at)}
                  </div>
                  {runtimes.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {runtimes.map((r) => (
                        <Badge key={r.id} variant="default" className="px-1.5 text-[9px]">
                          {r.id}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => signOut(g)}
                    disabled={busyId === g.id}
                    title={fresh ? "Clear config and stop the daemon" : "Queue sign-out for next connect"}
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Sign out
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => remove(g)}
                    disabled={busyId === g.id}
                    className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
                    title="Remove from dashboard (local config untouched)"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Remove
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

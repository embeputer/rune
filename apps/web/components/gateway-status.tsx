"use client";

import { Cpu, LogOut, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { createClient } from "@/lib/supabase/client";
import { cn, formatRelative } from "@/lib/utils";

export type GatewaySummary = {
  id: string;
  name: string;
  status: "online" | "offline";
  last_seen_at: string;
  capabilities: { runtimes?: Array<{ id: string; available: boolean; version?: string | null }> };
};

const HEARTBEAT_GRACE_MS = 60_000;

export function GatewayStatus({ initial }: { initial: GatewaySummary[] }) {
  const [gateways, setGateways] = useState<GatewaySummary[]>(initial);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("gateways")
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

  const online = useMemo(
    () =>
      gateways.find(
        (g) =>
          g.status === "online" &&
          Date.now() - new Date(g.last_seen_at).getTime() < HEARTBEAT_GRACE_MS,
      ),
    [gateways],
  );

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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] px-2 py-1.5 text-left text-xs transition-colors hover:bg-[var(--color-border)]"
        >
          <span className="flex items-center gap-2">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                online
                  ? "bg-[var(--color-success)] shadow-[0_0_8px_var(--color-success)]"
                  : "bg-[var(--color-fg-subtle)]",
              )}
            />
            <Cpu className="h-3.5 w-3.5 opacity-80" />
            <span className="text-[var(--color-fg-muted)]">
              {online ? "Gateway online" : gateways.length === 0 ? "No gateway" : "Gateway offline"}
            </span>
          </span>
          <span className="truncate text-[10px] text-[var(--color-fg-subtle)]">
            {online ? online.name : gateways.length > 0 ? `${gateways.length} linked` : ""}
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-80 p-2">
        <div className="mb-1 px-1 text-[11px] font-medium uppercase tracking-wider text-[var(--color-fg-subtle)]">
          Gateways
        </div>
        {gateways.length === 0 ? (
          <div className="px-2 py-2 text-xs text-[var(--color-fg-muted)]">
            Run <code className="rounded bg-[var(--color-border)] px-1">pnpm dev:gateway</code> on
            your laptop to connect one. Pair from{" "}
            <a className="underline" href="/account">
              Account
            </a>
            .
          </div>
        ) : (
          <ul className="space-y-1">
            {gateways.map((g) => (
              <GatewayRow
                key={g.id}
                gateway={g}
                busy={busyId === g.id}
                onSignOut={() => signOut(g)}
                onRemove={() => remove(g)}
              />
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function GatewayRow({
  gateway: g,
  busy,
  onSignOut,
  onRemove,
}: {
  gateway: GatewaySummary;
  busy: boolean;
  onSignOut: () => void;
  onRemove: () => void;
}) {
  const fresh =
    g.status === "online" &&
    Date.now() - new Date(g.last_seen_at).getTime() < HEARTBEAT_GRACE_MS;
  const runtimes = (g.capabilities?.runtimes ?? []).filter((r) => r.available);
  return (
    <li className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elev-2)] p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-medium">{g.name}</span>
        <Badge variant={fresh ? "success" : "outline"}>
          {fresh ? "online" : "offline"}
        </Badge>
      </div>
      <div className="mt-0.5 text-[10px] text-[var(--color-fg-subtle)]">
        last seen {formatRelative(g.last_seen_at)}
      </div>
      {runtimes.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1">
          {runtimes.map((r) => (
            <Badge key={r.id} variant="default" className="px-1.5 text-[9px]">
              {r.id}
            </Badge>
          ))}
        </div>
      )}
      <div className="mt-2 flex justify-end gap-1">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onSignOut}
          disabled={busy}
          title={fresh ? "Clear config and stop the daemon" : "Queue sign-out for next connect"}
        >
          <LogOut className="h-3 w-3" />
          Sign out
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onRemove}
          disabled={busy}
          className="text-[var(--color-danger)] hover:text-[var(--color-danger)]"
          title="Remove from dashboard (local config untouched)"
        >
          <Trash2 className="h-3 w-3" />
          Remove
        </Button>
      </div>
    </li>
  );
}

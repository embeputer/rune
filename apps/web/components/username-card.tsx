"use client";

import { AtSign, Check, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type AvailabilityState =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "ok" }
  | { state: "invalid" | "taken"; reason: string };

export function UsernameCard({
  initial,
  fallback,
}: {
  initial: string | null;
  fallback: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial ?? "");
  const [busy, setBusy] = useState(false);
  const [check, setCheck] = useState<AvailabilityState>({ state: "idle" });
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trimmed = value.trim().toLowerCase();
  const unchanged = trimmed === (initial ?? "").toLowerCase();

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (!trimmed) {
      setCheck({ state: "idle" });
      return;
    }
    if (unchanged) {
      setCheck({ state: "ok" });
      return;
    }
    setCheck({ state: "checking" });
    debounce.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/account/username?candidate=${encodeURIComponent(trimmed)}`,
        );
        const json = await res.json();
        if (!json.valid) {
          setCheck({ state: "invalid", reason: json.reason ?? "Invalid" });
        } else if (!json.available) {
          setCheck({ state: "taken", reason: json.reason ?? "Taken" });
        } else {
          setCheck({ state: "ok" });
        }
      } catch {
        setCheck({ state: "idle" });
      }
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [trimmed, unchanged]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (check.state !== "ok" || unchanged) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/username", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success("Username updated");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm("Reset username to your email-derived default?")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/account/username", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Reset failed");
      setValue("");
      toast.success("Username reset");
      router.refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const showStatus = trimmed.length > 0 && !unchanged;

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AtSign className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <h2 className="text-sm font-semibold">Username</h2>
        </div>
        {initial ? (
          <Badge variant="accent" className="text-[10px]">
            {initial}
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            using {fallback}
          </Badge>
        )}
      </div>
      <p className="mb-3 text-xs text-[var(--color-fg-muted)]">
        Shown at the top of the sidebar. 2–32 chars: lowercase letters, digits, hyphen, or underscore.
        Reset to fall back to your email handle (<code className="font-mono">{fallback}</code>).
      </p>
      <form onSubmit={save} className="space-y-2">
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-fg-subtle)]">
            @
          </span>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value.replace(/\s+/g, ""))}
            placeholder={fallback}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
            className="pl-7 font-mono text-sm"
          />
          {showStatus && (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs">
              {check.state === "checking" && (
                <span className="text-[var(--color-fg-subtle)]">…</span>
              )}
              {check.state === "ok" && (
                <Check className="h-4 w-4 text-[var(--color-success)]" />
              )}
              {(check.state === "invalid" || check.state === "taken") && (
                <X className="h-4 w-4 text-[var(--color-danger)]" />
              )}
            </span>
          )}
        </div>
        {showStatus && (check.state === "invalid" || check.state === "taken") && (
          <p
            className={cn(
              "text-[11px]",
              check.state === "taken" || check.state === "invalid"
                ? "text-[var(--color-danger)]"
                : "text-[var(--color-fg-subtle)]",
            )}
          >
            {check.reason}
          </p>
        )}
        <div className="flex justify-end gap-2">
          {initial && (
            <Button type="button" variant="ghost" onClick={clear} disabled={busy}>
              Reset
            </Button>
          )}
          <Button
            type="submit"
            disabled={busy || unchanged || check.state !== "ok"}
          >
            {busy ? "Saving…" : initial ? "Update" : "Set username"}
          </Button>
        </div>
      </form>
    </section>
  );
}

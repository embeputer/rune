"use client";

import { Cloud, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function CursorKeyCard({
  initialMasked,
  initialSet,
  initialUpdatedAt,
}: {
  initialMasked: string | null;
  initialSet: boolean;
  initialUpdatedAt: string | null;
}) {
  const [masked, setMasked] = useState(initialMasked);
  const [isSet, setIsSet] = useState(initialSet);
  const [updatedAt, setUpdatedAt] = useState(initialUpdatedAt);
  const [editing, setEditing] = useState(!initialSet);
  const [value, setValue] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) return;
    if (!trimmed.startsWith("crsr_")) {
      toast.error("Cursor API keys start with `crsr_`");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor_api_key: trimmed }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setMasked(json.cursor_api_key_masked);
      setIsSet(true);
      setEditing(false);
      setValue("");
      setUpdatedAt(new Date().toISOString());
      toast.success("Cursor API key saved");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!confirm("Remove the Cursor API key? Cursor Cloud runs will fail until you set a new one.")) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cursor_api_key: null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Remove failed");
      setMasked(null);
      setIsSet(false);
      setEditing(true);
      setUpdatedAt(null);
      toast.success("Cursor API key removed");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cloud className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <h2 className="text-sm font-semibold">Cursor Cloud Agent</h2>
        </div>
        {isSet ? (
          <Badge variant="accent" className="text-[10px]">
            connected
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px]">
            not configured
          </Badge>
        )}
      </div>
      <p className="mb-3 text-xs text-[var(--color-fg-muted)]">
        Required to run runes with the <code className="font-mono">cursor-cloud</code> runtime.
        Get a key from{" "}
        <a
          href="https://cursor.com/dashboard"
          target="_blank"
          rel="noreferrer"
          className="text-[var(--color-accent)] underline"
        >
          cursor.com/dashboard
        </a>
        . Stored encrypted-at-rest on Supabase, scoped to your account.
      </p>

      {!editing && isSet && (
        <div className="flex items-center justify-between gap-2 rounded-md bg-[var(--color-bg-elev-2)] px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)]" />
            <code className="truncate font-mono text-xs">{masked}</code>
            {updatedAt && (
              <span className="shrink-0 text-[10px] text-[var(--color-fg-subtle)]">
                · updated {new Date(updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-1">
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)} disabled={busy}>
              Replace
            </Button>
            <Button
              size="icon"
              variant="ghost"
              onClick={clear}
              disabled={busy}
              aria-label="Remove key"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {editing && (
        <form onSubmit={save} className="space-y-2">
          <div className="relative">
            <Input
              type={reveal ? "text" : "password"}
              autoComplete="off"
              spellCheck={false}
              placeholder="crsr_…"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="pr-9 font-mono text-xs"
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="absolute inset-y-0 right-0 flex items-center px-2 text-[var(--color-fg-subtle)] hover:text-[var(--color-fg)]"
              aria-label={reveal ? "Hide" : "Show"}
            >
              {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex justify-end gap-2">
            {isSet && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  setValue("");
                }}
                disabled={busy}
              >
                Cancel
              </Button>
            )}
            <Button type="submit" size="sm" disabled={busy || !value.trim()}>
              {busy ? "Saving…" : isSet ? "Update key" : "Save key"}
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}

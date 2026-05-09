"use client";

import { Check, Palette } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import {
  ACCENT_KEYS,
  ACCENT_PRESETS,
  type AccentKey,
  DEFAULT_ACCENT,
} from "@/lib/accents";
import { cn } from "@/lib/utils";

export function AccentCard({ initial }: { initial: AccentKey | null }) {
  const router = useRouter();
  const [selected, setSelected] = useState<AccentKey>(initial ?? DEFAULT_ACCENT);
  const [busy, setBusy] = useState<AccentKey | null>(null);

  async function pick(key: AccentKey) {
    if (key === selected) return;
    const previous = selected;
    setSelected(key);
    setBusy(key);

    // Optimistic in-place preview so the swatch + everything tinted by the
    // accent (badges, links, etc) update before the round-trip lands.
    if (typeof document !== "undefined") {
      document.documentElement.style.setProperty(
        "--color-accent",
        `oklch(${ACCENT_PRESETS[key].oklch})`,
      );
    }

    try {
      const res = await fetch("/api/account/accent", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accent_color: key === DEFAULT_ACCENT ? null : key,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      toast.success(`Accent set to ${ACCENT_PRESETS[key].label}`);
      // Drop the inline override so the SSR <style> from layout (now rebuilt
      // with the saved value) takes back over without a flash.
      if (typeof document !== "undefined") {
        document.documentElement.style.removeProperty("--color-accent");
      }
      router.refresh();
    } catch (err) {
      // Roll back the optimistic preview.
      setSelected(previous);
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty(
          "--color-accent",
          `oklch(${ACCENT_PRESETS[previous].oklch})`,
        );
      }
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)] p-5">
      <div className="mb-3 flex items-center gap-2">
        <Palette className="h-4 w-4 text-[var(--color-fg-muted)]" />
        <h2 className="text-sm font-semibold">Accent color</h2>
      </div>
      <p className="mb-4 text-xs text-[var(--color-fg-muted)]">
        Used for highlights, focus rings, badges, and the active state across the app.
        Synced to your account so it follows you between devices.
      </p>
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
        {ACCENT_KEYS.map((key) => {
          const preset = ACCENT_PRESETS[key];
          const active = selected === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => pick(key)}
              disabled={busy !== null}
              aria-label={preset.label}
              aria-pressed={active}
              title={preset.label}
              className={cn(
                "group relative flex aspect-square items-center justify-center rounded-full border transition-transform",
                active
                  ? "border-[var(--color-fg)] scale-105"
                  : "border-transparent hover:scale-105",
                busy !== null && "cursor-wait opacity-90",
              )}
              style={{ background: `oklch(${preset.oklch})` }}
            >
              {active && (
                <Check
                  className="h-4 w-4"
                  style={{ color: "oklch(0.14 0.005 260)" }}
                  strokeWidth={3}
                />
              )}
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-[11px] text-[var(--color-fg-subtle)]">
        Selected:{" "}
        <span className="font-medium text-[var(--color-fg-muted)]">
          {ACCENT_PRESETS[selected].label}
        </span>
      </p>
    </section>
  );
}

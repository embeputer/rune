"use client";

import { CornerDownLeft, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function FollowUpBar({
  runeId,
  disabled,
  onSent,
}: {
  runeId: string;
  disabled: boolean;
  onSent?: () => void;
}) {
  const [value, setValue] = useState("");
  const [sending, setSending] = useState(false);

  async function send() {
    const message = value.trim();
    if (!message || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/runes/${runeId}/follow-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to send");
      setValue("");
      onSent?.();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  const isDisabled = disabled || sending;

  return (
    <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
      <div className="flex items-end gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 transition-colors focus-within:border-[var(--color-accent)]">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled ? "Agent is running…" : "Send a follow-up to the agent…"
          }
          disabled={isDisabled}
          rows={1}
          className="max-h-40 min-h-[1.5rem] flex-1 resize-none bg-transparent text-sm leading-relaxed text-[var(--color-fg)] placeholder:text-[var(--color-fg-subtle)] focus:outline-none disabled:opacity-60"
          style={{
            height: "auto",
          }}
          ref={(el) => {
            if (!el) return;
            el.style.height = "auto";
            el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
          }}
        />
        <button
          type="button"
          onClick={send}
          disabled={isDisabled || !value.trim()}
          aria-label="Send follow-up"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[var(--color-accent)] text-[var(--color-accent-fg)] transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="mt-1 flex items-center gap-1 px-1 text-[10px] text-[var(--color-fg-subtle)]">
        <CornerDownLeft className="h-2.5 w-2.5" /> to send · shift+enter for newline
      </div>
    </div>
  );
}

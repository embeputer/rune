"use client";

import type { RuneMessageRow } from "@rune/shared";
import { Loader2, Send, Square } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface Props {
  runeId: string;
  initialMessages: RuneMessageRow[];
}

export function RuneChatThread({ runeId, initialMessages }: Props) {
  const [messages, setMessages] = useState<RuneMessageRow[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [stopping, setStopping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = useMemo(
    () =>
      messages.some(
        (m) =>
          m.role === "assistant" && (m.status === "streaming" || m.status === "pending"),
      ),
    [messages],
  );

  const upsert = useCallback((msg: RuneMessageRow) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msg.id);
      if (idx === -1) {
        return [...prev, msg].sort(compareMessages);
      }
      const next = prev.slice();
      next[idx] = msg;
      return next;
    });
  }, []);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`rune-messages-${runeId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "rune_messages", filter: `rune_id=eq.${runeId}` },
        (payload) => upsert(payload.new as RuneMessageRow),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "rune_messages", filter: `rune_id=eq.${runeId}` },
        (payload) => upsert(payload.new as RuneMessageRow),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [runeId, upsert]);

  // Auto-scroll on new content.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Autosize textarea.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0";
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`;
  }, [draft]);

  async function send() {
    const content = draft.trim();
    if (!content || sending || isStreaming) return;
    setSending(true);
    try {
      const res = await fetch(`/api/runes/${runeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "send failed");
      setDraft("");
      // Realtime will fill the rows; insert optimistically too.
      if (j.user_message) upsert(j.user_message as RuneMessageRow);
      if (j.assistant_message) upsert(j.assistant_message as RuneMessageRow);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  async function stop() {
    if (stopping) return;
    setStopping(true);
    try {
      const res = await fetch(`/api/runes/${runeId}/cancel`, { method: "POST" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "stop failed");
      // Realtime will surface the status change; nudge local state too.
      setMessages((prev) =>
        prev.map((m) =>
          m.role === "assistant" && (m.status === "pending" || m.status === "streaming")
            ? { ...m, status: "error", error: m.error ?? "cancelled by user" }
            : m,
        ),
      );
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setStopping(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (isStreaming) {
        void stop();
      } else {
        void send();
      }
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-fg-subtle)]">
            Send a message to start the conversation.
          </div>
        ) : (
          messages.map((m) => <Message key={m.id} message={m} />)
        )}
      </div>
      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
        <div className="flex items-end gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 focus-within:border-[var(--color-border-strong)]">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)]"
            placeholder={
              isStreaming
                ? "Press stop to cancel, or wait for the response…"
                : "Send a message…"
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
          />
          {isStreaming ? (
            <Button
              size="sm"
              variant="danger"
              onClick={stop}
              disabled={stopping}
              title="Stop the running task"
            >
              {stopping ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3 w-3 fill-current" />
              )}
              Stop
            </Button>
          ) : (
            <Button size="sm" onClick={send} disabled={!draft.trim() || sending}>
              {sending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Send
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Message({ message }: { message: RuneMessageRow }) {
  if (message.role === "user") return <UserBubble message={message} />;
  return <AssistantText message={message} />;
}

/**
 * Sort by created_at ascending, but if two messages share an exact timestamp
 * (rare, but possible when the API stamps both rows in the same millisecond),
 * always render the user prompt before its assistant reply.
 */
function compareMessages(a: RuneMessageRow, b: RuneMessageRow): number {
  const cmp = a.created_at.localeCompare(b.created_at);
  if (cmp !== 0) return cmp;
  if (a.role === b.role) return 0;
  return a.role === "user" ? -1 : 1;
}

function UserBubble({ message }: { message: RuneMessageRow }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[78%] rounded-2xl bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm">
        <div className="whitespace-pre-wrap break-words leading-snug">{message.content}</div>
      </div>
    </div>
  );
}

function AssistantText({ message }: { message: RuneMessageRow }) {
  const isStreaming = message.status === "streaming" || message.status === "pending";
  const isError = message.status === "error";

  if (!message.content && isStreaming) {
    return (
      <div className="flex items-center gap-2 text-xs text-[var(--color-fg-subtle)]">
        <Loader2 className="h-3 w-3 animate-spin" />
        {message.status === "pending" ? "queued" : "thinking"}…
        <Elapsed since={message.created_at} />
      </div>
    );
  }

  if (!message.content && isError) {
    return (
      <div className="text-xs text-red-400">
        {message.error ?? "task failed"}
      </div>
    );
  }

  if (!message.content) {
    return <div className="text-xs text-[var(--color-fg-subtle)]">(no output)</div>;
  }

  return (
    <div className="space-y-1">
      <div className="prose-rune prose-rune--compact text-[var(--color-fg)]">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
      </div>
      {isStreaming && (
        <div className="flex items-center gap-1.5 text-[10px] text-[var(--color-fg-subtle)]">
          <Loader2 className="h-3 w-3 animate-spin" /> streaming
          <Elapsed since={message.created_at} />
        </div>
      )}
      {isError && message.error && (
        <div className="text-xs text-red-400">{message.error}</div>
      )}
    </div>
  );
}

/**
 * Tiny ticking clock so "thinking…" never feels frozen — updates every second
 * from the message's created_at. Format: "5s", "1m12s".
 */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const startedAt = useMemo(() => new Date(since).getTime(), [since]);
  const seconds = Math.max(0, Math.floor((now - startedAt) / 1000));
  const label = seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m${seconds % 60}s`;
  return <span className="tabular-nums">{label}</span>;
}

"use client";

import type { RuneMessageRow } from "@rune/shared";
import { Loader2, Send, User as UserIcon } from "lucide-react";
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const isStreaming = useMemo(
    () => messages.some((m) => m.role === "assistant" && (m.status === "streaming" || m.status === "pending")),
    [messages],
  );

  const upsert = useCallback((msg: RuneMessageRow) => {
    setMessages((prev) => {
      const idx = prev.findIndex((m) => m.id === msg.id);
      if (idx === -1) return [...prev, msg].sort((a, b) => a.created_at.localeCompare(b.created_at));
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
    if (!content || sending) return;
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

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
        {messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-sm text-[var(--color-fg-subtle)]">
            Send a message to start the conversation.
          </div>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
      </div>
      <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-bg-elev)] px-4 py-3">
        <div className="flex items-end gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-2 focus-within:border-[var(--color-border-strong)]">
          <textarea
            ref={textareaRef}
            className="flex-1 resize-none bg-transparent px-2 py-1 text-sm text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)]"
            placeholder={
              isStreaming
                ? "Agent is replying… you can still type the next message"
                : "Send a message…"
            }
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
          />
          <Button size="sm" onClick={send} disabled={!draft.trim() || sending}>
            {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Send
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: RuneMessageRow }) {
  const isUser = message.role === "user";
  const isStreaming = message.role === "assistant" && (message.status === "streaming" || message.status === "pending");
  const isError = message.status === "error";

  return (
    <div className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
      {!isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)]/15 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          AI
        </div>
      )}
      <div
        className={`prose-rune prose-rune--compact max-w-[78%] rounded-lg px-3.5 py-2.5 text-sm shadow-sm ${
          isUser
            ? "bg-[var(--color-accent)]/12 text-[var(--color-fg)]"
            : "border border-[var(--color-border)] bg-[var(--color-bg-elev)] text-[var(--color-fg)]"
        } ${isError ? "border-red-500/40" : ""}`}
      >
        {message.content ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content}</ReactMarkdown>
        ) : isStreaming ? (
          <div className="flex items-center gap-2 text-xs text-[var(--color-fg-subtle)]">
            <Loader2 className="h-3 w-3 animate-spin" /> {message.status === "pending" ? "queued" : "thinking"}…
          </div>
        ) : (
          <div className="text-xs text-[var(--color-fg-subtle)]">(empty)</div>
        )}
        {isError && message.error && (
          <div className="mt-2 text-xs text-red-400">{message.error}</div>
        )}
        {isStreaming && message.content && (
          <div className="mt-1 flex items-center gap-1.5 text-[10px] text-[var(--color-fg-subtle)]">
            <Loader2 className="h-3 w-3 animate-spin" /> streaming
          </div>
        )}
      </div>
      {isUser && (
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-bg-elev-2)] text-[var(--color-fg-muted)]">
          <UserIcon className="h-3.5 w-3.5" />
        </div>
      )}
    </div>
  );
}

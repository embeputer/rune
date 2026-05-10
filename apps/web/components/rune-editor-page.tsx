"use client";

import {
  RUNTIME_LABELS,
  RUNTIME_IDS,
  type RuneMessageRow,
  type RuneMode,
  type RuneStatus,
  type RuntimeId,
} from "@rune/shared";
import { FileText, MessageSquare, Play, Square } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { FollowUpBar } from "@/components/follow-up-bar";
import { RuneChatThread } from "@/components/rune-chat-thread";
import { RuneSidePanel } from "@/components/rune-side-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

const Editor = dynamic(() => import("@/components/markdown-editor"), { ssr: false });

const STATUS_VARIANT: Record<RuneStatus, "default" | "outline" | "warn" | "success" | "danger"> = {
  idle: "outline",
  queued: "default",
  running: "warn",
  done: "success",
  error: "danger",
};

interface RuneInit {
  id: string;
  slug: string;
  title: string;
  body: string;
  runtime: RuntimeId;
  status: RuneStatus;
  mode: RuneMode;
  output: string | null;
}

interface ProjectInit {
  id: string;
  name: string;
  slug: string;
  localPath: string;
  githubRepo: string | null;
  isScratch: boolean;
}

export function RuneEditorPage({
  rune,
  project,
  cloudReady,
  initialMessages,
  onlineGatewayId,
  onlineGatewayToken,
}: {
  rune: RuneInit;
  project: ProjectInit;
  cloudReady: boolean;
  initialMessages: RuneMessageRow[];
  onlineGatewayId: string | null;
  onlineGatewayToken: string | null;
}) {
  const [title, setTitle] = useState(rune.title);
  const [body, setBody] = useState(rune.body);
  const [runtime, setRuntime] = useState<RuntimeId>(rune.runtime);
  const [status, setStatus] = useState<RuneStatus>(rune.status);
  const [output, setOutput] = useState<string>(rune.output ?? "");
  const [mode, setMode] = useState<RuneMode>(rune.mode);
  const [running, setRunning] = useState(false);
  const dirtyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(
    async (patch: { title?: string; body?: string; runtime?: RuntimeId; mode?: RuneMode }) => {
      const res = await fetch(`/api/runes/${rune.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        toast.error(j?.error ?? "Save failed");
      }
    },
    [rune.id],
  );

  function scheduleSave(patch: { title?: string; body?: string; runtime?: RuntimeId; mode?: RuneMode }) {
    if (dirtyTimer.current) clearTimeout(dirtyTimer.current);
    dirtyTimer.current = setTimeout(() => persist(patch), 700);
  }

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`rune-${rune.id}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "runes", filter: `id=eq.${rune.id}` },
        (payload) => {
          const next = payload.new as { status?: RuneStatus; output?: string | null; mode?: RuneMode };
          if (next.status) setStatus(next.status);
          if (typeof next.output === "string") setOutput(next.output);
          if (next.mode) setMode(next.mode);
          if (next.status && (next.status === "done" || next.status === "error")) {
            setRunning(false);
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [rune.id]);

  async function run() {
    setRunning(true);
    setOutput("");
    setStatus("queued");
    const res = await fetch(`/api/runes/${rune.id}/execute`, { method: "POST" });
    if (!res.ok) {
      const j = await res.json().catch(() => null);
      toast.error(j?.error ?? "Failed to enqueue");
      setRunning(false);
      setStatus("idle");
      return;
    }
    toast.success("Rune queued");
  }

  function flipMode(next: RuneMode) {
    if (next === mode) return;
    setMode(next);
    void persist({ mode: next });
  }

  const isBusy = running || status === "running" || status === "queued";

  return (
    <div className="grid flex-1 grid-rows-[auto_1fr] overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-6 py-2.5">
        <Breadcrumb
          projectName={project.name}
          projectSlug={project.slug}
          title={title}
          onTitleChange={(v) => {
            setTitle(v);
            scheduleSave({ title: v });
          }}
          status={status}
        />
        <div className="ml-auto flex items-center gap-2">
          <ModeToggle mode={mode} onChange={flipMode} />
          <Select
            value={runtime}
            onValueChange={(v) => {
              const r = v as RuntimeId;
              setRuntime(r);
              scheduleSave({ runtime: r });
            }}
          >
            <SelectTrigger className="h-8 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RUNTIME_IDS.map((id) => {
                const disabled =
                  (id === "cursor-cloud" && !cloudReady) ||
                  (mode === "chat" && id === "cursor-cloud");
                return (
                  <SelectItem key={id} value={id} disabled={disabled}>
                    {RUNTIME_LABELS[id]}
                    {id === "cursor-cloud" && mode === "chat"
                      ? " (chat is local-only)"
                      : disabled
                        ? " (link a repo)"
                        : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          {mode === "doc" && (
            <Button size="sm" onClick={run} disabled={running}>
              {running ? (
                <>
                  <Square className="h-3.5 w-3.5" /> Running…
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5" /> Run
                </>
              )}
            </Button>
          )}
        </div>
      </div>

      {mode === "doc" ? (
        <DocLayout
          isScratch={project.isScratch}
          runeId={rune.id}
          status={status}
          body={body}
          output={output}
          onBodyChange={(v) => {
            setBody(v);
            scheduleSave({ body: v });
          }}
          isBusy={isBusy}
        />
      ) : (
        <ChatLayout
          runeId={rune.id}
          projectId={project.id}
          cwd={project.localPath}
          githubRepo={project.githubRepo}
          gatewayId={onlineGatewayId}
          gatewayToken={onlineGatewayToken}
          initialMessages={initialMessages}
        />
      )}
    </div>
  );
}

/**
 * Top-bar breadcrumb: `project / <click-to-edit rune title> [status]`.
 *
 * The title is rendered as plain text by default. Clicking it swaps in an
 * input that's auto-focused and selects all the existing text, so the user
 * can either replace or edit. Pressing Enter or blurring commits; Escape
 * cancels.
 */
function Breadcrumb({
  projectName,
  projectSlug,
  title,
  onTitleChange,
  status,
}: {
  projectName: string;
  projectSlug: string;
  title: string;
  onTitleChange: (next: string) => void;
  status: RuneStatus;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keep the local draft in sync if the parent updates the title (e.g. from
  // a realtime row patch) while we're not actively editing.
  useEffect(() => {
    if (!editing) setDraft(title);
  }, [title, editing]);

  function startEditing() {
    setDraft(title);
    setEditing(true);
    // Focus + select-all on the next tick so the input is mounted.
    requestAnimationFrame(() => {
      const el = inputRef.current;
      if (!el) return;
      el.focus();
      el.select();
    });
  }

  function commit() {
    setEditing(false);
    const next = draft.trim();
    if (next && next !== title) onTitleChange(next);
    else setDraft(title);
  }

  function cancel() {
    setDraft(title);
    setEditing(false);
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Link
        href={`/projects/${projectSlug}`}
        className="shrink-0 truncate text-sm text-[var(--color-fg-muted)] transition hover:text-[var(--color-fg)]"
        title={projectName}
      >
        {projectName}
      </Link>
      <span className="shrink-0 text-sm text-[var(--color-fg-subtle)]">/</span>
      {editing ? (
        <input
          ref={inputRef}
          className="min-w-[10rem] max-w-md flex-1 rounded-md border border-[var(--color-border-strong)] bg-[var(--color-bg)] px-1.5 py-0.5 text-base font-semibold text-[var(--color-fg)] outline-none focus:border-[var(--color-accent)]"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          placeholder="Untitled rune"
          spellCheck={false}
          aria-label="Rune title"
        />
      ) : (
        <button
          type="button"
          onClick={startEditing}
          className="min-w-0 max-w-md truncate rounded-md px-1.5 py-0.5 text-left text-base font-semibold text-[var(--color-fg)] transition hover:bg-[var(--color-bg-elev-2)]"
          title="Click to rename"
        >
          {title || (
            <span className="text-[var(--color-fg-subtle)]">Untitled rune</span>
          )}
        </button>
      )}
      <Badge variant={STATUS_VARIANT[status]} className="shrink-0">
        {status}
      </Badge>
    </div>
  );
}

function ModeToggle({ mode, onChange }: { mode: RuneMode; onChange: (next: RuneMode) => void }) {
  return (
    <div
      className="flex items-center rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5"
      role="tablist"
      aria-label="Rune mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === "doc"}
        className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs font-medium transition ${
          mode === "doc"
            ? "bg-[var(--color-bg-elev-2)] text-[var(--color-fg)]"
            : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        }`}
        onClick={() => onChange("doc")}
      >
        <FileText className="h-3.5 w-3.5" /> Doc
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === "chat"}
        className={`flex items-center gap-1.5 rounded-[5px] px-2.5 py-1 text-xs font-medium transition ${
          mode === "chat"
            ? "bg-[var(--color-bg-elev-2)] text-[var(--color-fg)]"
            : "text-[var(--color-fg-muted)] hover:text-[var(--color-fg)]"
        }`}
        onClick={() => onChange("chat")}
      >
        <MessageSquare className="h-3.5 w-3.5" /> Chat
      </button>
    </div>
  );
}

function DocLayout({
  isScratch,
  runeId,
  status,
  body,
  output,
  onBodyChange,
  isBusy,
}: {
  isScratch: boolean;
  runeId: string;
  status: RuneStatus;
  body: string;
  output: string;
  onBodyChange: (v: string) => void;
  isBusy: boolean;
}) {
  return (
    <div className="grid min-h-0 grid-cols-2 overflow-hidden">
      <div className="flex min-h-0 flex-col border-r border-[var(--color-border)]">
        <div className="px-6 pt-3 text-[10px] uppercase tracking-widest text-[var(--color-fg-subtle)]">
          prompt
        </div>
        <div className="min-h-0 flex-1 overflow-hidden px-6 pb-3">
          <Editor value={body} onChange={onBodyChange} />
        </div>
      </div>
      <div className="flex min-h-0 flex-col overflow-hidden">
        {isScratch ? (
          <>
            <OutputPane status={status} output={output} />
            <FollowUpBar runeId={runeId} disabled={isBusy} />
          </>
        ) : (
          <>
            <div className="px-6 pt-3 text-[10px] uppercase tracking-widest text-[var(--color-fg-subtle)]">
              preview
            </div>
            <div className="prose-rune min-h-0 flex-1 overflow-y-auto px-6 pb-6">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {body || "*Empty rune…*"}
              </ReactMarkdown>
            </div>
            {output && (
              <div className="border-t border-[var(--color-border)] bg-[var(--color-bg)]">
                <div className="flex items-center justify-between px-6 pt-2 text-[10px] uppercase tracking-widest text-[var(--color-fg-subtle)]">
                  <span>output</span>
                  <span>{status}</span>
                </div>
                <div className="prose-rune prose-rune--compact max-h-64 overflow-y-auto px-6 py-3 text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
                </div>
              </div>
            )}
            <FollowUpBar runeId={runeId} disabled={isBusy} />
          </>
        )}
      </div>
    </div>
  );
}

function ChatLayout({
  runeId,
  projectId,
  cwd,
  githubRepo,
  gatewayId,
  gatewayToken,
  initialMessages,
}: {
  runeId: string;
  projectId: string;
  cwd: string;
  githubRepo: string | null;
  gatewayId: string | null;
  gatewayToken: string | null;
  initialMessages: RuneMessageRow[];
}) {
  return (
    <div className="flex min-h-0 overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">
        <RuneChatThread runeId={runeId} initialMessages={initialMessages} />
      </div>
      <RuneSidePanel
        runeId={runeId}
        projectId={projectId}
        cwd={cwd}
        githubRepo={githubRepo}
        gatewayId={gatewayId}
        gatewayToken={gatewayToken}
      />
    </div>
  );
}

function OutputPane({ status, output }: { status: RuneStatus; output: string }) {
  return (
    <>
      <div className="flex items-center justify-between px-6 pt-3 text-[10px] uppercase tracking-widest text-[var(--color-fg-subtle)]">
        <span>output</span>
        <span>{status}</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4 pt-2">
        {output ? (
          <div className="prose-rune text-sm">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-[var(--color-fg-subtle)]">
            {status === "running" || status === "queued"
              ? `${status}…`
              : "Run the rune to see output here."}
          </div>
        )}
      </div>
    </>
  );
}

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
import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { FollowUpBar } from "@/components/follow-up-bar";
import { RuneChatThread } from "@/components/rune-chat-thread";
import { RuneSidePanel } from "@/components/rune-side-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
}: {
  rune: RuneInit;
  project: ProjectInit;
  cloudReady: boolean;
  initialMessages: RuneMessageRow[];
  onlineGatewayId: string | null;
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
      <div className="flex flex-wrap items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-6 py-3">
        <Input
          className="max-w-md text-base font-semibold"
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            scheduleSave({ title: e.target.value });
          }}
          placeholder="Untitled rune"
        />
        <Badge variant={STATUS_VARIANT[status]}>{status}</Badge>
        <ModeToggle mode={mode} onChange={flipMode} />
        <div className="ml-auto flex items-center gap-2">
          <Select
            value={runtime}
            onValueChange={(v) => {
              const r = v as RuntimeId;
              setRuntime(r);
              scheduleSave({ runtime: r });
            }}
          >
            <SelectTrigger className="w-44">
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
            <Button onClick={run} disabled={running}>
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
          initialMessages={initialMessages}
        />
      )}
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
  initialMessages,
}: {
  runeId: string;
  projectId: string;
  cwd: string;
  githubRepo: string | null;
  gatewayId: string | null;
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

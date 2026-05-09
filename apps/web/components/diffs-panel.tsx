"use client";

import { GitCommit, GitPullRequest, Loader2, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  commitGit,
  fetchGatewayToken,
  getGitStatus,
  openPullRequest,
  type GitStatusResponse,
} from "@/lib/gateway-client";
import { createClient } from "@/lib/supabase/client";

interface Props {
  projectId: string;
  githubRepo: string | null;
  gatewayId: string | null;
}

export function DiffsPanel({ projectId, githubRepo, gatewayId }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [status, setStatus] = useState<GitStatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commitMessage, setCommitMessage] = useState("");
  const [committing, setCommitting] = useState(false);
  const [opening, setOpening] = useState(false);

  const tokenRef = useRef<string | null>(null);
  tokenRef.current = token;

  // Fetch the gateway client_token once we know which gateway is online.
  useEffect(() => {
    if (!gatewayId) {
      setToken(null);
      setTokenError(null);
      return;
    }
    let cancelled = false;
    fetchGatewayToken(gatewayId)
      .then((r) => {
        if (cancelled) return;
        setToken(r.token);
        setTokenError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        setTokenError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [gatewayId]);

  const refresh = useCallback(async () => {
    const t = tokenRef.current;
    if (!t) return;
    setLoading(true);
    setError(null);
    try {
      const s = await getGitStatus(projectId, t);
      setStatus(s);
    } catch (err) {
      setError((err as Error).message);
      setStatus(null);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Initial + 4s polling while we have a token.
  useEffect(() => {
    if (!token) return;
    void refresh();
    const id = setInterval(() => {
      void refresh();
    }, 4000);
    return () => clearInterval(id);
  }, [token, refresh]);

  async function commit() {
    if (!token) return;
    const message = commitMessage.trim();
    if (!message) return;
    setCommitting(true);
    try {
      await commitGit(projectId, token, { message });
      toast.success("Committed");
      setCommitMessage("");
      await refresh();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setCommitting(false);
    }
  }

  async function openPr() {
    if (!token || !githubRepo) return;
    setOpening(true);
    try {
      const supabase = createClient();
      const { data: sess } = await supabase.auth.getSession();
      // GitHub provider_token (only present when user signed in with GitHub
      // and granted `repo`). Falls back to gh CLI on the gateway.
      const githubToken =
        (sess.session as unknown as { provider_token?: string | null })?.provider_token ?? null;
      const title = commitMessage.trim() || `Updates from Rune`;
      const result = await openPullRequest(projectId, token, {
        title,
        body: "",
        github_token: githubToken,
      });
      if (result.url) {
        toast.success("PR opened");
        window.open(result.url, "_blank", "noopener");
      } else {
        toast.success("PR opened");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setOpening(false);
    }
  }

  const fileCount = status?.files.length ?? 0;
  const ableToCommit = Boolean(token) && fileCount > 0 && commitMessage.trim().length > 0;
  const repoLinked = Boolean(githubRepo);
  const ableToOpenPr = Boolean(token) && repoLinked;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2 text-xs">
        <span className="font-mono text-[var(--color-fg-muted)]">
          {status?.branch ? status.branch : "—"}
        </span>
        {status && status.isRepo && (
          <span className="text-[var(--color-fg-subtle)]">
            {fileCount === 0 ? "clean" : `${fileCount} change${fileCount === 1 ? "" : "s"}`}
            {status.ahead > 0 ? ` · ↑${status.ahead}` : ""}
            {status.behind > 0 ? ` · ↓${status.behind}` : ""}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={refresh} title="Refresh">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!gatewayId ? (
          <EmptyState>Start your gateway to see diffs.</EmptyState>
        ) : tokenError ? (
          <EmptyState tone="error">{tokenError}</EmptyState>
        ) : !token ? (
          <EmptyState>Connecting to gateway…</EmptyState>
        ) : error ? (
          <EmptyState tone="error">{error}</EmptyState>
        ) : !status ? (
          <EmptyState>Loading…</EmptyState>
        ) : !status.isRepo ? (
          <EmptyState>This project folder isn’t a git repository.</EmptyState>
        ) : status.files.length === 0 ? (
          <EmptyState>No changes. Working tree is clean.</EmptyState>
        ) : (
          <DiffView status={status} />
        )}
      </div>

      <div className="shrink-0 space-y-2 border-t border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-2">
        <input
          type="text"
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1.5 text-xs text-[var(--color-fg)] outline-none placeholder:text-[var(--color-fg-subtle)] focus:border-[var(--color-border-strong)]"
          placeholder="Commit message"
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void commit();
          }}
        />
        <div className="flex items-center gap-2">
          <Button size="sm" disabled={!ableToCommit || committing} onClick={commit}>
            {committing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <GitCommit className="h-3.5 w-3.5" />
            )}
            Commit
          </Button>
          <div className="relative flex-1" title={!repoLinked ? "Link a repo to use these" : undefined}>
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={!ableToOpenPr || opening}
              onClick={openPr}
            >
              {opening ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GitPullRequest className="h-3.5 w-3.5" />
              )}
              Make PR
            </Button>
          </div>
        </div>
        {!repoLinked && (
          <div className="text-[10px] text-[var(--color-fg-subtle)]">
            Link a GitHub repo on this project to enable PRs.
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyState({
  children,
  tone = "info",
}: {
  children: React.ReactNode;
  tone?: "info" | "error";
}) {
  return (
    <div
      className={`flex h-full items-center justify-center px-4 text-center text-xs ${
        tone === "error" ? "text-red-400" : "text-[var(--color-fg-subtle)]"
      }`}
    >
      {children}
    </div>
  );
}

interface DiffBlock {
  header: string;
  path: string;
  lines: { kind: "ctx" | "add" | "del" | "hunk" | "meta"; text: string }[];
}

function DiffView({ status }: { status: GitStatusResponse }) {
  const blocks = useMemo(() => splitDiff(status.diff), [status.diff]);
  if (blocks.length === 0) {
    // Show file list at minimum so user knows there are changes
    return (
      <div className="space-y-1 px-3 py-2 text-xs">
        {status.files.map((f) => (
          <div key={f.path} className="flex items-center gap-2 text-[var(--color-fg-muted)]">
            <span className="font-mono text-[10px] text-[var(--color-fg-subtle)]">{f.status}</span>
            <span className="truncate font-mono">{f.path}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3 px-2 py-2">
      {blocks.map((b, i) => (
        <div key={`${b.path}-${i}`} className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <div className="border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-1.5 font-mono text-[11px] text-[var(--color-fg-muted)]">
            {b.path}
          </div>
          <pre className="m-0 overflow-x-auto bg-[var(--color-bg)] px-0 py-1 font-mono text-[11px] leading-snug">
            {b.lines.map((l, idx) => (
              <div
                key={idx}
                className={
                  l.kind === "add"
                    ? "bg-green-500/10 text-green-300"
                    : l.kind === "del"
                      ? "bg-red-500/10 text-red-300"
                      : l.kind === "hunk"
                        ? "bg-[var(--color-bg-elev-2)] text-[var(--color-fg-muted)]"
                        : l.kind === "meta"
                          ? "text-[var(--color-fg-subtle)]"
                          : "text-[var(--color-fg-muted)]"
                }
              >
                <span className="px-3 whitespace-pre">{l.text}</span>
              </div>
            ))}
          </pre>
        </div>
      ))}
    </div>
  );
}

function splitDiff(diff: string): DiffBlock[] {
  if (!diff) return [];
  const blocks: DiffBlock[] = [];
  let current: DiffBlock | null = null;
  for (const rawLine of diff.split(/\r?\n/)) {
    const line = rawLine;
    if (line.startsWith("diff --git ")) {
      if (current) blocks.push(current);
      const match = /b\/(.+)$/.exec(line);
      const path = match?.[1] ?? line.replace(/^diff --git /, "");
      current = { header: line, path, lines: [{ kind: "meta", text: line }] };
      continue;
    }
    if (!current) {
      current = { header: "(diff)", path: "(diff)", lines: [] };
    }
    if (line.startsWith("@@")) {
      current.lines.push({ kind: "hunk", text: line });
    } else if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("index ") || line.startsWith("new file ") || line.startsWith("deleted file ") || line.startsWith("similarity ")) {
      current.lines.push({ kind: "meta", text: line });
    } else if (line.startsWith("+")) {
      current.lines.push({ kind: "add", text: line });
    } else if (line.startsWith("-")) {
      current.lines.push({ kind: "del", text: line });
    } else {
      current.lines.push({ kind: "ctx", text: line });
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

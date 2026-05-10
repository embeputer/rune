"use client";

import { ChevronLeft, ChevronRight, GitCompareArrows, TerminalSquare } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DiffsPanel } from "@/components/diffs-panel";
import { TerminalPanel } from "@/components/terminal-panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const MIN_WIDTH = 280;
const MAX_WIDTH = 720;
const DEFAULT_WIDTH = 380;
const COLLAPSED_WIDTH = 36;

type Tab = "diffs" | "terminal";

interface Props {
  runeId: string;
  projectId: string;
  cwd: string;
  githubRepo: string | null;
  gatewayId: string | null;
  /** Pre-fetched gateway client token (server-rendered). When present we skip
   *  the per-mount HTTP roundtrip to /api/gateways/:id/token. */
  gatewayToken: string | null;
  /** When true, fill the parent container's width and skip the resize handle
   *  + collapsed-strip UI. Used by the mobile drawer where the panel always
   *  renders full-width and there's nowhere to drag-resize anyway. */
  fluid?: boolean;
}

export function RuneSidePanel({
  runeId,
  projectId,
  cwd,
  githubRepo,
  gatewayId,
  gatewayToken,
  fluid = false,
}: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [tab, setTab] = useState<Tab>("diffs");
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

  const widthKey = useMemo(() => `rune-sidepanel-w:${runeId}`, [runeId]);
  const collapsedKey = useMemo(() => `rune-sidepanel-collapsed:${runeId}`, [runeId]);
  const tabKey = useMemo(() => `rune-sidepanel-tab:${runeId}`, [runeId]);

  // Hydrate from localStorage.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const w = Number(window.localStorage.getItem(widthKey));
    if (Number.isFinite(w) && w >= MIN_WIDTH && w <= MAX_WIDTH) setWidth(w);
    const c = window.localStorage.getItem(collapsedKey);
    if (c === "1") setCollapsed(true);
    const t = window.localStorage.getItem(tabKey);
    if (t === "diffs" || t === "terminal") setTab(t);
  }, [widthKey, collapsedKey, tabKey]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(widthKey, String(width));
  }, [widthKey, width]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(collapsedKey, collapsed ? "1" : "0");
  }, [collapsedKey, collapsed]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(tabKey, tab);
  }, [tabKey, tab]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (collapsed) return;
      e.preventDefault();
      dragRef.current = { startX: e.clientX, startWidth: width };
      const handle = e.currentTarget;
      handle.setPointerCapture(e.pointerId);
    },
    [collapsed, width],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragRef.current) return;
      const dx = dragRef.current.startX - e.clientX; // dragging left = wider
      const next = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, dragRef.current.startWidth + dx));
      setWidth(next);
    },
    [],
  );

  const onPointerUp = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }, []);

  if (collapsed && !fluid) {
    return (
      <div
        className="flex shrink-0 flex-col items-center gap-2 border-l border-[var(--color-border)] bg-[var(--color-bg-elev)] py-3"
        style={{ width: COLLAPSED_WIDTH }}
      >
        <button
          type="button"
          className="rounded-md p-1.5 text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg)]"
          onClick={() => setCollapsed(false)}
          title="Expand panel"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`rounded-md p-1.5 ${tab === "diffs" ? "bg-[var(--color-bg-elev-2)] text-[var(--color-fg)]" : "text-[var(--color-fg-muted)]"} hover:text-[var(--color-fg)]`}
          onClick={() => {
            setTab("diffs");
            setCollapsed(false);
          }}
          title="Diffs"
        >
          <GitCompareArrows className="h-4 w-4" />
        </button>
        <button
          type="button"
          className={`rounded-md p-1.5 ${tab === "terminal" ? "bg-[var(--color-bg-elev-2)] text-[var(--color-fg)]" : "text-[var(--color-fg-muted)]"} hover:text-[var(--color-fg)]`}
          onClick={() => {
            setTab("terminal");
            setCollapsed(false);
          }}
          title="Terminal"
        >
          <TerminalSquare className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex shrink-0 border-l border-[var(--color-border)]",
        fluid && "h-full w-full border-l-0",
      )}
      style={fluid ? undefined : { width }}
    >
      {/* Drag handle (desktop only — there's nothing to drag against in a
          fixed-width mobile drawer) */}
      {!fluid && (
        <div
          role="separator"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onKeyDown={(e) => {
            if (e.key === "ArrowLeft") setWidth((w) => Math.min(MAX_WIDTH, w + 16));
            if (e.key === "ArrowRight") setWidth((w) => Math.max(MIN_WIDTH, w - 16));
          }}
          className="group absolute left-0 top-0 z-10 flex h-full w-1.5 -translate-x-1/2 cursor-ew-resize items-center justify-center hover:bg-[var(--color-accent)]/30"
        >
          <div className="h-10 w-0.5 rounded bg-transparent group-hover:bg-[var(--color-accent)]" />
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col bg-[var(--color-bg)]">
        <div className="flex shrink-0 items-center gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 py-1.5">
          <TabButton active={tab === "diffs"} onClick={() => setTab("diffs")} icon={<GitCompareArrows className="h-3.5 w-3.5" />}>
            Diffs
          </TabButton>
          <TabButton active={tab === "terminal"} onClick={() => setTab("terminal")} icon={<TerminalSquare className="h-3.5 w-3.5" />}>
            Terminal
          </TabButton>
          {!fluid && (
            <div className="ml-auto flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                title="Collapse panel"
                onClick={() => setCollapsed(true)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          {tab === "diffs" ? (
            <DiffsPanel
              projectId={projectId}
              githubRepo={githubRepo}
              gatewayId={gatewayId}
              initialToken={gatewayToken}
            />
          ) : (
            <TerminalPanel
              cwd={cwd}
              gatewayId={gatewayId}
              initialToken={gatewayToken}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
        active
          ? "bg-[var(--color-bg-elev-2)] text-[var(--color-fg)]"
          : "text-[var(--color-fg-muted)] hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg)]"
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

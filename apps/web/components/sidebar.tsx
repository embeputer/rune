"use client";

import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Clock,
  Folder,
  FolderOpen,
  FolderPlus,
  Loader2,
  LogOut,
  MoreHorizontal,
  NotebookPen,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { GatewayStatus, type GatewaySummary } from "@/components/gateway-status";
import { ImportProjectDialog } from "@/components/import-project-dialog";
import { NewProjectDialog } from "@/components/new-project-dialog";
import { NewRuneDialog } from "@/components/new-rune-dialog";
import {
  RenameProjectDialog,
  type RenameProjectResult,
} from "@/components/rename-project-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/relative-time";
import { cn } from "@/lib/utils";

type SidebarProject = {
  id: string;
  name: string;
  slug: string;
  is_external: boolean;
  github_repo: string | null;
};

type SidebarRune = {
  id: string;
  project_id: string;
  slug: string;
  title: string;
  status: string | null;
  updated_at: string | null;
};

type RuneStatus = "idle" | "queued" | "running" | "done" | "error";

const STATUS_TONE: Record<RuneStatus, string> = {
  idle: "text-[var(--color-success)]",
  done: "text-[var(--color-success)]",
  queued: "text-[var(--color-warn)]",
  running: "text-[var(--color-warn)]",
  error: "text-[var(--color-danger)]",
};

function normalizeStatus(s: string | null | undefined): RuneStatus {
  if (s === "queued" || s === "running" || s === "done" || s === "error") return s;
  return "idle";
}

type ProjectCounts = {
  running: number;
  queued: number;
  error: number;
};

function computeCounts(runes: SidebarRune[]): ProjectCounts {
  const c: ProjectCounts = { running: 0, queued: 0, error: 0 };
  for (const r of runes) {
    const s = normalizeStatus(r.status);
    if (s === "running") c.running++;
    else if (s === "queued") c.queued++;
    else if (s === "error") c.error++;
  }
  return c;
}

export function deriveWorkspaceName(email: string): string {
  if (!email) return "rune";
  const local = email.split("@")[0] ?? email;
  return local.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 32) || "rune";
}

export interface SidebarProps {
  userEmail: string;
  username: string | null;
  avatarUrl: string | null;
  projects: SidebarProject[];
  runes: SidebarRune[];
  initialGateways: GatewaySummary[];
}

export function Sidebar({
  userEmail,
  username,
  avatarUrl,
  projects,
  runes,
  initialGateways,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps & {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}) {
  const router = useRouter();
  const segments = useSelectedLayoutSegments();
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [newRuneFor, setNewRuneFor] = useState<SidebarProject | null>(null);
  const [renameTarget, setRenameTarget] = useState<SidebarProject | null>(null);
  const [query, setQuery] = useState("");
  const [, setTick] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Hydrate collapsed-project state from localStorage on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("rune.sidebar.collapsed");
      if (!raw) return;
      const ids = JSON.parse(raw);
      if (Array.isArray(ids)) setCollapsed(new Set(ids.filter((x): x is string => typeof x === "string")));
    } catch {
      // ignore corrupt entry
    }
  }, []);

  function toggleCollapsed(projectId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      try {
        localStorage.setItem("rune.sidebar.collapsed", JSON.stringify(Array.from(next)));
      } catch {
        // localStorage may be disabled — collapse still works in-session
      }
      return next;
    });
  }

  // Refresh relative-time labels periodically without re-fetching.
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // Realtime — refresh server data when projects, runes, or the user's own
  // settings (e.g. username) change.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel("sidebar-stream")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "projects" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "runes" },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "user_settings" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [router]);

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    toast.success("Signed out");
    router.push("/login");
  }

  async function deleteProject(p: SidebarProject) {
    if (!confirm(`Delete "${p.name}"? Runes are removed from Rune; the folder on disk is left alone.`)) {
      return;
    }
    const res = await fetch(`/api/projects/${p.id}`, { method: "DELETE" });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      toast.error(json.error ?? "Delete failed");
      return;
    }
    toast.success("Project deleted");
    router.refresh();
    // If we were viewing the deleted project, bounce home.
    if (segments[0] === "projects" && segments[1] === p.slug) {
      router.push("/scratchbook");
    }
  }

  function applyRename(next: RenameProjectResult) {
    // The realtime channel will fire router.refresh; nothing else to do here,
    // but if the active project's slug changed we follow the new URL.
    if (renameTarget && segments[0] === "projects" && segments[1] === renameTarget.slug) {
      const tail = segments.slice(2).join("/");
      router.push(`/projects/${next.slug}${tail ? `/${tail}` : ""}`);
    }
    router.refresh();
  }

  const isScratchbook = segments[0] === "scratchbook";
  const activeProjectSlug = segments[0] === "projects" ? segments[1] ?? null : null;
  const activeRuneSlug = segments[0] === "projects" && segments[2] === "runes" ? segments[3] ?? null : null;

  const workspaceName = useMemo(
    () => username?.trim() || deriveWorkspaceName(userEmail),
    [username, userEmail],
  );

  // Group runes by project_id (already ordered by updated_at desc from server).
  const runesByProject = useMemo(() => {
    const map = new Map<string, SidebarRune[]>();
    for (const r of runes) {
      const list = map.get(r.project_id) ?? [];
      list.push(r);
      map.set(r.project_id, list);
    }
    return map;
  }, [runes]);

  // Filter projects + runes by query.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return projects.map((p) => ({
        project: p,
        runes: runesByProject.get(p.id) ?? [],
      }));
    }
    const results: { project: SidebarProject; runes: SidebarRune[] }[] = [];
    for (const p of projects) {
      const projectMatches = p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
      const projectRunes = runesByProject.get(p.id) ?? [];
      const matchedRunes = projectRunes.filter((r) => r.title.toLowerCase().includes(q));
      if (projectMatches || matchedRunes.length > 0) {
        results.push({ project: p, runes: projectMatches ? projectRunes : matchedRunes });
      }
    }
    return results;
  }, [projects, runesByProject, query]);

  return (
    <aside
      id="rune-sidebar"
      aria-hidden={!mobileOpen ? undefined : false}
      className={cn(
        // Base layout (shared across breakpoints).
        "flex flex-col gap-2 border-r border-[var(--color-border)] bg-[var(--color-bg-elev)] px-2 pt-2 pb-3",
        // Mobile: behave as an off-canvas drawer that slides in from the left.
        // Width is wider than desktop (280 vs 260) so the touch targets feel
        // less cramped, and `h-dvh` plays nice with mobile browser chrome.
        "fixed inset-y-0 left-0 z-50 h-dvh w-[280px] shadow-2xl transition-transform duration-200 ease-out",
        mobileOpen ? "translate-x-0" : "-translate-x-full",
        // Desktop: pin the sidebar back into the layout grid column.
        "md:static md:z-auto md:h-screen md:w-auto md:translate-x-0 md:shadow-none md:transition-none",
      )}
    >
      {/* Mobile-only header row with the close button. Hidden on md+ where
          the sidebar is permanent and a close affordance would be confusing. */}
      <div className="-mx-1 mb-1 flex items-center justify-end px-1 md:hidden">
        <button
          type="button"
          onClick={onMobileClose}
          aria-label="Close menu"
          className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg)]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Workspace selector */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="group flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-[var(--color-bg-elev-2)]"
          >
            <Avatar
              src={avatarUrl}
              fallback={workspaceName.charAt(0)}
              size={24}
              className="shrink-0"
            />
            <span className="min-w-0 flex-1 truncate text-base font-semibold tracking-tight">
              {workspaceName}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-[var(--color-fg-subtle)] group-hover:text-[var(--color-fg-muted)]" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[220px]">
          <DropdownMenuItem onSelect={() => setNewProjectOpen(true)}>
            <FolderPlus className="mr-2 h-4 w-4" /> Create project
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setImportOpen(true)}>
            <FolderOpen className="mr-2 h-4 w-4" /> Import folder
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => router.push("/scratchbook")}>
            <NotebookPen className="mr-2 h-4 w-4" /> Scratchbook
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => router.push("/account")}>
            <SettingsIcon className="mr-2 h-4 w-4" /> Account &amp; API keys
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={signOut}>
            <LogOut className="mr-2 h-4 w-4" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Search */}
      <div className="relative px-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-fg-subtle)]" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search"
          className="h-8 rounded-full border-[var(--color-border)] bg-[var(--color-bg)] pl-8 text-xs"
        />
      </div>

      {/* Scratchbook quick link */}
      <Link
        href="/scratchbook"
        className={cn(
          "mx-1 flex items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-[var(--color-bg-elev-2)]",
          isScratchbook && "bg-[var(--color-bg-elev-2)] text-[var(--color-fg)]",
        )}
      >
        <NotebookPen className="h-3.5 w-3.5 text-[var(--color-fg-muted)]" />
        <span>Scratchbook</span>
      </Link>

      {/* Projects + runes */}
      <nav className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-1 pt-1">
        {filtered.length === 0 && (
          <div className="px-2 py-1 text-xs text-[var(--color-fg-subtle)]">
            {projects.length === 0
              ? "No projects yet — use the workspace menu to create one."
              : "No matches."}
          </div>
        )}
        {filtered.map(({ project, runes: projectRunes }) => (
          <ProjectGroup
            key={project.id}
            project={project}
            runes={projectRunes}
            activeProjectSlug={activeProjectSlug}
            activeRuneSlug={activeRuneSlug}
            collapsed={collapsed.has(project.id) && !query.trim()}
            onToggleCollapsed={() => toggleCollapsed(project.id)}
            onNewRune={() => setNewRuneFor(project)}
            onRename={() => setRenameTarget(project)}
            onDelete={() => deleteProject(project)}
          />
        ))}
      </nav>

      {/* Footer: gateway status only — account actions live in the workspace
          dropdown at the top, so we don't repeat them here. */}
      <div className="px-1 pt-1">
        <GatewayStatus initial={initialGateways} />
      </div>

      <NewProjectDialog open={newProjectOpen} onOpenChange={setNewProjectOpen} />
      <ImportProjectDialog open={importOpen} onOpenChange={setImportOpen} />
      <NewRuneDialog
        open={newRuneFor !== null}
        onOpenChange={(o) => {
          if (!o) setNewRuneFor(null);
        }}
        projectId={newRuneFor?.id ?? null}
        projectSlug={newRuneFor?.slug ?? null}
      />
      <RenameProjectDialog
        open={renameTarget !== null}
        onOpenChange={(o) => {
          if (!o) setRenameTarget(null);
        }}
        project={
          renameTarget
            ? {
                id: renameTarget.id,
                name: renameTarget.name,
                slug: renameTarget.slug,
                is_external: renameTarget.is_external,
              }
            : null
        }
        onRenamed={applyRename}
      />
    </aside>
  );
}

function ProjectGroup({
  project,
  runes,
  activeProjectSlug,
  activeRuneSlug,
  collapsed,
  onToggleCollapsed,
  onNewRune,
  onRename,
  onDelete,
}: {
  project: SidebarProject;
  runes: SidebarRune[];
  activeProjectSlug: string | null;
  activeRuneSlug: string | null;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onNewRune: () => void;
  onRename: () => void;
  onDelete: () => void;
}) {
  const isActiveProject = activeProjectSlug === project.slug;
  const counts = useMemo(() => computeCounts(runes), [runes]);
  const inFlight = counts.running + counts.queued;
  const ChevronIcon = collapsed ? ChevronRight : ChevronDown;

  return (
    <div className="group/project space-y-0.5">
      <div className="flex items-center gap-1.5 px-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? `Expand ${project.name}` : `Collapse ${project.name}`}
          aria-expanded={!collapsed}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-fg-muted)] transition-colors hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg)]"
        >
          {/* Folder by default; swaps to chevron on project-row hover/focus */}
          <Folder className="h-3.5 w-3.5 group-hover/project:hidden group-focus-within/project:hidden" />
          <ChevronIcon className="hidden h-3.5 w-3.5 group-hover/project:block group-focus-within/project:block" />
        </button>
        <Link
          href={`/projects/${project.slug}`}
          className={cn(
            "min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-[var(--color-fg)] transition-colors hover:text-[var(--color-fg)]",
            !isActiveProject && "text-[oklch(0.92_0.005_260)]",
          )}
        >
          {project.name}
        </Link>
        {inFlight > 0 && (
          <span
            title={`${counts.running} running${counts.queued ? `, ${counts.queued} queued` : ""}`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-warn)]/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-warn)]"
          >
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
            {inFlight}
          </span>
        )}
        {counts.error > 0 && (
          <span
            title={`${counts.error} errored`}
            className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--color-danger)]/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-[var(--color-danger)]"
          >
            <AlertCircle className="h-2.5 w-2.5" />
            {counts.error}
          </span>
        )}
        <button
          type="button"
          onClick={onNewRune}
          aria-label={`New rune in ${project.name}`}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-fg-subtle)] opacity-0 transition-opacity hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg)] focus:opacity-100 group-hover/project:opacity-100"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${project.name} options`}
              className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--color-fg-subtle)] opacity-0 transition-opacity hover:bg-[var(--color-bg-elev-2)] hover:text-[var(--color-fg)] focus:opacity-100 group-hover/project:opacity-100 data-[state=open]:opacity-100"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={onNewRune}>
              <Plus className="mr-2 h-4 w-4" /> New rune
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onRename}>
              <Pencil className="mr-2 h-4 w-4" /> Rename
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={`/projects/${project.slug}/settings`}>
                <SettingsIcon className="mr-2 h-4 w-4" /> Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onDelete} className="text-[var(--color-danger)]">
              <Trash2 className="mr-2 h-4 w-4" /> Delete project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      {!collapsed &&
        (runes.length === 0 ? (
          <div className="px-2 py-0.5 pl-9 text-[11px] text-[var(--color-fg-subtle)]">
            No runes yet.
          </div>
        ) : (
          <ul className="space-y-px pl-5">
            {runes.map((r) => (
              <RuneRow
                key={r.id}
                rune={r}
                projectSlug={project.slug}
                active={isActiveProject && activeRuneSlug === r.slug}
              />
            ))}
          </ul>
        ))}
    </div>
  );
}

function Avatar({
  src,
  fallback,
  size,
  className,
}: {
  src: string | null;
  fallback: string;
  size: number;
  className?: string;
}) {
  const dim = { width: size, height: size } as const;
  return (
    <div
      className={cn(
        "overflow-hidden rounded-full border border-[var(--color-border-strong)]",
        className,
      )}
      style={dim}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <div
          className="flex h-full w-full items-center justify-center bg-[var(--color-accent)] font-semibold text-[var(--color-accent-fg)]"
          style={{ fontSize: Math.max(10, Math.round(size * 0.42)) }}
        >
          {fallback.charAt(0).toUpperCase() || "R"}
        </div>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: RuneStatus }) {
  const tone = STATUS_TONE[status];
  if (status === "running") {
    return <Loader2 className={cn("h-3 w-3 shrink-0 animate-spin", tone)} />;
  }
  if (status === "queued") {
    return <Clock className={cn("h-3 w-3 shrink-0", tone)} />;
  }
  if (status === "error") {
    return <AlertCircle className={cn("h-3 w-3 shrink-0", tone)} />;
  }
  if (status === "done") {
    return <CheckCircle2 className={cn("h-3 w-3 shrink-0", tone)} />;
  }
  // idle: keep the simple dot for visual quietness
  return (
    <span
      className={cn("ml-[3px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-success)]")}
    />
  );
}

function RuneRow({
  rune,
  projectSlug,
  active,
}: {
  rune: SidebarRune;
  projectSlug: string;
  active: boolean;
}) {
  const status = normalizeStatus(rune.status);
  const time = formatRelativeTime(rune.updated_at);
  return (
    <li>
      <Link
        href={`/projects/${projectSlug}/runes/${rune.slug}`}
        title={`${rune.title} — ${status}`}
        className={cn(
          "flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors hover:bg-[var(--color-bg-elev-2)]",
          active && "bg-[var(--color-bg-elev-2)] text-[var(--color-fg)]",
        )}
      >
        <span className="flex w-3 shrink-0 items-center justify-center">
          <StatusIcon status={status} />
        </span>
        <span className="min-w-0 flex-1 truncate">{rune.title}</span>
        {time && (
          <span className="shrink-0 text-[10px] tabular-nums text-[var(--color-fg-subtle)]">
            {time}
          </span>
        )}
      </Link>
    </li>
  );
}

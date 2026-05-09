"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RUNTIME_LABELS, type RuneStatus, type RuntimeId } from "@rune/shared";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { formatRelative } from "@/lib/utils";

type RuneSummary = {
  id: string;
  slug: string;
  title: string;
  status: RuneStatus;
  runtime: RuntimeId;
  updated_at: string;
};

const STATUS_VARIANT: Record<RuneStatus, "default" | "outline" | "warn" | "success" | "danger"> = {
  idle: "outline",
  queued: "default",
  running: "warn",
  done: "success",
  error: "danger",
};

export function ProjectRuneList({
  projectSlug,
  runes,
}: {
  projectSlug: string;
  runes: RuneSummary[];
}) {
  const router = useRouter();
  const [list, setList] = useState(runes);

  useEffect(() => {
    setList(runes);
  }, [runes]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`project-runes-${projectSlug}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "runes" },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectSlug, router]);

  if (list.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-bg-elev)] p-12 text-center text-sm text-[var(--color-fg-muted)]">
        <div className="text-base font-medium text-[var(--color-fg)]">No runes yet</div>
        <div>Click &ldquo;New rune&rdquo; to create your first task.</div>
      </div>
    );
  }

  return (
    <ul className="divide-y divide-[var(--color-border)] overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elev)]">
      {list.map((r) => (
        <li key={r.id}>
          <Link
            href={`/projects/${projectSlug}/runes/${r.slug}`}
            className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-[var(--color-bg-elev-2)]"
          >
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{r.title}</span>
                <Badge variant={STATUS_VARIANT[r.status]}>{r.status}</Badge>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-[var(--color-fg-subtle)]">
                <span>{RUNTIME_LABELS[r.runtime]}</span>
                <span>•</span>
                <span>updated {formatRelative(r.updated_at)}</span>
              </div>
            </div>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--color-fg-subtle)]" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

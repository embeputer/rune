import { Notebook } from "lucide-react";
import { Scratchbook } from "@/components/scratchbook";
import { createClient } from "@/lib/supabase/server";

export default async function ScratchbookPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: scratches } = await supabase
    .from("projects")
    .select("id, name, slug, local_path, created_at")
    .eq("is_scratch", true)
    .order("created_at", { ascending: false });

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 flex-col gap-1 border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-3 py-3 md:flex-row md:items-center md:justify-between md:gap-2 md:px-6 md:py-4">
        <div className="flex items-center gap-2">
          <Notebook className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <h1 className="text-base font-semibold md:text-lg">Scratchbook</h1>
        </div>
        <div className="text-[11px] leading-snug text-[var(--color-fg-subtle)] md:text-xs">
          Quick-start projects. Folder = project ID. Rename or relocate later.
        </div>
      </header>
      <Scratchbook scratches={scratches ?? []} />
    </div>
  );
}

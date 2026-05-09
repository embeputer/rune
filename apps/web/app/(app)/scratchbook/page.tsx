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
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-6 py-4">
        <div className="flex items-center gap-2">
          <Notebook className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <h1 className="text-lg font-semibold">Scratchbook</h1>
        </div>
        <div className="text-xs text-[var(--color-fg-subtle)]">
          Quick-start projects. Folder = project ID. Rename or relocate later.
        </div>
      </header>
      <Scratchbook scratches={scratches ?? []} />
    </div>
  );
}

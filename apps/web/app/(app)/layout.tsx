import { redirect } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { accentCss, isAccentKey } from "@/lib/accents";
import { createClient } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: projects }, { data: settings }] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, slug, is_external, github_repo")
      .eq("is_scratch", false)
      .order("created_at", { ascending: true }),
    supabase
      .from("user_settings")
      .select("username, avatar_url, accent_color")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const projectIds = (projects ?? []).map((p) => p.id);
  const { data: runes } = projectIds.length
    ? await supabase
        .from("runes")
        .select("id, project_id, slug, title, status, updated_at")
        .in("project_id", projectIds)
        .order("updated_at", { ascending: false })
    : { data: [] as never[] };

  const { data: gateways } = await supabase
    .from("gateways")
    .select("id, name, status, last_seen_at, capabilities")
    .order("created_at", { ascending: true });

  const accentOverride = accentCss(
    isAccentKey(settings?.accent_color) ? settings.accent_color : null,
  );

  return (
    <>
      {accentOverride && (
        // Inlined SSR override of the --color-accent CSS variable so the user's
        // chosen accent paints from the very first byte (no FOUC). When the
        // user hasn't picked one this is null and globals.css owns the value.
        <style dangerouslySetInnerHTML={{ __html: accentOverride }} />
      )}
      <div className="grid min-h-screen grid-cols-[260px_1fr]">
        <Sidebar
          userEmail={user.email ?? ""}
          username={settings?.username ?? null}
          avatarUrl={settings?.avatar_url ?? null}
          projects={projects ?? []}
          runes={runes ?? []}
          initialGateways={gateways ?? []}
        />
        <main className="flex min-h-screen flex-col overflow-hidden">{children}</main>
      </div>
    </>
  );
}

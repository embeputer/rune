import { Settings as SettingsIcon } from "lucide-react";
import { AccentCard } from "@/components/accent-card";
import { AvatarCard } from "@/components/avatar-card";
import { CursorKeyCard } from "@/components/cursor-key-card";
import { GatewayListCard } from "@/components/gateway-list-card";
import type { GatewaySummary } from "@/components/gateway-status";
import { PairGatewayCard } from "@/components/pair-gateway-card";
import { UsernameCard } from "@/components/username-card";
import { type AccentKey, isAccentKey } from "@/lib/accents";
import { createClient } from "@/lib/supabase/server";

function maskKey(key: string | null): string | null {
  if (!key) return null;
  if (key.length <= 6) return "•".repeat(key.length);
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

function emailHandle(email: string | null | undefined): string {
  if (!email) return "rune";
  const local = email.split("@")[0] ?? email;
  return local.toLowerCase().replace(/[^a-z0-9_-]/g, "-").slice(0, 32) || "rune";
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: settings }, { data: gateways }] = await Promise.all([
    supabase
      .from("user_settings")
      .select("cursor_api_key, username, avatar_url, accent_color, updated_at")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("gateways")
      .select("id, name, status, last_seen_at, capabilities")
      .order("created_at", { ascending: true }),
  ]);

  const masked = maskKey(settings?.cursor_api_key ?? null);
  const fallback = emailHandle(user.email);
  const initialChar = (settings?.username || fallback).charAt(0) || "R";
  const initialAccent: AccentKey | null = isAccentKey(settings?.accent_color)
    ? (settings.accent_color as AccentKey)
    : null;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-bg-elev)] px-6 py-4">
        <div className="flex items-center gap-2">
          <SettingsIcon className="h-4 w-4 text-[var(--color-fg-muted)]" />
          <h1 className="text-lg font-semibold">Account</h1>
        </div>
        <div className="text-xs text-[var(--color-fg-subtle)]">{user.email}</div>
      </header>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-6">
        <div className="mx-auto w-full max-w-2xl space-y-6">
          <AvatarCard
            initialUrl={settings?.avatar_url ?? null}
            userId={user.id}
            fallbackInitial={initialChar}
          />
          <UsernameCard initial={settings?.username ?? null} fallback={fallback} />
          <AccentCard initial={initialAccent} />
          <PairGatewayCard />
          <GatewayListCard initial={(gateways ?? []) as GatewaySummary[]} />
          <CursorKeyCard
            initialMasked={masked}
            initialSet={Boolean(settings?.cursor_api_key)}
            initialUpdatedAt={settings?.updated_at ?? null}
          />
        </div>
      </div>
    </div>
  );
}

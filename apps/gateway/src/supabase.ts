import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { type GatewayConfig, patchConfig } from "./config";

// Looser type — gateway code is the source of truth and we control all calls.
// Strict Database typing elsewhere (web + shared) keeps the schema honest.
export type RuneSupabase = SupabaseClient;

export async function makeSupabase(cfg: GatewayConfig): Promise<RuneSupabase> {
  // Important: do NOT pin a static `Authorization` header here. supabase-js
  // attaches the current session JWT to PostgREST/Realtime calls itself, and
  // a hard-coded global header would override the refreshed token after
  // `autoRefreshToken` rotates it — which is exactly what caused
  // "JWT expired" failures on long-lived gateways.
  const supabase = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
    auth: {
      persistSession: false,
      autoRefreshToken: true,
    },
  });
  const { data, error } = await supabase.auth.setSession({
    access_token: cfg.access_token,
    refresh_token: cfg.refresh_token,
  });
  if (error || !data?.session) {
    // Common cause: refresh_token itself has been revoked (re-paired from
    // the web app, gateway sat offline too long, or user signed out).
    // Surface a clear "please pair again" message instead of a generic 401.
    throw new Error(
      `Could not restore session: ${error?.message ?? "no session returned"}. ` +
        "Re-pair the gateway: open /account → Generate pairing token → `bun run apps/gateway/src/cli.ts login`.",
    );
  }
  // Persist rotated tokens back to disk so the next start doesn't fail with
  // an expired access_token even though we have a valid refresh_token.
  if (
    data.session.access_token !== cfg.access_token ||
    data.session.refresh_token !== cfg.refresh_token
  ) {
    await patchConfig({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token ?? cfg.refresh_token,
    });
  }
  // Keep ~/.rune/config.json in sync as supabase-js auto-refreshes during
  // long-lived sessions; otherwise a fresh `start` after >1h offline still
  // boots with stale tokens on disk.
  supabase.auth.onAuthStateChange((event, session) => {
    if (!session) return;
    if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") {
      patchConfig({
        access_token: session.access_token,
        refresh_token: session.refresh_token ?? cfg.refresh_token,
      }).catch((err) => {
        console.error("[supabase] failed to persist refreshed tokens:", err);
      });
    }
  });
  return supabase;
}

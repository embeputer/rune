import type { GatewayConfig } from "./config";
import type { RuneSupabase } from "./supabase";

type Listener = (snapshot: { cursorApiKey: string | null }) => void | Promise<void>;

/**
 * Caches per-user settings (currently just the Cursor API key) so we don't
 * hit Supabase on every cursor-cloud dispatch. Subscribes to realtime updates
 * so users can rotate their key from the web UI without restarting the gateway.
 */
export class UserSettingsCache {
  private cursorApiKey: string | null = null;
  private channel: ReturnType<RuneSupabase["channel"]> | null = null;
  private listeners = new Set<Listener>();

  constructor(
    private supabase: RuneSupabase,
    private cfg: GatewayConfig,
  ) {}

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  async start(): Promise<void> {
    await this.refetch();
    this.channel = this.supabase
      .channel(`gw-user-settings-${this.cfg.user_id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_settings",
          filter: `user_id=eq.${this.cfg.user_id}`,
        },
        async () => {
          await this.refetch();
        },
      )
      .subscribe();
  }

  async stop(): Promise<void> {
    if (this.channel) {
      try {
        await this.supabase.removeChannel(this.channel);
      } catch {}
      this.channel = null;
    }
  }

  getCursorApiKey(): string | null {
    return this.cursorApiKey;
  }

  private async refetch(): Promise<void> {
    const { data } = await this.supabase
      .from("user_settings")
      .select("cursor_api_key")
      .eq("user_id", this.cfg.user_id)
      .maybeSingle();
    const next = data?.cursor_api_key ?? null;
    if (next !== this.cursorApiKey) {
      this.cursorApiKey = next;
      console.log(
        `[gateway] cursor api key ${next ? "loaded" : "cleared"} from user settings`,
      );
      for (const fn of this.listeners) {
        try {
          await fn({ cursorApiKey: next });
        } catch (err) {
          console.error("[settings-listener]", err);
        }
      }
    }
  }
}

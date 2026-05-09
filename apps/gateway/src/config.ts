import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

export interface GatewayConfig {
  supabase_url: string;
  supabase_anon_key: string;
  access_token: string;
  refresh_token: string;
  user_id: string;
  gateway_id?: string;
  workspace_root: string;
  name?: string;
  /**
   * Random per-gateway secret used to authenticate browser → gateway requests
   * over `127.0.0.1:7777` (diffs / terminal). Mirrored into the `gateways` row
   * so the web app can fetch it via Supabase RLS.
   */
  client_token?: string;
}

export const CONFIG_DIR = join(homedir(), ".rune");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function defaultWorkspaceRoot(): string {
  return join(homedir(), "rune");
}

export async function readConfig(): Promise<GatewayConfig | null> {
  try {
    const raw = await readFile(CONFIG_PATH, "utf8");
    return JSON.parse(raw) as GatewayConfig;
  } catch {
    return null;
  }
}

export async function writeConfig(cfg: GatewayConfig): Promise<void> {
  await mkdir(dirname(CONFIG_PATH), { recursive: true });
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2), "utf8");
}

export async function patchConfig(patch: Partial<GatewayConfig>): Promise<GatewayConfig> {
  const current = (await readConfig()) ?? ({} as GatewayConfig);
  const next = { ...current, ...patch } as GatewayConfig;
  await writeConfig(next);
  return next;
}

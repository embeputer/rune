#!/usr/bin/env bun
import { hostname } from "node:os";
import { createInterface } from "node:readline";
import { createClient } from "@supabase/supabase-js";
import { startGateway } from "./index";
import {
  CONFIG_PATH,
  defaultWorkspaceRoot,
  patchConfig,
  readConfig,
  writeConfig,
  type GatewayConfig,
} from "./config";

const argv = process.argv.slice(2);
const command = argv[0];

async function main() {
  if (command === "login") {
    await login();
    return;
  }
  if (command === "start" || command === undefined) {
    await start();
    return;
  }
  if (command === "logout") {
    await logout();
    return;
  }
  if (command === "info") {
    await info();
    return;
  }
  if (command === "cursor-key") {
    await cursorKey(argv.slice(1));
    return;
  }
  console.log(`rune gateway — usage:
  rune login                     # paste a pairing token from /account → Pair a Gateway
  rune start [--workspace <p>]   # run the gateway daemon
  rune cursor-key <crsr_…>       # set your Cursor API key (in user_settings)
  rune cursor-key --clear        # remove your saved Cursor API key
  rune info                      # print current config (without secrets)
  rune logout                    # remove ~/.rune/config.json
`);
}

interface PairingPayload {
  v: number;
  supabase_url: string;
  supabase_anon_key: string;
  user_id: string;
  access_token: string;
  refresh_token: string;
}

function decodePairingToken(input: string): PairingPayload {
  const cleaned = input.trim();
  if (!cleaned) throw new Error("empty pairing token");
  let json: string;
  try {
    json = Buffer.from(cleaned, "base64").toString("utf8");
  } catch {
    throw new Error("pairing token isn't valid base64");
  }
  let payload: PairingPayload;
  try {
    payload = JSON.parse(json);
  } catch {
    throw new Error("pairing token JSON is malformed");
  }
  if (payload.v !== 1) throw new Error(`unsupported pairing token version ${payload.v}`);
  for (const k of [
    "supabase_url",
    "supabase_anon_key",
    "user_id",
    "access_token",
    "refresh_token",
  ] as const) {
    if (!payload[k] || typeof payload[k] !== "string") {
      throw new Error(`pairing token missing field "${k}"`);
    }
  }
  return payload;
}

async function login() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string) =>
    new Promise<string>((res) => rl.question(q, (a) => res(a.trim())));

  const existing = (await readConfig()) ?? ({} as Partial<GatewayConfig>);

  console.log("Generate a pairing token at http://localhost:3000/account → Pair a Gateway");
  const tokenInput = await ask("Paste pairing token: ");
  let payload: PairingPayload;
  try {
    payload = decodePairingToken(tokenInput);
  } catch (err) {
    console.error(`Login failed: ${(err as Error).message}`);
    rl.close();
    process.exit(1);
  }

  const workspaceRoot =
    process.env.RUNE_WORKSPACE_ROOT ||
    existing.workspace_root ||
    (await ask(`Workspace root [${defaultWorkspaceRoot()}]: `)) ||
    defaultWorkspaceRoot();
  const name = (await ask(`Gateway name [${hostname()}]: `)) || hostname();
  rl.close();

  // Verify the pasted session against Supabase before persisting.
  const supabase = createClient(payload.supabase_url, payload.supabase_anon_key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: setData, error: setErr } = await supabase.auth.setSession({
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
  });
  if (setErr || !setData.session) {
    console.error(`Login failed: ${setErr?.message ?? "session rejected"}`);
    process.exit(1);
  }

  const cfg: GatewayConfig = {
    supabase_url: payload.supabase_url,
    supabase_anon_key: payload.supabase_anon_key,
    access_token: setData.session.access_token,
    refresh_token: setData.session.refresh_token,
    user_id: payload.user_id,
    workspace_root: workspaceRoot,
    name,
  };
  await writeConfig(cfg);

  console.log(`✓ Paired as ${setData.user?.email ?? payload.user_id}`);
  console.log(`  Config: ${CONFIG_PATH}`);
  console.log(`  Workspace: ${workspaceRoot}`);
  console.log("Run `pnpm dev:gateway` (or `bun run apps/gateway/src/cli.ts start`) to start.");
}

async function cursorKey(args: string[]): Promise<void> {
  const cfg = await readConfig();
  if (!cfg) {
    console.error("Not logged in. Run `bun run login` first.");
    process.exit(1);
  }
  const clear = args.includes("--clear");
  const key = clear ? null : args.find((a) => !a.startsWith("--")) ?? "";
  if (!clear && !key) {
    console.error("Usage: rune cursor-key <crsr_…>  |  rune cursor-key --clear");
    process.exit(1);
  }
  if (!clear && key && !/^crsr_[A-Za-z0-9_-]+$/.test(key)) {
    console.error("Cursor API keys start with `crsr_`. Get one at https://cursor.com/dashboard");
    process.exit(1);
  }
  const supabase = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${cfg.access_token}` } },
  });
  const { error } = await supabase
    .from("user_settings")
    .upsert(
      { user_id: cfg.user_id, cursor_api_key: clear ? null : key },
      { onConflict: "user_id" },
    );
  if (error) {
    console.error("Failed:", error.message);
    process.exit(1);
  }
  console.log(clear ? "✓ Cursor API key cleared" : "✓ Cursor API key saved");
}

async function start() {
  const args = parseFlags(argv.slice(1));
  let cfg = await readConfig();
  if (!cfg) {
    console.error(
      `No config at ${CONFIG_PATH}. Run \`bun run login\` first (or set RUNE_SUPABASE_URL + RUNE_SUPABASE_ANON_KEY env vars).`,
    );
    process.exit(1);
  }
  if (args.workspace) {
    cfg = await patchConfig({ workspace_root: args.workspace });
  }
  await startGateway(cfg);
}

async function logout() {
  const fs = await import("node:fs/promises");
  await fs.rm(CONFIG_PATH, { force: true });
  console.log("✓ Removed config");
}

async function info() {
  const cfg = await readConfig();
  if (!cfg) {
    console.log("(no config)");
    return;
  }
  console.log(`Config: ${CONFIG_PATH}`);
  console.log(`Supabase: ${cfg.supabase_url}`);
  console.log(`User:     ${cfg.user_id}`);
  console.log(`Gateway:  ${cfg.gateway_id ?? "(unregistered)"}`);
  console.log(`Workspace:${cfg.workspace_root}`);

  const supabase = createClient(cfg.supabase_url, cfg.supabase_anon_key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${cfg.access_token}` } },
  });
  const { data } = await supabase
    .from("user_settings")
    .select("cursor_api_key")
    .eq("user_id", cfg.user_id)
    .maybeSingle();
  const k = data?.cursor_api_key;
  console.log(`Cursor key: ${k ? `${k.slice(0, 4)}…${k.slice(-4)}` : "(not set)"}`);
}

function parseFlags(args: string[]): { workspace?: string } {
  const out: { workspace?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--workspace" || args[i] === "-w") {
      out.workspace = args[++i];
    }
  }
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

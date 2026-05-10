import type { GatewayCapabilities } from "@rune/shared";
import { randomUUID } from "node:crypto";
import { unlink } from "node:fs/promises";
import { hostname } from "node:os";
import { detectCapabilities } from "./capabilities";
import { CommandRunner } from "./command-runner";
import { CONFIG_PATH, type GatewayConfig, patchConfig } from "./config";
import { ProjectWatchers } from "./file-watcher";
import { startHttpServer } from "./http-server";
import { ensureDir } from "./paths";
import { makeSupabase, type RuneSupabase } from "./supabase";
import { TaskRunner } from "./task-runner";
import { UserSettingsCache } from "./user-settings";

const HEARTBEAT_MS = 15_000;

export async function startGateway(initialCfg: GatewayConfig): Promise<() => Promise<void>> {
  let cfg = initialCfg;
  await ensureDir(cfg.workspace_root);

  const host = hostname();
  const name = cfg.name ?? host;

  const supabase = await makeSupabase(cfg);

  const settingsCache = new UserSettingsCache(supabase, cfg);
  await settingsCache.start();

  let capabilities: GatewayCapabilities = await detectCapabilities({
    cursorCloudAvailable: Boolean(settingsCache.getCursorApiKey()),
  });

  // Per-gateway client token used by the browser for direct localhost calls
  // (diffs, terminal). Generated once and persisted to both ~/.rune/config.json
  // and the `gateways` row so the web app can read it via Supabase RLS.
  const clientToken = cfg.client_token ?? randomUUID();
  if (clientToken !== cfg.client_token) {
    cfg = await patchConfig({ client_token: clientToken });
  }

  const gatewayId = await registerGateway(supabase, cfg, host, name, capabilities, clientToken);
  if (gatewayId !== cfg.gateway_id) {
    cfg = await patchConfig({ gateway_id: gatewayId });
  }

  console.log(`[gateway] online → ${name} (${gatewayId})`);
  console.log(`[gateway] workspace: ${cfg.workspace_root}`);
  console.log(
    `[gateway] runtimes: ${capabilities.runtimes
      .filter((r) => r.available)
      .map((r) => r.id)
      .join(", ") || "(none detected)"}`,
  );

  const tasks = new TaskRunner(supabase, cfg, settingsCache);
  const commands = new CommandRunner(supabase, cfg, async () => {
    console.log("[gateway] received sign-out command — clearing config and shutting down");
    try {
      await unlink(CONFIG_PATH);
    } catch {
      // config might already be gone (manual logout) — ignore
    }
    await shutdown();
    process.exit(0);
  });
  const watchers = new ProjectWatchers(supabase, cfg);

  settingsCache.onChange(async ({ cursorApiKey }) => {
    capabilities = await detectCapabilities({ cursorCloudAvailable: Boolean(cursorApiKey) });
    try {
      await supabase
        .from("gateways")
        .update({ capabilities, last_seen_at: new Date().toISOString() })
        .eq("id", gatewayId)
        .eq("user_id", cfg.user_id);
    } catch (err) {
      console.error("[gateway] capabilities republish failed", err);
    }
  });

  await watchers.syncFromDb();

  await drainQueuedTasks(supabase, cfg.user_id, gatewayId, tasks);
  await drainQueuedCommands(supabase, cfg.user_id, gatewayId, commands);

  const taskChannel = supabase
    .channel(`gw-tasks-${gatewayId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "tasks",
        filter: `gateway_id=eq.${gatewayId}`,
      },
      async (payload) => {
        const t = payload.new as { id: string; status: string };
        if (t.status === "queued") {
          tasks.dispatch(t.id).catch((e) => console.error("[task]", e));
        }
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "tasks",
        filter: `gateway_id=eq.${gatewayId}`,
      },
      async (payload) => {
        // The web app marks tasks.status='cancelled' when the user hits Stop.
        // We pick that up here and abort the matching child process.
        const t = payload.new as { id: string; status: string };
        if (t.status === "cancelled") {
          const aborted = tasks.cancel(t.id);
          if (aborted) console.log(`[task] ${t.id} cancel signal received`);
        }
      },
    )
    .subscribe();

  const commandChannel = supabase
    .channel(`gw-cmds-${gatewayId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "gateway_commands",
        filter: `gateway_id=eq.${gatewayId}`,
      },
      async (payload) => {
        const c = payload.new as { id: string; kind: string; payload: unknown; status: string };
        if (c.status === "queued") {
          commands.dispatch(c).catch((e) => console.error("[cmd]", e));
        }
      },
    )
    .subscribe();

  const projectChannel = supabase
    .channel(`gw-projects-${gatewayId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "projects" },
      async () => {
        await watchers.syncFromDb();
      },
    )
    .subscribe();

  const heartbeat = setInterval(async () => {
    try {
      await supabase
        .from("gateways")
        .update({ last_seen_at: new Date().toISOString(), status: "online" })
        .eq("id", gatewayId)
        .eq("user_id", cfg.user_id);
    } catch (err) {
      console.error("[heartbeat]", err);
    }
  }, HEARTBEAT_MS);

  const http = await startHttpServer({
    port: 7777,
    workspaceRoot: cfg.workspace_root,
    hostname: host,
    getCapabilities: () => capabilities,
    getClientToken: () => clientToken,
    supabase,
    userId: cfg.user_id,
  });
  console.log(`[gateway] http://127.0.0.1:${http.port}/health`);

  let stopping = false;
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    clearInterval(heartbeat);
    try {
      await supabase.removeChannel(taskChannel);
      await supabase.removeChannel(commandChannel);
      await supabase.removeChannel(projectChannel);
    } catch {}
    await settingsCache.stop();
    await watchers.closeAll();
    try {
      await supabase
        .from("gateways")
        .update({ status: "offline", last_seen_at: new Date().toISOString() })
        .eq("id", gatewayId);
    } catch {}
    await http.close();
    console.log("[gateway] offline");
  }

  process.on("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.on("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });

  return shutdown;
}

async function registerGateway(
  supabase: RuneSupabase,
  cfg: GatewayConfig,
  host: string,
  name: string,
  capabilities: GatewayCapabilities,
  clientToken: string,
): Promise<string> {
  if (cfg.gateway_id) {
    const { data, error } = await supabase
      .from("gateways")
      .update({
        name,
        hostname: host,
        workspace_root: cfg.workspace_root,
        status: "online",
        last_seen_at: new Date().toISOString(),
        capabilities,
        client_token: clientToken,
      })
      .eq("id", cfg.gateway_id)
      .eq("user_id", cfg.user_id)
      .select("id")
      .maybeSingle();
    if (!error && data) return data.id as string;
  }
  const { data, error } = await supabase
    .from("gateways")
    .insert({
      user_id: cfg.user_id,
      name,
      hostname: host,
      workspace_root: cfg.workspace_root,
      status: "online",
      capabilities,
      client_token: clientToken,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(`failed to register gateway: ${error?.message}`);
  return data.id as string;
}

async function drainQueuedTasks(
  supabase: RuneSupabase,
  userId: string,
  gatewayId: string,
  runner: TaskRunner,
) {
  const { data } = await supabase
    .from("tasks")
    .select("id")
    .eq("user_id", userId)
    .eq("gateway_id", gatewayId)
    .eq("status", "queued");
  for (const t of (data as Array<{ id: string }> | null) ?? []) {
    runner.dispatch(t.id).catch((e) => console.error("[drain task]", e));
  }
}

async function drainQueuedCommands(
  supabase: RuneSupabase,
  userId: string,
  gatewayId: string,
  runner: CommandRunner,
) {
  const { data } = await supabase
    .from("gateway_commands")
    .select("id, kind, payload")
    .eq("user_id", userId)
    .eq("gateway_id", gatewayId)
    .eq("status", "queued");
  for (const c of (data as Array<{ id: string; kind: string; payload: unknown }> | null) ?? []) {
    runner.dispatch(c).catch((e) => console.error("[drain cmd]", e));
  }
}

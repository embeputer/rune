import { serve } from "@hono/node-server";
import type { GatewayCapabilities } from "@rune/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import type { ProjectLookup } from "./git";
import { commitChanges, gitStatus, openPullRequest } from "./git";
import { attachShellToSocket, parseShell } from "./pty";
import type { RuneSupabase } from "./supabase";
import { WebSocketServer } from "ws";

export interface HttpServerHandle {
  port: number;
  close(): Promise<void>;
}

export interface HttpServerOptions {
  port: number;
  hostname: string;
  workspaceRoot: string;
  getCapabilities: () => GatewayCapabilities;
  getClientToken: () => string | null;
  supabase: RuneSupabase;
  userId: string;
}

export function startHttpServer(opts: HttpServerOptions): Promise<HttpServerHandle> {
  return new Promise((resolve, reject) => {
    const app = new Hono();
    app.use("/*", cors({ origin: "*", allowMethods: ["GET", "POST", "OPTIONS"] }));

    // Public: no auth so the web layout can probe gateway health.
    app.get("/health", (c) =>
      c.json({
        ok: true,
        hostname: opts.hostname,
        workspace_root: opts.workspaceRoot,
        capabilities: opts.getCapabilities(),
      }),
    );

    // -- everything below here requires the per-gateway client_token -------
    app.use("/projects/*", bearerAuth(opts.getClientToken));

    const lookupProject = makeProjectLookup(opts.supabase, opts.userId);

    app.get("/projects/:id/git/status", async (c) => {
      const project = await lookupProject(c.req.param("id"));
      if (!project) return c.json({ error: "project not found" }, 404);
      try {
        const status = await gitStatus(project);
        return c.json(status);
      } catch (err) {
        return c.json({ error: (err as Error).message }, 500);
      }
    });

    app.post("/projects/:id/git/commit", async (c) => {
      const project = await lookupProject(c.req.param("id"));
      if (!project) return c.json({ error: "project not found" }, 404);
      const body = await c.req.json().catch(() => ({}));
      const message = typeof body.message === "string" ? body.message.trim() : "";
      if (!message) return c.json({ error: "message required" }, 400);
      const files = Array.isArray(body.files)
        ? (body.files as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined;
      try {
        const result = await commitChanges(project, message, files);
        return c.json(result);
      } catch (err) {
        return c.json({ error: (err as Error).message }, 500);
      }
    });

    app.post("/projects/:id/git/pr", async (c) => {
      const project = await lookupProject(c.req.param("id"));
      if (!project) return c.json({ error: "project not found" }, 404);
      const body = await c.req.json().catch(() => ({}));
      const title = typeof body.title === "string" ? body.title.trim() : "";
      const prBody = typeof body.body === "string" ? body.body : "";
      const base = typeof body.base === "string" && body.base.trim() ? body.base.trim() : null;
      const head = typeof body.head === "string" && body.head.trim() ? body.head.trim() : null;
      const githubToken =
        typeof body.github_token === "string" && body.github_token.length > 0
          ? body.github_token
          : null;
      if (!title) return c.json({ error: "title required" }, 400);
      try {
        const result = await openPullRequest(project, {
          title,
          body: prBody,
          base,
          head,
          githubToken,
        });
        return c.json(result);
      } catch (err) {
        return c.json({ error: (err as Error).message }, 500);
      }
    });

    const wss = new WebSocketServer({ noServer: true });

    const server = serve({ fetch: app.fetch, port: opts.port, hostname: "127.0.0.1" }, () => {
      resolve({
        port: opts.port,
        close: () =>
          new Promise<void>((res) => {
            try {
              wss.close();
            } catch {
              // ignore
            }
            server.close(() => res());
          }),
      });
    });

    server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      if (url.pathname !== "/pty") {
        socket.destroy();
        return;
      }
      const token = extractWsToken(req);
      if (!opts.getClientToken() || token !== opts.getClientToken()) {
        socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
        socket.destroy();
        return;
      }
      const cwd = url.searchParams.get("cwd") ?? opts.workspaceRoot;
      const shell = parseShell(url.searchParams.get("shell"));
      wss.handleUpgrade(req, socket, head, (ws) => {
        attachShellToSocket(ws, { cwd, shell }).catch((err) => {
          console.error("[pty] attach failed", err);
          try {
            ws.close(1011, (err as Error).message);
          } catch {
            // ignore
          }
        });
      });
    });

    server.on("error", reject);
  });
}

function bearerAuth(getToken: () => string | null) {
  return async (c: Parameters<Parameters<Hono["use"]>[1]>[0], next: () => Promise<void>) => {
    const expected = getToken();
    if (!expected) return c.json({ error: "gateway not ready" }, 503);
    const header = c.req.header("authorization") ?? "";
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m || m[1] !== expected) return c.json({ error: "unauthorized" }, 401);
    await next();
  };
}

/**
 * Browsers can't set the Authorization header on WebSocket connections, so
 * the client passes the token via the `Sec-WebSocket-Protocol` header
 * (subprotocol) using the format `rune.token.<token>`.
 */
function extractWsToken(req: IncomingMessage): string | null {
  const proto = req.headers["sec-websocket-protocol"];
  if (!proto) return null;
  const parts = (Array.isArray(proto) ? proto.join(",") : proto)
    .split(",")
    .map((p) => p.trim());
  for (const p of parts) {
    if (p.startsWith("rune.token.")) return p.slice("rune.token.".length);
  }
  return null;
}

function makeProjectLookup(
  supabase: RuneSupabase,
  userId: string,
): (id: string) => Promise<ProjectLookup | null> {
  return async (id) => {
    const { data } = await supabase
      .from("projects")
      .select("id, local_path, github_repo, github_default_branch")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    return {
      id: data.id,
      localPath: data.local_path,
      githubRepo: data.github_repo,
      githubDefaultBranch: data.github_default_branch,
    };
  };
}

/**
 * Helpers for talking directly to the local Rune gateway over
 * 127.0.0.1:7777. Requests are authed via a per-gateway client_token the
 * gateway publishes into its `gateways` row (RLS-scoped to the owner).
 *
 * This avoids piping high-volume PTY/diff data through Supabase Realtime.
 */

const GATEWAY_HTTP_BASE = "http://127.0.0.1:7777";
const GATEWAY_WS_BASE = "ws://127.0.0.1:7777";

export function gatewayHttpBase(): string {
  return GATEWAY_HTTP_BASE;
}

export function gatewayWsBase(): string {
  return GATEWAY_WS_BASE;
}

export interface FetchTokenResult {
  token: string;
  status: "online" | "offline";
  lastSeenAt: string;
}

/**
 * Fetch the local gateway's client_token from our own API (which is
 * RLS-scoped to the signed-in user).
 *
 * Result is memoized per `gatewayId` for a short TTL, and concurrent calls
 * share a single in-flight Promise. This collapses the case where the diff
 * panel and terminal panel mount simultaneously and each independently
 * triggers a 1+ second auth-ed roundtrip — instead they cooperate on one.
 */
const TOKEN_TTL_MS = 60_000;
const tokenCache = new Map<string, { result: FetchTokenResult; ts: number }>();
const tokenInflight = new Map<string, Promise<FetchTokenResult>>();

export async function fetchGatewayToken(gatewayId: string): Promise<FetchTokenResult> {
  const cached = tokenCache.get(gatewayId);
  if (cached && Date.now() - cached.ts < TOKEN_TTL_MS) return cached.result;

  const inflight = tokenInflight.get(gatewayId);
  if (inflight) return inflight;

  const promise = (async () => {
    const res = await fetch(`/api/gateways/${gatewayId}/token`, { cache: "no-store" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j.error ?? `failed to fetch gateway token (${res.status})`);
    }
    const body = (await res.json()) as {
      client_token: string;
      status: "online" | "offline";
      last_seen_at: string;
    };
    return {
      token: body.client_token,
      status: body.status,
      lastSeenAt: body.last_seen_at,
    } satisfies FetchTokenResult;
  })();

  tokenInflight.set(gatewayId, promise);
  try {
    const result = await promise;
    tokenCache.set(gatewayId, { result, ts: Date.now() });
    return result;
  } finally {
    tokenInflight.delete(gatewayId);
  }
}

/**
 * Wraps fetch for direct gateway calls, attaching the bearer token.
 */
export async function gatewayFetch(
  path: string,
  opts: { token: string; init?: RequestInit } = { token: "" },
): Promise<Response> {
  const headers = new Headers(opts.init?.headers ?? {});
  headers.set("Authorization", `Bearer ${opts.token}`);
  if (opts.init?.body && !headers.has("content-type")) {
    headers.set("Content-Type", "application/json");
  }
  return fetch(`${GATEWAY_HTTP_BASE}${path}`, { ...opts.init, headers });
}

export interface GitFile {
  path: string;
  status: string;
  staged: boolean;
}

export interface GitStatusResponse {
  branch: string | null;
  ahead: number;
  behind: number;
  files: GitFile[];
  diff: string;
  isRepo: boolean;
}

export async function getGitStatus(
  projectId: string,
  token: string,
): Promise<GitStatusResponse> {
  const res = await gatewayFetch(`/projects/${projectId}/git/status`, { token });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? `gateway returned ${res.status}`);
  return j as GitStatusResponse;
}

export async function commitGit(
  projectId: string,
  token: string,
  body: { message: string; files?: string[] },
): Promise<{ ok: boolean; sha?: string; output: string }> {
  const res = await gatewayFetch(`/projects/${projectId}/git/commit`, {
    token,
    init: { method: "POST", body: JSON.stringify(body) },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? `commit failed (${res.status})`);
  return j;
}

export interface OpenPrInput {
  title: string;
  body?: string;
  base?: string | null;
  head?: string | null;
  github_token?: string | null;
}

export async function openPullRequest(
  projectId: string,
  token: string,
  body: OpenPrInput,
): Promise<{ url: string | null; number: number | null; via: "github-rest" | "gh-cli" }> {
  const res = await gatewayFetch(`/projects/${projectId}/git/pr`, {
    token,
    init: { method: "POST", body: JSON.stringify(body) },
  });
  const j = await res.json();
  if (!res.ok) throw new Error(j.error ?? `PR failed (${res.status})`);
  return j;
}

/**
 * Open a PTY-ish WebSocket to the gateway. Token is passed via Sec-
 * WebSocket-Protocol since browsers can't set Authorization on WS.
 */
export function openPtyWebSocket(
  token: string,
  cwd: string,
  shell?: string,
): WebSocket {
  const url = new URL(`${GATEWAY_WS_BASE}/pty`);
  url.searchParams.set("cwd", cwd);
  if (shell) url.searchParams.set("shell", shell);
  return new WebSocket(url.toString(), [`rune.token.${token}`]);
}

# AGENTS.md — Rune codebase reference

> One-stop briefing for any AI agent landing in this repo. Read this once, then dive in.

---

## 1. What is Rune?

A markdown-first agent workspace. Three core concepts:

- **Rune** — a markdown file. Body = the prompt, frontmatter (YAML) = metadata (`runtime`, `status`, etc.). Each rune is a discrete agent task. A rune has a **mode**: `doc` (current markdown editor + preview + output) or `chat` (turn-based chat thread + collapsible Diffs/Terminal sidebar).
- **Project** — a folder of runes. Has `name`, `slug`, `local_path`, optional `github_repo`. Renameable in-app (folder follows on disk for non-external projects).
- **Scratchbook** — a quick-start project whose folder name is its UUID, flagged with `is_scratch=true`. Graduate by renaming/relocating elsewhere via the project menu.

Three runtimes-of-the-system:
- **Web app** (`apps/web`) — Next.js 15 App Router, auth + UI + API routes + server-side cursor-cloud streaming.
- **Gateway** (`apps/gateway`) — Bun + Hono daemon on the user's machine. Runs CLI agents, watches files, reacts to Supabase realtime.
- **Supabase** — Postgres + Auth + Realtime + Storage. The bridge between web and gateway.

---

## 2. Repo layout

```
rune/
├── apps/
│   ├── web/              Next.js 15 (App Router, Turbopack, Tailwind v4)
│   └── gateway/          Bun + Hono daemon (started via `bun run apps/gateway/src/cli.ts`)
├── packages/
│   ├── shared/           types, zod schemas, Supabase Database types, gray-matter (de)serializer
│   └── runtimes/         Runtime interface + 4 local CLI adapters + 1 cloud (cursor-cloud) + stream-json parser
├── supabase/migrations/  SQL: tables, RLS, realtime, user_settings, username, avatars, gateway sign-out, accent, chat_mode, gateway client_token (10 files)
├── README.md             user-facing setup
├── AGENTS.md             this file
└── SPEC.md               original product spec (kept for reference; many details have evolved)
```

Workspace tooling: **pnpm** monorepo (`pnpm-workspace.yaml`), Biome for lint/format, **TypeScript 5.5**, `concurrently` for `pnpm dev` parallelism.

---

## 3. Data model (Supabase tables + Storage)

| Table | Purpose | Notable cols |
|---|---|---|
| `projects` | folders | `slug`, `local_path`, `is_external`, `is_scratch`, `github_repo`, `github_branch`, `github_default_branch` (defaults to `"main"`) |
| `runes` | markdown agent tasks | `body`, `frontmatter` (jsonb), `runtime`, `status`, `mode` (`doc` \| `chat`, default `doc`), `output` |
| `rune_messages` | chat-mode turns | `rune_id`, `role` (`user` \| `assistant`), `content`, `status` (`pending` \| `streaming` \| `done` \| `error`), `runtime`, `task_id`, `error` |
| `gateways` | per-machine registry | `hostname`, `workspace_root`, `status`, `capabilities` (jsonb), `last_seen_at`, `client_token` (random per-gateway secret for browser→gateway HTTP/WS auth) |
| `tasks` | rune execution queue | `runtime`, `payload`, `status`, `output`, `gateway_id` (nullable for cloud), `message_id` (nullable; when set, task runner flushes deltas to that `rune_messages` row instead of `runes.output`) |
| `gateway_commands` | filesystem + lifecycle ops queue | `kind`, `payload`, `result`. Kinds: `pick-folder`, `import-folder`, `relocate-project`, `scan-folder`, `sign-out` |
| `user_settings` | per-user secrets / prefs | `cursor_api_key`, `username` (unique on `lower(username)`, 2–32 chars `[a-z0-9_-]`), `avatar_url`, `accent_color` (preset key) |

| Storage bucket | Purpose | Path convention |
|---|---|---|
| `avatars` | profile pictures (public reads) | `<user_id>/avatar-<timestamp>.<ext>` |

Every table is **RLS-protected** (`auth.uid() = user_id`) and on the **`supabase_realtime`** publication (incl. `user_settings`). Storage RLS on `storage.objects` enforces `<user_id>/...` for any avatar write; reads are public so `<img src=>` works without signed URLs. The gateway uses the user's JWT, the browser uses anon JWT — both see only their own rows.

---

## 4. Feature chains (every flow in one line)

### Auth + identity
- **Sign in** — `LoginForm` magic-link OTP → Supabase Auth → `middleware.ts` refreshes session per request.
- **Set username** — `/account` → `UsernameCard` → debounced `GET /api/account/username?candidate=...` for availability → `PUT /api/account/username` upserts; `null` resets to email-derived fallback.
- **Upload avatar** — `/account` → `AvatarCard` file picker → browser Supabase client uploads to `avatars/<user_id>/avatar-<ts>.<ext>` → `PUT /api/account/avatar` validates URL is in caller's folder, persists, best-effort deletes previous file.
- **Pick accent color** — `/account` → `AccentCard` swatch grid → optimistic `--color-accent` override → `PUT /api/account/accent` upserts preset key → SSR `<style>` in `(app)/layout.tsx` paints chosen accent FOUC-free on next refresh.

### Projects
- **Create project (in workspace)** — sidebar workspace dropdown → `POST /api/projects` → insert `projects` row → gateway realtime → `ensureDir` + chokidar watch.
- **Import existing folder** — sidebar workspace dropdown → `POST /api/projects/import` → `gateway_commands{kind:"import-folder"}` → gateway reads git remote + upserts `projects{is_external:true}`.
- **Pick folder (native dialog)** — `gateway_commands{kind:"pick-folder"}` → gateway runs PowerShell / AppleScript / zenity → result → web polls.
- **Relocate project** — settings → `POST /api/projects/:id/relocate` → `gateway_commands{kind:"relocate-project"}` → gateway `fs.rename` (+ wraps in `.rune/` if going external) → updates `projects.local_path`.
- **Rename project** — sidebar `…` menu or scratch card pencil → `RenameProjectDialog` → `PATCH /api/projects/:id` updates `name`+`slug`; for non-external projects also enqueues `relocate-project` with new `dest_path`.
- **Link GitHub repo** — settings → `POST /api/projects/:id/link-github` → updates `projects.github_repo/branch/default_branch` (gates cursor-cloud). Branch defaults to `"main"` everywhere (probed first via GitHub API when an OAuth token is present).
- **Delete project** — `DELETE /api/projects/:id` → cascades to runes/tasks (FKs). On-disk folder is intentionally left alone.

### Runes
- **Create rune** — sidebar per-project `+` (or project page) → `NewRuneDialog` → `POST /api/projects/:id/runes` → insert `runes` → realtime → list re-renders.
- **Edit rune** — CodeMirror `onChange` (debounced 700ms) → `PATCH /api/runes/:id` → updates `body/title/runtime`.
- **Run rune (local CLI)** — `POST /api/runes/:id/execute` → insert `tasks{status:"queued"}` → gateway atomic claim → `TaskRunner.dispatch` spawns CLI → streams events → flushes `output` every 600ms → on exit `writeRuneToDisk`.
- **Run rune (cursor-cloud, web path)** — execute route reads `user_settings.cursor_api_key` → service client inserts `tasks{status:"running",gateway_id:null}` → background `CursorCloudRuntime` polls `api.cursor.com/v0/agents`.
- **Run rune (cursor-cloud, gateway path)** — task lands on gateway → `resolveRuntime` pulls key from `UserSettingsCache` → same polling loop.
- **Follow-up to running/finished rune** — `FollowUpBar` below output → `POST /api/runes/:id/follow-up` appends user's message + previous output to `body`, then re-dispatches execute.
- **Live output streaming** — gateway `update tasks/runes.output` → Supabase realtime → browser subscription → `RuneEditorPage` re-renders.
- **File watcher (disk → DB)** — chokidar `add/change` → `parseRuneFile` (gray-matter) → upsert `runes`. `unlink` → delete by `(project_id, slug)`.
- **New scratch project** — `/scratchbook` → `POST /api/scratchbook` → insert `projects{slug=uuid, is_scratch:true}` + default `notes.md` rune → redirect → gateway creates `<workspace>/<uuid>/`.
- **Toggle rune mode** — segmented `[ Doc | Chat ]` in the rune editor toolbar → `PATCH /api/runes/:id { mode }` → realtime broadcasts → editor swaps layout. Mode is persisted per-rune.

### Chat mode + side panel
- **Send a chat message** — `RuneChatThread` input → `POST /api/runes/:id/messages` inserts a `user` row + a pending `assistant` row, rolls the full transcript into a single prompt blob, inserts a `tasks` row with `message_id` set, links assistant to task. Realtime UPDATEs on `rune_messages` stream output into the assistant bubble. cursor-cloud is rejected (chat is local-only for now).
- **Task runner flushing in chat mode** — when `tasks.message_id` is set the runner streams onto `rune_messages.content` (status `streaming` → `done`/`error`) and skips the disk write-back at the end (chat doesn't author the markdown body).
- **Side panel state** — `RuneSidePanel` persists per-rune `width` (px), collapsed flag, and active tab (`diffs` \| `terminal`) in `localStorage`. Drag handle on the left edge resizes between 280–720px; collapsed state shrinks to a 36px rail with quick-jump tab icons.
- **Browser → gateway auth (diffs + terminal)** — browser fetches `gateways.client_token` via `GET /api/gateways/:id/token` (RLS-scoped) → uses it as `Authorization: Bearer <token>` for HTTP and as the `Sec-WebSocket-Protocol` value `rune.token.<token>` for WS (browsers can't set Authorization on WS). Token is generated on first gateway boot, persisted to both `~/.rune/config.json` and the `gateways` row.
- **Diffs panel** — polls `GET 127.0.0.1:7777/projects/:id/git/status` every 4s while mounted. Gateway runs `git -C <local_path> status --porcelain=v2 -b` + `git diff` + per-untracked-file `git diff --no-index /dev/null <path>` and returns `{ branch, ahead, behind, files, diff, isRepo }`. The unified diff is rendered with a tiny in-component splitter (`splitDiff`) that color-codes `+`/`-`/`@@`/meta lines.
- **Commit** — `POST /projects/:id/git/commit { message, files? }` → `git add` (-A or specified files) → `git commit -m`. Surfaces stderr on failure.
- **Make PR** — browser pulls `session.provider_token` (Supabase GitHub OAuth) → `POST /projects/:id/git/pr { title, body, base?, head?, github_token }` → gateway pushes the head branch then calls GitHub REST `POST /repos/:owner/:repo/pulls`. Falls back to `gh pr create` when no token. Greyed out client-side when `project.github_repo` is null with the tooltip "Link a repo to use these".
- **Terminal panel** — opens `WS 127.0.0.1:7777/pty?cwd=<local_path>` with the subprotocol token. xterm.js (`@xterm/xterm`) + `@xterm/addon-fit` mounted in a div with a `ResizeObserver` calling `fit()`. Keystrokes go to the WS as raw text; resize emits a JSON control frame `{ type: "resize", cols, rows }` that's currently a no-op (no real PTY yet).

### Gateway lifecycle
- **Pair gateway** — `/account` → `PairGatewayCard` "Generate pairing token" → `POST /api/account/pair-gateway` returns base64-encoded `{supabase_url, anon_key, user_id, access_token, refresh_token}` → user pastes into `bun cli.ts login` → gateway calls `setSession()` → writes `~/.rune/config.json`.
- **Gateway register + heartbeat** — `cli.ts start` → generates `client_token` via `crypto.randomUUID()` if missing (persisted into both config and `gateways.client_token`) → `registerGateway` upserts `gateways` → 15s `setInterval` bumps `last_seen_at` → sidebar pill flips green.
- **Set Cursor API key (web)** — `/account` → `CursorKeyCard` (validates `^crsr_[A-Za-z0-9_-]+$`) → `PUT /api/account/settings` → upsert `user_settings.cursor_api_key` → gateway `UserSettingsCache` realtime → republish `gateways.capabilities`.
- **Set Cursor API key (gateway CLI)** — `bun cli.ts cursor-key <crsr_…>` → upsert `user_settings` → realtime fans out.
- **Sign out a gateway (remote)** — `/account` `GatewayListCard` (or sidebar `GatewayStatus` dropdown) → `POST /api/gateways/:id/sign-out` → `gateway_commands{kind:"sign-out"}` → `CommandRunner.dispatch` calls `onSignOut`: deletes `~/.rune/config.json` + shuts down + `process.exit(0)`. If the gateway is offline the command sits queued for next connect.
- **Remove gateway (force)** — `DELETE /api/gateways/:id` removes the row (cascades pending commands). Local config stays — use **Sign out** for full cleanup.

---

## 5. Runtime adapters (`packages/runtimes/src/`)

Common interface (`types.ts`):
```ts
interface Runtime {
  id: RuntimeId;            // "cursor-agent" | "claude-code" | "codex" | "droid" | "cursor-cloud"
  isAvailable(): Promise<boolean>;
  version(): Promise<string | null>;
  execute(input: ExecuteInput): AsyncIterable<RuneEvent>;
}
```

`RuneEvent = { type: "stdout" | "stderr"; data: string } | { type: "exit"; code: number; error?: string }`.

**Local CLIs** (`local.ts`):
- `cursor-agent`: `cursor-agent -p --trust --output-format stream-json` (the `--trust` flag is required, otherwise it interactively prompts)
- `claude`: `claude -p --dangerously-skip-permissions --output-format stream-json --verbose`
- `codex`: `codex exec --json -`
- `droid`: `droid exec -`

Prompts piped via stdin (no shell-quoting risk). `cursor-agent` and `claude-code` outputs are passed through `parseStreamJson()` (`stream-json.ts`) which extracts `assistant.message.content[].text`, summarizes `tool_use` as `· tool_name path`, and skips `system` / `result` events.

**Cloud** (`cloud.ts`):
- `CursorCloudRuntime` — Cursor Background Agents REST API: `POST /v0/agents/launch`, polls `GET /v0/agents/{id}` until `status` ∈ `{FINISHED, FAILED, CANCELLED}`, fetches conversation, yields synthesized stdout. Branch defaults to `"main"` if `github_branch` not provided.

**Spawn helper** (`spawn-helper.ts`):
- Cross-platform `child_process.spawn` (uses `shell: true` on Windows so `.cmd` shims resolve).
- Async-generator queue pattern. `AbortSignal` → SIGTERM via Node's built-in.
- `probeVersion(bin)` does `<bin> --version` with 4s timeout for capability detection.

---

## 6. Gateway internals (`apps/gateway/src/`)

| File | Role |
|---|---|
| `cli.ts` | Subcommands: `login`, `start`, `cursor-key`, `info`, `logout`. `login` accepts a base64 pairing token (no email/password). `cursor-key` enforces `crsr_` prefix. |
| `config.ts` | Reads/writes `~/.rune/config.json` (path from `os.homedir()`). Exports `CONFIG_PATH` for remote sign-out cleanup. |
| `index.ts` | `startGateway(cfg)` — orchestrates: register, start cache, watch, dispatch, heartbeat, http server. Passes `onSignOut` callback to `CommandRunner` that deletes `CONFIG_PATH`, calls `shutdown()`, and `process.exit(0)`. |
| `supabase.ts` | `makeSupabase` — anon client + `setSession({access_token, refresh_token})`. `autoRefreshToken: true`. |
| `user-settings.ts` | `UserSettingsCache` — caches `cursor_api_key`, subscribes to realtime `user_settings`, fires `onChange` listeners. |
| `task-runner.ts` | Atomic claim pattern, runtime resolution, debounced flushing (`FLUSH_MS=600`). When `tasks.message_id` is set: streams to `rune_messages.content` and skips the disk write. Otherwise current behavior (writes `runes.output` + `writeRuneToDisk`). |
| `command-runner.ts` | Filesystem + lifecycle command dispatch. Constructor takes `(supabase, cfg, onSignOut?)`. Handles `pick-folder`, `import-folder`, `relocate-project`, `scan-folder`, `sign-out`. |
| `file-watcher.ts` | `ProjectWatchers.syncFromDb` reconciles watched set; `chokidar` `add/change/unlink` → DB. `writeRuneToDisk` reverse direction. |
| `paths.ts` | `runeFolderFor(localPath, isExternal)` — external projects use `<localPath>/.rune/`, in-workspace + scratch use `<localPath>/`. |
| `capabilities.ts` | `detectCapabilities({cursorCloudAvailable})` — probes 4 CLIs + adds cursor-cloud row based on key presence. |
| `http-server.ts` | Hono server on `127.0.0.1:7777`. Public `/health`. Bearer-authed (`client_token`) `/projects/:id/git/{status,commit,pr}` routes. WebSocket upgrade on `/pty` with subprotocol token check (`rune.token.<token>`). |
| `git.ts` | `gitStatus(project)` (parses porcelain v2 + computes diff including untracked synthesis), `commitChanges`, `openPullRequest` (GitHub REST first, `gh` CLI fallback). All shell out via `child_process.spawn`. |
| `pty.ts` | Line-mode shell over WS: spawns `pwsh` (Windows) / `$SHELL` (Unix) and pipes stdin/stdout/stderr. Supports JSON control frames (`{type:"resize",cols,rows}` is currently a no-op; `{type:"signal",signal}` kills). NOT a real PTY — vim/htop won't work; swap `node-pty` in later. |

---

## 7. Web app structure (`apps/web/`)

- `app/(app)/**` — authed routes (sidebar layout). `app/(app)/layout.tsx` parallel-fetches `projects` + `user_settings` (`username, avatar_url, accent_color`), then `runes` for those projects, then `gateways`. Emits an inline `<style>` tag overriding `--color-accent` when the user has chosen a non-default preset.
- `app/(app)/projects/[slug]/runes/[runeSlug]/page.tsx` — fetches the rune + the existing `rune_messages` + the latest online gateway in parallel and passes them to `RuneEditorPage`.
- `app/login/**`, `app/auth/callback/route.ts` — magic-link OTP flow.
- `app/api/**/route.ts` — server route handlers. Always `await params`, always check `auth.getUser()`, always return `NextResponse.json`.
  - `runes/[id]/route.ts` (PATCH accepts `mode`), `runes/[id]/messages/route.ts` (GET/POST chat turns), `runes/[id]/follow-up/route.ts`, `runes/[id]/execute/route.ts`.
  - `gateways/[id]/token/route.ts` returns `client_token` to the owner so the browser can talk directly to the local gateway.
- `app/error.tsx`, `app/not-found.tsx`, `app/global-error.tsx` — Next.js error boundaries (don't delete; deleting + dev-server hot reload caused the "missing required error components" loop).
- `lib/supabase/{client,server,middleware}.ts` — three flavors of `@supabase/ssr` client.
- `lib/env.ts` — typed env getter (throws on missing required vars).
- `lib/accents.ts` — accent presets + `accentCss()` helper.
- `lib/relative-time.ts` — compact `s/m/h/d/w/mo/y` formatter for the sidebar.
- `lib/gateway-client.ts` — `fetchGatewayToken`, `gatewayFetch` (Bearer), `getGitStatus`, `commitGit`, `openPullRequest`, `openPtyWebSocket` (passes `client_token` as `Sec-WebSocket-Protocol` value `rune.token.<token>`).
- `components/**` — shadcn-style primitives (`ui/`) + feature components.
  - `rune-editor-page.tsx` (mode toggle + branches between `DocLayout` and `ChatLayout`).
  - `rune-chat-thread.tsx` (turn-based bubbles, autosizing textarea, Realtime stream of `rune_messages`).
  - `rune-side-panel.tsx` (collapsible + drag-resizable wrapper with two tabs, `localStorage`-persisted state per-rune).
  - `diffs-panel.tsx` (4s polled `git/status`, color-coded unified diff, Commit + Make PR with greyed-out tooltip when no `github_repo`).
  - `terminal-panel.tsx` (xterm.js, `@xterm/addon-fit`, WS `/pty`).
- Tailwind v4 with custom Oklch theme. Uses CSS variables (`var(--color-bg)`, etc.). Tokens defined in `app/globals.css`. Accent override is layered on top per request via SSR `<style>`. xterm.css is imported once inside `terminal-panel.tsx`.

### Sidebar layout (`components/sidebar.tsx`)

Matches a Linear/Things-style nav:

- **Workspace selector** at top: avatar (image if `avatar_url` set, otherwise accent-tinted initial circle) + bigger username (`text-lg font-semibold`, brighter `oklch(0.92...)`) + `ChevronsUpDown`. Dropdown contains Create project / Import folder / Scratchbook / Account / Sign out. **Email is intentionally not shown here** — it lives only on `/account`.
- **Pill search** filters projects + runes client-side. While the search has any text, collapse state is **temporarily ignored** so matching runes are always findable.
- **Scratchbook quick link** below search.
- **Project groups**: each row = folder/chevron toggle + project name + status badges (running count = orange spinner pill, error count = red pill) + hover-revealed `+` (new rune) + `…` menu (New rune / Rename / Settings / Delete). Folder icon swaps to `ChevronRight`/`ChevronDown` on hover via `group/project` Tailwind utility.
- **Collapsed state** persisted in `localStorage["rune.sidebar.collapsed"]` as a JSON array of project IDs.
- **Per-rune indicator** (`StatusIcon`): idle → tiny green dot · queued → orange `Clock` · running → orange `Loader2` (animate-spin) · done → green `CheckCircle2` · error → red `AlertCircle`. Right-aligned tabular relative time.
- **Footer**: `GatewayStatus` dropdown (per-gateway Sign out / Remove buttons). Account actions live in the workspace dropdown — no duplicate footer dropdown.
- **Realtime subscription**: single channel `sidebar-stream` listening to `*` events on `projects`, `runes`, and `user_settings` → `router.refresh()`.
- **Tick interval**: every 60s `setTick` bumps so relative-time labels age live without re-fetching.

---

## 8. Conventions & gotchas

### Env files
- **Single `.env` at `apps/web/.env`** (gitignored). Vercel-friendly: paste-as-import.
- `.env.example` files at `apps/web/.env.example` and `apps/gateway/.env.example` are committed.
- `.gitignore` ignores `.env` + `.env.*` but allows `.env.example`.

### Required env vars (web)
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase's new `sb_publishable_*` keys work as drop-in replacements.
- `SUPABASE_SERVICE_ROLE_KEY` — `sb_secret_*` works.
- **No** `CURSOR_API_KEY` — that's stored per-user in `user_settings`, configured at `/account` (must start with `crsr_`) or via `bun cli.ts cursor-key <crsr_…>`.

### Next.js 15 specifics
- Dynamic params are `Promise<{...}>` — always `await params`.
- `next dev --turbopack` is default in this repo.
- App Router throughout (no `pages/`).

### Supabase
- We call it via HTTPS + Realtime websocket only. No direct Postgres connection string used.
- `@supabase/ssr` v0.10+ is critical — earlier versions broke type inference for `Database` generic.
- Migrations are pushed via `supabase db push` (CLI installed via `scoop install supabase` on Windows). Project linked with `supabase link --project-ref <ref>`. Auth via `SUPABASE_ACCESS_TOKEN` env var (personal access token from dashboard).
- **Storage**: the `avatars` bucket is `public=true`. Writes are gated by RLS on `storage.objects` requiring `auth.uid()::text = (storage.foldername(name))[1]`. Cache-bust on replace by including `Date.now()` in the filename.

### Windows quirks
- `child_process.spawn` needs `shell: true` to resolve npm-installed `.cmd` shims.
- Native folder picker uses PowerShell `System.Windows.Forms.FolderBrowserDialog`.
- Path separator detection: gateway looks for `\\` in `workspace_root` to decide separator.

### File-system convention
- **In-workspace** project: runes at `<workspace>/<slug>/*.md`.
- **External** project (imported): runes at `<folder>/.rune/*.md` — never pollute the host project.
- **Scratch** project: same as in-workspace but folder name is the project UUID until renamed.
- **`writeRuneToDisk`** preserves `created_at` from filesystem (`stat.birthtime`) and updates frontmatter on every execute.

### Rune editor
- Toolbar carries: title input, status `Badge`, **`[ Doc | Chat ]` segmented `ModeToggle`**, runtime `Select`, Run button (doc mode only).
- Doc mode (`mode === 'doc'`):
  - Non-scratch: split = editor (CodeMirror) | preview (react-markdown) with output panel below preview.
  - Scratch: split = editor (prompt) | output (preview removed — it was redundant since the body IS the prompt).
  - `FollowUpBar` mounts below the output for both sub-layouts.
  - Output renders as markdown (`prose-rune.prose-rune--compact`) — agents output markdown.
- Chat mode (`mode === 'chat'`):
  - Left = `RuneChatThread`. Right = `RuneSidePanel` with **Diffs** + **Terminal** tabs. No editor, no preview, no output panel, no Run button.
  - Runtime `Select` disables `cursor-cloud` (chat is local-only); doc mode keeps the existing "link a repo" gate for cursor-cloud.
- `isScratch` (now nested in `project.isScratch`) only affects doc layout. Chat layout is identical for scratch and non-scratch.
- CodeMirror uses a custom Obsidian-style `runeHighlight` HighlightStyle + `runeTheme` (sans-serif body, scaled headings, italic emphasis, mono code) — no `oneDark`, no line numbers, no active-line highlight. CSS for this lives inside the component, not in `globals.css`.

### Chat mode
- One `rune_messages` row per turn. Assistant rows transition `pending → streaming → done|error` driven by the gateway task runner.
- Prompt assembly: web rolls up the full `(role, content)` history into a flat `User: ...\n\nAssistant: ...\n\nUser: ...` blob and ships it as `tasks.payload.prompt`. Newer agents handle the long-context fine; we don't truncate.
- `RuneChatThread` subscribes to one channel `rune-messages-<runeId>` for INSERT + UPDATE on `rune_messages` filtered by `rune_id`. Optimistic upsert on POST so the UI doesn't flicker waiting for realtime.
- Bubbles use the `prose-rune--compact` typography variant. Streaming bubbles show a subtle `Loader2` spinner.

### Side panel
- Per-rune `localStorage` keys: `rune-sidepanel-w:<runeId>`, `rune-sidepanel-collapsed:<runeId>`, `rune-sidepanel-tab:<runeId>`. Width clamps to 280–720px; collapsed = 36px rail.
- The drag handle is a `<div role="separator" tabIndex={0}>` — Pointer events for drag, ArrowLeft/ArrowRight for keyboard a11y. Pointer capture released on `pointerup`.
- Empty states: when `gatewayId` is null, both tabs render "Start your gateway to use the …".

### Diffs panel
- Diff renderer is local (~40 LOC): splits the unified diff on `diff --git`, classifies each line into `add`/`del`/`hunk`/`meta`/`ctx`, renders a `<pre>` with Tailwind classes for color. Don't reach for a markdown code block here — it doesn't give you per-line backgrounds.
- "Make PR" pulls `session.provider_token` lazily on click (so it doesn't block render). The token is forwarded to the gateway in the request body, never persisted.
- Polling lives in a `setInterval(4000)` while the panel is mounted. Clean up on unmount. Manual refresh button is in the header.

### Terminal panel
- xterm is imported via dynamic `await import("@xterm/xterm")` so it only ships to the browser bundle.
- Token is fetched **per-mount** (cheap, RLS-scoped) and cached only in component state.
- The WS uses subprotocol auth (`new WebSocket(url, ["rune.token.<token>"])`). The gateway parses `Sec-WebSocket-Protocol` and rejects bad tokens before upgrading.

### Sidebar / project list
- Filtered with `eq("is_scratch", false)` so scratch projects only appear in `/scratchbook`.
- Status icons map directly from `runes.status`. Per-project counts are computed in-component over the realtime-fed list.

### Authentication
- Web uses **magic-link only** (no passwords). The gateway therefore cannot use `signInWithPassword`.
- Gateway login uses a **pairing token** (base64-encoded session bundle generated at `/account`).
- Pairing tokens contain `access_token + refresh_token`. Refresh tokens rotate, so re-pairing invalidates older tokens.

### Stream-json parsing
- `parseStreamJson(events, format)` is a generic transform that line-buffers stdout, parses each line as JSON, and lets the caller decide what to emit.
- `formatAnthropicStreamEvent` handles `cursor-agent` + `claude-code` (they share the event format).
- Non-JSON lines pass through unchanged (so stderr or progress output isn't lost).

### Theming
- Base palette is in `app/globals.css` (`--color-bg`, `--color-bg-elev`, `--color-fg`, `--color-accent`, etc., all OKLch).
- Per-user accent override is emitted by `(app)/layout.tsx` as a server-rendered `<style dangerouslySetInnerHTML>` block setting `:root{--color-accent:oklch(...)}`. **No client-side theme JS** for the default flow — keeps SSR FOUC-free.
- `AccentCard` does an optimistic inline override on swatch click and removes it after the round-trip so the SSR style takes back over without flashing.

### Username + avatar
- Username regex: `^[a-z0-9_-]{2,32}$` (enforced both server-side via Zod and Postgres `CHECK`). Unique on `lower(username)` so it's case-insensitive.
- Sidebar resolves `workspaceName = settings.username || deriveWorkspaceName(email)` where the fallback strips email to `[a-z0-9_-]` and clamps to 32 chars.
- Avatar URLs are validated server-side to point at the caller's own `avatars/<user_id>/...` folder before persisting — prevents claiming someone else's upload.

---

## 9. Common tasks

### Running locally
```sh
pnpm install                                    # bootstrap workspaces
pnpm dev:web                                    # http://localhost:3000
bun run apps/gateway/src/cli.ts login           # paste pairing token from /account
pnpm dev:gateway                                # 127.0.0.1:7777, registers + heartbeats
```

### Typecheck / build
```sh
pnpm -r typecheck       # all 4 packages
pnpm --filter @rune/web build
```
Note: the Next.js type-check sometimes fails because of stale `.next/types/` cache after deleting routes. If you see `Cannot find module '../../../.../route.js'`, delete `apps/web/.next` and re-run.

### Migrations
```sh
$env:SUPABASE_ACCESS_TOKEN="sbp_..."            # Windows; use `export` on *nix
supabase link --project-ref <ref>
supabase db push --include-all
supabase migration list                         # verify Local + Remote columns match
```

### Adding a migration
- New file: `supabase/migrations/000N_<slug>.sql`
- Plain SQL (no Supabase-specific DSL needed).
- If creating a new table: add to `0002_rls.sql` pattern, add to `0003_realtime.sql` publication, add `replica identity full`.
- For Storage buckets: `insert into storage.buckets (id, name, public) values (...) on conflict (id) do update set public = excluded.public;` then declare RLS policies on `storage.objects` for `select/insert/update/delete` filtering by `(storage.foldername(name))[1] = auth.uid()::text`.

### Adding a new runtime
1. Implement `Runtime` interface in `packages/runtimes/src/local.ts` (or `cloud.ts`).
2. Register in `localRuntimes` array at the bottom of `local.ts`.
3. Add the id to `RUNTIME_IDS` in `packages/shared/src/types.ts` and `RUNTIME_LABELS`.
4. Update the SQL `check` constraints on `runes.runtime` and `tasks.runtime` (new migration).
5. (Optional) update `formatAnthropicStreamEvent` if the new CLI uses a different event format.

### Adding a new gateway command
1. Add the kind to `GatewayCommandKindSchema` in `packages/shared/src/types.ts`.
2. Update the SQL `check` constraint on `gateway_commands.kind` (new migration).
3. Implement the dispatch handler in `apps/gateway/src/command-runner.ts`. If the command needs to mutate the gateway lifecycle (like `sign-out`), add an extra constructor callback rather than reaching upward via globals.
4. Add the API route in `apps/web/app/api/...` to enqueue + (optionally) poll via `/api/gateway-commands/:id`.

### Adding a new server-side secret to user_settings
1. Migration: `alter table public.user_settings add column <field> text;` (add a `CHECK` if format matters).
2. Update `UserSettingsTable` Row/Insert/Update in `packages/shared/src/supabase.ts`.
3. Web: add field to `/account` UI + `/api/account/settings` GET + a dedicated `PUT /api/account/<field>` endpoint if the validation logic is non-trivial (see `username`, `avatar`, `accent`).
4. Gateway: extend `UserSettingsCache.refetch()` and add a getter; subscribe in `index.ts` if changes need to trigger work.

### Adding an accent preset
1. Add an entry to `ACCENT_PRESETS` in `apps/web/lib/accents.ts` (key + label + `oklch` string with similar lightness to existing presets so contrast with `--color-accent-fg` holds).
2. The Postgres `CHECK` is permissive (`^[a-z]{2,16}$`), so no migration needed.
3. The `AccentCard` swatch grid auto-renders the new preset.

### Adding a new gateway HTTP endpoint (browser-callable)
1. In `apps/gateway/src/http-server.ts`, add a route under the `app.use("/projects/*", bearerAuth(...))` block (or a new `app.use("/your-prefix/*", bearerAuth(...))` if it's not project-scoped).
2. Implement the actual logic in a sibling module (`git.ts`-style). Keep `http-server.ts` thin — auth, parse, delegate, respond.
3. In `apps/web/lib/gateway-client.ts`, add a typed wrapper around `gatewayFetch`.
4. Consume from a client component. Token comes from `fetchGatewayToken(gatewayId)`.

### Adding a new side-panel tab
1. New component in `apps/web/components/<your-tab>-panel.tsx`. Match the `flex h-full min-h-0 flex-col` shell + `border-b` header + scrollable body convention.
2. In `apps/web/components/rune-side-panel.tsx`: extend `Tab` union, add a `TabButton`, register a collapsed-state quick-jump icon, render in the body switch.
3. If your tab needs gateway access, take `gatewayId` as a prop and short-circuit on null with a "Start your gateway" empty state.

### Adding a chat-mode capability (e.g. tool surfaces, inline diffs in messages)
1. Decide whether the new info lives on `rune_messages` (per-turn metadata) or in a new sibling table linked by `task_id`. Prefer `rune_messages` for things the user already sees; new table for high-volume telemetry.
2. If extending `rune_messages`: add column via migration → update `RuneMessagesTable` types → update the task runner flush path → update the bubble renderer.
3. Don't synthesize prompts on the gateway — keep prompt assembly in `app/api/runes/[id]/messages/route.ts` so the API stays the source of truth for context shape.

---

## 10. Distribution roadmap (not built yet)

Eventual gateway distribution (so users don't clone the repo):
- Build standalone binaries with `bun build --compile --target=bun-{linux|darwin|windows}-x64`
- GitHub Actions workflow uploads to releases
- Static `install.sh` / `install.ps1` host (curl-piped install pattern à la Bun, Deno, rustup)
- No npm, no Node required on user machines

For now: users run from the monorepo. `@rune/*` package names are workspace-internal only.

---

## 11. Things to ask before changing

- Adding a new **table** → confirm RLS + realtime + replica-identity treatment with the user.
- Adding a new **secret** → user_settings (per-user) vs env (per-deployment) — default to user_settings unless it's a deployment concern.
- Adding **GPT/AI features** to the product itself → user explicitly removed the previous "scratchbook organizer" because they wanted simplicity over magic. Don't bring it back without asking.
- Adding **interactive prompts** to gateway CLI → keep them all in `cli.ts` and use `node:readline`. Do not use third-party prompt libs.
- Significant **UI redesigns** → user has flagged the design as "needs polish" and has been actively iterating on the sidebar (workspace selector, status indicators, collapse, accent, etc.). Match the existing tone/scale before introducing new visual languages.
- Reaching for **next/image** for avatars → not configured; plain `<img>` is fine for MVP. Configuring `next.config` for Supabase domain remoteImages is the right path if needed.
- Showing the user's **email** anywhere outside `/account` → the user has explicitly asked to keep it off the sidebar and other surfaces. The username is the public handle.
- Switching the **terminal** to a real PTY (`node-pty`, `@homebridge/node-pty-prebuilt-multiarch`, `bun-pty`) → would unlock vim/htop/password prompts, but adds native deps and Windows build flakiness. Current line-mode is intentional MVP — confirm before pulling it in.
- Routing **chat mode through cursor-cloud** → currently rejected by `POST /api/runes/:id/messages`. Cursor Background Agents are async one-shots, not turn-based, so this needs a different message-status state machine. Don't enable it without designing that first.
- Bypassing the gateway `client_token` → never call `127.0.0.1:7777` from the browser without the Bearer/subprotocol token. The whole "browser → local gateway" path depends on that secret being unguessable, even though the loopback interface is local-only.
- Touching the unified-diff renderer in `diffs-panel.tsx` → it's intentionally tiny (~40 LOC). Pulling in a library (`react-diff-viewer`, `diff2html`) is fine if you need word-level diffs, but the current renderer was chosen for speed-of-iteration. Confirm before swapping.

---

## 12. Persona note

The user's `~/AGENTS.md` configures a playful persona ("CodePup"). That's optional flavor for chat; do not let it leak into committed code, comments, or docs. This file (`./AGENTS.md`) is the project file and stays neutral.

# Rune

> The most in-depth, simple environment for agents.

You think in chaos. Agents work in structure. Rune is the translator.

## What's in here

```
rune/
├── apps/
│   ├── web/         # Next.js 15 frontend
│   └── gateway/     # Bun + Hono local daemon
├── packages/
│   ├── shared/      # zod schemas, rune file format, supabase types
│   └── runtimes/    # Runtime interface + 5 adapters
└── supabase/        # SQL migrations + RLS
```

## Getting started

## HOW TO USE RUNE IF YOU ARE USING THE PUBLICALLY AVAILABLE APP

Until i setup an npm org or whatever, the only way you can use the gateway is by:

#1: Opening your terminal and cloning this repo:

``` git clone https://github.com/embeputer/rune.git ```

#2: cd to rune (it's probably in your user folder!)

#3: quickly detouring back to https://rune-dev.vercel.app/account and generating a pairing key, copying it and coming back to your terminal

#4: run ``` bun run apps/gateway/src/cli.ts ``` (sorry for this obnoxious shit) and when asked, paste in your pairing key!

#5: and last, run ``` pnpm dev:gateway ```

Bada bing bada boom, you are ready to rune!

### 1. Install dependencies

```sh
pnpm install
```

> Bun must also be installed on your machine for the gateway: https://bun.sh

### 2. Set up Supabase

1. Create a project at https://supabase.com
2. In the SQL editor, run every file under `supabase/migrations/` in order
3. (Optional) Enable GitHub OAuth provider in **Authentication → Providers**
4. Copy your project URL + anon key + service role key

### 3. Configure environment

```sh
cp apps/web/.env.example apps/web/.env
```

Fill in `apps/web/.env` (gitignored — never commit):

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

That's it for env. Per-user secrets like the **Cursor API key** are configured in-app at `/account` (sidebar → email dropdown → Account & API keys) and stored per-user in Supabase, so each account brings its own key.

When deploying, paste the same file into Vercel's **Settings → Environment Variables → Import .env**.

### 4. Run

```sh
pnpm dev          # both web and gateway
# or individually:
pnpm dev:web      # http://localhost:3000
pnpm dev:gateway  # local daemon on 127.0.0.1:7777
```

First time, before `pnpm dev:gateway` can do anything useful: log the gateway in.

```sh
pnpm --filter @rune/gateway login
# or
bun run apps/gateway/src/cli.ts login
```

This stores a JWT in `~/.rune/config.json`. After login, `pnpm dev:gateway` will register your machine in Supabase and start listening for tasks.

## Agent runtimes

The gateway auto-detects which CLIs are installed:

| Runtime       | CLI            | Install                                          |
| ------------- | -------------- | ------------------------------------------------ |
| Cursor Agent  | `cursor-agent` | https://cursor.com/cli                           |
| Claude Code   | `claude`       | `npm i -g @anthropic-ai/claude-code`             |
| Codex         | `codex`        | `npm i -g @openai/codex`                         |
| Droid         | `droid`        | https://factory.ai/cli                           |
| Cursor Cloud  | (HTTPS)        | Configure your key at **/account**, then link a GitHub repo on the project |

Bring your own agent — none are required, but at least one local CLI **or** Cursor Cloud is needed to actually execute runes.

## Smoke test

End-to-end checklist for the local-laptop happy path:

1. **Migrations** — open Supabase SQL editor, run `supabase/migrations/0001_init.sql`, then `0002_rls.sql`, then `0003_realtime.sql`
2. **Web env** — `apps/web/.env` filled in (see step 3)
3. **Sign up** — `pnpm dev:web` then visit http://localhost:3000, sign in via magic link
4. **Gateway login** — `pnpm --filter @rune/gateway login` (use the same email + password). Pick a workspace folder (default `~/rune`)
5. **Gateway start** — `pnpm dev:gateway` — should print `online → ...`, list detected CLIs, and the http://127.0.0.1:7777/health URL
6. **In the web app** — sidebar should show a green "Gateway online" pill
7. **Local runtime test** — `+ New project → Create in workspace`, add a rune ("echo test", body "Reply with one short sentence."), pick a runtime your gateway detected, click **Run**. Output should stream into the right panel and the rune file should appear at `~/rune/<slug>/<rune-slug>.md`
8. **Import test** — `+ New project → Import existing folder`, paste an absolute path or click **Browse…** to open the OS folder picker. The project should show up with badge `external`. If the folder has a `.git` config with a GitHub remote, `github_repo` is auto-prefilled
9. **Cloud test** — visit `/account`, paste a Cursor API key from cursor.com/dashboard. Then open a project's settings, link a GitHub repo, switch a rune's runtime to `Cursor Cloud`, click **Run**. Output streams from `api.cursor.com/v0/agents`
10. **Scratchbook** — visit `/scratchbook`, click **+ New scratch**. A project is created with the project UUID as its folder name (`~/rune/<uuid>/`) and you're dropped into a blank `notes.md` rune. Rename or relocate later via project settings if it grows up.

If any step fails, check `pnpm dev:gateway` logs and the browser console.

## Architecture

```
┌──────────────────┐
│  Rune Web App    │  Next.js 15 (App Router)
└────────┬─────────┘
         │ realtime
         ▼
┌────────────────────────┐
│        Supabase        │  auth + sync + task relay
└────────────┬───────────┘
             │ websocket
             ▼
┌────────────────────────┐
│     Rune Gateway       │  Bun + Hono
└──────┬─────────────────┘
       │
   spawn / HTTPS
       ▼
 cursor-agent · claude · codex · droid · cursor-cloud
```

See [SPEC.md](SPEC.md) for the original design and `.cursor/plans/` for the implementation plan.

## Project lifecycle

- **In-workspace** — `+ Create in workspace`. Lives at `<workspace_root>/<slug>`. Runes are bare `.md` files in the project folder.
- **External** — `+ Import existing folder`. Lives anywhere on disk. Rune metadata is kept in `<path>/.rune/` so your project root stays clean. If the folder has a GitHub remote, it's auto-linked.
- **Relocate** — Move an in-workspace project out via project settings. Files are moved with `fs.rename`, then reorganized so bare runes go into a new `.rune/` subfolder.

## License

MIT — bring your own agents.


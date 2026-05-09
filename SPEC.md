# Rune

### The most in-depth, simple environment for agents.

You think in chaos. Agents work in structure. Rune is the translator.

---

## What is Rune?

Rune is a markdown-first workspace where your notes **are** your agent prompts. Write freely, Rune handles the rest — organizing your thoughts into projects, routing tasks to whatever agent runtime you have available, and syncing everything across your devices.

No prompt engineering. No context switching. Just write.

---

## Core Concepts

### Runes

A **rune** is a markdown note that doubles as an agent task. Every rune is a discrete unit of work — you describe what you want in plain language, and the Rune Gateway picks it up and executes it.

### Projects

A **project** is a folder of runes. Each rune inside is a task scoped to that project. The Gateway always has project context when executing a rune — it knows what else is in the folder.

```
rune/
├── my-app/
│   ├── setup-auth.md
│   ├── build-dashboard.md
│   └── write-tests.md
└── scratch/
    └── 2024-01-12-dump.md
```

### Scratchbook

The **scratchbook** is your zero-friction entry point. Just ramble. No structure required.

Flow:

1. You brain-dump in markdown
2. Gateway interprets intent
3. Rune proposes a project structure + breaks your dump into runes
4. You review and confirm (or edit)
5. Project gets created, Gateway starts executing tasks

The scratchbook is where chaos becomes structure.

---

## Architecture

```
┌──────────────────┐     ┌──────────────────┐
│  Rune Web App    │     │  Rune Mobile     │
│  (Next.js)       │     │  (future)        │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         └──────────┬─────────────┘
                    │ realtime
                    ▼
       ┌────────────────────────┐
       │        Supabase        │  cloud sync + auth + task queue
       │  notes, accounts,      │
       │  gateway registry,     │
       │  realtime task relay   │
       └────────────┬───────────┘
                    │ websocket (realtime)
                    ▼
       ┌────────────────────────┐
       │     Rune Gateway       │  Bun + Hono (runs locally)
       │  linked to your acc    │
       │  reads/writes rune/    │
       └──────┬─────────────────┘
              │
      ┌───────┴────────┐
      ▼                ▼
 Cursor SDK       Claude Code    (+ Ollama, any future runtime)
```

### Rune Web App (Next.js)

- Markdown editor (CodeMirror or similar)
- Project/folder management UI
- Scratchbook mode
- Gateway status indicator (online/offline)
- Syncs to Supabase in real-time

### Rune Gateway (Bun + Hono)

- Local daemon, runs on your machine
- **Registers itself to your Rune account on startup** — tied to your identity, not just localhost
- Listens to Supabase Realtime for incoming tasks from any device
- Executes tasks locally, pushes output back via Supabase
- Reads/writes the local `rune/` folder
- Routes tasks to available agent runtimes
- Extensible: bring your own agent
- No agent data leaves your machine — Supabase only relays task metadata + output

### Remote execution flow (mobile → Gateway)

```
you write a rune on your phone
→ Rune sends task to Supabase task queue
→ Supabase notifies your Gateway via Realtime websocket
→ Gateway picks it up, executes locally
→ output syncs back to Supabase
→ you see results on your phone
```

Your Gateway is your personal compute node. Your phone just talks to your account.

### Cloud Sync (Supabase)

- Auth (email, OAuth)
- Real-time note sync across devices
- Gateway registry (which gateways are linked to your account, online status)
- Task queue + relay (bridges remote devices to your local Gateway)
- Local `rune/` folder = source of truth, Supabase = sync + relay layer

---

## Agent Runtime Support


| Runtime         | v1  | v2  |
| --------------- | --- | --- |
| Cursor SDK      | ✅   | ✅   |
| Claude Code CLI | ✅   | ✅   |
| Ollama (local)  | ✅   | ✅   |
| OpenAI API      | —   | ✅   |
| Custom          | —   | ✅   |


Gateway detects what's available and routes accordingly. **Bring your own agent.**

---

## V1 Scope (Weekend MVP)

- Markdown editor with live preview
- Project folder creation + management
- Basic rune execution via Gateway (Cursor SDK)
- Scratchbook → project conversion flow
- Local `rune/` folder as source of truth
- Supabase auth + sync
- Gateway daemon (Bun + Hono) with Cursor SDK integration
- Gateway connection status in UI

### Out of scope for v1

- Mobile app
- Desktop app (Electron/Tauri)
- Multi-agent orchestration
- Ollama support
- Rune Pro features

---

## Future: Rune Pro

Full agent steering. Your notes don't just kick off tasks — they actively direct running agents, provide mid-task context, and let you intervene in plain markdown. The scratchbook becomes a live cockpit.

---

## Tech Stack


| Layer          | Tech                            |
| -------------- | ------------------------------- |
| Frontend       | Next.js                         |
| Gateway        | Bun + Hono                      |
| Cloud          | Supabase                        |
| Editor         | CodeMirror or TipTap            |
| Local storage  | Markdown files (`rune/` folder) |
| Agent runtimes | Cursor SDK, Claude Code, Ollama |


---

## Tagline Options

- *The most in-depth, simple environment for agents.*
- *Just write. Agents handle the rest.*
- *Markdown in. Magic out.*

---

*v0.1 spec — subject to change as we build*
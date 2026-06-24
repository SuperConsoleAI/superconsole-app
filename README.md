# SuperConsole

An agentic workspace desktop app. SuperConsole runs isolated terminal sessions, native chat, and headless cron jobs across local workspaces, and layers in an optional cloud (WorkOS identity + Turso) for org/project config, team membership, LLM keys, and connectors. A companion web portal manages that same cloud state from the browser.

Built with Tauri 2 (Rust) + React 19. Mac-first, `<30MB` native build.

## Features

- **Terminals**: real PTY sessions (xterm.js, WebGL renderer + bundled JetBrains Mono Nerd Font) per workspace, multiple CLIs concurrently (Claude, Droid, Antigravity, Codex, shell). Per-tab status footer (git diff stat, files toggle, branch, post-exit token·cost) and an optional rich-text input with live `/` slash-command autocomplete (skills, context, commands, connectors, agents, sessions — reactive as data loads).
- **Native chat**: stream responses from Anthropic / OpenAI-compatible / Gemini / OpenRouter (live model list + pricing), with reasoning/thinking effort, a system prompt built from on-demand context files and connected tools, cross-CLI slash commands, message edit-to-fork / regenerate / stop, quick-prompt chips (e.g. session log), web search, and a session token·cost footer. The `[+]` composer menu exposes Skills, Agents, Connectors (incl. Tool access setting), Context, Commands, and Sessions submenus — each with a typed `/prefix:name` token insert and a `+ Add …` shortcut to the relevant settings tab.
- **Code Editor**: a built-in CodeMirror editor for making fast local file edits without leaving the app. Includes syntax highlighting, unsaved-changes dirty tracking, and a live side-by-side Markdown preview mode.
- **Browser**: an embedded native webview (powered by Tauri/Wry) seamlessly layered within the workspace. Type a URL or domain to navigate, or enter a search term to auto-redirect to Google Search. Essential for reading documentation, viewing local development servers, or quick research directly inside SuperConsole without context switching.
- **Scheduled jobs**: cron jobs run headlessly via a 30s tick loop; results land in the Inbox and are delivered to the configured Telegram topic. Trigger remotely over HTTP or Telegram, on a schedule (cron), manually, via API HTTP POST, or on GitHub webhook events. Add, edit, and clone tasks from any surface using the unified **TaskFormContent** form — shared across the Tasks page, per-workspace JobsDialog, and project settings — so all three surfaces stay in sync. Task cards show the project badge + schedule human label inline with the name, model chip, relative next-run chip ("in 6d" / "tomorrow" / "in 3h") before the action buttons, and a tighter icon cluster (▶ ✏ 🗑 ›).
- **Agents**: an agent is a reusable *definition* (`.superconsole/agents/<name>/agent.md` = instructions + skills + connectors + context); the harness, model, and schedule are chosen when you run or schedule it as a job. Browse the SuperConsole agent catalog (sidebar), import any GitHub repo as an agent or new project (full clone + generated `agent.md` + all skills), and let repos self-describe via a `.superconsole-plugin/` manifest (falls back to `.claude-plugin/` or README). Prompts can reference `/skill:`/`/context:`/`/connector:`/`/agent:`/`/session:` resources inserted via `[+]` or `/` autocomplete.
- **Skills library**: skills are reusable SKILL.md instruction files in `.superconsole/skills/<name>/SKILL.md`. Managed via the Skills dialog (My Skills · Commands · Browse Library · New/Import) and the Settings > Skills tabs (account-global vs per-project). Install from GitHub URL or from a Turso-backed catalog. The skill catalog table in Turso (`skill_catalog`) mirrors `agent_catalog` — install globally then attach to a project. A `[Skill Catalog]` tab in Account settings lets you manage the library.
- **Session logs**: structured session logs saved to `.superconsole/sessions/` (opt-in per session or by agent instruction). Accessible as `/session:` tokens via `[+]` and `/` autocomplete. Not raw CLI history — structured summaries with agent name, date, and summary.
- **Cloud layer (optional)**: WorkOS sign-in, synced orgs/projects, team invitations, three-level LLM keys (project → org → account), and connectors (incl. a web search connector backed by Tavily, exposed to chat as a `web_search` tool). Secrets are AES-256-GCM encrypted and injected into agent sessions.
- **Telegram messaging**: two-mode bot routing — Option A (shared org bot, each project gets its own `chat_id`/`thread_id` topic) or Option B (dedicated bot per project). Inbound commands: `/inbox` (pending approvals with ✅/❌ inline keyboards), `/status`, `/agents`, `/agent <name>`, `/task [freq] <cmd>`, `/schedule <cmd> <cron>`, `/help`; free text routes to a native one-shot chat completion. `allowed_user_ids` whitelist per project. Job completions notify the project's Telegram topic automatically. Configure via **Settings → Project → Messaging**.
- **Web portal** (`superconsole-web/`): browser surface onto the same Turso DB, deployed to Cloudflare Workers.
- **Plugins & Hooks marketplace** (`CustomizePage`): browse, search, and install plugins from a Turso-backed catalog or a GitHub URL (`superconsole.json` manifest). Each plugin bundles Skills, MCP servers, lifecycle hooks, and connector auth flows. Install/uninstall per workspace with an animated step UI. Lifecycle hooks (`session-start`, `session-end`, `before-prompt`, `before-mcp`, `before-shell`) are shell scripts stored in `.superconsole/hooks/` and run non-blocking with a 10 s timeout. Per-hook-type script editor with active-state indicators. Org/project filter and 2-column grid layout matching the Tasks page design language. Publish dialog writes new plugins directly to the Turso `plugins` table; the sync manager pulls them down on the next startup or 30-minute tick.

## Project layout

```
src/                 React frontend (router, components, lib/api.ts)
src-tauri/           Rust backend (local + cloud modules)
superconsole-web/    Cloudflare Workers web portal (own README/PROJECT.md)
```

## Develop

Prerequisites: Node.js, Rust, and the Tauri CLI (`cargo install tauri-cli`).

```bash
npm install
npm run tauri dev        # Vite on :1420 + Rust debug build, hot reload
```

Other commands:

```bash
npm run build                     # typecheck + frontend build (tsc && vite build)
cd src-tauri && cargo check       # backend check
cargo tauri build                 # ship: .app + .dmg in src-tauri/target/release/bundle/
```

## Cloud configuration

Cloud features read from a gitignored root `.env` (loaded via `dotenvy`):

```
WORKOS_API_KEY=
WORKOS_CLIENT_ID=
WORKOS_REDIRECT_URI=
WORKOS_COOKIE_PASSWORD=
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
```

`WORKOS_COOKIE_PASSWORD` must match the web portal's, or encrypted secrets won't decrypt across surfaces. The app works fully offline without these set.

## Documentation

| File | Contents |
|---|---|
| `PROJECT.md` | High-level overview and architecture summary |
| `ARCHITECTURE.md` | Data flow (local + cloud), frontend structure, key decisions, folder map |
| `CODEBASE.md` | Backend + frontend file index, entry points per feature, do-not-touch list |
| `CONTEXT.md` | Tauri/React patterns, build commands, cloud + sync patterns, env vars, gotchas |
| `DESIGN_PRINCIPLES.md` | Naming, state, error, CSS, backend + cloud conventions |
| `TECH_STACK.md` | Every dependency with rationale and version constraints |
| `CLAUDE.md` | Engineering quick-reference (mental model, cloud rules, gotchas) |
| `PLUGINS_HOOKS_CATALOGS.md` | Phase Plugins deep-dive: catalog tables, sync flow, plugin manifest spec, hook system |

The web portal is documented in `superconsole-web/PROJECT.md` and `superconsole-web/CLAUDE.md`.

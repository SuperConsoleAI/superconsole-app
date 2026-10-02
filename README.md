# SuperConsole

An agentic workspace desktop app. SuperConsole runs isolated terminal sessions, native chat, and headless cron jobs across local workspaces, and layers in an optional cloud (WorkOS identity + Turso) for org/project config, team membership, LLM keys, and connectors. A companion web portal manages that same cloud state from the browser.

Built with Tauri 2 (Rust) + React 19. Mac-first, `<30MB` native build.

## Features

- **Terminals**: real PTY sessions (xterm.js, WebGL renderer + bundled JetBrains Mono Nerd Font) per workspace, multiple CLIs concurrently (Claude, Droid, Antigravity, Codex, shell). Direct multi-CLI resume support (`claude --resume <UUID>`, `codex resume <UUID>`, `agy -c`). Per-tab status footer (git diff stat, files toggle, branch, post-exit token·cost) and an optional rich-text input with live `/` slash-command autocomplete (skills, context, commands, connectors, agents, sessions — reactive as data loads).
- **Native AI Vector Memory (RAG)**: pure-Rust in-memory cosine similarity search over serialized `F32_BLOB(3)` vectors (`vector_memory.rs`) backed by the `memory_vectors` table in `superconsole.db`. Sub-millisecond semantic retrieval for long-term memory, skills, and context without external vector databases or native extensions.
- **LocalDB Studio & Central DB**: consolidated SQLite storage in `superconsole.db` across 50 canonical tables with modular schemas under `db/schema/`. Includes LocalDB Studio (`components/localdb/`) for inspecting schemas, exploring table data, and executing queries directly in-app.
- **4-Tier Usage & Cost Analytics**: full token consumption and cost aggregation engine across 4 tiers (`project_usage`, `org_usage`, `user_usage`, `account_usage`). Tracks input tokens, output tokens, `tokens_reasoning`, and prompt caching (`tokens_prompt_cached`). Automatically computes incremental deltas on resumed sessions (`get_previous_session_usage`) to prevent double-counting.
- **Zero OS Keychain Authentication**: 100% elimination of the `keyring` crate. WorkOS auth sessions are persisted securely in SQLite table `cloud_identity` and loaded into RAM on startup, with deterministic HKDF-SHA256 key derivation purely in memory — zero macOS keychain authorization dialogs.
- **Turso libSQL Async Remote Client**: connects to Turso via pure async libSQL 0.9 over the Hrana protocol (`default-features = false, features = ["remote", "tls"]`), completely bypassing local SQLite C FFI to prevent fatal `SQLITE_MISUSE = 21` threading conflicts with bundled `rusqlite`.
- **Connectors**: project, org, and account-scoped credentials injected as env vars into every PTY/chat session. Includes **Composio** (`COMPOSIO_API_KEY` — 1000+ tools via one key), Gmail, GitHub, Slack, Stripe, Notion, Shopify, Postgres, web search (Tavily), and more. AES-256-GCM encrypted at rest.
- **Native chat**: stream responses from Anthropic / OpenAI-compatible / Gemini / OpenRouter (live model list + pricing), with reasoning/thinking effort, a system prompt built from on-demand context files and connected tools, cross-CLI slash commands, message edit-to-fork / regenerate / stop, quick-prompt chips (e.g. session log), web search, and a session token·cost footer. **Chat compaction** (3-layer, `/compact` or auto at >70% context): prune oldest 50% messages, LLM produces a structured summary written to an append-only `.superconsole/sessions/<id>.md` log, replace pruned block with a single user-role context message (system role = SuperConsole harness — never overwritten). The shared `[+]` menu (`ComposerPlusMenu`) exposes Skills, Agents, Connectors, Context, Commands, and Sessions — each with a typed `/prefix:name` token insert and a `+ Add …` shortcut to the relevant settings tab. The Connectors menu shows project, org, and account-scoped connectors in a unified flat panel (with tool access settings).
- **Code Editor**: a built-in CodeMirror editor for making fast local file edits without leaving the app. Includes syntax highlighting, unsaved-changes dirty tracking, and a live side-by-side Markdown preview mode.
- **Git Version Control**: a built-in 1-click Git flow integrated directly into the workspace header. Features a split-button for instantly committing changes, pushing to remote, or publishing new repositories to GitHub. Optionally auto-generates commit messages using LLMs behind the scenes. Zero blocking, extremely fast, auto-clears stale `index.lock` files, and falls back gracefully when Git isn't installed.
- **Browser**: an embedded native webview (powered by Tauri/Wry) seamlessly layered within the workspace. Type a URL or domain to navigate, or enter a search term to auto-redirect to Google Search. Essential for reading documentation, viewing local development servers, or quick research directly inside SuperConsole without context switching.
- **Scheduled jobs**: cron jobs run headlessly via a 30s tick loop; results land in the Inbox and are delivered to the configured Telegram topic. Trigger remotely over HTTP or Telegram, on a schedule (cron), manually, via API HTTP POST, on GitHub webhook events, or via **email** (Gmail polling on the same 30s tick — `trigger_type: "email"`, filter + `last_checked` in `trigger_config`). Add, edit, and clone tasks from any surface using the unified **TaskFormContent** form — shared across the Tasks page, per-workspace JobsDialog, and project settings — so all three surfaces stay in sync. Task cards show the project badge + schedule human label inline with the name, model chip, relative next-run chip ("in 6d" / "tomorrow" / "in 3h") before the action buttons, and a tighter icon cluster (▶ ✏ 🗑 ›).
- **Agents**: an agent is a reusable *definition* (`.superconsole/agents/<name>/agent.md` = instructions + skills + connectors + context); the harness, model, and schedule are chosen separately at task-creation or in the agent's own settings. Three run modes: **CLI** (headless terminal — claude, droid, codex, etc.), **Chat** (native streaming with any provider/model), and **Auto** (router agent reads project memory + available agents and picks the best approach each run — inspired by the `Router → Swarm → Agents → Memory` pipeline in Ruflo / Claude Flow). The **AgentRunEditDialog** (`src/components/AgentRunEditDialog.tsx`) is a shared component used in both the Agents page edit dialog and the Task form. Browse the SuperConsole agent catalog (sidebar), import any GitHub repo as an agent or new project (full clone + generated `agent.md` + all skills), and let repos self-describe via a `.superconsole-plugin/` manifest (falls back to `.claude-plugin/` or README). Prompts can reference `/skill:`/`/context:`/`/connector:`/`/agent:`/`/session:` resources inserted via `[+]` or `/` autocomplete.
- **Skills library**: skills are reusable SKILL.md instruction files in `.superconsole/skills/<name>/SKILL.md`. Managed via the Skills dialog (My Skills · Commands · Browse Library · New/Import) and the Settings > Skills tabs (account-global vs per-project). Install from GitHub URL or from a Turso-backed catalog. The skill catalog table in Turso (`skill_catalog`) mirrors `agent_catalog` — install globally then attach to a project. A `[Skill Catalog]` tab in Account settings lets you manage the library.
- **Session logs**: structured session logs saved to `.superconsole/sessions/` (opt-in per session or by agent instruction). Accessible as `/session:` tokens via `[+]` and `/` autocomplete. Not raw CLI history — structured summaries with agent name, date, and summary.
- **Cloud layer (optional)**: WorkOS sign-in, synced orgs/projects, team invitations, three-level LLM keys (project → org → account), and connectors (incl. a web search connector backed by Tavily, exposed to chat as a `web_search` tool). Secrets are AES-256-GCM encrypted and injected into agent sessions.
- **Telegram messaging**: two-mode bot routing — Option A (shared org bot, each project gets its own `chat_id`/`thread_id` topic) or Option B (dedicated bot per project). Inbound commands: `/inbox` (pending approvals with ✅/❌ inline keyboards), `/status`, `/agents`, `/agent <name>`, `/task [freq] <cmd>`, `/schedule <cmd> <cron>`, `/help`; free text routes to a native one-shot chat completion. `allowed_user_ids` whitelist per project. Job completions notify the project's Telegram topic automatically. Configure via **Settings → Project → Messaging**.
- **Web portal** (`superconsole-web/`): browser surface onto the same Turso DB, built with TanStack Start, Tailwind v4, and shadcn/ui, deployed to Cloudflare Workers.
- **Plugins & Hooks marketplace** (`CustomizePage`): browse, search, and install plugins from a Turso-backed catalog or a GitHub URL (`superconsole.json` manifest). Each plugin bundles Skills, MCP servers, lifecycle hooks, and connector auth flows. Install/uninstall strictly respects the project boundary (no account-level inheritance bleed in project views), featuring an animated step UI. Lifecycle hooks (`session-start`, `session-end`, `before-prompt`, `before-mcp`, `before-shell`) are shell scripts stored in `.superconsole/hooks/` and run non-blocking with a 10 s timeout. Per-hook-type script editor with active-state indicators. Org/project filter and 2-column grid layout matching the Tasks page design language. Publish dialog writes new plugins directly to the Turso `plugins` table; the sync manager pulls them down on the next startup or 30-minute tick.
- **Refined Shell & Sidebar**: compact 15rem (`w-60`) sidebar with 50% search padding reduction (`pl-2 pr-1`), border-r only boundary, project context menus with state flags (`isActive`, `isPublic`, `showUsage`, `showTeam`), and a borderless dashboard TopBar retaining macOS traffic lights clearance alongside a high-contrast action button (`dark:bg-[#ffffff] dark:text-[#000000]`).

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
| --- | --- |
| [`docs/PROJECT.md`](docs/PROJECT.md) | High-level overview, tech stack highlights, and architecture summary |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Complete data flow (local + cloud), frontend structure, key architectural decisions, and layout system |
| [`docs/CODEBASE.md`](docs/CODEBASE.md) | Backend + frontend file index, entry points per feature, and do-not-touch list |
| [`docs/CONTEXT.md`](docs/CONTEXT.md) | Tauri/React patterns, build commands, cloud + sync patterns, credentials, and UI/shell constraints |
| [`docs/DESIGN_PRINCIPLES.md`](docs/DESIGN_PRINCIPLES.md) | Naming, state management, error patterns, CSS, backend, and cloud conventions |
| [`docs/TECH_STACK.md`](docs/TECH_STACK.md) | Every dependency with version rationale, cloud crates, web portal stack, and version constraints |
| [`docs/architecture_flow.md`](docs/architecture_flow.md) | Data lifecycle, sync manager flow, vector memory RAG, and 4-tier usage rollup flow |
| [`CLAUDE.md`](CLAUDE.md) | Engineering quick-reference (mental model, cloud rules, gotchas, cheatsheet) |
| [`PLUGINS_HOOKS_CATALOGS.md`](PLUGINS_HOOKS_CATALOGS.md) | Phase Plugins deep-dive: catalog tables, sync flow, plugin manifest spec, hook system |

The web portal is documented in `superconsole-web/PROJECT.md` and `superconsole-web/CLAUDE.md`.

Do Production grade code, Industry standard approch we're building for 1M+ DAU app + each file on top add 1-10 line about file, what it does, how it does full flow.

**Note:** always test and verify all the changes then we can say its done

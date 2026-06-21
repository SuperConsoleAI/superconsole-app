# CODEBASE.md

File index for fast navigation. Read ARCHITECTURE.md first.

## Rust backend (src-tauri/src/)

| File | One-liner |
|------|-----------|
| `main.rs` | Entry point, calls `superconsole_lib::run()`. Don't touch. |
| `lib.rs` | All `#[tauri::command]` handlers, plugin registration, app setup (DB init, scheduler/remote spawn). Add new commands here + register in `generate_handler!`. Also hosts the `superconsole mcp --session <token>` CLI subcommand that boots `mcp_server.rs`. |
| `db.rs` | SQLite via rusqlite. Schema (workspaces, organizations, jobs, inbox, settings, session_history, chat_messages, chat_sessions, skills/memory/wiki caches) + all queries. Migrations are idempotent blocks in `Db::init`. |
| `pty.rs` | PTY sessions via portable-pty. `SessionManager` map keyed by session id string. CLI presets in `cli_command(cli, workspace, resume_id)` (claude/droid/codex/antigravity/shell) incl. per-CLI resume flags. `.env` parsing, context-file detection, output reader thread → `pty-output` events. On exit screen-scrapes usage and emits a `session-usage` event (tokens + est. cost) for the footer, cloud or not. |
| `files.rs` | Workspace-sandboxed file ops (list/read/write/create/delete). `resolve()` is the path-safety gate — never bypass it. |
| `scheduler.rs` | Cron parsing (`next_run`), 30s tick loop (`spawn`), `exec_in_workspace` = the ONE headless executor (scheduler + HTTP + Telegram all use it). Branches on job `run_mode` (cli print-mode vs chat one-shot vs `agent`) and `job_command()` builds the CLI line (incl. `codex exec`). `exec_agent` = run a file-defined agent now. `with_available_resources()` parses `@skill:`/`@context:`/`@connector:`/`@agent:` tokens and prepends a one-line availability hint (resources fetched on demand via MCP, never inlined). |
| `agents.rs` | Agents = file-defined *definitions* in `.superconsole/agents/<name>/agent.md` (instructions + skills + connectors + context; no harness/model/schedule). `parse_agent_md`/`build_agent_md`, `list/read/write/delete_agent`. SuperConsole catalog in Turso `agent_catalog` (`ensure_agent_catalog_table`, `list/upsert/delete_catalog_agent`, `install_catalog_agent`). Repo import: `detect_repo_agents` (`.superconsole-plugin/`→`.claude-plugin/`→README + `skills/<name>/SKILL.md`), `import_repo_agents`, `install_repo_agent` (full clone + generated `agent.md` + all skills + `.superconsole-plugin/plugin.json`), `scaffold_project_from_repo` (clone + scaffold `.superconsole/`). |
| `cli_sessions.rs` | Reads native CLI transcripts off disk (Claude `~/.claude/projects/<enc>`, Droid `~/.factory/sessions/<enc>`, Codex `~/.codex/sessions/YYYY/MM/DD/*.jsonl` filtered by recorded `cwd`). `list_sessions`/`read_session`; security-gated to `~/.claude`, `~/.factory`, `~/.antigravity`, `~/.codex`. |
| `remote.rs` | Telegram long-poll bot (`spawn_telegram`), local tiny_http server (`spawn_http`), `ensure_api_token`, `notify_telegram`. |
| `auth.rs` | WorkOS loopback OAuth (`127.0.0.1:4666`), keychain session storage, `upsert_user_and_orgs` + `accept_pending_invitations` to Turso. |
| `cloud.rs` | Turso HTTP exec helper: `turso_config`, `turso_execute`, `rows`, `cell_text`, `cell_opt`. All cloud SQL goes through here. |
| `crypto.rs` | AES-256-GCM encrypt/decrypt; HKDF key from `WORKOS_COOKIE_PASSWORD`, cached in keychain. Mirrors web `crypto.ts`. |
| `sync_manager.rs` | Pulls Turso config into local `*_cache` tables (startup/manual/org-switch/30min tick) + `sync_on_update`. PTY/chat read cache only. |
| `llm.rs` | LLM key CRUD per scope (account/org/project), `ensure_workspace_project` (locked + idempotent), `session_env` resolution, provider streaming adapters, `one_shot_completion` (non-streaming, used by chat-mode jobs). `list_openrouter_models` (cached hourly via OpenRouter `/api/v1/models`; id/name/context/pricing/reasoning support, filtered to text-output + recent, newest-first) and `or_price_per_token` for live chat costing. |
| `chat.rs` | Native chat: streams tokens via `chat-*` events through Anthropic/OpenAI-compatible/Gemini/OpenRouter adapters; cancellable (`stop_chat` + `ChatCancel` state); `tool_mode` (auto progressive-disclosure vs direct) and `reasoning` effort (`apply_reasoning`: OpenAI `reasoning_effort`, OpenRouter `reasoning.effort`); system prompt from context files + connected services + skills/memory/wiki; runs a native tool-calling loop via `mcp::execute`. The `chat-done` event carries `tokens_prompt`/`tokens_completion`/`cost_usd` (cost prefers OpenRouter live pricing, else `usage::estimate_cost`). |
| `context.rs` | On-demand project context files (brand/voice/style-guide etc.): `scan`/`read_body`/`search` over the workspace; surfaced to chat via the `context_*` MCP tools and the ContextDialog. |
| `commands.rs` | Cross-CLI + global slash commands: discovery/expansion shared across CLIs and native chat. |
| `mcp.rs` | In-process MCP tool layer: `ToolCtx` (+ AES-encrypted session token, 30-day TTL), `ToolSpec` registry (always-loaded + context tools + generic `connector_request` + dedicated `web_search` when connected), BM25-lite tool search, `execute`, `native_ctx`. `write_mcp_config`/`ensure_mcp_config` auto-write + pre-approve the `superconsole` server for Claude (`.mcp.json`) and Droid (`.factory/mcp.json`). |
| `mcp_server.rs` | stdio JSON-RPC MCP server (launched by `superconsole mcp --session <token>`); proxies tool calls into `mcp::execute`. |
| `skills.rs` | Skills registry CRUD (phase 18); local cache + Turso sync; injected into chat/CLI system prompt. |
| `memory.rs` | Long-term memory CRUD (phase 19); local cache + Turso sync; injected into system prompt. |
| `wiki.rs` | Project wiki CRUD (phase 20); local cache + Turso sync; injected into system prompt. |
| `usage.rs` | Usage monitoring (phase 21): `ModelPricing`/`estimate_cost`, aggregation core (`apply_event` → lifetime counters, year-keyed analytics, rolling windows, by-model/provider/cli/member/project/org, 365-day heatmap), Turso shared-total upsert with project→org→account rollup, `record_usage`, `parse_cli_usage` (PTY screen-scrape). Raw `usage_events` are local-only; the 3 aggregate tables cache shared cross-machine totals. |
| `team.rs` | Org + project membership and invitation CRUD; permission checks (owner/admin manage, last-owner guard, members must be org members). |
| `connectors.rs` | Connector `REGISTRY` (fields + env mapping; incl. `web_search` → `TAVILY_API_KEY`), encrypted-blob CRUD, `session_env` injection (project>org + telegram fallback), `connected_services`, `resolve_connector_fields`. |

Config: `tauri.conf.json` (window/titlebar/updater/bundle), `capabilities/default.json` (permissions), `Cargo.toml` (deps). Cloud config in gitignored root `.env`.

## Frontend (src/)

| File | One-liner |
|------|-----------|
| `main.tsx` | Renders `RouterProvider`. |
| `router.tsx` | Route tree, `Shell` layout (sidebar + topbar + tabstrip + terminal host), `Welcome`, route components. Most wiring lives here. |
| `index.css` | THE design system: all color tokens (light + dark), fonts, radii. |
| `lib/api.ts` | Every backend command as a typed function + all shared types (`Workspace`, `Job`, `InboxItem`, `SessionTab`, ...) + `CLI_PRESETS`. |
| `lib/workspace-context.tsx` | Global state: workspaces, orgs, tabs per workspace, live sessions. All mutations go through its actions. |
| `lib/auth-context.tsx` | Cloud identity state: WorkOS user, orgs, active cloud org; `ensureWorkspaceProject` helper. |
| `lib/utils.ts` | `cn()` only. |
| `components/TerminalView.tsx` | xterm instance per tab (WebGL renderer, Nerd Font, waits for `document.fonts.ready` before fit/start, clears the texture atlas on resize). Starts session, streams events, debounced resize, exit overlay. Optional rich-text input + `+` file-path attach (writes to the live PTY or the input); listens for `session-usage`. Uses the shared `StatusFooter`. |
| `components/ChatView.tsx` | Native chat, tab-per-session (picker box of last 10 chats / draft / concrete session by `tabId`). Session created lazily on first message; draft promotes to a session tab. Renders the message list (edit-to-fork user messages, regenerate/copy/stop), quick-prompt chips (starters / session-log) above the composer, the `ChatComposer`, and a `StatusFooter` with ctx + session token·cost. Streams `chat-*` events; accumulates session stats from `chat-done`. |
| `components/ChatComposer.tsx` | Boxed composer: `+` menu (files, skills, connectors, commands, web search), unified OpenRouter-backed provider/model selector (2-column, searchable, ctx+price), thinking/reasoning effort, agent mode, attachments, paste-as-doc, send/stop. |
| `components/StatusFooter.tsx` | Shared bottom status bar (git diff stat via `git_info`, files toggle, `~/workspace`, branch, optional ctx + token·cost) with a `leftExtra` slot; wraps on narrow widths. |
| `components/ContextDialog.tsx` | Manage on-demand project context files. |
| `components/ProviderIcon.tsx` | Provider/product brand icons (Claude/Grok/Kimi/GLM/Gemini/OpenAI…) chosen from a model id. |
| `components/LoginScreen.tsx` | WorkOS sign-in entry (pre-auth gate). |
| `components/AccountMenu.tsx` | Signed-in user menu (org switch, sign out). |
| `components/TabStrip.tsx` | Per-workspace tabs + browser-style "+" dropdown (new terminal/chat) + CLI launcher icons. |
| `components/TopBar.tsx` | h-10 full-width bar: traffic-light padding, sidebar toggle, back/forward, workspace name, jobs/files/theme buttons. |
| `components/Sidebar.tsx` | Expanded sidebar (org dropdown, Inbox/Tasks, workspace list) AND collapsed `SidebarRail`. |
| `components/CommandInput.tsx` | Slash-command textarea with autocomplete (built-ins + `.claude/commands/*.md`); no longer mounted by TerminalView (kept for reuse). |
| `components/FilePanel.tsx` | Lazy file tree, create/delete, 4s auto-refresh. |
| `components/FileEditor.tsx` | Textarea editor + markdown preview, Cmd+S save. |
| `components/InboxView.tsx` | Inbox feed, markdown output, approve/reject flow. |
| `components/TasksView.tsx` | Org-wide job list (toggle/run/delete), redesigned for run modes + triggers. |
| `components/JobsDialog.tsx` | Per-workspace job CRUD: run mode (cli/chat), trigger (cron/api/github), allowed connectors, schedule presets + recent session history. |
| `components/SessionsView.tsx` | Full-width history page: CLI tab (session_history + native on-disk sessions per CLI, default name + rename/Delete, project name + time on the right) and Chat tab (one row per chat session, provider icon + model badge, star/rename/move/delete; click opens that session). |
| `components/UsageView.tsx` | Usage monitoring page (phase 21): project/org/account level toggle + period toggle (month/year/all), metric cards, token breakdown, provider-colored breakdowns (model/provider/cli/member/project/org), 365-day activity heatmap (tokens/cost), markdown cost-report export. Reads `api.getUsage(level, id)`. |
| `components/SettingsPage.tsx` | /settings page: section nav; Account/Security, General (updates), Appearance, Integrations (Telegram), API Keys (HTTP), Models (LLM keys), Teams, Connectors. Large file — sections are co-located components. |
| `components/AddWorkspaceDialog.tsx` | Folder picker + name + CLI choice. |
| `components/PresetIcon.tsx` | Theme-aware CLI brand icon (falls back to terminal glyph). |
| `components/theme-provider.tsx` | Dark/light context, persists to localStorage. |
| `components/ui/*` | shadcn CLI output. Regenerate with `npx shadcn add <name> -y -o`; don't hand-edit. |
| `assets/icons/preset-icons/` | CLI brand SVGs + `index.ts` (`getPresetIcon(name, isDark)`). |

## Dependency edges that matter

- `router.tsx` → context + all feature components. Feature components → `lib/api.ts` only (never invoke directly).
- Backend: `lib.rs` → all modules; `scheduler.rs` ↔ `remote.rs` (exec + notify); `pty.rs` and `scheduler.rs` share `parse_env_file`.

## Entry points per feature

- New backend capability → command in `lib.rs` → wrapper in `api.ts` → component.
- New route/panel → `router.tsx` route tree + Sidebar/TopBar nav.
- New CLI preset → `pty.rs::cli_command` (+ resume flag) + `scheduler.rs::job_command` + `CLI_PRESETS` in `api.ts` + icon in preset-icons. Native session read/resume → `cli_sessions.rs` (encoding + dir layout).
- New MCP tool → add a `ToolSpec` in `mcp.rs` (always-loaded vs context-gated); it is exposed to both native chat (`mcp::execute`) and the stdio server (`mcp_server.rs`).
- New skill/memory/wiki capability → CRUD in `skills.rs`/`memory.rs`/`wiki.rs` + Turso Drizzle migration + system-prompt injection + TopBar dialog.
- Schema change (local) → idempotent migration in `db.rs::Db::init`.
- Schema change (cloud) → Drizzle migration in `superconsole-web/drizzle/` (+ journal) and a matching idempotent `ensure_*` in the relevant Rust module.
- New connector/LLM provider → mirror in `connectors.rs`/`llm.rs`, `src/lib/api.ts`, and `superconsole-web/src/connector-registry.ts`.
- New cloud command → command in `lib.rs` → wrapper in `api.ts` → SettingsPage section; add the matching server fn in `superconsole-web/src/server/`.

## Web portal (superconsole-web/)

Separate Cloudflare Workers app on the same Turso DB. See `superconsole-web/PROJECT.md` + `CLAUDE.md`. Key files: `src/server/{auth,turso,crypto,data,llm,team,connectors}.ts`, routes under `src/routes/`, shared `src/connector-registry.ts` + `ConnectorManager.tsx`, Drizzle schema `src/db/schema.ts`.

## Do not touch

- `src-tauri/gen/`, `src-tauri/target/`, `dist/`, `node_modules/` — generated.
- `src-tauri/icons/` — regenerate via `cargo tauri icon app-icon.png` instead of editing.
- `components/ui/` — shadcn-managed.
- `files.rs::resolve` and the `ALLOWED` settings whitelist in `lib.rs` — security boundaries.

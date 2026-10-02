# CODEBASE.md

File index for fast navigation. Read ARCHITECTURE.md first.

## Rust backend (src-tauri/src/)

| File | One-liner |
|------|-----------|
| `main.rs` | Entry point, calls `superconsole_lib::run()`. Don't touch. |
| `lib.rs` | All `#[tauri::command]` handlers, plugin registration, app setup (DB init, vector memory init, scheduler/remote spawn). Add new commands here + register in `generate_handler!`. Also hosts the `superconsole mcp --session <token>` CLI subcommand that boots `mcp_server.rs`. |
| `db.rs` / `db/` | SQLite via rusqlite. Consolidated central database `superconsole.db` (50 canonical tables) with modular schemas under `db/schema/` (including `centraldb.rs`). Schema covers workspaces, projects, organizations, jobs, inbox, settings, session_history, chat_messages, chat_sessions, plugins cache, skills/memory/wiki caches, and `memory_vectors`. Migrations are idempotent blocks in `Db::init`. **Helpers**: `get_jobs_by_trigger_type`, `update_job_trigger_config`, `upsert_session_log`, `set_job_attempt`, `reset_job_attempt`, `set_job_next_run_relative`. |
| `vector_memory.rs` | Pure-Rust Native AI Semantic Vector Memory (RAG) store (`VectorMemoryStore`). Stores float vectors as `F32_BLOB(3)` / BLOBs in the `memory_vectors` table of `superconsole.db`. Sub-millisecond in-memory cosine similarity search, upsert, delete, prune, and clear operations. |
| `usage.rs` | 4-tier token and cost aggregation engine (`project_usage`, `org_usage`, `user_usage`, `account_usage`), tracking input tokens, output tokens, `tokens_reasoning`, `tokens_prompt_cached`, and incremental delta calculations for resumed sessions via `get_previous_session_usage`. |
| `userdb.rs` | User-defined database abstraction and management, dynamic schema queries, and SQLite table inspection. |
| `localdb.rs` | Embedded SQLite Studio backend for inspecting and managing local databases (`list_localdb_tables`, schema retrieval, table querying, vector table support). |
| `pty.rs` | PTY sessions via portable-pty. `SessionManager` map keyed by session id string. CLI presets in `cli_command(cli, workspace, resume_id)` (claude/droid/codex/antigravity/shell) incl. per-CLI direct resume flags (`claude --resume <UUID>`, `codex resume <UUID>`, `agy -c`). `.env` parsing, context-file detection, output reader thread → `pty-output` events. On exit screen-scrapes usage and emits a `session-usage` event (tokens + est. cost) for the footer. |
| `files.rs` | Workspace-sandboxed file ops (list/read/write/create/delete). `resolve()` is the path-safety gate — never bypass it. `scaffold_superconsole_dir(path)` auto-generates `.superconsole/` (8 dirs, 12 write-if-missing templates: HEARTBEAT, memory starters, rules, hooks, router agent.md) on every workspace create/import; write-if-missing, never overwrites. |
| `scheduler.rs` | Cron parsing (`next_run`), 30s tick loop (`spawn`), `exec_in_workspace` = the ONE headless executor (scheduler + HTTP + Telegram all use it). Branches on `run_mode`: `cli` (print-mode PTY) / `chat` (one-shot LLM) / `agent` (loads agent.md + sub-mode cli/chat/auto) / `auto` top-level (prepends router agent.md → dispatches as chat; Ruflo-inspired learning loop). `job_command()` builds the CLI line (incl. `codex exec`). `exec_agent` = run a file-defined agent now. `with_available_resources()` parses `@skill:`/`@context:`/`@connector:`/`@agent:` tokens and prepends a one-line availability hint. Calls `remote::check_email_triggers` on every 30s tick. |
| `agents.rs` | Agents = file-defined *definitions* in `.superconsole/agents/<name>/agent.md`. SuperConsole catalog in Turso `agent_catalog`. Repo import/clone + `.superconsole-plugin` support. |
| `cli_sessions.rs` | Reads native CLI transcripts off disk (Claude `~/.claude/projects/<enc>`, Droid `~/.factory/sessions/<enc>`, Codex `~/.codex/sessions/YYYY/MM/DD/*.jsonl` filtered by recorded `cwd`). Multi-CLI resume locator (`find_latest_claude_session_id`, `codex resume <UUID>`, `agy -c`). |
| `remote.rs` | Telegram long-poll: typed update structs, `resolve_route` DM/group decision tree, `handle_telegram_message` with all commands + inline keyboards + free-text chat, `handle_callback_query`, `allowed_user_ids` whitelist, `get_telegram_route_for_workspace`, `notify_telegram_topic`; + HTTP trigger. `check_email_triggers` — polls Gmail for `trigger_type="email"` jobs, persists `last_checked`. |
| `auth.rs` | WorkOS loopback OAuth (`127.0.0.1:4666`), zero OS Keychain dependency (eliminated; session persisted in SQLite `cloud_identity`), in-RAM HKDF key derivation, `upsert_user_and_orgs` + `accept_pending_invitations` to Turso. |
| `cloud.rs` | Turso remote client: pure async libSQL 0.9 via Hrana protocol (`default-features = false, features = ["remote", "tls"]` to guarantee zero C FFI SQLite conflict with rusqlite) + fallback HTTP client (`turso_config`, `turso_execute`, `rows`, `cell_text`, `cell_opt`). |
| `crypto.rs` | AES-256-GCM encrypt/decrypt; deterministic HKDF key from `WORKOS_COOKIE_PASSWORD` cached purely in RAM. Mirrors web `crypto.ts`. Zero OS Keychain prompts. |
| `git.rs` | Handles local Git operations via shell commands (status, commit, push, auto-clearing `index.lock`). Wraps commands in `spawn_blocking` to avoid blocking the Tauri async runtime. |
| `sync_manager.rs` | Pulls Turso config into local `*_cache` tables (startup/manual/org-switch/30min tick) + `sync_on_update`. Also runs `sync_catalogs`: pulls `plugins`, `connector_catalog`, `mcp_catalog`, `commands_catalog`, `hooks_catalog` from Turso → local cache best-effort on every sync. PTY/chat read cache only. |
| `llm.rs` | LLM key CRUD per scope (account/org/project), `ensure_workspace_project` (locked + idempotent), `session_env` resolution, provider streaming adapters, `one_shot_completion` (non-streaming, used by chat-mode jobs). `list_openrouter_models` (cached hourly via OpenRouter `/api/v1/models`; id/name/context/pricing/reasoning support, filtered to text-output + recent, newest-first) and `or_price_per_token` for live chat costing. |
| `chat.rs` | Native chat: streams tokens via `chat-*` events through Anthropic/OpenAI-compatible/Gemini/OpenRouter adapters; cancellable; `tool_mode` and `reasoning` effort; system prompt from context files + connected services + skills/memory/wiki; native tool-calling loop via `mcp::execute`. `chat-done` carries `tokens_prompt`/`tokens_completion`/`tokens_reasoning`/`cost_usd`. 3-layer compaction: L1=prune oldest 50% (skip `role:"system"`), L2=LLM structured summary appended to `.superconsole/sessions/<id>.md` + `upsert_session_log`, L3=replace pruned block with single `role:"user"` context message. |
| `context.rs` | On-demand project context files (brand/voice/style-guide etc.): `scan`/`read_body`/`search` over the workspace; surfaced to chat via the `context_*` MCP tools and the ContextDialog. |
| `commands.rs` | Cross-CLI + global slash commands: discovery/expansion shared across CLIs and native chat. |
| `mcp.rs` | In-process MCP tool layer: `ToolCtx` (+ AES-encrypted session token, 30-day TTL), `ToolSpec` registry (always-loaded + context tools + generic `connector_request` + dedicated `web_search` when connected), BM25-lite tool search, `execute`, `native_ctx`. `write_mcp_config`/`ensure_mcp_config` auto-write + pre-approve the `superconsole` server for Claude (`.mcp.json`) and Droid (`.factory/mcp.json`). |
| `mcp_server.rs` | stdio JSON-RPC MCP server (launched by `superconsole mcp --session <token>`); proxies tool calls into `mcp::execute`. |
| `skills.rs` | Skills registry CRUD; local cache + Turso sync; injected into chat/CLI system prompt. |
| `memory.rs` | Long-term memory CRUD; local cache + Turso sync; injected into system prompt. |
| `wiki.rs` | Project wiki CRUD; local cache + Turso sync; injected into system prompt. |
| `rules.rs` | Workspace rules CRUD; reads/writes `.superconsole/rules/` markdown rule definitions. |
| `session_logs.rs` | Session log ingestion and summaries for workspace audit trails. |
| `hooks.rs` | Lifecycle hook executor. Reads `.superconsole/hooks/<type>.sh`, runs as a non-blocking `Command` with a 10 s timeout. Hook types: `session-start`/`session-end` (called from `pty.rs`), `before-prompt` (called from `chat.rs`), `before-mcp` (called from `mcp.rs`), `before-shell` (called from `scheduler.rs`). Tauri commands: `list_hooks`, `read_hook`, `write_hook`, `delete_hook`. |
| `plugins.rs` | Plugin marketplace backend. Local catalog CRUD via `db.rs` (`list_plugins_catalog`, `search_plugins_catalog`, `get_plugin`). Install: `install_plugin` writes skills to `.superconsole/skills/`, patches `.mcp.json`, copies hook scripts. `install_plugin_from_url` fetches manifest (`superconsole.json`/`plugin.json`) from GitHub using the Trees API, then runs the same path. `uninstall_plugin` undoes all installs and removes the `workspace_plugins` record. `submit_plugin_to_cloud` writes directly to the Turso `plugins` table via `cloud::turso_execute` (INSERT … ON CONFLICT DO UPDATE). Workspace install state is tracked in `workspace_plugins`. |
| `team.rs` | Org + project membership and invitation CRUD; permission checks (owner/admin manage, last-owner guard, members must be org members). |
| `connectors.rs` | Connector `REGISTRY` (fields + env mapping; incl. `web_search` → `TAVILY_API_KEY`; Telegram project-scope adds `bot_token` optional override, `chat_id` required, `thread_id` optional, `allowed_user_ids` optional), encrypted-blob CRUD with per-scope required-field validation (org: `bot_token` required; project: `chat_id` required), `project_telegram_bots` (5-tuple incl. `allowed_user_ids`), `get_telegram_route_for_workspace` (outbound routing helper), `session_env` injection (project→org + account fallback), `connected_services`, `resolve_connector_fields`. Test endpoints for connectors exist in the web portal. |

Config: `tauri.conf.json` (window/titlebar/updater/bundle), `capabilities/default.json` (permissions), `Cargo.toml` (deps). Cloud config in gitignored root `.env`.

## Frontend (src/)

| File | One-liner |
|------|-----------|
| `main.tsx` | Renders `RouterProvider`. |
| `router.tsx` | Route tree, `Shell` layout (sidebar + topbar + tabstrip + terminal host), `Welcome`, dashboard mode (`isDashboard` transparent topbar + centered hero button `dark:bg-[#ffffff] dark:text-[#000000]`), route components. |
| `index.css` | THE design system: all color tokens (light + dark), fonts, radii. |
| `lib/api.ts` | Every backend command as a typed function + all shared types (`Workspace`, `Job`, `InboxItem`, `SessionTab`, `VectorMemoryItem`, ...) + `CLI_PRESETS`. |
| `lib/workspace-context.tsx` | Global state: workspaces, orgs, tabs per workspace, live sessions. All mutations go through its actions. |
| `lib/auth-context.tsx` | Cloud identity state: WorkOS user, orgs, active cloud org; `ensureWorkspaceProject` helper. |
| `lib/utils.ts` | `cn()` only. |
| `components/TerminalView.tsx` | xterm instance per tab (WebGL renderer, Nerd Font, waits for `document.fonts.ready` before fit/start, clears the texture atlas on resize). Starts session, streams events, debounced resize, exit overlay. Optional rich-text input with live `/` slash autocomplete. Uses the shared `StatusFooter`. |
| `components/ComposerPlusMenu.tsx` | Reusable `[+]` menu component used by ChatComposer and TerminalView. Exposes Skills, Agents, Connectors, Context, Commands, Sessions, and Web Search. Submenus insert full `/prefix:name` tokens. |
| `components/BrowserView.tsx` | Native embedded webview tab (powered by Tauri/Wry) for browsing URLs, reading docs, or executing Google searches directly within the workspace. Handles custom search redirection and manages layer visibility via macOS-compatible opacity toggling. |
| `components/ChatView.tsx` | Native chat, tab-per-session (picker box of last 10 chats / draft / concrete session by `tabId`). Streams `chat-*` events; accumulates session stats from `chat-done`. |
| `components/ChatComposer.tsx` | Boxed composer. Uses `ComposerPlusMenu` for the `[+]` menu. Unified OpenRouter-backed provider/model selector, thinking/reasoning effort, agent mode, attachments, paste-as-doc, send/stop. Slash `/` autocomplete. |
| `components/StatusFooter.tsx` | Shared bottom status bar (git diff stat via `git_info`, files toggle, `~/workspace`, branch, optional ctx limit percentage + token·cost) with a `leftExtra` slot; wraps on narrow widths. |
| `components/TopBar.tsx` | Traffic-light padding (macOS `[🔴 🟡 🟢]` at x:18, y:22 safe container), sidebar toggle, back/forward, workspace name + dynamic tab suffix, responsive left-margin, transparent and borderless when `isDashboard` is true (`border-b-0 bg-transparent`), jobs/files/theme buttons. |
| `components/Sidebar.tsx` | Sidebar with width `w-60` (15rem / 240px), search bar with 50% right padding reduction (`pl-2 pr-1`), border-r only (`border-r border-sidebar-border`), workspace item dropdown (3 dots menu) with flags (`isActive`, `isPublic`, `showUsage`, `showTeam`) and settings navigation, org dropdown, Inbox/Tasks/Agents/Sessions/Usage navigation, and collapsed `SidebarRail`. |
| `components/localdb/` | LocalDB Studio suite (`LocalDBStudio.tsx`, `LocalDBTables.tsx`, `LocalDBSchema.tsx`, `LocalDBData.tsx`) for live exploration and querying of `superconsole.db` tables, including `memory_vectors`. |
| `components/UsageView.tsx` | Analytics dashboard displaying 4-tier token usage and cost metrics across accounts, orgs, projects, and sessions with breakdown of reasoning and cached prompt tokens. |
| `components/UserDBSection.tsx` | Interface for inspecting and managing user database tables and running queries. |
| `components/settings/profile.tsx` | User profile management, organization details, and account settings. |
| `components/navbars/` | Dedicated top navigation bars for primary views (`AgentsNavbar.tsx`, `CustomizeNavbar.tsx`, `InboxNavbar.tsx`, `SessionsNavbar.tsx`, `SettingsNavbar.tsx`, `TasksNavbar.tsx`, `UsageNavbar.tsx`). |
| `components/ContextDialog.tsx` | Manage on-demand project context files. |
| `components/ProviderIcon.tsx` | Provider/product brand icons (Claude/Grok/Kimi/GLM/Gemini/OpenAI…) chosen from a model id. |
| `components/LoginScreen.tsx` | WorkOS sign-in entry (pre-auth gate). |
| `components/AccountMenu.tsx` | Signed-in user menu (org switch, sign out). |
| `components/TabStrip.tsx` | Per-workspace tabs + browser-style "+" dropdown (new terminal/chat) + CLI launcher icons. |
| `components/SkillsDialog.tsx` | TopBar skill browser: My Skills · Commands · Browse Library (Turso catalog) · New / Import from URL. |
| `components/SkillsSettings.tsx` | Settings-page skills section (account-global + project tab). |
| `components/CommandInput.tsx` | Slash-command textarea with autocomplete dropdown. |
| `components/TaskFormContent.tsx` | Unified task form used by every task-creation/edit surface (TasksView, JobsDialog). |
| `components/AgentRunEditDialog.tsx` | Shared agent edit dialog extracted from AgentsView. |
| `components/FilePanel.tsx` | Lazy file tree, create/delete, 4s auto-refresh. |
| `components/FileEditor.tsx` | Full CodeMirror editor with syntax highlighting, dirty-state tracking, Cmd+S save, and side-by-side markdown preview. |
| `components/InboxView.tsx` | Inbox feed, markdown output, approve/reject flow. |
| `components/TasksView.tsx` | Org-wide task list (list + calendar views) with relative next-run chips and action buttons. |
| `components/JobsDialog.tsx` | Per-workspace job list dialog: renders job list with mode icons + session history. |
| `components/SessionsView.tsx` | Full-width history page: CLI tab (session_history + native on-disk sessions per CLI) and Chat tab. |
| `components/CustomizePage.tsx` | Plugin marketplace + Hooks editor at `/customize?ws=<id>`. |
| `components/PluginIcon.tsx` | Brand logo mapping via `@ridemountainpig/svgl-react`. |
| `components/SettingsPage.tsx` | /settings page: section nav; Account/Security, General, Appearance, Integrations, API Keys, Models, Teams, Connectors. |
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
- New plugin → add row to Turso `plugins` table (via Publish dialog or direct SQL) → sync pulls it into local `plugins_cache` on next startup/30-min tick → visible in `CustomizePage`.
- New hook integration point → call `hooks::run_hook(HookType::X, &path)` in the relevant Rust module; register the hook type in `hooks.rs::HookType` enum.
- Schema change (local) → idempotent migration in `db.rs::Db::init`.
- Schema change (cloud) → add to `superconsole-web/src/db/schema.ts` + run `node scripts/push-catalog-tables.mjs` (or `drizzle-kit push`) + matching idempotent `ensure_*` in the relevant Rust module.
- New connector/LLM provider → mirror in `connectors.rs`/`llm.rs`, `src/lib/api.ts`, and `superconsole-web/src/connector-registry.ts`.
- New cloud command → command in `lib.rs` → wrapper in `api.ts` → SettingsPage section; add the matching server fn in `superconsole-web/src/server/`.

## Web portal (superconsole-web/)

Separate Cloudflare Workers app on the same Turso DB. Upgraded to Tailwind v4, shadcn/ui, and TanStack Start. See `superconsole-web/PROJECT.md` + `CLAUDE.md`. Key files: `src/server/{auth,turso,crypto,data,llm,team,connectors}.ts`, routes under `src/routes/` (incl. connector testing logic), shared `src/connector-registry.ts` + `ConnectorManager.tsx`, Drizzle schema `src/db/schema.ts`.

## Do not touch

- `src-tauri/gen/`, `src-tauri/target/`, `dist/`, `node_modules/` — generated.
- `src-tauri/icons/` — regenerate via `cargo tauri icon app-icon.png` instead of editing.
- `components/ui/` — shadcn-managed.
- `files.rs::resolve` and the `ALLOWED` settings whitelist in `lib.rs` — security boundaries.

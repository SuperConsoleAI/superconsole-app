# ARCHITECTURE.md

SuperConsole is a Tauri 2 desktop app: Rust backend (system-level) + React 19 frontend (UI). It is **local-first with an optional cloud layer**: terminals, jobs, files, inbox, and chat live in local SQLite + runtime memory, while identity, org/project config, team membership, LLM keys, and connector credentials sync to a shared Turso (libSQL) cloud DB via WorkOS auth. A companion web portal (`superconsole-web/`, Cloudflare Workers) is a second surface onto the same Turso DB.

## High-level data flow

```
React UI ──invoke()──► Tauri commands (src-tauri/src/lib.rs)
   ▲                        │
   │ listen()               ├─► db.rs / localdb.rs  Local SQLite (superconsole.db, 50 canonical tables,
   │                        │                        LocalDB Studio browser, session_history, chat_messages)
 events                     ├─► vector_memory.rs     Native AI Semantic Vector Memory (RAG, cosine search, BLOB embeddings)
 pty-output                 ├─► pty.rs              portable-pty sessions (one per tab, keyed "wsId:cli" / "wsId:shell-N")
 pty-exit                   ├─► files.rs            sandboxed file ops inside workspace folder
 inbox-new                  ├─► scheduler.rs        30s tick loop → runs due cron jobs headless → inbox
 chat-token                 ├─► remote.rs           Telegram long-poll bot + HTTP server (127.0.0.1)
 chat-done                  ├─► auth.rs             WorkOS loopback OAuth (127.0.0.1:4666) + SQLite cloud_identity + in-RAM HKDF key derivation (100% OS Keychain eliminated)
 chat-error                 ├─► cloud.rs            Turso libSQL async remote client (libsql_connect via Hrana) + HTTP pipeline
                            ├─► userdb.rs           UserDB client & off-platform privacy lifecycle management
                            ├─► crypto.rs           AES-256-GCM (deterministic in-RAM HKDF, zero keychain dependencies)
                            ├─► usage.rs            4-tier usage aggregation (project, org, user, account) + reasoning/cache costing
                            ├─► sync_manager.rs     pulls Turso config → local *_cache; syncs global catalogs
                            ├─► git.rs              shell-based Git operations via tokio::task::spawn_blocking
                            ├─► llm.rs              LLM key CRUD (project>org>account) + session_env + chat adapters + one_shot
                            ├─► chat.rs             native chat: token streaming + native tool loop + 3-layer compaction
                            ├─► context.rs          on-demand project context files → context_* MCP tools
                            ├─► commands.rs         cross-CLI + global slash command discovery/expansion
                            ├─► mcp.rs              in-process tool layer (+ web_search tool) + write_mcp_config
                            ├─► mcp_server.rs       stdio JSON-RPC MCP server (superconsole mcp --session <token>)
                            ├─► skills.rs / memory.rs / wiki.rs  registry CRUD synced to Turso, injected into prompts
                            ├─► hooks.rs            lifecycle hook executor (.superconsole/hooks/<type>.sh)
                            ├─► plugins.rs          plugin marketplace: catalog CRUD, install, GitHub URL install, submit
                            ├─► team.rs             org/project membership + invitations CRUD
                            └─► connectors.rs       connector credentials CRUD + session_env injection
```

- UI never touches disk/processes/cloud directly; everything goes through `invoke()` commands.
- **Web portal** (`superconsole-web/`): A Cloudflare Workers (TanStack Start, React 19, Tailwind v4, shadcn/ui) surface acting directly against the exact same Turso DB. Code is entirely separate from the Tauri app but shares the same Drizzle schema. It implements the WorkOS OAuth callback flow, syncs organizations + memberships into Turso, and serves as the team management / cloud config dashboard. Note: the web portal manages the *metadata* (which connectors are authorized, which APIs exist); the local app reads that metadata and makes the actual API calls from the user's secure perimeter.
- PTY output streams via Tauri events (`pty-output` with `session_id`), filtered per terminal in the frontend; `session-usage` is emitted on exit (screen-scraped tokens + est. cost) for the footer. Chat streams via `chat-token`/`chat-done`/`chat-error`, where `chat-done` carries `tokens_prompt`/`tokens_completion`/`tokens_reasoning`/`tokens_prompt_cached`/`cost_usd` (cost prefers OpenRouter live pricing).
- Three trigger paths (scheduler, HTTP `/trigger`, Telegram) all funnel into `scheduler::exec_in_workspace`, so results consistently land in the Inbox. After recording, `run_and_record` also calls `notify_telegram` (global bot) and `notify_telegram_topic` (per-project topic via `get_telegram_route_for_workspace`).
- **Session page routing** — `session_history` and `chat_sessions` each carry `job_id` and `agent_id` columns, used to route rows to the right surface:
  - Sessions page: `job_id IS NULL AND agent_id IS NULL` → `list_user_sessions`
  - Agent Activity tab: `agent_id IS NOT NULL` → `list_agent_sessions(workspace_id, agent_name)`
  - Tasks Activity tab: `job_id IS NOT NULL AND agent_id IS NULL` → `list_all_job_sessions`

## Cloud layer (identity + sync)

- **Source of truth split**: Turso owns identity/org/project/team/keys/connectors; local SQLite owns everything agents do (terminals, jobs, inbox, chat, files). Only config/identity goes to cloud; agent activity never leaves the device.
- **Auth & Keychain Elimination**: `auth.rs` runs a one-shot loopback server on `127.0.0.1:4666`, opens the WorkOS hosted page, and exchanges the code via `/user_management/authenticate`. Auth session credentials are stored directly in the `cloud_identity` SQLite table, with encryption key derivation executing via deterministic in-RAM HKDF-SHA256 (`AuthState::load_from_db`). All dependency on the OS Keychain (`keyring` crate) has been 100% eliminated, avoiding macOS Keychain prompt stalls.
- **Turso libSQL Client Integration**: In addition to HTTP fallbacks, `cloud.rs` provides `libsql_connect` using `libsql` compiled with pure remote features (`default-features = false, features = ["remote", "tls"]`). This completely decouples embedded C FFI from `rusqlite bundled`, permanently eliminating SQLite threading misuse conflicts (`SQLITE_MISUSE = 21`) while enabling pooled Hrana client connectivity to CentralDB and UserDB.
- **Sync cache**: Turso is queried only on app start, explicit refresh, org switch, and a 30-minute tick (`sync_manager.rs`). Results land in local `*_cache` tables; PTY/chat env injection reads the cache only, never Turso live.
- **Encryption**: LLM keys and connector credentials are AES-256-GCM encrypted (`crypto.rs`), key derived via HKDF-SHA256 from `WORKOS_COOKIE_PASSWORD`. The desktop `crypto.rs` and web `crypto.ts` are byte-for-byte compatible, so secrets set on either surface decrypt on both.
- **Resolution precedence**: LLM keys and connectors resolve project → org → account/local → `.env` → skip; project always overrides org. Project rows are created idempotently and under a lock (`llm.rs::ensure_workspace_project`) to avoid duplicate cloud rows.

## Agent capabilities (Vector Memory, MCP, skills, memory, wiki)

- **Semantic Vector Memory (RAG)** (`vector_memory.rs`): In-process vector database stored within `superconsole.db` in the `memory_vectors` table (BLOB embeddings). High-performance cosine distance search executed in pure Rust across float vectors without external dynamic library dependencies. Exposes Tauri commands for `vector_memory_upsert`, `vector_memory_search`, `vector_memory_list`, and `vector_memory_delete`.
- **MCP tool layer** (`mcp.rs`): one in-process registry of `ToolSpec`s serves both native chat (`mcp::execute`) and an external stdio MCP server (`mcp_server.rs`, launched via `superconsole mcp --session <token>`). Tools are always-loaded, context-gated (incl. `context_*` over `context.rs`), the generic `connector_request`, or the dedicated `web_search` tool (present only when the `web_search`/Tavily connector is connected; kept out of the generic passthrough); a BM25-lite search lets agents find tools without loading every schema. `write_mcp_config` auto-writes + pre-approves the `superconsole` server for Claude/Droid per session (Codex has no project-scoped MCP config, so it is intentionally not wired).
- **Agents** (`agents.rs`): an agent is a reusable *definition* in `.superconsole/agents/<name>/agent.md` (instructions + skills + connectors + context; no harness/model/schedule). Three run modes chosen at task-creation time: **CLI** (headless PTY print-mode via claude/droid/codex/etc.), **Chat** (native streaming one-shot), and **Auto** (router agent reads `.superconsole/memory/patterns.md` + available agents/skills and routes to the best approach — inspired by the Ruflo/Claude Flow `Router → Swarm → Agents → Memory` pipeline). `scheduler::exec_in_workspace` branches on `run_mode`; the `auto` branch prepends the router's `agent.md` to the prompt and dispatches as `chat`. `with_available_resources` turns `@skill:`/`@context:`/`@connector:`/`@agent:` tokens in the instructions into a one-line availability hint. The **AgentRunEditDialog** (`src/components/AgentRunEditDialog.tsx`) is the shared edit component used in both the Agents page and the Task form — it owns the `[CLI][Chat][Auto]` harness picker, schedule picker, and model selection. A SuperConsole-owned catalog (Turso `agent_catalog` + files in a public repo) is browsable in the sidebar; any GitHub repo can be imported as a catalog agent or cloned into a new project, and repos self-describe via a `.superconsole-plugin/` manifest (falling back to `.claude-plugin/` or README). `files.rs::scaffold_superconsole_dir` auto-generates the full `.superconsole/` structure on every workspace create/import — 8 dirs, 12 write-if-missing templates: HEARTBEAT.md, 5 memory starters, context/about.md, 2 rules (`minimal-code.mdc` always-on 7-rung minimal-code rule, `no-destructive-ops.mdc`), 2 hooks (`session-end.sh` = learning-loop memory update, `before-prompt.sh` = date/branch/heartbeat), `agents/router/agent.md` (routes via memory, ends with `memory_write` after success). See `AGENT_SYSTEM_NEW.md`.
- **Skills / memory / wiki** (`skills.rs`/`memory.rs`/`wiki.rs`, phases 18-20): registry CRUD mirrored to Turso (Drizzle migrations) and cached locally; their content is injected into the chat/CLI system prompt alongside context files and connected services. Each has a TopBar dialog.
- **Native CLI sessions & Direct Resume** (`cli_sessions.rs`, `pty.rs`): list and resume on-disk transcripts from Claude/Droid/Codex/Antigravity; resume relaunches the CLI in a new terminal tab with auto-resolved latest session UUIDs (`claude --resume <UUID>`, `codex resume <UUID>`, `agy -c`), bypassing interactive TUI selection pickers.
- **4-Tier Usage Monitoring & Delta Accounting** (`usage.rs`): every chat/CLI turn records a usage event (chat from API usage blocks, PTY by screen-scrape or JSONL transcript parser on exit). Raw `usage_events` are local-only; incremental token and cost deltas are computed against parent sessions (`get_previous_session_usage`) to avoid double counting on resumed sessions. Rolling aggregates roll up into four distinct tiers:
  1. `project_usage`: Per-workspace token, cost, and session counts.
  2. `org_usage`: Organization-level aggregation across all projects and members.
  3. `user_usage`: Individual user spend across projects.
  4. `account_usage`: Global account totals.
  Includes full support for reasoning tokens (`tokens_reasoning`) and prompt cache hits (`tokens_prompt_cached`).

## Frontend structure

- `src/router.tsx` is the spine: TanStack Router (memory history), code-based route tree, and the `Shell` layout.
- Routes: `/` (dashboard / welcome), `/workspace/$workspaceId` (+ search params `file`, `files`), `/inbox`, `/tasks`, `/sessions` (history: CLI + chat threads), `/usage` (usage monitoring), `/customize` (+ `?ws=<id>` — plugin marketplace + hooks editor), `/settings` (tab + section search params: `?tab=account|org|project|profile&section=Skills|Connectors|Commands|Context|Messaging`).
- CRITICAL: terminals are rendered in the root layout (`Shell`), NOT inside route outlets. Routes only control visibility. This keeps PTY sessions alive across navigation.
- Tabs are typed: terminal tabs render `TerminalView`, chat tabs (`{workspaceId}:chat`) render `ChatView`, and browser tabs (`{workspaceId}:browser`) render `BrowserView` (using a native overlay that is hidden via opacity when inactive). The router picks the view by `tab.cli`; chat and browser are their own tab types, not a per-tab toggle.
- `TerminalView` and `ChatView` share `StatusFooter` (git stat / files toggle / branch / token·cost, with a `leftExtra` slot). Chat uses `ChatComposer` (OpenRouter-backed model selector, reasoning, agent mode, web search, attachments) and quick-prompt chips; the terminal exposes an optional rich-text input + file-path attach.
- **Dashboard View**: When on `/` (`isDashboard`), `TopBar` renders a transparent borderless header maintaining the left-side titlebar and window control clearance, while displaying a clean centered hero state with a prominent action button styled with `dark:bg-[#ffffff] dark:text-[#000000]`.
- **Sidebar & Layout**: Sidebar width is standardized to `w-60` (15rem = 240px). The top search bar features a 50% reduced right-end padding (`pl-2 pr-1`), and each workspace item includes a three-dot context dropdown menu allowing developers to toggle `isActive`, `isPublic`, `showUsage`, and `showTeam` flags.
- **Slash-command UX**: both `ChatComposer` and `TerminalView` rich input support `/` autocomplete. Items come from `lib/slash-items.ts` (`loadSlashItems`, plus the builtin `/compact`) in ChatComposer, and from an async `ensureCtx()` in TerminalView that loads skills/context/commands/connectors/agents/sessions lazily on first `/` keypress. Items are memoized via `useMemo` and suggestions recompute reactively via `useEffect([allSlashItems, slashToken])`. Slash tokens are colour-coded in TerminalView (amber=skill, blue=context, green=command, purple=connector, teal=agent, grey=session).
- **`[+]` menus**: `ChatComposer` and `TerminalView` both use the shared `ComposerPlusMenu` component to expose a `[+]` dropdown with per-type submenus (Skills, Agents, Context, Commands, Sessions). Each submenu item shows a **clean name** only (no `/prefix:` in the display); on click it inserts the full `/prefix:name` token. Every submenu has a `[+ Add …]` footer that navigates to the correct settings tab+section via `router.navigate({ to: "/settings", search: { tab, section } })`. The Connectors menu shows project, org, and account scoped connectors in a unified flat panel (with tool access settings). Token routing in TerminalView: rich input open → insert into textarea; closed → write to live PTY buffer (no `\r`).
- **Session logs**: `.superconsole/sessions/` holds structured session-log files (opt-in, not raw CLI history). Listed via `api.listSessionLogFiles(workspaceId)` and accessible as `/session:id` tokens. The `SessionLogFile` type carries `id`, `summary?`.
- Shared state lives in `WorkspaceProvider` (src/lib/workspace-context.tsx): workspaces, organizations, per-workspace tab sets, live sessions, active org (localStorage). Cloud identity/session state lives in `AuthProvider` (src/lib/auth-context.tsx): WorkOS user, orgs, active cloud org.
- Layout: full-width `TopBar` (holds macOS traffic lights via titleBarStyle Overlay + drag region; dynamically appends the active context suffix like file name or tab context via an en dash `–` and smoothly aligns left-margin with sidebar state) → below it `Sidebar`/`SidebarRail` + content column (`TabStrip` → terminal/editor + optional `FilePanel`).

## Key decisions and why

- Tauri 2 over Electron: <30MB target, real native shell.
- Sessions keyed by string session id, namespaced per workspace (`"3:claude"`, `"3:shell-1718..."`): allows multiple CLIs running concurrently per workspace, isolated tab sets per workspace.
- Scheduler is a 30s SQLite-driven tick loop, not an in-memory cron scheduler: job edits apply instantly and runs missed during laptop sleep fire on next tick after wake.
- xterm.js (real terminal) instead of markdown chat for sessions: agent CLIs are full TUIs; markdown rendering is used where it fits (Inbox, file editor preview). The terminal uses the WebGL renderer + a bundled JetBrains Mono Nerd Font; it waits for `document.fonts.ready` before the first fit (so cols/rows match real cell metrics) and clears the texture atlas on resize to avoid stale-glyph artifacts.
- Headless job runs use CLI print modes (`claude -p`, `droid exec`, `codex exec`), a chat one-shot, or an `agent` (instructions from a file + harness/model from the job), selected by the job's `run_mode`; triggers are cron/manual/api/github. A fourth mode, `auto`, prepends the router agent's instructions and dispatches as `chat` — the router reads project memory and available agents to pick the best approach each run (Ruflo-inspired learning loop; router writes back to `memory/patterns.md` via `memory_write` after success). All task creation and editing flows through the shared **`TaskFormContent`** component (org/project picker, run-via `[CLI][Chat][Agent][Auto]`, agent sub-harness `[CLI][Chat][Auto]`, schedule frequency, connector restrictions, OpenRouter model picker) mounted by both the `/tasks` page dialogs and the per-workspace `JobsDialog`. Shell is not offered as a CLI preset for headless jobs; Browser is a tab type, not a runner.
- One MCP tool layer for two transports (native chat loop + stdio server) keeps tool behavior identical whether an agent runs inside SuperConsole's chat or an external CLI.
- Unified Database (`superconsole.db`): all local entities, vector embeddings, and cached catalogs live in the single canonical SQLite database with 50 schemas, inspectable live in LocalDB Studio.

## Folder map

```
/                       Tauri + Vite project root (plan.md, start.md, app-icon.png)
src/                    React frontend
  router.tsx            route tree + Shell layout (start here)
  lib/                  api.ts (invoke wrappers + types), workspace-context.tsx, utils.ts
  components/           feature components (TerminalView, TabStrip, Sidebar, FilePanel, ...)
  components/localdb/   LocalDB Studio (table viewer, vector inspection)
  components/settings/  Settings sections (profile.tsx, privacy toggles)
  components/ui/        shadcn CLI-generated primitives (do not hand-edit; regenerate)
  assets/icons/preset-icons/  CLI brand SVGs + index.ts lookup
src-tauri/              Rust backend
  src/lib.rs            all #[tauri::command] handlers + app setup
  src/{db,pty,files,scheduler,remote,cli_sessions,usage,context,commands}.rs   local-first modules per concern
  src/{vector_memory,localdb,userdb}.rs  vector embeddings, local studio, UserDB client
  src/{auth,cloud,crypto,sync_manager,llm,chat,team,connectors,skills,memory,wiki}.rs   cloud layer
  src/{mcp,mcp_server}.rs   in-process tool layer + stdio MCP server
  src/{hooks,plugins}.rs    lifecycle hooks executor + plugin marketplace backend
  src/db/schema/        canonical database schemas (localdb.rs, centraldb.rs, userdb.rs)
  tauri.conf.json       window (Overlay titlebar), bundling, updater config
  capabilities/default.json  permission grants
  icons/                generated by `cargo tauri icon app-icon.png`
  superconsole-web/       Cloudflare Workers web portal (TanStack Start, Tailwind v4, shadcn, own PROJECT.md/CLAUDE.md)
```

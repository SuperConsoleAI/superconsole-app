# ARCHITECTURE.md

SuperConsole is a Tauri 2 desktop app: Rust backend (system-level) + React 19 frontend (UI). It is **local-first with an optional cloud layer**: terminals, jobs, files, inbox, and chat live in local SQLite + runtime memory, while identity, org/project config, team membership, LLM keys, and connector credentials sync to a shared Turso (libSQL) cloud DB via WorkOS auth. A companion web portal (`superconsole-web/`, Cloudflare Workers) is a second surface onto the same Turso DB.

## High-level data flow

```
React UI ──invoke()──► Tauri commands (src-tauri/src/lib.rs)
   ▲                        │
   │ listen()               ├─► db.rs         SQLite (workspaces, orgs, jobs, inbox, settings, session_history,
   │                        │                  chat_messages, *_cache tables synced from Turso)
 events                     ├─► pty.rs        portable-pty sessions (one per tab, keyed "wsId:cli" / "wsId:shell-N")
 pty-output                 ├─► files.rs      sandboxed file ops inside workspace folder
 pty-exit                   ├─► scheduler.rs  30s tick loop → runs due cron jobs headless → inbox
 inbox-new                  ├─► remote.rs     Telegram long-poll bot + local tiny_http server (127.0.0.1)
 chat-token                 │
 chat-done                  │   ── cloud layer ──
 chat-error                 ├─► cli_sessions.rs read/resume native CLI transcripts off disk (claude/droid/codex)
                            ├─► auth.rs       WorkOS loopback OAuth (127.0.0.1:4666) + keyring; upserts user/orgs to Turso
                            ├─► cloud.rs      Turso HTTP exec helper (turso_execute / rows / cell_*)
                            ├─► crypto.rs     AES-256-GCM (HKDF from WORKOS_COOKIE_PASSWORD); key cached in keychain
                            ├─► sync_manager.rs  pulls Turso config → local *_cache (startup/manual/org-switch/30min)
                            ├─► llm.rs        LLM key CRUD (project>org>account) + session_env + chat adapters + one_shot
                            ├─► chat.rs       native chat: streams provider tokens + native tool loop (mcp::execute)
                            ├─► mcp.rs        in-process tool layer + write_mcp_config (Claude/Droid auto-wire + pre-approve)
                            ├─► mcp_server.rs stdio JSON-RPC MCP server (superconsole mcp --session <token>)
                            ├─► skills.rs / memory.rs / wiki.rs  registry CRUD synced to Turso, injected into prompts
                            ├─► team.rs       org/project membership + invitations CRUD
                            └─► connectors.rs connector credentials CRUD + session_env injection
```

- UI never touches disk/processes/cloud directly; everything goes through `invoke()` commands.
- PTY output streams via Tauri events (`pty-output` with `session_id`), filtered per terminal in the frontend. Chat streams via `chat-token`/`chat-done`/`chat-error`.
- Three trigger paths (scheduler, HTTP `/trigger`, Telegram `/run`) all funnel into `scheduler::exec_in_workspace`, so results consistently land in the Inbox and notify Telegram.

## Cloud layer (identity + sync)

- **Source of truth split**: Turso owns identity/org/project/team/keys/connectors; local SQLite owns everything agents do (terminals, jobs, inbox, chat, files). Only config/identity goes to cloud; agent activity never leaves the device.
- **Auth**: `auth.rs` runs a one-shot loopback server on `127.0.0.1:4666`, opens the WorkOS hosted page, exchanges the code via `/user_management/authenticate`, and stores the session in the OS keychain. On login it upserts the user + orgs to Turso and accepts email-matched pending invitations.
- **Sync cache**: Turso is queried only on app start, explicit refresh, org switch, and a 30-minute tick (`sync_manager.rs`). Results land in local `*_cache` tables; PTY/chat env injection reads the cache only, never Turso live.
- **Encryption**: LLM keys and connector credentials are AES-256-GCM encrypted (`crypto.rs`), key derived via HKDF-SHA256 from `WORKOS_COOKIE_PASSWORD`. The desktop `crypto.rs` and web `crypto.ts` are byte-for-byte compatible, so secrets set on either surface decrypt on both.
- **Resolution precedence**: LLM keys and connectors resolve project → org → account/local → `.env` → skip; project always overrides org. Project rows are created idempotently and under a lock (`llm.rs::ensure_workspace_project`) to avoid duplicate cloud rows.

## Agent capabilities (MCP, skills, memory, wiki)

- **MCP tool layer** (`mcp.rs`): one in-process registry of `ToolSpec`s serves both native chat (`mcp::execute`) and an external stdio MCP server (`mcp_server.rs`, launched via `superconsole mcp --session <token>`). Tools are always-loaded, context-gated, or the generic `connector_request`; a BM25-lite search lets agents find tools without loading every schema. `write_mcp_config` auto-writes + pre-approves the `superconsole` server for Claude/Droid per session (Codex has no project-scoped MCP config, so it is intentionally not wired).
- **Skills / memory / wiki** (`skills.rs`/`memory.rs`/`wiki.rs`, phases 18-20): registry CRUD mirrored to Turso (Drizzle migrations) and cached locally; their content is injected into the chat/CLI system prompt alongside context files and connected services. Each has a TopBar dialog.
- **Native CLI sessions** (`cli_sessions.rs`): list and resume on-disk transcripts from Claude/Droid/Codex; resume relaunches the CLI in a new terminal tab with the per-CLI resume flag.

## Frontend structure

- `src/router.tsx` is the spine: TanStack Router (memory history), code-based route tree, and the `Shell` layout.
- Routes: `/` (welcome), `/workspace/$workspaceId` (+ search params `file`, `files`), `/inbox`, `/tasks`, `/sessions` (history: CLI + chat threads), `/settings`.
- CRITICAL: terminals are rendered in the root layout (`Shell`), NOT inside route outlets. Routes only control visibility. This keeps PTY sessions alive across navigation.
- Tabs are typed: terminal tabs render `TerminalView`, chat tabs (`{workspaceId}:chat`) render `ChatView`. The router picks the view by `tab.cli`; chat is its own tab type, not a per-tab toggle.
- Shared state lives in `WorkspaceProvider` (src/lib/workspace-context.tsx): workspaces, organizations, per-workspace tab sets, live sessions, active org (localStorage). Cloud identity/session state lives in `AuthProvider` (src/lib/auth-context.tsx): WorkOS user, orgs, active cloud org.
- Layout: full-width `TopBar` (holds macOS traffic lights via titleBarStyle Overlay + drag region) → below it `Sidebar`/`SidebarRail` + content column (`TabStrip` → terminal/editor + optional `FilePanel`).

## Key decisions and why

- Tauri 2 over Electron: <30MB target, real native shell.
- Sessions keyed by string session id, namespaced per workspace (`"3:claude"`, `"3:shell-1718..."`): allows multiple CLIs running concurrently per workspace, isolated tab sets per workspace.
- Scheduler is a 30s SQLite-driven tick loop, not an in-memory cron scheduler: job edits apply instantly and runs missed during laptop sleep fire on next tick after wake.
- xterm.js (real terminal) instead of markdown chat for sessions: agent CLIs are full TUIs; markdown rendering is used where it fits (Inbox, file editor preview).
- Headless job runs use CLI print modes (`claude -p`, `droid exec`, `codex exec`) or a chat one-shot, selected by the job's `run_mode`; triggers are cron/api/github.
- One MCP tool layer for two transports (native chat loop + stdio server) keeps tool behavior identical whether an agent runs inside SuperConsole's chat or an external CLI.

## Folder map

```
/                       Tauri + Vite project root (plan.md, start.md, app-icon.png)
src/                    React frontend
  router.tsx            route tree + Shell layout (start here)
  lib/                  api.ts (invoke wrappers + types), workspace-context.tsx, utils.ts
  components/           feature components (TerminalView, TabStrip, Sidebar, FilePanel, ...)
  components/ui/        shadcn CLI-generated primitives (do not hand-edit; regenerate)
  assets/icons/preset-icons/  CLI brand SVGs + index.ts lookup
src-tauri/              Rust backend
  src/lib.rs            all #[tauri::command] handlers + app setup
  src/{db,pty,files,scheduler,remote,cli_sessions}.rs   local-first modules per concern
  src/{auth,cloud,crypto,sync_manager,llm,chat,team,connectors,skills,memory,wiki}.rs   cloud layer
  src/{mcp,mcp_server}.rs   in-process tool layer + stdio MCP server
  tauri.conf.json       window (Overlay titlebar), bundling, updater config
  capabilities/default.json  permission grants
  icons/                generated by `cargo tauri icon app-icon.png`
superconsole-web/       Cloudflare Workers web portal (TanStack Start, own PROJECT.md/CLAUDE.md)
```

# CONTEXT.md

Patterns, constraints, and gotchas specific to this codebase.

## Run / build / ship

- Dev: `npm run tauri dev` (vite on :1420 + Rust debug build, hot reload)
- Typecheck + frontend build: `npm run build` (tsc && vite build)
- Backend check: `cd src-tauri && cargo check`
- Debug binary: `cargo tauri build --debug --no-bundle`
- Ship: `cargo tauri build` → `.app` + `.dmg` in `src-tauri/target/release/bundle/`
- Regenerate icons: `cargo tauri icon app-icon.png`

## Tauri patterns used

- All IPC via `#[tauri::command]` fns registered in `lib.rs::run()`; frontend calls them through the typed wrappers in `src/lib/api.ts` (never call `invoke` directly elsewhere).
- Command args: Rust snake_case params are called with camelCase keys from JS (`session_id` → `sessionId`).
- Shared state: `app.manage(Db)`, `app.manage(SessionManager)`; access with `State<T>` in commands or `app.state::<T>()` in spawned tasks.
- Events: backend → frontend only (`pty-output`, `pty-exit`, `session-usage`, `inbox-new`, `chat-token`/`chat-done`/`chat-error`). Frontend listens with `listen()` and filters by `session_id`/`request_id`/`workspace_id` in the payload.
- Long-running work: `tauri::async_runtime::spawn` (tokio) for loops, `spawn_blocking` for process exec; the HTTP server runs on a plain `std::thread` (tiny_http is blocking).
- New plugin = three places: Cargo.toml + `.plugin(...)` in lib.rs + permission in `capabilities/default.json` (+ npm guest package).

## Frontend patterns

- TanStack Router with `createMemoryHistory` (desktop app, no URL bar). Routes are markers; heavy components live in the root `Shell` so terminals survive navigation.
- UI state that must survive route changes goes in `WorkspaceProvider`; ephemeral per-view state stays local.
- Search params are the API for panels: `?file=rel/path.md` opens the editor, `?files=true` opens the file tree, `?tab=account|org|project&section=Skills|Connectors|Commands|Context` deep-links into settings.
- Theme: `ThemeProvider` toggles `.dark` on `<html>`, persisted to localStorage (`superconsole-theme`); active org persisted as `superconsole-org`.
- Context Injection: Tab changes and Customize routes dispatch dynamic `titleSuffix` values up to the Router, which updates the TopBar to display the current file or plugin context seamlessly.
- Tailwind v4 CSS-first: all design tokens in `src/index.css` under `:root` / `.dark` / `@theme inline`. No tailwind.config file.

## Slash-command autocomplete patterns

- **ChatComposer**: uses `loadSlashItems(workspaceId)` from `lib/slash-items.ts` (called lazily once on first `/`). Items are `SlashItem[]` with `value`, `label`, `description`, `source` groupings. Dropdown shows label inline with description truncated to 1 line (`items-baseline` flex, `truncate` on description span).
- **TerminalView rich input**: uses a local `ensureCtx()` that fires all data fetches on first `/` keypress (`api.listSkills`, `listContextFiles`, `listCommands`, `listWorkspaceConnectors`, `listAgents`, `listSessionLogFiles`). Items built via `useMemo` keyed on all state arrays. Suggestions recompute via `useEffect([allSlashItems, slashToken])` — no stale-closure risk. Colour-coded by type (amber/blue/green/purple/teal/grey).
- **[+] menu token routing** (TerminalView): if rich input is open → `insertIntoRich(token)` (appends to textarea); if closed → `writeToSession(token)` (writes to live PTY buffer, no `\r`—user presses Enter).
- **Settings deep-link**: `router.navigate({ to: "/settings", search: { tab: "project", section: "Skills" } })` navigates to the right tab+section from any [+ Add …] footer.

## Gotchas / workarounds

- `@theme inline { --font-sans: var(--font-sans) }` is circular and silently breaks fonts. Fonts are declared in a separate plain `@theme` block. Don't merge them.
- cron crate needs a seconds field; `scheduler::next_run` prepends `"0 "` to standard 5-field cron. Job times are computed in Local tz, stored as UTC strings, compared against `datetime('now')`.
- xterm terminals must `fit()` after becoming visible (`display:none` → visible gives 0 dims); handled in TerminalView's `visible` effect via `requestAnimationFrame`.
- TerminalView uses the WebGL renderer + a bundled JetBrains Mono Nerd Font (`src/assets/fonts/`, `@font-face` in `index.css`). Wait for `document.fonts.ready` before the first `fit()`/`start_session` (otherwise xterm measures fallback-font cell metrics and reports the wrong cols/rows to the PTY, misaligning the CLI prompt), and call `term.clearTextureAtlas()` after each resize-`fit()` to avoid stale `????`/glyph artifacts. Resize is debounced via `requestAnimationFrame`. Keep the xterm options minimal — avoid `customGlyphs`/`rescaleOverlappingGlyphs` (they caused glyph artifacts).
- TerminalView remounts when `tab.id` changes; backend `start_session` is idempotent (re-attach if session exists).
- macOS traffic lights: `titleBarStyle: "Overlay"` + `hiddenTitle: true` in tauri.conf.json; TopBar has `pl-[78px]` and `data-tauri-drag-region`. Don't put interactive elements in the first 78px.
- `files.rs::resolve` rejects `..`/absolute paths — every file op must go through it.
- SQLite `SELECT` statements must match their struct mapping lengths exactly; missing columns cause silent `iter.filter_map(|r| r.ok())` failure drops, leading to empty arrays without logging.
- Settings changes for HTTP server / Telegram token require app restart (loops read config at boot; Telegram re-reads token each poll, so token alone hot-applies).
- Updater is wired but inert: empty `pubkey` and placeholder endpoint in tauri.conf.json; `createUpdaterArtifacts` not enabled, so unsigned builds work. UI handles check failure gracefully.
- **Telegram routing (dual-mode)**:
  - Option A — shared org bot: `bot_token` set once at org level; each project gets `chat_id` + optional `thread_id` (topic). One bot serves all projects.
  - Option B — dedicated bot per project: project connector has its own `bot_token`; resolution order: project `bot_token` → org `bot_token` → local `telegram_token` setting → skip.
  - `connectors.rs::project_telegram_bots` returns a 5-tuple `(token, workspace_id, chat_id, thread_id, allowed_user_ids)`. `allowed_user_ids` is an optional comma-separated whitelist of Telegram user IDs checked before any handler runs.
  - Inbound commands handled by `handle_telegram_message`: `/inbox` (inline ✅/❌ keyboards via `send_with_approval_keyboard`), `/status`, `/agents`, `/agent <name>`, `/task [freq] <cmd>`, `/schedule <cmd> <cron>`, `/help`; any `/` slash token → `exec_in_workspace`; free text → `exec_chat_message` → `one_shot_completion`.
  - Callbacks (approve/reject) handled by `handle_callback_query`; confirms via `answer_callback_query` + removes keyboard via `edit_message_reply_markup`.
  - Outbound: job completion (`run_and_record`) calls both `notify_telegram` (global bot fallback) and `notify_telegram_topic` (per-project, via `get_telegram_route_for_workspace`).
  - Configure at **Settings → Project → Messaging** (dedicated tab with explanation + embedded connector form). Required field validation: org scope requires `bot_token`; project scope requires `chat_id`. Save button disabled until requirement met.
  - All Telegram messages are truncated to 3800 chars (safe under the 4096-char API limit).

## Environment / credentials

- Per-workspace `.env` is parsed by `pty::parse_env_file` (supports `export`, quotes, comments) and injected into both PTY sessions and headless job runs. Never logged.
- App data: SQLite at `~/Library/Application Support/com.superconsole.app/superconsole.db`.
- `api_token` (HTTP auth) is auto-generated into settings on first read; treat as a secret.
- Cloud config lives in a gitignored root `.env` (loaded via `dotenvy`): `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_REDIRECT_URI`, `WORKOS_COOKIE_PASSWORD`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`. The same `WORKOS_COOKIE_PASSWORD` must be used by the web portal or encrypted secrets won't cross surfaces.
- The WorkOS session + derived AES key are cached in the macOS keychain (service `com.superconsole.desktop`), not in SQLite.

## Cloud / sync patterns

- WorkOS sign-in: `auth.rs` starts a one-shot loopback server on `127.0.0.1:4666`, opens the hosted auth page, and exchanges the code. Don't change the port without updating the WorkOS redirect URI.
- Turso access goes through `cloud.rs::turso_execute` (HTTP `/v2/pipeline`); read columns with `rows()` + `cell_text()`/`cell_opt()`. Never build SQL with interpolated user input — bind params.
- Turso is NOT queried per keystroke/session. `sync_manager.rs` pulls config into local `*_cache` tables on startup, explicit refresh, org switch, and a 30-min tick; PTY/chat env injection reads only the cache. After any cloud write, call `sync_manager::sync_on_update` to refresh the relevant cache immediately.
- Secret precedence (LLM keys + connectors): project → org → account/local → `.env` → skip. Project overrides org. Telegram resolves project → org → local `telegram_token` setting → skip.
- Encryption parity: AES-256-GCM, key = HKDF-SHA256(`WORKOS_COOKIE_PASSWORD`), salt `superconsole-llm-keys-v1`, info `aes-256-gcm`, format `base64(nonce[12] || ct||tag)`. Connector creds are an encrypted JSON blob in `credentials_encrypted`. Keep `crypto.rs` and the web `crypto.ts` identical.
- Registries (LLM providers + connectors) are mirrored in three places: `src-tauri/src/connectors.rs`, `src/lib/api.ts`, and `superconsole-web/src/connector-registry.ts`. Keep service ids, field keys, scopes, and env mappings identical. (e.g. the `web_search` connector → `TAVILY_API_KEY` was added to all three.)
- Native chat: `chat.rs` streams provider tokens via `chat-token`/`chat-done`/`chat-error` events through Anthropic/OpenAI-compatible/Gemini/OpenRouter adapters; it is cancellable (`stop_chat` + `ChatCancel` state) and supports a `tool_mode` and `reasoning` effort (`apply_reasoning`). Messages are stored locally in `chat_messages` keyed by project; the system prompt is built from CLAUDE.md/brand-voice.md/HEARTBEAT.md + on-demand context files plus the project's connected services, skills, memory, and wiki. Chat runs a native tool-calling loop backed by `mcp::execute`. `chat-done` carries `tokens_prompt`/`tokens_completion`/`cost_usd` (cost prefers OpenRouter live pricing via `llm::or_price_per_token`, else `usage::estimate_cost`). OpenRouter model list/pricing comes from `llm::list_openrouter_models` (cached hourly).
- `ensure_workspace_project` is serialized via a process Mutex and reuses an existing cloud project by (org_id, local_path_hint) before inserting — keeps Turso from accumulating duplicate project rows.

## MCP tools (phase 16)

- `mcp.rs` is an in-process tool layer shared by native chat (`mcp::execute`) and the stdio MCP server (`mcp_server.rs`). Tools are `ToolSpec`s: always-loaded (skills/memory/wiki/files), context-gated (incl. `context_list`/`context_read`/`context_search` over `context.rs`), a generic `connector_request`, plus a dedicated `web_search` tool that appears only when the `web_search`/Tavily connector is connected (it is deliberately excluded from the generic `connector_request` passthrough). A BM25-lite search lets agents discover tools without loading every schema.
- The stdio server is launched as `superconsole mcp --session <token>` (subcommand in `lib.rs`). The token is an AES-256-GCM blob (`ToolCtx`) carrying workspace/project identity with a 30-day TTL; it is regenerated per session launch.
- Per-CLI MCP config is written on session launch (fresh token), merging with existing servers + git-excluding the generated files:
  - **Claude**: project `.mcp.json` + pre-approval in `.claude/settings.local.json` (`enabledMcpjsonServers`).
  - **Droid**: project `.factory/mcp.json` (auto-loaded).
  - **Codex**: global `~/.codex/config.toml` `[mcp_servers.superconsole]` via `toml_edit` (no project scope, so last-launched workspace wins on token).
  - **Antigravity**: project `.gemini/settings.json` (`trust: true`) for the CLI + global `~/.gemini/config/mcp_config.json` for the editor (config still lives under `~/.gemini` on disk).
  - Claude/Droid go through `write_mcp_config`; the others via `write_codex_mcp_config` / `write_antigravity_mcp_config`.

## Jobs: run modes + triggers (phase 16b)

- Jobs carry `run_mode` (`cli` print-mode vs `chat` one-shot via `llm::one_shot_completion` vs `agent`), `run_config`, `trigger_type` (`cron`/`manual`/`api`/`github`; non-cron = no `next_run`, so it only runs via the play button), `trigger_config`, and `allowed_connectors`. `scheduler::exec_in_workspace` branches on `run_mode`; `job_command` builds the CLI line per preset (incl. `codex exec`).

## Agents (definition vs job)

- An agent is a *definition* in `.superconsole/agents/<name>/agent.md` (`agents.rs`): instructions + skills + connectors + context, NO harness/model/schedule. Those are picked on the job that runs it (`run_mode: "agent"` → `run_config` supplies cli/chat + model) or via `run_agent_now`/`scheduler::exec_agent` (uses the workspace default CLI).
- `scheduler::with_available_resources` parses `@skill:`/`@context:`/`@connector:`/`@agent:` tokens from the instructions and prepends ONE availability hint line; resources are fetched on demand via MCP tools at runtime, never inlined.
- SuperConsole catalog = Turso `agent_catalog` (curated, no org scope) + files in a public GitHub repo; install fetches via raw GitHub. Repos can self-describe with a `.superconsole-plugin/plugin.json` (falls back to `.claude-plugin/` then README). `install_repo_agent` clones a repo into a new project (+ generated `agent.md` + all skills + `.superconsole-plugin`); `scaffold_project_from_repo` clones + scaffolds `.superconsole/`. Full design: `AGENT_SYSTEM_NEW.md`.

## Session logs

- Session logs are **structured opt-in summaries**, NOT raw CLI history. Saved to `.superconsole/sessions/` (user/agent opts in per session).
- Listed via `api.listSessionLogFiles(workspaceId)` → `SessionLogFile[]` with `id` and optional `summary`.
- Accessible as `/session:id` tokens in the `[+]` menu and `/` autocomplete in both ChatComposer and TerminalView.
- The `SessionLogFile` type and `listSessionLogFiles` command live in `lib/api.ts` and `lib.rs` respectively.

## Native CLI sessions (read + resume)

- `cli_sessions.rs` reads transcripts directly off disk, always fresh, security-gated to `~/.claude`, `~/.factory`, `~/.antigravity`, `~/.codex`. Path encoding differs per CLI: Claude maps every non-alphanumeric char to `-`; Droid replaces only `/` with `-` (dots kept); Codex stores by date (`sessions/YYYY/MM/DD`) and is filtered by the `cwd` recorded in each file's first line.
- Opening a session resumes it in a NEW terminal tab: `start_session` takes `resume_session_id`, and `pty::cli_command` appends the per-CLI flag (`claude/droid --resume <id>`, `codex resume <id>`).
- `chat_threads` is a local-only table (project_id PK, name, is_star, created_at) backing the History page's Chat tab: rename, star, delete, and move (merges messages + metadata into the destination project).

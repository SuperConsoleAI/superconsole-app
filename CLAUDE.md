# CLAUDE.md - SuperConsole (desktop)

Engineering quick-reference. Read `ARCHITECTURE.md` for the full picture, `CODEBASE.md` for the file index.

## Mental model

- Tauri 2 desktop app: Rust backend + React 19 frontend. **Local-first with an optional cloud layer.**
- Local SQLite owns everything agents do (terminals, jobs, inbox, chat, files). Turso (cloud) owns identity, orgs/projects, team, LLM keys, connectors. Only config/identity leaves the device.
- UI never touches disk/process/cloud directly — everything goes through `invoke()` wrappers in `src/lib/api.ts`. Rust commands return `Result<T, String>`.
- Terminals live in the root `Shell`, not in route outlets, so PTY sessions survive navigation. Tabs are typed: terminal tabs, chat tabs (`{workspaceId}:chat`), and browser tabs (`{workspaceId}:browser`). Driven by `workspace-context` (`openTab`/`openChatSession`/`newChatDraft`/`bindChatDraftToSession`); each tab renders its respective view (`TerminalView`, `ChatView`, `BrowserView` keyed by `tabId`). Inactive tabs are hidden via opacity + pointer-events-none (not display: none) to ensure xterm.js and the native browser webview maintain accurate dimensions.
- **`[+]` menus** (via `ComposerPlusMenu` for ChatComposer & TerminalView): exposes Skills, Agents, Connectors, Context, Commands, Sessions. Each item shows a **clean name** in the dropdown; on click inserts the full `/prefix:name` token into the composer/textarea. Every submenu has a `[+ Add …]` footer that navigates to `settings?tab=project&section=<Section>`. Connectors menu hosts the Tool access radio (auto/direct) and shows project/org/account scoped connectors in a flat UI, resolving the fallback cascade (project > org > account) to only show the most specific scope per service. TerminalView token routing: rich input open → `insertIntoRich`; closed → `writeToSession` (no `\r`).
- **Slash `/` autocomplete**: ChatComposer uses `loadSlashItems` from `lib/slash-items.ts` (includes builtin `/compact`); TerminalView builds `allSlashItems` via `useMemo` from lazy-loaded state (fired by `ensureCtx()` on first `/`). Reactive via `useEffect([allSlashItems, slashToken])` — no stale closure. Colour-coded in TerminalView (amber skill / blue context / green command / purple connector / teal agent / grey session).
- **Session logs** (`/session:id`): structured opt-in summaries in `.superconsole/sessions/`; listed via `api.listSessionLogFiles(workspaceId)` → `SessionLogFile` (`id`, `summary?`). Not raw CLI history.

## Backend modules

- Local: `db.rs` (SQLite + migrations), `pty.rs` (PTY sessions + per-CLI resume + usage screen-scrape on exit), `files.rs` (sandboxed FS, `resolve()` gate; `scaffold_superconsole_dir` auto-generates `.superconsole/` 8 dirs + 12 write-if-missing templates on workspace create/import — HEARTBEAT, memory starters, rules, hooks, router agent), `scheduler.rs` (cron tick + `exec_in_workspace` funnel, run-mode branching: `cli` / `chat` / `agent` (sub-modes: cli/chat/auto) / `auto` top-level (router prepend → chat); `run_and_record` notifies global bot + per-project topic via `notify_telegram_topic`), `agents.rs` (file-defined agent definitions in `.superconsole/agents/`, Turso `agent_catalog`, repo import/clone + `.superconsole-plugin`), `remote.rs` (Telegram long-poll: typed update structs, `resolve_route` DM/group decision tree, `handle_telegram_message` with all commands + inline keyboards + free-text chat, `handle_callback_query`, `allowed_user_ids` whitelist, `get_telegram_route_for_workspace`, `notify_telegram_topic`; + HTTP trigger), `cli_sessions.rs` (read/resume native CLI transcripts off disk), `usage.rs` (usage monitoring: pricing/cost estimate, aggregation core, Turso shared-total rollup, `record_usage`; raw `usage_events` local-only, 3 aggregate tables cache cross-machine totals; session cost stored in `session_history`).
- Cloud: `auth.rs` (WorkOS loopback `127.0.0.1:4666` + keychain), `cloud.rs` (Turso HTTP exec), `crypto.rs` (AES-256-GCM), `sync_manager.rs` (Turso → local cache), `llm.rs` (keys + session env + chat adapters + `one_shot_completion`), `chat.rs` (token streaming + native tool loop + auto-compaction at >70% context), `team.rs`, `connectors.rs`, `skills.rs`/`memory.rs`/`wiki.rs` (registry CRUD synced to Turso, injected into prompts).
- MCP: `mcp.rs` (in-process tool layer + `write_mcp_config`/pre-approval for Claude/Droid; `ToolCtx` with AES session token), `mcp_server.rs` (stdio JSON-RPC, launched via `superconsole mcp --session <token>`).

## Cloud rules (don't break)

- All Turso SQL via `cloud.rs::turso_execute` with **bound params**, never string interpolation.
- PTY/chat env injection reads local `*_cache` only; never query Turso on the hot path. After a cloud write call `sync_manager::sync_on_update`.
- Secret precedence: project → org → account/local → `.env` → skip (project overrides org). Telegram: project → org → local `telegram_token` setting → skip.
- Encryption (must match web `crypto.ts`): AES-256-GCM, key = HKDF-SHA256(`WORKOS_COOKIE_PASSWORD`), salt `superconsole-llm-keys-v1`, info `aes-256-gcm`, format `base64(nonce[12] || ct||tag)`. Connector creds = encrypted JSON blob; blank secret on update keeps existing.
- Registries (LLM + connectors) mirrored in 3 files: `src-tauri/src/connectors.rs`, `src/lib/api.ts`, `superconsole-web/src/connector-registry.ts`. Change all three together.
- Authorize before cloud writes: org membership for org scope, project membership for project scope; owner/admin manage team; never remove/demote the last owner.

## Adding things

- New command → handler in `lib.rs` (+ register in `generate_handler!`) → typed wrapper in `api.ts` → component. Keep names mirrored (`list_connectors` ↔ `api.listConnectors`).
- Local schema change → idempotent block in `db.rs::Db::init`. Cloud schema change → Drizzle migration in `superconsole-web/drizzle/` (+ journal) + matching `ensure_*` guard in Rust.
- New CLI preset → `pty.rs::cli_command` (+ resume flag) + `scheduler.rs::job_command` + `CLI_PRESETS` in `api.ts` + icon in `preset-icons` (+ native read/resume mapping in `cli_sessions.rs`).
- Agents: an agent is a *definition* (`agent.md`: instructions + skills + connectors + context). Harness/model/schedule are set on the **job** that runs it. Three run modes: **CLI** (headless print-mode), **Chat** (native one-shot), **Auto** (router agent reads memory + available agents → picks best approach, dispatches as chat; Ruflo-inspired). Top-level `auto` on a job prepends router instructions; Agent-scoped `auto` sub-mode prepends router then uses the agent's own instructions. The **AgentRunEditDialog** (`src/components/AgentRunEditDialog.tsx`) is the shared edit component for both AgentsView and Task form — owns `[CLI][Chat][Auto]` picker + schedule. Run via `agents::run_agent_now` → `scheduler::exec_agent`. Catalog/import lives in `agents.rs`; `.superconsole-plugin` spec in `SUPERCONSOLE_PLUGIN_SPEC.md`. Full current design: `AGENT_SYSTEM_NEW.md`.
- New MCP tool → add a `ToolSpec` in `mcp.rs`; it serves both native chat (`mcp::execute`) and the stdio server. The `superconsole` server is auto-written per session for every CLI: Claude (`.mcp.json` + preapprove), Droid (`.factory/mcp.json`), Codex (global `~/.codex/config.toml`), Antigravity (`.gemini/settings.json` + global `~/.gemini/config/mcp_config.json`, paths still under `~/.gemini`).
- Usage capture → record via `usage::record_usage` (chat reads API usage blocks in `chat.rs`; PTY screen-scrapes on exit). Raw events stay local in `usage_events`; aggregates roll up project→org→account into Turso and are cached in the 3 `*_usage` tables. Read for UI via the `get_usage(level, id)` command → `api.getUsage`.

## Gotchas

- `WORKOS_COOKIE_PASSWORD` must be byte-identical to the web portal's, or encrypted secrets won't decrypt across surfaces.
- Cloud config is a gitignored root `.env` (loaded via `dotenvy`): `WORKOS_*`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
- `ensure_workspace_project` is lock-serialized + idempotent (reuse by org_id + local_path_hint) to avoid duplicate Turso project rows; the web lists every row so duplicates surface there.
- Don't merge the Tailwind `@theme inline` block with the font `@theme` block (breaks fonts).
- cron needs a seconds field — handled in `scheduler::next_run`, don't parse cron elsewhere.
- xterm must `.fit()` via `requestAnimationFrame` after becoming visible. It uses the WebGL renderer + bundled JetBrains Mono Nerd Font (static, not variable): wait for `document.fonts.ready` before the first fit (else cols/rows are measured with fallback metrics and the CLI prompt misaligns) and `clearTextureAtlas()` after each resize-fit (avoids `????` glyph artifacts). Keep xterm options minimal — no `customGlyphs`/`rescaleOverlappingGlyphs`.
- Don't hand-edit `components/ui/` (shadcn) or `src-tauri/icons/` (regenerate).
- Spawned CLIs/jobs must use `pty::enriched_path()` for `PATH` — a bundled `.app` launched from Finder only inherits `/usr/bin:/bin:/usr/sbin:/sbin`, so Homebrew/npm/bun/cargo CLIs won't resolve without it (resolved once from the login shell + well-known dirs).
- **Git operations:** Do not use the `git2` crate. Use shell commands via `std::process::Command` mapped through `tokio::task::spawn_blocking` to avoid freezing the UI. Auto-clear `.git/index.lock` before modifying the worktree to handle stale locks from crashes or editors.
- **Email trigger**: `check_email_triggers` lives in `remote.rs` and is called from `scheduler::spawn()` tick, NOT from the Telegram long-poll task. Telegram runs in its own independent spawned task — the two are never mixed. Email trigger jobs use `trigger_type = "email"`, `trigger_config = {connector, filter, last_checked}`. `last_checked` is persisted via `db.update_job_trigger_config` after each poll so the same email never fires twice.
- **Chat compaction — user role, not system**: `compact_messages` in `chat.rs` replaces the pruned block with a `role: "user"` message. Never inject into `role: "system"` — that is the SuperConsole harness (`build_system_prompt`) and must not be overwritten. The compaction summary is also appended (never overwritten) to `.superconsole/sessions/<session_id>.md` via `db.upsert_session_log`.
- **Composio connector**: `category: "connectors"` (not `"integrations"`). This makes it visible on both CustomizePage connectors tab and SettingsPage Connectors tab. `"integrations"` category = SettingsPage only.

## Commands

- `npm run tauri dev` (Vite :1420 + Rust debug) · `npm run build` (tsc + vite) · `cd src-tauri && cargo check`
- Ship: `cargo tauri build` → `.app` + `.dmg` in `src-tauri/target/release/bundle/`
- Web portal: see `superconsole-web/CLAUDE.md`.

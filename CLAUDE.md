# CLAUDE.md - SuperConsole (desktop)

Engineering quick-reference. Read `ARCHITECTURE.md` for the full picture, `CODEBASE.md` for the file index.

## Mental model
- Tauri 2 desktop app: Rust backend + React 19 frontend. **Local-first with an optional cloud layer.**
- Local SQLite owns everything agents do (terminals, jobs, inbox, chat, files). Turso (cloud) owns identity, orgs/projects, team, LLM keys, connectors. Only config/identity leaves the device.
- UI never touches disk/process/cloud directly — everything goes through `invoke()` wrappers in `src/lib/api.ts`. Rust commands return `Result<T, String>`.
- Terminals live in the root `Shell`, not in route outlets, so PTY sessions survive navigation. Chat is its own tab type (`{workspaceId}:chat`).

## Backend modules
- Local: `db.rs` (SQLite + migrations), `pty.rs` (PTY sessions + per-CLI resume), `files.rs` (sandboxed FS, `resolve()` gate), `scheduler.rs` (cron tick + `exec_in_workspace` funnel, run-mode branching), `remote.rs` (Telegram + HTTP triggers), `cli_sessions.rs` (read/resume native CLI transcripts off disk).
- Cloud: `auth.rs` (WorkOS loopback `127.0.0.1:4666` + keychain), `cloud.rs` (Turso HTTP exec), `crypto.rs` (AES-256-GCM), `sync_manager.rs` (Turso → local cache), `llm.rs` (keys + session env + chat adapters + `one_shot_completion`), `chat.rs` (token streaming + native tool loop), `team.rs`, `connectors.rs`, `skills.rs`/`memory.rs`/`wiki.rs` (registry CRUD synced to Turso, injected into prompts).
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
- New MCP tool → add a `ToolSpec` in `mcp.rs`; it serves both native chat (`mcp::execute`) and the stdio server. The `superconsole` server is auto-written per session for every CLI: Claude (`.mcp.json` + preapprove), Droid (`.factory/mcp.json`), Codex (global `~/.codex/config.toml`), Antigravity (`.gemini/settings.json` + global `~/.gemini/config/mcp_config.json`, paths still under `~/.gemini`).

## Gotchas
- `WORKOS_COOKIE_PASSWORD` must be byte-identical to the web portal's, or encrypted secrets won't decrypt across surfaces.
- Cloud config is a gitignored root `.env` (loaded via `dotenvy`): `WORKOS_*`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
- `ensure_workspace_project` is lock-serialized + idempotent (reuse by org_id + local_path_hint) to avoid duplicate Turso project rows; the web lists every row so duplicates surface there.
- Don't merge the Tailwind `@theme inline` block with the font `@theme` block (breaks fonts).
- cron needs a seconds field — handled in `scheduler::next_run`, don't parse cron elsewhere.
- xterm must `.fit()` via `requestAnimationFrame` after becoming visible.
- Don't hand-edit `components/ui/` (shadcn) or `src-tauri/icons/` (regenerate).

## Commands
- `npm run tauri dev` (Vite :1420 + Rust debug) · `npm run build` (tsc + vite) · `cd src-tauri && cargo check`
- Ship: `cargo tauri build` → `.app` + `.dmg` in `src-tauri/target/release/bundle/`
- Web portal: see `superconsole-web/CLAUDE.md`.

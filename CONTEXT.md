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
- Events: backend → frontend only (`pty-output`, `pty-exit`, `inbox-new`). Frontend listens with `listen()` and filters by `session_id`/`workspace_id` in the payload.
- Long-running work: `tauri::async_runtime::spawn` (tokio) for loops, `spawn_blocking` for process exec; the HTTP server runs on a plain `std::thread` (tiny_http is blocking).
- New plugin = three places: Cargo.toml + `.plugin(...)` in lib.rs + permission in `capabilities/default.json` (+ npm guest package).

## Frontend patterns

- TanStack Router with `createMemoryHistory` (desktop app, no URL bar). Routes are markers; heavy components live in the root `Shell` so terminals survive navigation.
- UI state that must survive route changes goes in `WorkspaceProvider`; ephemeral per-view state stays local.
- Search params are the API for panels: `?file=rel/path.md` opens the editor, `?files=true` opens the file tree.
- Theme: `ThemeProvider` toggles `.dark` on `<html>`, persisted to localStorage (`superconsole-theme`); active org persisted as `superconsole-org`.
- Tailwind v4 CSS-first: all design tokens in `src/index.css` under `:root` / `.dark` / `@theme inline`. No tailwind.config file.

## Gotchas / workarounds

- `@theme inline { --font-sans: var(--font-sans) }` is circular and silently breaks fonts. Fonts are declared in a separate plain `@theme` block. Don't merge them.
- cron crate needs a seconds field; `scheduler::next_run` prepends `"0 "` to standard 5-field cron. Job times are computed in Local tz, stored as UTC strings, compared against `datetime('now')`.
- xterm terminals must `fit()` after becoming visible (`display:none` → visible gives 0 dims); handled in TerminalView's `visible` effect via `requestAnimationFrame`.
- TerminalView remounts when `tab.id` changes; backend `start_session` is idempotent (re-attach if session exists).
- macOS traffic lights: `titleBarStyle: "Overlay"` + `hiddenTitle: true` in tauri.conf.json; TopBar has `pl-[78px]` and `data-tauri-drag-region`. Don't put interactive elements in the first 78px.
- `files.rs::resolve` rejects `..`/absolute paths — every file op must go through it.
- Settings changes for HTTP server / Telegram token require app restart (loops read config at boot; Telegram re-reads token each poll, so token alone hot-applies).
- Updater is wired but inert: empty `pubkey` and placeholder endpoint in tauri.conf.json; `createUpdaterArtifacts` not enabled, so unsigned builds work. UI handles check failure gracefully.
- Telegram pairing: first chat to message the bot gets saved as `telegram_chat_id`; other chats are ignored afterward.

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
- Registries (LLM providers + connectors) are mirrored in three places: `src-tauri/src/connectors.rs`, `src/lib/api.ts`, and `superconsole-web/src/connector-registry.ts`. Keep service ids, field keys, scopes, and env mappings identical.
- Native chat: `chat.rs` streams provider tokens via `chat-token`/`chat-done`/`chat-error` events; messages are stored locally in `chat_messages` keyed by project; the system prompt is built from CLAUDE.md/brand-voice.md/HEARTBEAT.md plus the project's connected services.
- `ensure_workspace_project` is serialized via a process Mutex and reuses an existing cloud project by (org_id, local_path_hint) before inserting — keeps Turso from accumulating duplicate project rows.

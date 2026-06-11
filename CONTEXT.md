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
- Theme: `ThemeProvider` toggles `.dark` on `<html>`, persisted to localStorage (`dockyard-theme`); active org persisted as `dockyard-org`.
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
- App data: SQLite at `~/Library/Application Support/com.dockyard.app/dockyard.db`.
- `api_token` (HTTP auth) is auto-generated into settings on first read; treat as a secret.

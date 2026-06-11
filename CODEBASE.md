# CODEBASE.md

File index for fast navigation. Read ARCHITECTURE.md first.

## Rust backend (src-tauri/src/)

| File | One-liner |
|------|-----------|
| `main.rs` | Entry point, calls `dockyard_lib::run()`. Don't touch. |
| `lib.rs` | All `#[tauri::command]` handlers, plugin registration, app setup (DB init, scheduler/remote spawn). Add new commands here + register in `generate_handler!`. |
| `db.rs` | SQLite via rusqlite. Schema (workspaces, organizations, jobs, inbox, settings, session_history) + all queries. Migrations are idempotent blocks in `Db::init`. |
| `pty.rs` | PTY sessions via portable-pty. `SessionManager` map keyed by session id string. CLI presets in `cli_command()` (claude/droid/antigravity/shell). `.env` parsing, context-file detection, output reader thread → `pty-output` events. |
| `files.rs` | Workspace-sandboxed file ops (list/read/write/create/delete). `resolve()` is the path-safety gate — never bypass it. |
| `scheduler.rs` | Cron parsing (`next_run`), 30s tick loop (`spawn`), `exec_in_workspace` = the ONE headless executor (scheduler + HTTP + Telegram all use it). |
| `remote.rs` | Telegram long-poll bot (`spawn_telegram`), local tiny_http server (`spawn_http`), `ensure_api_token`, `notify_telegram`. |

Config: `tauri.conf.json` (window/titlebar/updater/bundle), `capabilities/default.json` (permissions), `Cargo.toml` (deps).

## Frontend (src/)

| File | One-liner |
|------|-----------|
| `main.tsx` | Renders `RouterProvider`. |
| `router.tsx` | Route tree, `Shell` layout (sidebar + topbar + tabstrip + terminal host), `Welcome`, route components. Most wiring lives here. |
| `index.css` | THE design system: all color tokens (light + dark), fonts, radii. |
| `lib/api.ts` | Every backend command as a typed function + all shared types (`Workspace`, `Job`, `InboxItem`, `SessionTab`, ...) + `CLI_PRESETS`. |
| `lib/workspace-context.tsx` | Global state: workspaces, orgs, tabs per workspace, live sessions. All mutations go through its actions. |
| `lib/utils.ts` | `cn()` only. |
| `components/TerminalView.tsx` | xterm instance per tab; starts session, streams events, resize, exit overlay, embeds CommandInput. |
| `components/TabStrip.tsx` | Per-workspace tabs + CLI launcher icons + new-terminal button. |
| `components/TopBar.tsx` | h-10 full-width bar: traffic-light padding, sidebar toggle, back/forward, workspace name, jobs/files/theme buttons. |
| `components/Sidebar.tsx` | Expanded sidebar (org dropdown, Inbox/Tasks, workspace list) AND collapsed `SidebarRail`. |
| `components/CommandInput.tsx` | Slash-command input with autocomplete (built-ins + `.claude/commands/*.md`). |
| `components/FilePanel.tsx` | Lazy file tree, create/delete, 4s auto-refresh. |
| `components/FileEditor.tsx` | Textarea editor + markdown preview, Cmd+S save. |
| `components/InboxView.tsx` | Inbox feed, markdown output, approve/reject flow. |
| `components/TasksView.tsx` | Org-wide job list (toggle/run/delete). |
| `components/JobsDialog.tsx` | Per-workspace job CRUD + schedule presets + recent session history. |
| `components/SettingsPage.tsx` | /settings page: section nav; live sections General (updates), Appearance, Integrations (Telegram), API Keys (HTTP). |
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
- New CLI preset → `pty.rs::cli_command` + `scheduler.rs::job_command` + `CLI_PRESETS` in `api.ts` + icon in preset-icons.
- Schema change → idempotent migration in `db.rs::Db::init`.

## Do not touch

- `src-tauri/gen/`, `src-tauri/target/`, `dist/`, `node_modules/` — generated.
- `src-tauri/icons/` — regenerate via `cargo tauri icon app-icon.png` instead of editing.
- `components/ui/` — shadcn-managed.
- `files.rs::resolve` and the `ALLOWED` settings whitelist in `lib.rs` — security boundaries.

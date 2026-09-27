# DESIGN_PRINCIPLES.md

Conventions used in this codebase. Match them when adding code.

## Naming

- React components: PascalCase files (`TerminalView.tsx`), one main export per file, named exports (no default except none).
- Rust: snake_case modules per concern (`pty.rs`, `scheduler.rs`); commands are verbs (`start_session`, `list_jobs`, `set_inbox_status`).
- IPC pairing: Rust command `list_session_history` ↔ `api.listSessionHistory`. Keep names mirrored. Cloud commands follow the same rule (`list_connectors` ↔ `api.listConnectors`) and have a matching server fn in `superconsole-web/src/server/` (`listConnectors`).
- Session ids: `"{workspaceId}:{cli}"` for CLI tabs, `"{workspaceId}:shell-{timestamp}"` for shells. Workspace cleanup matches on prefix.
- Tailwind: utility classes inline, merged with `cn()`. No CSS modules, no styled-components.

## State management

- One context for domain state (`WorkspaceProvider`), navigation state in the router (path params + search params), view-local state in components.
- Rule: if it must survive a route change or is read by 2+ routes → context. If it's a panel toggle/selection → search param. Otherwise → `useState`.
- Backend state: SQLite is the source of truth for persistent data; `SessionManager` (in-memory map) for live PTYs. No caching layers.

## Error handling

- Rust commands return `Result<T, String>` (stringified errors), surfaced to the UI as rejected promises.
- UI: user-actionable failures render inline (error banner in TerminalView, error text in dialogs); background/best-effort calls use `.catch(console.error)` or `.catch(() => {})` deliberately.
- Background loops (scheduler, telegram, http) never panic the app: errors are logged with `eprintln!` and the loop continues.
- Lock poisoning is treated as unreachable (`.lock().unwrap()`); mutexes are held briefly, never across awaits.

## UI / design system

- All colors via tokens in `index.css` (`bg-background`, `text-muted-foreground`, `bg-primary`...). Never hardcode hex in components — the only exception is the xterm theme and terminal chrome, which intentionally stays dark in both themes.
- Fonts: System fonts (e.g. SF Pro on macOS) combined with Archivo (UI), Lora via `.font-display` (headings/brand), JetBrains Mono via `font-mono` (paths, commands, code). Use proper typographic separators (en dash `–` over em dash `—`) for uniform UI text strings without unnecessary DOM nesting.
- One accent (terracotta). Status colors: emerald = live/approved, destructive = errors/rejected.
- Density: compact chrome (h-10 topbar, h-9 tabstrip, text-xs/13px), generous content areas.
- Reuse shadcn primitives from `components/ui/`; add new ones with the shadcn CLI, style on top with Tailwind.
- Icons: lucide everywhere, except CLI brands which use `PresetIcon`.

## Backend conventions

- Every filesystem operation on workspace content goes through `files.rs::resolve` (path sandbox). For SQLite queries, `SELECT` column lengths MUST precisely match the row mapping length to avoid swallowing `rusqlite::Error::InvalidColumnIndex`.
- Every headless agent execution goes through `scheduler::exec_in_workspace` (single funnel → inbox + telegram); the job's `run_mode` selects CLI print-mode vs chat one-shot.
- Agent tools live in one place: add a `ToolSpec` in `mcp.rs` so both the native chat loop (`mcp::execute`) and the stdio MCP server expose it identically. Don't fork tool logic per transport.
- New CLI preset: add it to `pty.rs::cli_command` (with its resume flag), `scheduler.rs::job_command`, `cli_sessions.rs` (on-disk layout/encoding for read+resume), `CLI_PRESETS` in `api.ts`, and a preset icon.
- DB migrations: append idempotent `CREATE TABLE IF NOT EXISTS` / guarded `ALTER TABLE` blocks in `Db::init` (always ensure new columns are added to legacy databases to avoid silent query failures). Never edit existing migration blocks. Local-only tables (e.g. `chat_threads`) stay out of Turso.
- Settings keys are whitelisted in `lib.rs::set_setting`. Add new keys there explicitly.

## Cloud conventions

- All Turso SQL goes through `cloud.rs::turso_execute` with bound params — never interpolate user input. Read with `rows()`/`cell_text()`/`cell_opt()`.
- PTY/chat env injection reads local `*_cache` tables only; never query Turso on the hot path. After a cloud write, call `sync_manager::sync_on_update` for the affected entity.
- Secrets are AES-256-GCM via `crypto.rs`; keep the derivation and storage format byte-identical to the web `crypto.ts`. Connector creds are an encrypted JSON blob; a blank secret on update keeps the existing value.
- Resolution precedence is project → org → account/local → `.env` → skip. Project overrides org. Apply this consistently for keys and connectors.
- Cloud schema lives in Drizzle (`superconsole-web/drizzle/`) — append migrations + journal, never edit applied ones; mirror with an idempotent `ensure_*` table guard on the Rust side.
- Registries (LLM providers, connectors) are mirrored in three files — change all three together, keeping ids/fields/scopes/env mappings identical.
- Cloud writes must authorize: org membership for org scope, project membership for project scope; only owner/admin manage team, and never remove/demote the last owner.

## What to avoid

- Don't render terminals inside route outlets (kills sessions on navigation).
- Don't call `invoke()` outside `lib/api.ts`.
- Don't add component state for things already representable as search params.
- Don't hand-edit `components/ui/` or `src-tauri/icons/`.
- Don't add comments explaining what code does; only why, when non-obvious.
- Don't introduce new global stores (redux/zustand) — context + router is enough at this size.

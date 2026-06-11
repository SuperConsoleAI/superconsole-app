# DESIGN_PRINCIPLES.md

Conventions used in this codebase. Match them when adding code.

## Naming

- React components: PascalCase files (`TerminalView.tsx`), one main export per file, named exports (no default except none).
- Rust: snake_case modules per concern (`pty.rs`, `scheduler.rs`); commands are verbs (`start_session`, `list_jobs`, `set_inbox_status`).
- IPC pairing: Rust command `list_session_history` ↔ `api.listSessionHistory`. Keep names mirrored.
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
- Fonts: Archivo (UI), Lora via `.font-display` (headings/brand), JetBrains Mono via `font-mono` (paths, commands, code).
- One accent (terracotta). Status colors: emerald = live/approved, destructive = errors/rejected.
- Density: compact chrome (h-10 topbar, h-9 tabstrip, text-xs/13px), generous content areas.
- Reuse shadcn primitives from `components/ui/`; add new ones with the shadcn CLI, style on top with Tailwind.
- Icons: lucide everywhere, except CLI brands which use `PresetIcon`.

## Backend conventions

- Every filesystem operation on workspace content goes through `files.rs::resolve` (path sandbox).
- Every headless agent execution goes through `scheduler::exec_in_workspace` (single funnel → inbox + telegram).
- DB migrations: append idempotent `CREATE TABLE IF NOT EXISTS` / guarded `ALTER TABLE` blocks in `Db::init`. Never edit existing migration blocks.
- Settings keys are whitelisted in `lib.rs::set_setting`. Add new keys there explicitly.

## What to avoid

- Don't render terminals inside route outlets (kills sessions on navigation).
- Don't call `invoke()` outside `lib/api.ts`.
- Don't add component state for things already representable as search params.
- Don't hand-edit `components/ui/` or `src-tauri/icons/`.
- Don't add comments explaining what code does; only why, when non-obvious.
- Don't introduce new global stores (redux/zustand) — context + router is enough at this size.

# SuperConsole - Project Overview

SuperConsole is a Tauri 2 desktop application combining a Rust backend with a React 19 frontend. It runs isolated terminal sessions, native chat, and headless cron jobs across local workspaces, storing agent activity locally in SQLite. An optional cloud layer (WorkOS identity + Turso DB) syncs org/project config, team membership, LLM keys, and connector credentials, and a companion web portal (`superconsole-web/`, Cloudflare Workers) is a second surface onto the same Turso DB.

## 1. Architecture & Data Flow
- **UI & IPC**: The React frontend never touches the disk directly. All operations are routed through Tauri `invoke()` commands to the Rust backend (`src-tauri/src/lib.rs`).
- **Data Persistence**: A bundled SQLite database (`db.rs`) handles workspaces, organizations, scheduled jobs, inbox items, settings, and session history.
- **Sessions & Execution**: Terminal sessions use `portable-pty` (`pty.rs`), streaming output via Tauri events (`pty-output`). 
- **Triggers**: A central `scheduler.rs` 30-second tick loop executes cron jobs headlessly. Additionally, a local HTTP server and Telegram bot (`remote.rs`) handle remote triggers. All executions route through a single funnel (`scheduler::exec_in_workspace`).
- **Cloud layer**: WorkOS auth (`auth.rs`, loopback `127.0.0.1:4666`) signs the user in and upserts identity/orgs to a Turso DB (`cloud.rs`). `sync_manager.rs` pulls config into local `*_cache` tables; LLM keys (`llm.rs`) and connectors (`connectors.rs`) are AES-256-GCM encrypted (`crypto.rs`) and injected into sessions from cache, resolving project → org → account/local → `.env` → skip. Native chat (`chat.rs`) streams provider tokens via events (Anthropic/OpenAI-compatible/Gemini/OpenRouter, cancellable, with reasoning effort and per-turn usage/cost), built from on-demand context files (`context.rs`) and tools (`mcp.rs`, incl. a `web_search` tool over the Tavily connector). Team membership lives in `team.rs`.

## 2. Tech Stack Highlights
- **Backend (Rust)**: Tauri 2, `portable-pty` for terminals, `rusqlite` for local DB, `tokio` for async loops, `tiny_http` for local server, `reqwest` for Telegram API.
- **Frontend (TS/React)**: React 19, Vite 7, `@tanstack/react-router` (memory history), Tailwind CSS v4, shadcn/ui primitives, and `xterm.js` (WebGL renderer + bundled JetBrains Mono Nerd Font) for full terminal rendering.
- **Build**: Final artifacts are `<30MB` Mac native binaries (`.app` and `.dmg`). 

## 3. Core Codebase Structure
- **Backend (`src-tauri/src/`)**: 
  - `lib.rs`: Tauri command wrappers and app setup.
  - `db.rs`: SQLite operations and schema migrations.
  - `pty.rs`: Pseudo-terminal session manager and environment parser.
  - `files.rs`: Sandboxed workspace operations.
  - `scheduler.rs`: Cron parser and tick loops.
  - `remote.rs`: Telegram long-polling and HTTP webhook handlers.
- **Frontend (`src/`)**: 
  - `router.tsx`: App layout hierarchy (Sidebar, TopBar, TabStrip) keeping terminals alive across navigations.
  - `lib/api.ts`: Typed mappings to backend Rust commands.
  - `lib/workspace-context.tsx`: Global domain state context.
  - `index.css`: Single source of truth for the Tailwind v4 design system.

## 4. Key Design Principles
- **State Management**: SQLite is the absolute source of truth. React Context (`WorkspaceProvider`) holds domain state, router holds navigation state, and view-local state stays in components.
- **Naming Conventions**: Backend modules are `snake_case`, while React components use `PascalCase`. IPC pairings mirror their names (e.g., `list_session_history` ↔ `api.listSessionHistory`).
- **Error Handling**: Rust returns `Result<T, String>`, surfacing to UI as rejected promises. Background loops log via `eprintln!` and never panic.
- **Security & Sandboxing**: All file ops route through `files.rs::resolve` to ensure path safety within workspaces. The `api_token` is auto-generated for HTTP triggers. 
- **Styling**: Strict adherence to inline Tailwind utilities merged via `cn()`. No CSS modules or hardcoded hex colors outside xterm chrome.

## 5. Development Workflow & Gotchas
- **Scripts**: `npm run tauri dev` (dev server on :1420), `npm run build` (frontend), `cargo check` (backend).
- **Gotchas**: 
  - Do NOT merge the Tailwind `@theme inline` with the font `@theme` block.
  - `cron` expressions natively require seconds; the app handles prepending "0".
  - xterm terminals require an explicit `.fit()` via `requestAnimationFrame` on visibility change.
  - Route navigation should not unmount the main `Shell` to avoid destroying live PTY sessions.
  - Settings changes for background integrations (Telegram/HTTP port) require an app restart.

___

## Documentation Files

| File | Contents |
|---|---|
| `CLAUDE.md` | Engineering quick-reference — mental model, cloud/sync rules, gotchas, command cheatsheet |
| `ARCHITECTURE.md` | Data flow (local + cloud layer), frontend structure, key decisions, folder map |
| `CONTEXT.md` | Tauri/React patterns, run/build/ship commands, cloud + sync patterns, env vars, gotchas |
| `CODEBASE.md` | Backend + frontend file index, entry points per feature, web portal pointer, do-not-touch list |
| `DESIGN_PRINCIPLES.md` | Naming, state management, error patterns, CSS + backend + cloud conventions, anti-patterns |
| `TECH_STACK.md` | Every dependency with version + rationale, cloud crates, web portal stack, version constraints |

The web portal is documented separately in `superconsole-web/PROJECT.md` and `superconsole-web/CLAUDE.md`.

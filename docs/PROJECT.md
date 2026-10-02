# SuperConsole - Project Overview

SuperConsole is a Tauri 2 desktop application combining a Rust backend with a React 19 frontend. It runs isolated terminal sessions, native chat, and headless cron jobs across local workspaces, storing agent activity locally in SQLite. An optional cloud layer (WorkOS identity + Turso DB) syncs org/project config, team membership, LLM keys, and connector credentials, and a companion web portal (`superconsole-web/`, Cloudflare Workers) is a second surface onto the same Turso DB.

## 1. Architecture & Data Flow

- **UI & IPC**: The React frontend never touches the disk directly. All operations are routed through Tauri `invoke()` commands to the Rust backend (`src-tauri/src/lib.rs`).
- **Data Persistence**: A consolidated local SQLite database (`superconsole.db` with 50 canonical tables, managed via `db.rs` and modular schemas in `db/schema/`) handles workspaces, projects, organizations, scheduled jobs, inbox items, settings, session history, and vector memory.
- **Native AI Vector Memory (RAG)**: Pure-Rust in-memory cosine similarity search over serialized `F32_BLOB(3)` vectors (`vector_memory.rs`) backed by the `memory_vectors` table, providing sub-millisecond document and memory retrieval without external dependencies.
- **Sessions & Execution**: Terminal sessions use `portable-pty` (`pty.rs`), streaming output via Tauri events (`pty-output`). Multi-CLI direct resume locator supports `find_latest_claude_session_id`, `codex resume <UUID>`, and `agy -c`.
- **Usage & Cost Tracking**: 4-tier atomic token and cost rollups (`project_usage`, `org_usage`, `user_usage`, `account_usage`) in `usage.rs` tracking reasoning tokens, prompt caching, and incremental resume deltas.
- **Triggers**: A central `scheduler.rs` 30-second tick loop executes cron jobs headlessly. Additionally, a local HTTP server and Telegram bot (`remote.rs`) handle remote triggers. All executions route through a single funnel (`scheduler::exec_in_workspace`).
- **Cloud layer & Keychain Elimination**: WorkOS loopback auth (`auth.rs`, `127.0.0.1:4666`) persists sessions into SQLite `cloud_identity` with zero OS Keychain dependency and in-RAM HKDF key derivation. Turso cloud DB access is powered by an asynchronous libSQL 0.9 remote client (`cloud.rs`) over Hrana (bypassing local SQLite C FFI to avoid threading misuse). `sync_manager.rs` pulls config into local `*_cache` tables; LLM keys (`llm.rs`) and connectors (`connectors.rs`) are AES-256-GCM encrypted (`crypto.rs`) and injected into sessions from cache, resolving project → org → account/local → `.env` → skip. Catalog tables (`plugins`, `connector_catalog`, `mcp_catalog`, `commands_catalog`, `hooks_catalog`) are synced globally from Turso on startup and every 30 minutes.

## 2. Tech Stack Highlights

- **Backend (Rust)**: Tauri 2, `portable-pty` for terminals, `rusqlite` for local DB, `libsql` 0.9 for remote cloud queries, `tokio` for async loops, `tiny_http` for local server, `reqwest` for Telegram API and streaming.
- **Frontend (Desktop)**: React 19, Vite 7, `@tanstack/react-router` (memory history), Tailwind CSS v4, shadcn/ui primitives, and `xterm.js` (WebGL renderer) for full terminal rendering.
- **Frontend (Web Portal)**: Cloudflare Workers, TanStack Start, React 19, Tailwind CSS v4, and shadcn/ui primitives.
- **Build**: Final artifacts are `<30MB` Mac native binaries (`.app` and `.dmg`).

## 3. Core Codebase Structure

- **Backend (`src-tauri/src/`)**:
  - `lib.rs`: Tauri command wrappers, vector memory initialization, and app setup.
  - `db.rs` / `db/`: SQLite operations and schema migrations (`superconsole.db` with 50 canonical tables, modular schemas in `db/schema/`).
  - `vector_memory.rs`: Pure-Rust AI Semantic Vector Memory (RAG) store (`VectorMemoryStore`) with cosine distance search over float BLOBs.
  - `usage.rs`: 4-tier token and cost aggregation engine with reasoning/cached token tracking and resume delta calculations.
  - `userdb.rs` & `localdb.rs`: Embedded SQLite studio backend and dynamic user table queries.
  - `pty.rs`: Pseudo-terminal session manager and environment parser with multi-CLI direct resume flags. Fires `session-start`/`session-end` hooks.
  - `hooks.rs`: Lifecycle hook executor (`session-start`, `session-end`, `before-prompt`, `before-mcp`, `before-shell`). Non-blocking, 10 s timeout, reads scripts from `.superconsole/hooks/`.
  - `plugins.rs`: Plugin marketplace backend — `list_plugins_catalog`, `search_plugins_catalog`, `install_plugin`, `install_plugin_from_url` (GitHub manifest detection), `uninstall_plugin`, `submit_plugin_to_cloud`.
  - `files.rs`: Sandboxed workspace operations.
  - `scheduler.rs`: Cron parser and tick loops. Fires `before-shell` hook.
  - `remote.rs`: Telegram long-polling and HTTP webhook handlers.
  - `cloud.rs`: Turso cloud client via pure async libSQL 0.9 and HTTP fallback.
  - `auth.rs`: WorkOS loopback OAuth without OS Keychain dependencies.
- **Frontend (`src/`)**:
  - `router.tsx`: App layout hierarchy (Sidebar, TopBar, TabStrip) keeping terminals alive across navigations. Handles dashboard mode with transparent TopBar and centered hero button.
  - `lib/api.ts`: Typed mappings to backend Rust commands, incl. all plugin/hook/catalog/vector memory API.
  - `lib/workspace-context.tsx`: Global domain state context.
  - `index.css`: Single source of truth for the Tailwind v4 design system.
  - `components/Sidebar.tsx`: Sidebar with `w-60` width, 50% search padding reduction, border-r only, and workspace dropdown flags.
  - `components/TopBar.tsx`: h-10 bar with macOS traffic light safe region and dashboard transparency.
  - `components/localdb/`: LocalDB Studio suite for table inspection and querying.
  - `components/UsageView.tsx`: Analytics dashboard for 4-tier usage rollups and token breakdown.
  - `components/CustomizePage.tsx`: Plugin marketplace + Hooks editor.
  - `components/PluginIcon.tsx`: Brand logo mapping (svgl-react) with light/dark theme switching.

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

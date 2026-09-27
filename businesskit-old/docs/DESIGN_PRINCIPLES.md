# Design Principles & Coding Standards

## File Header Documentation Convention

Every source file (Rust and TypeScript) MUST start with a 5–20 line comment banner explaining:

- What the file is and what it does.
- High-level execution flow.
- Dependencies or entry points calling it.

---

## Code Conventions & Naming

### Rust (Backend)

- **Functions & Fields**: `snake_case` (e.g. `get_userdb_creds`, `active_profile_id`).
- **Command Prefixes**:
  - `fin_`: Financial, accounting, banking, tax, and reporting commands (shared across all business profiles).
  - `shop_` or feature name: Shop operations, items, billing, stock, restaurant, stays.
- **Structs & Enums**: `PascalCase` (e.g. `TursoConn`, `AppState`, `UserDb`).
- **Commands**: Annotated with `#[tauri::command]`. Return types must be `Result<T, String>` for serializable IPC responses.

### TypeScript / Qwik (Frontend)

- **Files & Components**: `PascalCase.tsx` for components (e.g. `AppSidebar.tsx`, `AddProductModal.tsx`), `kebab-case.ts` for utilities (e.g. `design-system.ts`).
- **IPC Function Names**: Match Rust command names in `camelCase` (e.g. `switchProject` invoking `switch_project`).
- **Strict Typing**: All IPC inputs and return values must use explicit types defined in `src/lib/types.ts`.

---

## Layout & Styling Rules

- **Design System**: Use tokens from [`src/lib/design-system.ts`](file:///Users/2.o/businesskit/src/lib/design-system.ts) for colors, fonts, shadows, and borders.
- **Strict Spacing Standard**: All dashboard pages enforce `2rem` (`p-8`) padding and `3rem` (`m-12` or top/left equivalent) layout margins.
- **No Arbitrary Padding/Margins**: Avoid ad-hoc utility classes that break alignment with `businesskit-web` reference styling.
- **Modal vs SlideOver Patterns**:
  - **SlideOver**: Use for record creation, editing, and slide-in inspector details (e.g. `CustomerDetailSlideOver`, `AdjustStockSlideOver`, `SendKOTSlideOver`).
  - **Modal**: Use for focused standalone workflows (e.g. `NewBillModal`, `InvoicePrintModal`, `RateCalendarModal`).
- **Responsive Layout**: Mobile-first design using Tailwind breakpoints (`sm:`, `md:`, `lg:`). Tables collapse into card views on small screens; sidebars collapse into bottom nav.

---

## State Management

- **Frontend Component State**: Use `useSignal()` for local state and `useComputed$()` for reactive derived views (e.g. category filters, filtered stock ledgers).
- **Global UI Context**: Store active profile ID, organization info, and user session in [`AppContext`](file:///Users/2.o/businesskit/src/lib/app-context.tsx).
- **Backend Thread Safety**: Wrap all shared state in `AppState` inside `tokio::sync::RwLock` or std `RwLock` to enable multi-threaded IPC command handling without lock contention.

---

## Error Handling & Invariants

1. **Rust Error Propagation**: Convert internal errors into user-friendly `String` error messages using `anyhow` or `thiserror`:
   ```rust
   pub async fn query(...) -> Result<TursoRows, String> {
       conn.query(sql, params).await.map_err(|e| e.to_string())
   }
   ```
2. **Double-Entry Financial Invariants**: All journal entry postings must strictly validate that total debits equal total credits before writing to `fin_journal_entries` and `fin_journal_lines`.
3. **Frontend Graceful Fallbacks**: Wrap `invoke()` IPC calls in `try...catch` blocks. Show user toast notifications for non-fatal errors rather than crashing the UI context.
4. **Agent Tool UserDB Invariant**: All agent tools must strictly operate on `&TursoConn` for the active profile's UserDB. Never pass or expose Central DB connections to `ToolCtx`.
5. **Uniform Agent Event Contract**: Headless CLI runners (`cli.rs`) must translate external CLI output into uniform Tauri events (`chat-token`, `chat-tool-call`, `chat-done`, `chat-error`) ensuring UI parity across hosted LLMs and local binaries.
6. **Ephemeral Terminal Output**: PTY terminal sessions stream ANSI text directly to `xterm.js` via `pty-output` and must not write raw terminal buffers into `agent_chat_messages`.

---

## Explicit Anti-Patterns (DO NOT DO)

- ❌ **No Qwik Server Directives**: Never add `routeLoader$`, `routeAction$`, or `server$`.
- ❌ **No `window.location.href`**: Always use `useNavigate()` (`nav()`).
- ❌ **No Hardcoded Localhost**: Use Tauri custom protocol for local asset loading.
- ❌ **No Captured Closures in Handlers**: Avoid binding prop references inside inline event handlers (prevents `QWIK ERROR Code(14)` serialization failures).
- ❌ **No Direct Code Modifications to `businesskit-web/`**: Keep `businesskit-web` untouched as the golden reference.
- ❌ **No `println!` in MCP Code Paths**: Use `eprintln!` exclusively in `mcp_server.rs` and related tool execution logic; writing to stdout corrupts JSON-RPC 2.0 frames.
- ❌ **No Blocking Trust Prompts in Agents**: Never spawn CLI agents in untrusted directories without auto-scaffolding trust configs (`trusted_folders.json`), which would cause silent background hangs.

# How to Navigate & Port Domains (Agent Handover Guide)

If you are an AI agent picking up this codebase, **read this entire document before writing any code.**

This guide was created because previous agents failed to port features efficiently, resulting in "half-builds" and silent crashes. The user has 10+ domains left to build. **Do not repeat past mistakes.**

## 1. The 4-Layer Rule

Every feature in this app spans four layers. **You cannot port a feature by only looking at the UI or only looking at the SQL.** You must trace the data flow through all four layers in one sweep:

1. **SQLite Schema** (`src-tauri/src/db/schema/*.rs`) -> Mirrored from `businesskit-web/src/lib/provision.ts`.
2. **Rust Backend** (`src-tauri/src/commands/` & `src-tauri/src/db/`) -> SQL Queries and Rust structs.
3. **IPC Types** (`src/lib/types.ts`) -> TypeScript interfaces matching the Rust structs.
4. **Qwik Frontend** (`src/routes/` & `src/components/`) -> UI logic and data fetching.

**If you update a field in Layer 1, you MUST update Layers 2, 3, and 4 in the exact same prompt.** Failing to do so causes silent crashes.

## 2. Converting Qwik City (Web) to Tauri (Desktop)

When porting a file from `/Users/2.o/businesskit/businesskit-web/`:

- **Data Loading:** `routeLoader$` and `sharedMap` become `invoke("command_name")` inside a `useTask$` or `useVisibleTask$`.
- **Mutations:** `routeAction$` form submissions become `invoke("command_name")` inside `onClick$` or `onSubmit$` handlers.
- **Environment/Auth:** `event.env.*` and `cookie.get()` become `AppState` managed via Context in Tauri.
- **No Copy-Pasting UI blindly:** You must fully rewrite the fetching logic for Tauri.

## 3. The "Silent Crasher" Gotchas (Learn from my mistakes)

Previous agents broke the app by making the following assumptions. Do not make them:

### A. SQLite Type Mismatches

In the web app's `provision.ts`, timestamps like `updated_at` and `created_at` are stored as `TEXT` using `(strftime('%Y-%m-%dT%H:%M:%SZ','now'))`.

- **WRONG in Rust:** `row.get::<i64>(6)` (This will cause a runtime panic).
- **RIGHT in Rust:** `row.get::<String>(6).unwrap_or_else(|_| "".into())`
If a Rust `get()` panics, the entire IPC call fails. Because the frontend uses `Promise.all` to fetch data concurrently, **one failing Rust command will wipe out the entire page UI.**

### B. Slugs vs IDs (The UI Matching Trap)

The frontend URL router uses **slugs** (e.g. `/c/links`), but the backend database strictly uses **IDs** (e.g., `cat_1`).

- **The Mistake:** The frontend blindly tried to match `category_id === loc.params.category`, which always failed because `"cat_1" !== "links"`.
- **The Solution:** In your Rust SQL queries, use a `LEFT JOIN` to fetch the slug (e.g., `LEFT JOIN categories c ON c.id = a.category_id`). Expose `category_slug` in your Rust struct, add it to `types.ts`, and match against `(a.category_slug || a.category_id) === slug` in the frontend.

### C. Rust SQL Macros Consume Variables (`E0382`)

When passing variables into SQLite macros (like `libsql::params![slug]`), the variable is **moved/consumed**.

- **The Mistake:** Re-using `slug` to build a return struct later in the function causes `E0382: use of moved value`.
- **The Solution:** Always `.clone()` variables being passed into `libsql::params![]` if you need to use them again.

### D. Strict Qwik SSG Build Failures

The Qwik/Vite SSG build pipeline uses extremely strict ESLint rules. **Unused imports or unused signals** (e.g., `const metricType = useSignal()`) are not just warnings; they will **fail the SSG build entirely**.

- **The Solution:** Always clean up unused imports and variables immediately after refactoring, and run `npm run build` frequently to verify SSG generation passes.

### E. Trust SQLite Triggers, Not Frontend Assumptions

Aggregations (like rolling up views or visits) are handled natively by SQLite triggers (e.g., `AFTER INSERT ON views_analytics`).

- **The Mistake:** Building manual Rust aggregators or copying frontend UI that requests non-existent trends (like `reactions_7d`), assuming the backend has them.
- **The Solution:** Always read `src-tauri/src/db/schema/*.rs` to see what triggers exist and what fields are actually tracked before building UI charts.

## 4. Execution Workflow

When the user gives you a new domain to build (e.g., CRM, Social, Pages):

1. **Investigate the Webapp First:** Run `grep` or `view_file` on `/Users/2.o/businesskit/businesskit-web/` to find the exact schema, types, and UI component for the domain.
2. **Schema First:** Port the DB schema into the appropriate module under `src-tauri/src/db/schema/`.
3. **Backend Second:** Write the `db/*.rs` database queries and `commands/*.rs` IPC handlers. **Run `cargo check` immediately.**
4. **Types Third:** Sync `src/lib/types.ts` to exactly match your Rust structs.
5. **Frontend Last:** Rebuild the UI using the design system (`var(--button-primary-bg)`, etc.). Ensure mobile-first responsiveness (Tailwind `sm:`, `md:` prefixes).

## 5. UI & Styling Rules

- **Responsive:** Tables must collapse to cards on mobile. Sidebars become bottom navs. Same breakpoints as the web app.
- **Design Tokens:** Always use CSS variables from `src/lib/design-system.ts`. Never hardcode `#FFFFFF` or `#000000`. (e.g., use `var(--button-primary-text)` instead of white for toggle states).
- **Verify Dark/Light Mode:** Invert logic correctly (e.g., the toggle circle should be `var(--button-primary-text)` when active so it flips properly between light and dark themes).

**By strictly following this guide, you will avoid the "half-builds" and type-mismatch crashes that plagued earlier sessions. Be meticulous, sync all 4 layers, and always double-check the webapp reference.**

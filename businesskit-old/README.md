# BusinessKit Tauri App

A desktop and mobile version of the BusinessKit SaaS platform, built with Tauri v2, Qwik, and Rust.

## Documentation (`docs/`)

Detailed architectural specifications, developer context, domain schema mappings, and coding standards are available in [`docs/`](file:///Users/2.o/businesskit/docs):

- 📐 [**ARCHITECTURE.md**](file:///Users/2.o/businesskit/docs/ARCHITECTURE.md) — System architecture, IPC data flow, BYODB model, `TursoConn` HTTP client shim, and folder structure.
- 💡 [**CONTEXT.md**](file:///Users/2.o/businesskit/docs/CONTEXT.md) — Qwik SSG patterns, Tauri v2 bindings, environment variables, gotchas, and dev/build/deploy commands.
- 🗺️ [**CODEBASE.md**](file:///Users/2.o/businesskit/docs/CODEBASE.md) — File index, entry points for major features, and "What NOT to touch" rules.
- 🎨 [**DESIGN_PRINCIPLES.md**](file:///Users/2.o/businesskit/docs/DESIGN_PRINCIPLES.md) — Comment banners, Rust/TS naming conventions, `design-system.ts` layout guidelines, and anti-patterns.
- 📊 [**DOMAINS.md**](file:///Users/2.o/businesskit/docs/DOMAINS.md) — Complete database schema mapping for all business domains (Shop, Shop Operations, Accounts, Tax, Payroll, CRM, etc.).
- 🛠️ [**TECH_STACK.md**](file:///Users/2.o/businesskit/docs/TECH_STACK.md) — Full technology stack, dependency inventory, and configuration file reference.

---

## Architecture

Hybrid desktop/mobile app with a "Bring Your Own Database" (BYODB) model via Turso. Two main parts:

1. **Frontend (`src/`)** — Qwik SSG (Static Site Generation). No server features. All data via IPC.
2. **Backend (`src-tauri/`)** — Rust handles local state, Turso connections, auth loopback, keychain.

### Database Architecture

| DB | What | Who owns it |
|----|------|-------------|
| **Central DB** | Org, profiles, encrypted UserDB credentials, `last_provisioned_at` | Shared Turso (businesskit infra) |
| **UserDB** | Profile-specific data — analytics, members, posts, etc. | One Turso DB per profile (user-owned) |

Central DB is read at boot (org, profiles, creds). UserDB is connected per active profile.

### DB Connection — TursoConn HTTP Shim

**All** database connections go through `TursoConn` — a custom HTTP client in `src-tauri/src/db/turso.rs`.
`libsql`'s built-in client was removed because it uses `rustls-native-certs` which fails in the
iOS/Android app sandbox (no access to system CA store).

```rust
pub struct TursoConn {
    pipeline_url: String,     // {db_url}/v2/pipeline  (Turso HTTP API)
    auth_header: String,      // Bearer {token}
    client: reqwest::Client,  // rustls-tls + webpki-roots (Mozilla CAs bundled)
}
```

`reqwest` with `webpki-roots` bundles Mozilla's root CA list — **no system keychain access needed**.
Works identically on macOS, iOS, Android, and Windows. See `ios-centraldb-flow.md` for full details.

**API surface** (drop-in replacement for libsql):

- `conn.query(sql, turso_params![a, b])` → `TursoRows`
- `conn.execute(sql, turso_params![a, b])` → `u64` (rows affected)
- `conn.prepare(sql).await?.query(params)` → `TursoRows`
- `row.get::<T>(idx)` — same ergonomics as libsql
- `turso_params![]` macro — drop-in for `libsql::params![]`

### Profile Switch & Authorization Flow

```
switchProject(profileId) / connect_from_keychain()
  └── verify_profile_access() [Step 0 Authorization Gate]
        ├── Direct Profile Owner? (profile.user_id == current_user_id) → ALLOW
        ├── Org Owner? (org.owner_user_id == current_user_id)          → ALLOW
        ├── Team Member? (team_members.status == 'accepted')           → ALLOW
        └── Mismatch?                                                  → REJECT (Err: Access denied)
  └── ready_profiles hit? → UserDb::connect in RAM (0 extra HTTP calls)
  └── file cache hit?     → get_last_provisioned_at (1 Central DB query)
  └── cache miss?         → get_userdb_creds_full → vault::decrypt → save encrypted cache
```

- **Pre-Cache Authorization**: `verify_profile_access` runs at **Step 0 before checking `ready_profiles`**, preventing session cache bypass and unauthorized switches.
- After first connect per session: **zero extra HTTP calls** (in-memory `ready_profiles` cache).

### Provisioning Gate

`userdb.last_provisioned_at` in Central DB controls whether schema provisioning runs:

- `NULL` → run DDL statements, stamp timestamp → redirect to `/dashboard/settings/status`
- `NOT NULL` → skip entirely

Frontend caches in `localStorage["bk-provisioned-{profileId}"]` to avoid re-querying on every navigation.

### Credential Storage & Security

UserDB credentials (URL + token) use an in-memory runtime model with secure encrypted on-disk caching:

1. **In-Memory Decrypted State (RAM)**:
   - While the app is active, decrypted database connections are held directly in RAM within `state.user_db` (`Arc<RwLock<Option<UserDb>>>`) and `state.ready_profiles`.
   - OS Keychain is **not used** (avoids OS modal prompts, keychain deadlocks, and background UI freezes).

2. **Persistent Encrypted File Cache (AES-256-GCM)**:
   - Path: `{app_data_dir}/userdb_{profile_id}.dat`
   - Encrypted with AES-256-GCM using `ENCRYPTION_SECRET:profile_id`.
   - Stored exclusively in the sandboxed application data directory (never in `/tmp` or loose `$HOME` paths).
   - Used to restore connections seamlessly across application restarts.

3. **Complete Session Purge on Logout**:
   - Invoking `sign_out()` wipes all in-memory RAM state (`ready_profiles`, `user_db`, `auth_session`, `active_profile_id`) and deletes all cached `userdb_*.dat` credential files.

4. **Security Hardening**:
   - **No Fallback Encryption Keys**: `ENCRYPTION_SECRET` is validated at compile time (`build.rs`). Release builds fail immediately if unset.
   - **Content Security Policy (CSP)**: Strict script, style, and connect policies configured in `tauri.conf.json`.
   - **Scoped Asset Protocol**: `assetProtocol.scope` restricted to secure app data folders.
   - **Cloudflare Deployment**: Environment tokens (`TURSO_TOKEN`, `ENCRYPTION_SECRET`) deployed as `secret_text`.
   - **Resilient Transport**: `TursoConn` includes exponential backoff with randomized jitter for HTTP 429, 502, and 503 responses.

### Multi-Window Workspaces

BusinessKit supports opening multiple concurrent workspace windows simultaneously on desktop (macOS/Windows/Linux), allowing users to work across different profiles or projects in parallel:
- **Global Shortcut**: `Cmd+Shift+N` (macOS) / `Ctrl+Shift+N` (Windows/Linux) opens a new window for the active workspace.
- **Profile Switcher**: Each profile item in the sidebar dropdown includes an "Open in New Window" action.
- **Native Look & Feel**: Spawned windows inherit the macOS overlay titlebar styling and independent in-memory UI state while sharing the secure local SQLite/Turso database layer.

## Key Principles

- **No Server Functions**: No `routeLoader$`, `routeAction$`, or `server$` in `src/`. SSG only.
- **IPC Over HTTP**: All frontend ↔ backend via `invoke()`. See `src/lib/ipc.ts`.
- **SPA Navigation**: Always use `nav()` from `useNavigate()`. Never `window.location.href` — that causes full reloads and wipes all Rust state.
- **CSS Over JS**: Use CSS `:hover`, `data-*`, `e.currentTarget` for interactions. Captured-prop event handlers cause `QWIK ERROR Code(14)`.
- **Design Parity**: 1:1 visual match with `businesskit-web`. Use `src/lib/design-system.ts`.
- **Spacing**: All pages = `2rem` padding, `3rem` top/left margin. Nothing else.
- **Explain Header**: All files must have a 5–20 line comment banner explaining purpose and flow on top.
- **No src/lib/ services**: `src/lib/` is UI helpers only (`ipc.ts`, `types.ts`, `design-system.ts`, `app-context.tsx`). Zero DB logic, zero business logic. All business logic lives in `src-tauri/src/`.
- **Schema lives in src-tauri/src/db/schema/ only**: Split by domain (`shop`, `shop-ops`, `accounts`, `tax`, `payroll`, `core`, `crm`, `social`, `content`, `community`, `affiliate`, `agents`, `ads`, `forms`, `jobs`, `feedback`, `gsc`, `email`). Each domain file defines a `provision()` fn. `mod.rs` `run_all()` calls them in order. Never add schema anywhere in `src/`.

## Build vs Dev — Known Gotchas (Read Before Touching CSS or tauri.conf.json)

> These were confirmed root causes of a build-only design breakage (dev was perfect, built .dmg was broken). Took 12 hours to find. Do not repeat.

### 🚫 NEVER add a strict `csp` to `tauri.conf.json`

```json
// ✅ CORRECT — keep this:
"csp": null

// ❌ WRONG — breaks the built app:
"csp": "default-src 'self' tauri: asset:; script-src ..."
```

**Why**: Tauri's WKWebView enforces the CSP in built apps but NOT in dev mode (which uses Vite's dev server). Qwik's dynamic `import()` chunk loading (used throughout `layout.tsx` for lazy-loaded IPC, event listeners, etc.) gets blocked by any strict CSP, silently breaking the entire app shell. Dev works fine because Vite ignores it. The build breaks with no obvious error.

**Rule**: `csp` stays `null`. Any future security hardening must be tested in a **built `.dmg`**, not just dev mode.

---

### 🚫 NEVER use `(hover: none) and (pointer: coarse)` in CSS media queries

```css
/* ✅ CORRECT — max-width only: */
@media (max-width: 768px) { ... }
@media (max-width: 1024px) { ... }

/* ❌ WRONG — breaks desktop layout in built app: */
@media (max-width: 1024px), (hover: none) and (pointer: coarse) { ... }
```

**Why**: Tauri's WKWebView on macOS (and iOS/Android) reports `hover: none` and `pointer: coarse` regardless of the actual input device. Adding this condition to any rule that hides or collapses layout elements (sidebar, desktop-only nav, etc.) causes those elements to disappear in the built app while dev mode looks perfect.

**Rule**: Use `max-width` breakpoints only for mobile/tablet detection. Never `hover: none` or `pointer: coarse` for layout control.

---

### Font Loading

Fonts are self-hosted via `@fontsource/inter` in `src/global.css`. Do not switch back to Google Fonts CDN — the CDN requires CSP exceptions that conflict with the above, and local fonts load instantly with zero network dependency.

```css
/* ✅ CORRECT — local, bundled by Vite into dist/assets/*.woff2: */
@import "@fontsource/inter/latin-400.css";

/* ❌ WRONG — requires CDN access + CSP exception: */
@import url("https://fonts.googleapis.com/...");
```



## Getting Started

```bash
npm install
npm run tauri dev
```

See [`docs/CONTEXT.md`](file:///Users/2.o/businesskit/docs/CONTEXT.md) for full development, build, and mobile deployment instructions.

## Platform Targets

Mac App Store · iOS · Android · Windows

> **Capabilities Requirement**: Lock down `tauri.conf.json` capabilities to minimum:
>
> - `"core:default"`
> - `"shell:open"` (WorkOS OAuth + billing portal)
> - `"event:default"` (deploy:progress + auth:callback)
>
> Do NOT use `"shell:all"` — App Store review will reject it.

- Same Rust codebase builds for all targets — no platform-specific DB code
- `TursoConn` (reqwest + bundled CAs) works on all platforms without system CA access
- Keychain: Data Protection Keychain on macOS/iOS (Team ID-locked, silent after notarization)
- Credential file fallback covers Android and any sandboxed context
- No `window.location.reload()` anywhere — breaks mobile Tauri builds
- No hardcoded localhost — Tauri custom protocol handles asset loading on all platforms

## Standards

Industry standard practices · scalable architecture · clean code

When porting any component or route from the web app (`businesskit-web`):

1. Use the web app file as the COMPLETE reference for fields, types, UX, and logic
2. Rewrite fully — no copy-paste. Replace ALL web patterns with Tauri equivalents:
   - `routeLoader$` / `routeAction$` / `sharedMap` → `invoke()` in `useVisibleTask$`
   - `fetch()` / HTTP calls → `invoke()`
   - `event.env.*` → `AppState` via context
   - `routeAction$` form submissions → `invoke()` in `onClick$` handlers
3. Keep identical field structure, validation rules, and UX flow
4. Web app path is always: `/Users/2.o/businesskit/businesskit-web/`
5. When in doubt — read the web file first, then rewrite for Tauri
6. All UI must be fully responsive — mobile-first. Same breakpoints as web app.
   Desktop layout collapses cleanly to mobile for iOS/Android Tauri builds.
   No fixed pixel widths. Use Tailwind responsive prefixes (`sm:`, `md:`, `lg:`) everywhere.
   Sidebar collapses to bottom nav on mobile. Tables collapse to cards on small screens.

- `businesskit-web` `ThinSidebar.tsx` = Tauri app `src/components/app/AppSidebar.tsx`
- `businesskit-web` `DashboardBar.tsx` = Tauri app `src/components/app/AppTopbar.tsx`
- Use Global CSS — do not add random padding/margin on pages
- Never touch code in `businesskit-web/` (copy, do not move)
- Use [`design-system.ts`](file:///Users/2.o/businesskit/src/lib/design-system.ts)
- Always add schema migrations in `src-tauri/src/db/schema_version.rs` (run once on app start)
- Multi-platform mind-set: changes must compile and work cleanly on iOS, macOS, Windows, and Android.

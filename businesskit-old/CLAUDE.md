# BusinessKit Tauri App (Qwik + Rust)

## Project Documentation (`docs/`)

Comprehensive project documentation is available in the [`docs/`](file:///Users/2.o/businesskit/docs) directory:
- [**ARCHITECTURE.md**](file:///Users/2.o/businesskit/docs/ARCHITECTURE.md): System architecture, IPC data flow, BYODB model, `TursoConn` HTTP client, directory structure.
- [**CONTEXT.md**](file:///Users/2.o/businesskit/docs/CONTEXT.md): Qwik SSG patterns, Tauri v2 bindings, environment variables, gotchas, build/run/deploy commands.
- [**CODEBASE.md**](file:///Users/2.o/businesskit/docs/CODEBASE.md): Index of core files, entry points for major features, and "What NOT to touch" rules for AI agents.
- [**DESIGN_PRINCIPLES.md**](file:///Users/2.o/businesskit/docs/DESIGN_PRINCIPLES.md): File header comment rules, Rust & TS naming conventions, `design-system.ts` layout guidelines, state management.
- [**DOMAINS.md**](file:///Users/2.o/businesskit/docs/DOMAINS.md): Mapping of all business domains (Shop, Shop Ops, Accounts, Tax, Payroll, CRM, etc.) to Rust SQLite schemas.
- [**TECH_STACK.md**](file:///Users/2.o/businesskit/docs/TECH_STACK.md): Full dependency inventory (Tauri v2, Qwik, Rust, reqwest, AES-GCM, TipTap, Tailwind CSS v4) and config files.

---

## Core Architecture
- **Frontend**: Qwik SSG. Runs inside Tauri webview — CANNOT use `routeLoader$`, `routeAction$`, or `server$`.
- **Backend**: Tauri Rust handles local state, Turso DB connections, auth loopback, OS keychain.
- **Communication**: ALL data fetching and mutations go through `invoke()` IPC via `src/lib/ipc.ts`.

---

## Rules for AI Assistants

### 1. Never use Qwik City Server Features
Do not add `routeLoader$`, `routeAction$`, or `server$` to `src/`. Breaks the SSG build (`npm run tauri build`).

### 2. Always use SPA navigation — never `window.location.href`
```ts
// ❌ WRONG — causes full page reload, wipes Rust in-memory state
window.location.href = "/dashboard";

// ✅ CORRECT — SPA nav, layout stays mounted
const nav = useNavigate();
nav("/dashboard");
```

### 3. Avoid Closure Serialization Errors
Qwik's lazy-loading fails if you capture runtime state inside event handlers referencing component props.
Use CSS `:hover`, `data-*` attributes, or `e.currentTarget` for JS handlers. Never `onMouseOver$` with captured props.

### 4. Track activeProfileId in useVisibleTask$
Always track `activeProfileId` before fetching data — prevents race condition where data loads before profile connects.
```ts
useVisibleTask$(async ({ track }) => {
  const profileId = track(() => ctx.activeProfileId.value);
  if (!profileId) return;
  // safe to fetch now
});
```

### 5. Profile switching — always call switchProject IPC
After `switchProject(id)` succeeds, check provision status before navigating:
```ts
const cacheKey = `bk-provisioned-${id}`;
if (!localStorage.getItem(cacheKey)) {
  const s = await getUserdbStatus();
  if (!s.last_provisioned_at) { nav("/dashboard/settings/status"); return; }
  localStorage.setItem(cacheKey, String(s.last_provisioned_at));
}
nav("/dashboard");
```
Never navigate without this check — unprovisioned profiles must go to status page first.

### 6. Provision status is gated by `last_provisioned_at`
`Central DB → userdb.last_provisioned_at`:
- `NULL` → UserDB schema never set up → redirect to `/dashboard/settings/status`
- `NOT NULL` → skip provision entirely

This is cached in `localStorage["bk-provisioned-{profileId}"]` on the frontend.
On the Rust side, `AppState.ready_profiles: HashSet<String>` caches confirmed profiles in-memory — re-switches to the same profile skip ALL guard queries.

### 7. Strict Rust IPC typing
TypeScript types in `src/lib/types.ts` must exactly match Rust structs. Rust returns `snake_case` — map explicitly if needed. Always check `src/lib/ipc.ts` for existing commands before adding new ones.

### 8. Keychain scheme for UserDB credentials
Credentials are stored per `profile_id` in the OS keychain:
```
Service:  io.businesskit.app
Accounts: turso_url_{profile_id}
          turso_token_{profile_id}
```
On keychain miss: Rust fetches `turso_auth_token` (AES-256-GCM encrypted) from Central DB and decrypts with `vault::decrypt(token, ENCRYPTION_SECRET, profile_id)`. Matching scheme: PBKDF2-HMAC-SHA256, 100k rounds, salt=`"openclaw-v1"`.

### 9. File Header Banners
All files (Rust & TS) must include a 5–20 line comment banner on top explaining what the file does and its execution flow.

### 10. Design system
Use `src/lib/design-system.ts` for all tokens. All pages: `2rem` padding, `3rem` top/left margin.
Match `businesskit-web` visually 1:1.

### 11. AppState fields (Rust)
| Field | Type | Purpose |
|-------|------|---------|
| `central_db` | `RwLock<Option<CentralDb>>` | Shared Turso DB — org/profiles/creds |
| `user_db` | `RwLock<Option<UserDb>>` | Active profile's Turso DB |
| `active_profile_id` | `RwLock<Option<String>>` | Currently selected profile |
| `organization` | `RwLock<Option<Organization>>` | Eagerly loaded org |
| `license` | `RwLock<LicenseStatus>` | License state |
| `ready_profiles` | `RwLock<HashSet<String>>` | Session cache — confirmed provisioned+seeded profiles |

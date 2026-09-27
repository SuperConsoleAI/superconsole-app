# iOS DB Fix — How We Fixed It (CentralDB + UserDB)

Two separate fixes were needed to get iOS working end-to-end.

---

## Problem 1 — CentralDB: Profiles Not Loading (Fixed Earlier)

On iOS: `central_db=false | profiles_in_ctx: 0`

### Root Cause
`libsql` uses `rustls-native-certs` to find system CAs.
The iOS **app sandbox cannot access** the system keychain where root CAs live → TLS handshake fails.

macOS works because it can read `/System/Library/Keychains/SystemRootCertificates.keychain`.

### Fix — TursoConn HTTP Shim (`src-tauri/src/db/turso.rs`)

Replaced `libsql::Builder::new_remote()` with a pure-`reqwest` HTTP client calling
Turso's pipeline API (`/v2/pipeline`).

`reqwest` with `rustls-tls` bundles **Mozilla's WebPKI root CAs** via `webpki-roots` —
works on all platforms including iOS sandbox.

```rust
pub struct TursoConn {
    pipeline_url: String,     // {db_url}/v2/pipeline
    auth_header: String,      // Bearer {token}
    client: reqwest::Client,  // webpki-roots bundled, works on iOS
}
```

**Result:** `central_db=true | profiles_in_ctx: 3` ✓

---

## Problem 2 — UserDB: Settings Page "Not Connected" (Fixed Now)

iOS debug panel showed:
```json
"get_settings": { "ok": false, "error": "Not connected to project database." }
```

`get_organization` succeeded (CentralDB works), but `get_settings` failed — UserDB never connected.

### Root Cause (Same TLS Issue)

`UserDb::connect()` used `libsql::Builder::new_remote()` — same TLS failure on iOS.
Credentials were fetched fine from CentralDB, but the UserDB connection itself failed at
TLS handshake before any query could run.

### Fix — Migrate All UserDB to TursoConn

**Step 1: `src-tauri/src/db/user.rs`** — Replace struct + connect method

```rust
// Before (TLS error on iOS)
pub struct UserDb { db: Arc<Database>, ... }
pub async fn connect(url: &str, token: &str) -> Result<Self> {
    let db = Builder::new_remote(url, token).build().await?;  // ← fails iOS TLS
    ...
}

// After (HTTP, works everywhere)
pub struct UserDb { conn: TursoConn, ... }
pub async fn connect(url: &str, token: &str) -> Result<Self> {
    let url = url.replace("libsql://", "https://");
    Ok(Self { conn: TursoConn::new(&url, token), ... })  // ← instant, no TLS
}
pub fn conn(&self) -> Result<TursoConn> { Ok(self.conn.clone()) }
```

**Step 2: Migrate all 49 call-site files**

| Old (libsql)                   | New (TursoConn)                               |
|---                             |---                                            |
| `libsql::params![a, b]`        | `crate::turso_params![a, b]`                  |
| `&libsql::Row`                 | `&crate::db::turso::TursoRow`                 |
| `libsql::Connection`           | `crate::db::turso::TursoConn`                 |
| `Vec<libsql::Value>`           | `Vec<crate::db::turso::TursoParam>`           |
| `libsql::Value::Text(s)`       | `crate::db::turso::TursoParam::Text(s)`       |
| `libsql::Value::Integer(i)`    | `crate::db::turso::TursoParam::Integer(i)`    |
| `stmt.query(())`               | `stmt.query(vec![])`                          |

**Step 3: Expand TursoConn API** (so all call sites compile)

Added to `turso.rs`:
- `prepare(sql) -> Result<TursoStmt>` — prepared-statement shim
- `execute_batch(sql)` — runs semicolon-separated DDL
- `TursoRow::column_name(i: i32)`, `get_value(i)`, `column_count()`
- `From<Option<&str>>`, `From<bool>`, `From<Option<f64>>` for `TursoParam`
- `FromCell` for `i32`, `Option<i32>`, `Option<f64>`, `Option<bool>`

---

## Credential Flow (macOS + iOS — identical)

```
App launch
  └─ CentralDB (TursoConn HTTP) → load profiles ✓

User selects profile
  └─ connect_from_keychain_pub()
       ├─ keychain/file hit? → use cached url + token
       └─ miss → CentralDB "userdb" table → get_userdb_creds_full()
                  → vault::decrypt(token, ENCRYPTION_SECRET)
                  → store_in_keychain() [keychain + file fallback]
                  → UserDb::connect(url, token)
                       → TursoConn::new(url, token) ← instant ✓
                  → *state.user_db = Some(user_db)

Settings page
  └─ get_settings → user_db.conn()? → TursoConn → HTTP query → data ✓
```

### Dual Keychain Storage (organization.rs)

Credentials stored in TWO places for iOS reliability:
1. **Keychain** (`keyring` via `apple-native`) — primary, fast
2. **Encrypted file** (`Library/Application Support/bk_creds_{profile}.dat`) — fallback

---

## Files Changed

| File | Change |
|---|---|
| `src-tauri/src/db/turso.rs` | Added prepare, execute_batch, column_name, get_value, column_count, new From/FromCell impls |
| `src-tauri/src/db/user.rs` | Struct uses TursoConn, connect() is instant (no network) |
| `src-tauri/src/commands/organization.rs` | Dual keychain+file credential cache |
| `src-tauri/src/commands/settings.rs` | Builder::new_remote → TursoConn |
| `src-tauri/src/commands/deploy.rs` | Builder::new_remote → TursoConn |
| 44 other `src/db/*.rs` + `src/commands/*.rs` | libsql::params! → turso_params! |

---

## Verification

```
Before (iOS): get_settings → "Not connected to project database."
After  (iOS): get_settings → { plan, features, branding, … } ✓
```

Commits: `4874ed3` (CentralDB fix) → `18b2bcf` (UserDB + full migration)

---

## Debug Code Used to Find the Problems

### Debug Panel 1 — Dashboard (found CentralDB + profile loading issue)

Added to `src/routes/dashboard/index.tsx` — showed raw Rust app state on every page load:

```tsx
// Signal
const debugInfo = useSignal<string>("loading...");

// In useVisibleTask$:
try {
  const { invoke } = await import("@tauri-apps/api/core");
  debugInfo.value = await invoke<string>("get_app_debug");
} catch (e) { debugInfo.value = `debug_err: ${e}`; }

// In JSX (fixed red bar at top of dashboard):
<div style="background:#1a1a2e;border:1px solid #ff6b6b;border-radius:8px;
            padding:12px;margin-bottom:16px;font-family:monospace;font-size:10px;
            color:#ff6b6b;word-break:break-all;white-space:pre-wrap;">
  <strong style="color:#ffd93d">🔍 iOS Debug (remove after fix)</strong>{"\n"}
  {debugInfo.value}{"\n"}
  profiles_in_ctx: {ctx.profiles.value.length} | org: {ctx.org.value?.name ?? "null"}
</div>
```

Backed by `get_app_debug` Tauri command in Rust (returns a one-line status string):
```
central_db=true | user_db=false | license=active | profiles: 3
```

**What it revealed:** `central_db=false` on iOS → traced to TLS error in libsql.

---

### Debug Panel 2 — Settings Page (found UserDB "not connected" issue)

Added to `src/routes/dashboard/settings/index.tsx` — showed each invoke call result individually:

```tsx
// Signals
const debugOpen = useSignal(false);
const debugInfo = useSignal<Record<string, any>>({});

// In useVisibleTask$ — invoke each command separately and capture result/error:
const results: Record<string, any> = { profile: settingsCtx.profile, timestamp: new Date().toISOString() };
try {
  try {
    fetchedOrg = await invoke("get_organization");
    results.get_organization = { ok: true, data: fetchedOrg };
  } catch (e: any) {
    results.get_organization = { ok: false, error: String(e) };
    throw new Error(`get_organization failed: ${e}`);
  }
  try {
    fetchedSettings = await invoke("get_settings");
    results.get_settings = { ok: true, data: fetchedSettings };
  } catch (e: any) {
    results.get_settings = { ok: false, error: String(e) };
    throw new Error(`get_settings failed: ${e}`);
  }
  // ...
} catch (e: any) {
  results.status = "error";
  results.caught = String(e);
}
debugInfo.value = results;

// Floating badge + overlay in JSX:
<div style={{ position: "fixed", bottom: "1rem", right: "1rem", zIndex: 9999 }}>
  <button onClick$={() => { debugOpen.value = !debugOpen.value; }}
    style={{ background: debugInfo.value.status === "error" ? "#ef4444" : "#22c55e", ... }}>
    ⚙ settings debug [{debugInfo.value.status ?? "idle"}]
  </button>
  {debugOpen.value && (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", ... }}>
      <pre>{JSON.stringify(debugInfo.value, null, 2)}</pre>
    </div>
  )}
</div>
```

**What it revealed:**
```json
"get_organization": { "ok": true, "data": { "id": "org_..." } },
"get_settings":     { "ok": false, "error": "Not connected to project database." }
```

`get_organization` (CentralDB) worked. `get_settings` (UserDB) failed → UserDB never connected → traced to `libsql::Builder::new_remote()` TLS error in `UserDb::connect()`.

---

> Both panels are now removed from the codebase (commit `2de734b`).
> Re-add them if you need to debug iOS DB connectivity issues again.

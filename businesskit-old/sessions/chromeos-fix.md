# ChromeOS / ARCVM Fix Log

## Root Cause
ChromeOS runs Android apps inside a VM (ARCVM). This caused 3 separate failures:

| Failure | Root Cause |
|---|---|
| Stuck at "Starting BusinessKit..." | Qwik's `useVisibleTask$` uses IntersectionObserver — never fires in ARCVM WebView |
| All buttons dead (onClick$) | Qwik's QRL lazy-loading uses dynamic `import()` — blocked by WebView without proper settings |
| `localhost:4666` refused after login | Chrome browser (host OS) runs outside Android VM — can't reach Rust's loopback server |

---

## Fix 1 — WebView settings (root cause fix for Qwik hydration)
**File:** `src-tauri/gen/android/app/src/main/java/io/businesskit/desktop/MainActivity.kt`

Added `onWebViewCreate` override that sets:
- `allowFileAccess = true`
- `allowContentAccess = true`
- `allowFileAccessFromFileURLs = true` / `allowUniversalAccessFromFileURLs = true`
- `mixedContentMode = MIXED_CONTENT_ALWAYS_ALLOW`

Without these, Qwik's dynamic `import()` of QRL handler chunks from `tauri://localhost/` is silently blocked.

## Fix 2 — Inline boot script in splash screen
**File:** `src/routes/layout.tsx`

Added a plain IIFE `<script>` (rendered in SSG HTML) that:
1. Waits 600ms to let Qwik boot normally on other platforms
2. Uses `window.__TAURI_INTERNALS__.invoke` (always available, injected by native runtime before any JS runs)
3. Calls `auth_status` → `is_central_db_ready` → navigates to /login or /dashboard

## Fix 3 — Login page: start loading=false
**File:** `src/routes/login/index.tsx`

Changed `const loading = useSignal(true)` → `useSignal(false)` so form renders immediately.

## Fix 4 — Native click handlers on login buttons
**File:** `src/routes/login/index.tsx`

Added IDs to both buttons + inline `<script>` that attaches native addEventListener after 800ms,
calls `sign_in` via `__TAURI_INTERNALS__`, polls `auth_status` until session appears → /dashboard.

## Fix 5 — OAuth redirect: custom deep-link scheme
**Files:** `auth.rs`, `AndroidManifest.xml`, `MainActivity.kt`

- `auth.rs`: On Android, skips loopback server, uses `businesskit://auth/callback`
- `AndroidManifest.xml`: registered intent-filter for `businesskit://auth/callback`
- `MainActivity.kt`: `onNewIntent` intercepts URL, calls `complete_oauth_android`, navigates to /dashboard
- WorkOS dashboard: `businesskit://auth/callback` was already registered ✓

---

## Status

| Step | Status |
|---|---|
| App loads past "Starting BusinessKit..." | ✅ |
| Login form shows | ✅ |
| Login button / Sign up clickable | ✅ |
| WorkOS OAuth opens in browser | ✅ |
| OAuth callback (businesskit://) | ✅ |
| Dashboard loads after login | ⚠️ Hanging at "Loading..." |

## Remaining Issue
After login, dashboard boot sequence runs and likely times out on Turso DB connection inside ARCVM.
All data calls have 3s withTimeout so should NOT hang forever.

Next: check `adb logcat` for Rust errors during "Loading..." hang.

# ChromeOS Undo Verification Checklist

After undoing all ChromeOS changes, ask me to verify each item below.

---

## Files to REVERT (git checkout / discard changes)

### 1. `src-tauri/gen/android/app/src/main/AndroidManifest.xml`
**Remove:** OAuthWebViewActivity registration + businesskit:// intent-filter block
**After undo, must NOT contain:**
- `<activity android:name=".OAuthWebViewActivity" ...`
- `<intent-filter android:label="OAuth Callback">`
- `android:scheme="businesskit"`

---

### 2. `src-tauri/gen/android/app/src/main/java/io/businesskit/desktop/MainActivity.kt`
**Revert to original** (was almost empty originally)
**After undo, must NOT contain:**
- `bkWebView`
- `onWebViewCreate`
- `handleOAuthIntent`
- `completeOAuth`
- `onNewIntent` (custom)
- `BK-OAuth`

---

### 3. `src-tauri/gen/android/app/src/main/java/io/businesskit/desktop/OAuthWebViewActivity.kt`
**DELETE this file** — it did not exist before.

---

### 4. `src-tauri/src/commands/auth.rs`
**Revert** these specific additions:
- Remove `#[cfg(not(target_os = "android"))]` before `CALLBACK_PORT` and `REDIRECT_URI`
- Remove `REDIRECT_URI_ANDROID` constant
- Remove `#[cfg(target_os = "android")]` block in `sign_in` command
- Remove `complete_oauth_android` function (~30 lines near end of file)
- `authorize_url` signature: remove `redirect_uri` param (was hardcoded `REDIRECT_URI`)
- Remove `#[cfg(not(target_os = "android"))]` before `callback_html` and `recv_callback`
- Remove `#[cfg(not(target_os = "android"))]` import for `Duration`

---

### 5. `src-tauri/src/lib.rs`
**Remove** from the `.invoke_handler(...)` list:
- `commands::auth::complete_oauth_android`

---

### 6. `src-tauri/src/db/turso.rs`
**Revert** DNS lookup timeout change:
- Was: `tokio::net::lookup_host(...)` with no timeout
- Changed to: `tokio::time::timeout(Duration::from_secs(2), tokio::net::lookup_host(...))` 

---

### 7. `src/routes/layout.tsx`
**Revert** these changes:
- `loading = useSignal(false)` → back to `useSignal(true)`
- `useVisibleTask$(..., { strategy: "document-ready" })` → remove the strategy option
- Static imports: remove `switchOrganization` and `setGlobalCurrency` from ipc/fin-format imports
- Remove inline boot `<script>` block (~80 lines of IIFE inside the loading JSX)
- Dynamic imports inside boot sequence: restore `await import("~/lib/ipc")` etc.

---

### 8. `src/routes/login/index.tsx`
**Revert** these changes:
- `loading = useSignal(false)` → back to `useSignal(true)` (login page had it as true originally)
- Restore inline native button handler `<script>` block (~45 lines)
- Restore button help text: "A browser window opens on port 4666 for authentication."

---

## Verification Commands (run after undo)

```bash
# 1. Confirm OAuthWebViewActivity is deleted
ls src-tauri/gen/android/app/src/main/java/io/businesskit/desktop/

# 2. Confirm auth.rs has no android cfg blocks
grep -n "cfg(target_os" src-tauri/src/commands/auth.rs

# 3. Confirm complete_oauth_android is gone from lib.rs
grep -n "complete_oauth_android" src-tauri/src/lib.rs

# 4. Confirm MainActivity is back to original (tiny file)
wc -l src-tauri/gen/android/app/src/main/java/io/businesskit/desktop/MainActivity.kt

# 5. Confirm loading=true in layout.tsx
grep -n "useSignal(true\|useSignal(false" src/routes/layout.tsx src/routes/login/index.tsx

# 6. Confirm no document-ready strategy
grep -n "document-ready" src/routes/layout.tsx

# 7. Build check (host only, no android)
cd src-tauri && cargo check
```

---

## Files NOT to touch (other work, unrelated to ChromeOS)

All files in:
- `src/components/shop/`
- `src/routes/dashboard/shop/`
- `src-tauri/src/commands/shop/`
- `src-tauri/src/db/schema/`
- `src-tauri/src/commands/organization.rs`
- `src-tauri/src/db/provision.rs`
- `package.json`

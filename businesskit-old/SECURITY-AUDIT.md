# BusinessKit Tauri — Security Audit Plan

5 checks to run before Mac App Store / iOS / Android / Windows submission.
Based on Mayank Shah's vibe-coding security prompts, adapted for Tauri + Rust + Qwik SSG + Turso.

---

## CHECK 1 — Secret Leak Prevention

Paste this into Claude Code in the Tauri project root:

```
Before submitting this Tauri app to any app store, do a full secret safety pass across the entire codebase.

This is a Tauri v2 app (Rust backend + Qwik SSG frontend). Here's exactly what to check and fix:

1. ENCRYPTION_SECRET is baked into the binary at build time from .env. Verify it is never logged, never returned from any IPC command, and never written to any file path the user can access. Verify it is loaded only once in vault.rs and not exposed in any Rust struct that gets serialized.

2. Check every IPC command in src-tauri/src/commands/. None of them should return raw credentials — tursoToken, workosApiKey, or ENCRYPTION_SECRET — in their response payload. Return only the data the frontend needs.

3. Check src/ (Qwik frontend). There is no server-side here — SSG only. Verify no env vars are embedded in the built HTML/JS that shouldn't be (no tokens, no secrets, no DB URLs). Check vite.config.ts for any VITE_ prefixed vars being injected at build time.

4. Check .gitignore. Verify .env is listed. Verify .env.example exists with placeholder values only.

5. Check the credential file fallback: {app_data}/bk_creds_{profile_id}.dat. Confirm it is AES-256-GCM encrypted with vault.rs before writing. Confirm the raw token is never written to disk in plaintext anywhere.

6. Check OS keychain usage in src-tauri/src/. Confirm the keyring crate is only storing the encrypted token, not the raw one.

7. Check all error logs (eprintln!, log::error!, tracing::error!) in Rust. None should print credential values, tokens, or the ENCRYPTION_SECRET.

Report: every secret you found, where it was, and what you fixed.
```

---

## CHECK 2 — Personal Data Flow Audit

Paste this into Claude Code:

```
Audit how user personal data moves through this Tauri app. This is a Rust + Qwik desktop app. No HTTP server — all data via IPC invoke().

1. Map all data collection points. Find every IPC command that receives or returns: email, WorkOS user ID, Turso tokens, profile slug, or any PII. For each, trace where that data goes after the command runs.

2. Check all Rust logs. Grep for eprintln!, println!, log::debug!, log::info!, tracing::debug! — none should output email addresses, tokens, profile slugs, or any user-identifiable data.

3. Password / token handling. Confirm tokens from Turso and WorkOS are: (a) decrypted only in vault.rs, (b) never stored in any Rust struct that outlives the request, (c) dropped from memory after use. Check that vault.rs uses AES-256-GCM via ring or RustCrypto — not a homegrown implementation.

4. IPC response filtering. Check every src-tauri/src/commands/ file. No command should return more fields than the frontend needs. Specifically: turso auth tokens, WorkOS API keys, and ENCRYPTION_SECRET must never appear in any IPC response.

5. Frontend localStorage. Check src/ for any localStorage.setItem calls. Confirm that tokens, auth keys, and DB credentials are NOT stored in localStorage. The only acceptable localStorage key is bk-provisioned-{profileId} (a boolean flag).

6. Keychain data scope. Confirm that keychain entries (keyring crate) are scoped to the app's bundle ID and cannot be read by other apps on the same device.

7. Data deletion. Check if there is a "disconnect profile" or "logout" flow. Confirm it: deletes the keychain entry, deletes the credential file fallback, and clears the in-memory ready_profiles cache.

Report: what data is collected, where it's stored, where it flows, and what you fixed.
```

---

## CHECK 3 — Pre-Submit App Store Audit

Paste this into Claude Code:

```
This Tauri app targets Mac App Store, iOS, Android, and Windows. Run a full pre-submission audit:

1. Capabilities audit. Open src-tauri/tauri.conf.json (or tauri.conf.json). Verify capabilities are locked to minimum:
   - "core:default"
   - "shell:open" (for WorkOS OAuth + billing portal only)
   - "event:default" (for deploy:progress + auth:callback)
   Remove any "shell:all" — App Store review will reject it. Remove any capability not explicitly needed.

2. Debug code removal. Search for: println!, eprintln!, dbg!(), todo!(), unimplemented!(), console.log (in src/). Remove all that exist only for development. Check for any hardcoded test profile IDs or test Turso URLs.

3. Error handling. Check all IPC command return types. Errors returned to the frontend should be user-friendly strings, not Rust stack traces, file paths, or raw error::Error debug output. Verify ? operator errors are mapped to clean messages before crossing the IPC boundary.

4. Rate limiting. The app connects to Turso HTTP directly. Confirm there is retry logic with exponential backoff in TursoConn for 429 responses. Confirm there is no tight loop that could hammer the Turso endpoint.

5. No localhost hardcoding. Grep for "localhost", "127.0.0.1", "0.0.0.0" in src-tauri/src/. None should appear in production code paths. Tauri custom protocol handles asset loading.

6. No window.location.reload(). Grep src/ for location.reload, location.href =, window.location. None allowed — breaks mobile Tauri builds. All navigation must use nav() from useNavigate().

7. Provisioning gate. Confirm the last_provisioned_at check in the connect flow correctly skips the full DDL set (all CREATE TABLE statements across schema/*.rs) on every profile switch after first provision. Confirm localStorage["bk-provisioned-{profileId}"] is set after provisioning completes.

8. TursoConn CA bundle. Confirm reqwest is built with webpki-roots (bundled Mozilla CAs), not rustls-native-certs. This is required for iOS/Android sandbox where system CA store is inaccessible.

List every check, pass/fail result, and what you fixed.
```

---

## CHECK 4 — Deep Security Audit (Auth + Credentials + IPC)

Paste this into Claude Code:

```
This Tauri app handles encrypted Turso credentials, WorkOS OAuth, and AES-256-GCM vault operations. Run a deep security audit on these critical paths:

AUTH & CREDENTIAL FLOW:
- Check connect_from_keychain() in src-tauri/src/. Verify it cannot be called with an arbitrary profileId to retrieve credentials for a profile that doesn't belong to the authenticated user. What prevents profile ID spoofing from the frontend?
- Check the WorkOS OAuth loopback flow. Verify the auth callback validates state parameter to prevent CSRF. Verify the code exchange happens in Rust (not frontend), and the resulting session token is never sent to the frontend raw.
- Check token expiry. WorkOS session tokens expire. Verify the app detects 401s from WorkOS and re-initiates auth rather than silently failing or retrying with a dead token.

VAULT OPERATIONS (vault.rs):
- Confirm AES-256-GCM is used (not AES-CBC, not AES-ECB). GCM provides both encryption and authentication.
- Confirm a unique nonce/IV is generated per encryption operation — never reused.
- Confirm decryption failure (wrong key, corrupted data, bad nonce) results in a clean error, not a panic.
- Confirm ENCRYPTION_SECRET is loaded from env at compile time and never changes at runtime.

IPC SURFACE:
- List every #[tauri::command] in src-tauri/src/commands/. For each: does it authenticate the caller? A desktop app IPC command can be called from any webview content — if the webview ever loads external URLs, those pages could invoke commands. Verify CSP in tauri.conf.json prevents external script execution.
- Check for any command that takes a file path as input. Verify it uses path canonicalization and restricts access to app-owned directories only (no path traversal: ../../etc/passwd).

INPUT HANDLING:
- Check all SQL passed to TursoConn. Verify turso_params![] macro is used for all user-supplied values — no string interpolation into SQL.
- Check all fields stored from Central DB responses. Verify they are treated as untrusted data — never executed, never used as file paths, always validated before use.

For every issue: what the vulnerability is, where it is, how it could be exploited, and the fix.
```

---

## CHECK 5 — Attacker's Perspective

Paste this into Claude Code:

```
Think like an attacker trying to break this Tauri desktop app. Check these attack paths specific to a Tauri + Rust + multi-tenant credential app:

1. Profile ID manipulation. Can a logged-in user retrieve credentials for a different profile by passing a different profileId to an IPC command? Test every command that accepts a profileId parameter — verify ownership is checked against the authenticated session, not just passed through.

2. Credential file access. The app writes {app_data}/bk_creds_{profile_id}.dat. What happens if an attacker on the same machine reads this file? Confirm it is encrypted (AES-256-GCM via vault.rs) and that the encryption key is not stored near the file.

3. Keychain bypass. If the keychain is unavailable, the app falls back to the credential file. Can an attacker force this fallback by corrupting the keychain entry, then read the (potentially weaker) file? Confirm both storage paths use the same encryption quality.

4. IPC injection. Tauri webviews can be targeted if Content-Security-Policy is weak. Check tauri.conf.json for CSP settings. Verify no inline scripts, no unsafe-eval, no wildcard script-src. A weak CSP + XSS in the frontend = arbitrary IPC command execution.

5. Provisioning race condition. The provisioning gate checks last_provisioned_at then runs the full DDL set. If two instances of the app run simultaneously for the same profile, could they both pass the gate and double-provision? Confirm there is a lock or idempotent handling.

6. Turso token rotation. If a Turso token is rotated (user changes it in settings), the old token may still be in the keychain/file cache. Confirm the credential update flow: (a) writes new encrypted token to central DB, (b) updates keychain, (c) updates file fallback, (d) clears in-memory ready_profiles cache — all atomically or with explicit invalidation.

7. WorkOS redirect URI hijack. The OAuth loopback uses a local port listener. Confirm the redirect URI is validated server-side by WorkOS. Confirm the local listener closes immediately after receiving the code — it should not stay open.

For every vulnerability found: what an attacker does, the blast radius, and the fix. Credential theft and unauthorized profile access first, logic flaws second.
```

---

## Run Order

1. Check 1 → Check 2 → Check 3 → Check 4 → Check 5
2. Re-run Check 5 after any major feature addition
3. Run all 5 before each app store submission

## Tauri-Specific Notes

- These prompts are adapted for Tauri v2. No Supabase RLS, no Express middleware, no CORS — those sections from the original guide don't apply.
- The original guide's "security headers" check (Check 3) is replaced by Tauri capability scope + CSP config.
- IPC surface replaces API endpoints as the primary attack surface.
- All 4 platforms (macOS, iOS, Android, Windows) must be considered — never add platform-specific workarounds that weaken security on one target.

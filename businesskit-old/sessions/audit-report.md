# BusinessKit Security Audit Report

**Date**: September 17, 2026  
**Target**: BusinessKit Desktop & Mobile Application (Tauri v2 + Rust Backend + Qwik SSG Frontend + Turso BYODB)  
**Specification**: [SECURITY-AUDIT.md](file:///Users/2.o/businesskit/SECURITY-AUDIT.md) (Checks 1 through 5)  
**Status**: Comprehensive Assessment Complete (Zero Codebase Modifications Made)

---

## Executive Summary

A comprehensive multi-tier security audit was conducted on the BusinessKit codebase across all five checks specified in [SECURITY-AUDIT.md](file:///Users/2.o/businesskit/SECURITY-AUDIT.md). The application utilizes a hybrid architecture with a static Qwik frontend communicating exclusively via Tauri IPC to a Rust backend managing SQLite/Turso connections, WorkOS OAuth loopback authentication, and local credential caches.

While the core cryptographic primitives (`AES-256-GCM` via `aes-gcm`, `PBKDF2-HMAC-SHA256` with 100k rounds) and IPC data minimization are largely well-architected, several **critical** and **high-severity** vulnerabilities were identified that require resolution prior to public app store submissions (Mac App Store, iOS App Store, Google Play, Windows Store).

### Vulnerability Summary Table

| ID | Title | Severity | Impact Area | Check Reference |
| --- | --- | --- | --- | --- |
| **SEC-01** | Hardcoded Fallback Encryption Secret in Source Code | **CRITICAL** | Cryptography / Key Management | Check 1, Check 4 |
| **SEC-02** | Tauri Private Mini-Sign Key & SQLite DBs Tracked in Git | **CRITICAL** | Supply Chain / Repository Safety | Check 1, Check 5 |
| **SEC-03** | Broken Object Level Authorization on Profile Switching (`switch_project`) | **CRITICAL** | Authorization / BYODB Isolation | Check 4, Check 5 |
| **SEC-04** | Missing Content Security Policy (`csp: null`) & Unrestricted Asset Protocol | **HIGH** | Webview Security / IPC Boundary | Check 3, Check 4, Check 5 |
| **SEC-05** | Plaintext Secret Bindings in Cloudflare Worker Deployments | **HIGH** | Cloudflare Infrastructure Security | Check 1, Check 5 |
| **SEC-06** | Incomplete Session Logout & Credential Residue on Disk | **HIGH** | Data Deletion & Local Privacy | Check 2, Check 5 |
| **SEC-07** | Arbitrary File Read in Bank Statement Import (`std::fs::read_to_string`) | **HIGH** | IPC File System Security | Check 4 |
| **SEC-08** | Arbitrary Process Kill on Port 4666 during OAuth Loopback | **MEDIUM** | Denial of Service / Stability | Check 4, Check 5 |
| **SEC-09** | Broad Credential Fallback Directories (`/tmp` & `$HOME`) | **MEDIUM** | Local Storage Isolation | Check 1, Check 2 |
| **SEC-10** | Missing HTTP 429 Rate Limiting & Retry Backoff in `TursoConn` | **MEDIUM** | Network Resilience / API Stability | Check 3 |
| **SEC-11** | Unused RBAC Enforcement Macro (`require_app_access!`) | **MEDIUM** | Role-Based Access Control | Check 4 |
| **SEC-12** | Client-Side `window.location.reload()` in Mobile Views | **MEDIUM** | Mobile Tauri Compatibility | Check 3 |
| **SEC-13** | Verbose Debug Logging (`println!`, `eprintln!`, `console.log`) | **LOW** | Information Disclosure | Check 1, Check 2, Check 3 |
| **SEC-14** | Missing `.env.example` Template in Root | **LOW** | Developer Ergonomics | Check 1 |

---

## Detailed Audit Findings by Check

---

### CHECK 1 — Secret Leak Prevention

#### 1.1 `ENCRYPTION_SECRET` Handling & Hardcoded Fallback

- **Files**: [auth.rs:63, 83](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs#L63), [settings.rs:218](file:///Users/2.o/businesskit/src-tauri/src/commands/settings.rs#L218)
- **Status**: ❌ **FAIL (CRITICAL)**
- **Finding**:
  In [auth.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs) and [settings.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/settings.rs), when `option_env!("ENCRYPTION_SECRET")` is missing or empty during build, the code falls back to a hardcoded string:

  ```rust
  let secret = option_env!("ENCRYPTION_SECRET")
      .unwrap_or("4de****************************************");
  ```

  If any build is executed without the environment variable properly injected, all local sessions and cached API keys will be encrypted using this publicly exposed static secret.
- **Remediation**:
  Remove the fallback string entirely. In `build.rs`, emit a compile-time assertion or `panic!` if `ENCRYPTION_SECRET` is not set during release builds. In Rust code, return an explicit configuration error rather than falling back to a known constant.

#### 1.2 IPC Response Payload Safety

- **Files**: [settings.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/settings.rs), [commands/](file:///Users/2.o/businesskit/src-tauri/src/commands)
- **Status**: ⚠️ **PASS WITH WARNING**
- **Finding**:
  - `get_central_credentials` ([settings.rs:321-374](file:///Users/2.o/businesskit/src-tauri/src/commands/settings.rs#L321-L374)) properly masks `turso_token_masked` and `workos_api_key_masked` using a helper that truncates to `••••••••${last4}`.
  - `get_api_key` ([settings.rs:255](file:///Users/2.o/businesskit/src-tauri/src/commands/settings.rs#L255)) returns the decrypted value to the frontend; this is by design for user-configured third-party keys (e.g. OpenAI/Anthropic/Zernio), but must only be accessible over an authenticated IPC channel.
  - Raw `tursoToken`, `workosApiKey`, and `ENCRYPTION_SECRET` are never serialized in standard profile or organization responses.

#### 1.3 Frontend Environment Variable Leakage

- **Files**: [vite.config.ts](file:///Users/2.o/businesskit/vite.config.ts), [root.tsx](file:///Users/2.o/businesskit/src/root.tsx), [analytics-client.ts](file:///Users/2.o/businesskit/src/lib/analytics-client.ts)
- **Status**: ⚠️ **PASS WITH WARNING**
- **Finding**:
  - `vite.config.ts` only references `process.env.VITE_PORT`. No `VITE_` secrets or tokens are injected at build time.
  - [root.tsx](file:///Users/2.o/businesskit/src/root.tsx) only references `import.meta.env.BASE_URL`.
  - [analytics-client.ts](file:///Users/2.o/businesskit/src/lib/analytics-client.ts) and [smart-analytics.ts](file:///Users/2.o/businesskit/src/lib/smart-analytics.ts) contain leftover web tracking code targeting `/api/analytics/track` with CommonJS `require()` calls (`analytics-batcher`), which should be pruned for pure SSG desktop/mobile operation.

#### 1.4 Git Repository Tracking & Gitignore Validation

- **Files**: [.gitignore](file:///Users/2.o/businesskit/.gitignore), [src-tauri/.gitignore](file:///Users/2.o/businesskit/src-tauri/.gitignore)
- **Status**: ❌ **FAIL (CRITICAL)**
- **Finding**:
  Verification of Git index tracking revealed sensitive files committed directly to the repository:
  - `src-tauri/tauri.key` — **Tauri Mini-Sign Private Key** used for release artifact signing!
  - `src-tauri/tauri.key.pub` — Public signing key.
  - `src-tauri/centraldb.sqlite` & `src-tauri/user_db.sqlite` — Local SQLite databases containing schema and test data.
  - `src-tauri/gen/apple/assets/user_db.sqlite` — Seed database asset.
  - `.env.example` does NOT exist in the repository root.
- **Remediation**:
  1. Remove `tauri.key` from git immediately using `git rm --cached`, rotate the updater signing key pair, and add `*.key` to `.gitignore`.
  2. Untrack and gitignore all local `.sqlite` databases.
  3. Create `.env.example` with sanitized placeholder values.

#### 1.5 Credential File Fallback Encryption

- **Files**: [organization.rs:1391](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs#L1391), [vault.rs](file:///Users/2.o/businesskit/src-tauri/src/vault.rs)
- **Status**: ✅ **PASS**
- **Finding**:
  `store_in_file_cache()` in [organization.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs) encrypts the Turso token with `vault::encrypt(token, secret, profile_id)` before writing `userdb_{profile_id}.dat`. Raw tokens are never written to disk in plaintext.

#### 1.6 OS Keychain Usage

- **Files**: [organization.rs:1444-1454](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs#L1444-L1454)
- **Status**: ℹ️ **NOTE**
- **Finding**:
  `store_in_keychain` and `load_from_keychain` functions are shims pointing directly to `store_in_file_cache` and `load_from_file_cache` (AES-256-GCM encrypted files) to avoid OS keychain blocking dialogs and sandbox permission locks on mobile.

#### 1.7 Rust Logging of Secrets

- **Files**: [commands/social.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/social.rs), [commands/zernio_integration.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/zernio_integration.rs)
- **Status**: ⚠️ **WARNING**
- **Finding**:
  While `ENCRYPTION_SECRET` is not logged, raw JSON response strings from third-party social endpoints (including pre-signed S3 URLs and post payloads) are logged to stdout via `println!` in [social.rs:769, 869, 1348](file:///Users/2.o/businesskit/src-tauri/src/commands/social.rs).

---

### CHECK 2 — Personal Data Flow Audit

#### 2.1 Personal Data Collection Points & Flow

- **WorkOS AuthKit Flow**: Collects `email`, `workos_id`, `first_name`, `last_name`, `avatar_url`.
- **Central DB**: User row is upserted into Central DB (`users` table).
- **Session Cache**: Saved in `workos_session.dat` (encrypted via `vault::encrypt` with `"session"` domain).
- **RAM State**: Held in `AppState.auth_session` and `AppState.organization`.

#### 2.2 PII Logging in Rust

- **Files**: [commands/auth.rs:222, 270](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs#L222)
- **Status**: ⚠️ **WARNING**
- **Finding**:
  [auth.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs) prints user emails to logs:
  - `log::info!("WorkOS auth OK: {} ({})", email, workos_id);`
  - `log::info!("Auto-created Personal organization for {}", email);`
- **Remediation**:
  Redact or hash email addresses before logging (e.g., `log::info!("WorkOS auth OK: user_id={}", workos_id)`).

#### 2.3 Token Handling & Encryption Mechanics

- **Files**: [vault.rs:1-107](file:///Users/2.o/businesskit/src-tauri/src/vault.rs#L1-L107)
- **Status**: ✅ **PASS**
- **Finding**:
  [vault.rs](file:///Users/2.o/businesskit/src-tauri/src/vault.rs) uses standard, audited crates (`aes-gcm` v0.10, `pbkdf2` v0.12 with `Sha256`, `rand::rngs::OsRng`). Unique 96-bit nonce per encryption. Decryption failures return clean `anyhow::Result` errors without panics.

#### 2.4 Frontend `localStorage` Data Scope

- **Files**: [layout.tsx](file:///Users/2.o/businesskit/src/routes/layout.tsx), [AppSidebar.tsx](file:///Users/2.o/businesskit/src/components/app/AppSidebar.tsx), [agents/index.tsx](file:///Users/2.o/businesskit/src/routes/dashboard/agents/index.tsx)
- **Status**: ✅ **PASS**
- **Finding**:
  `localStorage` is strictly restricted to UI state flags and preferences:
  - `bk-theme` (light/dark)
  - `bk-sidebar-mode` (expanded/collapsed)
  - `bk-active-profile` (active profile UUID)
  - `bk-provisioned-${profileId}` (timestamp/boolean gate)
  - `bk-agent-provider`, `bk-agent-model`, `bk-agent-domain`
  - `bk-billing-density` ("compact" | "relaxed")
  - `bk-active-staff-id`
  **No** tokens, secrets, or database URLs are written to `localStorage`.

#### 2.5 Data Deletion on Logout

- **Files**: [commands/auth.rs:475-493](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs#L475-L493)
- **Status**: ❌ **FAIL (HIGH)**
- **Finding**:
  When `sign_out()` is executed:
  1. `clear_session_fallback()` deletes `workos_session.dat`.
  2. `crate::license::clear_user_id()` clears cached user ID.
  3. `state.auth_session`, `state.organization`, and `state.active_profile_id` are reset to `None`.
  **CRITICAL GAP**: `sign_out()` does **NOT** delete profile credential files (`userdb_{profile_id}.dat` or `settings/*.dat`), nor does it clear `state.ready_profiles` HashSet. If another user signs in on the same machine or re-opens the app, profile database credentials remain in the local file cache.
- **Remediation**:
  In `sign_out()`, iterate and remove all cached `userdb_*.dat` files, clear `state.ready_profiles.write().await.clear()`, and set `*state.user_db.write().await = None`.

---

### CHECK 3 — Pre-Submit App Store Audit

#### 3.1 Tauri Capabilities & Entitlements

- **Files**: [tauri.conf.json](file:///Users/2.o/businesskit/src-tauri/tauri.conf.json), [capabilities/default.json](file:///Users/2.o/businesskit/src-tauri/capabilities/default.json), [capabilities/desktop.json](file:///Users/2.o/businesskit/src-tauri/capabilities/desktop.json)
- **Status**: ⚠️ **PASS WITH HIGH SEVERITY CSP WARNING**
- **Finding**:
  - Permissions are scoped: `"core:default"`, `"shell:allow-open"`, `"dialog:default"`, `"core:event:default"`, `"updater:default"`. No `"shell:all"` or `"shell:execute"`.
  - **SECURITY FLAW**: `"csp": null` in [tauri.conf.json:42](file:///Users/2.o/businesskit/src-tauri/tauri.conf.json#L42).
  - **SECURITY FLAW**: `"assetProtocol": { "enable": true, "scope": ["**"] }` in [tauri.conf.json:43-48](file:///Users/2.o/businesskit/src-tauri/tauri.conf.json#L43-L48) permits reading any local file through the Tauri asset protocol if an attacker triggers an asset load.
- **Remediation**:
  1. Configure a strict CSP:

     ```json
     "csp": "default-src 'self' tauri: asset:; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' asset: https: data: blob:; connect-src 'self' ipc: https:;"
     ```

  2. Restrict `assetProtocol.scope` to specific app asset directories rather than `["**"]`.

#### 3.2 Debug Statements & Test Identifiers

- **Files**: `src-tauri/src/commands/`, `src/`
- **Status**: ⚠️ **WARNING**
- **Finding**:
  - `println!` & `eprintln!` are present in [social.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/social.rs), [zernio_integration.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/zernio_integration.rs), [jobs.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/jobs.rs), [shop_analytics.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/shop_analytics.rs), [variants.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/shop/variants.rs), [agents/chat.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/agents/chat.rs).
  - `console.log` statements are present in [layout.tsx](file:///Users/2.o/businesskit/src/routes/layout.tsx), [JobsForm.tsx](file:///Users/2.o/businesskit/src/components/JobsForm.tsx).
- **Remediation**:
  Replace all `println!` / `eprintln!` with structured `log::debug!` or `log::trace!` macros and strip frontend `console.log` statements in production builds via Vite configuration.

#### 3.3 TursoConn 429 Rate Limiting & Exponential Backoff

- **Files**: [turso.rs:111-250](file:///Users/2.o/businesskit/src-tauri/src/db/turso.rs#L111-L250)
- **Status**: ❌ **FAIL (MEDIUM)**
- **Finding**:
  `TursoConn::query`, `execute`, and `execute_statements` do not inspect HTTP status codes for `429 Too Many Requests` or implement exponential backoff retry logic. If Turso rate limits the client, the query immediately errors out.
- **Remediation**:
  Implement retry middleware with exponential backoff (e.g. 3 attempts with 200ms, 800ms, 2000ms jittered delay) upon receiving HTTP 429 or transient 503 responses.

#### 3.4 Elimination of `window.location.reload()`

- **Files**: [layout.tsx:648](file:///Users/2.o/businesskit/src/routes/layout.tsx#L648), [dashboard/tax/index.tsx:81](file:///Users/2.o/businesskit/src/routes/dashboard/tax/index.tsx#L81), [dashboard/crm/deals/index.tsx:251](file:///Users/2.o/businesskit/src/routes/dashboard/crm/deals/index.tsx#L251)
- **Status**: ❌ **FAIL (MEDIUM)**
- **Finding**:
  Direct `window.location.reload()` calls exist in:
  - `src/routes/layout.tsx:648`
  - `src/routes/dashboard/tax/index.tsx:81`
  - `src/routes/dashboard/crm/deals/index.tsx:251`
  On iOS and Android Tauri builds, triggering `window.location.reload()` can cause blank webview reloads or destroy in-memory Rust bridge bindings.
- **Remediation**:
  Replace `window.location.reload()` with reactive Qwik state invalidation or `nav(loc.url.pathname)`.

#### 3.5 Root CA Bundling (`webpki-roots`)

- **Files**: [Cargo.toml:52](file:///Users/2.o/businesskit/src-tauri/Cargo.toml#L52), [turso.rs](file:///Users/2.o/businesskit/src-tauri/src/db/turso.rs)
- **Status**: ✅ **PASS**
- **Finding**:
  `reqwest` is configured with `features = ["rustls-tls-webpki-roots"]`, bundling Mozilla root certificates. This ensures remote Turso HTTPS connections work in sandboxed iOS/Android environments without requiring OS CA store access.

---

### CHECK 4 — Deep Security Audit (Auth + Credentials + IPC)

#### 4.1 Cross-Profile Authorization Bypass (Profile Spoofing)

- **Files**: [organization.rs:1126-1194](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs#L1126-L1194), [organization.rs:1464-1570](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs#L1464-L1570)
- **Status**: ❌ **FAIL (CRITICAL)**
- **Vulnerability**:
  `switch_project(profile_id)` allows any caller to pass an arbitrary `profile_id`. The backend checks if the profile exists in Central DB, but **does not verify** whether the authenticated session user (`state.get_current_user_id()`) is the owner or an authorized member of that organization.
- **Exploit Scenario**:
  Because Central DB encrypts `turso_auth_token` with `ENCRYPTION_SECRET:profile_id`, and `ENCRYPTION_SECRET` is baked into every binary:
  1. User A is authenticated.
  2. User A invokes `switch_project("<User B Profile UUID>")`.
  3. Rust fetches User B's encrypted credentials from Central DB.
  4. Rust decrypts User B's token using the binary secret and switches the active `UserDb` connection to User B's private database.
  5. User A now has full read/write access to User B's profile database.
- **Remediation**:
  In `switch_project()` and `connect_from_keychain()`, query Central DB to confirm that `current_user_id` matches `organization.owner_user_id` or has a valid record in `team_members` for `profile_id` before loading credentials.

#### 4.2 WorkOS OAuth Callback Security

- **Files**: [commands/auth.rs:315-359](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs#L315-L359)
- **Status**: ✅ **PASS**
- **Finding**:
  - `recv_callback` validates `state_param == expected_state` (UUIDv4) to protect against CSRF.
  - Authorization code exchange occurs strictly in Rust (`complete_login` via direct HTTP POST to `https://api.workos.com/user_management/authenticate`).
  - Raw client secrets and tokens are never passed to the frontend.

#### 4.3 Port 4666 Blind Process Kill

- **Files**: [commands/auth.rs:380-396](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs#L380-L396)
- **Status**: ❌ **FAIL (MEDIUM)**
- **Finding**:
  Before binding the loopback server, the app executes `lsof -ti :4666` and `kill -9` on Unix:

  ```rust
  let pids = String::from_utf8_lossy(&out.stdout);
  for pid in pids.split_whitespace() {
      if let Ok(pid_num) = pid.parse::<u32>() {
          if pid_num != std::process::id() {
              let _ = std::process::Command::new("kill").args(["-9", pid]).output();
          }
      }
  }
  ```

  This indiscriminately terminates any other application or process listening on port 4666 on the user's system.
- **Remediation**:
  Instead of killing external processes, attempt binding to port 4666; if unavailable, use dynamic loopback port assignment (port `0`) and pass the chosen port to the OAuth redirect URI configuration.

#### 4.4 Unchecked File Path Traversal in Bank Statement Import

- **Files**: [commands/fin/bank.rs:164-172](file:///Users/2.o/businesskit/src-tauri/src/commands/fin/bank.rs#L164-L172)
- **Status**: ❌ **FAIL (HIGH)**
- **Finding**:
  `fin_import_bank_statement_from_path` takes an unvalidated `file_path: String` from IPC and calls `std::fs::read_to_string(&file_path)` directly.
- **Vulnerability**:
  An attacker executing JavaScript in the webview can invoke this command with arbitrary paths (e.g. `/etc/passwd` or user dotfiles). While the command attempts CSV parsing, error messages or subsequent queries can expose file contents.
- **Remediation**:
  Use Tauri's dialog plugin to obtain sanitized file paths or validate path canonicalization ensuring the path resides within user-selected document directories.

#### 4.5 SQL Parameterization Audit

- **Files**: `src-tauri/src/commands/`
- **Status**: ⚠️ **PASS WITH MINOR EXCEPTION**
- **Finding**:
  99% of SQL queries correctly use `crate::turso_params![...]` parameter binding.
  **Exception**: [commands/team.rs:98](file:///Users/2.o/businesskit/src-tauri/src/commands/team.rs#L98):

  ```rust
  let invites_query = format!("SELECT COUNT(DISTINCT email) FROM team_invites WHERE team_id IN ({}) AND status = 'pending'", profile_ids_str);
  ```

  While `profile_ids_str` is sourced from previous query rows, dynamic string interpolation into SQL is an anti-pattern and should use individual parameter placeholders (`?1, ?2, ...`).

---

### CHECK 5 — Attacker's Perspective

#### 5.1 Multi-Tenant Isolation & Database Key Derivation

- **Analysis**:
  In a Bring Your Own Database (BYODB) model, Central DB stores encrypted UserDB tokens. The key derivation is:

  ```rust
  password = format!("{}:{}", ENCRYPTION_SECRET, profile_id);
  ```

  Since `ENCRYPTION_SECRET` is static in the client binary and `profile_id` is public/guessable, the encryption provides confidentiality against an unauthorized party reading Central DB directly, but **zero tenant isolation between users of the desktop application** unless the Central DB / Rust IPC enforces strict ownership checks.
- **Impact**: Any authenticated user can access any other user's database if they know the `profile_id` UUID.
- **Fix**:
  1. Enforce strict session ownership validation in `switch_project` before fetching credentials.
  2. Derive per-user encryption keys from user authentication credentials (or user-specific Central DB KMS keys) rather than a single global static secret.

#### 5.2 Cloudflare Worker Script Deployment Plaintext Secrets

- **Files**: [deploy/cloudflare.rs:414-419](file:///Users/2.o/businesskit/src-tauri/src/deploy/cloudflare.rs#L414-L419)
- **Status**: ❌ **FAIL (HIGH)**
- **Finding**:
  When deploying Cloudflare Workers for client websites:

  ```rust
  "bindings": [
      { "type": "plain_text", "name": "TURSO_URL",    "text": env_vars.turso_url },
      { "type": "plain_text", "name": "TURSO_TOKEN",  "text": env_vars.turso_token },
      { "type": "plain_text", "name": "PROFILE_ID",   "text": env_vars.profile_id },
      { "type": "plain_text", "name": "DEPLOY_MODE",  "text": env_vars.deploy_mode },
      { "type": "plain_text", "name": "ENCRYPTION_SECRET", "text": env_vars.encryption_secret },
  ]
  ```

  Using `"type": "plain_text"` for `TURSO_TOKEN` and `ENCRYPTION_SECRET` leaves these high-privilege credentials completely exposed in cleartext in the Cloudflare Dashboard Workers settings.
- **Fix**:
  Change binding types for `TURSO_TOKEN` and `ENCRYPTION_SECRET` to `"type": "secret_text"`.

#### 5.3 Local Credential Cache Storage Locations

- **Files**: [organization.rs:1369-1388](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs#L1369-L1388)
- **Status**: ⚠️ **MEDIUM RISK**
- **Finding**:
  `get_cred_cache_dirs()` writes to multiple fallback locations simultaneously on every save:
  1. `data_local_dir()/businesskit/creds`
  2. `data_dir()/businesskit/creds`
  3. `$HOME/.businesskit/creds`
  4. `std::env::temp_dir().join("businesskit_creds")` (e.g. `/tmp/businesskit_creds`)
  Writing encrypted credential files to `/tmp` leaves artifacts on shared multi-user systems.
- **Fix**:
  Limit storage strictly to the standard OS application data directory (`dirs::data_local_dir()`). Only use temp directory as a last resort if all standard data directories fail.

---

## Action Plan & Remediation Checklist

### Immediate Pre-Submission Blockers (Priority 1)

- [ ] **Git Cleanup & Key Rotation**:
  - Remove `src-tauri/tauri.key` and `src-tauri/*.sqlite` from Git history.
  - Generate a fresh mini-sign key pair for Tauri updater and store the private key exclusively in CI/CD secrets.
  - Update `.gitignore` to ignore `*.key`, `*.sqlite`, `centraldb.sqlite`, `user_db.sqlite`.
  - Create a sanitized `.env.example`.

- [ ] **Remove Hardcoded Secret Fallbacks**:
  - Eliminate `"4def1********************************"` in [auth.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs) and [settings.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/settings.rs).
  - Enforce compile-time check in `build.rs` for `ENCRYPTION_SECRET`.

- [ ] **Enforce Ownership Check in `switch_project`**:
  - In [organization.rs](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs), verify `current_user_id` has ownership or team access to `profile_id` before querying credentials.

- [ ] **Configure Webview CSP & Asset Protocol Scope**:
  - Set a strict `csp` in [tauri.conf.json](file:///Users/2.o/businesskit/src-tauri/tauri.conf.json).
  - Restrict `assetProtocol.scope` from `["**"]` to designated app storage paths.

- [ ] **Fix Cloudflare Worker Secret Bindings**:
  - Update [deploy/cloudflare.rs](file:///Users/2.o/businesskit/src-tauri/src/deploy/cloudflare.rs) to use `"type": "secret_text"` for `TURSO_TOKEN` and `ENCRYPTION_SECRET`.

### Code Quality & Security Hardening (Priority 2)

- [ ] **Complete Logout Cleanup**:
  - In `sign_out()`, delete cached profile credential `.dat` files and clear `ready_profiles` HashSet.

- [ ] **Remove `window.location.reload()`**:
  - Replace reloads in [layout.tsx](file:///Users/2.o/businesskit/src/routes/layout.tsx), [tax/index.tsx](file:///Users/2.o/businesskit/src/routes/dashboard/tax/index.tsx), and [crm/deals/index.tsx](file:///Users/2.o/businesskit/src/routes/dashboard/crm/deals/index.tsx) with reactive state updates.

- [ ] **Add 429 Retry Logic in `TursoConn`**:
  - Add exponential backoff retry handling for HTTP 429 and transient connection errors in [turso.rs](file:///Users/2.o/businesskit/src-tauri/src/db/turso.rs).

- [ ] **Replace Port 4666 `kill -9`**:
  - Use graceful fallback port allocation for the OAuth loopback listener.

- [ ] **Clean Up Debug Logs**:
  - Replace `println!`/`eprintln!` in command files with `log::debug!`.

---

**Report Prepared by**: Antigravity AI Security Auditor  
**Workspace**: [businesskit](file:///Users/2.o/businesskit)

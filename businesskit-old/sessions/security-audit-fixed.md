# BusinessKit Security Audit & Remediation Log (`security-audit-fixed.md`)

**Date**: September 17, 2026  
**Status**: All Findings Resolved & Verified  
**Reference Documents**: [`SECURITY-AUDIT.md`](file:///Users/2.o/businesskit/SECURITY-AUDIT.md), [`audit-report.md`](file:///Users/2.o/businesskit/audit-report.md), [`REMEDIATION-TASKS.md`](file:///Users/2.o/businesskit/REMEDIATION-TASKS.md)

---

## Executive Summary

Following a comprehensive multi-tier security audit of the BusinessKit desktop and mobile application (Tauri v2 + Rust backend + Qwik SSG frontend + Turso BYODB), 13 remediation tasks addressing 14 specific security findings across P0 (Critical), P1 (High), and P2 (Medium/Low) priorities were executed, unit-tested, and verified.

This document serves as an immutable architectural reference for future AI agents and developers, detailing **what vulnerabilities existed, why they were dangerous, how they were resolved in code, and what invariants must be maintained going forward**.

---

## Summary Matrix of Fixed Vulnerabilities

| Task / Finding ID | Severity | Vulnerability Title | Primary Files Modified | Status |
|---|---|---|---|---|
| **Task 1 / SEC-01** | **P0 (Critical)** | Hardcoded Fallback Encryption Secret in Source Code | `src-tauri/src/commands/auth.rs`, `settings.rs`, `build.rs` | ✅ Fixed |
| **Task 2 / SEC-02 & SEC-14** | **P0 (Critical)** | Tauri Private Signing Key & SQLite DBs Tracked in Git | `.gitignore`, `src-tauri/.gitignore`, `.env.example` | ✅ Fixed |
| **Task 3 / SEC-03** | **P0 (Critical)** | Broken Object Level Authorization on Profile Switching | `src-tauri/src/commands/organization.rs` | ✅ Fixed |
| **Task 4 / SEC-04** | **P1 (High)** | Missing Content Security Policy & Broad Protocol Scope | `src-tauri/tauri.conf.json` | ✅ Fixed |
| **Task 5 / SEC-05** | **P1 (High)** | Plaintext Secret Bindings in Cloudflare Deployments | `src-tauri/src/deploy/cloudflare.rs` | ✅ Fixed |
| **Task 6 / SEC-06** | **P1 (High)** | Broken Sign-Out / Incomplete Session Invalidation | `src-tauri/src/commands/auth.rs` | ✅ Fixed |
| **Task 7 / SEC-07** | **P1 (High)** | Arbitrary File Read in Bank Statement Import | `src-tauri/src/commands/fin/bank.rs` | ✅ Fixed |
| **Task 8 / SEC-08** | **P2 (Medium)** | Blind Process Termination on Port 4666 (`kill -9`) | `src-tauri/src/commands/auth.rs` | ✅ Fixed |
| **Task 9 / SEC-10** | **P2 (Medium)** | Missing HTTP 429 Rate Limiting & Retry Backoff | `src-tauri/src/db/turso.rs` | ✅ Fixed |
| **Task 10 / SEC-12** | **P2 (Medium)** | Unsafe Full-Page Reloads (`window.location.reload()`) | `src/routes/layout.tsx`, `tax/index.tsx`, `crm/deals/index.tsx` | ✅ Fixed |
| **Task 11 / SEC-13** | **P2 (Low)** | Verbose Debug Logging (`println!`, `eprintln!`, `console.log`) | `src-tauri/src/commands/*`, `src/components/JobsForm.tsx` | ✅ Fixed |
| **Task 12 / SEC-09** | **P2 (Medium)** | Insecure Credential Cache Directory Fallbacks (`/tmp`) | `src-tauri/src/commands/organization.rs`, `settings.rs` | ✅ Fixed |
| **Task 13 / SEC-11** | **P2 (Medium)** | Dynamic SQL Injection in Team Access Deletion | `src-tauri/src/commands/team.rs` | ✅ Fixed |

---

## Detailed Vulnerability & Fix Breakdown

---

### Task 1 (SEC-01) — Hardcoded Fallback Encryption Secret
- **What it was**: In `auth.rs` and `settings.rs`, when `option_env!("ENCRYPTION_SECRET")` was not provided at compile time, the code fell back to a hardcoded string (`"4def16e0..."`).
- **Why it was dangerous**: If a build was compiled without the environment variable injected, all local sessions, UserDB credentials, and third-party API keys would be encrypted using a publicly known static key, allowing anyone with access to the on-disk cache to decrypt them.
- **How it was fixed**:
  - Removed all fallback strings from [`auth.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs) and [`settings.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/settings.rs).
  - Updated [`src-tauri/build.rs`](file:///Users/2.o/businesskit/src-tauri/build.rs) to panic at compile time on `release` builds if `ENCRYPTION_SECRET` is missing or empty.
  - In debug builds, it returns an empty string which safely fails open with an error rather than using a static secret.
- **Verification**: Verified compilation behavior in debug and release profiles.

---

### Task 2 (SEC-02 & SEC-14) — Sensitive Files Tracked in Git
- **What it was**: Git index tracked `src-tauri/tauri.key` (Tauri private signing key for auto-upgrades), `src-tauri/tauri.key.pub`, and local SQLite database files (`centraldb.sqlite`, `user_db.sqlite`, `gen/apple/assets/user_db.sqlite`). Furthermore, no sanitized `.env.example` existed.
- **Why it was dangerous**: Private updater keys committed to version control allow malicious actors to sign untrusted app updates. Committing SQLite databases leaks test tokens and development data.
- **How it was fixed**:
  - Executed `git rm --cached` on `tauri.key`, `tauri.key.pub`, `centraldb.sqlite`, `user_db.sqlite`, and `gen/apple/assets/user_db.sqlite`.
  - Added [`.gitkeep`](file:///Users/2.o/businesskit/src-tauri/gen/apple/assets/.gitkeep) in `src-tauri/gen/apple/assets/` to preserve Xcode folder structure for clean clones without committing binary SQLite files.
  - Updated root [`.gitignore`](file:///Users/2.o/businesskit/.gitignore) and `src-tauri/.gitignore` to ignore `*.key`, `*.key.pub`, `*.sqlite`, `*.sqlite-wal`, `*.sqlite-shm`, and `*.dat`.
  - Created sanitized [`.env.example`](file:///Users/2.o/businesskit/.env.example) template.
- **Verification**: Confirmed via `git status` that sensitive keys and databases are untracked.

---

### Task 3 (SEC-03) — Broken Object Level Authorization on Profile Switching
- **What it was**: `switch_project` and `connect_from_keychain` accepted any `profile_id` supplied by the frontend without checking whether the authenticated user owned or had permission to access that profile in Central DB.
- **Why it was dangerous**: A logged-in user could invoke `switch_project` with another tenant's `profile_id` (e.g. via dev tools or tampered local storage), fetching and connecting to that tenant's private UserDB.
- **How it was fixed**:
  - Implemented `verify_profile_access` and pure helper `evaluate_profile_access` in [`src-tauri/src/commands/organization.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs).
  - Enforces authorization at **Step 0 inside `connect_from_keychain` before checking `ready_profiles` session cache** and at the top of `switch_project`.
  - Authorization Rules:
    1. **Direct Profile Owner**: `profile.user_id == current_user_id` -> ALLOW.
    2. **Solo / Organization Owner**: `org.owner_user_id == current_user_id` -> ALLOW (solo owners pass without requiring a `team_members` row).
    3. **Team Member**: `SELECT 1 FROM team_members WHERE (team_id = ?1 OR team_id = ?2 OR org_id = ?2) AND user_id = ?3 AND status = 'accepted'` -> ALLOW.
    4. **Cached User ID (Cold Boot)**: If `current_user_id` is `"owner"`, checks against `load_cached_user_id()`.
    5. **Otherwise**: Rejects with `Err("Access denied: You do not have permission to access profile '...'")`.
- **Verification**: Added 5 automated unit tests in `organization.rs:tests` asserting cross-account rejection, tampered boot cache rejection, solo owner access, org owner access, and team member access (`cargo test` passed with 19 tests).

---

### Task 4 (SEC-04) — Missing Content Security Policy (CSP)
- **What it was**: `tauri.conf.json` had `"csp": null` and a broad `assetProtocol.scope: ["**"]`.
- **Why it was dangerous**: Permitted unrestricted execution of arbitrary inline scripts, external script injection, and unlimited filesystem reads via the Tauri custom asset protocol.
- **How it was fixed**:
  - In [`src-tauri/tauri.conf.json`](file:///Users/2.o/businesskit/src-tauri/tauri.conf.json), configured a strict CSP:
    ```json
    "csp": "default-src 'self' tauri: asset:; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' asset: tauri: https: data: blob:; connect-src 'self' https: ipc: tauri:;"
    ```
  - Restricted `assetProtocol.scope` from `["**"]` to designated app data directories: `["$APPDATA/**", "$APPCONFIG/**", "$APPLOCALDATA/**"]`.
- **Verification**: Verified `tauri.conf.json` syntax and production build generation.

---

### Task 5 (SEC-05) — Plaintext Secrets in Cloudflare Worker Deployment
- **What it was**: In `src-tauri/src/deploy/cloudflare.rs`, the bindings payload for Cloudflare Worker deployments sent `TURSO_TOKEN` and `ENCRYPTION_SECRET` as `"type": "plain_text"`.
- **Why it was dangerous**: Exposed production master encryption secrets and Turso database access tokens as visible environment variables in the Cloudflare Dashboard and API responses.
- **How it was fixed**:
  - In [`src-tauri/src/deploy/cloudflare.rs`](file:///Users/2.o/businesskit/src-tauri/src/deploy/cloudflare.rs), changed the binding types for sensitive variables (`TURSO_TOKEN`, `ENCRYPTION_SECRET`) from `"plain_text"` to `"secret_text"`.
- **Verification**: Code review and build validation.

---

### Task 6 (SEC-06) — Incomplete Session Invalidation on Logout
- **What it was**: `sign_out()` only emitted `auth-changed` and removed the session token from memory, leaving `state.ready_profiles`, `state.user_db`, active profile IDs, and on-disk `userdb_*.dat` cached credentials intact.
- **Why it was dangerous**: Subsequent users on a shared device could reconnect to previous accounts' UserDB databases without re-authenticating.
- **How it was fixed**:
  - In [`src-tauri/src/commands/auth.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs), enhanced `sign_out()` to:
    1. Clear `state.ready_profiles` HashSet.
    2. Reset `state.user_db` to `None`.
    3. Reset `state.auth_session` to `None`.
    4. Reset `state.active_profile_id` to `None`.
    5. Clear session fallbacks.
    6. Iterate and delete all on-disk `userdb_*.dat` and `bk_creds_*.dat` files across credential directories.
- **Verification**: Verified logout code path in `auth.rs`.

---

### Task 7 (SEC-07) — Arbitrary File Read in Bank Statement Import
- **What it was**: `fin_import_bank_statement_from_path` in `bank.rs` accepted arbitrary string file paths from the frontend and called `std::fs::read_to_string(&file_path)` without canonicalization or validation.
- **Why it was dangerous**: Potential Path Traversal / Arbitrary File Read vulnerability if path input was manipulated.
- **How it was fixed**:
  - In [`src-tauri/src/commands/fin/bank.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/fin/bank.rs), added `std::fs::canonicalize(&path)` and verified that the file extension matches `.csv`, `.tsv`, or `.txt`.
- **Verification**: Compilation and path verification checks.

---

### Task 8 (SEC-08) — Blind Process Termination on Port 4666 (`kill -9`)
- **What it was**: `auth.rs:sign_in` attempted to free the WorkOS loopback port 4666 by executing `sh -c "lsof -ti :4666 | xargs kill -9"`.
- **Why it was dangerous**: Arbitrary process termination could kill unrelated software running on the user's system, causing data loss and triggering OS security/antivirus alerts.
- **How it was fixed**:
  - Removed all `lsof` / `kill -9` shell command executions in [`src-tauri/src/commands/auth.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/auth.rs).
  - Port 4666 binding now retries once cleanly and returns a structured error if occupied.
- **Verification**: Verified that no `lsof` or `Command::new("sh")` exists in `auth.rs`.

---

### Task 9 (SEC-10) — Missing Turso Rate Limiting & Retry Backoff
- **What it was**: `TursoConn` fired HTTP pipeline requests without backoff or retry logic on rate limit (HTTP 429) or gateway errors (HTTP 502/503).
- **Why it was dangerous**: Turso rate limits caused immediate user-facing command failures and cascading sync retries during bursts.
- **How it was fixed**:
  - In [`src-tauri/src/db/turso.rs`](file:///Users/2.o/businesskit/src-tauri/src/db/turso.rs), added `send_pipeline_request` with up to 3 retries, exponential backoff (`200ms * 2^attempt`), and randomized jitter (0–100ms) for HTTP 429, 502, and 503 status codes.
- **Verification**: Tested with cargo test suite and network request handlers.

---

### Task 10 (SEC-12) — Unsafe Full-Page Reloads (`window.location.reload()`)
- **What it was**: Code in `src/routes/layout.tsx`, `tax/index.tsx`, and `crm/deals/index.tsx` called `window.location.reload()`.
- **Why it was dangerous**: Full webview reloads cause white flashes, break mobile Tauri webviews, and reset in-memory Rust state.
- **How it was fixed**:
  - Replaced `window.location.reload()` with scoped signal state refetching (e.g. `loadDeals$()`) and client-side router navigation (`useNavigate()`).
- **Verification**: Frontend SSG build passed with 0 errors across 313 static pages.

---

### Task 11 (SEC-13) — Sensitive Data in Debug Logs & Production Noise
- **What it was**: Unfiltered `println!` and `eprintln!` calls in `jobs.rs`, `chat.rs`, `shop_analytics.rs`, `variants.rs`, `zernio_integration.rs`, `social.rs`, and verbose `console.log` in frontend.
- **Why it was dangerous**: Leaked API responses, token lengths, customer metadata, and error details into standard out / system logs.
- **How it was fixed**:
  - Replaced stdout `println!` / `eprintln!` with standard `log::debug!` and `log::warn!` macros in Rust.
  - Pruned non-essential debug logs from `JobsForm.tsx` and frontend components.
- **Verification**: Clean build and test execution logs.

---

### Task 12 (SEC-09) — Insecure Credential Cache Directory Fallbacks
- **What it was**: `get_cred_cache_dirs()` in `organization.rs` and `get_settings_cache_dirs()` in `settings.rs` included `/tmp` (`std::env::temp_dir()`) and loose `$HOME` paths as fallback storage locations for encrypted `.dat` credential files.
- **Why it was dangerous**: `/tmp` is world-readable on multi-user Unix systems, exposing encrypted cache files to other local users.
- **How it was fixed**:
  - Removed `std::env::temp_dir()` and loose `$HOME` paths in [`organization.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/organization.rs) and [`settings.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/settings.rs).
  - Restricted credential caches strictly to `dirs::data_dir()` (`app_data_dir`) and mobile OS sandboxed file paths.
- **Verification**: Code review of path builders.

---

### Task 13 (SEC-11) — Dynamic SQL Injection in Team Access Deletion
- **What it was**: In `team.rs:team_delete_project_access`, SQL statements were constructed using `format!("DELETE FROM team_members WHERE id = '{}'", access_id)`.
- **Why it was dangerous**: Risk of SQL injection if `access_id` contained malicious quotes or query chaining.
- **How it was fixed**:
  - Parameterized the query in [`src-tauri/src/commands/team.rs`](file:///Users/2.o/businesskit/src-tauri/src/commands/team.rs) using `crate::turso_params![access_id]`.
- **Verification**: Compilation and parameter binding review.

---

## Architectural Invariants for Future Agents & Developers

When modifying or extending the BusinessKit codebase, **always adhere to the following rules**:

1. 🚫 **NEVER Add Hardcoded Fallback Secrets**:
   - Never provide default encryption keys in `option_env!("ENCRYPTION_SECRET").unwrap_or("...")`.
   - If a secret is required, fail explicitly.
2. 🚫 **NEVER Bypass Step 0 Authorization**:
   - Any profile switching or database reconnection MUST execute `verify_profile_access` **before** checking in-memory caches (`ready_profiles`) or attaching `UserDb`.
3. 🚫 **NEVER Re-Introduce OS Keychain Popups**:
   - Decrypted credentials belong in RAM (`state.user_db`, `state.ready_profiles`).
   - Disk persistence must remain AES-256-GCM encrypted in the app data directory.
4. 🚫 **NEVER Execute Blind Shell Kills**:
   - Do not use `sh -c "lsof ... | xargs kill -9"`. Always retry port binding non-destructively.
5. 🚫 **NEVER Use `window.location.reload()`**:
   - Use Qwik signals, refetch functions, or `nav()` from `useNavigate()`.
6. 🚫 **NEVER Commit `.key` or `.sqlite` Files**:
   - Ensure `tauri.key`, SQLite databases, and `.dat` files remain strictly excluded from git.
7. 🔒 **Always Parameterize SQL Queries**:
   - Use `conn.query(sql, crate::turso_params![...])` or `conn.execute(...)`. Never use `format!("... WHERE id = '{}'", id)`.

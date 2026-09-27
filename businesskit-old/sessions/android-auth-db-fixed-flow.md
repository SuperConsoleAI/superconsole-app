# Android Auth, CentralDB & UserDB Fix — Full Technical Reference

This document details the end-to-end architecture and technical resolutions for Android authentication, CentralDB (Turso), UserDB (per-profile Turso databases), macOS Keychain optimization, and Standalone Release APK packaging.

---

## 1. Summary of Issues & Resolutions

| Component | Symptom | Root Cause | Solution |
|---|---|---|---|
| **Android DNS (Turso & WorkOS)** | `ConnectError("dns error", ... No address associated with hostname)` | Android POSIX C library `getaddrinfo()` fails inside Rust threads because Android lacks `/etc/resolv.conf`. | Implemented `DynamicDnsResolver` in `src/db/turso.rs` using `hickory-resolver` querying Google Public DNS (`8.8.8.8:53`) over UDP. |
| **Release APK CentralDB Disconnect** | Standalone Release APK opened, showed `BK` avatar, 0 orgs, 0 profiles. | `build.rs` skipped root `/.env` if `src-tauri/.env` existed. Standalone release APKs had no compile-time `TURSO_DATABASE_URL` baked in. | Updated `src-tauri/build.rs` to merge both `../.env` and `src-tauri/.env` at compile time via `cargo:rustc-env`. |
| **Session & User ID Storage** | User logged in, but app bounced to `/login` or failed to persist session across app restarts. | Single-path resolution failed due to permissions/package ID differences between Debug (`.debug`) and Release packages. | Implemented multi-path fallback list in `auth.rs` and `license/mod.rs` (`$HOME/files/`, `$HOME/`, `/data/data/io.businesskit.desktop/files/`, etc.). |
| **Post-Auth & Sign-Out Page State** | Login showed email but no profiles until manual reload. Sign-out stayed on empty `/dashboard`. | Soft Qwik SPA client routing (`nav()`) did not re-mount the root `layout.tsx` context. | Replaced soft routing with full window resets (`window.location.href = "/dashboard"` after auth, `window.location.href = "/login"` on sign-out). |
| **macOS Keychain Prompts & Latency** | macOS app startup took multiple seconds, prompting 3 times ("Allow") for Keychain access. | `auth.rs` ran `security delete-generic-password` CLI in a loop, and `organization.rs` queried macOS Keychain for individual database credentials. | Removed `security` CLI loops in `auth.rs`. Updated `load_from_keychain()` to check local AES-256 encrypted file cache (`userdb_{profile}.dat`) first. |
| **Port 4666 Callback Error** | `Failed to start callback server on port 4666 (Address already in use OS error 48)`. | Closing browser before completing login left the previous `tiny_http` server temporarily holding port 4666. | Added self-healing 250ms retry binding in `auth.rs`. |

---

## 2. Key Architectural Fixes

### A. Compile-Time Secrets Baking (`src-tauri/build.rs`)

For standalone Release APKs (which run on real devices without `.env` files), secrets must be baked into the binary at build time:

```rust
// Reads secrets from both root ../.env AND src-tauri/.env
let root_env_path = Path::new(env!("CARGO_MANIFEST_DIR")).join("..").join(".env");
let local_env_path = Path::new(env!("CARGO_MANIFEST_DIR")).join(".env");

for path in &[root_env_path, local_env_path] {
    if let Ok(contents) = fs::read_to_string(path) {
        // parse and collect keys
    }
}
for (key, val) in &values {
    println!("cargo:rustc-env={}={}", key, val);
}
```

---

### B. Pure-Rust Dynamic DNS Resolver (`src-tauri/src/db/turso.rs`)

`DynamicDnsResolver` queries Google Public DNS (`8.8.8.8:53`) over UDP directly, bypassing Android's missing `/etc/resolv.conf`:

```rust
pub fn create_shared_http_client() -> reqwest::Client {
    let resolver = Arc::new(DynamicDnsResolver::new());
    reqwest::Client::builder()
        .user_agent("BusinessKit/1.0")
        .dns_resolver(resolver)
        .timeout(std::time::Duration::from_secs(45))
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}
```

---

### C. Robust Multi-Path Sandbox Persistence (`auth.rs` & `license/mod.rs`)

```rust
fn session_file_paths() -> Vec<std::path::PathBuf> {
    let mut paths = Vec::new();
    if let Ok(home) = std::env::var("HOME") {
        paths.push(std::path::PathBuf::from(&home).join("files").join("workos_session.json"));
        paths.push(std::path::PathBuf::from(&home).join("workos_session.json"));
    }
    paths.push(std::path::PathBuf::from("/data/data/io.businesskit.desktop/files/workos_session.json"));
    paths.push(std::path::PathBuf::from("/data/data/io.businesskit.desktop.debug/files/workos_session.json"));
    if let Some(d) = dirs::data_dir() {
        paths.push(d.join("businesskit").join("workos_session.json"));
    }
    paths
}
```

---

### D. Full Window Resets for Post-Auth & Sign-Out (`login/index.tsx` & `AppSidebar.tsx`)

```typescript
// login/index.tsx — After auth completes:
window.location.href = "/dashboard";

// AppSidebar.tsx — After sign-out completes:
window.location.href = "/login";
```

---

## 3. Build & Test Commands

### Development Mode (with ADB Reverse & Live Reload):
```bash
npm run android:dev
```

### Release APK (Standalone Signed APK):
```bash
npm run android:build
```
> **Output APK**: `src-tauri/gen/android/app/build/outputs/apk/arm64/release/app-arm64-release.apk`

---

## 4. Verification Checklist

- **WorkOS Auth**: Completed & Persisted across restarts ✓
- **CentralDB (Turso)**: Connected, Email & Orgs Loaded ✓
- **UserDB (Per-Profile)**: 3 Profiles Loaded & Operational ✓
- **Sign Out Flow**: Wipes session & returns cleanly to `/login` ✓
- **Platforms Verified**: macOS, iOS, Android Debug & Standalone Release APK ✓

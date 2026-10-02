# SuperConsole — Git Push & Release Playbook (`GitPUSH.md`)

This guide provides fast, foolproof instructions for committing changes, bumping app versions, and pushing releases to GitHub and Google Play.

---

## ⚡ Fast Cheat-Sheet

### 1. Everyday Fast Push (Snapshots & Quick Fixes)
For normal feature development, bug fixes, and daily work without bumping the release version:

```bash
# Check status
git status

# Stage, commit, and push
git add .
git commit -m "feat(settings): add preset assistant filtering"
git push origin main
```

---

### 2. Automated Release & Version Bump (One Command)
SuperConsole includes an automated release runner [`scripts/release.js`](scripts/release.js). It automatically updates all 6 version files across the Node, Rust, Android, and UI stacks, verifies compilation, commits, tags, and pushes in a single step:

```bash
# Bump to 0.0.5 (versionCode 5), run cargo check & npm run build, commit, tag, and push:
npm run release 0.0.5 5 --push
```

#### Other Handy Modes:
```bash
# Update all version files and run verification (without auto-pushing):
npm run release 0.0.5 5

# Quick dry-run bump (skipping long compilation steps):
npm run release 0.0.5 5 --skip-build
```

---

### 3. Manual Tagged Release Push
If you prefer running Git commands manually:

```bash
# 1. Update version across files (or run: npm run release 0.0.5 5 --skip-build)
# 2. Verify everything compiles cleanly:
cargo check --manifest-path src-tauri/Cargo.toml
npm run build

# 3. Stage and commit:
git add .
git commit -m "release: v0.0.5 (versionCode 5)"

# 4. Create tag:
git tag v0.0.5

# 5. Push both branch and tag to origin:
git push origin main
git push origin v0.0.5
```

> [!IMPORTANT]
> **Always push the tag (`git push origin v0.0.5`)!**  
> GitHub Actions release automation in [`.github/workflows/release.yml`](.github/workflows/release.yml) is triggered when a `v*` tag is pushed (or manually via `workflow_dispatch`).

---

## 📋 Synchronized Version Files Checklist

Whenever bumping versions (e.g. from `0.0.4` to `0.0.5`), the following files are synchronized:

| # | File Path | Field / Variable | Value Format |
|---|-----------|------------------|--------------|
| **1** | [`package.json`](package.json) | `"version"` | `"0.0.5"` |
| **2** | [`package-lock.json`](package-lock.json) | `"version"` (root & `packages[""]`) | `"0.0.5"` |
| **3** | [`src-tauri/Cargo.toml`](src-tauri/Cargo.toml) | `version` | `"0.0.5"` |
| **4** | [`src-tauri/Cargo.lock`](src-tauri/Cargo.lock) | `[[package]] name = "superconsole"` | Updated via `cargo check` |
| **5** | [`src-tauri/tauri.conf.json`](src-tauri/tauri.conf.json) | `"version"` | `"0.0.5"` |
| **6** | [`src-tauri/gen/android/app/build.gradle.kts`](src-tauri/gen/android/app/build.gradle.kts) | `versionCode` & `versionName` | `versionCode = ... 5`, `versionName = "0.0.5"` |

---

## 📱 Android Google Play Specifics (`versionCode`)

Google Play Console enforces strict monotonically increasing version codes:

```kotlin
// src-tauri/gen/android/app/build.gradle.kts
versionCode = tauriProperties.getProperty("tauri.android.versionCode", "5").toInt().coerceAtLeast(5)
versionName = tauriProperties.getProperty("tauri.android.versionName", "0.0.5")
```

- **`versionCode` must always increase** (e.g. `4` → `5` → `6`). An APK or AAB with a duplicate or lower `versionCode` will immediately fail Google Play upload.
- **Target SDK**: Kept at `targetSdk = 36` and `compileSdk = 36` per Google Play developer requirements.

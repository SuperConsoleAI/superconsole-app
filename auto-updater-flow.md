# BusinessKit/SuperConsole Auto-Updater Flow

This document details how our 2-repository setup handles auto-updates seamlessly without exposing the private source code to the public internet.

## Architecture

We use two GitHub repositories:
1. **Private Code Repo** (`superconsole-app`): Contains the actual source code, the Tauri app, and the GitHub Action workflow that builds and signs the releases.
2. **Public Release Repo** (`superconsole`): An empty repository used strictly as a free, globally distributed Content Delivery Network (CDN) to host our binary assets and manifest file (`latest.json`).

## The Auto-Update Lifecycle

### 1. Build and Release Pipeline

1. **Trigger:** A developer tags a release locally (e.g., `v1.0.0`) and pushes it to the **Private Code Repo**.
2. **Build:** The `.github/workflows/release.yml` GitHub Action triggers on the `v*` tag. It spins up cloud runners for macOS and Windows.
3. **Compile:** The action runs `tauri build`. Because the `TAURI_SIGNING_PRIVATE_KEY` secret is injected into the environment, Tauri automatically cryptographically signs the generated `.tar.gz` (Mac) and `.zip` (Windows) bundles, producing corresponding `.sig` files.
4. **Manifest Generation:** The `tauri-apps/tauri-action` detects the `.sig` files and automatically generates a `latest.json` manifest file containing the versions, signature keys, and download paths.
5. **Publish:** A custom final job in the GitHub Action downloads these assets from the private draft release, rewrites the URLs in `latest.json` to point to the public repository instead of the private one, and uses the `GH_RELEASE_TOKEN` to push the final release to the **Public Release Repo**.

### 2. Client Update Pipeline

1. **Poll:** When a user opens the SuperConsole desktop app, the React frontend (`AutoUpdater.tsx`) calls `@tauri-apps/plugin-updater`'s `check()` function.
2. **Fetch:** The plugin reaches out to the hardcoded endpoint in `tauri.conf.json`, which points to the `latest.json` hosted on the **Public Release Repo**.
3. **Compare:** Tauri parses the JSON and compares the remote version with the local app version. If the remote version is higher, it returns an `Update` object to the React frontend.
4. **Prompt:** The React frontend displays an "Update Available" toast in the bottom right corner, showing the release notes and a "Download & Restart" button.
5. **Install:** When the user clicks the button, the Tauri updater downloads the `.tar.gz` or `.zip` bundle, cryptographically verifies its `.sig` signature against the Public Key hardcoded in the app, extracts the new binaries over the old ones, and calls `@tauri-apps/plugin-process` to restart the app automatically.

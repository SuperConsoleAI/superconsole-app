# BusinessKit Auto-Updater Flow

This document outlines the architecture and sequence for compiling, distributing, and silently installing updates to the BusinessKit Tauri Desktop App using GitHub Actions and GitHub Releases.

## Architecture

BusinessKit uses a two-repository architecture to securely distribute updates without exposing the proprietary source code:

1. **`businesskit-app` (Private):** Contains all source code, API keys, and the GitHub Action workflow.
2. **`businesskit` (Public):** An empty repository used strictly as a free, globally distributed CDN for hosting the compiled release binaries (`.dmg`, `.exe`, `.tar.gz`, `.zip`) and the updater manifest (`latest.json`).

## Workflow Diagram

```mermaid
sequenceDiagram
    participant Dev as Developer
    participant PrivRepo as Private Repo (Code)
    participant Action as GitHub Action (CI)
    participant PubRepo as Public Repo (Releases)
    participant App as User's Desktop App

    %% 1. The Build Phase
    rect rgb(240, 240, 240)
    Note over Dev,PubRepo: 1. Build and Release Pipeline
    Dev->>PrivRepo: 1) Push code & tag (e.g. v0.0.2)
    PrivRepo->>Action: 2) Trigger `release.yml` Workflow
    Action->>Action: 3) Build Mac (.dmg / .tar.gz)
    Action->>Action: 4) Build Windows (.exe / .zip)
    Action->>Action: 5) Sign .tar.gz & .zip with Private Key
    Action->>PubRepo: 6) Create Release & Upload Binaries + Signatures + latest.json
    end

    %% 2. The Auto-Update Phase
    rect rgb(230, 245, 255)
    Note over PubRepo,App: 2. Silent Auto-Update Pipeline
    App->>App: 1) User opens BusinessKit
    App->>PubRepo: 2) Background fetch: /releases/latest/download/latest.json
    PubRepo-->>App: 3) Returns JSON (Version 0.0.2, download URLs, Signatures)
    
    alt If Version on GitHub > Local Version
        App->>PubRepo: 4) Download .tar.gz / .zip bundle
        PubRepo-->>App: 5) Returns binary bundle
        App->>App: 6) Cryptographically verify bundle using Public Key
        App->>App: 7) Extract & overwrite local binaries
        App->>App: 8) Restart BusinessKit automatically
    end
    end
```

## Setup & Keys

The updater relies on cryptographic signatures to prevent man-in-the-middle (MITM) attacks.

- **Public Key:** Hardcoded into `src-tauri/tauri.conf.json`. The app uses this to verify that the downloaded update genuinely came from the developer.
- **Private Key:** Stored securely in GitHub Secrets (`TAURI_PRIVATE_KEY`). The GitHub Action uses this to sign the compiled update bundles before uploading them to the public repository.
- **GitHub Token:** A Personal Access Token stored in GitHub Secrets (`GH_RELEASE_TOKEN`). The GitHub Action uses this to authenticate and push the release files from the private repository to the public repository.

## The Updater JSON (`latest.json`)

The public repository hosts a dynamically generated `latest.json` file. The Tauri app periodically polls this file to check for updates. The file structure looks like this:

```json
{
  "version": "0.0.2",
  "notes": "See the assets to download this version and install.",
  "pub_date": "2026-07-23T10:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "dW50...",
      "url": "https://github.com/businesskitai/businesskit/releases/download/v0.0.2/BusinessKit_0.0.2_aarch64.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "dW50...",
      "url": "https://github.com/businesskitai/businesskit/releases/download/v0.0.2/BusinessKit_0.0.2_x64.zip"
    }
  }
}
```

# Technology Stack & Tooling

## Core Technology Stack

| Layer | Technology | Version | Purpose & Rationale |
|-------|------------|---------|─────────────────────|
| **App Framework** | Tauri v2 | `2.11.2` | Lightweight cross-platform native wrapper for macOS, iOS, Android, and Windows. Replaces heavy Electron binaries. |
| **Frontend UI** | Qwik SSG | `1.20.0` | High-performance resumable UI framework generating pure static HTML/JS for Tauri webview. |
| **Backend Runtime** | Rust | `1.77.2+` | Safe, high-performance native backend handling SQLite IPC, encryption, network, and keychain. |
| **Styling** | Tailwind CSS | `v4.3.2` | Utility-first CSS engine powering UI components and layout responsive breakpoints. |
| **Icons** | `@qwikest/icons` | `0.0.13` | Lightweight SVG icons matching design system. |
| **Editor** | TipTap | `3.27.3` | Extensible rich-text editor for CMS content, email builders, and posts. |
| **Document Export** | `html2pdf.js` | `0.14.0` | Client-side thermal and A4 Tax Invoice / Estimate PDF rendering and printing. |
| **QR Code Engine** | `qrcode` | `1.5.4` | Dynamic QR generation for UPI payments, e-Invoice IRNs, and stay/event check-in gates. |
| **Terminal Emulator** | `xterm` & `xterm-addon-fit` | `^5.3.0` / `^0.8.0` | High-performance ANSI terminal frontend for interactive agent PTY sessions. |
| **Pseudo-Terminal (PTY)** | `portable-pty` | `0.8` | Cross-platform Rust native PTY manager (desktop builds only). |
| **Agent Protocol** | MCP (JSON-RPC 2.0) | Standard stdio | Standalone stdio server exposing toolbelt to external coding CLIs (`--mcp`). |
| **LLM Streaming Runtime** | Multi-Provider Engine | Native HTTP SSE | Resilient SSE streaming for Anthropic Claude, OpenAI, Gemini, DeepSeek, Ollama, Groq, OpenRouter. |

---

## Database & Encryption Services

- **Turso Database**: Distributed SQLite platform used for BYODB architecture.
  - **HTTP Pipeline API v2**: REST/Pipeline endpoint (`{db_url}/v2/pipeline`).
  - **`TursoConn` (HTTP Client Shim)**: Custom Rust client using `reqwest` + `webpki-roots`. Bypasses system CA certificate store restrictions on mobile OS sandboxes. Includes exponential retry backoff and jitter.
- **Crypto & Vault**:
  - `aes-gcm` (v0.10): Authenticated AES-256-GCM encryption for credentials on disk and in transit.
  - `pbkdf2` (v0.12): Key derivation (100k rounds, HMAC-SHA256).
- **In-Memory RAM Caching**: Active decrypted credentials and database connections are stored in RAM (`AppState.user_db`, `ready_profiles`) with local AES-256 `.dat` file fallback. OS Keychain is deprecated to prevent OS modal freezes.

---

## Dev Tooling & Configuration Files

- [`tauri.conf.json`](file:///Users/2.o/businesskit/src-tauri/tauri.conf.json): Core Tauri application settings, app identifiers, build scripts, and window permissions.
- [`tauri.ios.conf.json`](file:///Users/2.o/businesskit/src-tauri/tauri.ios.conf.json): iOS bundle configuration, Team ID binding, and iOS-specific permissions.
- [`tauri.android.conf.json`](file:///Users/2.o/businesskit/src-tauri/tauri.android.conf.json): Android package name, SDK paths, and permission manifests.
- [`Cargo.toml`](file:///Users/2.o/businesskit/src-tauri/Cargo.toml): Rust backend dependencies and compilation flags (`cdylib`, `staticlib`).
- [`package.json`](file:///Users/2.o/businesskit/package.json): Frontend npm dependencies and multi-platform build/dev scripts.
- [`vite.config.ts`](file:///Users/2.o/businesskit/vite.config.ts): Vite configuration for Qwik SSG build integration.
- [`tsconfig.json`](file:///Users/2.o/businesskit/tsconfig.json): TypeScript strict mode configuration.

---

## Version Constraints & Dependencies

- **Node.js**: `^18.17.0 || ^20.3.0 || >=21.0.0`
- **Rust**: `>= 1.77.2`
- **Tauri CLI**: `2.6.2+`
- **Android SDK**: `Platform Tools (adb)` installed with `adb reverse` support for dev tunneling.

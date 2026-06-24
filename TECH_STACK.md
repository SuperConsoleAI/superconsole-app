# TECH_STACK.md

Every dependency and why it's here. App target: <30MB installed, Mac first (Windows later).

## Desktop shell

| Dep | Why |
|-----|-----|
| Tauri 2 (`tauri`, `tauri-build`) | Rust-native shell, ~10x smaller than Electron. Window config in `tauri.conf.json` uses macOS `titleBarStyle: Overlay`. |
| `tauri-plugin-dialog` | Native folder picker for Add Workspace. |
| `tauri-plugin-opener` | Open external links (Documentation). |
| `tauri-plugin-webview` | Embedded webview management used by the Browser tab for native web rendering bypassing iframe restrictions. |
| `tauri-plugin-updater` | Auto-update scaffolding. Inert until `pubkey` + endpoint are set in tauri.conf.json (needs `TAURI_SIGNING_PRIVATE_KEY` + `createUpdaterArtifacts` at release time). |

## Rust crates (src-tauri/Cargo.toml)

| Crate | Why |
|-------|-----|
| `portable-pty` 0.9 | Real PTY sessions (same approach as VS Code terminal). Core of the app. |
| `rusqlite` 0.32 (`bundled`) | Local SQLite, no system dependency. All persistence. |
| `cron` 0.12 + `chrono` | Cron parsing + next-run computation (5-field input, seconds prepended). |
| `tokio` (`time`, `sync` features) | Tick loops; `sync::Mutex` serializes cloud project creation. Tauri's async runtime is tokio already. |
| `tiny_http` 0.12 | Minimal blocking HTTP server for remote triggers + WorkOS loopback callback (127.0.0.1 only). Chosen over axum to keep binary small. |
| `reqwest` 0.12 (`json`, `rustls-tls`, no default features) | Telegram Bot API, WorkOS auth, Turso HTTP, and LLM provider streaming. rustls avoids OpenSSL linkage. |
| `rand` 0.8 | API token generation. |
| `serde` / `serde_json` | IPC + JSON payloads. |
| `keyring` 3 (`apple-native`) | Stores the WorkOS session + derived AES key in the macOS keychain. |
| `ulid` 1 | ULID primary keys for cloud rows (matches Turso schema). |
| `dotenvy` 0.15 | Loads cloud config from the gitignored root `.env`. |
| `aes-gcm` 0.10 + `hkdf` 0.12 + `sha2` 0.10 + `base64` 0.22 | AES-256-GCM secret encryption with HKDF-SHA256 key derivation; must match web `crypto.ts`. |

## Frontend (package.json)

| Dep | Why |
|-----|-----|
| React 19 + Vite 7 | UI. Vite dev server on fixed port 1420 (Tauri requirement). |
| `@tanstack/react-router` | Type-safe code-based routing with memory history; views are panels, not pages. |
| Tailwind CSS v4 (`@tailwindcss/vite`) | CSS-first config; all tokens in `src/index.css`, no tailwind.config. |
| shadcn/ui (via CLI, `components.json`) | UI primitives on `radix-ui` + `class-variance-authority` + `tailwind-merge` + `clsx`. Regenerate with `npx shadcn add <c> -y -o`. |
| `tw-animate-css` | Animation utilities shadcn v4 components expect (`animate-in` etc.). |
| `@xterm/xterm` + `@xterm/addon-fit` + `@xterm/addon-webgl` | Terminal rendering for PTY sessions (WebGL renderer, falls back to default if unavailable). |
| `react-markdown` + `remark-gfm` | Markdown rendering in Inbox + file editor preview. |
| `@uiw/react-codemirror` | Syntax-highlighted code editor for the FileEditor tab. |
| `lucide-react` | Icon set (CLI brand icons are local SVGs in `src/assets/icons/preset-icons/`). |
| `@ridemountainpig/svgl-react` | Brand SVG logos for the plugin marketplace (`PluginIcon.tsx`). Light/dark variants for monochrome logos (GitHub); multi-colour logos (Figma, Slack, Google, Stripe…) used as-is. |
| `@fontsource-variable/{archivo,lora,jetbrains-mono}` | Bundled variable fonts (offline app, no Google Fonts CDN). |
| JetBrains Mono Nerd Font (static, `src/assets/fonts/`) | Terminal font, bundled `@font-face` (static, not variable — variable fonts mis-measure xterm cell width). Provides Nerd Font icon glyphs for CLI logos/box-art. |
| `@tauri-apps/api` + plugin guests (`plugin-dialog`, `plugin-opener`, `plugin-updater`) | IPC + plugin JS bindings. |

## Dev tooling

| File | Purpose |
|------|---------|
| `vite.config.ts` | React + Tailwind plugins, `@` alias → `src/`, Tauri dev-server settings (port 1420, ignore src-tauri). |
| `tsconfig.json` | Strict TS, bundler resolution, `@/*` paths. |
| `components.json` | shadcn CLI config (new-york style, neutral base, lucide). |
| `app-icon.png` | 1024px source icon (generated). `cargo tauri icon app-icon.png` regenerates `src-tauri/icons/`. |

## Version constraints / surprises

- Tauri CLI is installed via cargo (`cargo tauri ...`), not npm — `npx tauri` won't work here.
- shadcn CLI v4: `-b` flag means component base (`radix`), not base color; interactive init was bypassed by writing `components.json` manually.
- Tailwind v4 syntax throughout (`@theme`, `@custom-variant`); v3 config patterns don't apply.
- `cron` crate requires 6/7-field expressions — handled centrally in `scheduler::next_run`, don't parse cron elsewhere.
- React 19: no `forwardRef` needed in new shadcn components (they use plain props).
- Release artifacts: `cargo tauri build` → `src-tauri/target/release/bundle/{macos/SuperConsole.app, dmg/SuperConsole_0.1.0_aarch64.dmg}` (aarch64; add `--target x86_64-apple-darwin` or a universal build for Intel Macs).

## Cloud + web portal

- Desktop cloud deps are listed above (keyring, ulid, dotenvy, aes-gcm/hkdf/sha2/base64, reqwest). Identity is WorkOS; cloud DB is Turso (libSQL) reached over HTTP from the desktop via `cloud.rs`.
- Turso schema includes global catalog tables (`plugins`, `connector_catalog`, `mcp_catalog`, `commands_catalog`, `hooks_catalog`, `installed_plugins`) defined in `superconsole-web/src/db/schema.ts`. These are pushed via `node superconsole-web/scripts/push-catalog-tables.mjs` (direct Turso HTTP) rather than `drizzle-kit push` (interactive). `sync_manager::sync_catalogs` pulls them into local SQLite cache on every sync.
- The web portal (`superconsole-web/`) is a separate stack: TanStack Start + React 19 on Cloudflare Workers, Drizzle ORM over `@libsql/client/web`, `@workos-inc/node`, wrangler. It must stay Workers-compatible (Web APIs only, no Node built-ins/native binaries). See `superconsole-web/TECH_STACK` notes inside its `PROJECT.md`.

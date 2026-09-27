# Developer Context & Workflows

## Qwik Frontend Patterns & Rules

- **SSG-Only**: The UI is built entirely as a Static Site Generation (SSG) bundle.
- **FORBIDDEN**: Never use `routeLoader$`, `routeAction$`, or `server$`. They require a Node/Cloudflare server runtime and will break `npm run tauri build`.
- **Data Lifecycle**: All data fetching occurs client-side inside `useVisibleTask$`. Always track `activeProfileId` before firing IPC queries:
  ```ts
  useVisibleTask$(async ({ track }) => {
    const profileId = track(() => ctx.activeProfileId.value);
    if (!profileId) return;
    // Safe to invoke Tauri IPC commands
  });
  ```
- **SPA Navigation Only**: Never use `window.location.href` or `window.location.reload()`. This reloads the webview, causing flashes and wiping Rust in-memory state. Always use `useNavigate()` (`nav("/path")`).
- **SlideOver Detail Pattern**: Shop and financial detail/edit views use slideout panels (`<SlideOver>`, `<CustomerDetailSlideOver>`, `<AddProductModal>`) rather than parametric URL routes (e.g. no `products/[id]`). This preserves frontend state and avoids route reload churn.

---

## Tauri v2 Multi-Platform Constraints

- **Platforms Supported**: macOS, iOS, Android, Windows.
- **Capabilities & Permissions**: Keep `tauri.conf.json` permissions minimal (`core:default`, `shell:open`, `event:default`). Do **NOT** enable `shell:all` (causes App Store rejection).
- **Mobile Network Tunneling**: For local Android dev, `adb reverse tcp:5175 tcp:5175` is required so the device can access Vite dev server.

---

## Environment Variables

Defined in `.env` (loaded automatically by `dotenvy` in Rust and Vite on frontend). See `.env.example` for reference templates:

- `ENCRYPTION_SECRET`: Master key for AES-256-GCM decryption of Central DB UserDB credentials. Must be set for release builds (`build.rs` compile-time panic check).
- `TURSO_DATABASE_URL`: Turso HTTP pipeline URL for Central DB.
- `TURSO_AUTH_TOKEN`: Auth bearer token for Central DB.
- `WORKOS_CLIENT_ID` / `WORKOS_API_KEY`: WorkOS desktop authentication configuration.

---

## Codebase Gotchas & Workarounds

### 1. Qwik Serialization Code 14 Error

- **Issue**: Qwik's optimizer fails to serialize closures if an event listener references component props directly (e.g. `onMouseOver$`).
- **Fix**: Use CSS pseudo-classes (`:hover`), `data-*` attributes, or derive references from `e.currentTarget`.

### 2. Missing System CA Roots on Mobile

- **Issue**: Android/iOS app sandboxes block native system CA cert store lookup, causing TLS errors in `libsql`.
- **Fix**: All DB communication routes through `TursoConn` (`src-tauri/src/db/turso.rs`) using `reqwest` with bundled `webpki-roots`.

### 3. Session Invalidation & Cleanup on Logout

- **Rule**: `sign_out()` in `auth.rs` clears in-memory state (`ready_profiles`, `user_db`, `active_profile_id`) and physically removes cached `userdb_*.dat` files from disk to prevent credential reuse.

### 4. SPA Navigation & State Preservation

- **Rule**: Never call `window.location.reload()`. Use Qwik reactivity or client-side navigation (`useNavigate`) to prevent wiping in-memory database handles.

### 5. Provisioning Guard Gate

- Every profile switch must verify `last_provisioned_at` before opening the dashboard. Unprovisioned profiles are forced to navigate to `/dashboard/settings/status`.

### 6. Financial Currency & Precision Math

- Store all monetary values as integer smallest currency units (cents / paise) or explicit decimal strings to avoid IEEE 754 floating-point rounding errors across line-item tax calculations and double-entry balancing.

### 7. Multi-Regime Tax Adaptation

- UI tabs for compliance conditionally adapt based on `fin_tax_configs.regime`:
  - `india_gst`: Shows GSTR-1, GSTR-3B, e-Invoice (IRN), e-Way Bill, TDS/TCS.
  - `uk_vat` / `eu_vat`: Shows VAT return summary and reverse charge logs.
  - `us_sales_tax`: Shows state/county rate matrices.
  - `exempt`: Hides tax filing tabs.

### 8. Desktop-Only Terminal Mode (PTY)

- `commands::agents::pty` and `portable-pty` are strictly compiled for desktop targets (`cfg(not(any(target_os = "android", target_os = "ios")))`).
- PTY commands (`start_terminal_session`, `write_terminal_input`, etc.) do not exist in mobile builds. UI must check desktop availability before mounting xterm.js tabs.

### 9. Agent Workspace & Antigravity Trust Scaffolding

- Agent files and CLI workspace live at `~/.businesskit/profiles/{profile_id}/workspace/`.
- `start_terminal_session` and `cli.rs` automatically scaffold `output/` and pre-register trust in `~/.gemini/antigravity-cli/trusted_folders.json` and `projects.json` to prevent interactive trust prompts from deadlocking background runners.

### 10. MCP Server Stdio Protocol Hygiene

- When launched in MCP mode (`./businesskit --mcp --profile <id>`), stdout is reserved exclusively for JSON-RPC 2.0 frames.
- **Rule**: All logging in MCP code paths must use `eprintln!`, never `println!`. Any stray stdout write will desync the protocol parser and terminate the external agent.

### 11. Strict Tool Isolation to UserDB

- The agent toolbelt (`src-tauri/src/commands/agents/tools/`) operates exclusively against `&TursoConn` for the active profile's UserDB.
- `ToolCtx` deliberately omits references to Central DB, preventing agents from ever reading or mutating global credentials, licenses, or other tenant profiles.

---

## Build, Run & Deploy Commands

### Development

```bash
# Desktop Dev (macOS / Windows)
npm run tauri dev

# iOS Simulator
npm run ios:dev

# iOS Physical Device
npm run ios:dev:device

# Android Emulator / Device (includes adb port reverse)
npm run android:dev
```

### Production Builds

```bash
# Desktop Bundle (macOS .dmg / .app, Windows .msi)
npm run build:desktop

# iOS IPA Export
npm run ios:build:export

# Android APK / AAB
npm run android:build
npm run android:build:aab
```

# Architecture

## Core Architecture Overview

BusinessKit is a multi-platform desktop and mobile app (macOS, iOS, Android, Windows) built with **Tauri v2**, **Qwik SSG**, and **Rust**. It operates on a **Bring Your Own Database (BYODB)** architecture powered by Turso.

```
┌─────────────────────────────────────────────────────────┐
│                     Qwik SSG UI                         │
│   (Static HTML/JS - No routeLoader$ / routeAction$)     │
│   ├── Core Workspaces (CRM, Social, CMS, Forms, Jobs)  │
│   ├── Shop Suite (Products, Restaurant, Stays, POS)     │
│   ├── Finance & Tax Hub (Accounts, Journal, Tax, GST)   │
│   └── Agent Hub (Chat, CLI Switcher, Desktop PTY, MCP)  │
└────────────────────────────┬────────────────────────────┘
                             │ IPC invoke() & Events via src/lib/ipc.ts
┌────────────────────────────▼────────────────────────────┐
│                    Tauri v2 Rust Backend                │
│   ┌─────────────────────────────────────────────────┐   │
│   │ AppState (RwLock CentralDB, UserDB, Licenses,   │   │
│   │           PtySessionManager, ChatCancels)       │   │
│   ├─────────────────────────────────────────────────┤   │
│   │ Command Handlers:                               │   │
│   │ ├── commands/agents/ (Chat, CLI, PTY, MCP,      │   │
│   │ │                     Analytics, Brand, Tools)  │   │
│   │ ├── commands/shop/   (20 submodules)            │   │
│   │ ├── commands/fin/    (12 submodules)            │   │
│   │ └── commands/*.rs    (core, crm, social, etc.)  │   │
│   └───────────────┬─────────────────┬───────────────┘   │
│                   │                 │                   │
│         TursoConn HTTP Client   Stdio MCP Server        │
│       (reqwest + webpki-roots)  (JSON-RPC 2.0)          │
└───────────────────┬─────────────────┴───────────────────┘
                    │ Turso HTTP Pipeline API v2
┌───────────────────▼─────────────────────────────────────┐
│                     Turso Database                      │
│   ┌──────────────────────┐    ┌──────────────────────┐  │
│   │      Central DB      │    │  UserDB (per profile)│  │
│   │ (Orgs, Profiles,     │    │ (Shop Ops, Accounts, │  │
│   │ Encrypted UserDB KVs)│    │  Tax, CRM, Agents)   │  │
│   └──────────────────────┘    └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## Data Flow Architecture

1. **User Action (UI Layer)**: User interacts with a Qwik page, slideout, or agent interface (e.g. in `src/routes/dashboard/shop/`, `src/routes/dashboard/accounts/`, or `src/routes/dashboard/agents/`).
2. **IPC Handshake**: Page or component calls Tauri's `invoke(cmd, payload)` directly or via typed wrappers in `src/lib/ipc.ts`. All argument keys are strictly camelCase. Real-time token streams and terminal output arrive via Tauri event listeners (`chat-token`, `pty-output`).
3. **Rust Command Dispatch**: Tauri routes requests to modularized Rust handlers:
   - **Agent Commands** (`src-tauri/src/commands/agents/`): Multi-model chat streaming, headless CLI execution, desktop PTY terminals, slash command dispatch, brand context, and autonomous toolbelt execution.
   - **Shop Commands** (`src-tauri/src/commands/shop/`): Items, variants, billing/invoicing, stock/inventory, POS shifts, restaurant tables/KOTs/recipes, hotel stays/folios, customers, vendors, discounts, reviews, and analytics.
   - **Finance Commands** (`src-tauri/src/commands/fin/`): Double-entry journal entries, chart of accounts, bank statement reconciliation, expenses, tax regimes, GST returns, e-invoice/e-way bills, and payment gateway staging/reconciliation.
   - **Core Commands** (`src-tauri/src/commands/`): Auth, profiles, CRM, social, forms, content, jobs, media, analytics, deploy.
4. **State Access**: Command acquires read/write locks on `tauri::State<AppState>` for `active_profile_id`, `central_db`, `user_db`, or `PtySessionManager`.
5. **Turso HTTP Transport**: `TursoConn` executes parameterized SQL via HTTP POST to `{db_url}/v2/pipeline`.
6. **Result Processing**: Rows are serialized into Rust structs, returned as `Result<T, String>` over IPC to the TypeScript frontend, and rendered in Qwik signals.

---

## Key Architectural Decisions

### 1. Hybrid BYODB (Central DB vs UserDB)

- **Central DB**: Shared Turso instance owned by BusinessKit infra storing organizations, profiles, license states, and encrypted UserDB connection tokens. Read at app startup.
- **UserDB**: Dedicated Turso database per profile. Contains complete domain data (Shop, Inventory, Hospitality, Bookkeeping, Tax, CRM, Social, CMS, Agent analytics, chats, commands). Connected dynamically on project switch.

### 2. Autonomous AI Agent & Execution Engine

BusinessKit features a dual in-app engine and an external MCP integration:

- **Hosted API Mode (`chat.rs`)**: Direct streaming LLM engine supporting multiple providers (Anthropic Claude, OpenAI, Google Gemini, DeepSeek, Local Ollama, Groq, OpenRouter, Perplexity). Employs an autonomous multi-turn tool calling loop with context compaction and thinking tokens.
- **Headless CLI Subprocess Runner (`cli.rs`)**: Spawns local CLI binaries (`claude`, `agy`, `codex`) in headless non-interactive mode with MCP toolbelts. Translates streaming NDJSON stdout into uniform Tauri events (`chat-token`, `chat-tool-call`, `chat-done`, `chat-error`) and persists completed turns to `agent_chat_messages`.
- **Interactive Terminal Mode (PTY) (`pty.rs`)**: Desktop-only pseudo-terminal powered by `portable-pty`. Spawns real interactive shells rendered in the frontend via xterm.js with full ANSI support. Automatically pre-trusts workspaces for Antigravity CLI and scaffolds profile-specific `output/` directories.
- **Embedded MCP Stdio Server (`mcp_server.rs`)**: Invoking the desktop binary as `./businesskit --mcp --profile <id>` exposes the BusinessKit toolbelt over stdio JSON-RPC 2.0 to external coding agents.
- **Unified Toolbelt & Strict Security Boundary (`tools/mod.rs`)**:
  - `ToolCtx` carries `&TursoConn` exclusively for the active profile's UserDB. Zero access to Central DB.
  - Covers inventory goods receipt (`inventory_receive_purchase_invoice`), pricing updates (`product_update_pricing`), stock adjustments (`inventory_add_stock`), invoice drafting/issuance (`invoice_create`, `invoice_send`), CRM contacts (`contact_create`, `contact_update`), blog publishing (`blog_post_create`), website pages (`page_create`, `page_publish`, `page_list`), and discovery (`system_get_capabilities`).
  - **Fast-Path Slash Resolver**: Maps explicit commands (e.g. `/receive-stock`, `/inventory`, `/bill`) directly to target tools to eliminate context bloat.
- **Agent Analytics & Cost Accounting (`analytics.rs`)**:
  - Automatically aggregates token counts and costs across model families.
  - Computes rolling 7d, 30d, 12m metrics and breakdown by provider/model/tool.
  - Automatically prunes message history older than 90 days post-aggregation while retaining lifetime usage totals in `agent_analytics`.

### 3. TursoConn Custom HTTP Client

- **Why**: Native `libsql` native-tls client relied on `rustls-native-certs` which fails in sandboxed mobile contexts (iOS/Android app sandbox blocks system CA root store access).
- **Solution**: `TursoConn` (`src-tauri/src/db/turso.rs`) uses `reqwest` compiled with `webpki-roots`. Mozilla root CAs are bundled in the binary. Zero system keychain dependencies for TLS handshake.
- **Resilience**: Features automatic retry with exponential backoff and randomized jitter for HTTP 429, 502, and 503 errors.

### 4. In-Memory RAM Caching & Encrypted Local Fallback

- **Active State**: Decrypted database connections and tokens exist in RAM within `state.user_db` and `state.ready_profiles`. OS Keychain is bypassed to prevent OS popup prompts and keychain deadlocks.
- **Disk Persistence**: Encrypted local `.dat` files (`{app_data_dir}/userdb_{profile_id}.dat`) encrypted with AES-256-GCM using `ENCRYPTION_SECRET:profile_id`. Stored exclusively in sandboxed app data directory.
- **Logout Cleansing**: `sign_out()` clears all in-memory connections and purges on-disk cached `.dat` files.

### 5. Zero-Latency Session Caching & Pre-Cache Authorization Gating

- `verify_profile_access` is evaluated at **Step 0 before checking `ready_profiles`** on project switch and app boot.
- Authorizes direct profile owner (`profile.user_id`), organization owner (`org.owner_user_id`), and active team members (`team_members.status == 'accepted'`).
- `AppState.ready_profiles: HashSet<String>` tracks active verified connections in memory, achieving **0 extra HTTP calls** on re-switch within the same session.

### 6. Provisioning Gate & Multi-Domain Schema

- Controlled by `userdb.last_provisioned_at` in Central DB.
- `NULL` → runs schema provisioning (`run_all()` across `shop.rs`, `shop-ops.rs`, `accounts.rs`, `tax.rs`, `payroll.rs`, `agents.rs`, etc.) and redirects to status page.
- `NOT NULL` → skips provisioning. Frontend caches state in `localStorage["bk-provisioned-{profileId}"]`.

### 7. Platform Security Hardening

- **Compile-Time Secret Enforcement**: `build.rs` validates presence of `ENCRYPTION_SECRET` for release builds with zero hardcoded fallback keys.
- **Content Security Policy (CSP)**: `tauri.conf.json` enforces `"csp": null` to allow dynamic Qwik chunk hydration in WKWebView.
- **Protocol Scope**: `assetProtocol.scope` is restricted to app data paths.
- **Cloudflare Bindings**: Production worker deployments bind sensitive credentials as `secret_text`.

---

## Folder Structure

```
businesskit/
├── .github/              # CI/CD workflows and release pipelines
├── adapters/             # Static SSG adapter configuration for Qwik
├── businesskit-web/      # Reference web implementation (DO NOT MODIFY)
├── docs/                 # Project documentation
├── public/               # Static web assets (favicons, logos)
├── src/                  # Qwik SSG Frontend UI
│   ├── assets/           # Frontend SVGs and images
│   ├── components/       # Reusable Qwik UI components
│   │   ├── agents/       # AgentChat, PtyTabBar, CommandSelector, SlashCommandAutocomplete
│   │   ├── shop/         # Shop modals, slideouts (AddProduct, NewBill, InvoicePrint)
│   │   │   ├── restaurant/ # Table grid, KOT queues, recipe builders
│   │   │   └── stays/    # Room grid, rate calendar, checkin/checkout folios
│   │   ├── common/       # Toast, slideover, modals
│   │   └── app/          # AppSidebar, AppTopbar, ProfileSwitcher
│   ├── lib/              # Frontend IPC, types, context, and design system
│   ├── routes/           # Qwik City SSG route pages
│   │   ├── dashboard/    # Main business dashboard
│   │   │   ├── agents/   # Autonomous AI agent hub, chat interface, PTY terminal view
│   │   │   ├── shop/     # Shop hub, products, restaurant, stays, customers, vendors
│   │   │   ├── accounts/ # Chart of accounts, journal, bank, expenses, reports
│   │   │   ├── tax/      # Tax overview, GST, e-invoice, e-way bills, TDS
│   │   │   └── ...       # CRM, Social, Content, Forms, Jobs, Media
│   │   ├── root.tsx      # Qwik root component
│   │   └── global.css    # Global CSS design tokens
├── src-tauri/            # Tauri v2 Rust Backend
│   ├── Cargo.toml        # Rust dependencies and target flags
│   ├── tauri.conf.json   # Desktop Tauri config & permissions
│   ├── tauri.ios.conf.json # iOS specific bundle config
│   ├── tauri.android.conf.json # Android specific package config
│   ├── src/
│   │   ├── commands/     # Tauri IPC command modules
│   │   │   ├── agents/   # Chat, CLI subprocess, PTY terminal, MCP, tools, analytics
│   │   │   ├── shop/     # E-commerce, POS, restaurant, stays, stock
│   │   │   ├── fin/      # Double-entry ledger, bank recon, tax, GST
│   │   │   └── *.rs      # Auth, profiles, CRM, social, forms, content, jobs
│   │   ├── db/           # Turso HTTP shim, schema modules, and provisioning logic
│   │   ├── deploy/       # Site deploy engines (Cloudflare Worker/Pages deployers)
│   │   ├── license/      # Offline/online license verification
│   │   ├── vault/        # AES-256-GCM encryption/decryption utilities
│   │   ├── lib.rs        # Main Rust app entry point, state setup, command registry
│   │   ├── main.rs       # Binary launcher with MCP stdio mode interceptor
│   │   └── rbac.rs       # Role-based access control helpers
└── vite.config.ts        # Vite SSG build config
```

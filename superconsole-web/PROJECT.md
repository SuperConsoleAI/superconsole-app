# SuperConsole Web - Project Overview

SuperConsole Web is the cloud portal for SuperConsole: a TanStack Start (React 19) app deployed to Cloudflare Workers. It is the browser surface for the same Turso (libSQL) database the desktop app syncs to, letting operators manage organizations, projects, team members, LLM keys, and connectors from anywhere. The desktop app remains the source of truth for terminals and local execution; this portal only reads/writes shared cloud state.

## 1. Architecture & Data Flow
- **Rendering**: TanStack Start with file-based routing (`src/routes/`). Pages run server loaders + server functions (`createServerFn`) on the Worker, then hydrate React on the client. Terminals/PTYs do not exist here.
- **Auth**: WorkOS AuthKit. `/login` redirects to the hosted auth UI; `/callback` exchanges the code and seals an httpOnly session cookie (`wos-session`); `getSessionUser()` validates it on every server call. All loaders/server fns reject to `/login` when unauthenticated.
- **Data Persistence**: The same Turso DB as the desktop, reached over HTTP via `@libsql/client/web` + Drizzle ORM (`src/server/turso.ts`, `src/db/schema.ts`). On first sign-in `ensureUser()` upserts the WorkOS user, accepts pending email-matched invitations, and creates a "Personal" org if none exists.
- **Secrets**: LLM keys and connector credentials are AES-256-GCM encrypted (`src/server/crypto.ts`) using the exact same HKDF derivation as the desktop `crypto.rs`, so values set on either surface decrypt on both.

## 2. Tech Stack Highlights
- **Framework**: `@tanstack/react-start` + `@tanstack/react-router` (file routes), React 19, Vite 8.
- **Runtime**: Cloudflare Workers via `@cloudflare/vite-plugin`; `main = "@tanstack/react-start/server-entry"`.
- **Data**: Turso/libSQL (HTTP client `@libsql/client/web`), Drizzle ORM + drizzle-kit migrations.
- **Auth**: `@workos-inc/node` (AuthKit, sealed sessions).
- **Tooling**: wrangler 4 (deploy + secrets + types), tsx (connection check script), ulid.

## 3. Cloudflare Workers Compatibility (hard constraints)
This runs on the Workers runtime, **not** Node.js. Keep all code compliant:

| Rule | Detail |
|---|---|
| No Node built-ins | `fs`, `path`, `net`, `http`, `child_process` are unavailable |
| Use Web APIs | `fetch`, `Request`, `Response`, `URL`, `crypto.subtle`, `btoa`/`atob` |
| ESM only | No `require()` — ES module imports exclusively |
| No native binaries | `sharp`, `bcrypt`, etc. will not load |
| `nodejs_compat` is a polyfill | Provides `process.env`/`Buffer` shims, NOT a real Node runtime |

Rule of thumb: a package that uses `fetch` internally works; one that uses TCP sockets or file I/O breaks. This is why Turso uses `@libsql/client/web` (HTTP) and crypto uses `crypto.subtle` rather than Node `crypto`.

## 4. Core Codebase Structure
- **Routes (`src/routes/`)**:
  - `__root.tsx`: root shell + document.
  - `index.tsx`: dashboard (org switcher, projects, connectors summary, nav links).
  - `login.tsx` / `callback.tsx` / `logout.tsx`: WorkOS auth flow.
  - `models.tsx`: LLM keys (account/org/project scopes).
  - `team.tsx` / `project-team.tsx`: org and project membership + invitations.
  - `connectors.tsx` / `project-connectors.tsx`: org and project connectors.
- **Server functions (`src/server/`)**:
  - `auth.ts`: WorkOS session (sign-in URL, callback, `getSessionUser`, clear).
  - `turso.ts`: Drizzle client over the HTTP libSQL client.
  - `crypto.ts`: AES-256-GCM encrypt/decrypt (mirrors desktop).
  - `data.ts`: `ensureUser`, invitation reconciliation, `loadDashboard`.
  - `llm.ts`, `team.ts`, `connectors.ts`: CRUD + authorization for each domain.
- **Shared**: `connector-registry.ts` (mirrors desktop + `src/lib/api.ts`), `ConnectorManager.tsx` (shared UI + server fns), `db/schema.ts` (Drizzle schema), `router.tsx`, `styles.css`.

## 5. Development Workflow & Gotchas
- **Scripts**: `npm run dev` (Vite :3000), `npm run build`, `npm run deploy` (build + `wrangler deploy`), `npm run cf-typegen`, `npm run db:generate|migrate|push|studio`, `npm run db:check`.
- **Secrets**: local values in `.dev.vars` (see `.dev.vars.example`); production via `wrangler secret put <NAME>`. Required: `WORKOS_API_KEY`, `WORKOS_CLIENT_ID`, `WORKOS_COOKIE_PASSWORD`, `WORKOS_REDIRECT_URI`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`.
- **Gotchas**:
  - `WORKOS_COOKIE_PASSWORD` must be byte-identical to the desktop's, or encrypted LLM keys/connectors will not decrypt across surfaces.
  - Always reach env via `import { env } from "cloudflare:workers"` inside server code, never `process.env` at module top level.
  - Server functions/loaders must guard with `getSessionUser()` and authorize org/project membership before any read/write.
  - Connector/LLM registries are mirrored in three places (this repo `connector-registry.ts`, desktop `connectors.rs`, desktop `src/lib/api.ts`) — keep service ids, field keys, and scopes identical.
  - The web lists every Turso row, so duplicate cloud rows surface here even when the desktop hides them; project creation is now serialized + idempotent on the desktop side.

___

## Documentation Files
This sub-project is documented by `CLAUDE.md` (engineering quick-reference). Broader desktop architecture lives in the repo root (`/PROJECT.md`, `/ARCHITECTURE.md`, `/CONTEXT.md`, `/CODEBASE.md`, `/DESIGN_PRINCIPLES.md`, `/TECH_STACK.md`).

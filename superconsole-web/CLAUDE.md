# CLAUDE.md - SuperConsole Web

Engineering quick-reference for the Cloudflare Workers cloud portal. See `PROJECT.md` for the full overview.

## Mental model
- TanStack Start app on **Cloudflare Workers** (not Node). File routes in `src/routes/`, server work in `src/server/` via `createServerFn` + loaders.
- Shares the **same Turso DB and encryption** as the desktop app. This portal is for cloud state only (orgs, projects, team, LLM keys, connectors). No terminals, no PTYs, no local FS.

## Workers rules (do not break)
- No Node built-ins (`fs`, `path`, `net`, `http`, `child_process`); no native binaries (`sharp`, `bcrypt`).
- Web APIs only: `fetch`, `crypto.subtle`, `URL`, `btoa`/`atob`. ESM imports only.
- `nodejs_compat` is just a `process`/`Buffer` polyfill, not real Node.
- Read env with `import { env } from "cloudflare:workers"` inside server code, never `process.env`.

## Auth + data flow
- `/login` -> WorkOS AuthKit -> `/callback` seals an httpOnly cookie (`wos-session`).
- Every loader/server fn: `const user = await getSessionUser(); if (!user) throw redirect({ to: "/login" });` then authorize org/project membership before any query.
- `ensureUser()` upserts the WorkOS user, accepts email-matched pending invitations, and guarantees one org.

## Encryption (must match desktop)
- AES-256-GCM, key = HKDF-SHA256(`WORKOS_COOKIE_PASSWORD`), salt `superconsole-llm-keys-v1`, info `aes-256-gcm`, format `base64(nonce[12] || ciphertext||tag)`.
- Connector credentials are an encrypted JSON blob in `credentials_encrypted`. `WORKOS_COOKIE_PASSWORD` must be identical to the desktop's.

## Keep in sync (3 places)
Connector + LLM registries: this repo `src/connector-registry.ts`, desktop `src-tauri/src/connectors.rs`, desktop `src/lib/api.ts`. Identical service ids, field keys, scopes, env mappings.

## Commands
- `npm run dev` (Vite :3000) · `npm run build` · `npm run deploy` (build + `wrangler deploy`)
- `npm run db:generate|migrate|push|studio` · `npm run db:check` · `npm run cf-typegen`
- Secrets: `.dev.vars` locally; `wrangler secret put <NAME>` in prod.

## Routes
`index` (dashboard) · `login`/`callback`/`logout` · `models` (LLM keys) · `team`/`project-team` · `connectors`/`project-connectors`.

## Gotchas
- Migrations live in `drizzle/`; append, never edit applied ones. Update the journal alongside new SQL.
- The portal lists all Turso rows, so cloud duplicates show here even if the desktop hides them.
- Project membership is required for project-scoped reads/writes; org membership for org-scoped.

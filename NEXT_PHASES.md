# SuperConsole — Next Phases
## Post V1 Roadmap

---

## Current State (Phases 1-6 Complete)
- Tauri 2 + React 19 + TanStack Router + Tailwind v4 + shadcn
- Workspaces under organizations, multi-CLI tabs (Claude/Droid/Antigravity + shell)
- PTY sessions, file manager, slash commands
- Scheduler + Inbox with approve/reject, session history
- Telegram bot + local HTTP triggers
- Settings page, app icon, updater scaffold
- Shippable: SuperConsole_0.1.0_aarch64.dmg

---

## Phase 7 — Auth + Cloud Infrastructure
**Goal: Real accounts, Turso DB, web portal shell, WorkOS identity**
**Everything team/connector/multi-device depends on this phase.**

---

### 7a — Turso DB (Cloud Source of Truth)

Two databases from now on:

```
Turso (cloud)                        Local SQLite (desktop)
─────────────────────────────        ──────────────────────────────
users                                PTY session history
orgs + org members                   conversation history
projects per org                     scheduler jobs + logs
team roles + permissions             inbox items
connector credentials (encrypted)    workspace file cache
connector status per project         connector config cache ← synced from Turso
org-level settings
project-level LLM API keys
```

**Sync rule:** App opens → pull connector + project config from Turso → cache in local SQLite. Connectors updated via web → desktop picks up on next sync (or webhook push). Everything agents DO stays local forever. Only config/identity goes to cloud.

**Why Turso:**
- Already used in businesskit-agent — team knows it
- libSQL = SQLite compatible — same queries as local SQLite
- Edge replicas — low latency globally
- Free tier generous for early stage
- Rust SDK available (Tauri backend can query directly)

**Schema (Turso):**
```sql
users          (id, workos_id, email, name, created_at)
organizations  (id, name, plan, owner_id, created_at)
org_members    (org_id, user_id, role)
projects       (id, org_id, name, local_path_hint, created_at)
project_members (project_id, user_id, role)
connectors     (id, project_id, service, credentials_encrypted,
                scope, status, connected_by, updated_at)
                -- scope = 'project' | 'org'
org_connectors (id, org_id, service, credentials_encrypted,
                status, connected_by, updated_at)
project_llm_keys (project_id, provider, api_key_encrypted,
                  base_url, extra_env)
```

---

### 7b — WorkOS Auth (Desktop + Web)

- Sign up / sign in via WorkOS (email, Google SSO, GitHub OAuth)
- Organization creation on first login
- Invite team members via email → they join org in Turso
- Role-based: Owner, Admin, Member per org and per project
- Session tokens stored in Tauri keychain (desktop)
- Session tokens in httpOnly cookie (web portal)
- Auth gate on app launch — no anonymous use

**What changes in desktop app:**
- Welcome screen → Sign In (opens WorkOS hosted page)
- Organization switcher in sidebar
- Settings → Team (invite, manage, remove)
- All workspace/project configs tied to org_id in Turso

---

### 7c — Web Portal (app.superconsole.dev)

**Stack:**
```
TanStack Start (same router as desktop — shared knowledge)
  → deployed on Cloudflare Pages
    → Cloudflare Workers for API/OAuth callbacks
      → Rust Workers (beta) for simple CRUD + connector OAuth
      → fallback: TypeScript Workers if Rust beta causes issues
        → Turso DB
          → WorkOS for session validation
```

**Web portal does ONE thing: account + connector management.**
No agent running. No PTY. No scheduler. Just identity + connectors.

**Pages:**
```
app.superconsole.dev/
  /login                  ← WorkOS auth
  /orgs                   ← org switcher
  /orgs/[id]/
    /projects             ← list projects, create project
    /projects/[id]/
      /connectors         ← PROJECT-LEVEL connectors ← the differentiator
      /team               ← project members
      /llm                ← project LLM API keys
    /connectors           ← ORG-LEVEL connectors
    /team                 ← org members + invites
    /settings             ← org settings, billing
```

**Why web portal for connectors (not desktop only):**
- Client needs to connect THEIR Gmail — they can't install your desktop app
- Team member on different machine needs to add their credentials
- OAuth flows (Gmail, Shopify, Notion) need a redirect URL — web handles this cleanly
- Desktop app syncs result — client never touches your machine

**OAuth flow:**
```
Client opens app.superconsole.dev/orgs/[id]/projects/[id]/connectors
  → clicks "Connect Gmail"
    → OAuth to Google
      → callback to Cloudflare Worker
        → encrypts + stores in Turso
          → desktop app syncs on next open (or live via webhook)
```

---

### 7d — Models page (LLM per project)

In desktop Settings → Projects → [project] → Models:

```
Login (OAuth)     = machine-level only = account-level
                    One Claude login per laptop. Can't scope to project.

API Key           = project-level ✅
                    Client provides their Anthropic/OpenAI/Gemini key
                    Stored encrypted in Turso
                    Injected as env var into PTY session at start
                    Client pays for their own agent runs
```

**Per project LLM config:**
- Provider: Anthropic / OpenAI / Gemini / OpenRouter / Local
- API key (encrypted in Turso, synced to local)
- Base URL override (for AWS Bedrock, Azure, etc.)
- Additional env vars (CLAUDE_CODE_USE_BEDROCK=1 etc.)
- Model override (claude-sonnet-4-6, gpt-4o, etc.)

**This is the agency billing model:**
Agency operator sets up project → pastes client's API key → client pays Anthropic directly → operator just runs the agents. Clean separation.

---

### Superset comparison on this phase

Superset integrations = org-level only, managed at app.superset.sh
SuperConsole = **project-level + org-level**, managed at app.superconsole.dev
AND web portal is optional — power users can set API keys in desktop directly.

Superset requires web portal for integrations.
SuperConsole web portal just makes it easier — desktop works standalone too.

---

## Phase 8 — Git Integration (Optional, not required)
**Goal: Support git repos without forcing git on everyone**

### What Superset does (their core, not ours)
- Every workspace = git worktree (mandatory)
- Branch per agent session
- PR creation, diff viewer, merge workflow

### What SuperConsole does differently
- Git is OPTIONAL — any folder works (businesskit-agent, fresh folders, non-git projects)
- If folder has git: show branch info, basic diff, commit history in sidebar
- If folder has no git: works exactly the same, no error, no warning
- No worktree creation — sessions are isolated by .env and workspace config, not git branches

### Git features (when repo has git)
- Show current branch in workspace header
- Basic diff viewer for agent-generated changes
- One-click commit + push (for users who want it)
- GitHub integration: link workspace to repo, show open PRs

### What we DON'T build
- Mandatory git — never
- Parallel worktree creation — not our model
- PR review workflow — out of scope for V1

---

## Phase 9 — Multi-Device + Remote Access
**Goal: Access your workspaces from any device, work with your team**

### The problem
- SuperConsole runs locally on your Mac
- Your team member on another Mac can't access your workspaces
- You can't check on running jobs from another device

### Architecture: Local relay server
```
Your Mac (SuperConsole running)
  → local server on port 3333
    → Cloudflare Tunnel (persistent, free)
      → superconsole.yourdomain.com
        → Team member's SuperConsole app
        → Your phone browser
        → Another Mac running SuperConsole
```

### What this enables
- **Remote Workspaces**: connect to another machine's SuperConsole
  (same as Superset's Remote Workspaces Pro feature)
- **Team shared workspaces**: multiple users, one workspace
- **Cross-device session**: start on Mac, monitor on phone browser
- **Handoff**: team member takes over your session

### Implementation
- Tauri backend spawns Cloudflare tunnel on startup (optional)
- WorkOS identity used to authenticate remote connections
- Workspace owner controls who can connect
- Read-only mode for non-owners by default

---

## Phase 10 — Native Chat UI (Multi-Provider)
**Goal: Chat directly in SuperConsole without opening a CLI**

### What Superset shipped (March 2026 GA)
- Native chat UI with streaming responses
- Multi-provider model picker (Claude, GPT, Gemini, etc.)
- MCP server support
- Built-in web search
- Slash commands as inline chips
- Tool approval flow in GUI

### What SuperConsole builds
- Same — but with OpenRouter as the default provider
- User brings their own API key OR uses OpenRouter (one key, all models)
- Chat is per-workspace — context (CLAUDE.md, brand-voice, HEARTBEAT) auto-injected
- Slash commands route to businesskit-agent OR any repo's .claude/commands/
- MCP server support from day one
- Works WITHOUT a CLI installed — pure API mode
- Works WITH a CLI — hybrid mode (chat for quick tasks, PTY for complex ones)

### Model picker
- OpenRouter (default — 200+ models, one key)
- Direct Anthropic API key
- Direct Google API key
- Direct OpenAI API key
- Local (Ollama)
- AWS Bedrock / Google Vertex (enterprise)

---

## Phase 11 — Automations (Pre-built Agent Workflows)
**Goal: One-click agent workflows, not just manual slash commands**

### What this is
Pre-built automation templates that users activate per workspace.
Not just cron jobs — full agent workflows with conditions, triggers, outputs.

### Examples for business operators
- **Daily CEO Brief**: runs /ceo every morning, sends Telegram summary
- **Weekly Newsletter**: drafts every Friday, sends to inbox for approval
- **Social Queue**: generates 5 posts daily, queues for approval
- **Competitor Scan**: weekly /competitor-scan, updates HEARTBEAT.md
- **Store Sync**: daily product/pricing update from data sources

### Examples for developers (same app, different repo)
- **PR Review**: runs on every git push, reviews changes
- **Test Runner**: runs tests on schedule, reports failures
- **Dependency Check**: weekly security audit
- **Deploy Preview**: builds on branch push

### Implementation
- Automation templates stored as YAML/JSON in SuperConsole
- User activates template → fills in schedule + parameters
- Runs via existing scheduler → results to existing inbox
- Community template marketplace (later)

---

## Phase 12 — SuperConsole CLI
**Goal: Headless SuperConsole for CI, servers, power users**

### What Superset's CLI does
Single static binary — manage workspaces, tasks, automations from terminal.
Same backend as desktop app. Works in CI pipelines.

### What SuperConsole CLI does
```bash
superconsole workspace list
superconsole workspace create --name "acme" --path ~/clients/acme
superconsole run --workspace acme --command "/ceo"
superconsole schedule list --workspace acme
superconsole schedule add --workspace acme --cron "0 9 * * 1" --command "/ceo"
superconsole inbox --workspace acme --last 10
```

### Why this matters
- Agency operators run 20+ clients — CLI is faster than clicking
- CI pipelines can trigger agent runs
- VPS deployment — no GUI needed
- Scripts can manage workspaces programmatically

### Implementation
- Rust binary (already have Rust backend)
- Same SQLite DB as desktop app
- Auth via WorkOS token stored in ~/.superconsole/config.json
- Available on Homebrew + direct download

---

## Phase 13 — Team Collaboration
**Goal: Multiple users, shared workspaces, activity feed**

### Features (matching Superset Pro)
- Invite team members to organization
- Shared workspaces — multiple users see same workspace
- Real-time activity feed: "Alex started /newsletter", "Jordan approved post"
- Presence indicators — who's online, which workspace they're in
- Workspace-level permissions: who can run agents, who can only view

### Agency-specific additions
- Client workspaces: share read-only view with the client
- Client approval: client gets email/Telegram link to approve posts
- Audit log: full history of what agents ran, what was approved

---

## Phase 14 — Slack + Communication Integrations
**Goal: Trigger agents and receive results without opening the app**

### Slack (matching Superset Pro)
- Connect SuperConsole to Slack workspace
- Type `/agent run /ceo` in Slack → runs in right workspace
- Job completes → posts result to configured channel
- Approve/reject posts directly from Slack

### Telegram (already built in Phase 5 — extend it)
- Extend existing Telegram bot with richer commands
- Inline keyboards for approve/reject
- Photo/file attachments for generated content
- Multiple bot instances (one per client workspace)

### WhatsApp (later)
- Twilio WhatsApp API
- Same trigger/report pattern as Telegram

### Email
- Inbound email → triggers agent (via Postmark/Resend inbound webhook)
- Agent results → sends formatted email report

---

## Phase 15 — Mobile App (Native)
**Goal: Real native mobile app, not browser UI**

### What Superset's mobile is
Browser-based UI accessed via their relay server.
Not a native app — just a responsive web page.

### What SuperConsole mobile is
**Real native app** — Tauri 2 supports iOS and Android from the same codebase.

### Features
- View all workspaces and their status
- See inbox — read CEO briefings, approve/reject posts
- Trigger agent runs manually
- View scheduler — upcoming jobs
- Receive push notifications when jobs complete
- Basic chat (OpenRouter API) for quick agent questions

### What mobile does NOT do
- Run PTY sessions (CLIs can't run on mobile)
- Run the scheduler (Mac does that)
- Replace the desktop app

Mobile = **monitor + approve + trigger**. Desktop = **run + build + schedule**.

### Implementation
- Tauri 2 iOS/Android target (same Rust backend, different frontend shell)
- Connects to Mac's relay server (Phase 9) for live data
- WorkOS auth (same token as desktop)
- Push notifications via APNs (iOS) + FCM (Android)

---

## Phase 16 — MCP Server
**Goal: SuperConsole as an MCP server other tools can connect to**

### What Superset does
Ships a built-in MCP server — Claude Code can connect to Superset
and use it as a tool (create workspaces, run agents, check status).

### What SuperConsole does
Same — `superconsole-mcp` server that exposes:
- `list_workspaces` tool
- `run_agent` tool  
- `check_inbox` tool
- `get_heartbeat` tool (reads HEARTBEAT.md from workspace)
- `approve_item` tool

This means Claude Code, Cursor, any MCP-compatible tool can
orchestrate SuperConsole programmatically.

---

## Pricing Model (Matching + Beating Superset)

### Free
- 1 user
- 3 workspaces
- Local only
- All CLIs (Claude, Droid, Antigravity, Gemini, etc.)
- Basic scheduler (5 jobs)
- Telegram notifications

### Pro ($15/month)
- 1 user
- Unlimited workspaces
- Remote access (Cloudflare tunnel)
- Unlimited scheduler jobs
- Automations (pre-built templates)
- Native chat (OpenRouter)
- Mobile app
- GitHub integration
- Priority support

### Team ($30/user/month)
- Everything in Pro
- Team collaboration
- Shared workspaces
- Activity feed
- Slack integration
- Client sharing (read-only workspace links)
- Audit logs

### Enterprise (custom)
- SSO/SAML via WorkOS
- Custom MCP integrations
- SLA + dedicated support
- On-prem option

---

## Build Order (Priority)

1. **Phase 7** — WorkOS auth (need this before anything team-related)
2. **Phase 10** — Native chat UI (biggest UX upgrade, users want this)
3. **Phase 9** — Remote access (needed for team + mobile)
4. **Phase 11** — Automations (differentiator from Superset)
5. **Phase 8** — Git integration (optional but users will ask)
6. **Phase 12** — CLI (power users + CI)
7. **Phase 13** — Team collaboration
8. **Phase 14** — Slack integration
9. **Phase 15** — Mobile app
10. **Phase 16** — MCP server

---

## Key Differentiators vs Superset (Never Lose These)

1. **No git required** — any folder is a workspace
2. **Business operators** — not just developers
3. **Telegram first** — lighter than Slack for solo operators
4. **Tauri not Electron** — 30MB not 2GB
5. **Automations with pre-built business workflows** — Superset has generic automations, we have /ceo /newsletter /social pre-built
6. **Real native mobile** — Superset has browser UI, we ship iOS/Android app
7. **Local first, no relay required** — Telegram covers 90% of remote needs without a relay server

---

## Phase 17 — Connectors (Project-level + Org-level)
**Goal: Agents call external tools scoped to the right project or org**
**Differentiator: Nobody else has this. Claude.ai, Superset, Cursor — all account-level only.**

---

### The core problem this solves

Running 5 blogs or 20 clients under one account today means:
- One Gmail connected = all projects share it (wrong)
- One Shopify connected = all projects hit same store (dangerous)
- Create separate accounts per client = nightmare to manage
- Use .env files = only developers understand this

SuperConsole solves this with **two connector scopes**:
project-level for client-specific tools,
org-level for operator-wide tools.

---

### The hierarchy

```
Account (WorkOS)
  └── Organization: Acme Agency          ← ORG-LEVEL connectors
        │   Your Telegram bot
        │   Your billing Stripe
        │   Your agency Notion
        │
        ├── Project: acme-dental          ← PROJECT-LEVEL connectors
        │     Dental clinic's Gmail
        │     Dental clinic's Shopify
        │     Dental clinic's Beehiiv
        │     Dental clinic's Turso DB
        │
        ├── Project: acme-restaurant      ← PROJECT-LEVEL connectors
        │     Restaurant's Gmail
        │     Restaurant's Instagram API
        │     Restaurant's booking system
        │
        └── Project: acme-gym             ← PROJECT-LEVEL connectors
              Gym's Gmail
              Gym's Shopify
              Gym's newsletter

  └── Organization: Personal              ← ORG-LEVEL connectors
        Your GitHub
        Your Vercel
        │
        └── Project: my-saas-app          ← PROJECT-LEVEL connectors
              Project's Supabase
              Project's Stripe (test mode)
```

---

### Project-level connectors (client's tools)

Scoped entirely to one project. Agent in Project A can NEVER
access a connector from Project B. Hard isolation.

- Client's Gmail / Google Workspace
- Client's Shopify store
- Client's Beehiiv / ConvertKit newsletter
- Client's social accounts (Instagram, X, LinkedIn APIs)
- Client's Turso / Supabase database
- Client's Stripe account
- Client's analytics (GA4, Plausible)
- Client's booking / CRM system

When /newsletter runs in acme-dental → uses dental clinic's Beehiiv.
When /newsletter runs in acme-restaurant → uses restaurant's Beehiiv.
Zero configuration per run. Set once, always correct.

---

### Org-level connectors (operator's tools)

Shared across all projects in the organization.
These are YOUR tools as the operator, not your client's.

- Your Telegram bot (receive all job notifications)
- Your Slack workspace (all alerts come here)
- Your agency Notion (internal docs, client notes)
- Your billing Stripe (you charge clients)
- Your GitHub (your code, not client's)
- Your internal analytics dashboard

---

### How connectors work technically

```
Agent session runs /newsletter in [acme-dental]
  → needs to post to Beehiiv
    → SuperConsole looks up project-level connectors for [acme-dental]
      → finds Beehiiv connector with acme-dental credentials
        → MCP server calls Beehiiv API with correct account
          → post created in acme-dental's newsletter
            → result returned to agent
              → notification via org-level Telegram connector
```

No manual credential switching. No risk of posting to wrong account.
The scoping is automatic based on which project the agent is running in.

---

### UI: How users set this up

**Project Settings → Connectors tab:**
```
[+ Add Connector]

Connected:
✓ Gmail          sarah@acmedental.com      [Edit] [Remove]
✓ Shopify        acmedental.myshopify.com  [Edit] [Remove]
✓ Beehiiv        Acme Dental Newsletter    [Edit] [Remove]

Available to add:
  Notion  Airtable  Linear  Instagram  X/Twitter  Turso  Supabase
  Stripe  ConvertKit  Buffer  GA4  Plausible  WhatsApp  ...
```

**Organization Settings → Connectors tab:**
```
[+ Add Org Connector]

Connected:
✓ Telegram       @AcmeAgencyBot            [Edit] [Remove]
✓ Slack          #agent-notifications      [Edit] [Remove]
✓ Notion         Agency workspace          [Edit] [Remove]
```

One-click OAuth for services that support it (Gmail, Notion, GitHub, Shopify).
API key input for services that don't (Beehiiv, Turso, Plausible).

---

### Connector categories

**Business (build first — SuperConsole's core market)**
- BusinessKit.io API
- Shopify / WooCommerce
- Beehiiv / ConvertKit / Mailchimp
- Buffer / social scheduling
- Stripe
- GA4 / Plausible / Fathom

**Productivity**
- Gmail / Google Drive / Calendar
- Notion / Airtable
- Linear / Jira / Trello
- Slack / Discord

**Developer**
- GitHub / GitLab
- Vercel / Netlify / Cloudflare
- Turso / Supabase / Postgres / PlanetScale
- Resend / Postmark / SendGrid

**Communication**
- Telegram
- Twilio (SMS + WhatsApp)
- Intercom / Crisp

---

### Why Claude.ai will never have this

Claude.ai connectors are account-level by design.
They're built for individual users chatting with one AI.

SuperConsole is built for operators managing multiple clients.
Project-level isolation is not a feature — it's the entire architecture.

Adding project-level connectors to Claude.ai would require
rebuilding their entire connector system. They won't do it.

This is your moat. Protect it.

---

### Build order for connectors

1. Project-level connector framework (the isolation system itself)
2. Org-level connector framework
3. BusinessKit.io connector (your own repo — built-in advantage)
4. Turso connector (businesskit-agent uses it)
5. Gmail + Google Drive (most requested)
6. Shopify (business operators need this)
7. Beehiiv + ConvertKit (newsletter workflow)
8. Telegram at org-level (already built — wrap as connector)
9. Notion (knowledge management)
10. Open SDK for community connectors

---

## Infrastructure Summary

### Three separate things to build + deploy

```
1. superconsole.dev          ← marketing site
   Stack: plain HTML or Astro on Cloudflare Pages
   Build: last, after product is real
   Content: landing, pricing, download, docs

2. app.superconsole.dev      ← web portal (inside main repo)
   Stack: TanStack Start (TypeScript only — no Rust)
   Deploy: Cloudflare Workers (not Pages)
   Build: Phase 7c — needed for connectors + team
   Content: org/project/connector/team management only

3. Desktop app               ← Tauri (already built)
   Distribution: download from superconsole.dev
   Updates: tauri-plugin-updater → GitHub releases
   Connects to: app.superconsole.dev for auth + connector sync
```

### Monorepo structure (one repo, two apps)

```
superconsole/                    ← root repo (existing)
  src-tauri/                     ← Rust backend (existing)
  src/                           ← Desktop React frontend (existing)
  superconsole-web/              ← Web portal (new subfolder)
    src/
      routes/
        index.tsx                ← login
        orgs/
          $orgId/
            projects/
            connectors/          ← org-level connectors
            team/
            projects/
              $projectId/
                connectors/      ← project-level connectors ← differentiator
                team/
                llm/             ← project API keys
    package.json
    app.config.ts                ← TanStack Start + Cloudflare preset
    wrangler.toml                ← Workers config (not Pages)
```

### Web portal deploy commands

```bash
cd superconsole-web
npm install
npm run build
npm run deploy        ← wrangler deploy → Cloudflare Workers
```

### Web portal stack — final, no changes

```
TanStack Start       ← routing + SSR (native Cloudflare Workers support)
TypeScript only      ← no Rust in web portal
Turso @libsql/client ← DB queries
WorkOS SDK (TS)      ← auth + org management
Cloudflare Workers   ← runtime (not Pages — more flexible, better for dynamic routes)
```

No Rust Workers. No separate API layer. TanStack Start handles routing + server functions directly in Workers. That's the whole stack.

### Same Turso DB across all surfaces

```
marketing site   → reads nothing from Turso (static)
web portal       → reads/writes everything (auth, connectors, team)
desktop app      → reads org/project/connector config on sync
                 → all agent data stays in local SQLite forever
```

### Domain structure

```
superconsole.dev             ← Cloudflare Pages (marketing, static)
app.superconsole.dev         ← Cloudflare Workers (web portal)
dl.superconsole.dev          ← redirects to GitHub releases (download)
```

### Build order for Phase 7

1. Turso DB schema + migrations (7a) — 2 days
2. WorkOS setup + desktop auth flow (7b) — 3 days
3. Web portal shell: TanStack Start + Workers setup (7c skeleton) — 2 days
4. Connector OAuth flows on web (7c full) — 1 week
5. Desktop sync from Turso on open (7c sync) — 2 days
6. Project-level LLM API keys in desktop + web (7d) — 2 days

Total Phase 7: ~3 weeks

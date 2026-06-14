# SuperConsole — Plan
## Agentic Workspace Desktop App

---

## What We're Building

A lightweight, fast, native desktop app (Mac + Windows) that lets you
bring any repo or folder as an isolated workspace, run any agentic CLI
inside it (Claude Code, Antigravity, Factory Droid, etc.), schedule
recurring tasks, and manage multiple clients or projects from one place.

Think: Claude Code Desktop — but model-agnostic, repo-agnostic, with
a built-in scheduler, and small enough to not embarrass you.

---

## Why It Exists

Running an agentic repo (like businesskit-agent) in a terminal or VS Code
works fine for one project. It breaks down when you have:

- 10+ clients each needing isolated sessions and credentials
- Scheduled jobs that should run automatically (daily CEO brief,
  weekly newsletter, social posts, competitor scans)
- Multiple CLI tools you want to switch between per project
- No desire to live inside an IDE just to run business automation

Nothing solves this today. Factory, Superset, and Ara are all built for
developers running coding agents. None have a scheduler. None support
arbitrary repos as workspaces for business operations. None are
model-agnostic at the workspace level.

The tool we needed didn't exist, so we're building it.

---

## What It Is Not

- Not an AI model or LLM backend
- Not a cloud platform
- Not an IDE or code editor
- Not limited to businesskit-agent or any single repo
- Not Electron (too heavy — Superset is 2GB, we ship under 30MB)

---

## Core Concept: Workspace = Any Repo or Folder

Every workspace is just a folder on disk. It can be:

- A cloned agentic repo (businesskit-agent, any other)
- A fresh folder you start from scratch
- A client business folder
- A Next.js app you're building
- Any project where you want an AI agent working

The app doesn't care what's inside. It runs your chosen CLI against it.

```
~/superconsole-workspaces/
  acme-dental/          ← businesskit-agent for client A
  my-saas-app/          ← Next.js webapp being built by Claude Code
  xyz-restaurant/       ← businesskit-agent for client B
  personal-research/    ← any other agentic repo
```

Each workspace is fully isolated:
- Own CLI choice (Claude Code / Antigravity / Droid / custom)
- Own environment variables and credentials (.env, secrets)
- Own context files (CLAUDE.md, brand-voice.md, README, etc.)
- Own scheduled jobs
- Own session history and agent memory

---

## The Four Pillars

### 1. Workspace Manager
Sidebar listing all workspaces. One click to switch. Each workspace
remembers its CLI, context files, credentials, and jobs. Adding a
workspace = point to a folder. That's it.

### 2. Agent Session (PTY)
The app spawns a real persistent terminal session (PTY) for each
workspace using the chosen CLI. This is not a browser terminal —
it's a real process, exactly like running `claude` or `droid` in
your terminal, but the UI wraps it beautifully.

Sessions stay alive. When you switch workspaces, the previous session
sleeps. Come back and it's where you left it — context intact.

Slash commands (/ceo, /social, /build, /test, or anything the CLI
supports) work exactly as they do in the terminal. The app adds
autocomplete for known commands in the current repo.

### 3. Scheduler
The missing feature in every competitor.

Set recurring jobs per workspace:
- /ceo every Monday at 9am
- /social daily at 11am
- /newsletter every Friday at 3pm
- /build on git push (trigger-based)

On Mac: fires using Tauri's cron + system wake events (laptop opens
→ queued jobs run). On Windows: same via Windows task scheduler API.

Results land in an Inbox — a feed of what ran, what was produced,
what needs your approval before publishing or committing.

### 4. Inbox / Output Feed
Every agent run produces output. The inbox shows:
- CEO briefing generated → read it
- 5 social posts drafted → approve or reject each
- Blog post written → review before publish
- Build completed → see diff

This is the human-in-the-loop layer. Agents work autonomously, you
review what matters.

---

## CLI Harness — How It Works

The app wraps CLIs using PTY (portable-pty in Rust). This is the
same approach VS Code uses for its integrated terminal.

Phase 1 — Three CLIs supported out of the box:
1. Claude Code (`claude`) — uses your Anthropic subscription
2. Antigravity (`antigravity`) — uses your Antigravity account
3. Factory Droid (`droid`) — uses your Factory account

Phase 2 — Add more:
4. Gemini CLI
5. Grok CLI
6. Custom / any CLI the user configures

Each CLI is a "preset" — the app knows how to start it, pass context,
and stream output. Users can also define custom presets for any CLI
tool they want to wrap.

Context injection: on workspace open, the app finds CLAUDE.md,
README.md, .env, and any context files in the folder root and ensures
the CLI session starts with them loaded — same as how businesskit-agent
uses HEARTBEAT.md and brand-voice.md today.

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| Desktop shell | Tauri 2 (Rust) | 15-30MB app, Mac + Windows, fast |
| Frontend UI | React + Tailwind | Familiar, fast to build |
| PTY / CLI spawning | portable-pty (Rust crate) | Real terminal sessions, not emulated |
| Scheduler | tokio-cron-scheduler (Rust) | Reliable, runs in background |
| Local database | SQLite via rusqlite | Workspace configs, job history, inbox |
| File system | Tauri fs plugin | Read/write workspace folders natively |
| Wake detection | Tauri power-monitor plugin | Mac/Windows sleep/wake events |
| Auto-update | tauri-plugin-updater | Ship updates silently |

Frontend is React so Claude Code can help build it fast. Rust backend
handles everything system-level — PTY, cron, file system, DB.

App size target: under 30MB installed. (Ara is 186MB, Superset is 2GB.)

---

## What Users Can Build With It

Because the app wraps CLIs that can do anything:

- Business automation (businesskit-agent: blog, social, newsletter, store)
- Web apps and SaaS products (Claude Code building Next.js, React, etc.)
- Data pipelines and scripts (any agentic repo)
- Content workflows, research agents, anything else

The app is the shell. The CLI + repo determines what gets built.

---

## File Manager

Every workspace has a built-in file browser and editor. Users can:
- Browse all files in the workspace folder
- Open and edit any text file inline (markdown, .env, JSON, code)
- Create new files and folders
- See agent-generated files appear in real time as agents write them

This matters because agents rely on context files the user maintains
manually — brand-voice.md, CLAUDE.md, product lists, business info.
Today you'd edit these in VS Code. In SuperConsole you stay in one app.

The editor is intentionally minimal — not a code editor, not Monaco.
Plain text editing with markdown preview. For serious code editing,
VS Code is still the right tool. We're not competing with it.

---

## Remote Triggers and Agent Reporting

Designed for later — but the architecture supports it from day one.

The Rust backend runs a local HTTP server alongside the app. This
becomes the bridge between the outside world and your workspace sessions.

### Inbound (trigger an agent remotely)
- Telegram bot message → local server → injects /ceo or any command
  into the right workspace session → agent runs
- SMS via Twilio webhook → same path
- Mobile web UI → Cloudflare Tunnel exposes local server to your phone
  → you pick workspace + command → runs on your Mac

### Outbound (agent reports back)
- Job completes → Rust backend fires Telegram message with output
- Post drafted → Telegram sends preview → you reply approve/reject
- CEO briefing ready → SMS summary → full report in inbox

This turns the scheduler from a silent background process into a
communicating agent. You don't need to open the app to know what ran.

Channels to add (in order of priority):
1. Telegram (most useful, free, easy API)
2. SMS via Twilio
3. WhatsApp via Twilio
4. Mobile web UI via Cloudflare Tunnel

---

## Build Phases

### Phase 1 — Core (3-4 weeks)
- Tauri app boots on Mac and Windows
- Workspace sidebar: add folder, switch, persist config
- PTY session: spawn Claude Code CLI, stream output to chat UI
- Basic chat UI: markdown rendering, streaming, slash command input
- Context injection: auto-load CLAUDE.md / README on session start
- Workspace .env loading: credentials scoped per workspace

### Phase 2 — Scheduler (2 weeks)
- Cron job UI per workspace (add command + schedule)
- Jobs fire on schedule via tokio-cron-scheduler
- Mac wake detection: queued jobs run on laptop open
- Windows equivalent via system APIs
- Inbox: list of completed job outputs

### Phase 3 — Multi-CLI (1-2 weeks)
- Antigravity CLI preset
- Factory Droid preset
- Per-workspace CLI selector
- Custom CLI preset (user defines path + start command)

### Phase 4 — File Manager (1 week)
- File tree sidebar per workspace
- Inline text / markdown editor
- Create, rename, delete files
- Live refresh when agents write new files

### Phase 5 — Remote Triggers (2 weeks, optional)
- Local HTTP server in Rust backend
- Telegram bot integration (inbound commands + outbound reports)
- Cloudflare Tunnel support for mobile web access
- SMS via Twilio (optional)

### Phase 6 — Polish + Distribution (1 week)
- Approval flow in inbox (approve/reject before agent publishes)
- Session history per workspace
- Auto-updater
- Mac .dmg + Windows .exe installers
- App icon, onboarding flow

Total: 7-9 weeks. Claude Code writes most of the Rust and React.

---

## Why This Is a YC Application

The market: Factory raised $50M targeting developers. Superset and
Ara target developers. Every agentic desktop tool targets developers.

We target the operator — the person running a business, an agency,
a content operation — who wants agents working for them on a schedule,
across multiple clients, without living in a terminal.

The scheduler is the moat. No competitor has it. It turns an
interactive tool into an autonomous operating system for work.

The repo-agnostic design means we're not a wrapper for one product.
Any agentic CLI, any repo, any workflow. We grow with the ecosystem.

One-line pitch: "The desktop runtime for agentic repos."

---

## V1 Scope (What Ships First)

- Mac only (Windows in Phase 2)
- Claude Code CLI only
- Up to 10 workspaces
- Basic scheduler (cron, no triggers)
- Simple inbox (read-only, no approval flow yet)
- Local only — no cloud, no backend, no accounts

Simple. Fast. Useful on day one.

https://ui.shadcn.com/ 
https://www.radix-ui.com/

UI components: use shadcn/ui (https://ui.shadcn.com/) built on Radix UI.
Do not build custom components from scratch for things shadcn already has
(sidebar, dialog, tabs, input, button, dropdown, scroll area, tooltip).
Use shadcn for structure, Tailwind for custom styling on top.
Read PLAN.md fully before doing anything.

We are building Dockyard — a Tauri 2 desktop app (Mac + Windows).
Start Phase 1 only.

Phase 1 deliverables:
- Scaffold Tauri 2 project with React + Tailwind frontend
- Workspace sidebar (add folder, list workspaces, switch between them)
- PTY session per workspace using portable-pty Rust crate
- Spawn Claude Code CLI (claude) in the PTY when workspace opens
- Stream PTY output to chat UI with markdown rendering
- Basic slash command input with / autocomplete
- Load CLAUDE.md and README.md from workspace folder into session context on start
- Workspace config persisted in SQLite (workspace name, path, CLI choice)
- .env file in workspace folder loaded into PTY environment automatically

Do not build the scheduler yet. Do not build the file manager yet.
Get the core loop working first: open workspace → CLI spawns → chat works.

Ask me before making any major architecture decisions.
Use Rust for all system-level code (PTY, SQLite, file system).
Use React + Tailwind for all UI.

___

Reference this repo for architecture patterns: https://github.com/superset-sh/superset

Key patterns to learn from and adapt:
- .superset/config.json pattern → use as .dockyard/config.json per workspace
  (setup/teardown scripts, env vars, workspace metadata)
- plugins/ folder structure → how they define CLI presets per agent
- packages/ui → component structure with shadcn + Tailwind
- apps/ monorepo structure → separate desktop app from shared packages

Key differences from Superset — do NOT copy these:
- They use Electron → we use Tauri 2 + Rust
- They use Neon cloud Postgres → we use local SQLite only
- They use Bun + Turborepo → we use standard npm/cargo
- They focus on git worktrees for coding → we focus on scheduler + business ops
- No scheduler in Superset → scheduler is our core differentiator

Their codebase is 94.9% TypeScript. Ours is Rust backend + React frontend.

___

Later create

Analyze my entire codebase and create these 5 files in the project root:
1. ARCHITECTURE.md
- How the app is structured (Qwik + Cloudflare Workers)
- Data flow between routes, components, and workers
- Key architectural decisions and why
- Diagram of folder structure with purpose of each folder
2. CONTEXT. md
- Qwik-specific patterns used (signals, loaders, actions, routeLoader$, routeAction$)
- Cloudflare Workers bindings and constraints
- Environment variables and what they do
- Gotchas and workarounds specific to this codebase
- How to run, build, and deploy
3. CODEBASE.md
- Every important file with a one-line description
- Which files depend on each other
- Entry points for each major feature
- What to NOT touch and why
Format so an AI agent can find the right file without reading everything
4. DESIGN_PRINCIPLES.md
- Coding conventions used in this project
- Naming patterns for files, components, functions
- State management approach
- Error handling patterns
- What patterns to avoid
5. TECH_STACK.md
- Every library and why it was chosen
- Cloudflare services used (KV, D1, R2, etc.)
- Dev tooling and config files explained
- Version constraints to be aware of
Rules:
- Be specific to THIS codebase, not generic
- Keep each file concise to save tokens
- Use short bullet points, not long paragraphs
- Flag anything that is non-standard or surprising

Done (Phases 1-6 complete):
   •  Tauri 2 + React 19 + TanStack Router + Tailwind v4 + shadcn, Claude-style design system (dark/light)
   •  Workspaces under organizations, multi-CLI tabs (Claude/Droid/Antigravity + shell), PTY sessions, file 
      manager, slash commands
   •  Scheduler + Inbox with approve/reject, session history, Telegram bot + local HTTP triggers
   •  Settings page, app icon, updater scaffold (needs signing key + endpoint), onboarding
   •  Shippable artifacts: src-tauri/target/release/bundle/dmg/Dockyard_0.1.0_aarch64.dmg and Dockyard.app
   •  Docs: ARCHITECTURE.md, CONTEXT.md, CODEBASE.md, DESIGN_PRINCIPLES.md, TECH_STACK.md

   Left for later: custom CLI presets, Windows build, updater signing key/endpoint, Cloudflare Tunnel docs. Note: 
   the repo has no git init yet, so consider git init + first commit when you're back.

   Run it anytime with npm run tauri dev. Good luck with the YC application.
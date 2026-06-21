# SuperConsole

An agentic workspace desktop app. SuperConsole runs isolated terminal sessions, native chat, and headless cron jobs across local workspaces, and layers in an optional cloud (WorkOS identity + Turso) for org/project config, team membership, LLM keys, and connectors. A companion web portal manages that same cloud state from the browser.

Built with Tauri 2 (Rust) + React 19. Mac-first, `<30MB` native build.

## Features

- **Terminals**: real PTY sessions (xterm.js, WebGL renderer + bundled JetBrains Mono Nerd Font) per workspace, multiple CLIs concurrently (Claude, Droid, Antigravity, Codex, shell). Per-tab status footer (git diff stat, files toggle, branch, post-exit token·cost) and an optional rich-text input.
- **Native chat**: stream responses from Anthropic / OpenAI-compatible / Gemini / OpenRouter (live model list + pricing), with reasoning/thinking effort, a system prompt built from on-demand context files and connected tools, cross-CLI slash commands, message edit-to-fork / regenerate / stop, quick-prompt chips (e.g. session log), web search, and a session token·cost footer.
- **Scheduled jobs**: cron jobs run headlessly via a 30s tick loop; results land in the Inbox. Trigger remotely over HTTP or Telegram, on a schedule, or manually/one-time.
- **Agents**: an agent is a reusable *definition* (`.superconsole/agents/<name>/agent.md` = instructions + skills + connectors + context); the harness, model, and schedule are chosen when you run or schedule it as a job. Browse the SuperConsole agent catalog (sidebar), import any GitHub repo as an agent or new project (full clone + generated `agent.md` + all skills), and let repos self-describe via a `.superconsole-plugin/` manifest (falls back to `.claude-plugin/` or README). Prompts can reference `@skill:`/`@context:`/`@connector:`/`@agent:` resources, fetched on demand via MCP tools.
- **Cloud layer (optional)**: WorkOS sign-in, synced orgs/projects, team invitations, three-level LLM keys (project → org → account), and connectors (incl. a web search connector backed by Tavily, exposed to chat as a `web_search` tool). Secrets are AES-256-GCM encrypted and injected into agent sessions.
- **Web portal** (`superconsole-web/`): browser surface onto the same Turso DB, deployed to Cloudflare Workers.

## Project layout

```
src/                 React frontend (router, components, lib/api.ts)
src-tauri/           Rust backend (local + cloud modules)
superconsole-web/    Cloudflare Workers web portal (own README/PROJECT.md)
```

## Develop

Prerequisites: Node.js, Rust, and the Tauri CLI (`cargo install tauri-cli`).

```bash
npm install
npm run tauri dev        # Vite on :1420 + Rust debug build, hot reload
```

Other commands:

```bash
npm run build                     # typecheck + frontend build (tsc && vite build)
cd src-tauri && cargo check       # backend check
cargo tauri build                 # ship: .app + .dmg in src-tauri/target/release/bundle/
```

## Cloud configuration

Cloud features read from a gitignored root `.env` (loaded via `dotenvy`):

```
WORKOS_API_KEY=
WORKOS_CLIENT_ID=
WORKOS_REDIRECT_URI=
WORKOS_COOKIE_PASSWORD=
TURSO_DATABASE_URL=
TURSO_AUTH_TOKEN=
```

`WORKOS_COOKIE_PASSWORD` must match the web portal's, or encrypted secrets won't decrypt across surfaces. The app works fully offline without these set.

## Documentation

| File | Contents |
|---|---|
| `PROJECT.md` | High-level overview and architecture summary |
| `ARCHITECTURE.md` | Data flow (local + cloud), frontend structure, key decisions, folder map |
| `CODEBASE.md` | Backend + frontend file index, entry points per feature, do-not-touch list |
| `CONTEXT.md` | Tauri/React patterns, build commands, cloud + sync patterns, env vars, gotchas |
| `DESIGN_PRINCIPLES.md` | Naming, state, error, CSS, backend + cloud conventions |
| `TECH_STACK.md` | Every dependency with rationale and version constraints |
| `CLAUDE.md` | Engineering quick-reference (mental model, cloud rules, gotchas) |

The web portal is documented in `superconsole-web/PROJECT.md` and `superconsole-web/CLAUDE.md`.

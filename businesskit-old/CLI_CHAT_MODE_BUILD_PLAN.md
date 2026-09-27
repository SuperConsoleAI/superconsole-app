# BusinessKit CLI Chat Mode — Build Plan (Phase 8, revised)

This replaces the PTY/`pty.rs`-based plan discussed earlier for *this* phase.
That design is correct for a different feature (Terminal Mode, Phase 9,
tracked separately) — but chat mode needs none of it. No PTY, no xterm.js,
no raw terminal. Headless CLI subprocess → structured JSON events → same
`chat.rs` pipeline and UI already shipped.

Read `AGENT_CHAT_BUILD_HANDOFF.md` first — `chat.rs`, `agent_tools.rs`, and
the chat UI it describes are all being extended here, not replaced.

---

## 0. Read first, before writing any code

- The shipped `chat.rs` — specifically `run_tool_loop` and the
  `chat-token`/`chat-done`/`chat-error` event emission. This phase adds a
  second *source* for those events; the sink (frontend, event names,
  `chat_messages` persistence) does not change.
- `agent_tools.rs`'s `registry()` and `execute()` — unchanged. Both the
  hosted-model path and every CLI adapter call the same dispatcher.
- Confirm current CLI versions installed for testing: `claude --version`,
  `codex --version`. Flags below are current as of this writing but these
  CLIs update fast — re-check `claude -p --help` / `codex exec --help`
  before wiring the adapters in Phase 3.

---

## 1. Schema (UserDB only)

Extend `chat_sessions` with one field:

- `provider` (text) — `"hosted"` (existing default model path) or
  `"cli:claude"` / `"cli:codex"` / `"cli:antigravity"`. Stored per session
  so history shows which brain answered, and so resuming a session
  re-launches the same provider.

No new tables needed — `chat_messages` already holds role/content/
tool_calls_json regardless of provider.

**Done when:** existing sessions default to `"hosted"` on migration; new
sessions can be created with any provider value.

---

## 2. Per-profile workspace directory

Create on first use, not at profile creation:

`~/.businesskit/profiles/<profile_id>/workspace/`

Its only job: hold the MCP config file(s) a headless CLI subprocess reads
on launch. Nothing else lives here — no context files, no git repo, no
README scanning. This is smaller in scope than `pty.rs`'s workspace
concept; don't port `detect_context_files` or `.env` loading from that
file, none of it applies here.

**Done when:** the directory and its MCP config file(s) (Phase 4) are
created lazily the first time a CLI-provider session starts for that
profile, and are safe to delete/regenerate at any time (treat as a cache,
not durable state — nothing here should ever be the source of truth for
anything; UserDB is).

---

## 3. `mcp_server.rs` — expose `agent_tools` over stdio MCP

New file. A stdio JSON-RPC process implementing the MCP server protocol,
wrapping `agent_tools::registry()` for tool discovery and
`agent_tools::execute()` for calls. This is the piece that didn't exist
before — everything else in this doc is plumbing around it.

- Tool discovery: map each `ToolSpec` (name, description, input_schema)
  to an MCP `tools/list` response entry, namespaced so external CLIs see
  them as e.g. `mcp__businesskit__inventory_add_stock`.
- Tool calls: MCP `tools/call` → resolve `ToolCtx` for the active
  `profile_id` (passed at launch, not per-call — see Phase 4) → call
  `agent_tools::execute()` → return the result as an MCP tool result.
- No new business logic. If a tool call fails, surface the same error
  string `agent_tools::execute()` already produces.

**Done when:** `claude mcp add businesskit -- <path-to-binary> --profile
<id>` (or equivalent manual registration) lets an interactive `claude`
session list and call all 7 tools correctly against a real UserDB.
Verify this manually before wiring headless mode — it isolates MCP-layer
bugs from headless-launch bugs.

---

## 4. Per-CLI headless launch + config write

One small module per CLI. Each does the same two things — write a scoped
MCP config into the workspace dir, then spawn the CLI headless — but the
exact flags and config format differ per CLI. Do not try to unify these
into one generic launcher; the differences are real, not incidental.

### Claude Code

- Config: `.mcp.json` in the workspace dir, JSON, pointing at the
  `mcp_server.rs` binary with `--profile <id>` as an arg.
- Launch: `claude -p "<prompt>" --output-format stream-json --mcp-config
  <path-to-.mcp.json> --allowedTools "mcp__businesskit__*"
  --permission-mode bypassPermissions --append-system-prompt
  "<brand_foundation context>"`
- **Lockdown, non-negotiable:** `--allowedTools` scoped to
  `mcp__businesskit__*` only. `bypassPermissions` is required for headless
  MCP calls to go through without hanging on an approval prompt no one is
  there to answer — but that flag also unlocks Claude's native Read/
  Write/Bash/etc. `--allowedTools` is what closes that door back down.
  Verify with a deliberate test: ask it to read an arbitrary file outside
  the workspace and confirm it's refused/unavailable.
- Resume: pass `--session-id` at launch and `--resume <id>` on
  follow-up turns, mapped to your own `chat_sessions.id`.

### Codex

- Config: `~/.codex/config.toml`, `[mcp_servers.businesskit]` block
  (TOML, not JSON — do not reuse the Claude config writer). Codex may
  not support a fully per-invocation config path the way Claude does;
  confirm during Phase 0 whether a `--config`/profile override lets you
  scope this per-profile without clobbering the user's own global Codex
  config, and design around whichever is true.
- Launch: `codex exec --json "<prompt>" -C <workspace-dir>` with sandbox/
  approval flags set to the least-permissive mode that still lets MCP
  tool calls complete non-interactively. **Test this explicitly first** —
  there's a known class of issue where `codex exec` auto-cancels MCP tool
  calls in headless mode unless the approval mode is set correctly, so
  don't assume the first flag combination you try actually works.
- Lockdown: sandbox mode restricting filesystem/shell access to the
  workspace dir only; MCP tools are the only thing that should reach
  UserDB.

### Antigravity

- Unverified. Before writing an adapter, spend a short timeboxed spike
  confirming: (a) does it have a non-interactive/headless mode at all,
  (b) does it support MCP servers, (c) does it emit structured/parseable
  output. If any of those is "no" or "unclear," don't build this adapter
  yet — ship Claude + Codex first and revisit.

**Done when:** for each supported CLI, a single headless call — prompt in,
one MCP tool call, structured response out — completes successfully
against a real UserDB, with the lockdown test above passing.

---

## 5. Adapter layer — translate CLI output into `chat.rs`'s event shape

New module (one file, per-CLI parsers behind a common trait/interface).
Each CLI's NDJSON stream has its own schema for "assistant text chunk",
"tool call requested", "tool result", "turn done". Write one parser per
CLI that reads its native stream and emits the exact same internal
representation `run_tool_loop` already produces for the hosted-model path
— so downstream of the adapter, `chat.rs` doesn't know or care which
provider is talking.

- Claude's `stream-json` events: `system`/`init`, `assistant` (text +
  tool_use blocks), `user` (tool_result echoes), final `result` event
  with `session_id`/cost. Map text deltas → `chat-token`, tool_use →
  the same tool-call-in-progress state the hosted path uses, final
  `result` → `chat-done`.
- Codex's `--json` events: different schema, same job — map to the same
  three internal event types.
- Persist to `chat_messages` exactly as the hosted path does — same
  table, same shape, `provider` column (Phase 1) is the only new field.

**Done when:** a chat session started with `provider = "cli:claude"`
renders in the existing chat UI — tool-call cards, streaming text — with
zero frontend changes. If the UI needs to know which provider is running,
that's a sign the adapter isn't normalizing fully; fix the adapter, not
the UI.

---

## 6. Provider picker in existing UI

The model dropdown already visible in the chat footer (currently showing
the hosted model, e.g. `mistral-small-latest`) gets additional entries:
"Claude Code (your subscription)", "Codex (your subscription)", and
Antigravity once/if Phase 4 confirms it's viable. Selecting one sets
`chat_sessions.provider` for that session. No new UI surface — this is an
addition to a dropdown that exists.

Show a one-line explainer near the picker the first time a CLI provider
is selected — something like "runs on your own Claude/Codex login, not
routed through BusinessKit" — since it's a meaningfully different cost/
privacy model from the hosted option and the user should know that
before picking it.

**Done when:** switching providers mid-session-list (not mid-session)
works, and the one-time explainer shows once per provider per user.

---

## 7. End-to-end pass

Single message, provider set to `cli:claude`: *"add 50 units of SKU-1042
and invoice Acme for the last order."* Confirm both tool calls fire in
sequence, using the *user's own* Claude login (verify by checking there's
no BusinessKit-side Anthropic API cost logged for this turn), and the
chat UI renders it identically to a hosted-model turn. Repeat for
`cli:codex`.

---

## 8. Explicitly deferred — Terminal Mode (Phase 9, separate doc)

Interactive PTY-based terminal panel for power users, using `pty.rs`
near-verbatim (the plan discussed and set aside earlier in this build).
Different risk profile from chat mode — interactive means a human
approves each native-tool action, so it can safely expose the CLI's full
native toolset plus MCP tools, not just the MCP-only lockdown chat mode
requires. **Do not start this until Phases 1–7 above are shipped and
stable** — it's a separate consumer of the same `mcp_server.rs` built
here, and building it in parallel risks discovering MCP-layer bugs in
two places at once instead of one.

---

## Definition of done (this phase)

- A BusinessKit user can pick "Claude Code" or "Codex" from the existing
  model dropdown and get the exact same chat experience — same UI, same
  tool-call cards — as the hosted model, with tool execution running
  against their real UserDB.
- Zero BusinessKit-side inference cost for CLI-provider turns — confirmed
  by checking no API charge is incurred on BusinessKit's own Anthropic/
  OpenAI account for those turns.
- Every CLI-provider session is locked to `mcp__businesskit__*` tools
  only — verified by an explicit test asking each CLI to do something
  outside that scope (read an arbitrary file, run a shell command) and
  confirming it's refused or unavailable.
- No PTY, no terminal emulator, no raw ANSI anywhere in this phase's code.
- `chat_messages` and `chat_sessions` are the only place any of this
  persists — the workspace directory from Phase 2 is disposable.

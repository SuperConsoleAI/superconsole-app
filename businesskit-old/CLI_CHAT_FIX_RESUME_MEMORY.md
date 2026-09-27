# BusinessKit CLI Chat — Fix Pass (Phase 8a)

This is a fix, not a new build — `src-tauri/src/commands/agents/cli.rs`,
`chat.rs`, and `mcp_server.rs` already exist and are shipped. Read the real
`cli.rs` before touching anything; don't assume, verify against what's
actually there.

Two problems, fix in this order — the first is a correctness bug and the
cheaper fix; the second is the latency issue and depends on the first
being in place first.

Read `CLI_CHAT_MODE_BUILD_PLAN.md` §5.5 for the resume-vs-fresh-start
design rationale and the T3 Code bug this mirrors — this doc is the
concrete patch instructions against the real file; that doc is the why.

---

## Problem 1 (fix first): no conversation memory between messages

**Verify this is real before fixing it:** confirm in the actual
`run_cli_turn` that no branch (Claude, Codex, or Antigravity) currently
passes any resume/session flag, and that Codex's Claude branch does not
build the current `Command` with the prior turn's conversation history —
only the current `message` wrapped in `contextual_message`. If a resume
mechanism already exists somewhere else in the codebase that this
analysis missed, stop and report that instead of proceeding.

### 1. Schema

Add a `cli_resume_ref` column (nullable text) to the existing
`agent_chat_sessions` table via the normal migration path. This holds
whatever resume handle the *active provider* returns — a Claude session
ID, a Codex thread ID — not a BusinessKit-generated value. Leave it null
until the first successful turn of a session populates it.

**Check:** existing rows migrate with `cli_resume_ref` null; no other
column changes needed.

### 2. Read the resume ref before spawning, every turn

At the top of `run_cli_turn`, before any `Command::new(...)` is built,
look up `cli_resume_ref` for the given `session_id` from
`agent_chat_sessions`. This value (present or absent) decides which
argument shape gets built for whichever provider branch runs.

**Check:** a fresh session (no prior turns) reads back `None`/null
without error; an existing session with a stored ref reads it back
correctly.

### 3. Claude branch — add resume, capture the returned session ID

- When a stored ref exists, add `--resume <ref>` to the command being
  built (alongside the existing `-p`, `--output-format stream-json`,
  `--mcp-config`, etc. — this is additive, not a restructure of the
  existing flags).
- When a stored ref does *not* exist, leave the command as-is (fresh
  session) — same as today.
- Capture the outgoing session ID from the CLI's own output: the
  `"result"` event type (already matched in the existing event loop)
  carries a `session_id` field alongside `result` — read it and persist
  it to `agent_chat_sessions.cli_resume_ref` in the same
  UPDATE that already runs at the end of `run_cli_turn`, not as a
  separate write.

**Check:** send two messages in the same chat session with the Claude
provider. The second message's response must demonstrate awareness of
the first message's content — not a generic "no prior context" answer.
This is the actual test, not "the code compiles."

### 4. Codex branch — remove `--ephemeral`, restructure for `resume`

- Remove `--ephemeral` entirely. It is explicitly documented as
  disabling rollout persistence — its presence is the direct cause of
  Codex-driven chat having zero memory today. There is no reason to keep
  it for this use case.
- Codex's resume mechanism is a positional subcommand, not a flag:
  `codex exec --json resume <thread_id> "<message>"`, not
  `codex exec --json "<message>" ... -c mcp_servers...`. This means the
  Codex branch needs its argument construction restructured, not just
  an appended `.arg()` — when a stored ref exists, insert `resume
  <thread_id>` into the argument list before the prompt argument; when
  it doesn't, build the command exactly as today (minus `--ephemeral`).
- Capture the `thread_id` Codex emits in its own JSON stream on the
  first turn of a session and persist it the same way as Claude's
  `session_id` above.
- **Verify codex's exact current flag names before wiring this** — the
  resume subcommand's exact behavior has changed between Codex CLI
  versions and has had real bugs (interaction with sandboxing flags,
  with `--last`). Check `codex exec --help` and `codex exec resume
  --help` against the installed version rather than trusting this doc's
  description of the syntax as final.

**Check:** same two-message memory test as Claude, run against the
Codex provider.

### 5. Antigravity branch — investigate before changing anything

Unlike Claude and Codex, there's no confirmed resume mechanism for `agy`
in this codebase or in what's been verified so far. Before writing any
code for this branch:

- Check `agy --help` and any Antigravity CLI docs for a resume/session
  flag equivalent to the other two.
- If one exists, wire it the same way as the other two branches.
- If none exists, leave the Antigravity branch exactly as it is today
  and note that plainly rather than guessing at a flag — a wrong guess
  here fails silently (the CLI either ignores an unknown flag or errors
  out) and is worse than admitting the gap.

**Check:** either the memory test passes for Antigravity too, or the
investigation's conclusion ("no resume support found in this CLI
version") is written down somewhere visible, not left implicit.

### 6. Regression check across all three

Confirm a *fresh* session (no `cli_resume_ref` yet) still behaves exactly
as it does today for all three providers — this fix must be purely
additive for the new-session path. Only the resume path is new behavior.

---

## Problem 2 (fix second, only after Problem 1 lands): per-message cold start

This is the latency issue — already fully specced in
`CLI_CHAT_MODE_BUILD_PLAN.md` §4/§5.5 (persistent bidirectional process
via `--input-format stream-json`, kept alive for the whole session
instead of a fresh `-p`/`exec` spawn per message). Don't re-derive it
here; that doc is current. The reason to sequence it after Problem 1:
the persistent-process design still needs the same `cli_resume_ref`
column and the same "does a resume ref exist" branch this fix
introduces — reconnecting to a session after the persistent process gets
reaped for idle time is exactly the resume path built here, just
triggered by a different cause (idle timeout vs. every single message).
Building both at once risks not being able to tell which layer a bug
lives in.

---

## Definition of done (this fix pass)

- A two-message exchange in the same chat session, for both Claude and
  Codex providers, demonstrates real memory of the first message when
  answering the second — not just "doesn't error."
- Codex chat no longer runs with `--ephemeral`.
- A fresh (first-ever) session for all three providers behaves exactly
  as before this fix — no regression on the new-session path.
- Antigravity's resume status (supported and wired, or confirmed
  unsupported) is explicit, not assumed.
- Nothing in this pass touches the cold-start-per-message latency problem
  — that's Problem 2, tracked separately, next.

Two things in the drafted plan worth verifying before it runs, not trusting as written:

Codex arg ordering — the plan writes codex exec resume <thread_id> <prompt> --json .... Where --json sits relative to resume and the positional prompt has actually been a source of real parsing bugs in Codex's own CLI (clap conflicts between --last and an explicit session ID, prompt-vs-session-id ambiguity). Don't take this doc's ordering as final — have it confirm the exact working invocation against codex exec resume --help on the installed version first.

Antigravity's --conversation <conversation_id> flag — this is new; I never verified this flag exists anywhere, and Antigravity's CLI is thin on public docs. If Claude Code found this by actually running agy --help and reading it, fine — but if it's inferred/assumed from the Claude/Codex pattern, that's exactly the kind of guess my fix doc told it not to make. Ask it directly: "did you confirm --conversation against agy --help output, or is this assumed?" before merging that branch.

___

Given the $5 budget, prioritize verification over new work — closing out what's already built is cheap; the persistent-session refactor is not. Here's what to tell Claude Code, in order, stopping between each if budget gets tight:

---

**1. Verify Claude Code's multi-turn memory (do this first — cheap, closes a known gap):**

> Send two consecutive messages in the same chat session using the Claude Code CLI provider. Confirm the second message's response demonstrates actual memory of the first message's content — not a generic "no prior context" answer. Report the exact prompts and responses used, not just pass/fail.

**2. Confirm the fresh-session regression didn't break:**

> For all three CLI providers (Claude, Codex, Antigravity), start a brand-new chat session (no prior `cli_resume_ref`) and send a single message. Confirm each spawns and responds without error, exactly as it did before the resume fix — this path should be completely unaffected by the resume changes.

**3. Confirm whether the Codex argument-shape tests are real coverage:**

> Check whether there are actual unit tests exercising both the fresh-turn and resume-turn Codex argument construction (the `codex exec resume <thread_id> <prompt>` vs `codex exec <prompt>` branching), or whether `cargo test --lib` only passed because nothing new was added. If no such test exists, add one — it's the exact code path that was just changed.

**If budget remains after those three — start the actual latency fix, scoped small:**

> Every chat message still spawns a completely fresh CLI process, even with resume working — that fixes memory, not speed. For the Claude Code provider only (leave Codex and Antigravity as they are for now), change the launch from one-shot `-p` to a persistent process: use `--input-format stream-json` together with `--output-format stream-json`, spawn the process once when a chat session starts, and feed subsequent user messages as JSON lines on stdin instead of spawning a new process per message. Kill the process after roughly 15–30 minutes of idle time. `--verbose` is required whenever `--output-format stream-json` is used or the process exits silently. Don't touch Codex or Antigravity in this pass — get Claude working end-to-end first, then decide if it's worth repeating per-provider.

---

Stop there for this pass. The persistent-process work is a real refactor (new process-lifecycle management, not just an added flag) — better to let it land cleanly for one provider than burn the remaining budget half-finishing it across three.

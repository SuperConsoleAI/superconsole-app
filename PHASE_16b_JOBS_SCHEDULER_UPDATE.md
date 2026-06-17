# SuperConsole — Jobs/Scheduler Update
## Phase 16 Follow-up
## Context: Post Phase 16 (MCP Tool Infrastructure complete)

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md`, and `DESIGN_PRINCIPLES.md` fully before touching anything.

Key files involved:
- Backend: `src-tauri/src/scheduler.rs`, `src-tauri/src/db.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/mcp.rs`
- Frontend: `src/components/JobsDialog.tsx`, `src/components/TasksView.tsx`, `src/lib/api.ts`

Do NOT rewrite — extend only. All existing job behavior must continue working unchanged.
`cargo check` and `npm run build` must pass clean before done.

---

## 1. Backend — `db.rs` (schema migration)

Add these columns to the `jobs` table via idempotent `ALTER TABLE IF NOT EXISTS` guards in `Db::init`.
All have DEFAULT values so existing rows keep working with zero migration issues.

```sql
-- Run mode: which executor fires this job
ALTER TABLE jobs ADD COLUMN run_mode TEXT NOT NULL DEFAULT 'cli';
-- 'cli' = existing PTY headless path
-- 'chat' = native chat one-shot executor

-- Run config: JSON blob, shape depends on run_mode
ALTER TABLE jobs ADD COLUMN run_config TEXT NOT NULL DEFAULT '{}';
-- cli mode:  { "cli": "claude", "model": "claude-sonnet-4-6" }
-- chat mode: { "provider": "anthropic", "model": "claude-sonnet-4-6" }

-- Trigger type: what fires this job
ALTER TABLE jobs ADD COLUMN trigger_type TEXT NOT NULL DEFAULT 'cron';
-- 'cron' = existing cron schedule (unchanged)
-- 'api'  = fired by local HTTP server (remote.rs, already works — just tag it)
-- 'github' = webhook config stored, handling is a future phase

-- Trigger config: JSON blob per trigger type
ALTER TABLE jobs ADD COLUMN trigger_config TEXT NOT NULL DEFAULT '{}';
-- cron:   { "cron": "0 9 * * 1" }  (same as current `schedule` column — keep schedule col too)
-- api:    {}  (no extra config, remote.rs handles it already)
-- github: { "repo": "owner/repo", "event": "push", "branch": "main" }

-- Connector restriction: which connectors this job can use
-- Empty array [] = all project connectors available (current behavior, default)
-- Non-empty = ToolCtx restricted to only these connector service ids for this job
ALTER TABLE jobs ADD COLUMN allowed_connectors TEXT NOT NULL DEFAULT '[]';
```

---

## 2. Backend — `scheduler.rs`

Update `exec_in_workspace` to branch on `run_mode`.

**Current behavior (cli mode — keep exactly as-is):**
- Spawn PTY headlessly, run command, write output to inbox + notify Telegram.

**New branch (chat mode):**
- Perform a one-shot (non-streaming) LLM completion using the same provider/key resolution as `chat.rs`.
- Use the job's `command` as the user message.
- System prompt: same `build_system_prompt` helper used by `chat.rs` (context files + connected services + memory index + wiki index).
- Do NOT stream to UI — this is headless. Write the full response text to inbox as a new inbox item.
- Notify Telegram with result summary (same as cli mode).
- Reuse the provider adapter logic already in `chat.rs` / `llm.rs` — do not duplicate it. Extract a `one_shot_completion(provider, model, messages) -> Result<String>` helper in `llm.rs` if it does not already exist.

**Connector restriction:**
- When `allowed_connectors` is non-empty, restrict the `ToolCtx` passed to `mcp.rs` execute() to only the listed service ids.
- When empty, all project connectors available (current behavior).

**`job_command` in `scheduler.rs`:**
- Update to read `run_mode` + `run_config` from the job row and branch accordingly.

---

## 3. Backend — `lib.rs`

Update `create_job` and `update_job` Tauri commands to accept and persist:
- `run_mode: String`
- `run_config: String` (JSON)
- `trigger_type: String`
- `trigger_config: String` (JSON)
- `allowed_connectors: String` (JSON array)

Update `list_jobs` to return these fields in the `Job` struct.

Register any new commands in `generate_handler!`.

---

## 4. Frontend — `src/lib/api.ts`

Update the `Job` type to include:
```typescript
run_mode: 'cli' | 'chat'
run_config: {
  // cli
  cli?: string
  model?: string
  // chat
  provider?: string
}
trigger_type: 'cron' | 'api' | 'github'
trigger_config: {
  cron?: string
  repo?: string
  event?: string
  branch?: string
}
allowed_connectors: string[]  // connector service ids
```

Update `createJob` and `updateJob` wrappers to pass the new fields.

---

## 5. Frontend — `JobsDialog.tsx`

Extend the create/edit job form. Do NOT redesign — add to the existing form layout.

### A. "Run via" segmented control

Place above the command/schedule inputs. Two segments:

**`CLI` (default):**
- CLI preset picker: dropdown with `claude` / `droid` / `antigravity` / `shell`
  (reuse `CLI_PRESETS` from `api.ts`, same pattern as `AddWorkspaceDialog`)
- Model: text input, placeholder `claude-sonnet-4-6`

**`Chat`:**
- Provider picker: dropdown with `anthropic` / `openai` / `google` / `openrouter` / `local`
  (same options as `ChatView.tsx` composer)
- Model: text input, placeholder based on selected provider

### B. Trigger type tabs

Replace (or wrap) the existing schedule/cron UI with three tabs:

**`Schedule` (default — existing UI unchanged):**
- Existing cron presets: Hourly / Daily / Weekday / Weekly / Monthly / Custom
- No changes to this tab's internals

**`API`:**
- Show read-only text: "Trigger this job via HTTP POST"
- Show the existing HTTP trigger endpoint URL (read from `api.getSettings()` → `api_token` + port)
- Example: `POST http://localhost:3333/run?workspace=<id>&command=<cmd>&token=<api_token>`
- Copy button next to URL

**`GitHub`:**
- Repo input: `owner/repo` format
- Event dropdown: `push` / `pull_request` / `release` / `workflow_run`
- Branch input: default `main`
- Show amber badge: "Webhook not yet active — config saved for future use"

### C. Connectors panel (collapsible, default collapsed)

Below the trigger section. Header: "Restrict connectors" with a chevron toggle.

When expanded:
- Call `api.listConnectors(workspaceId)` to get project connectors
- Show three groups: **Project** / **Org** / **Account**
- Each connector shown as a checkbox row: `[✓] Gmail — sarah@acmedental.com`
- All checked by default (= unrestricted, `allowed_connectors = []`)
- When user unchecks some: `allowed_connectors` = array of checked service ids only
- Helper text: "Leave all checked to allow access to all connected services"

### D. Job list — run mode badge

In the job list rows (both `JobsDialog` list and `TasksView`), add a small badge under the job name:
- CLI mode: `CLI • claude` (or whichever CLI) in `text-muted-foreground text-xs`
- Chat mode: `Chat • anthropic` (or whichever provider) in `text-muted-foreground text-xs`
- Trigger type badge next to it: `cron` / `api` / `github` in same style

---

## 6. Frontend — `TasksView.tsx`

Add the run mode + trigger type badges to the job rows (same as JobsDialog list above).
No other changes to TasksView.

---

## Scope rules — do NOT do these

- Do NOT touch `remote.rs` Telegram or HTTP trigger logic — those stay exactly as-is
- Do NOT implement GitHub webhook handling — store the config only, show "coming soon" badge
- Do NOT change `exec_in_workspace` function signature — extend it internally
- Do NOT rewrite `JobsDialog` — extend the existing form
- Do NOT hand-edit `components/ui/` (shadcn-managed)
- Do NOT query Turso on the hot scheduler path — read local SQLite only

---

## Done criteria

- `cargo check` passes clean
- `npm run build` passes clean (tsc + vite)
- Existing jobs with no new columns continue to work (cli mode, cron trigger, all connectors)
- New job form shows Run via / Trigger / Connectors sections
- Chat mode jobs fire one-shot completion and write to inbox
- Job list badges show run mode + trigger type

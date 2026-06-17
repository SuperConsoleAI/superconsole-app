# SuperConsole — CLI Sessions: Open = Resume in a Terminal Tab
## Follow-up to CLI_SESSIONS_NATIVE_READ

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md`, and `DESIGN_PRINCIPLES.md` fully before touching anything.

Key files involved:
- Backend: `src-tauri/src/pty.rs`, `src-tauri/src/lib.rs`
- Frontend: `src/lib/api.ts`, `src/lib/workspace-context.tsx`,
  `src/components/TerminalView.tsx`, `src/components/SessionsView.tsx`, `src/router.tsx`

`cargo check` and `npm run build` must pass clean before done.

---

## The Change

Today the CLI Sessions tab expands a row, lists the native CLI sessions on disk, and an
`Open` button renders the session transcript **inline** (chat bubbles, tool chips).

New behavior: **`Open` resumes the session in a real terminal tab**, exactly like clicking a
workspace opens a CLI terminal. No inline transcript.

```
User clicks Open on a native CLI session
  → ensure that workspace is open + navigate to it
  → open a NEW terminal tab for that CLI preset (unique per session)
  → start_session passes the native session id so the CLI spawns with its resume flag
```

The inline native-session **list** (date / message count / size + `Open`) stays. Only the
inline transcript rendering is removed.

---

## Verified resume flags

| CLI | Binary | Resume invocation | Notes |
| --- | --- | --- | --- |
| Claude Code | `claude` | `claude --resume <session-uuid>` (alias `-r`) | Resume-by-ID only searches the current project dir + its git worktrees, so it **must** be launched with `cwd = workspace`. `start_session` already sets `cmd.cwd(workspace)`. The id is the `.jsonl` filename stem (our `CliSession.id`). |
| Factory Droid | `droid` | `droid --resume <sessionId>` (alias `-r`) | Interactive mode. |
| Antigravity | `agy` | TBD — **verify** the real flag before enabling | Native read isn't implemented for `agy` yet (`list_cli_sessions` returns empty), so no `Open` button appears for it today. Wire the flag generically and guard with the verified value once known; until then leave the arm as a no-op so `agy` simply launches fresh. |

---

## Backend

### `src-tauri/src/pty.rs`

Add an optional resume id to `cli_command` and append the right flag.

```rust
pub fn cli_command(cli: &str, workspace: &Path, resume_id: Option<&str>) -> CommandBuilder {
    let mut cmd = match cli {
        "claude" => {
            let mut c = CommandBuilder::new("claude");
            // ...existing README.md --append-system-prompt injection stays...
            if let Some(id) = resume_id {
                c.arg("--resume");
                c.arg(id);
            }
            c
        }
        "droid" => {
            let mut c = CommandBuilder::new("droid");
            if let Some(id) = resume_id {
                c.arg("--resume");
                c.arg(id);
            }
            c
        }
        "antigravity" => CommandBuilder::new("agy"), // TODO: append verified resume flag
        "shell" => { /* unchanged */ }
        other => CommandBuilder::new(other),
    };
    cmd.cwd(workspace);
    cmd
}
```

Thread the id through `start_session`:

```rust
pub fn start_session(
    app: &AppHandle,
    manager: &SessionManager,
    session_id: &str,
    workspace_id: i64,
    workspace_path: &str,
    cli: &str,
    rows: u16,
    cols: u16,
    llm_env: &[(String, String)],
    key_providers: &[String],
    resume_id: Option<&str>,   // NEW (add as last param)
) -> Result<SessionInfo, String> {
    ...
    let mut cmd = cli_command(cli, workspace, resume_id);
    ...
}
```

`cli_command` has no other callers (the scheduler uses its own `job_command`), so this is the
only call site to update.

### `src-tauri/src/lib.rs` — `start_session` command

Add an optional param and forward it:

```rust
#[tauri::command]
async fn start_session(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    workspace_id: i64,
    session_id: String,
    cli: String,
    rows: u16,
    cols: u16,
    resume_session_id: Option<String>,   // NEW
) -> Result<SessionInfo, String> {
    ...
    let info = pty::start_session(
        &app, &sessions, &session_id, workspace_id, &ws_path, &cli,
        rows, cols, &env, &resolved.providers,
        resume_session_id.as_deref(),     // NEW
    )?;
    ...
}
```

`log_session` keeps logging by the tab `session_id` (unchanged) so the resumed tab still shows
up in `session_history`.

---

## Frontend

### `src/lib/api.ts`

Add `resumeId` to the tab shape and the wrapper param:

```typescript
export interface SessionTab {
  id: string;
  cli: string;
  label: string;
  resumeId?: string;   // NEW: native CLI session id to resume
}

startSession: (
  workspaceId: number,
  sessionId: string,
  cli: string,
  rows: number,
  cols: number,
  resumeSessionId?: string,             // NEW
) =>
  invoke<SessionInfo>("start_session", {
    workspaceId, sessionId, cli, rows, cols, resumeSessionId,
  }),
```

### `src/lib/workspace-context.tsx`

Add a dedicated opener that always creates a **new unique tab** carrying the resume id (do not
reuse the per-CLI tab — each resumed session is its own tab):

```typescript
const openResumeTab = useCallback(
  (workspaceId: number, cli: string, resumeId: string) => {
    const id = `${workspaceId}:${cli}:resume:${resumeId}`;
    setTabsByWs((prev) => {
      const tabs = prev[workspaceId] ?? [];
      if (tabs.some((t) => t.id === id)) {
        setActiveTabByWs((a) => ({ ...a, [workspaceId]: id }));
        return prev;
      }
      const tab: SessionTab = {
        id,
        cli,
        label: `${cliLabel(cli)} (resumed)`,
        resumeId,
      };
      setActiveTabByWs((a) => ({ ...a, [workspaceId]: id }));
      return { ...prev, [workspaceId]: [...tabs, tab] };
    });
  },
  [],
);
```

Expose `openResumeTab` in the context value and the `WorkspaceContextValue` type.

### `src/components/TerminalView.tsx`

Pass the resume id when starting the PTY:

```typescript
const info = await api.startSession(
  workspace.id,
  tab.id,
  tab.cli,
  term.rows,
  term.cols,
  tab.resumeId,        // NEW
);
```

Because the tab id is unique per resumed session, `start_session`'s `was_active` guard naturally
spawns a fresh PTY for it.

### `src/components/SessionsView.tsx` (CLI tab only)

- Add a prop `onResume(workspaceId: number, cli: string, sessionId: string)`.
- In the native-session list, change the `Open` handler from the inline reader to
  `onResume(row.workspace_id, ns.cli, ns.id)`.
- **Remove** the inline transcript path: delete `openFile` / `msgs` state, `openSession`,
  `MessageThread`, `ToolBubble`, and the `messages`/`openFile` props on `NativePanel`. Keep the
  `NativePanel` list itself (date / count / size + `Open`).
- The `readCliSession` api wrapper + `read_cli_session` Rust command become unused. Leave them in
  place for now (harmless, no caller) or delete in a follow-up — do not block on it.

### `src/router.tsx` — `SessionsRoute`

Wire `onResume` the same way `onOpenChat` is wired (open + navigate to the workspace):

```typescript
const { workspaces, organizations, activeOrgId, openedIds, openTab, openResumeTab, openWorkspace } =
  useWorkspaces();

<SessionsView
  ...
  onResume={(workspaceId, cli, sessionId) => {
    openWorkspace(workspaceId, cli);          // ensure it's in openedIds
    openResumeTab(workspaceId, cli, sessionId);
    navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: String(workspaceId) },
      search: {},
    });
  }}
/>
```

---

## Scope rules — do NOT do these

- Do NOT touch the Chat tab in `SessionsView`.
- Do NOT change `job_command` / scheduler — resume is interactive-only.
- Do NOT reuse the existing per-CLI tab for a resumed session; always a new unique tab.
- Do NOT enable an Antigravity resume flag until the real flag is verified.
- Do NOT hand-edit `components/ui/` (shadcn-managed).

---

## Done criteria

- `cargo check` passes clean.
- `npm run build` passes clean (tsc + vite).
- Expanding a CLI row still lazily lists native sessions (date / count / size).
- Clicking `Open` switches to the workspace and opens a new terminal tab that resumes the chosen
  Claude Code / Droid session (`--resume <id>`), launched with `cwd = workspace`.
- No inline transcript rendering remains in the CLI tab.
- Fresh (non-resume) terminal tabs are unaffected.

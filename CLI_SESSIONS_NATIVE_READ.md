# SuperConsole — CLI Sessions: Native Read from CLI Storage
## Post Phase 16 / Sessions page follow-up

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md`, and `DESIGN_PRINCIPLES.md` fully before touching anything.

Key files involved:
- Backend: `src-tauri/src/files.rs`, `src-tauri/src/lib.rs`
- Frontend: `src/components/SessionsView.tsx` (the page just built), `src/lib/api.ts`

Do NOT rewrite SessionsView — extend the existing CLI tab only.
`cargo check` and `npm run build` must pass clean before done.

---

## The Problem

The current CLI Sessions tab shows only metadata from SuperConsole's own `session_history` table
(start/end time, workspace, CLI type). No content. 

Each CLI already stores full session content on disk in its own format.
We read those files directly — no duplicate storage in SQLite, always in sync.

---

## CLI Session Storage Paths

Each CLI writes sessions to a known location on disk. All paths are local to the user's machine.

### Claude Code
```
~/.claude/projects/<path-hash>/
  <session-uuid>.jsonl    ← one file per session, JSONL format
```

Path hash = the workspace absolute path, encoded.
Check Claude Code docs / source for exact encoding — it may be:
- URL-encoded path: `/Users/foo/projects/acme` → `-Users-foo-projects-acme`
- Or base64 of the path
- Detect by scanning `~/.claude/projects/` for directory names and matching against known workspace paths

Each `.jsonl` line is a JSON object. Relevant fields:
```json
{ "type": "user" | "assistant" | "tool_result", "message": {...}, "timestamp": "..." }
```
Read and surface as-is. Do not parse deeply — return raw lines, let frontend render.

### Factory Droid
```
~/.factory/sessions/<session-id>/
  conversation.json   ← or similar
```
Exact path TBD — scan `~/.factory/` and find session files. If path cannot be determined at build time, make it configurable (stored in settings) and skip gracefully if not found.

### Antigravity
```
~/.antigravity/sessions/   ← or similar
```
Same approach — scan known home dir location, skip gracefully if not found.

### Shell
No session storage — shell tabs have no history to read. Skip.

---

## Backend — `src-tauri/src/lib.rs` + `files.rs`

### New Tauri commands (register all in `generate_handler!`):

**`list_cli_sessions(workspace_path: String, cli: String) -> Result<Vec<CliSession>>`**

Returns a list of sessions for a given workspace + CLI combination.

```rust
pub struct CliSession {
    pub id: String,           // session uuid / filename stem
    pub cli: String,          // "claude" | "droid" | "antigravity"
    pub workspace_path: String,
    pub file_path: String,    // absolute path to session file on disk
    pub size_bytes: u64,
    pub modified_at: String,  // ISO8601, from file metadata
    pub message_count: u64,   // count of lines in JSONL (or messages in JSON)
}
```

Logic:
1. Resolve the CLI's session directory for this workspace path (see path patterns above)
2. List all session files (`.jsonl` for Claude Code, etc.)
3. Return metadata — do NOT read file content here (lazy load)
4. Sort by `modified_at` descending (most recent first)
5. If directory does not exist → return empty vec (not an error)

**`read_cli_session(file_path: String, cli: String) -> Result<Vec<CliSessionMessage>>`**

Reads and returns the content of one session file on demand.

```rust
pub struct CliSessionMessage {
    pub role: String,         // "user" | "assistant" | "tool_result" | "tool_use"
    pub content: String,      // text content or JSON string for tool calls
    pub timestamp: Option<String>,
    pub model: Option<String>,
}
```

Logic for Claude Code (JSONL):
- Read file line by line
- Parse each line as JSON
- Extract role + content + timestamp from the JSONL schema
- Skip internal/system lines (only surface user/assistant/tool messages)
- Return in order

Logic for other CLIs:
- Best-effort parse of their format
- Fallback: return raw file content as a single message with role="raw"

**Security:** Both commands must go through `files.rs::resolve` equivalent — only allow reading from known CLI session directories (`~/.claude/`, `~/.factory/`, `~/.antigravity/`). Reject any path outside these. Never allow reading arbitrary paths.

---

## Frontend — `src/lib/api.ts`

Add types and wrappers:

```typescript
export interface CliSession {
  id: string
  cli: string
  workspacePath: string
  filePath: string
  sizeBytes: number
  modifiedAt: string
  messageCount: number
}

export interface CliSessionMessage {
  role: string
  content: string
  timestamp?: string
  model?: string
}

export const listCliSessions = (workspacePath: string, cli: string) =>
  invoke<CliSession[]>('list_cli_sessions', { workspacePath, cli })

export const readCliSession = (filePath: string, cli: string) =>
  invoke<CliSessionMessage[]>('read_cli_session', { filePath, cli })
```

---

## Frontend — `SessionsView.tsx` (CLI tab only)

Extend the existing CLI tab. Do not touch the Chat tab.

### Current CLI tab
Shows rows from `session_history` SQLite — metadata only, no content.

### Updated CLI tab

**Two sub-views per workspace session row:**

1. **List view (existing + enhanced)**
   - Keep existing rows (CLI badge, workspace, started, duration, running dot)
   - Add: message count from native CLI files (if available)
   - Add: a `>` expand chevron on each row

2. **Expanded session view (new — inline expand, not a new page)**
   - On chevron click → call `listCliSessions(workspace.path, session.cli)`
   - Show list of native CLI sessions for that workspace sorted by date
   - Each native session row: date, message count, size, `Open` button
   - On `Open` → call `readCliSession(filePath, cli)` → show inline message thread below
   - Message thread: simple chat bubble layout (user = right, assistant = left)
   - Tool calls: show collapsed by default with a `[tool: name]` chip, expand on click to show full JSON
   - Loading state while fetching

**Fallback behavior:**
- If `listCliSessions` returns empty (CLI not installed or no sessions for this workspace) → show existing metadata-only row as before with a muted note "No native sessions found"
- Never error the whole page — degrade gracefully per row

**Performance:**
- Do NOT load all sessions on page mount
- Load native sessions only when user expands a row (lazy, on demand)
- Do NOT load session content until user clicks `Open` on a specific session

---

## Settings — CLI session paths (optional, low priority)

If time allows: add a "CLI Session Paths" section under Settings → Account → Terminal.
Let user override the default paths for each CLI if they installed to a non-standard location.
Store in SQLite settings table (existing pattern). Read in `list_cli_sessions` before falling back to defaults.

If not time: skip this — defaults cover 95% of users.

---

## Scope rules — do NOT do these

- Do NOT copy/cache CLI session content into SuperConsole's SQLite — read from disk only, always fresh
- Do NOT sync CLI sessions to Turso — this is private local data, never leaves the machine
- Do NOT touch the Chat tab in SessionsView
- Do NOT hand-edit `components/ui/` (shadcn-managed)
- Do NOT read arbitrary file paths — only known CLI session directories

---

## Done criteria

- `cargo check` passes clean
- `npm run build` passes clean (tsc + vite)
- CLI tab shows native sessions when Claude Code sessions exist for a workspace
- Sessions load lazily (only on row expand)
- Session content loads lazily (only on Open click)
- Graceful fallback when CLI not installed or no sessions found
- No content stored in SQLite or sent to Turso

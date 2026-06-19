# SuperConsole — Chat UI Improvements
## Claude-parity chat experience

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md`, and `DESIGN_PRINCIPLES.md` fully before touching anything.

Key files:
- Frontend: `src/components/ChatView.tsx`, `src/lib/api.ts`, `src/lib/workspace-context.tsx`
- Backend: `src-tauri/src/chat.rs`, `src-tauri/src/db.rs`, `src-tauri/src/lib.rs`

Do NOT rewrite ChatView — extend it.
Match Claude.ai chat behavior as the reference implementation.
`cargo check` and `npm run build` must pass clean before done.

---

## 1. Chat Composer `+` Button Menu

Replace or extend the current chat input area. The composer should match Claude.ai's layout:

```
[+ ] [input field                                    ] [provider·model] [send]
```

The `+` button opens a popover menu (use shadcn `Popover` + `Command` components):

```
┌─────────────────────────────┐
│ + Add files or photos  ⌘U   │  ← file picker via tauri-plugin-dialog
│                             │
│ Skills              →       │  ← submenu: list active skills, click to inject
│ Connectors          ⚠ 2 →  │  ← submenu: toggle connectors on/off for session
│ Commands            →       │  ← submenu: list .superconsole/commands/, click to inject
│ Web search          ✓       │  ← toggle sc_web_search tool on/off
│                             │
│ Tool access         →       │  ← submenu (see below)
└─────────────────────────────┘
```

### Submenus

**Skills submenu:**
- Call `api.listSkills(workspaceId)` → show active skills
- Click a skill → inject `@skill:<name>` into input field as a chip
- "Manage skills" link → opens SkillsDialog

**Connectors submenu:**
- Call `api.listConnectors(workspaceId)` → show connected services
- Toggle switch per connector → enable/disable for this chat session only
- Warning icon (⚠) on connectors with issues
- "Manage connectors" link → opens Settings → Connectors

**Commands submenu:**
- Call `api.listCommands(workspaceId)` → show project slash commands
- Click → inserts `/commandname` into input field
- Autocomplete then handles the rest (existing CommandInput behavior)

**Web search toggle:**
- Checkbox/toggle — default ON if `sc_web_search` is configured
- Persisted per project in localStorage (`superconsole-websearch-{projectId}`)
- When ON → `sc_web_search` tool included in session tool catalog
- When OFF → excluded from catalog for this session

**Tool access submenu:**
```
● Load tools when needed        ← auto mode (bridge, BM25 search)
  Chats compact less since tools aren't pre-loaded.

○ Tools already loaded          ← direct mode (all schemas upfront)  
  Chats compact more often since tools are always there.
```
Maps directly to existing `auto` vs `direct` schema mode in `mcp.rs::exposed_specs`.
Persisted per project in localStorage (`superconsole-toolmode-{projectId}`).
Default: `Load when needed` (auto mode).

### File attachment
"Add files or photos" → `tauri-plugin-dialog` file picker → selected files shown as chips above input.
Supported: `.md`, `.txt`, `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.csv`, `.json`.
Files read via `files.rs` (workspace-sandboxed) and sent as message content.
Images: base64-encoded, sent as image content blocks (Anthropic vision API).
Non-image files: read as text, appended to message content.

---

## 2. Model Switch = New Branch Thread

### Current behavior
One continuous thread per project. Model picker in composer changes model for next message.

### New behavior

When user changes provider OR model in the composer:

Show a small popover/tooltip above the model picker:
```
┌──────────────────────────────────────┐
│ Start new conversation with          │
│ [gpt-4o · OpenAI]?                   │
│                                      │
│ ○ Continue with last 10 messages     │
│ ● Duplicate entire thread            │
│                                      │
│ [Start new]  [Keep current model]    │
└──────────────────────────────────────┘
```

On "Start new":
- Create a new thread (new `thread_id` in `chat_messages`)
- If "last 10 messages" → copy last 10 messages as starting context
- If "duplicate entire thread" → copy all messages
- New thread starts with new model/provider
- Old thread preserved intact, read-only
- Muted header at top of new thread: `"Branched from claude-sonnet-4-6 · {N} messages"`

### Thread navigation

In `ChatView.tsx`, add a thread switcher above the message list:
```
◀ claude-sonnet-4-6  |  gpt-4o (current)  ▶
```
- Left/right arrows navigate between thread branches for this project
- Current thread highlighted
- Clicking a past thread shows it (read-only if not current)
- Only shown when >1 thread exists

### Backend (`db.rs` + `lib.rs`)

Add `thread_id` column to `chat_messages` (idempotent migration):
```sql
ALTER TABLE chat_messages ADD COLUMN thread_id TEXT NOT NULL DEFAULT 'default';
```

Add `chat_threads` table:
```sql
CREATE TABLE IF NOT EXISTS chat_threads (
    id TEXT PRIMARY KEY,           -- ULID
    project_id TEXT NOT NULL,
    name TEXT,                     -- optional user label
    model TEXT,
    provider TEXT,
    parent_thread_id TEXT,         -- NULL for root thread
    branched_at_message INTEGER,   -- message index where branch happened
    created_at TEXT DEFAULT (datetime('now'))
);
```

New commands:
- `list_chat_threads(project_id: String) -> Result<Vec<ChatThread>>`
- `create_chat_thread(project_id: String, parent_id: Option<String>, copy_message_count: Option<i64>, model: String, provider: String) -> Result<ChatThread>`
- `get_active_thread(project_id: String) -> Result<String>` → returns thread_id
- `set_active_thread(project_id: String, thread_id: String) -> Result<()>`

Existing `list_chat_messages` + `add_chat_message` → add `thread_id` param (default `'default'` for backward compat).

Register all in `generate_handler!`.

---

## 3. Session Cost Footer

Add a 12px height footer bar at the very bottom of `ChatView.tsx`, below the composer.

```
[session cost bar — full width, 12px tall, bg-muted/30]
  Session: 12,400 tokens · ~$0.42 · claude-sonnet-4-6    [clear]
```

- Text: `text-[10px] text-muted-foreground`
- Updates after every assistant response (not per-token stream)
- Shows: total tokens (prompt + completion) + estimated cost + current model
- If thread branched: shows cost for current thread only
- `[clear]` resets the session counter (not the message history)
- If no messages yet: hidden (zero height or display:none)

### Cost calculation (frontend, no backend needed)

Parse token counts from the `usage` block already returned by `chat.rs` in the `chat-done` event.
Confirm `chat.rs` emits usage in the `chat-done` event payload:
```rust
// chat-done payload should include:
{ "usage": { "input_tokens": 1234, "output_tokens": 567 } }
```
If not present, add it to the `chat-done` emit in `chat.rs`.

Pricing table (hardcoded in frontend, `src/lib/pricing.ts`):
```typescript
export const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  // per 1M tokens in USD
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'claude-opus-4-6':   { input: 15.0, output: 75.0 },
  'claude-haiku-4-5':  { input: 0.25, output: 1.25 },
  'gpt-4o':            { input: 2.5, output: 10.0 },
  'gpt-4o-mini':       { input: 0.15, output: 0.6 },
  'gemini-2.0-flash':  { input: 0.1, output: 0.4 },
  // add others as needed
}
// fallback: { input: 3.0, output: 15.0 } for unknown models
```

Cost formula:
```typescript
const cost = (inputTokens / 1_000_000 * pricing.input) 
           + (outputTokens / 1_000_000 * pricing.output)
```

Show as `~$0.42` (always estimated, never claimed exact).

---

## 4. sc_web_search Built-in Tool

Add to `mcp.rs` ToolRegistry as an always-available tool (no connector required):

```rust
ToolEntry {
    name: "sc_web_search",
    description: "Search the web for current information",
    schema: json!({
        "type": "object",
        "properties": {
            "query": { "type": "string", "description": "Search query" },
            "limit": { "type": "integer", "description": "Max results (default 5)" }
        },
        "required": ["query"]
    }),
    check_fn: |_ctx| true,  // always available
    requires_connector: None,
}
```

Handler: use Brave Search API or Tavily API.
Read API key from:
1. Project connector `web_search` (if connected) — project-scoped key
2. Account setting `web_search_api_key` in SQLite settings table
3. If neither: return helpful error "Connect a web search API key in Settings → Integrations"

Add `web_search` to the connector registry as an "Integrations" category connector (API key only, no OAuth).
Supported providers in the field config: `brave` (default) or `tavily`.

Result format returned to agent:
```json
{
  "results": [
    { "title": "...", "url": "...", "snippet": "..." }
  ],
  "query": "...",
  "provider": "brave"
}
```

---

## 5. Chat Behavior — Match Claude.ai

Audit `ChatView.tsx` against Claude.ai behavior and fix gaps:

- **Streaming**: text streams token by token into the assistant bubble ✓ (verify working)
- **Stop generation**: add a Stop button (square icon) that appears during streaming, replaces Send button; calls a `stop_chat_stream` command or sets a local abort signal
- **Regenerate**: on the last assistant message, show a regenerate button (↺) on hover; resends the last user message with same model
- **Copy message**: copy icon on hover for each assistant message bubble
- **Edit user message**: pencil icon on hover for user messages; editing resends from that point, creating a new branch (same branch logic as model switch)
- **Message timestamps**: show on hover in muted text
- **Empty state**: when no messages, show centered placeholder:
  ```
  [SuperConsole icon]
  How can I help with [workspace name]?
  
  [Skills available] [Commands] [Web search]  ← quick action chips
  ```
- **Auto-scroll**: scroll to bottom on new message, stop auto-scroll if user scrolls up manually
- **Markdown rendering**: already using react-markdown ✓ (verify code blocks, tables render correctly)

---

## Scope rules

- Do NOT touch PTY/terminal sessions — chat only
- Do NOT build plugin system — placeholder menu item only
- Do NOT change existing `chat_messages` content — only add `thread_id` column
- Do NOT hand-edit `components/ui/` (shadcn-managed)
- Do NOT query Turso on hot path — local SQLite only
- Pricing table is estimates only — label as "~$" everywhere, never "exact"
- `cargo check` and `npm run build` must pass clean

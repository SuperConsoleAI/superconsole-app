# SuperConsole — Context Folder + Commands Folder + Chat Composer Update
## Post Phase 20 / Phase 16 follow-up

Read `CODEBASE.md`, `CLAUDE.md`, `CONTEXT.md`, and `DESIGN_PRINCIPLES.md` fully before touching anything.

Key files:
- Backend: `src-tauri/src/lib.rs`, `src-tauri/src/files.rs`, `src-tauri/src/chat.rs`, `src-tauri/src/pty.rs`, `src-tauri/src/mcp.rs`, `src-tauri/src/db.rs`
- Frontend: `src/components/ChatView.tsx`, `src/components/CommandInput.tsx`, `src/lib/api.ts`

Do NOT rewrite — extend only.
`cargo check` and `npm run build` must pass clean before done.

---

## 1. .superconsole/context/ — On-Demand Project Context

### What it is
Static reference files the user maintains. NOT auto-injected into every session.
Fetched on demand when agent/chat/CLI needs them.
Project-scoped only — lives in the workspace, committed to git.

### Folder structure
```
.superconsole/context/
  brand.md
  about.md
  brand-voice.md
  style-guide.md
  working-style.md
  audience.md
  [user can create any .md file here]
```

### Backend (`lib.rs` + `files.rs`)

**New Tauri commands:**

`list_context_files(workspace_id: String) -> Result<Vec<ContextFile>>`
```rust
pub struct ContextFile {
    pub name: String,       // filename without .md
    pub slug: String,       // kebab-case name
    pub file_path: String,  // absolute path
    pub size_bytes: u64,
    pub modified_at: String,
}
```
- Scans `.superconsole/context/` in workspace root
- Returns all `.md` files
- Returns empty vec if folder doesn't exist (not an error)

`read_context_file(workspace_id: String, slug: String) -> Result<String>`
- Reads `.superconsole/context/<slug>.md`
- Goes through `files.rs::resolve` — sandboxed to workspace

`write_context_file(workspace_id: String, slug: String, content: String) -> Result<()>`
- Writes `.superconsole/context/<slug>.md`
- Creates folder if it doesn't exist
- Goes through `files.rs::resolve`

`delete_context_file(workspace_id: String, slug: String) -> Result<()>`
- Deletes `.superconsole/context/<slug>.md`
- Goes through `files.rs::resolve`

`seed_context_files(workspace_id: String) -> Result<Vec<String>>`
- On first open, check if `.superconsole/context/` is empty or missing
- Scan workspace root for: `README.md`, `CLAUDE.md`, `brand-voice.md`, `AGENTS.md`, `about.md`
- Copy found files into `.superconsole/context/` (rename to slug format)
- Return list of seeded file names
- Do NOT overwrite existing context files

**MCP tools (add to `mcp.rs` ToolRegistry):**

```
context_list()              → list all context files (name + slug + size)
context_read(slug)          → fetch one context file content on demand
context_search(query)       → grep across all context files, return matches
```

These follow the same pattern as `wiki_read` / `skill_view` — agent fetches on demand, never preloaded.

**System prompt (`chat.rs::build_system_prompt`):**
- Add one line to system prompt: `"Context files available: brand, about, brand-voice, style-guide (fetch with context_read)"`
- List names only — never dump content. Agent fetches what it needs.

**PTY injection (`pty.rs`):**
- Do NOT inject context into PTY env vars
- PTY/CLI sessions access context via MCP tools (`context_read`) only
- CLIs that don't use MCP can read files directly from `.superconsole/context/` natively

Register all new commands in `lib.rs::generate_handler!`.

---

## 2. .superconsole/commands/ — Cross-CLI Slash Commands

### What it is
Slash commands that work identically across ALL CLIs and native chat.
Project-scoped. Committed to git. CLI-native (any CLI can read the files directly).

### Folder structure
```
.superconsole/commands/
  ceo-brief.md       ← /ceo
  newsletter.md      ← /newsletter
  social-posts.md    ← /social
  competitor-scan.md ← /competitor
  [user creates more]
```

### Command file format
```markdown
---
name: ceo-brief
slash: /ceo
description: Generate daily CEO briefing
---

Check HEARTBEAT.md for current metrics.
Review recent memory entries.
Write a concise CEO briefing covering:
- Key metrics from yesterday
- Pending decisions
- Top 3 priorities today
Send result to inbox for approval.
```

### Backend (`lib.rs`)

**New Tauri commands:**

`list_commands(workspace_id: String) -> Result<Vec<SlashCommand>>`
```rust
pub struct SlashCommand {
    pub name: String,        // "ceo-brief"
    pub slash: String,       // "/ceo"
    pub description: String,
    pub file_path: String,
}
```
- Scans `.superconsole/commands/` for `.md` files
- Parses YAML frontmatter for `slash` and `description`
- Falls back to filename if no frontmatter

`read_command(workspace_id: String, slash: String) -> Result<String>`
- Finds command by `slash` field (e.g. "/ceo")
- Returns full file content (frontmatter stripped)
- Used by chat to inject command content as user message

`write_command(workspace_id: String, name: String, slash: String, description: String, content: String) -> Result<()>`
- Writes `.superconsole/commands/<name>.md` with frontmatter

`delete_command(workspace_id: String, name: String) -> Result<()>`

Also scan `.claude/commands/` — if it exists, surface those commands in `list_commands` too (read-only, not editable via SuperConsole). Mark them with `source: "claude"` vs `source: "superconsole"`.

Register all in `generate_handler!`.

### Chat integration (`chat.rs`)

When user sends a message starting with `/`:
1. Call `list_commands` for current workspace
2. If slash matches a command → read the command file content
3. Replace the user's `/ceo` message with the full command content
4. Send that as the actual message to the LLM
5. Show in chat UI: user bubble shows `/ceo` (short), not the full content

### CommandInput autocomplete (`CommandInput.tsx`)

`CommandInput.tsx` already handles slash autocomplete for built-ins.
Extend it to also load `.superconsole/commands/` via `api.listCommands(workspaceId)`.
Show both built-in commands AND project commands in autocomplete.
Project commands shown with a small folder icon to distinguish from built-ins.

---

## 3. Memory `+ add` Button Fix

In `MemoryDialog.tsx` the `+ add` button per category does nothing.

Fix: clicking `+ add` on any category opens an inline form directly below that category header:
```
[Title input                    ]
[Content textarea               ]
[Tags: optional                 ]
[Save]  [Cancel]
```

On Save:
- Call `api.writeMemory(workspaceId, { category, title, content, tags })`
- Refresh the memory list
- Collapse the inline form

On Cancel:
- Collapse the inline form, no changes

Do not open a modal/dialog — inline expand only, consistent with the existing list style.

---

## 4. Context UI — TopBar Dialog

Add a new TopBar icon for Context (use `FileText` lucide icon, `strokeWidth={1}`).
Follows the same TopBar dialog pattern as Memory/Wiki/Skills.

Dialog layout:
```
[FileText] Context
Files your agent can reference on demand.
Not injected automatically — fetched when relevant.

[+ New file]  [Seed from workspace]

brand.md          1.2 KB    [Edit] [Delete]
about.md          0.8 KB    [Edit] [Delete]
brand-voice.md    2.1 KB    [Edit] [Delete]
style-guide.md    1.5 KB    [Edit] [Delete]

[empty state if no files: "No context files yet. Add files your agent should know about."]
```

Edit opens a full markdown editor (same as WikiDialog editor — reuse that component).
"Seed from workspace" calls `api.seedContextFiles(workspaceId)` and refreshes.

---

## 5. Commands UI — in Skills Dialog or Separate?

Add a "Commands" tab inside the existing `SkillsDialog` (TopBar Skills icon).
Skills dialog already has tabs/sections — add Commands as a second tab.

Commands tab:
```
Project Commands:

/ceo      Generate daily CEO briefing    [Edit] [Delete]
/newsletter  Draft weekly newsletter     [Edit] [Delete]
/social   Generate social posts          [Edit] [Delete]

[+ New command]

From .claude/commands/ (read-only):
/build    Build the project              
/test     Run tests                      
```

New command form: name + slash + description + content (markdown editor).

---

## Scope rules

- Do NOT auto-inject context files into every session system prompt
- Do NOT make commands global/account-scoped — project only
- Do NOT touch `components/ui/` (shadcn-managed)
- Do NOT modify existing wiki/memory/skills logic
- All file ops go through `files.rs::resolve`
- `cargo check` and `npm run build` must pass clean

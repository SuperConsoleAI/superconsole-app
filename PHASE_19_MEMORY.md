# SuperConsole — Phase 19: Memory
## Date: 2026-06-16

---

## Core Principle: Less Is More

**Quality context over quantity. Powerful grep over big dumps.**

"Each project is an agent in its own right."
Memory is what makes it persistent, learning, improving.
But bloated memory = expensive, noisy, less accurate.

Design rule: ruthless compression. Every memory entry must earn its place.
Agent writes summaries, not transcripts.
Old entries get compressed, not just appended.

---

## What Memory Is (and Isn't)

**Is:**
- Persistent knowledge the agent builds from experience
- Preferences, decisions, facts, patterns learned over sessions
- Injected on demand — NOT dumped into every session

**Is not:**
- Full session transcripts (that's conversation history)
- A copy of the wiki (wiki is structured reference, memory is learned context)
- Automatically fed to every agent turn (fetched when relevant)

---

## Three-Layer Architecture (from businesskit-agent + Karpathy)

```
Layer 1: Raw inbox (agent_notes pattern)
  User drops anything: links, ideas, voice memos, notes
  Agent processes periodically → extracts useful facts
  Never fed to agent directly

Layer 2: Memory (compiled, compressed)
  Agent-maintained rolling knowledge
  Auto-trimmed, de-duplicated, compressed
  Fetched on demand via memory_read(query)

Layer 3: Wiki (structured reference)
  User-curated permanent knowledge (Phase 20)
  Separate from memory — see Phase 20
```

---

## Memory Entry Format

Stored as `.superconsole/memory/` folder in workspace:

```
.superconsole/
  memory/
    preferences.md    ← how user likes things done
    decisions.md      ← key decisions made + why
    facts.md          ← business facts, product info, contacts
    patterns.md       ← what works, what doesn't
    recent.md         ← last 20 significant actions (rolling)
```

Each file is markdown. Small. Focused. Searchable by grep.

**Entry format in each file:**
```markdown
## [2026-06-16] Brand voice preference
User always wants a conversational tone, no jargon.
Blog posts: max 800 words, always end with a question.
Tags: #content #preferences
```

Date-stamped. Tagged. One concept per entry. Short.

---

## Dual-Write Pattern (from businesskit-agent memory.ts)

Every memory write goes to TWO places simultaneously:

```
Agent writes memory
  → 1. Local file (.superconsole/memory/preferences.md)
        works offline, instant, Claude Code reads natively
  
  → 2. Local SQLite (memory table, keyed by project_id)
        fast search, queryable, survives workspace moves
  
  → 3. Turso DB (sync copy — NOT primary storage)
        only metadata + compressed summary
        restores to new machine on sync
        NOT full content (avoid DB bloat)

If Turso fails → local still written (never lose memory)
If local fails → SQLite still written
```

Why this pattern: businesskit-agent proved dual-write in production.
Files for CLI native reading. DB for search and sync. Both always current.

---

## How Memory Gets Written

### Auto (agent writes after sessions)
```
Session ends
  → agent summarizes: what did we do? what was decided?
  → writes 2-5 bullet points to recent.md
  → if new preference detected → writes to preferences.md
  → if new fact learned → writes to facts.md
  → auto-trims recent.md to last 20 entries (rolling)
```

### Manual (user triggers)
```
Memory panel → "Improve memory" button
  → agent sweeps project files + recent sessions
  → updates all memory files
  → compresses old entries
  → removes contradicted facts

Memory panel → edit any entry → save
  → directly edit memory files
```

### Inbox processing (Karpathy pattern)
```
User drops notes into .superconsole/inbox/
  → agent reads periodically
  → extracts useful facts → adds to memory files
  → marks inbox item as processed
  → one source can update multiple memory entries
```

---

## How Agent Reads Memory (On Demand, Never Full Dump)

**Index pattern (token-efficient, from businesskit-agent kb.ts):**

```
1. Agent always has: memory file index (slugs + 1-line summaries)
   Cost: ~50-100 tokens. Always in context.

2. Agent needs specific memory:
   → tool call: memory_read("brand voice")
   → grep/search over memory files → return relevant entries only
   → NOT all memory files at once

3. Agent adds to memory:
   → tool call: memory_write(content, tags)
   → appended to correct file based on tags
```

This is how Karpathy's pattern achieves 70x efficiency over RAG:
read only what's needed, not everything.

---

## Memory Scopes

```
Project memory (default)
  → .superconsole/memory/ in workspace
  → local + SQLite + Turso sync
  → only this project's agent sees it

Org memory (shared across projects)
  → org-level facts agents should know
  → example: "Agency works with SMBs, always invoice net-30"
  → stored in Turso, synced to all projects in org
  → agent can read but not write (owner/admin only writes)
```

---

## Auto-Population on First Open

When workspace first opens with no memory:
```
SuperConsole triggers background memory sweep:
  1. Read README.md, CLAUDE.md, any context files
  2. Extract: what is this project? what does it do? key facts?
  3. Write initial facts.md with extracted knowledge
  4. Mark memory as initialized (not blank anymore)

User never has to manually set up memory.
Agent "knows" the project from day one.
```

---

## Memory UI

```
Workspace sidebar → Memory tab

[Improve brain]  [Wipe memory]  [Refresh]

Categories:
  ▾ Preferences (3 entries)
    Conversational tone, no jargon
    Blog posts max 800 words
    Always end with a question
    [+ add]

  ▾ Recent Actions (20 entries, rolling)
    [2026-06-16] Published weekly newsletter
    [2026-06-15] Updated product prices in store
    [2026-06-14] Ran competitor scan
    [+ add]

  ▾ Key Facts (7 entries)
    Business: Acme Dental, Mumbai
    Owner: Sarah Khan
    Target: Adults 25-45
    [+ add]

  ▾ Decisions (4 entries)
    [2026-06-10] Switched from Mailchimp to Beehiiv
    [+ add]

Search memory: [____________]

Inbox (2 unprocessed):
  Drop notes here → agent processes → adds to memory
```

---

## Storage Summary

```
Primary (always):
  .superconsole/memory/*.md files in workspace
  → files, not DB
  → agent reads natively
  → user can edit in any editor

Fast search:
  Local SQLite: memory_entries (project_id, category, slug, summary, tags, file_path)
  → index only, not full content
  → content always read from file

Sync (not primary):
  Turso: project_memory_index (project_id, category, slug, summary, updated_at)
  → metadata + one-line summaries only
  → allows restore on new machine
  → NOT full memory content (avoids DB bloat)
  → full content restored from workspace files via git/sync
```

---

## "Persistent AI agent that remembers, learns, improves"

Per project = per agent:
```
First session:     agent knows the project (auto-populated from files)
After sessions:    agent remembers what happened (auto-written after each)
Over weeks:        agent learns preferences, patterns, decisions
Over months:       agent improves — old contradicted memory auto-pruned
                   preferences refined, facts updated

Human in loop:     user curates via Memory panel
                   user can wipe, edit, correct anything
                   agent suggests, human approves important writes

Result:            agent that gets better over time
                   without manual context management
                   without expensive vector DBs
                   without bloated prompts
```

---

## Build Order

1. Memory file structure (.superconsole/memory/)
2. Auto-population on workspace first open
3. Memory panel UI (list, edit, wipe, improve)
4. Session-end auto-write (agent summarizes what happened)
5. Inbox processing (user drops notes, agent extracts)
6. SQLite index for fast search
7. Turso sync for index/metadata only
8. MCP tools: memory_read(query), memory_write(content, tags) — Phase 16
9. Org-level memory (shared facts across projects)

# SuperConsole — Phase 20: Wiki
## Date: 2026-06-16

---

## Wiki vs Memory — Clear Distinction

```
Memory:  agent-maintained, learned from experience
         rolling, auto-updated, compressed
         "what the agent learned"

Wiki:    user-curated, structured reference
         permanent until user changes it
         "what the user wants the agent to always know"
```

Wiki = the project's permanent knowledge base.
Memory = the agent's learned experience.
Both live as files. Both fetched on demand.

---

## Structure (Karpathy LLM Wiki Pattern)

Plain markdown files in workspace. No DB for content. No vector store.
Organized for agent readability, not human navigation.

```
.superconsole/wiki/
  _index.md           ← master index (slug + 1-line summary per page)
  about.md            ← what this business/project is
  products.md         ← products, services, pricing
  brand-voice.md      ← tone, style, guidelines
  audience.md         ← target audience, personas
  competitors.md      ← competitor notes
  team.md             ← people, contacts, roles
  guidelines.md       ← content/process rules
  [user creates more]
```

Each page is focused. One topic per file.
10 focused 500-word pages beats 1 bloated 5000-word doc.

---

## Page Format

```markdown
---
slug: brand-voice
title: Brand Voice & Tone
summary: Conversational, warm, no jargon. For adults 25-45.
tags: [content, brand, guidelines]
updated: 2026-06-16
---

## Voice
Conversational and warm. Like a trusted friend who happens
to be an expert. Never corporate, never stiff.

## Tone rules
- Use "you" not "the customer"
- Short sentences. Max 20 words.
- No jargon. If you must use a term, explain it.
- Always end blog posts with a question

## What to avoid
- Exclamation marks (max 1 per piece)
- Passive voice
- Filler words: very, really, quite, just
```

---

## How Agent Reads Wiki (On Demand, Never Full Dump)

```
Agent always has: _index.md (slugs + 1-line summaries)
  Cost: ~100-200 tokens for 20 pages. Always in context.
  Agent reads index → decides what page to fetch

Agent needs specific page:
  → tool call: wiki_read("brand-voice")
  → returns that page only
  → NOT all wiki files at once

Agent searches:
  → tool call: wiki_search("tone guidelines")
  → grep over pages → returns relevant excerpts only
```

_index.md is the key. Agent reads index first, fetches only what it needs.
Same pattern Karpathy uses. 70x more efficient than loading everything.

---

## Writing to Wiki

User writes (primary):
  Wiki panel → New Page → markdown editor → Save

Agent suggests (human always in loop):
  → tool call: wiki_suggest(title, content)
  → goes to inbox: "Wiki suggestion: Products page"
  → user reviews → approve or reject
  → agent NEVER writes to wiki without approval

Import:
  → paste markdown, upload .md, import from Notion export

---

## Storage

Files primary, DB for index only. Same principle as memory.

```
Primary:
  .superconsole/wiki/*.md in workspace
  → plain markdown, any CLI reads natively
  → Claude Code reads directly, zero integration

Index (fast lookup):
  Local SQLite: wiki_pages (project_id, slug, title, summary, file_path)
  → index only, content stays in file

Sync:
  Turso: wiki_index (project_id, slug, title, summary, updated_at)
  → metadata only for personal projects
  → full content synced for team projects (wiki is structured + predictable size)
```

---

## Auto-Seed on First Open

Wiki is empty? SuperConsole scans for:
README.md, CLAUDE.md, brand-voice.md, docs/, any context files
→ Reformats into wiki pages (not just copied)
→ User reviews and approves

---

## UI

```
Workspace sidebar → Wiki tab

[+ New Page]  [Import]

Pages:
  📄 About the Business
  📄 Products & Services
  📄 Brand Voice & Tone   ← most used
  📄 Target Audience
  📄 Competitors
  📄 Content Guidelines

Inbox (1 suggestion):
  ✨ "Pricing Page" from agent   [Review] [Dismiss]

[Search wiki...]
```

---

## Build Order

1. Wiki file structure (.superconsole/wiki/ + _index.md)
2. Auto-seed from existing workspace files
3. Wiki panel UI (list, create, edit, search, import)
4. Agent suggestion → inbox → approve/reject flow
5. _index.md auto-maintained on any page change
6. SQLite index
7. Turso sync (metadata for personal, full content for team)
8. MCP tools: wiki_list, wiki_read, wiki_search, wiki_suggest (Phase 16)

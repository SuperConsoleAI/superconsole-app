# SuperConsole — Phase 18: Skills
## Date: 2026-06-16

---

## What Skills Are

Reusable agent capabilities per project.
Not repo-specific. Built into SuperConsole.
Any user, any project, any CLI.

A skill = a markdown file with instructions the agent follows.
Same pattern as `.claude/commands/` but SuperConsole-managed,
scoped per project, available via MCP tool call on demand.

---

## Three Levels, No Auto-Inheritance

```
Account level    → your personal skill library
                   skills you've built over time
                   NOT auto-available in projects

Project level    → skills explicitly activated for this project
                   user adds from account library OR creates new
                   ONLY these are available to the agent

Org level        → shared skills across all org projects
                   admin sets these, propagate down
                   project can override with its own version
```

**No overblot rule:** project never inherits all account skills.
User explicitly assigns which skills are active per project.
Agent only sees skills that are active for the current project.

---

## Skill File Format

Stored as `.superconsole/skills/skill-name.md` in workspace:

```markdown
---
name: write-blog-post
description: Write SEO-optimized blog posts for this business
tags: [content, seo, writing]
scope: project
version: 1
---

## Instructions
Write a blog post following the brand voice in memory.
Check wiki for product details before writing.
Always include: title, meta description, 3-5 headings, CTA.

## Context needed
- brand-voice (from memory or wiki)
- target keyword (from user prompt)
- product context (from wiki/Products page)

## Output format
Return as markdown with frontmatter.
Add to inbox for approval before publishing.
```

Short. Focused. No padding.
**Less is more — quality context over quantity.**

---

## Four Ways to Add Skills

### 1. Create from scratch
Skills panel → New Skill → name + instructions → Save
Saved to `.superconsole/skills/` in workspace

### 2. Install from curated list
Skills panel → Browse → SuperConsole skill library
One click → downloads to workspace
Start with 20 built-in skills (content, dev, research, ops)

### 3. Import from GitHub/URL
Skills panel → Import → paste GitHub URL
Fetches SKILL.md, skill.md, or .claude/commands/ files
Imports into project skill library

### 4. Auto-detect from repo
On workspace open → scan for `.claude/commands/`, `AGENTS.md`
→ surface existing skills in panel automatically
→ user chooses which to activate

---

## How Agent Accesses Skills (On Demand)

Via MCP tool calls (Phase 16). Never preloaded:

```
Agent starts session
  → system prompt mentions: "Skills available: write-blog-post, seo-audit, ..."
  → NOT the full skill content — just the names

Agent needs a skill:
  → tool call: skill_view("write-blog-post")
  → SuperConsole reads the file, returns content
  → Agent follows instructions
  → skill content NOT permanently in context
```

Token cost: skill name in prompt (~5 tokens) not full skill (~200 tokens).
Agent fetches only what it needs for the current task.

---

## Skill Execution Modes

```
Manual:   User types /skill-name or @skill:name in chat
          → injects skill into active session

Suggested: Agent detects task matches a skill
           → "I see you want to write a blog post.
              Use skill: write-blog-post? [Yes/No]"

Automatic: Skill marked auto=true in frontmatter
           → agent uses it whenever conditions match
           → user sees it used in session output
```

---

## Storage

```
Workspace folder (primary):
  .superconsole/skills/skill-name.md
  → files on disk, readable by any CLI
  → Claude Code can read them natively
  → Droid can read them natively
  → gitignored by default (personal config)
  → user can commit to repo if they want to share

Local SQLite (index only — fast lookup):
  project_skills (project_id, skill_name, file_path, tags, active)
  → just the index, not the content
  → content always read from file on demand

Turso (skill metadata only — sync across devices):
  project_skill_index (project_id, skill_name, tags, scope)
  → NOT the content, just what exists
  → content stays in workspace files
```

Why files not DB for content:
- Claude Code reads files natively — zero extra integration
- Droid reads files natively — same
- Files are portable, version-controllable, human-readable
- DB stores metadata/index only for fast search
- Same pattern Karpathy recommends for LLM wikis

---

## UI

```
Workspace sidebar → Skills tab

My Skills (active for this project):
  ● write-blog-post     content, seo    [Run] [Edit] [Remove]
  ● seo-audit           seo, analysis   [Run] [Edit] [Remove]
  ● competitor-scan     research        [Run] [Edit] [Remove]

[+ Add Skill]

Browse Library:
  Search skills...
  Filter: [All] [Content] [Dev] [Research] [Ops]

  SuperConsole Built-in:
    write-blog-post      One-click install
    seo-audit            One-click install
    social-post-writer   One-click install
    code-review          One-click install
    [20 built-in skills]

  Community:  [coming later]
```

---

## Built-in Skill Library (Ship With App)

**Content:**
write-blog-post, social-post-writer, newsletter-draft,
email-writer, product-description, press-release

**Research:**
competitor-scan, market-research, seo-keyword-research,
summarize-document, web-research

**Dev:**
code-review, write-tests, debug-helper,
api-documentation, refactor-suggestion

**Ops:**
weekly-report, meeting-notes, task-breakdown,
project-status, ceo-brief-template

---

## Build Order

1. Skill file format + workspace scanner (detect existing skills)
2. Skills panel UI (list, add, edit, remove, activate)
3. Skill library (20 built-in, one-click install)
4. Import from URL/GitHub
5. MCP tool: skill_list, skill_view (Phase 16 dependency)
6. Auto-detect from .claude/commands/ on workspace open
7. Suggested mode (agent detects relevant skill)

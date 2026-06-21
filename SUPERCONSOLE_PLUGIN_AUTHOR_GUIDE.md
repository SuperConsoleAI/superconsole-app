# Add SuperConsole support to your repo

If your project already ships a `.claude/`, `.claude-plugin/`, or just a plain
README, you can make it a first-class **SuperConsole agent** by adding one small
folder: `.superconsole-plugin/`.

SuperConsole users import your repo and get a ready-to-run agent (instructions +
skills + connectors), the same way Claude users add a plugin. You opt in by
describing your agent so SuperConsole doesn't have to guess.

> TL;DR: drop a `.superconsole-plugin/plugin.json` next to whatever you already
> have. Everything below is just the field spec and per-case examples.

---

## The manifest

`.superconsole-plugin/plugin.json` (single agent):

```json
{
  "name": "your-agent",
  "description": "One line on what the agent does",
  "category": "ecommerce",
  "image": "https://cdn.example.com/logo.png",
  "connectors": ["shopify"],
  "tags": ["graphql", "liquid"],
  "basePath": "",
  "instructions": "AGENTS.md",
  "skills": [],
  "files": []
}
```

All keys are **camelCase**. Everything except `name` is optional.

| Field          | Type     | Meaning |
|----------------|----------|---------|
| `name`         | string   | **Required.** Agent id; sanitized to lowercase `a-z0-9-`. |
| `description`  | string   | One-line summary (first sentence, ≤140 chars is kept). |
| `category`     | string   | Single library category (e.g. `ecommerce`, `devtools`). |
| `image`        | string   | Logo URL. Defaults to your GitHub owner avatar. |
| `connectors`   | string[] | Connector services the agent uses (e.g. `shopify`, `github`). |
| `tags`         | string[] | Search tags (also accepts `keywords`); capped at 3. |
| `basePath`     | string   | Sub-path if the agent isn't at the repo root. All other paths are relative to it. |
| `instructions` | string   | Path to the file used as the agent's instructions (e.g. `AGENTS.md`, `CLAUDE.md`, `README.md`). |
| `skills`       | string[] | Explicit skill paths. Leave empty to auto-detect `skills/<name>/SKILL.md`. |
| `files`        | string[] | Extra files to ship. Use `src>dest` to rename (e.g. `README.md>agent.md`). |

Multiple agents in one repo? Use `.superconsole-plugin/marketplace.json`:

```json
{
  "agents": [
    { "name": "admin", "description": "...", "instructions": "agents/admin/AGENTS.md", "basePath": "agents/admin" },
    { "name": "theme", "description": "...", "instructions": "agents/theme/AGENTS.md", "basePath": "agents/theme" }
  ]
}
```

---

## Case 1 — you have `.claude/` (a CLAUDE.md-based project)

Your repo uses `CLAUDE.md` for instructions and maybe a `skills/` folder. Add:

```
.superconsole-plugin/
  plugin.json
```

```json
{
  "name": "my-project",
  "description": "What this agent does",
  "instructions": "CLAUDE.md"
}
```

SuperConsole uses `CLAUDE.md` as the agent's instructions and auto-imports any
`skills/<name>/SKILL.md` folders. Nothing else to change.

---

## Case 2 — you have `.claude-plugin/` (a Claude marketplace plugin)

You already ship a manifest for Claude. Add the SuperConsole equivalent next to
it; the fields map almost 1:1:

```
.claude-plugin/
  plugin.json        # existing
.superconsole-plugin/
  plugin.json        # new — same name/description, add category + connectors
```

```json
{
  "name": "shopify-ai-toolkit",
  "description": "Search Shopify docs and validate GraphQL, Liquid, and extension code",
  "category": "ecommerce",
  "connectors": ["shopify"],
  "tags": ["graphql", "liquid", "storefront"],
  "instructions": "AGENTS.md"
}
```

If you have a Claude `marketplace.json` with multiple plugins, mirror it as
`.superconsole-plugin/marketplace.json` with an `agents` array (the `plugins`
key is also accepted for drop-in compatibility).

> Note: even with no SuperConsole folder, SuperConsole will fall back to reading
> your `.claude-plugin/` manifest. Adding `.superconsole-plugin/` just lets you
> set SuperConsole-specific fields like `category` and `connectors`.

---

## Case 3 — neither (a plain repo with README/AGENTS.md)

No manifest at all? SuperConsole still works: it builds one agent from
`AGENTS.md` / `CLAUDE.md` / `README.md` plus any `skills/` folders. To make it
exact, add:

```
.superconsole-plugin/
  plugin.json
```

```json
{
  "name": "my-repo",
  "description": "One line on what this does",
  "instructions": "README.md"
}
```

---

## What SuperConsole does on import

- **Add to library**: creates a catalog entry from your manifest (name,
  description, category, image, connectors, tags, skills).
- **Import into a project**: `git clone`s your repo into a new project, generates
  a runnable `agent.md` from your instructions, and imports **all** skills.

### Skills convention

A skill is a folder under `skills/` with a `SKILL.md`:

```
skills/
  my-skill/
    SKILL.md
    assets/...
    scripts/...
```

The folder name is the skill name. Catalog entries keep up to 20 skill names; a
direct project import copies every skill.

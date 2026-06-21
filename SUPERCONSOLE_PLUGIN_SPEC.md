# `.superconsole-plugin` spec

How a repository declares one or more SuperConsole agents, so authors control
the import instead of letting SuperConsole guess from the README. This mirrors
the `.claude-plugin/` layout: a folder at the repo root with a manifest JSON.

SuperConsole reads manifests in this order and uses the first match:

1. `.superconsole-plugin/marketplace.json` (multiple agents)
2. `.claude-plugin/marketplace.json` (Claude fallback)
3. `.superconsole-plugin/plugin.json` (single agent)
4. `.claude-plugin/plugin.json` (Claude fallback)
5. **Auto-detect** — no manifest: build one agent from `AGENTS.md` / `CLAUDE.md`
   / `README.md` (instructions) + the `skills/` folder.

So a manifest is optional; it only exists to make detection exact.

## Single agent — `.superconsole-plugin/plugin.json`

```json
{
  "name": "shopify-ai-toolkit",
  "description": "Search Shopify docs and validate GraphQL, Liquid, and extension code",
  "category": "ecommerce",
  "image": "https://cdn.brandfetch.io/shopify.com",
  "connectors": ["shopify"],
  "tags": ["graphql", "liquid", "storefront"],
  "keywords": ["shopify", "admin api"],
  "basePath": "",
  "instructions": "AGENTS.md",
  "skills": [],
  "files": []
}
```

### Fields (all optional unless noted)

| Field          | Type       | Meaning |
|----------------|------------|---------|
| `name`         | string     | **Required.** Agent id. Sanitized to lowercase `a-z0-9-`. Defaults to the repo name if omitted. |
| `description`  | string     | One-line summary. Trimmed to the first sentence (≤140 chars) on import. |
| `category`     | string     | Single category used for the library facet (e.g. `ecommerce`). |
| `image`        | string     | Logo URL. Falls back to the GitHub owner avatar. |
| `connectors`   | string[]   | Connector services this agent uses (must match the connector registry). |
| `tags`         | string[]   | Search tags. Merged with `keywords`, deduped, capped at 3. |
| `keywords`     | string[]   | Alias for `tags` (Claude compatibility). |
| `basePath`     | string     | Repo sub-path the agent lives under, if not the repo root. All `instructions`/`skills`/`files` paths are relative to this. |
| `instructions` | string     | Path to the file used as the agent's instructions body (e.g. `AGENTS.md`). Frontmatter is stripped. |
| `skills`       | string[]   | Explicit skill file/dir paths. If empty, SuperConsole auto-detects `skills/<name>/SKILL.md` folders. |
| `files`        | string[]   | Extra files to ship with the agent. Each entry may use `src>dest` to rename on install (e.g. `README.md>agent.md`). |

All keys are **camelCase**.

## Multiple agents — `.superconsole-plugin/marketplace.json`

```json
{
  "agents": [
    { "name": "shopify-admin", "description": "...", "category": "ecommerce", "instructions": "agents/admin/AGENTS.md", "basePath": "agents/admin" },
    { "name": "shopify-theme", "description": "...", "category": "ecommerce", "instructions": "agents/theme/AGENTS.md", "basePath": "agents/theme" }
  ]
}
```

Each entry is a full `plugin.json` object. Claude-style files that list entries
under `"plugins"` instead of `"agents"` are also accepted.

## Skills

A skill is a folder under `skills/` containing a `SKILL.md`:

```
skills/
  shopify-admin/
    SKILL.md
    assets/...
    scripts/...
```

- The folder name (`shopify-admin`) is the skill name.
- Catalog rows store at most **20** skill names and **10** install files.
- A direct **Import from repo → new project** clones the whole repo and imports
  **all** skills (no cap).

## What import produces

- **Add to catalog** (library): a curated row with the metadata above; install
  later fetches the listed files from GitHub raw.
- **Import from repo** (new project): a full `git clone` of the repo into the
  project, plus a generated `.superconsole/agents/<name>/agent.md` and every
  skill copied into `.superconsole/skills/`.

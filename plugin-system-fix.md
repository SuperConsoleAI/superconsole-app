Yes fix it now before it becomes a mess. Here's the clean separation:

**The correct design:**

```
id columns  = references to catalog tables (lookup, display)
url columns = what actually gets used during install

skill_ids     = ["skill-catalog-id-1", "skill-catalog-id-2"]  ← catalog refs only
skills_url    = ["https://github.com/...skills/supabase"]      ← install source

command_ids   = ["cmd-id-1"]                                   ← catalog refs only  
commands_url  = ["https://github.com/.../commands/update.md"]  ← install source

mcp_ids       = ["supabase", "supabase-management"]            ← catalog refs only
mcp_url       = MISSING ← add this column

connector_ids = ["supabase"]                                   ← catalog refs (already clean)
```

**MCP is different from skills/commands** because it's not just a URL — it has install type:

```
mcp_url column = JSON array of MCP configs:
[
  {
    "id": "supabase",
    "type": "http",
    "url": "https://mcp.supabase.com/mcp"
  },
  {
    "id": "supabase-management", 
    "type": "npx",
    "package": "@supabase/mcp@latest",
    "env": {"SUPABASE_ACCESS_TOKEN": ""}
  }
]
```

**So the full clean column set:**

```sql
-- Reference columns (catalog lookup, display only)
skill_ids      TEXT DEFAULT '[]'   -- ["catalog-id-1", "catalog-id-2"]
agent_ids      TEXT DEFAULT '[]'   -- ["agent-catalog-id"]
mcp_ids        TEXT DEFAULT '[]'   -- ["mcp-catalog-id-1", "mcp-catalog-id-2"]
command_ids    TEXT DEFAULT '[]'   -- ["cmd-catalog-id"]
hook_ids       TEXT DEFAULT '[]'   -- ["hook-catalog-id"]
connector_ids  TEXT DEFAULT '[]'   -- ["supabase", "gmail"]

-- Install source columns (what actually gets fetched/executed)
skills_url     TEXT DEFAULT '[]'   -- ["https://github.com/.../skills/name"]
commands_url   TEXT DEFAULT '[]'   -- ["https://github.com/.../commands/name.md"]
hooks_url      TEXT DEFAULT '[]'   -- ["https://github.com/.../hooks/session-end.sh"]
mcp_url        TEXT DEFAULT '[]'   -- [{id, type, url/package, env}]  ← ADD THIS
```

**Fix needed:**

1. Add `mcp_url` column to plugins table in Turso (Drizzle migration)
2. Add `mcp_url` column to `plugins_cache` in local SQLite
3. Move MCP config objects OUT of `mcp_ids` INTO `mcp_url`
4. `mcp_ids` becomes clean string array of catalog IDs only
5. Update the Publish Plugin form to have separate MCP URL field
6. Update `install_plugin` to read from `mcp_url` not `mcp_ids`

**Fix the existing Supabase row:**

```json
mcp_ids: ["supabase"]
mcp_url: [{"id": "supabase", "type": "http", "url": "https://mcp.supabase.com/mcp"}]
```

Fix this in Turso directly then update the app code. Want me to write the migration + code fix instruction for Droid?

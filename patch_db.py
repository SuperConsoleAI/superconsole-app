import sys

def patch_db():
    with open('src-tauri/src/db.rs', 'r') as f:
        content = f.read()

    # 1. Update plugins_cache
    if 'rules_url TEXT' not in content:
        content = content.replace(
            "hooks_url TEXT NOT NULL DEFAULT '[]',",
            "hooks_url TEXT NOT NULL DEFAULT '[]',\n                rules_url TEXT NOT NULL DEFAULT '[]',\n                rule_ids TEXT NOT NULL DEFAULT '[]',"
        )

    # 2. Update installed_plugins_cache
    if 'skill_ids TEXT' not in content.split('CREATE TABLE IF NOT EXISTS installed_plugins_cache')[1].split(';')[0]:
        content = content.replace(
            "mcp_url TEXT NOT NULL DEFAULT '[]'",
            "mcp_url TEXT NOT NULL DEFAULT '[]',\n                skill_ids TEXT NOT NULL DEFAULT '[]',\n                mcp_ids TEXT NOT NULL DEFAULT '[]',\n                command_ids TEXT NOT NULL DEFAULT '[]',\n                hook_ids TEXT NOT NULL DEFAULT '[]',\n                rule_ids TEXT NOT NULL DEFAULT '[]',\n                connector_ids TEXT NOT NULL DEFAULT '[]',\n                rules_url TEXT NOT NULL DEFAULT '[]'"
        )

    # 3. Add rules_catalog_cache table
    rules_catalog_cache = """
            CREATE TABLE IF NOT EXISTS rules_catalog_cache (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                description TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                author TEXT NOT NULL DEFAULT '',
                framework TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]',
                github_url TEXT NOT NULL DEFAULT '',
                content TEXT NOT NULL DEFAULT '',
                install_count INTEGER NOT NULL DEFAULT 0,
                featured INTEGER NOT NULL DEFAULT 0
            );"""
            
    if 'CREATE TABLE IF NOT EXISTS rules_catalog_cache' not in content:
        # insert after mcp_catalog_cache
        content = content.replace(
            "mcp_catalog_cache(name);",
            "mcp_catalog_cache(name);" + rules_catalog_cache
        )

    # 4. Add content column to existing _catalog_cache tables
    catalogs = [
        "agent_catalog_cache",
        "connector_catalog_cache",
        "mcp_catalog_cache",
        "commands_catalog_cache",
        "hooks_catalog_cache"
    ]
    for catalog in catalogs:
        # simplistic replace: find 'github_url TEXT NOT NULL DEFAULT ''' inside the table definition
        table_start = content.find(f"CREATE TABLE IF NOT EXISTS {catalog}")
        if table_start != -1:
            table_end = content.find(");", table_start)
            table_def = content[table_start:table_end]
            if "content TEXT" not in table_def:
                new_table_def = table_def.replace(
                    "github_url TEXT NOT NULL DEFAULT '',",
                    "github_url TEXT NOT NULL DEFAULT '',\n                content TEXT NOT NULL DEFAULT '',"
                )
                content = content.replace(table_def, new_table_def)

    # 5. Update PluginCacheEntry struct
    if 'pub rules_url: String' not in content:
        content = content.replace(
            "pub hooks_url: String,",
            "pub hooks_url: String,\n    pub rules_url: String,\n    pub rule_ids: String,"
        )

    with open('src-tauri/src/db.rs', 'w') as f:
        f.write(content)

if __name__ == '__main__':
    patch_db()
    print("Patched db.rs successfully.")

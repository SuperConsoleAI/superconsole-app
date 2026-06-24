sed -i '' 's/pub hook_count: usize,/pub hook_count: usize,\n    pub skill_ids: String,\n    pub mcp_ids: String,\n    pub command_ids: String,\n    pub github_url: Option<String>,\n    pub docs_url: Option<String>,/' src-tauri/src/plugins.rs

cat << 'INNER_EOF' >> patch_api.py
import re

with open("src/lib/api.ts", "r") as f:
    content = f.read()

# Add to PluginListItem interface
content = re.sub(
    r"hookCount: number;",
    r"hookCount: number;\n  skillIds: string;\n  mcpIds: string;\n  commandIds: string;\n  githubUrl?: string | null;\n  docsUrl?: string | null;",
    content
)

with open("src/lib/api.ts", "w") as f:
    f.write(content)
INNER_EOF
python3 patch_api.py

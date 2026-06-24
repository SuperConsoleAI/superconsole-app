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

const fs = require('fs');
let content = fs.readFileSync('src/components/libraryx/PublishPluginDialog.tsx', 'utf8');

// Inside `setForm`, we need to load skillsUrl, mcpUrl, commandsUrl
content = content.replace(
  'skillIds: p.skillIds || "[]",',
  'skillIds: p.skillIds || "[]",\n        skillsUrl: p.skillsUrl || "[]",\n        mcpUrl: p.mcpUrl || "[]",\n        commandsUrl: p.commandsUrl || "[]",\n        hooksUrl: p.hooksUrl || "[]",'
);

// We need to add initial states to form
content = content.replace(
  'commandIds: "[]",',
  'commandIds: "[]",\n    skillsUrl: "[]",\n    mcpUrl: "[]",\n    commandsUrl: "[]",\n    hooksUrl: "[]",'
);

// Now the Skills onChange:
content = content.replace(
  /onChange=\{\(ids: string\[\]\) => \{\s*const data = ids\.map\(\(id\) => \{\s*const s = skillsCat\.find\(x => x\.id === id\);\s*\/\/ ONLY grabbing the ID and the GitHub URL!\s*return s \? \{ id: s\.id, github_url: s\.githubUrl \} : \{ id \};\s*\}\);\s*set\("skillIds", JSON\.stringify\(data\)\);\s*\}\}/,
  `onChange={(ids: string[]) => {
                set("skillIds", JSON.stringify(ids));
                const urls = ids.map(id => {
                  const s = skillsCat.find(x => x.id === id);
                  return s && s.githubUrl ? s.githubUrl : null;
                }).filter(Boolean);
                set("skillsUrl", JSON.stringify(urls));
              }}`
);

// Fallback for old skills onChange if the regex above didn't match (it might not because I modified it)
content = content.replace(
  /onChange=\{\(ids: string\[\]\) => \{\s*const data = ids\.map\(\(id\) => \{\s*const s = skillsCat\.find\(x => x\.id === id\);\s*return s \? \{ id: s\.id, github_url: s\.githubUrl \} : \{ id \};\s*\}\);\s*set\("skillIds", JSON\.stringify\(data\)\);\s*\}\}/,
  `onChange={(ids: string[]) => {
                set("skillIds", JSON.stringify(ids));
                const urls = ids.map(id => {
                  const s = skillsCat.find(x => x.id === id);
                  return s && s.githubUrl ? s.githubUrl : null;
                }).filter(Boolean);
                set("skillsUrl", JSON.stringify(urls));
              }}`
);

// MCPs onChange:
content = content.replace(
  /onChange=\{\(ids: string\[\]\) => \{\s*const data = ids\.map\(\(id\) => \{\s*const m = mcpCat\.find\(x => x\.id === id\);\s*return m \? \{ id: m\.id, install_command: m\.installCommand, install_args: m\.installArgs \} : \{ id \};\s*\}\);\s*set\("mcpIds", JSON\.stringify\(data\)\);\s*\}\}/,
  `onChange={(ids: string[]) => {
                set("mcpIds", JSON.stringify(ids));
                const urls = ids.map(id => {
                  const m = mcpCat.find(x => x.id === id);
                  if (m && m.installCommand === "npx") {
                    return { id: m.id, type: "npx", package: m.githubUrl || "", env: m.installArgs ? JSON.parse(m.installArgs) : {} };
                  } else if (m) {
                    return { id: m.id, type: "stdio", command: m.installCommand, args: m.installArgs ? JSON.parse(m.installArgs) : [], env: {} };
                  }
                  return null;
                }).filter(Boolean);
                set("mcpUrl", JSON.stringify(urls));
              }}`
);

// Commands onChange:
content = content.replace(
  /onChange=\{\(ids: string\[\]\) => \{\s*const data = ids\.map\(\(id\) => \{\s*const c = commandsCat\.find\(x => x\.id === id\);\s*return c \? \{ id: c\.id, github_url: c\.githubUrl, content: c\.content \} : \{ id \};\s*\}\);\s*set\("commandIds", JSON\.stringify\(data\)\);\s*\}\}/,
  `onChange={(ids: string[]) => {
                set("commandIds", JSON.stringify(ids));
                const urls = ids.map(id => {
                  const c = commandsCat.find(x => x.id === id);
                  return c && c.githubUrl ? c.githubUrl : null;
                }).filter(Boolean);
                set("commandsUrl", JSON.stringify(urls));
              }}`
);

// also for selectedIds it must parse safely since we changed it back to string arrays!
content = content.replace(
  /return JSON\.parse\(form\.skillIds\)\.map\(\(x: any\) => typeof x === 'string' \? x : x\.id\);/g,
  `return JSON.parse(form.skillIds);`
);
content = content.replace(
  /return JSON\.parse\(form\.mcpIds\)\.map\(\(x: any\) => typeof x === 'string' \? x : x\.id\);/g,
  `return JSON.parse(form.mcpIds);`
);
content = content.replace(
  /return JSON\.parse\(form\.commandIds\)\.map\(\(x: any\) => typeof x === 'string' \? x : x\.id\);/g,
  `return JSON.parse(form.commandIds);`
);

fs.writeFileSync('src/components/libraryx/PublishPluginDialog.tsx', content);

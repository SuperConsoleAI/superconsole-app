const fs = require('fs');

// 1. router.tsx
let router = fs.readFileSync('src/router.tsx', 'utf8');
router = router.replace(/workspace=\{settingsActive \? null : activeWorkspace\}/, 'workspace={settingsActive ? null : (activeWorkspace ?? workspaces.find(w => w.id === Number((search as any).ws)) ?? null)}');
fs.writeFileSync('src/router.tsx', router);

// 2. TopBar.tsx
let topbar = fs.readFileSync('src/components/TopBar.tsx', 'utf8');
topbar = topbar.replace(/<div className="ml-1 flex min-w-0 cursor-default items-center gap-1\.5">/, '<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex min-w-0 cursor-default items-center gap-1.5 pointer-events-auto">');
fs.writeFileSync('src/components/TopBar.tsx', topbar);

// 3. CustomizePage.tsx
let custom = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');
custom = custom.replace(/\{scope\?\.type === "project" && \([\s\S]*?<\/div>\n        \)\}\n\n/, '');
fs.writeFileSync('src/components/CustomizePage.tsx', custom);


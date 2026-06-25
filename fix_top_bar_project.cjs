const fs = require('fs');

// 1. Update TopBar.tsx
let topbar = fs.readFileSync('src/components/TopBar.tsx', 'utf8');
topbar = topbar.replace(/interface TopBarProps \{/, 'interface TopBarProps {\n  isProjectPage?: boolean;');
topbar = topbar.replace(/onToggleSidebar,\n\}: TopBarProps\) \{/, 'onToggleSidebar,\n  isProjectPage,\n}: TopBarProps) {');
topbar = topbar.replace(/<div className="ml-auto flex items-center gap-0\.5">\n        \{workspace && \(/, '<div className="ml-auto flex items-center gap-0.5">\n        {workspace && isProjectPage && (');
fs.writeFileSync('src/components/TopBar.tsx', topbar);

// 2. Update router.tsx
let router = fs.readFileSync('src/router.tsx', 'utf8');
router = router.replace(/workspace=\{settingsActive \? null : \(activeWorkspace \?\? workspaces\.find\(w => w\.id === Number\(\(search as any\)\.ws\)\) \?\? null\)\}/, 'workspace={settingsActive ? null : (activeWorkspace ?? workspaces.find(w => w.id === Number((search as any).ws)) ?? null)}\n        isProjectPage={!!activeWorkspace}');
fs.writeFileSync('src/router.tsx', router);


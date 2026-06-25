const fs = require('fs');

let topbar = fs.readFileSync('src/components/TopBar.tsx', 'utf8');

topbar = topbar.replace(/<FolderOpen className="h-3\.5 w-3\.5 shrink-0 text-primary" strokeWidth=\{1\} \/>\n\s*/, '');
topbar = topbar.replace(/<span className="truncate text-\[13px\] font-medium">\{workspace\.name\}<\/span>/, '<span className="truncate text-xs font-medium">{workspace.name}</span>');

fs.writeFileSync('src/components/TopBar.tsx', topbar);


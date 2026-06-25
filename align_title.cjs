const fs = require('fs');

let topbar = fs.readFileSync('src/components/TopBar.tsx', 'utf8');

topbar = topbar.replace(
  /<div className="absolute left-1\/2 top-1\/2 -translate-x-1\/2 -translate-y-1\/2 flex min-w-0 cursor-default items-center gap-1\.5 pointer-events-auto">/,
  `<div className={cn(
              "flex min-w-0 cursor-default items-center gap-1.5 pointer-events-auto",
              !sidebarOpen && "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            )}>`
);

fs.writeFileSync('src/components/TopBar.tsx', topbar);

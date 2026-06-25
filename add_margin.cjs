const fs = require('fs');

let topbar = fs.readFileSync('src/components/TopBar.tsx', 'utf8');

topbar = topbar.replace(
  /"absolute left-1\/2 top-1\/2 -translate-x-1\/2 -translate-y-1\/2"/,
  '"absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",\n              sidebarOpen && "ml-4"'
);

fs.writeFileSync('src/components/TopBar.tsx', topbar);

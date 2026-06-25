const fs = require('fs');

let topbar = fs.readFileSync('src/components/TopBar.tsx', 'utf8');

topbar = topbar.replace(
  /\{workspace\.name\} \{titleSuffix && <span className="text-muted-foreground font-normal">— \{titleSuffix\}<\/span>\}/,
  `{workspace.name}{titleSuffix ? \` — \${titleSuffix}\` : ""}`
);

fs.writeFileSync('src/components/TopBar.tsx', topbar);

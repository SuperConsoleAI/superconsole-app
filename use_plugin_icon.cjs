const fs = require('fs');

let code = fs.readFileSync('src/components/SettingsPage.tsx', 'utf8');

if (!code.includes('import { PluginIcon }')) {
  code = code.replace(
    'import { Plug } from "lucide-react";',
    'import { PluginIcon } from "./PluginIcon";\nimport { Plug } from "lucide-react";'
  );
}

// Replace the <Plug className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} /> logic
code = code.replace(
  '<div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">\n                  <Plug className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />\n                </div>',
  '<PluginIcon pluginId={c.id} size={32} className="h-10 w-10 p-1 bg-transparent" />'
);

fs.writeFileSync('src/components/SettingsPage.tsx', code);

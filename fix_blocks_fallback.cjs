const fs = require('fs');
let code = fs.readFileSync('src/components/PluginIcon.tsx', 'utf8');

// Replace Puzzle with Blocks
code = code.replace('import { Puzzle } from "lucide-react";', 'import { Blocks } from "lucide-react";');
code = code.replace(/<Puzzle/g, '<Blocks');

// Restrict simpleIconsList to just buffer and airtable
code = code.replace(
  'const simpleIconsList = ["buffer", "airtable", "beehiiv", "convertkit"];',
  'const simpleIconsList = ["buffer", "airtable"];'
);

fs.writeFileSync('src/components/PluginIcon.tsx', code);

const fs = require('fs');
let code = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// Need to pass scope to PluginRow
code = code.replace(
  'function PluginRow({',
  'function PluginRow({\n  scope,'
);

code = code.replace(
  'wsName: string;',
  'wsName: string;\n  scope: { type: string; id: string };'
);

code = code.replace(
  'wsName={scope ? wsName(scope.id) : ""}',
  'wsName={scope ? wsName(scope.id) : ""}\n                    scope={scope}'
);

fs.writeFileSync('src/components/CustomizePage.tsx', code);

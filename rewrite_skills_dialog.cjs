const fs = require('fs');
let code = fs.readFileSync('src/components/SkillsDialog.tsx', 'utf8');

code = code.replace(/        <div className="flex flex-col space-y-1\.5 text-center sm:text-left mb-4">\n          <h2 className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight">\n            <Sparkles className="h-4 w-4 text-primary" \/>\n            Skills\n          <\/h2>\n          <p className="text-sm text-muted-foreground">\n            Reusable agent instructions for this project. Active skills appear in chat and as\n            \/slash-commands.\n          <\/p>\n        <\/div>/g, '');

fs.writeFileSync('src/components/SkillsDialog.tsx', code);

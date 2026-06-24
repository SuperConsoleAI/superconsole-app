const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsPage.tsx', 'utf8');

code = code.replace('import { Plug } from "lucide-react";\n', '');
fs.writeFileSync('src/components/SettingsPage.tsx', code);

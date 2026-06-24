const fs = require('fs');
let code = fs.readFileSync('src/components/CommandDialog.tsx', 'utf8');
code = code.replace('import { SquareSlash } from "lucide-react";\n', '');
fs.writeFileSync('src/components/CommandDialog.tsx', code);

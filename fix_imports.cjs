const fs = require('fs');
let code = fs.readFileSync('src/components/RulesDialog.tsx', 'utf8');

code = code.replace(/import {\n  Dialog,\n  DialogContent,\n} from "@\/components\/ui\/dialog";\n/, '');
code = code.replace(/import { cn } from "@\/lib\/utils";\n/, '');

fs.writeFileSync('src/components/RulesDialog.tsx', code);

const fs = require('fs');
let code = fs.readFileSync('src/components/CommandDialog.tsx', 'utf8');
code = code.replace('import { SquareSlash, Pencil, Trash2,  } from "lucide-react";', 'import { SquareSlash, Pencil, Trash2, Plus } from "lucide-react";');
fs.writeFileSync('src/components/CommandDialog.tsx', code);

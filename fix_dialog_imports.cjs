const fs = require('fs');
let code = fs.readFileSync('src/components/SettingsPage.tsx', 'utf8');

if (!code.includes('import { Dialog,')) {
  code = code.replace(
    'import { Button } from "@/components/ui/button";',
    'import { Button } from "@/components/ui/button";\nimport { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";\nimport { Plug } from "lucide-react";'
  );
}
fs.writeFileSync('src/components/SettingsPage.tsx', code);

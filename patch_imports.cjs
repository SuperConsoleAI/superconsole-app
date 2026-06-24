const fs = require('fs');

const files = ['src/components/CommandDialog.tsx', 'src/components/SkillsDialog.tsx'];

files.forEach(file => {
    let code = fs.readFileSync(file, 'utf8');
    code = code.replace(/  DialogDescription,\n/g, '');
    code = code.replace(/  DialogHeader,\n/g, '');
    code = code.replace(/  DialogTitle,\n/g, '');
    fs.writeFileSync(file, code);
});

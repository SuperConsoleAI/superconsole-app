const fs = require('fs');
let code = fs.readFileSync('src/components/SkillsDialog.tsx', 'utf8');

code = code.replace(/  useEffect\(\(\) => \{\n    if \(open\) \{\n      refresh\(\);\n      if \(library\.length === 0\) \{\n        api\.listSkillLibrary\(\)\.then\(setLibrary\)\.catch\(\(\) => \{\}\);\n      \}\n    \}\n  \}, \[open, refresh, library\.length\]\);/,
`  useEffect(() => {
    refresh();
    if (library.length === 0) {
      api.listSkillLibrary().then(setLibrary).catch(() => {});
    }
  }, [refresh, library.length]);`);

fs.writeFileSync('src/components/SkillsDialog.tsx', code);

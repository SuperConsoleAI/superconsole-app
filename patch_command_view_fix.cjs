const fs = require('fs');
let code = fs.readFileSync('src/components/CommandDialog.tsx', 'utf8');

code = code.replace(/  useEffect\(\(\) => \{\n    if \(open\) \{\n      refresh\(\);\n      setEditing\(null\);\n      setError\(null\);\n    \}\n  \}, \[open, refresh\]\);/,
`  useEffect(() => {
    refresh();
    setEditing(null);
    setError(null);
  }, [refresh]);`);

fs.writeFileSync('src/components/CommandDialog.tsx', code);

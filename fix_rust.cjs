const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/rules.rs', 'utf8');

code = code.replace(/use crate::files;\n/, '');

fs.writeFileSync('src-tauri/src/rules.rs', code);

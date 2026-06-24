const fs = require('fs');
let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');

plugins = plugins.replaceAll(
  '// let _ = crate::mcp::add_mcp_config(',
  '/*'
);
plugins = plugins.replaceAll(
  '                        );',
  '                        );*/'
);

fs.writeFileSync('src-tauri/src/plugins.rs', plugins);

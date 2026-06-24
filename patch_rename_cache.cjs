const fs = require('fs');
let code = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

// Replace the table name inside CREATE TABLE, ALTER TABLE, SELECT, INSERT, DELETE
code = code.replace(/CREATE TABLE IF NOT EXISTS installed_plugins \(/g, 'CREATE TABLE IF NOT EXISTS installed_plugins_cache (');
code = code.replace(/ALTER TABLE installed_plugins/g, 'ALTER TABLE installed_plugins_cache');
code = code.replace(/FROM installed_plugins /g, 'FROM installed_plugins_cache ');
code = code.replace(/INTO installed_plugins /g, 'INTO installed_plugins_cache ');
code = code.replace(/FROM installed_plugins_cache WHERE/g, 'FROM installed_plugins_cache WHERE'); // already handled

fs.writeFileSync('src-tauri/src/db.rs', code);

const fs = require('fs');

let plugins = fs.readFileSync('src-tauri/src/plugins.rs', 'utf8');
plugins = plugins.replace(
  'hooks_url: cell_opt(row, 17),\n            connector_auth: cell_text(row, 18),',
  'hooks_url: cell_opt(row, 17),\n            mcp_url: cell_opt(row, 18),\n            connector_auth: cell_text(row, 19),'
);
plugins = plugins.replace(
  'featured: cell_text(row, 19) == "1",',
  'featured: cell_text(row, 20) == "1",'
);
// Also around 257 in plugins.rs
plugins = plugins.replace(
  'hooks_url: entry.hooks_url.clone(),',
  'hooks_url: entry.hooks_url.clone(),\n        mcp_url: entry.mcp_url.clone(),'
);
fs.writeFileSync('src-tauri/src/plugins.rs', plugins);

let db = fs.readFileSync('src-tauri/src/db.rs', 'utf8');

function fixDb(query) {
  return query.replace(
    'skills_url, commands_url, hooks_url, connector_auth, featured, synced_at',
    'skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at'
  ).replace(
    'hooks_url: r.get(17)?,',
    'hooks_url: r.get(17)?,\n                    mcp_url: r.get(18)?,'
  ).replace(
    'connector_auth: r.get(18)?,',
    'connector_auth: r.get(19)?,'
  ).replace(
    'featured: r.get(19)?,',
    'featured: r.get(20)?,'
  ).replace(
    'synced_at: r.get(20)?,',
    'synced_at: r.get(21)?,'
  );
}

db = db.replace(
  'hooks_url: r.get(17)?,',
  'hooks_url: r.get(17)?,\n                    mcp_url: r.get(18)?,'
);
db = db.replace(
  'connector_auth: r.get(18)?,',
  'connector_auth: r.get(19)?,'
);
db = db.replace(
  'featured: r.get(19)?,',
  'featured: r.get(20)?,'
);
db = db.replace(
  'synced_at: r.get(20)?,',
  'synced_at: r.get(21)?,'
);

db = db.replace(
  'hooks_url: r.get(17)?,',
  'hooks_url: r.get(17)?,\n                mcp_url: r.get(18)?,'
);
db = db.replace(
  'connector_auth: r.get(18)?,',
  'connector_auth: r.get(19)?,'
);
db = db.replace(
  'featured: r.get(19)?,',
  'featured: r.get(20)?,'
);
db = db.replace(
  'synced_at: r.get(20)?,',
  'synced_at: r.get(21)?,'
);

db = db.replace(
  'hooks_url: r.get(17)?,',
  'hooks_url: r.get(17)?,\n                mcp_url: r.get(18)?,'
);
db = db.replace(
  'connector_auth: r.get(18)?,',
  'connector_auth: r.get(19)?,'
);
db = db.replace(
  'featured: r.get(19)?,',
  'featured: r.get(20)?,'
);
db = db.replace(
  'synced_at: r.get(20)?,',
  'synced_at: r.get(21)?,'
);


db = db.replaceAll(
  'skills_url, commands_url, hooks_url, connector_auth, featured, synced_at',
  'skills_url, commands_url, hooks_url, mcp_url, connector_auth, featured, synced_at'
);

fs.writeFileSync('src-tauri/src/db.rs', db);

cat << 'INNER_EOF' > /tmp/PublishPluginDialog_patch.js
const fs = require('fs');

let content = fs.readFileSync('src/components/libraryx/PublishPluginDialog.tsx', 'utf8');

// 1. Add Save Changes text
content = content.replace(
  '{submitting ? "Publishing..." : "Publish to Turso"}',
  '{submitting ? "Publishing..." : selectedPluginId ? "Save Changes" : "Publish to Turso"}'
);

// 2. Add Github URL field below Category
content = content.replace(
  '{/* Skills */}',
  '{field("GitHub URL", "githubUrl", "https://github.com/.../plugin")}\n            {/* Skills */}'
);

fs.writeFileSync('src/components/libraryx/PublishPluginDialog.tsx', content);
INNER_EOF
node /tmp/PublishPluginDialog_patch.js

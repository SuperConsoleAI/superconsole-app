const fs = require('fs');
let code = fs.readFileSync('src/components/libraryx/PublishPluginDialog.tsx', 'utf8');

const fieldTemplate = `
            {field("Agents URL Array (JSON)", "agentsUrl", '["https://raw..."]')}
            {field("Rules URL Array (JSON)", "rulesUrl", '["https://raw..."]')}
            {field("Hooks URL Array (JSON)", "hooksUrl", '["https://raw..."]')}
            {field("Commands URL Array (JSON)", "commandsUrl", '["https://raw..."]')}
`;

code = code.replace('{/* Plugins to edit */}', fieldTemplate + '{/* Plugins to edit */}');

fs.writeFileSync('src/components/libraryx/PublishPluginDialog.tsx', code);

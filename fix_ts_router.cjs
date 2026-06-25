const fs = require('fs');

let custom = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

custom = custom.replace(/navigate\(\{ search: \{ ws: undefined \}, replace: true \}\)/g, 'navigate({ to: "/customize", search: { ws: undefined }, replace: true })');
custom = custom.replace(/navigate\(\{ search: \{ ws: w\.id \}, replace: true \}\)/g, 'navigate({ to: "/customize", search: { ws: w.id }, replace: true })');

fs.writeFileSync('src/components/CustomizePage.tsx', custom);

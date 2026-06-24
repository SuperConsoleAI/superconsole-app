const fs = require('fs');
let code = fs.readFileSync('src/components/PluginIcon.tsx', 'utf8');

// Add TursoDark, TursoLight to imports
if (!code.includes('TursoDark')) {
  code = code.replace(
    'GoogleAnalytics,\n} from "@ridemountainpig/svgl-react";',
    'GoogleAnalytics,\n  TursoDark,\n  TursoLight,\n} from "@ridemountainpig/svgl-react";'
  );
}

// Add turso to DUAL_MAP
if (!code.includes('turso: {')) {
  code = code.replace(
    'github: { light: GitHubLight, dark: GitHubDark },',
    'github: { light: GitHubLight, dark: GitHubDark },\n  turso: { light: TursoLight, dark: TursoDark },'
  );
}

// Support simpleicons dynamically for specific connectors we know aren't in svgl-react
// or just return an img tag for them.
const simpleIconsSupport = `
  // 3.5. Simpleicons fallback for known missing ones
  const simpleIconsList = ["buffer", "airtable", "beehiiv", "convertkit"];
  if (simpleIconsList.includes(id)) {
    return (
      <img
        src={\`https://cdn.simpleicons.org/\${id}/currentColor\`}
        alt=""
        width={size}
        height={size}
        className={cn("rounded object-contain dark:invert", className)}
      />
    );
  }
`;

if (!code.includes('simpleIconsList')) {
  code = code.replace(
    '// 4. Generic fallback.',
    simpleIconsSupport + '\n  // 4. Generic fallback.'
  );
}

fs.writeFileSync('src/components/PluginIcon.tsx', code);

const fs = require('fs');

let code = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// The replacement script might have replaced multiple occurrences incorrectly?
code = code.replace(/const \[authValue, setAuthValue\] = useState\(\"\"\);/g, '');
code = code.replace(/function PluginRow\(\{\n  scope,/g, 'function PluginRow({');
code = code.replace(/wsName: string;\n  scope: \{ type: string; id: string \};/g, 'wsName: string;');
code = code.replace(/wsName=\{scope \? wsName\(scope\.id\) \: \"\"\}\n                    scope=\{scope\}/g, 'wsName={scope ? wsName(scope.id) : ""}');

// Re-apply it manually but correctly inside PluginRow ONLY
const functionRegex = /function PluginRow\(\{([\s\S]*?)\}: \{([\s\S]*?)\}\) \{([\s\S]*?)const \[expanded, setExpanded\] = useState\(false\);\n  const \[installStep, setInstallStep\] = useState<InstallStep>\(\{ kind: \"idle\" \}\);/m;

const replacement = `function PluginRow({
$1, scope
}: {
$2, scope: { type: string, id: string }
}) {
$3const [expanded, setExpanded] = useState(false);
  const [installStep, setInstallStep] = useState<InstallStep>({ kind: "idle" });
  const [authValue, setAuthValue] = useState("");`;

code = code.replace(functionRegex, replacement);

// And the map call
code = code.replace(
  'wsName={scope ? wsName(scope.id) : ""}',
  'wsName={scope ? wsName(scope.id) : ""} scope={scope}'
);

fs.writeFileSync('src/components/CustomizePage.tsx', code);

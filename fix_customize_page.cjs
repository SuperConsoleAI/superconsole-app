const fs = require('fs');

let code = fs.readFileSync('src/components/CustomizePage.tsx', 'utf8');

// Fix needsAuth check so it doesn't skip auth if plugin.installed is already true
code = code.replace(
  'const needsAuth = plugin.connectorAuth.length > 0 && !plugin.installed;',
  'const needsAuth = plugin.connectorAuth.length > 0;'
);

// We need to add state for the api key
code = code.replace(
  'const [installStep, setInstallStep] = useState<InstallStep>({ kind: "idle" });',
  'const [installStep, setInstallStep] = useState<InstallStep>({ kind: "idle" });\n  const [authValue, setAuthValue] = useState("");'
);

// Update Save button to call setConnector
const saveButtonOld = `<Button size="sm" className="h-7 px-3 text-xs" onClick={() => setInstallStep({ kind: "done" })}>`;
const saveButtonNew = `<Button size="sm" className="h-7 px-3 text-xs" onClick={async () => {
                  try {
                    await api.setConnector(scope.type as any, scope.id, installStep.service, [{ key: "api_key", value: authValue }]);
                  } catch (e) {
                    console.error("Failed to save connector", e);
                  }
                  setInstallStep({ kind: "done" });
                }}>`;

// Update the input to use authValue
const inputOld = `<input type="password" placeholder="API Key" className="h-7 w-full rounded-md border bg-background px-2 focus:ring-1 focus:ring-primary" />`;
const inputNew = `<input type="password" placeholder="API Key" value={authValue} onChange={(e) => setAuthValue(e.target.value)} className="h-7 w-full rounded-md border bg-background px-2 focus:ring-1 focus:ring-primary" />`;

code = code.replace(saveButtonOld, saveButtonNew);
code = code.replace(inputOld, inputNew);

fs.writeFileSync('src/components/CustomizePage.tsx', code);

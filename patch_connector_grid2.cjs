const fs = require('fs');

let code = fs.readFileSync('src/components/SettingsPage.tsx', 'utf8');

// Locate ConnectorManager
const startIdx = code.indexOf('export function ConnectorManager({');
const endIdx = code.indexOf('function LlmKeyEditor({');

if (startIdx !== -1 && endIdx !== -1) {
  const newConnectorManager = `export function ConnectorManager({
  scope,
  scopeId,
  category,
  filterService,
}: {
  scope: ConnectorScope;
  scopeId: string;
  category: ConnectorCategory;
  /** If set, show only this service and hide the selector dropdown. */
  filterService?: string;
}) {
  const available = CONNECTOR_REGISTRY.filter(
    (d) =>
      d.scopes.includes(scope) &&
      d.category === category &&
      (!filterService || d.id === filterService),
  );

  const [list, setList] = useState<ConnectorView[]>([]);
  const [editingService, setEditingService] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [detectHint, setDetectHint] = useState<string | null>(null);

  const def = CONNECTOR_REGISTRY.find((d) => d.id === editingService);
  const current = list.find((c) => c.service === editingService);
  const isTelegram = editingService === "telegram";
  const isProjectScope = scope === "project";

  const load = async () => {
    try {
      setList(await api.listConnectors(scope, scopeId));
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    setList([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeId]);

  // Prefill non-secret fields from the existing connector
  useEffect(() => {
    if (!def) return;
    const existing = list.find((c) => c.service === editingService);
    const next: Record<string, string> = {};
    for (const f of def.fields) {
      const ev = existing?.fields.find((x) => x.key === f.key);
      next[f.key] = !f.secret && ev?.value ? ev.value : "";
    }
    setValues(next);
    setDetectHint(null);
  }, [editingService, list, def]);

  const save = async () => {
    if (!editingService) return;
    setError(null);
    try {
      await api.setConnector(scope, scopeId, editingService, values);
      await load();
      setEditingService(null);
    } catch (e) {
      setError(String(e));
    }
  };

  const canSave = (() => {
    if (!def) return false;
    if (editingService === "telegram") {
      if (scope === "org") {
        const botFieldSet = current?.fields.find((x) => x.key === "bot_token")?.has_value;
        return !!(values["bot_token"]?.trim() || botFieldSet);
      }
      const chatFieldSet = current?.fields.find((x) => x.key === "chat_id")?.has_value;
      return !!(values["chat_id"]?.trim() || chatFieldSet);
    }
    const anyTyped = Object.values(values).some((v) => v.trim().length > 0);
    const anySet = current?.fields.some((f) => f.has_value) ?? false;
    return anyTyped || anySet;
  })();

  const remove = async (svc: string) => {
    setError(null);
    try {
      await api.deleteConnector(scope, scopeId, svc);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const detectChat = async () => {
    setDetecting(true);
    setDetectHint("Waiting for a message… Send any message to the bot in your group now.");
    setError(null);
    try {
      const result = await api.detectTelegramChat();
      setValues((v) => ({
        ...v,
        chat_id: result.chat_id,
        ...(result.thread_id ? { thread_id: result.thread_id } : {}),
      }));
      const label = result.chat_title ? \`"\${result.chat_title}"\` : result.chat_id;
      setDetectHint(
        \`Detected: \${label}\${result.thread_id ? \` · topic \${result.thread_id}\` : ""}. Click Save to confirm.\`,
      );
    } catch (e) {
      setDetectHint(null);
      setError(String(e));
    } finally {
      setDetecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {available.map((c) => {
          const configured = list.find((l) => l.service === c.id);
          return (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-xl border bg-card p-4 shadow-sm"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                  <Plug className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <div className="min-w-0">
                  <span className="block text-sm font-medium">{c.label}</span>
                  {configured ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      Connected
                    </span>
                  ) : (
                    <span className="block truncate text-xs text-muted-foreground">
                      Not connected
                    </span>
                  )}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {configured ? (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-muted-foreground"
                      onClick={() => setEditingService(c.id)}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 text-xs text-destructive"
                      onClick={() => remove(c.id)}
                    >
                      Remove
                    </Button>
                  </>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => setEditingService(c.id)}
                  >
                    Connect
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Dialog open={!!editingService} onOpenChange={(o) => { if (!o) setEditingService(null); }}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>{def?.label} Configuration</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 pt-2">
            {def?.fields.map((f) => {
              const fieldSet = current?.fields.find((x) => x.key === f.key)?.has_value;
              const showBotHint = isTelegram && isProjectScope && f.key === "bot_token" && !values["bot_token"];
              const showDetect = isTelegram && isProjectScope && f.key === "chat_id";

              return (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <span className="text-xs font-medium">{f.label}</span>
                  {showDetect ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={values[f.key] ?? ""}
                        onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                        type="text"
                        placeholder={f.placeholder ?? f.label}
                        className="h-8 flex-1 font-mono text-xs"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 shrink-0 text-xs"
                        disabled={detecting}
                        onClick={detectChat}
                      >
                        {detecting ? "Listening…" : "Detect →"}
                      </Button>
                    </div>
                  ) : (
                    <Input
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                      type={f.secret ? "password" : "text"}
                      placeholder={
                        f.secret && fieldSet
                          ? \`•••• set (leave blank to keep)\`
                          : (f.placeholder ?? f.label)
                      }
                      className="h-8 font-mono text-xs"
                    />
                  )}
                  {showBotHint && (
                    <p className="text-[11px] text-muted-foreground">
                      Leave blank to use the org-level Telegram bot. Fill in to give this project its own bot.
                    </p>
                  )}
                </div>
              );
            })}

            {detectHint && <p className="text-[11px] text-primary">{detectHint}</p>}
            {error && <p className="text-[11px] text-destructive">{error}</p>}

            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditingService(null)}>
                Cancel
              </Button>
              <SaveButton onSave={save} disabled={!canSave} />
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

`;

  code = code.substring(0, startIdx) + newConnectorManager + code.substring(endIdx);
  fs.writeFileSync('src/components/SettingsPage.tsx', code);
} else {
  console.error("Could not find start or end index.");
  process.exit(1);
}

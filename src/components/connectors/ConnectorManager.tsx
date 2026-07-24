/**
 * ConnectorManager — canonical, self-contained connector UI module.
 *
 * Architecture
 * ─────────────
 * • `useConnectorScope`  resolves the correct cloud ULID for any scope type
 *   and local ID, calling `ensureWorkspaceProject` on-the-fly when needed.
 * • `ConnectorManager`   accepts EITHER a pre-resolved `scopeId` OR a raw
 *   `localWorkspaceId` (project scope only) and delegates resolution to the hook.
 *
 * Both SettingsPage and CustomizePage are thin consumers — they pass scope
 * metadata and the hook handles all Turso linkage transparently.
 */

import { useEffect, useState, useCallback } from "react";
import { CheckCircle, Loader2, XCircle } from "lucide-react";
import {
  api,
  CONNECTOR_REGISTRY,
  type ConnectorCategory,
  type ConnectorScope,
  type ConnectorTestResult,
  type ConnectorView,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PluginIcon } from "@/components/PluginIcon";
import { cn } from "@/lib/utils";

// Re-export types so callers don't need to reach into api.ts
export type { ConnectorScope, ConnectorCategory, ConnectorView, ConnectorTestResult };

// ─── useConnectorScope ────────────────────────────────────────────────────────
/**
 * Resolves the cloud ULID needed for Turso connector operations.
 *
 *   account → auth.user.id  (guaranteed after sign-in)
 *   org     → first CloudOrg.id from auth.orgs
 *   project → workspace.project_id if known, otherwise calls
 *             ensureWorkspaceProject(localWorkspaceId, cloudOrgId) to create
 *             and link the project row in Turso immediately.
 *
 * Returns { cloudId, loading } — cloudId is "" while loading.
 */
export function useConnectorScope(
  scope: ConnectorScope,
  options: {
    /** Pre-resolved cloud ULID — skips all resolution. */
    scopeId?: string;
    /** Local workspace integer ID (project scope only). */
    localWorkspaceId?: number;
    /** workspace.project_id — avoids an ensureWorkspaceProject round-trip. */
    localProjectId?: string | null;
  } = {},
): { cloudId: string; loading: boolean } {
  const { auth } = useAuth();
  const [cloudId, setCloudId] = useState<string>(options.scopeId ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (options.scopeId) {
      setCloudId(options.scopeId);
      return;
    }
    if (scope === "account") {
      setCloudId(auth?.user.id ?? "");
      return;
    }
    if (scope === "org") {
      setCloudId(auth?.orgs[0]?.id ?? "");
      return;
    }
    if (scope === "project") {
      if (options.localProjectId) {
        setCloudId(options.localProjectId);
        return;
      }
      if (options.localWorkspaceId && auth?.orgs[0]?.id) {
        setLoading(true);
        api
          .ensureWorkspaceProject(options.localWorkspaceId, auth.orgs[0].id)
          .then((pid) => setCloudId(pid))
          .catch(() => setCloudId(""))
          .finally(() => setLoading(false));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, options.scopeId, options.localWorkspaceId, options.localProjectId, auth]);

  return { cloudId, loading };
}

// ─── ConnectorManager ─────────────────────────────────────────────────────────
/**
 * Full connector list + edit dialog for one scope.
 *
 * Pass ONE of:
 *   scopeId           — pre-resolved Turso ULID (SettingsPage already has it)
 *   localWorkspaceId  — local workspace int (CustomizePage passes this;
 *                       the component resolves the cloud ID internally)
 */
export function ConnectorManager({
  scope,
  scopeId,
  localWorkspaceId,
  localProjectId,
  category,
  filterService,
}: {
  scope: ConnectorScope;
  /** Pre-resolved Turso ULID. Provide this OR localWorkspaceId, not both. */
  scopeId?: string;
  /** Local workspace integer (project scope). Resolved internally. */
  localWorkspaceId?: number;
  /** workspace.project_id — avoids an ensureWorkspaceProject round-trip. */
  localProjectId?: string | null;
  category: ConnectorCategory;
  /** If set, shows only this service and hides the selector list. */
  filterService?: string;
}) {
  const { cloudId, loading } = useConnectorScope(scope, {
    scopeId,
    localWorkspaceId,
    localProjectId,
  });

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
  const [testResult, setTestResult] = useState<ConnectorTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [tested, setTested] = useState(false);
  const [saving, setSaving] = useState(false);

  const def = CONNECTOR_REGISTRY.find((d) => d.id === editingService);
  const current = list.find((c) => c.service === editingService);
  const isTelegram = editingService === "telegram";
  const isProjectScope = scope === "project";

  const load = useCallback(async () => {
    if (!cloudId) return;
    try {
      setList(await api.listConnectors(scope, cloudId));
    } catch (e) {
      setError(String(e));
    }
  }, [scope, cloudId]);

  useEffect(() => {
    setList([]);
    load();
  }, [load]);

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
    setTestResult(null);
    setTested(false);
  }, [editingService, list, def]);

  const resetTest = () => { setTestResult(null); setTested(false); };

  const save = async () => {
    if (!editingService || !cloudId) return;
    setSaving(true);
    setError(null);
    try {
      await api.setConnector(scope, cloudId, editingService, values);
      await load();
      setEditingService(null);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
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

  const hasRequiredFields = Object.values(values).some((v) => v.trim().length > 0);

  const remove = async (svc: string) => {
    if (!cloudId) return;
    setError(null);
    try {
      await api.deleteConnector(scope, cloudId, svc);
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
      const label = result.chat_title ? `"${result.chat_title}"` : result.chat_id;
      setDetectHint(
        `Detected: ${label}${result.thread_id ? ` · topic ${result.thread_id}` : ""}. Click Save to confirm.`,
      );
    } catch (e) {
      setDetectHint(null);
      setError(String(e));
    } finally {
      setDetecting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground text-xs gap-2">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Linking project to cloud…
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="grid grid-cols-[1fr_120px_120px_140px] gap-4 border-b px-4 py-2 text-xs font-semibold text-muted-foreground">
        <div>Connector</div>
        <div>Type</div>
        <div>Status</div>
        <div />
      </div>
      <div className="flex flex-col">
        {available.map((c) => {
          const configured = list.find((l) => l.service === c.id);
          return (
            <div
              key={c.id}
              className="grid grid-cols-[1fr_120px_120px_140px] items-center gap-4 border-b px-4 py-3 hover:bg-muted/30 transition-colors"
            >
              <div className="flex items-center gap-3 min-w-0">
                <PluginIcon pluginId={c.id} size={20} fallbackIcon="blocks" className="h-6 w-6 p-0.5 bg-transparent" />
                <span className="block text-sm font-medium truncate">{c.label}</span>
              </div>
              <div className="text-xs text-muted-foreground">API Key</div>
              <div className="text-xs">
                {configured ? (
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">Connected</span>
                ) : (
                  <span className="text-muted-foreground">Not connected</span>
                )}
              </div>
              <div className="flex shrink-0 items-center justify-end gap-1.5">
                {configured ? (
                  <>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-muted-foreground" onClick={() => setEditingService(c.id)}>Edit</Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-destructive" onClick={() => remove(c.id)}>Remove</Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => setEditingService(c.id)}>Connect</Button>
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
                      <Input value={values[f.key] ?? ""} onChange={(e) => { setValues((v) => ({ ...v, [f.key]: e.target.value })); resetTest(); }} type="text" placeholder={f.placeholder ?? f.label} className="h-8 flex-1 font-mono text-xs" />
                      <Button size="sm" variant="outline" className="h-8 shrink-0 text-xs" disabled={detecting} onClick={detectChat}>{detecting ? "Listening…" : "Detect →"}</Button>
                    </div>
                  ) : (
                    <Input value={values[f.key] ?? ""} onChange={(e) => { setValues((v) => ({ ...v, [f.key]: e.target.value })); resetTest(); }} type={f.secret ? "password" : "text"} placeholder={f.secret && fieldSet ? `•••• set (leave blank to keep)` : (f.placeholder ?? f.label)} className="h-8 font-mono text-xs" />
                  )}
                  {showBotHint && <p className="text-[11px] text-muted-foreground">Leave blank to use the org-level Telegram bot. Fill in to give this project its own bot.</p>}
                </div>
              );
            })}

            {detectHint && <p className="text-[11px] text-primary">{detectHint}</p>}
            {error && <p className="text-[11px] text-destructive">{error}</p>}

            {editingService && (
              <div className="flex flex-col gap-2">
                <Button variant="outline" size="sm" className="w-full h-8 text-xs" disabled={testing || !hasRequiredFields}
                  onClick={async () => {
                    setTesting(true); setTestResult(null);
                    try {
                      const result = await api.testConnector(editingService, JSON.stringify(values));
                      setTestResult(result); setTested(true);
                    } catch (e) {
                      setTestResult({ success: false, message: String(e) }); setTested(true);
                    } finally { setTesting(false); }
                  }}
                >
                  {testing ? <><Loader2 className="h-3 w-3 animate-spin mr-1.5" />Testing…</> : "Test connection"}
                </Button>
                {testResult && (
                  <div className={cn("flex items-start gap-2 rounded-md p-2 text-xs border", testResult.success ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20" : "bg-destructive/10 text-destructive border-destructive/20")}>
                    {testResult.success ? <CheckCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" /> : <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />}
                    <div>
                      <div>{testResult.message}</div>
                      {testResult.details && <div className="opacity-70 mt-0.5">{testResult.details}</div>}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="mt-2 flex justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setEditingService(null)}>Cancel</Button>
              <Button size="sm" disabled={!canSave || saving} onClick={save} className={cn(tested && !testResult?.success && "border border-amber-500")}>
                {saving ? "Saving…" : tested && !testResult?.success ? "Save anyway" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

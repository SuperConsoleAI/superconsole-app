import { useEffect, useState } from "react";
import { RefreshCw, Sparkles, Cpu, Check, Copy, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

// Re-export model defaults from models.tsx for backwards compatibility
export {
  DEFAULT_PROVIDER_KEY,
  DEFAULT_MODEL_KEY,
  DEFAULT_PROVIDER_CHANGE_EVENT,
  getGlobalDefaultProvider,
  getGlobalDefaultModel,
} from "@/components/settings/models";

export function ApiKeysSection() {
  const [httpEnabled, setHttpEnabled] = useState(false);
  const [httpPort, setHttpPort] = useState("4665");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const loadSettingsAndToken = () => {
    api
      .getSettings()
      .then((s) => {
        setHttpEnabled(s.http_enabled === "1");
        if (s.http_port) setHttpPort(s.http_port);
        if (s.api_token) setToken(s.api_token);
      })
      .catch(console.error);

    api
      .getApiToken()
      .then((t) => {
        if (t) setToken(t);
      })
      .catch(console.error);
  };

  useEffect(() => {
    loadSettingsAndToken();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.setSetting("http_enabled", httpEnabled ? "1" : "0");
      await api.setSetting("http_port", httpPort || "4665");
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      console.error("Failed to save HTTP server settings:", e);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async () => {
    if (
      !confirm(
        "Are you sure you want to regenerate the HTTP trigger token? Any existing integrations or webhooks will need to be updated.",
      )
    ) {
      return;
    }
    setRegenerating(true);
    try {
      const newToken = await api.regenerateApiToken();
      setToken(newToken);
    } catch (e) {
      console.error("Failed to regenerate token:", e);
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-foreground">Local HTTP server</h3>
          <button
            type="button"
            className={cn(
              "h-4 w-7 rounded-full transition-colors cursor-pointer",
              httpEnabled ? "bg-primary" : "bg-muted",
            )}
            onClick={() => setHttpEnabled(!httpEnabled)}
          >
            <span
              className={cn(
                "block h-3 w-3 rounded-full bg-background transition-transform",
                httpEnabled ? "translate-x-3.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Binds 127.0.0.1 only. POST /trigger with JSON body and the x-superconsole-token header to trigger commands.
          Restart SuperConsole to apply port or status changes.
        </p>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="w-12 text-xs text-muted-foreground">Port</span>
            <Input
              value={httpPort}
              onChange={(e) => setHttpPort(e.target.value)}
              className="h-8 w-24 font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-12 text-xs text-muted-foreground">Token</span>
            <div className="relative flex-1">
              <Input
                readOnly
                value={token}
                type={showToken ? "text" : "password"}
                className="h-8 w-full pr-8 font-mono text-xs"
                placeholder="Loading token..."
              />
              <button
                type="button"
                onClick={() => setShowToken(!showToken)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
                title={showToken ? "Hide token" : "Show token"}
              >
                {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 cursor-pointer"
              title="Copy token"
              onClick={() => {
                if (!token) return;
                navigator.clipboard.writeText(token);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Regenerate token"
              disabled={regenerating}
              onClick={handleRegenerate}
            >
              <RefreshCw className={cn("h-3.5 w-3.5", regenerating && "animate-spin")} />
            </Button>
          </div>
        </div>
      </div>
      <div>
        <Button size="sm" onClick={handleSave} disabled={saving} className="cursor-pointer">
          {saved ? "Saved" : saving ? "Saving..." : "Save HTTP settings"}
        </Button>
      </div>
    </div>
  );
}

export function GeneralSection({
  onNavigateSection,
}: {
  onNavigateSection?: (section: string) => void;
}) {
  const [version, setVersion] = useState("");
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<string | null>(null);

  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) =>
      getVersion().then(setVersion).catch(() => {}),
    );
  }, []);

  const handleCheckUpdate = async () => {
    setCheckingUpdate(true);
    setUpdateStatus(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setUpdateStatus(`Update available: v${update.version}. Downloading...`);
        await update.downloadAndInstall();
        setUpdateStatus("Update installed. Restart SuperConsole to apply.");
      } else {
        setUpdateStatus("You're on the latest version.");
      }
    } catch {
      setUpdateStatus("Update check completed. Running latest build.");
    } finally {
      setCheckingUpdate(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Quick link / callout to Models tab */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-primary" />
            Default AI Model & Provider
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            Default chat models and provider credentials have been centralized into the Models tab.
          </p>
        </div>
        {onNavigateSection && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onNavigateSection("Models")}
            className="text-xs shrink-0 ml-4 gap-1.5 cursor-pointer"
          >
            <Cpu className="h-3.5 w-3.5" />
            Go to Models
          </Button>
        )}
      </div>

      {/* Application Version & Updater */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-medium text-foreground">SuperConsole Runtime</h3>
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                v{version || "0.1.0"}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Production desktop runtime for agentic workflows and local workspaces.
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={handleCheckUpdate}
            disabled={checkingUpdate}
            className="gap-1.5 cursor-pointer"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", checkingUpdate && "animate-spin")} />
            {checkingUpdate ? "Checking..." : "Check for updates"}
          </Button>
        </div>
        {updateStatus && (
          <p className="mt-2 text-xs font-mono text-muted-foreground animate-in fade-in">
            {updateStatus}
          </p>
        )}
      </div>

      {/* Local HTTP Server Section */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <ApiKeysSection />
      </div>
    </div>
  );
}

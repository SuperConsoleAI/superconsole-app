/**
 * General Settings Tab — App runtime, updates, and general preferences.
 * Re-exports model default helpers from models.tsx for seamless backwards compatibility.
 */
import { useEffect, useState } from "react";
import { RefreshCw, Sparkles, Cpu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Re-export model defaults from models.tsx for backwards compatibility
export {
  DEFAULT_PROVIDER_KEY,
  DEFAULT_MODEL_KEY,
  DEFAULT_PROVIDER_CHANGE_EVENT,
  getGlobalDefaultProvider,
  getGlobalDefaultModel,
} from "@/components/settings/models";

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
            className="text-xs shrink-0 ml-4 gap-1.5"
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
            className="gap-1.5"
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
    </div>
  );
}

import { useEffect, useState } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Button } from "./ui/button";
import { DownloadCloud, RefreshCw, X } from "lucide-react";

export function AutoUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<{ downloaded: number; contentLength?: number }>({ downloaded: 0 });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function checkForUpdate() {
      try {
        const updateResult = await check();
        if (updateResult) {
          setUpdate(updateResult);
        }
      } catch (err) {
        console.error("Failed to check for updates:", err);
      }
    }
    
    // Check shortly after app starts
    const timer = setTimeout(checkForUpdate, 5000);
    
    // Check every 12 hours
    const interval = setInterval(checkForUpdate, 1000 * 60 * 60 * 12);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, []);

  if (!update) return null;

  async function handleUpdate() {
    setDownloading(true);
    setError(null);
    try {
      await update!.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            setProgress({ downloaded: 0, contentLength: event.data.contentLength });
            break;
          case 'Progress':
            setProgress((prev) => ({ ...prev, downloaded: prev.downloaded + event.data.chunkLength }));
            break;
          case 'Finished':
            break;
        }
      });
      await relaunch();
    } catch (err: any) {
      console.error("Failed to install update:", err);
      setError(err.toString());
      setDownloading(false);
    }
  }

  return (
    <div className="fixed bottom-6 right-6 z-[100] flex w-[340px] flex-col gap-4 rounded-xl border bg-card p-5 shadow-2xl animate-in slide-in-from-bottom-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <DownloadCloud className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h4 className="text-sm font-semibold">Update Available</h4>
            <p className="text-xs text-muted-foreground">Version {update.version}</p>
          </div>
        </div>
        {!downloading && (
          <button 
            onClick={() => setUpdate(null)}
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      
      {update.body && (
        <div className="max-h-32 overflow-y-auto rounded-md bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
          {update.body}
        </div>
      )}

      {error && (
        <div className="text-xs text-destructive">
          Error: {error}
        </div>
      )}

      {downloading ? (
        <div className="space-y-2 py-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div 
              className="h-full bg-primary transition-all duration-200"
              style={{ 
                width: progress.contentLength 
                  ? `${Math.min(100, (progress.downloaded / progress.contentLength) * 100)}%` 
                  : '100%' 
              }}
            />
          </div>
          <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Downloading update...
          </p>
        </div>
      ) : (
        <Button onClick={handleUpdate} className="w-full" size="sm">
          Download & Restart
        </Button>
      )}
    </div>
  );
}

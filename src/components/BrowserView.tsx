import { useEffect, useState, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Webview } from "@tauri-apps/api/webview";
import { getCurrentWindow, LogicalSize, LogicalPosition } from "@tauri-apps/api/window";
import { RefreshCw, Search, ChevronLeft, ChevronRight, Code2 } from "lucide-react";
import { useWorkspaces } from "@/lib/workspace-context";

interface BrowserViewProps {
  workspaceId: number;
  tabId: string;
  isActive: boolean;
}

export function BrowserView({ workspaceId, tabId, isActive }: BrowserViewProps) {
  const { tabsByWs, setTabState } = useWorkspaces();
  const tab = tabsByWs[workspaceId]?.find((t) => t.id === tabId);
  const initialUrl = tab?.initialInput || ""; // default empty
  
  const [url, setUrl] = useState(initialUrl);
  const [inputUrl, setInputUrl] = useState(initialUrl);
  const containerRef = useRef<HTMLDivElement>(null);
  const webviewRef = useRef<Webview | null>(null);
  const isActiveRef = useRef(isActive);
  const [webviewLabel, setWebviewLabel] = useState<string>("");

  const mountWebview = async (targetUrl: string) => {
    if (!containerRef.current) return;
    if (!targetUrl) return; // Don't mount if no URL
    
    // Close existing if navigating
    if (webviewRef.current) {
      await webviewRef.current.close();
      webviewRef.current = null;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const appWindow = getCurrentWindow();

    const label = `browser-${tabId}-${Date.now()}`;
    const webview = new Webview(appWindow, label, {
      url: targetUrl,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
    
    webview.once('tauri://created', () => {
      console.log('Webview created successfully!');
    });
    
    webview.once('tauri://error', (e) => {
      console.error('Webview creation error:', e);
    });
    
    // Tauri Webviews are visible by default
    if (!isActiveRef.current) {
      webview.hide().catch(() => {});
    }
    
    webviewRef.current = webview;
    setWebviewLabel(label);
  };

  useEffect(() => {
    mountWebview(url);

    const observer = new ResizeObserver(() => {
      if (!containerRef.current || !webviewRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      webviewRef.current.setPosition(new LogicalPosition(rect.x, rect.y));
      webviewRef.current.setSize(new LogicalSize(rect.width, rect.height));
    });
    
    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => {
      observer.disconnect();
      if (webviewRef.current) {
        webviewRef.current.close().catch(() => {});
        webviewRef.current = null;
      }
    };
  }, [url, tabId]); // Remounts when URL changes

  // Handle active state & overlay
  useEffect(() => {
    isActiveRef.current = isActive;
    
    let isOverlayActive = false;

    const handleOverlay = (e: CustomEvent<boolean>) => {
      isOverlayActive = e.detail;
      updateVisibility();
    };

    const updateVisibility = () => {
      if (!webviewRef.current) return;
      if (isActive && !isOverlayActive) {
        webviewRef.current.show().catch(console.error);
      } else {
        webviewRef.current.hide().catch(console.error);
      }
    };

    updateVisibility();

    window.addEventListener("webview-overlay", handleOverlay as EventListener);
    return () => {
      window.removeEventListener("webview-overlay", handleOverlay as EventListener);
    };
  }, [isActive]);

  // Update initialInput in tab state when url changes so it persists
  useEffect(() => {
    setTabState(workspaceId, tabId, { initialInput: url });
  }, [url, workspaceId, tabId, setTabState]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    let finalUrl = inputUrl.trim();
    if (!finalUrl) return;

    const isSearchQuery = !finalUrl.includes(".") && !finalUrl.startsWith("localhost") && !finalUrl.startsWith("127.0.0.1") || finalUrl.includes(" ");

    if (isSearchQuery) {
      finalUrl = `https://www.google.com/search?q=${encodeURIComponent(finalUrl)}`;
    } else if (!finalUrl.startsWith("http://") && !finalUrl.startsWith("https://")) {
      if (finalUrl.startsWith("localhost") || finalUrl.startsWith("127.0.0.1")) {
        finalUrl = `http://${finalUrl}`;
      } else {
        finalUrl = `https://${finalUrl}`;
      }
    }
    setUrl(finalUrl);
    setInputUrl(finalUrl);
  };

  return (
    <div className="flex h-full w-full flex-col bg-background">
      <div className="flex h-8 shrink-0 items-center justify-between border-b bg-sidebar px-2">
        {/* Left: Navigation Controls */}
        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              if (webviewLabel) {
                invoke("eval_webview", { label: webviewLabel, script: "window.history.back()" }).catch(console.error);
              }
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
          <button 
            onClick={() => {
              if (webviewLabel) {
                invoke("eval_webview", { label: webviewLabel, script: "window.history.forward()" }).catch(console.error);
              }
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => mountWebview(url)}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground"
            title="Refresh"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Center: Address Bar */}
        <form onSubmit={handleSubmit} className="mx-4 flex h-6 w-full flex-1 items-center gap-2">
          <div className="flex h-full w-full items-center gap-2 rounded-lg px-2 transition-colors focus-within:border focus-within:border-primary/50 focus-within:bg-black/20 hover:bg-black/10">
            <Search className="h-3 w-3 text-muted-foreground opacity-50" />
            <input
              className="flex-1 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/50"
              placeholder="Enter URL..."
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => e.stopPropagation()} // prevent terminal hotkeys
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        </form>

        {/* Right: Dev Tools */}
        <div className="flex items-center gap-1">
          <button 
            onClick={() => {
              if (webviewLabel) {
                invoke("open_webview_devtools", { label: webviewLabel }).catch(console.error);
              }
            }}
            className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-white/10 hover:text-foreground" 
            title="Developer Tools"
          >
            <Code2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div ref={containerRef} className="flex-1 w-full relative" />
    </div>
  );
}

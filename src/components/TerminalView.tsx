import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import { RefreshCw } from "lucide-react";
import { api, type SessionInfo, type SessionTab, type Workspace } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { CommandInput } from "@/components/CommandInput";

interface TerminalViewProps {
  workspace: Workspace;
  tab: SessionTab;
  visible: boolean;
  onSessionState: (sessionId: string, live: boolean) => void;
  onSessionInfo: (sessionId: string, info: SessionInfo) => void;
}

interface PtyOutputPayload {
  session_id: string;
  data: string;
}

export function TerminalView({
  workspace,
  tab,
  visible,
  onSessionState,
  onSessionInfo,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const startedRef = useRef(false);
  const [exited, setExited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);

  const startSession = async () => {
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    fit.fit();
    setError(null);
    setKeyError(null);
    setExited(false);
    try {
      const info = await api.startSession(
        workspace.id,
        tab.id,
        tab.cli,
        term.rows,
        term.cols,
      );
      onSessionInfo(tab.id, info);
      onSessionState(tab.id, true);
    } catch (e) {
      setError(String(e));
      onSessionState(tab.id, false);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: '"JetBrains Mono Variable", ui-monospace, SFMono-Regular, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      cursorBlink: true,
      allowProposedApi: true,
      scrollback: 10000,
      theme: {
        background: "#1f1e1b",
        foreground: "#f0eee7",
        cursor: "#d97757",
        cursorAccent: "#1f1e1b",
        selectionBackground: "#d9775744",
        black: "#1f1e1b",
        red: "#e0705d",
        green: "#8aa05f",
        yellow: "#c9944a",
        blue: "#7b9bc4",
        magenta: "#b07ba8",
        cyan: "#7fa8a0",
        white: "#f0eee7",
        brightBlack: "#5e5b54",
        brightRed: "#ef8a76",
        brightGreen: "#a3bd74",
        brightYellow: "#e0ab5e",
        brightBlue: "#94b4dd",
        brightMagenta: "#cc94c2",
        brightCyan: "#97c2ba",
        brightWhite: "#fffdf7",
      },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(containerRef.current);
    termRef.current = term;
    fitRef.current = fit;

    const dataDisposable = term.onData((data) => {
      api.writeSession(tab.id, data).catch(() => {});
    });

    const unlistenOutput = listen<PtyOutputPayload>("pty-output", (event) => {
      if (event.payload.session_id === tab.id) {
        term.write(event.payload.data);
      }
    });
    const unlistenExit = listen<{ session_id: string }>("pty-exit", (event) => {
      if (event.payload.session_id === tab.id) {
        setExited(true);
        onSessionState(tab.id, false);
        api.stopSession(tab.id).catch(() => {});
      }
    });
    const unlistenKeyError = listen<{ session_id: string; providers: string[] }>(
      "llm-key-error",
      (event) => {
        if (event.payload.session_id === tab.id) {
          const names = event.payload.providers.join(", ");
          setKeyError(
            `API key for ${names} may be invalid — update in Settings → Models.`,
          );
        }
      },
    );

    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current?.offsetParent) return;
      fit.fit();
      api.resizeSession(tab.id, term.rows, term.cols).catch(() => {});
    });
    resizeObserver.observe(containerRef.current);

    if (!startedRef.current) {
      startedRef.current = true;
      requestAnimationFrame(() => startSession());
    }

    return () => {
      dataDisposable.dispose();
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      unlistenKeyError.then((fn) => fn());
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab.id]);

  useEffect(() => {
    if (visible && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        if (termRef.current) {
          api.resizeSession(tab.id, termRef.current.rows, termRef.current.cols).catch(() => {});
          termRef.current.focus();
        }
      });
    }
  }, [visible, tab.id]);

  const sendCommand = (text: string) => {
    api.writeSession(tab.id, text + "\r").catch((e) => setError(String(e)));
    termRef.current?.focus();
  };

  return (
    <div className={visible ? "flex h-full min-h-0 flex-col" : "hidden"}>
      {error && (
        <div className="flex items-center gap-3 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <Button variant="outline" size="sm" className="h-7 shrink-0 text-xs" onClick={startSession}>
            <RefreshCw className="h-3 w-3" />
            Retry
          </Button>
        </div>
      )}

      {keyError && (
        <div className="flex items-center gap-3 border-b bg-destructive/10 px-4 py-2 text-sm text-destructive">
          <span className="min-w-0 flex-1 truncate">{keyError}</span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 shrink-0 text-xs"
            onClick={() => setKeyError(null)}
          >
            Dismiss
          </Button>
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-[#1f1e1b]">
        <div ref={containerRef} className="absolute inset-0 px-3 py-2" />
        {exited && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-[#2b2a27] px-8 py-6 shadow-2xl">
              <p className="text-sm text-[#f0eee7]/70">Session ended</p>
              <Button size="sm" onClick={startSession}>
                <RefreshCw className="h-3.5 w-3.5" />
                Restart {tab.label}
              </Button>
            </div>
          </div>
        )}
      </div>

      <CommandInput workspaceId={workspace.id} onSend={sendCommand} />
    </div>
  );
}

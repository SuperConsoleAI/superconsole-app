import { useEffect, useMemo, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { BookOpen, Bot, ClipboardList, Paperclip, Plug, Plus, RefreshCw, ScrollText, TextCursorInput, SquareSlash } from "lucide-react";
import { useRouter } from "@tanstack/react-router";
import {
  api,
  type Agent,
  type ContextFile,
  type SessionInfo,
  type SessionLogFile,
  type Skill,
  type SlashCommand,
  type Workspace,
  type WorkspaceConnector,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { StatusFooter } from "@/components/StatusFooter";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface TerminalPaneProps {
  workspace: Workspace;
  sessionId: string;
  cli: string;
  label: string;
  initialInput?: string;
  resumeId?: string;
  visible: boolean;
  onSessionState: (sessionId: string, live: boolean) => void;
  onSessionInfo: (sessionId: string, info: SessionInfo) => void;
  onOpenFiles: () => void;
  suggestedSplitDir: "horizontal" | "vertical";
  onSplit: () => void;
  onClose?: () => void;
  isOnlyPane?: boolean;
}

interface PtyOutputPayload {
  session_id: string;
  data: string;
}

export function TerminalPane({
  workspace,
  sessionId,
  cli,
  label,
  initialInput,
  resumeId,
  visible,
  onSessionState,
  onSessionInfo,
  onOpenFiles,
  suggestedSplitDir,
  onSplit,
  onClose,
  isOnlyPane,
}: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const startedRef = useRef(false);
  const scriptSentRef = useRef(false);
  const [exited, setExited] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [richOpen, setRichOpen] = useState(false);
  const [cmd, setCmd] = useState("");
  const [usage, setUsage] = useState({ tokens: 0, cost: 0 });
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Context dropdown — lazy loaded on first open
  const [skills, setSkills]           = useState<Skill[]>([]);
  const [connectors, setConnectors]   = useState<WorkspaceConnector[]>([]);
  const [commands, setCommands]       = useState<SlashCommand[]>([]);
  const [ctxFiles, setCtxFiles]       = useState<ContextFile[]>([]);
  const [agents, setAgents]           = useState<Agent[]>([]);
  const [sessionLogs, setSessionLogs] = useState<SessionLogFile[]>([]);
  const ctxLoadedRef = useRef(false);

  // Rich-input slash autocomplete
  const [slashSuggestions, setSlashSuggestions] = useState<Array<{ value: string; label: string; color: string }>>([]);
  const [slashToken, setSlashToken]   = useState("");
  const [slashSelected, setSlashSelected] = useState(0);

  const router = useRouter();
  const goSettingsTo = (tab: "account" | "org" | "project", section: string) =>
    router.navigate({ to: "/settings", search: { tab, section } });

  const ensureCtx = () => {
    if (ctxLoadedRef.current) return;
    ctxLoadedRef.current = true;
    api.listSkills(workspace.id).then(setSkills).catch(() => {});
    api.listWorkspaceConnectors(workspace.id).then(setConnectors).catch(() => {});
    api.listCommands(workspace.id).then(setCommands).catch(() => {});
    api.listContextFiles(workspace.id).then(setCtxFiles).catch(() => {});
    api.listAgents(workspace.id).then(setAgents).catch(() => {});
    api.listSessionLogFiles(workspace.id).then(setSessionLogs).catch(() => {});
  };

  /** All slash items — memoized so both onChange and the effect see the same fresh list. */
  const allSlashItems = useMemo(() => [
    ...skills.filter((s) => s.active).map((s) => ({ value: `/skill:${s.name}`, label: `/skill:${s.name}`, color: "#c9944a" })),
    ...ctxFiles.map((f) => ({ value: `/context:${f.slug}`, label: `/context:${f.slug}`, color: "#7b9bc4" })),
    ...commands.map((c) => ({ value: c.slash, label: c.slash, color: "#8aa05f" })),
    ...connectors.map((c) => ({ value: `/connector:${c.service}`, label: `/connector:${c.service}`, color: "#b07ba8" })),
    ...agents.map((a) => ({ value: `/agent:${a.name}`, label: `/agent:${a.name}`, color: "#7fa8a0" })),
    ...sessionLogs.map((s) => ({ value: `/session:${s.id}`, label: `/session:${s.id}`, color: "#5e5b54" })),
  ], [skills, ctxFiles, commands, connectors, agents, sessionLogs]);

  // Recompute suggestions whenever data arrives from ensureCtx (all async).
  useEffect(() => {
    if (!slashToken) return;
    const q = slashToken.slice(1).toLowerCase();
    const filtered = allSlashItems.filter((x) => !q || x.value.toLowerCase().includes(q)).slice(0, 40);
    setSlashSuggestions(filtered);
  }, [allSlashItems, slashToken]);

  /** Write a token directly to the live CLI pty (no \r, user presses Enter). Kept for future direct-inject use. */
  const writeToSession = (token: string) => {
    api.writeSession(sessionId, token).catch(() => {});
    termRef.current?.focus();
  };
  void writeToSession; // available for future use

  /** Insert a token into the rich textarea (appends at end). */
  const insertIntoRich = (token: string) => {
    setCmd((prev) => prev + (prev && !prev.endsWith(" ") ? " " : "") + token + " ");
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  /**
   * Route token from the [+] menu:
   * - Rich input open → insert into textarea (user reviews & sends)
   * - Rich input closed → type into the live CLI buffer (no \r — user presses Enter)
   */
  const addToken = (token: string) => {
    if (richOpen) {
      insertIntoRich(token);
    } else {
      writeToSession(token);
    }
  };

  /** Insert token into the rich text input at the current /word position. */
  const insertRichToken = (item: { value: string }) => {
    const pos = inputRef.current?.selectionStart ?? cmd.length;
    const before = cmd.slice(0, pos);
    const tokenStart = before.lastIndexOf(slashToken);
    const after = cmd.slice(pos);
    const next =
      tokenStart >= 0
        ? cmd.slice(0, tokenStart) + item.value + " " + after.trimStart()
        : cmd + item.value + " ";
    setCmd(next);
    setSlashSuggestions([]);
    setSlashToken("");
    setSlashSelected(0);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  useEffect(() => {
    const ta = inputRef.current;
    if (!ta) return;
    const max = 12 * 20 + 16;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, max)}px`;
  }, [cmd, richOpen]);

  const attachPath = async () => {
    try {
      const picked = await open({ multiple: true });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      const text = paths.map((p) => `"${p}"`).join(" ");
      if (richOpen) {
        const sep = cmd && !cmd.endsWith(" ") ? " " : "";
        setCmd(cmd + sep + text + " ");
        requestAnimationFrame(() => inputRef.current?.focus());
      } else {
        // No rich input open: type the path straight into the live CLI prompt.
        api.writeSession(sessionId, text + " ").catch(() => {});
        termRef.current?.focus();
      }
    } catch {
      /* cancelled */
    }
  };

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
        sessionId,
        cli,
        term.rows,
        term.cols,
        resumeId,
      );
      onSessionInfo(sessionId, info);
      onSessionState(sessionId, true);
      if (initialInput && !scriptSentRef.current) {
        scriptSentRef.current = true;
        setTimeout(() => {
          api.writeSession(sessionId, initialInput + "\r").catch(() => {});
        }, 400);
      }
    } catch (e) {
      setError(String(e));
      onSessionState(sessionId, false);
    }
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const term = new Terminal({
      fontFamily: '"JetBrainsMono Nerd Font", ui-monospace, SFMono-Regular, monospace',
      fontSize: 13,
      lineHeight: 1.0,
      cursorBlink: false,
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
      api.writeSession(sessionId, data).catch(() => {});
    });

    const unlistenOutput = listen<PtyOutputPayload>("pty-output", (event) => {
      if (event.payload.session_id === sessionId) {
        term.write(event.payload.data);
      }
    });
    const unlistenExit = listen<{ session_id: string }>("pty-exit", (event) => {
      if (event.payload.session_id === sessionId) {
        setExited(true);
        onSessionState(sessionId, false);
        api.stopSession(sessionId).catch(() => {});
      }
    });
    const unlistenUsage = listen<{ session_id: string; tokens: number; cost_usd: number }>(
      "session-usage",
      (event) => {
        if (event.payload.session_id === sessionId) {
          setUsage({ tokens: event.payload.tokens, cost: event.payload.cost_usd });
        }
      },
    );
    const unlistenKeyError = listen<{ session_id: string; providers: string[] }>(
      "llm-key-error",
      (event) => {
        if (event.payload.session_id === sessionId) {
          const names = event.payload.providers.join(", ");
          setKeyError(
            `API key for ${names} may be invalid — update in Settings → Models.`,
          );
        }
      },
    );

    let resizeRaf = 0;
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current?.offsetParent) return;
      cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {
          /* transient size during a resize storm */
        }
        api.resizeSession(sessionId, term.rows, term.cols).catch(() => {});
      });
    });
    resizeObserver.observe(containerRef.current);

    // xterm measures the character cell on open, so wait for the terminal font
    // to load before fitting/starting — otherwise it sizes the grid with the
    // fallback font's metrics and the CLI's prompt misaligns once the font swaps.
    const start = () => {
      requestAnimationFrame(() => {
        try {
          fit.fit();
        } catch {
          /* not visible yet */
        }
        if (!startedRef.current) {
          startedRef.current = true;
          startSession();
        } else {
          api.resizeSession(sessionId, term.rows, term.cols).catch(() => {});
        }
      });
    };
    document.fonts.ready.then(start, start);

    return () => {
      dataDisposable.dispose();
      unlistenOutput.then((fn) => fn());
      unlistenExit.then((fn) => fn());
      unlistenUsage.then((fn) => fn());
      unlistenKeyError.then((fn) => fn());
      cancelAnimationFrame(resizeRaf);
      resizeObserver.disconnect();
      term.dispose();
      termRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    if (visible && fitRef.current && termRef.current) {
      requestAnimationFrame(() => {
        fitRef.current?.fit();
        if (termRef.current) {
          api.resizeSession(sessionId, termRef.current.rows, termRef.current.cols).catch(() => {});
          termRef.current.focus();
        }
      });
    }
  }, [visible, sessionId]);

  const sendCommand = (text: string) => {
    api.writeSession(sessionId, text + "\r").catch((e) => setError(String(e)));
    termRef.current?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
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

      <div className="group/pane relative min-h-0 flex-1 bg-[#1f1e1b]">
        <div ref={containerRef} className="absolute inset-0 px-3 py-2" />
        
        <div className="absolute right-2 top-1.5 z-10 flex items-center gap-0 opacity-100">
          <button
            className="flex h-5 w-5 items-center justify-center text-[#5e5b54] transition-colors"
            onClick={() => onSplit()}
            title={`Split ${suggestedSplitDir}`}
          >
            {suggestedSplitDir === "horizontal" ? (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="1" />
                <line x1="8" y1="2" x2="8" y2="14" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="2" width="12" height="12" rx="1" />
                <line x1="2" y1="8" x2="14" y2="8" />
              </svg>
            )}
          </button>
          {!isOnlyPane && (
            <button
              className="flex h-5 w-5 items-center justify-center text-[#5e5b54] transition-colors"
              onClick={() => onClose?.()}
              title="Close pane"
            >
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="4" x2="12" y2="12" />
                <line x1="12" y1="4" x2="4" y2="12" />
              </svg>
            </button>
          )}
        </div>

        {exited && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 backdrop-blur-[2px]">
            <div className="flex flex-col items-center gap-3 rounded-xl border border-white/10 bg-[#2b2a27] px-8 py-6 shadow-2xl">
              <p className="text-sm text-[#f0eee7]/70">Session ended</p>
              <Button size="sm" onClick={startSession}>
                <RefreshCw className="h-3.5 w-3.5" />
                Restart {label}
              </Button>
            </div>
          </div>
        )}
      </div>

      {richOpen && (
        <div className="relative z-10">
          {/* Slash autocomplete overlay for rich input */}
          {slashSuggestions.length > 0 && (
            <div className="absolute bottom-full left-0 right-0 max-h-52 overflow-y-auto border border-white/15 bg-[#1f1e1b] shadow-xl">
              {slashSuggestions.map((item, i) => (
                <button
                  key={item.value}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left font-mono text-xs ${
                    i === slashSelected
                      ? "bg-white/12 text-[#f0eee7]"
                      : "text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7]"
                  }`}
                  onMouseEnter={() => setSlashSelected(i)}
                  onMouseDown={(e) => { e.preventDefault(); insertRichToken(item); }}
                >
                  <span style={{ color: item.color }}>{item.label}</span>
                </button>
              ))}
            </div>
          )}
          <textarea
            ref={inputRef}
            value={cmd}
            onChange={(e) => {
              const next = e.target.value;
              setCmd(next);
              const pos = e.target.selectionStart ?? next.length;
              const before = next.slice(0, pos);
              const match = before.match(/(?:^|\s)(\/.*)$/);
              if (match) {
                const tok = match[1];
                ensureCtx(); // start loading data immediately
                setSlashToken(tok);
                const q = tok.slice(1).toLowerCase();
                const filtered = allSlashItems.filter(
                  (x) => !q || x.value.toLowerCase().includes(q),
                ).slice(0, 40);
                setSlashSuggestions(filtered);
                setSlashSelected(0);
              } else {
                setSlashSuggestions([]);
                setSlashToken("");
              }
            }}
            onKeyDown={(e) => {
              if (slashSuggestions.length > 0) {
                if (e.key === "ArrowDown") {
                  e.preventDefault();
                  setSlashSelected((s) => (s + 1) % slashSuggestions.length);
                  return;
                }
                if (e.key === "ArrowUp") {
                  e.preventDefault();
                  setSlashSelected((s) => (s - 1 + slashSuggestions.length) % slashSuggestions.length);
                  return;
                }
                if (e.key === "Tab" || e.key === "Enter") {
                  e.preventDefault();
                  insertRichToken(slashSuggestions[slashSelected]);
                  return;
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  setSlashSuggestions([]);
                  setSlashToken("");
                  return;
                }
              }
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                const t = cmd.trim();
                if (t) { sendCommand(t); setCmd(""); setSlashSuggestions([]); }
              }
            }}
            rows={1}
            autoFocus
            placeholder="Type a message or / to insert skills, context, commands…"
            style={{ lineHeight: "20px" }}
            className="max-h-64 min-h-[2.25rem] w-full resize-none border-t border-border bg-background px-3 py-2 font-mono text-sm placeholder:text-muted-foreground/50 focus-visible:outline-none"
            spellCheck={false}
          />
        </div>
      )}

      <StatusFooter
        workspace={workspace}
        onOpenFiles={onOpenFiles}
        tokens={exited ? usage.tokens : 0}
        cost={exited ? usage.cost : 0}
        leftExtra={
          <>
            <DropdownMenu onOpenChange={(o) => { if (o) ensureCtx(); }}>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-0.5 rounded border px-1.5 py-0.5 hover:text-foreground"
                  title="Insert context into session"
                >
                  <Plus className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                side="top"
                align="start"
                className="w-44 rounded border border-white/15 bg-[#1f1e1b] p-0.5 text-[#f0eee7] shadow-xl"
              >
                {/* Attach file */}
                <DropdownMenuItem
                  onClick={attachPath}
                  className="gap-2 rounded px-2 py-1.5 text-xs text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7] font-mono"
                >
                  <Paperclip className="h-3.5 w-3.5 shrink-0 opacity-50" />
                  Attach file
                </DropdownMenuItem>

                <DropdownMenuSeparator className="my-0.5 bg-white/10" />

                {/* Skills sub-menu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="gap-2 rounded px-2 py-1.5 text-xs font-mono text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7] data-[state=open]:bg-white/8"
                  >
                    <ScrollText className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="text-[#c9944a]">Skills</span>
                    <span className="ml-auto text-[10px] text-[#5e5b54]">{skills.filter(s => s.active).length}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-64 w-52 overflow-y-auto rounded border border-white/15 bg-[#1f1e1b] p-0.5 shadow-xl"
                  >
                    {skills.filter((s) => s.active).length === 0 ? (
                      <div className="px-3 py-2 text-[11px] font-mono text-[#5e5b54]">No active skills</div>
                    ) : (
                      skills.filter((s) => s.active).map((s) => (
                        <DropdownMenuItem
                          key={s.name}
                          onClick={() => addToken(`/skill:${s.name}`)}
                          className="gap-0 rounded px-2 py-1.5 font-mono text-xs text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7]"
                        >
                          {s.name}
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator className="my-0.5 bg-white/10" />
                    <DropdownMenuItem
                      onClick={() => goSettingsTo("project", "Skills")}
                      className="gap-1.5 rounded px-2 py-1.5 text-xs text-[#5e5b54] hover:bg-white/8 hover:text-[#f0eee7]"
                    >
                      <Plus className="h-3 w-3" /> Add skill
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Agents sub-menu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="gap-2 rounded px-2 py-1.5 text-xs font-mono text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7] data-[state=open]:bg-white/8"
                  >
                    <Bot className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="text-[#7fa8a0]">Agents</span>
                    <span className="ml-auto text-[10px] text-[#5e5b54]">{agents.length}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-64 w-52 overflow-y-auto rounded border border-white/15 bg-[#1f1e1b] p-0.5 shadow-xl"
                  >
                    {agents.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] font-mono text-[#5e5b54]">No agents</div>
                    ) : (
                      agents.map((a) => (
                        <DropdownMenuItem
                          key={a.name}
                          onClick={() => addToken(`/agent:${a.name}`)}
                          className="gap-0 rounded px-2 py-1.5 font-mono text-xs text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7]"
                        >
                          {a.name}
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator className="my-0.5 bg-white/10" />
                    <DropdownMenuItem
                      onClick={() => router.navigate({ to: "/agents" })}
                      className="gap-1.5 rounded px-2 py-1.5 text-xs text-[#5e5b54] hover:bg-white/8 hover:text-[#f0eee7]"
                    >
                      <Plus className="h-3 w-3" /> Add agent
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Context sub-menu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="gap-2 rounded px-2 py-1.5 text-xs font-mono text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7] data-[state=open]:bg-white/8"
                  >
                    <BookOpen className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="text-[#7b9bc4]">Context</span>
                    <span className="ml-auto text-[10px] text-[#5e5b54]">{ctxFiles.length}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-64 w-52 overflow-y-auto rounded border border-white/15 bg-[#1f1e1b] p-0.5 shadow-xl"
                  >
                    {ctxFiles.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] font-mono text-[#5e5b54]">No context files</div>
                    ) : (
                      ctxFiles.map((f) => (
                        <DropdownMenuItem
                          key={f.slug}
                          onClick={() => addToken(`/context:${f.slug}`)}
                          className="gap-0 rounded px-2 py-1.5 font-mono text-xs text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7]"
                        >
                          {f.slug}
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator className="my-0.5 bg-white/10" />
                    <DropdownMenuItem
                      onClick={() => goSettingsTo("project", "Context")}
                      className="gap-1.5 rounded px-2 py-1.5 text-xs text-[#5e5b54] hover:bg-white/8 hover:text-[#f0eee7]"
                    >
                      <Plus className="h-3 w-3" /> Add context file
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Commands sub-menu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="gap-2 rounded px-2 py-1.5 text-xs font-mono text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7] data-[state=open]:bg-white/8"
                  >
                    <SquareSlash className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="text-[#8aa05f]">Commands</span>
                    <span className="ml-auto text-[10px] text-[#5e5b54]">{commands.length}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-64 w-52 overflow-y-auto rounded border border-white/15 bg-[#1f1e1b] p-0.5 shadow-xl"
                  >
                    {commands.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] font-mono text-[#5e5b54]">No commands</div>
                    ) : (
                      commands.map((c) => (
                        <DropdownMenuItem
                          key={c.file_path}
                          onClick={() => addToken(c.slash)}
                          className="rounded px-2 py-1.5 font-mono text-xs text-[#8aa05f] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7]"
                        >
                          {c.slash}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Connectors sub-menu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="gap-2 rounded px-2 py-1.5 text-xs font-mono text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7] data-[state=open]:bg-white/8"
                  >
                    <Plug className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="text-[#b07ba8]">Connectors</span>
                    <span className="ml-auto text-[10px] text-[#5e5b54]">{connectors.length}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-64 w-52 overflow-y-auto rounded border border-white/15 bg-[#1f1e1b] p-0.5 shadow-xl"
                  >
                    {connectors.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] font-mono text-[#5e5b54]">No connectors</div>
                    ) : (
                      connectors.map((c) => (
                        <DropdownMenuItem
                          key={`${c.scope}-${c.service}`}
                          onClick={() => addToken(`/connector:${c.service}`)}
                          className="gap-0 rounded px-2 py-1.5 font-mono text-xs text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7]"
                        >
                          {c.service}
                        </DropdownMenuItem>
                      ))
                    )}
                    <DropdownMenuSeparator className="my-0.5 bg-white/10" />
                    <DropdownMenuItem
                      onClick={() => goSettingsTo("project", "Connectors")}
                      className="gap-1.5 rounded px-2 py-1.5 text-xs text-[#5e5b54] hover:bg-white/8 hover:text-[#f0eee7]"
                    >
                      <Plus className="h-3 w-3" /> Add connector
                    </DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>

                {/* Sessions sub-menu */}
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger
                    className="gap-2 rounded px-2 py-1.5 text-xs font-mono text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7] data-[state=open]:bg-white/8"
                  >
                    <ClipboardList className="h-3.5 w-3.5 shrink-0 opacity-50" />
                    <span className="text-[#7fa8a0]">Sessions</span>
                    <span className="ml-auto text-[10px] text-[#5e5b54]">{sessionLogs.length}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent
                    className="max-h-64 w-60 overflow-y-auto rounded border border-white/15 bg-[#1f1e1b] p-0.5 shadow-xl"
                  >
                    {sessionLogs.length === 0 ? (
                      <div className="px-3 py-2 text-[11px] font-mono text-[#5e5b54]">No saved sessions</div>
                    ) : (
                      sessionLogs.map((s) => (
                        <DropdownMenuItem
                          key={s.id}
                          onClick={() => addToken(`/session:${s.id}`)}
                          className="flex-col items-start gap-0 rounded px-2 py-1.5 font-mono text-xs text-[#c9c5bc] hover:bg-white/8 hover:text-[#f0eee7] focus:bg-white/8 focus:text-[#f0eee7]"
                        >
                          <span className="truncate w-full">{s.id}</span>
                          {s.summary && (
                            <span className="truncate w-full text-[10px] text-[#5e5b54]">{s.summary}</span>
                          )}
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Rich text input toggle */}
            <button
              className={
                "flex items-center gap-1 rounded border px-1.5 py-0.5 hover:text-foreground" +
                (richOpen ? " text-foreground" : "")
              }
              title="Rich text input"
              onClick={() => setRichOpen((o) => !o)}
            >
              <TextCursorInput className="h-3 w-3" />
              Rich Text
            </button>
          </>
        }
      />
    </div>
  );
}

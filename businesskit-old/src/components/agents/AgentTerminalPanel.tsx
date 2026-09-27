// src/components/agents/AgentTerminalPanel.tsx
// Phase 9 — Terminal Mode PTY panel for BusinessKit.
// Uses xterm.js (npm) + xterm-addon-fit. No CDN loading (Tauri CSP safe).
// Renders ONLY the terminal area — the composer box stays in AgentChatSidebar
// so the user gets slash commands, model picker, file attach, all working.

// xterm CSS — Vite bundles this so Tauri's CSP doesn't block it
import "xterm/css/xterm.css";

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  useStylesScoped$,
  type PropFunction,
} from "@builder.io/qwik";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { LuLoader, LuAlertCircle } from "@qwikest/icons/lucide";
import {
  startTerminalSession,
  writeTerminalInput,
  resizeTerminalSession,
} from "~/lib/ipc";

interface Props {
  sessionId: string;
  profileId: string;
  cli: string;        // "claude" | "codex" | "antigravity"
  provider: string;   // for ProviderIcon
  resumeId?: string;
  onStop$?: PropFunction<() => void>;
}

const STYLES = `
  .pty-panel {
    display: flex;
    flex-direction: column;
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-1);
  }
  .pty-terminal-wrap {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-2);
    box-sizing: border-box;
    position: relative;
  }
  .pty-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    background: var(--surface-2);
    z-index: 10;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }
  .pty-terminal-wrap .xterm {
    height: 100%;
    padding: 4px 6px;
  }
  .pty-terminal-wrap .xterm-viewport {
    overflow-y: auto !important;
    background: transparent !important;
  }
  .pty-terminal-wrap .xterm-screen {
    background: transparent !important;
  }
  .pty-terminal-wrap .xterm-rows {
    padding: 10px 12px !important;
  }
`;

export const AgentTerminalPanel = component$<Props>(
  ({ sessionId, profileId, cli, resumeId }) => {
    useStylesScoped$(STYLES);

    const terminalRef = useSignal<HTMLDivElement>();
    const isStarting = useSignal(true);
    const isExited = useSignal(false);
    const errorMsg = useSignal("");
    const workspacePath = useSignal("");

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ cleanup }) => {
      let xtermInstance: import("xterm").Terminal | null = null;
      let fitAddon: import("xterm-addon-fit").FitAddon | null = null;
      let unlistenOutput: UnlistenFn | undefined;
      let unlistenExit: UnlistenFn | undefined;
      let resizeObserver: ResizeObserver | undefined;

      const init = async () => {
        try {
          // Dynamic import — bundled by Vite, no CDN needed
          const { Terminal } = await import("xterm");
          const { FitAddon } = await import("xterm-addon-fit");


          if (!terminalRef.value) return;


          // Read actual surface-2 color from CSS so xterm canvas matches the bg
          const surface2 = getComputedStyle(document.documentElement)
            .getPropertyValue("--surface-2").trim() || "#161b22";
          const fgColor = getComputedStyle(document.documentElement)
            .getPropertyValue("--text-primary").trim() || "#e6edf3";

          xtermInstance = new Terminal({
            allowTransparency: false,
            theme: {
              background: surface2,
              foreground: fgColor,
              cursor: "#79c0ff",
              cursorAccent: surface2,
              selectionBackground: "rgba(121,192,255,0.2)",
              black: "#21262d",
              red: "#ff7b72",
              green: "#7ee787",
              yellow: "#e3b341",
              blue: "#79c0ff",
              magenta: "#d2a8ff",
              cyan: "#56d364",
              white: "#e6edf3",
              brightBlack: "#484f58",
              brightRed: "#ffa198",
              brightGreen: "#56d364",
              brightYellow: "#e3b341",
              brightBlue: "#79c0ff",
              brightMagenta: "#d2a8ff",
              brightCyan: "#87d5e1",
              brightWhite: "#ffffff",
            },
            fontFamily: '"Cascadia Code", "JetBrains Mono", "Fira Code", ui-monospace, monospace',
            fontSize: 13,
            lineHeight: 1.45,
            letterSpacing: 0,
            cursorBlink: true,
            cursorStyle: "bar",
            scrollback: 5000,
            convertEol: true,
            allowProposedApi: true,
          });

          fitAddon = new FitAddon();
          xtermInstance.loadAddon(fitAddon);
          xtermInstance.open(terminalRef.value);

          // Fit after a tick so the container has measured its size
          setTimeout(() => fitAddon?.fit(), 50);

          // Keystrokes → PTY
          xtermInstance.onData((data: string) => {
            writeTerminalInput(sessionId, data).catch(() => {});
          });

          // Tauri events
          unlistenOutput = await listen<{ session_id: string; data: string }>(
            "pty-output",
            (ev) => {
              if (ev.payload.session_id === sessionId) {
                xtermInstance?.write(ev.payload.data);
              }
            }
          );

          unlistenExit = await listen<{ session_id: string }>(
            "pty-exit",
            (ev) => {
              if (ev.payload.session_id === sessionId) {
                isExited.value = true;
                xtermInstance?.write("\r\n\x1b[33m[Process exited]\x1b[0m\r\n");
              }
            }
          );

          // Measure container size before opening PTY so rows/cols match sidebar width
          try {
            fitAddon.fit();
          } catch {
            // ignore
          }
          const initialRows = (xtermInstance.rows && xtermInstance.rows > 5) ? xtermInstance.rows : 24;
          const initialCols = (xtermInstance.cols && xtermInstance.cols > 20) ? xtermInstance.cols : 80;

          // Start PTY in Rust
          const info = await startTerminalSession(
            profileId,
            sessionId,
            cli,
            initialRows,
            initialCols,
            resumeId
          );
          workspacePath.value = info.workspace_path;
          try {
            if (info.workspace_path) {
              localStorage.setItem("bk-terminal-workspace-path", info.workspace_path);
              if (typeof window !== "undefined") {
                window.dispatchEvent(
                  new CustomEvent("bk-terminal-workspace-path", {
                    detail: { path: info.workspace_path, sessionId },
                  })
                );
              }
            }
          } catch {
            // ignore
          }
          isStarting.value = false;

          // Replay buffered historical output if re-attaching to existing session
          if (info.history) {
            xtermInstance?.write(info.history);
          }

          // Fit again once PTY is confirmed running
          setTimeout(() => {
            try {
              fitAddon?.fit();
              xtermInstance?.focus();
            } catch {
              // ignore
            }
          }, 80);

          // ResizeObserver → keep PTY size in sync and redraw when revealed
          resizeObserver = new ResizeObserver(() => {
            try {
              fitAddon?.fit();
              if (xtermInstance) {
                resizeTerminalSession(sessionId, xtermInstance.rows, xtermInstance.cols).catch(() => {});
                xtermInstance.refresh(0, Math.max(0, xtermInstance.rows - 1));
              }
            } catch {
              // ignore
            }
          });
          if (terminalRef.value.parentElement) {
            resizeObserver.observe(terminalRef.value.parentElement);
          }

        } catch (err: any) {
          isStarting.value = false;
          errorMsg.value = err?.message || "Failed to start terminal";
        }
      };

      init();

      cleanup(() => {
        resizeObserver?.disconnect();
        unlistenOutput?.();
        unlistenExit?.();
        xtermInstance?.dispose();
      });
    });

    const cliLabel =
      cli === "claude" ? "Claude Code"
      : cli === "codex" ? "Codex"
      : "Antigravity";

    return (
      <div class="pty-panel">
        {/* xterm.js terminal — always in DOM so xterm gets real dimensions */}
        <div
          ref={terminalRef}
          class="pty-terminal-wrap"
          style="flex:1;min-height:0;cursor:text;"
          onClick$={$(() => {
            const el = terminalRef.value?.querySelector(".xterm-helper-textarea") as HTMLTextAreaElement | null;
            el?.focus();
          })}
        >
          {/* Loading overlay */}
          {isStarting.value && !errorMsg.value && (
            <div class="pty-overlay">
              <LuLoader style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
              <span>Starting {cliLabel}…</span>
            </div>
          )}
          {/* Error overlay */}
          {errorMsg.value && (
            <div class="pty-overlay" style="gap:0.75rem;padding:1.5rem;text-align:center;flex-direction:column;">
              <LuAlertCircle style="width:1.5rem;height:1.5rem;color:var(--error);" />
              <span style="font-size:0.8125rem;color:var(--error);font-family:monospace;">{errorMsg.value}</span>
              <span style="font-size:0.75rem;">
                Install {cli === "claude" ? "Claude Code (npm i -g @anthropic-ai/claude-code)" : cli === "codex" ? "Codex CLI" : "Antigravity CLI"} first
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
);

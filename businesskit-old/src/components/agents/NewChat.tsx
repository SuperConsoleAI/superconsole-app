// src/components/agents/NewChat.tsx
// Split-combo New Chat button and popover dropdown menu for Agent Chat.
// Extracted from AgentChatSidebar to share across sidebar and full-page dashboard.
// Supports Hosted Agent chat, local CLI chats (Antigravity, Claude Code, Codex),
// and Desktop Terminal (PTY) modes (Terminal Claude, Terminal Codex, Terminal Antigravity).

import {
  component$,
  type Signal,
  type PropFunction,
  $,
} from "@builder.io/qwik";
import {
  LuPlus,
  LuMessageSquare,
  LuChevronDown,
  LuCheck,
  LuTerminal,
} from "@qwikest/icons/lucide";
import { ProviderIcon } from "~/components/common/ProviderIcon";

export type NewChatMode =
  | "chat"
  | "cli_antigravity"
  | "cli_claude"
  | "cli_codex"
  | "cli_terminal_claude"
  | "cli_terminal_codex"
  | "cli_terminal_antigravity";

export function getModeLabel(mode: NewChatMode): string {
  switch (mode) {
    case "cli_antigravity":
      return "Antigravity CLI";
    case "cli_claude":
      return "Claude Code CLI";
    case "cli_codex":
      return "Codex CLI";
    case "cli_terminal_claude":
      return "Terminal · Claude";
    case "cli_terminal_codex":
      return "Terminal · Codex";
    case "cli_terminal_antigravity":
      return "Terminal · Antigravity";
    case "chat":
    default:
      return "New Chat";
  }
}

export interface NewChatProps {
  currentMode: Signal<NewChatMode>;
  isOpen: Signal<boolean>;
  isDesktop?: Signal<boolean>;
  onNewChat$: PropFunction<(mode: NewChatMode) => void>;
  class?: string;
  style?: string;
}

export const NewChat = component$<NewChatProps>((props) => {
  const isDesktop = props.isDesktop?.value ?? true;
  const currentMode = props.currentMode.value;
  const effectiveMode = isDesktop ? currentMode : "chat";
  const isOpen = props.isOpen.value;
  const modeLabel = getModeLabel(effectiveMode);

  return (
    <div
      class={["new-chat-split-wrap", props.class].filter(Boolean).join(" ")}
      style={`position:relative;display:inline-flex;align-items:center;${props.style || ""}`}
    >
      <div
        style={`display:inline-flex;align-items:center;height:1.875rem;border-radius:0.375rem;border:1px solid ${
          isOpen ? "var(--accent, #6366f1)" : "var(--border)"
        };background:${
          isOpen ? "rgba(99,102,241,0.08)" : "transparent"
        };box-sizing:border-box;transition:all 0.15s ease;overflow:hidden;flex-shrink:0;`}
      >
        {/* Left Side: Active Engine / Mode Selector Trigger */}
        <button
          type="button"
          data-agent-trigger="true"
          onClick$={$(() => {
            props.isOpen.value = !props.isOpen.value;
          })}
          title={`Default Engine: ${modeLabel} (click to change default)`}
          style="display:inline-flex;align-items:center;gap:0.25rem;height:100%;padding:0 0.35rem 0 0.4rem;border:none;background:transparent;color:var(--text-primary);cursor:pointer;outline:none;transition:background 0.12s ease;"
          onMouseEnter$={(e, el) => {
            el.style.background = "var(--surface-3)";
          }}
          onMouseLeave$={(e, el) => {
            el.style.background = "transparent";
          }}
        >
          {effectiveMode === "chat" ? (
            <LuMessageSquare style="width:0.875rem;height:0.875rem;color:var(--text-primary);" />
          ) : effectiveMode.startsWith("cli_terminal") ? (
            <div style="position:relative;width:0.875rem;height:0.875rem;display:flex;align-items:center;justify-content:center;">
              <ProviderIcon
                provider={
                  effectiveMode === "cli_terminal_antigravity"
                    ? "cli_antigravity"
                    : effectiveMode === "cli_terminal_codex"
                    ? "cli_codex"
                    : "cli_claude"
                }
                size="0.875rem"
              />
              <LuTerminal style="position:absolute;bottom:-3px;right:-4px;width:0.6rem;height:0.6rem;color:#3b82f6;background:var(--surface-2);border-radius:2px;padding:0.5px;" />
            </div>
          ) : (
            <ProviderIcon provider={effectiveMode} size="0.875rem" />
          )}
          <LuChevronDown
            style={`width:0.6875rem;height:0.6875rem;color:var(--text-secondary);transition:transform 0.15s ease;${
              isOpen ? "transform:rotate(180deg);" : ""
            }`}
          />
        </button>

        {/* Vertical Divider */}
        <div style="width:1px;height:1rem;background:var(--border);flex-shrink:0;" />

        {/* Right Side: Quick Action [+] Launch Button */}
        <button
          type="button"
          onClick$={$(() => {
            props.isOpen.value = false;
            props.onNewChat$(effectiveMode);
          })}
          title={`Start new ${modeLabel} (+)`}
          style="display:inline-flex;align-items:center;justify-content:center;width:1.45rem;height:100%;padding:0;border:none;background:transparent;color:var(--text-primary);cursor:pointer;outline:none;transition:background 0.12s ease;"
          onMouseEnter$={(e, el) => {
            el.style.background = "var(--surface-3)";
          }}
          onMouseLeave$={(e, el) => {
            el.style.background = "transparent";
          }}
        >
          <LuPlus style="width:0.875rem;height:0.875rem;" />
        </button>
      </div>

      {/* Popover Dropdown Menu */}
      {isOpen && (
        <div
          data-agent-popover="true"
          style="position:absolute;right:0;top:calc(100% + 6px);width:225px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 12px 32px rgba(0,0,0,0.25);z-index:110;padding:0.375rem;display:flex;flex-direction:column;gap:3px;"
        >
          {/* 1. New Chat (Hosted Agent) */}
          <button
            type="button"
            onClick$={$(() => {
              props.currentMode.value = "chat";
              localStorage.setItem("bk-sidebar-newchat-mode", "chat");
              props.isOpen.value = false;
              props.onNewChat$("chat");
            })}
            style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:${
              currentMode === "chat" ? "rgba(99,102,241,0.1)" : "transparent"
            };color:var(--text-primary);transition:background 0.12s;`}
            onMouseEnter$={$((_, el) => (el.style.background = currentMode === "chat" ? "rgba(99,102,241,0.15)" : "var(--surface-3)"))}
            onMouseLeave$={$((_, el) => (el.style.background = currentMode === "chat" ? "rgba(99,102,241,0.1)" : "transparent"))}
          >
            <div style="display:flex;align-items:center;gap:0.625rem;">
              <LuMessageSquare style="width:1.125rem;height:1.125rem;color:var(--text-secondary);flex-shrink:0;" />
              <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">New Chat</span>
            </div>
            {currentMode === "chat" && (
              <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent, #6366f1);" />
            )}
          </button>

          {/* ── CLI & Terminal (PTY) Mode options — Desktop only ── */}
          {isDesktop && (
            <>
              <div style="height:1px;background:var(--border);margin:2px 0;" />

              {/* 2. Antigravity CLI (AGY) */}
              <button
                type="button"
                onClick$={$(() => {
                  props.currentMode.value = "cli_antigravity";
                  localStorage.setItem("bk-sidebar-newchat-mode", "cli_antigravity");
                  props.isOpen.value = false;
                  props.onNewChat$("cli_antigravity");
                })}
                style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:${
                  currentMode === "cli_antigravity" ? "rgba(99,102,241,0.1)" : "transparent"
                };color:var(--text-primary);transition:background 0.12s;`}
                onMouseEnter$={$((_, el) => (el.style.background = currentMode === "cli_antigravity" ? "rgba(99,102,241,0.15)" : "var(--surface-3)"))}
                onMouseLeave$={$((_, el) => (el.style.background = currentMode === "cli_antigravity" ? "rgba(99,102,241,0.1)" : "transparent"))}
              >
                <div style="display:flex;align-items:center;gap:0.625rem;">
                  <ProviderIcon provider="cli_antigravity" size="1.125rem" />
                  <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">Antigravity CLI</span>
                </div>
                {currentMode === "cli_antigravity" && (
                  <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent, #6366f1);" />
                )}
              </button>

              {/* 3. Claude Code CLI */}
              <button
                type="button"
                onClick$={$(() => {
                  props.currentMode.value = "cli_claude";
                  localStorage.setItem("bk-sidebar-newchat-mode", "cli_claude");
                  props.isOpen.value = false;
                  props.onNewChat$("cli_claude");
                })}
                style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:${
                  currentMode === "cli_claude" ? "rgba(99,102,241,0.1)" : "transparent"
                };color:var(--text-primary);transition:background 0.12s;`}
                onMouseEnter$={$((_, el) => (el.style.background = currentMode === "cli_claude" ? "rgba(99,102,241,0.15)" : "var(--surface-3)"))}
                onMouseLeave$={$((_, el) => (el.style.background = currentMode === "cli_claude" ? "rgba(99,102,241,0.1)" : "transparent"))}
              >
                <div style="display:flex;align-items:center;gap:0.625rem;">
                  <ProviderIcon provider="cli_claude" size="1.125rem" />
                  <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">Claude Code CLI</span>
                </div>
                {currentMode === "cli_claude" && (
                  <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent, #6366f1);" />
                )}
              </button>

              {/* 4. Codex CLI */}
              <button
                type="button"
                onClick$={$(() => {
                  props.currentMode.value = "cli_codex";
                  localStorage.setItem("bk-sidebar-newchat-mode", "cli_codex");
                  props.isOpen.value = false;
                  props.onNewChat$("cli_codex");
                })}
                style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:${
                  currentMode === "cli_codex" ? "rgba(99,102,241,0.1)" : "transparent"
                };color:var(--text-primary);transition:background 0.12s;`}
                onMouseEnter$={$((_, el) => (el.style.background = currentMode === "cli_codex" ? "rgba(99,102,241,0.15)" : "var(--surface-3)"))}
                onMouseLeave$={$((_, el) => (el.style.background = currentMode === "cli_codex" ? "rgba(99,102,241,0.1)" : "transparent"))}
              >
                <div style="display:flex;align-items:center;gap:0.625rem;">
                  <ProviderIcon provider="cli_codex" size="1.125rem" />
                  <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">Codex CLI</span>
                </div>
                {currentMode === "cli_codex" && (
                  <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent, #6366f1);" />
                )}
              </button>

              <div style="height:1px;background:var(--border);margin:4px 0;" />

              {/* 5. Terminal · Claude */}
              <button
                type="button"
                onClick$={$(() => {
                  props.currentMode.value = "cli_terminal_claude";
                  localStorage.setItem("bk-sidebar-newchat-mode", "cli_terminal_claude");
                  props.isOpen.value = false;
                  props.onNewChat$("cli_terminal_claude");
                })}
                style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:${
                  currentMode === "cli_terminal_claude" ? "rgba(59,130,246,0.08)" : "transparent"
                };color:var(--text-primary);transition:background 0.12s;`}
                onMouseEnter$={$((_, el) => (el.style.background = currentMode === "cli_terminal_claude" ? "rgba(59,130,246,0.13)" : "var(--surface-3)"))}
                onMouseLeave$={$((_, el) => (el.style.background = currentMode === "cli_terminal_claude" ? "rgba(59,130,246,0.08)" : "transparent"))}
              >
                <div style="display:flex;align-items:center;gap:0.625rem;">
                  <div style="position:relative;width:1.125rem;height:1.125rem;display:flex;align-items:center;justify-content:center;">
                    <ProviderIcon provider="cli_claude" size="1.125rem" />
                    <LuTerminal style="position:absolute;bottom:-3px;right:-4px;width:0.75rem;height:0.75rem;color:#3b82f6;background:var(--surface-2);border-radius:2px;padding:1px;" />
                  </div>
                  <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">Terminal · Claude</span>
                </div>
                {currentMode === "cli_terminal_claude" && (
                  <LuCheck style="width:0.875rem;height:0.875rem;color:#3b82f6;" />
                )}
              </button>

              {/* 6. Terminal · Codex */}
              <button
                type="button"
                onClick$={$(() => {
                  props.currentMode.value = "cli_terminal_codex";
                  localStorage.setItem("bk-sidebar-newchat-mode", "cli_terminal_codex");
                  props.isOpen.value = false;
                  props.onNewChat$("cli_terminal_codex");
                })}
                style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:${
                  currentMode === "cli_terminal_codex" ? "rgba(59,130,246,0.08)" : "transparent"
                };color:var(--text-primary);transition:background 0.12s;`}
                onMouseEnter$={$((_, el) => (el.style.background = currentMode === "cli_terminal_codex" ? "rgba(59,130,246,0.13)" : "var(--surface-3)"))}
                onMouseLeave$={$((_, el) => (el.style.background = currentMode === "cli_terminal_codex" ? "rgba(59,130,246,0.08)" : "transparent"))}
              >
                <div style="display:flex;align-items:center;gap:0.625rem;">
                  <div style="position:relative;width:1.125rem;height:1.125rem;display:flex;align-items:center;justify-content:center;">
                    <ProviderIcon provider="cli_codex" size="1.125rem" />
                    <LuTerminal style="position:absolute;bottom:-3px;right:-4px;width:0.75rem;height:0.75rem;color:#3b82f6;background:var(--surface-2);border-radius:2px;padding:1px;" />
                  </div>
                  <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">Terminal · Codex</span>
                </div>
                {currentMode === "cli_terminal_codex" && (
                  <LuCheck style="width:0.875rem;height:0.875rem;color:#3b82f6;" />
                )}
              </button>

              {/* 7. Terminal · Antigravity */}
              <button
                type="button"
                onClick$={$(() => {
                  props.currentMode.value = "cli_terminal_antigravity";
                  localStorage.setItem("bk-sidebar-newchat-mode", "cli_terminal_antigravity");
                  props.isOpen.value = false;
                  props.onNewChat$("cli_terminal_antigravity");
                })}
                style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:${
                  currentMode === "cli_terminal_antigravity" ? "rgba(59,130,246,0.08)" : "transparent"
                };color:var(--text-primary);transition:background 0.12s;`}
                onMouseEnter$={$((_, el) => (el.style.background = currentMode === "cli_terminal_antigravity" ? "rgba(59,130,246,0.13)" : "var(--surface-3)"))}
                onMouseLeave$={$((_, el) => (el.style.background = currentMode === "cli_terminal_antigravity" ? "rgba(59,130,246,0.08)" : "transparent"))}
              >
                <div style="display:flex;align-items:center;gap:0.625rem;">
                  <div style="position:relative;width:1.125rem;height:1.125rem;display:flex;align-items:center;justify-content:center;">
                    <ProviderIcon provider="cli_antigravity" size="1.125rem" />
                    <LuTerminal style="position:absolute;bottom:-3px;right:-4px;width:0.75rem;height:0.75rem;color:#3b82f6;background:var(--surface-2);border-radius:2px;padding:1px;" />
                  </div>
                  <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">Terminal · Antigravity</span>
                </div>
                {currentMode === "cli_terminal_antigravity" && (
                  <LuCheck style="width:0.875rem;height:0.875rem;color:#3b82f6;" />
                )}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
});

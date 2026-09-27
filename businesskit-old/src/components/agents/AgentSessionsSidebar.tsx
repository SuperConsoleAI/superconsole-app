// src/components/agents/AgentSessionsSidebar.tsx
// Left Sidebar for AI Agent Conversations History.
// Replaces generic chat icon with:
// - PTY / CLI: CLI provider icon with >_ terminal badge overlay (matching [+] pty icon in AgentChatSidebar).
// - Model: Clean model/provider logo alone.
// Preserves exact original layout, typography, 3-dot options popover, search, and bottom settings footer.

import {
  component$,
  useSignal,
  useVisibleTask$,
  useStylesScoped$,
  $,
  type PropFunction,
} from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import {
  LuSearch,
  LuLoader,
  LuChevronDown,
  LuPin,
  LuBookmark,
  LuPencil,
  LuTrash2,
  LuMoreVertical,
  LuCpu,
  LuBarChart3,
  LuSettings,
  LuTerminal,
  LuCheck,
  LuSlidersHorizontal,
  LuMessageSquare,
  LuCode,
} from "@qwikest/icons/lucide";
import { ProviderIcon } from "~/components/common/ProviderIcon";
import { getModelDisplayName, findProviderForModel } from "~/lib/agent-config";
import { useAppContext } from "~/lib/app-context";
import {
  DOMAIN_OPTIONS,
  getDomainIcon,
  isDomainAvailable,
} from "./agent-commands";
import type { ChatSession } from "~/lib/types";

export const MODE_FILTER_OPTIONS = [
  { id: "all", label: "ALL", buttonLabel: "Mode" },
  { id: "chat", label: "Chat", buttonLabel: "Chat" },
  { id: "cli", label: "CLI", buttonLabel: "CLI" },
  { id: "pty", label: "PTY", buttonLabel: "PTY" },
] as const;

export function getModeIcon(modeId: string) {
  switch (modeId) {
    case "chat":
      return LuMessageSquare;
    case "cli":
      return LuCode;
    case "pty":
      return LuTerminal;
    default:
      return LuSlidersHorizontal;
  }
}

export function fmtWhen(timestamp: number): string {
  if (!timestamp) return "";
  const d = new Date(timestamp * 1000);
  if (isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export function getSessionCliInfo(session: ChatSession): { isPty: boolean; isCli: boolean; provider: string } {
  const isPty =
    session.mode === "pty" ||
    session.id?.startsWith("pty-") ||
    Boolean(session.provider?.includes("terminal"));

  const isCli =
    !isPty &&
    (session.mode === "cli" ||
      Boolean(session.provider?.startsWith("cli")) ||
      Boolean(session.model?.startsWith("cli:")));

  let provider = session.provider;
  if (!provider) {
    if (session.id?.startsWith("pty-claude") || session.model === "cli:claude") {
      provider = "cli_claude";
    } else if (session.id?.startsWith("pty-codex") || session.model === "cli:codex") {
      provider = "cli_codex";
    } else if (session.id?.startsWith("pty-agy") || session.model === "cli:antigravity") {
      provider = "cli_antigravity";
    } else if (session.model) {
      provider = findProviderForModel(session.model) || "openrouter";
    } else {
      provider = isPty || isCli ? "cli_claude" : "openrouter";
    }
  } else if ((isPty || isCli) && !provider.startsWith("cli_") && !provider.startsWith("cli")) {
    if (provider === "anthropic" || provider === "claude") provider = "cli_claude";
    else if (provider === "openai" || provider === "codex") provider = "cli_codex";
    else if (provider === "antigravity") provider = "cli_antigravity";
  }

  return { isPty, isCli, provider };
}

export const SessionIcon = component$<{ session: ChatSession; isMobileOrTablet?: boolean }>(({ session, isMobileOrTablet }) => {
  if (session.is_pinned) {
    return (
      <LuPin style="width:0.75rem;height:0.75rem;flex-shrink:0;color:var(--accent);transform:rotate(45deg);" />
    );
  }
  if (session.is_saved) {
    return (
      <LuBookmark style="width:0.75rem;height:0.75rem;flex-shrink:0;color:#10b981;" />
    );
  }

  const { isPty, isCli, provider } = getSessionCliInfo(session);

  // On mobile/tablet breakpoint, do not show mode CLI or PTY badges
  if (!isMobileOrTablet) {
    // mode PTY = terminal with >_ icon overlay badge
    if (isPty) {
      return (
        <div
          style="position:relative;width:0.9375rem;height:0.9375rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
          title={`Terminal PTY · ${session.model || provider}`}
        >
          <ProviderIcon provider={provider} size="0.9375rem" />
          <LuTerminal style="position:absolute;bottom:-3px;right:-4px;width:0.675rem;height:0.675rem;color:#3b82f6;background:var(--surface-2);border-radius:2px;padding:0.5px;" />
        </div>
      );
    }

    // mode CLI = do not add >_ in icon, just clean CLI provider icon
    if (isCli) {
      return (
        <div
          style="width:0.9375rem;height:0.9375rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
          title={`CLI · ${session.model || provider}`}
        >
          <ProviderIcon provider={provider} size="0.9375rem" />
        </div>
      );
    }
  }

  // Model = only icon
  return (
    <div
      style="width:0.9375rem;height:0.9375rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;"
      title={session.model || provider}
    >
      <ProviderIcon provider={provider} model={session.model || undefined} size="0.9375rem" />
    </div>
  );
});

// Alias for backwards compatibility
export const SessionModeBadge = SessionIcon;

const SIDEBAR_STYLES = `
  .panel-sessions {
    width: 280px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    box-sizing: border-box;
  }

  @container agents-workspace (max-width: 860px) {
    .panel-sessions {
      display: none !important;
    }
  }

  @container agents-page (max-width: 860px) {
    .panel-sessions {
      display: none !important;
    }
  }

  @container (max-width: 860px) {
    .panel-sessions {
      display: none !important;
    }
  }

  @media (max-width: 860px) {
    .panel-sessions {
      display: none !important;
    }
  }

  .session-item-row {
    position: relative;
    display: flex;
    align-items: center;
    border-radius: 0.375rem;
    transition: background 0.12s ease;
    box-sizing: border-box;
  }

  .session-item-row:hover {
    background: var(--surface-3);
  }

  .session-item-row.is-active {
    background: var(--surface-3);
  }

  .session-item-btn {
    flex: 1;
    min-width: 0;
    text-align: left;
    padding: 0.5rem 0.625rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    border: none !important;
    outline: none !important;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    transition: background 0.12s ease;
    background: transparent;
    color: var(--text-secondary);
    box-sizing: border-box;
    width: 100%;
  }

  .session-item-btn:hover {
    background: transparent !important;
    border: none !important;
    color: var(--text-primary) !important;
  }

  .session-item-btn.is-active {
    font-weight: 600 !important;
    color: var(--text-primary) !important;
    border: none !important;
  }

  .session-more-btn-wrap {
    position: absolute;
    right: 0.375rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    z-index: 2;
  }

  .session-more-btn {
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.12s ease, background-color 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
    width: 1.5rem;
    height: 1.5rem;
    border-radius: 0.375rem;
    border: none;
    background: var(--surface-3);
    box-shadow: -10px 0 14px 2px var(--surface-3);
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .session-item-row:hover .session-more-btn,
  .session-more-btn.is-open {
    opacity: 1;
    pointer-events: auto;
  }

  .session-more-btn:hover {
    background: var(--surface-2);
    color: var(--text-primary);
    box-shadow: -10px 0 14px 2px var(--surface-3);
  }

  .session-menu-item:hover {
    background: var(--surface-3) !important;
  }

  .session-search-input {
    width: 100%;
    height: 2rem;
    padding-left: 1.875rem;
    padding-right: 7.25rem;
    font-size: 0.8125rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    color: var(--text-primary);
    outline: none;
    box-sizing: border-box;
    transition: border-color 0.15s ease;
  }

  .session-search-input:focus {
    border-color: var(--text-secondary);
  }

  @media (max-width: 860px) {
    .session-search-input {
      padding-right: 0.75rem !important;
    }
  }

  .session-mode-filter-wrap {
    position: absolute;
    right: 0.25rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 0.2rem;
    z-index: 2;
  }

  @media (max-width: 860px) {
    .session-mode-filter-wrap {
      display: none !important;
    }
  }

  .session-filter-btn {
    height: 1.5rem;
    font-size: 0.6875rem;
    font-weight: 600;
    padding: 0 0.35rem;
    background: transparent;
    color: var(--text-secondary);
    border: none !important;
    outline: none !important;
    box-shadow: none !important;
    cursor: pointer;
    line-height: 1.5rem;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    text-align: center;
    border-radius: 0.25rem;
    transition: all 0.15s ease;
  }

  .session-filter-btn:hover,
  .session-filter-btn:focus,
  .session-filter-btn.is-open {
    color: var(--text-primary);
    background: var(--surface-3);
  }
`;

export interface AgentSessionsSidebarProps {
  sessions: ChatSession[];
  currentSessionId?: string | null;
  loadingSessions?: boolean;
  selectedModel?: string;
  selectedDomain?: string;
  class?: string;
  onSelectSession$: PropFunction<(sessionId: string) => void>;
  onTogglePin$?: PropFunction<(sessionId: string, currentVal: boolean) => void>;
  onToggleSave$?: PropFunction<(sessionId: string, currentVal: boolean) => void>;
  onRename$?: PropFunction<(sessionId: string, newTitle: string) => void>;
  onDelete$?: PropFunction<(sessionId: string) => void>;
}

export const AgentSessionsSidebar = component$<AgentSessionsSidebarProps>((props) => {
  useStylesScoped$(SIDEBAR_STYLES);

  const {
    sessions,
    currentSessionId,
    loadingSessions,
    onSelectSession$,
    onTogglePin$,
    onToggleSave$,
    onRename$,
    onDelete$,
  } = props;

  const ctx = useAppContext();
  const installed = ctx.installedApps.value;
  const visibleDomains = DOMAIN_OPTIONS.filter((d) => isDomainAvailable(d.id, installed));

  const searchQuery = useSignal("");
  const sessionLimit = useSignal(30);
  const sessionMenuOpenId = useSignal<string | null>(null);
  const modeDropdownOpen = useSignal(false);
  const domainDropdownOpen = useSignal(false);
  const renamingSessionId = useSignal<string | null>(null);
  const renamingTitle = useSignal("");
  const isMobileOrTablet = useSignal(false);
  const sessionModeFilter = useSignal<"all" | "chat" | "cli" | "pty">("all");
  const sessionDomainFilter = useSignal<string>(props.selectedDomain || "all");
  const hasUserChangedDomainFilter = useSignal(false);

  // Sync default domain from DomainSelector if user hasn't manually filtered
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const parentDomain = track(() => props.selectedDomain);
    if (!hasUserChangedDomainFilter.value && parentDomain) {
      sessionDomainFilter.value = parentDomain;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    if (typeof window === "undefined") return;

    const checkBreakpoint = () => {
      const isTouch =
        /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
        (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 2 && /Macintosh/i.test(navigator.userAgent));
      isMobileOrTablet.value = isTouch || window.innerWidth <= 860;
    };
    checkBreakpoint();
    window.addEventListener("resize", checkBreakpoint);

    const handlePointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-agent-popover]") || target.closest("[data-agent-trigger]")) {
        return;
      }
      sessionMenuOpenId.value = null;
      modeDropdownOpen.value = false;
      domainDropdownOpen.value = false;
    };
    window.addEventListener("pointerdown", handlePointerDown);
    cleanup(() => {
      window.removeEventListener("resize", checkBreakpoint);
      window.removeEventListener("pointerdown", handlePointerDown);
    });
  });

  const filtered = sessions.filter((s) => {
    const { isCli, isPty } = getSessionCliInfo(s);
    if (isMobileOrTablet.value) {
      if (isCli || isPty) return false;
    } else {
      if (sessionModeFilter.value === "chat") {
        if (isCli || isPty) return false;
      } else if (sessionModeFilter.value === "cli") {
        if (!isCli || isPty) return false;
      } else if (sessionModeFilter.value === "pty") {
        if (!isPty) return false;
      }
    }

    if (sessionDomainFilter.value !== "all") {
      const sessionDomain = (s.domain || "").trim().toLowerCase();
      if (sessionDomain !== sessionDomainFilter.value.trim().toLowerCase()) {
        return false;
      }
    }

    return s.title ? s.title.toLowerCase().includes(searchQuery.value.toLowerCase()) : true;
  });

  const handleSaveRename = $((sessionId: string) => {
    const title = renamingTitle.value.trim();
    renamingSessionId.value = null;
    if (title && onRename$) {
      onRename$(sessionId, title);
    }
  });

  return (
    <div class={["panel-sessions", props.class].filter(Boolean).join(" ")}>
      {/* Top Search (Height 2.0rem, reduced by 0.5rem; top padding 0.75rem same as right/left) */}
      <div style="padding:0.75rem 0.75rem 0.375rem;display:flex;flex-direction:column;background:var(--surface-2);">
        <div style="position:relative;display:flex;align-items:center;">
          <LuSearch style="position:absolute;left:0.625rem;width:0.8125rem;height:0.8125rem;color:var(--text-secondary);opacity:0.6;pointer-events:none;z-index:1;" />
          <input
            type="text"
            value={searchQuery.value}
            onInput$={(e) => {
              searchQuery.value = (e.target as HTMLInputElement).value;
            }}
            placeholder="Search chats…"
            class="session-search-input"
            style={isMobileOrTablet.value ? "padding-right:0.75rem;" : undefined}
          />
          {!isMobileOrTablet.value && (
            <div class="session-mode-filter-wrap">
              {/* 1. Domain Selector Filter Pill (No 'v' icon) */}
              {(() => {
                const currentDomainOption = visibleDomains.find((d) => d.id === sessionDomainFilter.value) || DOMAIN_OPTIONS[0];
                const DomainIcon = getDomainIcon(currentDomainOption.id);
                const domainLabel = sessionDomainFilter.value === "all" ? "Domain" : currentDomainOption.shortName;

                return (
                  <div style="position:relative;">
                    <button
                      type="button"
                      data-agent-trigger="true"
                      onClick$={(e) => {
                        e.stopPropagation();
                        domainDropdownOpen.value = !domainDropdownOpen.value;
                        modeDropdownOpen.value = false;
                        sessionMenuOpenId.value = null;
                      }}
                      class={`session-filter-btn ${domainDropdownOpen.value ? "is-open" : ""}`}
                      title={`Filter sessions by domain (Current: ${currentDomainOption.name})`}
                    >
                      <DomainIcon style="width:0.6875rem;height:0.6875rem;color:var(--text-secondary);flex-shrink:0;" />
                      <span>{domainLabel}</span>
                    </button>

                    {domainDropdownOpen.value && (
                      <div
                        data-agent-popover="true"
                        style="position:absolute;right:0;top:calc(100% + 4px);width:165px;max-height:260px;overflow-y:auto;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 10px 25px rgba(0,0,0,0.28);z-index:210;padding:0.25rem;display:flex;flex-direction:column;gap:1px;"
                      >
                        {visibleDomains.map((d) => {
                          const isSelected = d.id === sessionDomainFilter.value;
                          const Icon = getDomainIcon(d.id);
                          return (
                            <button
                              key={d.id}
                              type="button"
                              onClick$={() => {
                                sessionDomainFilter.value = d.id;
                                hasUserChangedDomainFilter.value = true;
                                domainDropdownOpen.value = false;
                              }}
                              style={`width:100%;text-align:left;padding:0.35rem 0.5rem;border-radius:0.375rem;font-size:0.75rem;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:0.4rem;transition:background 0.12s;background:${
                                isSelected ? "rgba(99,102,241,0.1)" : "transparent"
                              };color:${
                                isSelected ? "var(--accent, #6366f1)" : "var(--text-primary)"
                              };font-weight:${isSelected ? "600" : "500"};`}
                              class="session-menu-item"
                            >
                              <div style="display:flex;align-items:center;gap:0.4rem;min-width:0;overflow:hidden;">
                                <Icon style="width:0.75rem;height:0.75rem;color:var(--text-secondary);flex-shrink:0;" />
                                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{d.name}</span>
                              </div>
                              {isSelected && (
                                <LuCheck style="width:0.75rem;height:0.75rem;color:var(--accent, #6366f1);flex-shrink:0;" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* 2. Mode Selector Filter Pill (No 'v' icon, with Mode Icon) */}
              {(() => {
                const currentModeOpt = MODE_FILTER_OPTIONS.find((m) => m.id === sessionModeFilter.value) || MODE_FILTER_OPTIONS[0];
                const ModeIcon = getModeIcon(currentModeOpt.id);
                const modeLabel = currentModeOpt.buttonLabel;

                return (
                  <div style="position:relative;">
                    <button
                      type="button"
                      data-agent-trigger="true"
                      onClick$={(e) => {
                        e.stopPropagation();
                        modeDropdownOpen.value = !modeDropdownOpen.value;
                        domainDropdownOpen.value = false;
                        sessionMenuOpenId.value = null;
                      }}
                      class={`session-filter-btn ${modeDropdownOpen.value ? "is-open" : ""}`}
                      title={`Filter sessions by mode (Current: ${currentModeOpt.label})`}
                    >
                      <ModeIcon style="width:0.6875rem;height:0.6875rem;color:var(--text-secondary);flex-shrink:0;" />
                      <span>{modeLabel}</span>
                    </button>

                    {modeDropdownOpen.value && (
                      <div
                        data-agent-popover="true"
                        style="position:absolute;right:0;top:calc(100% + 4px);width:115px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 10px 25px rgba(0,0,0,0.28);z-index:210;padding:0.25rem;display:flex;flex-direction:column;gap:1px;"
                      >
                        {MODE_FILTER_OPTIONS.map((opt) => {
                          const isSelected = sessionModeFilter.value === opt.id;
                          const Icon = getModeIcon(opt.id);
                          const targetMode = opt.id;
                          return (
                            <button
                              key={targetMode}
                              type="button"
                              onClick$={() => {
                                sessionModeFilter.value = targetMode as any;
                                modeDropdownOpen.value = false;
                              }}
                              style={`width:100%;text-align:left;padding:0.35rem 0.5rem;border-radius:0.375rem;font-size:0.75rem;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:0.4rem;transition:background 0.12s;background:${
                                isSelected ? "rgba(99,102,241,0.1)" : "transparent"
                              };color:${
                                isSelected ? "var(--accent, #6366f1)" : "var(--text-primary)"
                              };font-weight:${isSelected ? "600" : "500"};`}
                              class="session-menu-item"
                            >
                              <div style="display:flex;align-items:center;gap:0.4rem;min-width:0;overflow:hidden;">
                                <Icon style="width:0.75rem;height:0.75rem;color:var(--text-secondary);flex-shrink:0;" />
                                <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{opt.label}</span>
                              </div>
                              {isSelected && (
                                <LuCheck style="width:0.75rem;height:0.75rem;color:var(--accent, #6366f1);flex-shrink:0;" />
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          )}
        </div>
      </div>

      {/* Sessions List */}
      <div style="flex:1;min-height:0;overflow-y:auto;padding:0.375rem;display:flex;flex-direction:column;gap:2px;">
        {loadingSessions ? (
          <div style="display:flex;align-items:center;justify-content:center;padding:2rem;color:var(--text-secondary);font-size:0.75rem;gap:0.5rem;">
            <LuLoader style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
            <span>Loading…</span>
          </div>
        ) : filtered.length === 0 ? (
          <div style="padding:2rem 1rem;text-align:center;color:var(--text-secondary);font-size:0.75rem;">
            No conversations found.
          </div>
        ) : (
          <>
            {filtered.slice(0, sessionLimit.value).map((s) => {
              const isActive = s.id === currentSessionId;
              const isPinned = Boolean(s.is_pinned);
              const isSaved = Boolean(s.is_saved);
              const isMenuOpen = sessionMenuOpenId.value === s.id;
              const isRenaming = renamingSessionId.value === s.id;

              return (
                <div
                  key={s.id}
                  class={`session-item-row ${isActive ? "is-active" : ""}`}
                >
                  {isRenaming ? (
                    <div style="flex:1;padding:0.25rem 0.5rem;display:flex;align-items:center;">
                      <input
                        type="text"
                        value={renamingTitle.value}
                        autoFocus
                        onInput$={(e) => {
                          renamingTitle.value = (e.target as HTMLInputElement).value;
                        }}
                        onKeyDown$={(e) => {
                          if (e.key === "Enter") {
                            handleSaveRename(s.id);
                          } else if (e.key === "Escape") {
                            renamingSessionId.value = null;
                          }
                        }}
                        onBlur$={() => handleSaveRename(s.id)}
                        style="width:100%;height:1.75rem;padding:0 0.375rem;font-size:0.8125rem;background:var(--surface-1);border:1px solid var(--accent);border-radius:0.25rem;color:var(--text-primary);outline:none;box-sizing:border-box;"
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick$={() => onSelectSession$(s.id)}
                      class={`session-item-btn ${isActive ? "is-active" : ""}`}
                    >
                      <div style="display:flex;align-items:center;gap:0.45rem;min-width:0;flex:1;">
                        <SessionIcon session={s} isMobileOrTablet={isMobileOrTablet.value} />

                        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">
                          {s.title || "Conversation"}
                        </span>
                      </div>
                      <span style="font-size:0.6875rem;color:var(--text-secondary);opacity:0.8;flex-shrink:0;">
                        {fmtWhen(s.updated_at)}
                      </span>
                    </button>
                  )}

                  {/* Three-Dot Menu Trigger */}
                  <div class="session-more-btn-wrap">
                    <button
                      type="button"
                      data-agent-trigger="true"
                      onClick$={(e) => {
                        e.stopPropagation();
                        sessionMenuOpenId.value = isMenuOpen ? null : s.id;
                      }}
                      class={`session-more-btn ${isMenuOpen ? "is-open" : ""}`}
                      title="Conversation options"
                    >
                      <LuMoreVertical style="width:0.8125rem;height:0.8125rem;" />
                    </button>

                    {/* Popover Menu */}
                    {isMenuOpen && (
                      <div
                        data-agent-popover="true"
                        style="position:absolute;right:0;top:calc(100% + 4px);width:150px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 10px 25px rgba(0,0,0,0.25);z-index:200;padding:0.25rem;display:flex;flex-direction:column;gap:1px;"
                      >
                        <button
                          type="button"
                          onClick$={() => {
                            sessionMenuOpenId.value = null;
                            onTogglePin$?.(s.id, isPinned);
                          }}
                          style="width:100%;text-align:left;padding:0.375rem 0.5rem;border-radius:0.375rem;font-size:0.75rem;border:none;background:transparent;color:var(--text-primary);cursor:pointer;display:flex;align-items:center;gap:0.5rem;transition:background 0.12s;"
                          class="session-menu-item"
                        >
                          <LuPin style="width:0.8125rem;height:0.8125rem;color:var(--text-secondary);" />
                          <span>{isPinned ? "Unpin chat" : "Pin chat"}</span>
                        </button>
                        <button
                          type="button"
                          onClick$={() => {
                            sessionMenuOpenId.value = null;
                            onToggleSave$?.(s.id, isSaved);
                          }}
                          style="width:100%;text-align:left;padding:0.375rem 0.5rem;border-radius:0.375rem;font-size:0.75rem;border:none;background:transparent;color:var(--text-primary);cursor:pointer;display:flex;align-items:center;gap:0.5rem;transition:background 0.12s;"
                          class="session-menu-item"
                        >
                          <LuBookmark style="width:0.8125rem;height:0.8125rem;color:var(--text-secondary);" />
                          <span>{isSaved ? "Unsave chat" : "Save chat"}</span>
                        </button>
                        <button
                          type="button"
                          onClick$={() => {
                            sessionMenuOpenId.value = null;
                            renamingSessionId.value = s.id;
                            renamingTitle.value = s.title || "Conversation";
                          }}
                          style="width:100%;text-align:left;padding:0.375rem 0.5rem;border-radius:0.375rem;font-size:0.75rem;border:none;background:transparent;color:var(--text-primary);cursor:pointer;display:flex;align-items:center;gap:0.5rem;transition:background 0.12s;"
                          class="session-menu-item"
                        >
                          <LuPencil style="width:0.8125rem;height:0.8125rem;color:var(--text-secondary);" />
                          <span>Rename</span>
                        </button>
                        <div style="height:1px;background:var(--border);margin:0.25rem 0;" />
                        <button
                          type="button"
                          onClick$={() => {
                            sessionMenuOpenId.value = null;
                            onDelete$?.(s.id);
                          }}
                          style="width:100%;text-align:left;padding:0.375rem 0.5rem;border-radius:0.375rem;font-size:0.75rem;border:none;background:transparent;color:#ef4444;cursor:pointer;display:flex;align-items:center;gap:0.5rem;transition:background 0.12s;"
                          class="session-menu-item"
                        >
                          <LuTrash2 style="width:0.8125rem;height:0.8125rem;" />
                          <span>Delete</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {filtered.length > sessionLimit.value && (
              <button
                type="button"
                onClick$={$(() => {
                  sessionLimit.value += 30;
                })}
                style="width:100%;padding:0.45rem 0.5rem;font-size:0.75rem;font-weight:500;color:var(--text-primary);background:transparent;border:none;border-top:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.35rem;transition:background 0.15s;margin-top:2px;"
                onMouseEnter$={(e, el) => (el.style.background = "var(--surface-3)")}
                onMouseLeave$={(e, el) => (el.style.background = "transparent")}
              >
                <LuChevronDown style="width:0.75rem;height:0.75rem;" />
                <span>Load 30 more</span>
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer: Model indicator & Analytics / Connections links (KEPT AS IT IS) */}
      <div style="padding:0.625rem 0.875rem;border-top:1px solid var(--border);background:var(--surface-2);display:flex;align-items:center;justify-content:space-between;font-size:0.6875rem;color:var(--text-secondary);">
        <div style="display:flex;align-items:center;gap:0.375rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
          <LuCpu style="width:0.75rem;height:0.75rem;color:var(--text-secondary);flex-shrink:0;" />
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            {getModelDisplayName(props.selectedModel || "")}
          </span>
        </div>
        <div style="display:flex;align-items:center;gap:0.375rem;">
          <Link
            href="/dashboard/agents/analytics"
            style="color:var(--text-secondary);display:flex;align-items:center;padding:2px;text-decoration:none;"
            title="Agent Analytics & Spend"
          >
            <LuBarChart3 style="width:0.8125rem;height:0.8125rem;" />
          </Link>
          <Link
            href="/dashboard/settings/connections"
            style="color:var(--text-secondary);display:flex;align-items:center;padding:2px;text-decoration:none;"
            title="Configure AI API Keys in Settings"
          >
            <LuSettings style="width:0.8125rem;height:0.8125rem;" />
          </Link>
        </div>
      </div>
    </div>
  );
});

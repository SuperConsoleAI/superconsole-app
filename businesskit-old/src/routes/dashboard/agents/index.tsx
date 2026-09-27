// src/routes/dashboard/agents/index.tsx
// Full-page 2-Column Claude.ai-style AI Agent Workspace.
// Matches the exact design system, tokens, popovers, and components from AgentChatSidebar and AgentChatModal.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  useStylesScoped$,
} from "@builder.io/qwik";
import { type DocumentHead, Link, useLocation } from "@builder.io/qwik-city";
import {
  LuBot,
  LuPlus,
  LuPackage,
  LuFileText,
  LuUserCheck,
  LuPenTool,
  LuSparkles,
  LuAlertCircle,
  LuCheck,
  LuChevronDown,
  LuZap,
  LuCopy,
  LuArrowRight,
  LuLoader,
  LuShield,
  LuMessageSquare,
  LuImage,
  LuSettings,
  LuRotateCcw,
  LuBarChart3,
  LuAlertTriangle,
} from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { ProviderIcon } from "~/components/common/ProviderIcon";
import {
  AGENT_PROVIDER_OPTIONS as PROVIDER_OPTIONS,
  AGENT_MODEL_OPTIONS as MODEL_OPTIONS,
  getModelDisplayName,
  findProviderForModel,
  detectDefaultAiConnection,
  fetchAndApplyLivePricing,
  fetchAndSyncActiveCliModels,
  getCachedCliStatus,
  setCachedCliStatus,
  getModelReasoningConfig,
  getDefaultModelForProvider,
  resolveCliModelId,
  getCliProviderForSession,
  isValidModelForCliProvider,
  getCachedSessionMessages,
  setCachedSessionMessages,
  deleteCachedSession,
  getCachedSessionsList,
  setCachedSessionsList,
  getCachedActiveSessionId,
  setCachedActiveSessionId,
  setCachedAgentAnalytics,
  setCachedStaffLookup,
} from "~/lib/agent-config";
import {
  startChatSession,
  listChatSessions,
  getChatHistory,
  sendChatMessage,
  stopChatSession,
  getAgentAnalytics,
  renameChatSession,
  togglePinChatSession,
  toggleSaveChatSession,
  deleteChatSession,
  setCliActiveModel,
  getActiveProfileId,
  writeTerminalInput,
  stopTerminalSession,
} from "~/lib/ipc";
import type {
  ChatSession,
  ChatMessage,
  ChatTokenPayload,
  ChatToolCallPayload,
  ChatDonePayload,
  ChatErrorPayload,
  AttachmentPayload,
} from "~/lib/types";
import { useAppContext } from "~/lib/app-context";
import {
  DOMAIN_STARTER_COMMANDS,
  SLASH_CATEGORIES,
  FOLLOWUP_CHIPS,
  getCommandInputText,
  resolveCommandIdFromText,
  detectDomainFromCommand,
  detectDomainFromRoute,
  resolveDefaultDomain,
  isDomainAvailable,
  MarkdownRenderer,
  ToolResultCard,
  DomainSelector,
  AgentSessionsSidebar,
  SessionIcon,
  getSessionCliInfo,
  NewChat,
  type NewChatMode,
  PtyTabBar,
  type PtyTab,
  AgentTerminalPanel,
  CliCompose,
  ChatCompose,
  type UiToolAction,
} from "~/components/agents";

interface UiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolActions?: UiToolAction[];
  attachmentName?: string;
  created_at: number;
}



function fmtWhen(timestamp: number): string {
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

const STYLES = `
  .agents-page-wrap {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--background);
    padding: 0.75rem;
    box-sizing: border-box;
    container-type: inline-size;
    container-name: agents-page;
  }

  .agents-workspace {
    display: flex;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    gap: 0.75rem;
    box-sizing: border-box;
    position: relative;
    container-type: inline-size;
    container-name: agents-workspace;
  }

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

  .panel-chat {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background: var(--surface-2);
    position: relative;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    box-sizing: border-box;
    container-type: inline-size;
    container-name: panel-chat;
  }

  .mobile-only-trigger {
    display: none;
  }

  /* Left panel (chat list) hides when screen or container gets smaller / when agent sidebar opens */
  @container agents-workspace (max-width: 860px) {
    .panel-sessions {
      display: none !important;
    }
    .desktop-title {
      display: none !important;
    }
    .mobile-only-trigger {
      display: block !important;
    }
  }

  @container agents-page (max-width: 860px) {
    .panel-sessions {
      display: none !important;
    }
    .desktop-title {
      display: none !important;
    }
    .mobile-only-trigger {
      display: block !important;
    }
  }

  @container (max-width: 860px) {
    .panel-sessions {
      display: none !important;
    }
    .desktop-title {
      display: none !important;
    }
    .mobile-only-trigger {
      display: block !important;
    }
  }

  @media (max-width: 860px) {
    .panel-sessions {
      display: none !important;
    }
    .desktop-title {
      display: none !important;
    }
    .mobile-only-trigger {
      display: block !important;
    }
  }

  @media (max-width: 768px) {
    .agents-page-wrap {
      padding: 0.5rem 0.5rem calc(0.75rem + env(safe-area-inset-bottom, 0px)) 0.5rem !important;
    }
  }

  .agent-header {
    height: calc(var(--header-box-height, 3.4rem) - 0.5rem);
    min-height: calc(var(--header-box-height, 3.4rem) - 0.5rem);
    padding: 0 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    background: var(--surface-2);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    box-sizing: border-box;
    user-select: none;
  }

  .agent-header-analytics {
    display: none !important;
  }

  @media (max-width: 768px) {
    .agent-header-analytics {
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
    }
  }

  .agent-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    background: var(--surface-2);
    box-sizing: border-box;
    user-select: text !important;
    -webkit-user-select: text !important;
  }

  @container panel-chat (max-width: 540px) {
    .agent-body {
      padding: 1rem 0.75rem !important;
      gap: 1rem !important;
    }
    .agent-header {
      padding: 0 0.75rem !important;
    }
    .agent-composer {
      padding: 0.5rem 0.75rem 0.75rem 0.75rem !important;
    }
  }

  @keyframes agentFadeIn {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .agent-msg-fade {
    animation: agentFadeIn 130ms cubic-bezier(0.16, 1, 0.3, 1);
  }

  .agent-selectable-text {
    user-select: text !important;
    -webkit-user-select: text !important;
    cursor: text;
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

  .starter-cards-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.625rem;
    width: 100%;
    max-width: 800px;
    box-sizing: border-box;
  }

  @container panel-chat (max-width: 820px) {
    .starter-cards-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container panel-chat (max-width: 540px) {
    .starter-cards-grid {
      grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
    }
  }

  @container agents-workspace (max-width: 820px) {
    .starter-cards-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container agents-workspace (max-width: 540px) {
    .starter-cards-grid {
      grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
    }
  }

  @container agents-page (max-width: 820px) {
    .starter-cards-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container agents-page (max-width: 540px) {
    .starter-cards-grid {
      grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
    }
  }

  @container (max-width: 820px) {
    .starter-cards-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @container (max-width: 540px) {
    .starter-cards-grid {
      grid-template-columns: repeat(1, minmax(0, 1fr)) !important;
    }
  }

  @media (max-width: 1060px) {
    .starter-cards-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 640px) {
    .agents-page-wrap {
      padding: 0.25rem 0.25rem calc(0.5rem + env(safe-area-inset-bottom, 0px)) 0.25rem !important;
    }
    .panel-chat {
      border-radius: 0.5rem !important;
    }
    .agent-header {
      padding: 0 0.5rem !important;
    }
    .agent-body {
      padding: 0.75rem 0.5rem !important;
      gap: 0.75rem !important;
    }
    .agent-composer {
      padding: 0.375rem 0.5rem 0.5rem 0.5rem !important;
    }
    .starter-cards-grid {
      display: none !important;
    }
    .agent-followup-chips {
      display: none !important;
    }
  }

  .starter-card-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    padding: 0.5rem 0.625rem;
    border-radius: 0.375rem;
    background: transparent !important;
    border: 1px solid var(--border);
    cursor: pointer;
    text-align: left;
    width: 100%;
    box-sizing: border-box;
    transition: all 0.15s ease;
  }

  .starter-card-item:hover {
    background: var(--surface-3) !important;
    border-color: var(--border-strong, var(--border));
  }

  .agent-composer {
    padding: 0.5rem 1rem 1rem 1rem;
    background: transparent !important;
    border: none !important;
    flex-shrink: 0;
    box-sizing: border-box;
    position: relative;
    max-width: 860px;
    width: 100%;
    margin: 0 auto;
  }

  .agent-input-container {
    position: relative;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 0.625rem;
    padding: 0.5rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    transition: border-color 150ms ease, box-shadow 150ms ease;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  }

  .agent-input-container:focus-within {
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent-subtle, rgba(59, 130, 246, 0.2));
  }

  .agent-textarea {
    background: transparent;
    border: none;
    outline: none;
    font-size: 0.8125rem;
    color: var(--text-primary);
    font-family: inherit;
    resize: none;
    min-height: 2.25rem;
    max-height: 220px;
    line-height: 1.45;
    padding: 0;
    box-sizing: border-box;
    overflow-y: auto;
    user-select: text !important;
    -webkit-user-select: text !important;
  }

  .agent-textarea::placeholder {
    color: var(--text-muted);
  }

  .agent-cmd-item {
    transition: all 150ms ease;
  }

  .agent-cmd-item:hover {
    background: var(--surface-3) !important;
    border-color: var(--border) !important;
  }

  .bottom-card-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm, 0.375rem);
    background: var(--surface-2);
    color: var(--text-secondary);
    font-size: 0.75rem;
    font-weight: 500;
    text-decoration: none;
    transition: border-color 0.15s ease, color 0.15s ease, background-color 0.15s ease;
    box-sizing: border-box;
    cursor: pointer;
    min-width: 0;
  }

  .bottom-card-btn:hover {
    border-color: var(--border-strong, var(--border));
    color: var(--text-primary);
    background: var(--surface-3);
  }

  .bottom-btn-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }
`;

export default component$(() => {
  useStylesScoped$(STYLES);

  const initSessions = (getCachedSessionsList() || []) as ChatSession[];
  const initActiveId = getCachedActiveSessionId() || (initSessions.length > 0 ? initSessions[0].id : null);
  const initActiveSession = initSessions.find((s) => s.id === initActiveId);
  const initMessages = initActiveId ? ((getCachedSessionMessages(initActiveId) || []) as UiMessage[]) : [];

  const appCtx = useAppContext();
  const loc = useLocation();

  // Sessions & Active Thread State
  const sessions = useSignal<ChatSession[]>(initSessions);
  const currentSessionId = useSignal<string | null>(initActiveId);
  const currentSessionTitle = useSignal<string>(initActiveSession?.title || "New Conversation");
  const messages = useSignal<UiMessage[]>(initMessages);
  const loadingSessions = useSignal(initSessions.length === 0);
  const sessionLimit = useSignal(30);

  // Input & Streaming State
  const inputValue = useSignal("");
  const isStreaming = useSignal(false);
  const streamingText = useSignal("");
  const activeToolActions = useSignal<UiToolAction[]>([]);
  const currentRequestId = useSignal<string | null>(null);
  const errorBanner = useSignal("");
  const copiedIndex = useSignal<number | null>(null);

  // Popover Menus State
  const modelSwitcherOpen = useSignal(false);
  const autoMenuOpen = useSignal(false);
  const slashMenuOpen = useSignal(false);
  const slashTab = useSignal<string>("crm");
  const domainDropdownOpen = useSignal(false);
  const mobileSessionsOpen = useSignal(false);
  const newChatMenuOpen = useSignal(false);
  const isDesktop = useSignal<boolean>(true);

  // Selected Provider, Model & Domain Signals (persisted in localStorage)
  const selectedProvider = useSignal<string>("openrouter");
  const selectedModel = useSignal<string>("google/gemini-3.5-flash-lite");
  const selectedDomain = useSignal<string>("all");
  const sourceCommandId = useSignal<string | null>(null);
  const providerTab = useSignal<string>("openrouter");
  const autoMode = useSignal<"auto" | "ask" | "off">("auto");
  const reasoningEffort = useSignal<"low" | "medium" | "high" | "extra" | "max">("low");
  const thinkingEnabled = useSignal<boolean>(false);
  const effortMenuOpen = useSignal(false);
  const sidebarNewChatMode = useSignal<NewChatMode>("chat");
  const activeProfileId = useSignal<string>("");
  const ptySessionId = useSignal<string>("");
  const ptyTabs = useSignal<PtyTab[]>([]);
  const activePtyTabId = useSignal<string>("");

  const persistPtyTabs = $((tabs: PtyTab[], activeId: string) => {
    try {
      localStorage.setItem("bk-sidebar-pty-tabs", JSON.stringify(tabs));
      localStorage.setItem("bk-sidebar-pty-active-tab", activeId);
    } catch {
      // ignore
    }
  });

  // Attachment State
  const attachedFile = useSignal<{ name: string; type: string; previewUrl?: string; dataBase64?: string } | null>(null);
  const fileInputRef = useSignal<HTMLInputElement>();
  const messagesEndRef = useSignal<HTMLDivElement>();
  const textareaRef = useSignal<HTMLTextAreaElement>();

  const scrollToBottom = $(() => {
    if (messagesEndRef.value) {
      messagesEndRef.value.scrollIntoView({ behavior: "smooth" });
    }
  });

  const autoDetectDomainFromText = $((text: string) => {
    const domain = detectDomainFromCommand(text);
    if (domain && selectedDomain.value !== domain && isDomainAvailable(domain, appCtx.installedApps.value)) {
      selectedDomain.value = domain;
      slashTab.value = domain;
      try {
        localStorage.setItem("bk-agent-domain", domain);
      } catch {
        // ignore storage error
      }
    }
  });

  const setComposerText = $((text: string, commandId?: string) => {
    inputValue.value = text;
    if (commandId) {
      sourceCommandId.value = commandId;
    } else {
      const resolved = resolveCommandIdFromText(text);
      if (resolved) sourceCommandId.value = resolved;
    }
    autoDetectDomainFromText(text);
    if (textareaRef.value) {
      textareaRef.value.value = text;
      textareaRef.value.focus();
      textareaRef.value.style.height = "auto";
      textareaRef.value.style.height = `${Math.min(Math.max(textareaRef.value.scrollHeight, 36), 220)}px`;
    }
  });

  const loadSessions = $(async () => {
    if (sessions.value.length === 0) {
      loadingSessions.value = true;
    }
    try {
      const list = await listChatSessions();
      sessions.value = list;
      setCachedSessionsList(list);
      // At start, always open in standard AI chat mode (mode="chat").
      // Only auto-select a regular non-CLI, non-PTY chat session; never auto-switch to CLI or PTY on start!
      const firstChatSession = list.find((s) => 
        s.mode !== "pty" && 
        s.mode !== "cli" && 
        !s.id.startsWith("pty-") && 
        !s.provider?.startsWith("cli")
      );
      if (firstChatSession && !currentSessionId.value) {
        await selectSession(firstChatSession.id);
      } else if (!currentSessionId.value) {
        await handleNewChat();
      } else if (currentSessionId.value) {
        const updated = list.find((s) => s.id === currentSessionId.value);
        if (updated && updated.title) {
          currentSessionTitle.value = updated.title;
        }
        await selectSession(currentSessionId.value);
      }
    } catch (err: any) {
      console.error("Failed to load chat sessions:", err);
    } finally {
      loadingSessions.value = false;
    }
  });

  const selectSession = $((sessionId: string) => {
    // Instant visual update without delay
    currentSessionId.value = sessionId;
    setCachedActiveSessionId(sessionId);
    modelSwitcherOpen.value = false;
    autoMenuOpen.value = false;
    slashMenuOpen.value = false;
    domainDropdownOpen.value = false;
    mobileSessionsOpen.value = false;
    errorBanner.value = "";

    const sess = sessions.value.find((s) => s.id === sessionId);
    if (sess) {
      currentSessionTitle.value = sess.title || "Conversation";
      if (sess.domain) {
        selectedDomain.value = sess.domain;
        if (sess.domain !== "all") {
          slashTab.value = sess.domain as any;
        }
      }
      if (sess.model) {
        selectedModel.value = sess.model;
        selectedProvider.value = sess.provider || findProviderForModel(sess.model);
        providerTab.value = selectedProvider.value;
      }

      // Check if session is PTY Terminal
      if (sess.mode === "pty" || sess.id.startsWith("pty-")) {
        let cli: "antigravity" | "codex" | "claude" = "claude";
        if (sess.id.startsWith("pty-codex") || sess.model?.includes("codex")) cli = "codex";
        else if (sess.id.startsWith("pty-agy") || sess.model?.includes("antigravity")) cli = "antigravity";
        const prov = cli === "antigravity" ? "cli_antigravity" : cli === "codex" ? "cli_codex" : "cli_claude";
        const lbl = cli === "antigravity" ? "Antigravity" : cli === "codex" ? "Codex" : "Claude Code";
        const mode = `cli_terminal_${cli}` as any;
        sidebarNewChatMode.value = mode;
        let existingTab = ptyTabs.value.find((t) => t.id === sess.id);
        if (!existingTab) {
          existingTab = { id: sess.id, cli, provider: prov, label: sess.title || lbl, isExited: false, model: sess.model || getDefaultModelForProvider(prov) };
          ptyTabs.value = [...ptyTabs.value, existingTab];
        }
        activePtyTabId.value = sess.id;
        ptySessionId.value = sess.id;
        selectedProvider.value = prov;
        selectedModel.value = existingTab.model || getDefaultModelForProvider(prov);
        providerTab.value = prov;
        persistPtyTabs(ptyTabs.value, sess.id);
        return;
      } else if (sess.mode === "cli" || sess.provider?.startsWith("cli")) {
        sidebarNewChatMode.value = (sess.provider as any) || "cli_claude";
      } else {
        sidebarNewChatMode.value = "chat";
      }
    }

    // 0ms Instant In-Memory Cache Hit
    const cached = getCachedSessionMessages(sessionId);
    if (cached && Array.isArray(cached)) {
      messages.value = cached;
      setTimeout(scrollToBottom, 20);
    }

    // Fetch fresh history in background
    getChatHistory(sessionId).then((history) => {
      const mapped = history.map((m: ChatMessage) => {
        let toolsList: UiToolAction[] | undefined;
        if (m.tool_calls_json) {
          try {
            const parsed = JSON.parse(m.tool_calls_json);
            if (Array.isArray(parsed)) {
              toolsList = parsed.map((item) => ({
                id: item.id || String(Math.random()),
                tool: item.tool,
                args: item.args,
                result: item.result,
                status: "completed",
              }));
            }
          } catch {
            // ignore invalid tools json
          }
        }
        return {
          id: m.id,
          role: m.role,
          content: m.content,
          toolActions: toolsList,
          created_at: m.created_at,
        };
      });

      // Update in-memory session cache
      setCachedSessionMessages(sessionId, mapped);

      // Only update UI if user is still on this session
      if (currentSessionId.value === sessionId) {
        messages.value = mapped;
        setTimeout(scrollToBottom, 40);
      }
    }).catch((err) => {
      console.error("Failed to load chat history:", err);
      if (!cached) {
        errorBanner.value = typeof err === "string" ? err : err.message || "Failed to load chat history";
      }
    });
  });

  // Real-time Route & App Domain Synchronizer:
  // Dynamically adapts domain as user navigates between Shop, CRM, CMS routes
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const pathname = track(() => loc.url.pathname);
    const apps = track(() => appCtx.installedApps.value);
    const routeDomain = detectDomainFromRoute(pathname);
    if (routeDomain) {
      if (selectedDomain.value !== routeDomain) {
        selectedDomain.value = routeDomain;
        slashTab.value = routeDomain;
      }
    } else {
      const def = resolveDefaultDomain(apps, pathname);
      if (selectedDomain.value !== def) {
        selectedDomain.value = def;
        if (def !== "all") {
          slashTab.value = def as any;
        }
      }
    }
  });

  // Auto-resize textarea whenever inputValue changes
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => inputValue.value);
    const textarea = textareaRef.value;
    if (textarea) {
      if (textarea.value !== inputValue.value) {
        textarea.value = inputValue.value;
      }
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(Math.max(textarea.scrollHeight, 36), 220)}px`;
    }
  });

  const handleNewChatWith = $(async (providerOverride?: string, modelOverride?: string) => {
    // Instant UI reset
    newChatMenuOpen.value = false;
    modelSwitcherOpen.value = false;
    autoMenuOpen.value = false;
    slashMenuOpen.value = false;
    domainDropdownOpen.value = false;
    mobileSessionsOpen.value = false;
    errorBanner.value = "";
    attachedFile.value = null;
    inputValue.value = "";
    messages.value = [];
    currentSessionId.value = null;
    currentSessionTitle.value = "New Conversation";
    setTimeout(() => textareaRef.value?.focus(), 40);

    let prov = providerOverride || selectedProvider.value;
    let mdl = modelOverride || selectedModel.value;

    if (!providerOverride) {
      sidebarNewChatMode.value = "chat";
      localStorage.setItem("bk-sidebar-newchat-mode", "chat");
      if (prov.startsWith("cli") || mdl.startsWith("cli:")) {
        try {
          const conns: any = await invoke("list_connections");
          if (Array.isArray(conns) && conns.length > 0) {
            const def = detectDefaultAiConnection(conns);
            prov = def.provider;
            mdl = def.model;
          } else {
            prov = "openrouter";
            mdl = "google/gemini-3.5-flash-lite";
          }
        } catch {
          prov = "openrouter";
          mdl = "google/gemini-3.5-flash-lite";
        }
        selectedProvider.value = prov;
        selectedModel.value = mdl;
        providerTab.value = prov;
        localStorage.setItem("bk-agent-provider", prov);
        localStorage.setItem("bk-agent-model", mdl);
      }
    } else {
      if (providerOverride.startsWith("cli")) {
        sidebarNewChatMode.value = providerOverride as any;
        localStorage.setItem("bk-sidebar-newchat-mode", providerOverride);
      } else {
        sidebarNewChatMode.value = "chat";
        localStorage.setItem("bk-sidebar-newchat-mode", "chat");
      }
      let effModel = modelOverride || providerOverride;
      if (providerOverride.startsWith("cli")) {
        const cliCache = getCachedCliStatus();
        if (cliCache && cliCache[providerOverride]) {
          effModel = cliCache[providerOverride].model_id;
          const eff = cliCache[providerOverride].active_effort;
          if (eff && ["low", "medium", "high", "extra", "max"].includes(eff)) {
            reasoningEffort.value = eff as any;
          }
        }
      }
      selectedProvider.value = providerOverride;
      selectedModel.value = effModel;
      providerTab.value = providerOverride;
      localStorage.setItem("bk-agent-provider", providerOverride);
      localStorage.setItem("bk-agent-model", effModel);
      mdl = effModel;
      prov = providerOverride;
    }

    try {
      const newSession = await startChatSession(
        undefined,
        undefined,
        undefined,
        mdl,
        prov,
        selectedDomain.value !== "all" ? selectedDomain.value : undefined
      );
      const updatedList = [newSession, ...sessions.value.filter((s) => s.id !== newSession.id)];
      sessions.value = updatedList;
      setCachedSessionsList(updatedList);
      currentSessionId.value = newSession.id;
      setCachedActiveSessionId(newSession.id);
      currentSessionTitle.value = newSession.title || "New Conversation";
    } catch (err: any) {
      console.error("Failed to start new chat session:", err);
      errorBanner.value = typeof err === "string" ? err : err.message || "Failed to start new session";
    }
  });

  const handleNewChat = $(() => handleNewChatWith());

  const handleNewChatAction = $((mode: NewChatMode) => {
    newChatMenuOpen.value = false;
    if (mode === "cli_claude") {
      handleNewChatWith("cli_claude", "cli:claude");
    } else if (mode === "cli_antigravity") {
      handleNewChatWith("cli_antigravity", "cli:antigravity");
    } else if (mode === "cli_codex") {
      handleNewChatWith("cli_codex", "cli:codex");
    } else if (mode.startsWith("cli_terminal")) {
      const cli =
        mode === "cli_terminal_antigravity"
          ? "antigravity"
          : mode === "cli_terminal_codex"
          ? "codex"
          : "claude";
      const prov =
        cli === "antigravity"
          ? "cli_antigravity"
          : cli === "codex"
          ? "cli_codex"
          : "cli_claude";
      const lbl =
        cli === "antigravity"
          ? "Antigravity"
          : cli === "codex"
          ? "Codex"
          : "Claude Code";
      const newId = `pty-${cli}-${Date.now()}`;
      const defaultModel = getDefaultModelForProvider(prov);
      const newTab: PtyTab = {
        id: newId,
        cli,
        provider: prov,
        label: lbl,
        isExited: false,
        model: defaultModel,
      };
      const updated = [...ptyTabs.value, newTab];
      ptyTabs.value = updated;
      activePtyTabId.value = newId;
      ptySessionId.value = newId;
      currentSessionId.value = newId;
      currentSessionTitle.value = lbl;
      sidebarNewChatMode.value = mode;
      selectedProvider.value = prov;
      selectedModel.value = defaultModel;
      providerTab.value = prov;
      localStorage.setItem("bk-sidebar-newchat-mode", mode);
      localStorage.setItem("bk-agent-provider", prov);
      localStorage.setItem("bk-agent-model", defaultModel);
      persistPtyTabs(updated, newId);
    } else {
      handleNewChatWith();
    }
  });

  const handleTogglePin = $(async (sessionId: string, currentVal: boolean) => {
    const newVal = !currentVal;
    try {
      await togglePinChatSession(sessionId, newVal);
      sessions.value = sessions.value
        .map((s) => (s.id === sessionId ? { ...s, is_pinned: newVal } : s))
        .sort((a, b) => {
          const pinA = a.is_pinned ? 1 : 0;
          const pinB = b.is_pinned ? 1 : 0;
          if (pinB !== pinA) return pinB - pinA;
          return (b.updated_at || 0) - (a.updated_at || 0);
        });
    } catch (err) {
      console.error("Failed to toggle pin on session:", err);
    }
  });

  const handleToggleSave = $(async (sessionId: string, currentVal: boolean) => {
    const newVal = !currentVal;
    try {
      await toggleSaveChatSession(sessionId, newVal);
      sessions.value = sessions.value.map((s) =>
        s.id === sessionId ? { ...s, is_saved: newVal } : s
      );
    } catch (err) {
      console.error("Failed to toggle save on session:", err);
    }
  });

  const handleRenameSession = $(async (sessionId: string, newTitle: string) => {
    const title = newTitle.trim();
    if (!title) return;
    try {
      await renameChatSession(sessionId, title);
      sessions.value = sessions.value.map((s) =>
        s.id === sessionId ? { ...s, title } : s
      );
      if (currentSessionId.value === sessionId) {
        currentSessionTitle.value = title;
      }
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  });

  const handleDeleteSession = $(async (sessionId: string) => {
    deleteCachedSession(sessionId);
    try {
      await deleteChatSession(sessionId);
      const remaining = sessions.value.filter((s) => s.id !== sessionId);
      sessions.value = remaining;
      if (currentSessionId.value === sessionId) {
        if (remaining.length > 0) {
          selectSession(remaining[0].id);
        } else {
          handleNewChat();
        }
      }
    } catch (err) {
      console.error("Failed to delete session:", err);
    }
  });

  const handleSelectModel = $((providerId: string, modelId: string) => {
    let finalProvider = providerId;
    const finalModel = modelId;
    const isPty = sidebarNewChatMode.value.startsWith("cli_terminal");
    const activeTab = isPty && activePtyTabId.value ? ptyTabs.value.find((t) => t.id === activePtyTabId.value) : null;
    const currentCli = getCliProviderForSession({
      selectedProvider: selectedProvider.value,
      selectedModel: selectedModel.value,
      newChatMode: sidebarNewChatMode.value,
      activePtyTabProvider: activeTab?.provider,
    });
    if (currentCli) {
      finalProvider = currentCli;
      if (!isValidModelForCliProvider(currentCli, modelId)) {
        console.warn(`Cannot select model ${modelId} from another CLI in ${currentCli} session`);
        return;
      }
    }
    selectedProvider.value = finalProvider;
    selectedModel.value = finalModel;
    providerTab.value = finalProvider;
    localStorage.setItem("bk-agent-provider", finalProvider);
    localStorage.setItem("bk-agent-model", finalModel);
    localStorage.setItem("bk-agent-model-manual", "true");
    modelSwitcherOpen.value = false;

    if (sidebarNewChatMode.value.startsWith("cli_terminal") && activePtyTabId.value) {
      ptyTabs.value = ptyTabs.value.map((t) =>
        t.id === activePtyTabId.value ? { ...t, model: modelId } : t
      );
      persistPtyTabs(ptyTabs.value, activePtyTabId.value);
    }

    // Validate & clamp effort to selected model's supported tiers
    const reasoningConfig = getModelReasoningConfig(modelId, providerId);
    // Immediately update liveCliStatusCache so the UI badge "Current" updates immediately
    if (providerId.startsWith("cli") || modelId.startsWith("cli:")) {
      const curCache = getCachedCliStatus() || {};
      curCache[providerId] = {
        ...(curCache[providerId] || {
          active_effort: reasoningEffort.value,
          thinking_enabled: thinkingEnabled.value,
          source_path: "",
        }),
        provider: providerId,
        model_id: modelId,
        active_model: getModelDisplayName(modelId),
      };
      setCachedCliStatus(curCache);

      setCliActiveModel(providerId, modelId, thinkingEnabled.value ? reasoningEffort.value : "off").catch((err) => {
        console.warn("Failed to set CLI active model:", err);
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("bk-cli-model-updated", {
            detail: { provider: providerId, modelId, effort: thinkingEnabled.value ? reasoningEffort.value : "off" },
          })
        );
      }
    }

    if (reasoningConfig.supportsReasoning) {
      if (!reasoningConfig.supportedTiers.includes(reasoningEffort.value)) {
        reasoningEffort.value = reasoningConfig.defaultTier;
        localStorage.setItem("bk-agent-reasoning-effort", reasoningConfig.defaultTier);
      }
    }
  });

  const handleSelectDomain = $((domainId: string) => {
    selectedDomain.value = domainId;
    localStorage.setItem("bk-agent-domain", domainId);
    if (domainId !== "all") {
      slashTab.value = domainId as any;
    }
    domainDropdownOpen.value = false;
  });

  const handleSelectAutoMode = $((mode: "auto" | "ask" | "off") => {
    autoMode.value = mode;
    localStorage.setItem("bk-agent-auto-mode", mode);
    autoMenuOpen.value = false;
  });

  const handleSelectEffort = $((effort: "low" | "medium" | "high" | "extra" | "max") => {
    reasoningEffort.value = effort;
    localStorage.setItem("bk-agent-reasoning-effort", effort);

    if (selectedProvider.value.startsWith("cli") || selectedModel.value.startsWith("cli:")) {
      const curCache = getCachedCliStatus() || {};
      const prov = selectedProvider.value;
      curCache[prov] = {
        ...(curCache[prov] || {
          model_id: selectedModel.value,
          active_model: getModelDisplayName(selectedModel.value),
          thinking_enabled: thinkingEnabled.value,
          source_path: "",
        }),
        provider: prov,
        model_id: selectedModel.value,
        active_model: getModelDisplayName(selectedModel.value),
        active_effort: effort,
      };
      setCachedCliStatus(curCache);

      setCliActiveModel(selectedProvider.value, selectedModel.value, effort).catch((err) => {
        console.warn("Failed to update CLI reasoning effort:", err);
      });
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("bk-cli-model-updated", {
            detail: { provider: selectedProvider.value, modelId: selectedModel.value, effort },
          })
        );
      }
    }
  });

  const handleFileChange = $((e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      const file = input.files[0];
      const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : undefined;
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = typeof reader.result === "string" ? reader.result : "";
        attachedFile.value = {
          name: file.name,
          type: file.type || "image/png",
          previewUrl,
          dataBase64: base64,
        };
      };
      reader.readAsDataURL(file);
    }
    input.value = "";
  });

  // Setup streaming event listeners, click-outside auto close, and shortcuts
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    let unlistenToken: UnlistenFn | undefined;
    let unlistenTool: UnlistenFn | undefined;
    let unlistenDone: UnlistenFn | undefined;
    let unlistenError: UnlistenFn | undefined;

    // Load saved settings
    const savedAuto = localStorage.getItem("bk-agent-auto-mode") as "auto" | "ask" | "off" | null;
    if (savedAuto && ["auto", "ask", "off"].includes(savedAuto)) {
      autoMode.value = savedAuto;
    }
    const savedEffort = localStorage.getItem("bk-agent-reasoning-effort") as any;
    if (savedEffort && ["low", "medium", "high", "extra", "max"].includes(savedEffort)) {
      const reasoningConfig = getModelReasoningConfig(selectedModel.value, selectedProvider.value);
      if (reasoningConfig.supportsReasoning && reasoningConfig.supportedTiers.includes(savedEffort)) {
        reasoningEffort.value = savedEffort;
      } else {
        reasoningEffort.value = reasoningConfig.defaultTier;
      }
    }
    // AI Thinking is strictly OFF by default
    thinkingEnabled.value = false;

    const syncConnectionDefaults = async () => {
      // If we are in an active terminal session, don't overwrite selectedProvider/model with cloud defaults
      if (sidebarNewChatMode.value.startsWith("cli_terminal") && ptyTabs.value.length > 0) {
        return;
      }
      // Fetch live CLI models directly from disk first
      const cliStatuses = await fetchAndSyncActiveCliModels().catch(() => null);

      // If in CLI mode, sync the CLI status
      if (sidebarNewChatMode.value.startsWith("cli_")) {
        if (cliStatuses && cliStatuses[selectedProvider.value]) {
          selectedModel.value = cliStatuses[selectedProvider.value].model_id;
          const activeCli = cliStatuses[selectedProvider.value];
          if (activeCli.active_effort && ["low", "medium", "high", "extra", "max"].includes(activeCli.active_effort)) {
            reasoningEffort.value = activeCli.active_effort as any;
          }
        }
        return;
      }

      // In standard Chat mode, strictly resolve cloud connection defaults (never CLI!)
      const isManual = localStorage.getItem("bk-agent-model-manual") === "true";
      const savedModel = localStorage.getItem("bk-agent-model");
      const savedProvider = localStorage.getItem("bk-agent-provider");

      if (isManual && savedProvider && !savedProvider.startsWith("cli") && savedModel && !savedModel.startsWith("cli:")) {
        selectedModel.value = savedModel;
        selectedProvider.value = savedProvider;
        providerTab.value = selectedProvider.value;
        return;
      }

      try {
        const conns: any = await invoke("list_connections");
        if (Array.isArray(conns) && conns.length > 0) {
          const def = detectDefaultAiConnection(conns);
          selectedProvider.value = def.provider;
          selectedModel.value = def.model;
          providerTab.value = def.provider;
          localStorage.setItem("bk-agent-provider", def.provider);
          localStorage.setItem("bk-agent-model", def.model);
          return;
        }
      } catch {
        // ignore connection load error
      }

      if (savedProvider && !savedProvider.startsWith("cli") && savedModel && !savedModel.startsWith("cli:")) {
        selectedModel.value = savedModel;
        selectedProvider.value = savedProvider;
        providerTab.value = selectedProvider.value;
        return;
      }

      // Fallback default for Chat mode
      selectedProvider.value = "openrouter";
      selectedModel.value = "google/gemini-3.5-flash-lite";
      providerTab.value = "openrouter";
      localStorage.setItem("bk-agent-provider", "openrouter");
      localStorage.setItem("bk-agent-model", "google/gemini-3.5-flash-lite");
    };

    syncConnectionDefaults();

    const handleConnectionUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ provider: string; model: string }>;
      if (customEvent.detail && customEvent.detail.provider && customEvent.detail.model) {
        selectedProvider.value = customEvent.detail.provider;
        selectedModel.value = customEvent.detail.model;
        providerTab.value = customEvent.detail.provider;
      } else {
        syncConnectionDefaults();
      }
    };

    const handleCliModelUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ provider: string; modelId: string; effort?: string }>;
      if (customEvent.detail) {
        if (selectedProvider.value === customEvent.detail.provider) {
          selectedModel.value = customEvent.detail.modelId;
          if (customEvent.detail.effort && customEvent.detail.effort !== "off" && ["low", "medium", "high", "extra", "max"].includes(customEvent.detail.effort)) {
            reasoningEffort.value = customEvent.detail.effort as any;
          } else if (customEvent.detail.effort === "off") {
            thinkingEnabled.value = false;
          }
        }
      }
    };

    const handleStorage = (e: StorageEvent) => {
      if (e.key === "bk-agent-provider" || e.key === "bk-agent-model") {
        syncConnectionDefaults();
      }
    };

    window.addEventListener("bk-ai-connection-updated", handleConnectionUpdate);
    window.addEventListener("bk-cli-model-updated", handleCliModelUpdate);
    window.addEventListener("storage", handleStorage);
    const initialDomain = resolveDefaultDomain(appCtx.installedApps.value);
    selectedDomain.value = initialDomain;
    if (initialDomain !== "all") {
      slashTab.value = initialDomain as any;
    }
    if (savedAuto) {
      autoMode.value = savedAuto;
    }
    fetchAndApplyLivePricing().catch(() => {});
    getAgentAnalytics().then((data) => {
      setCachedAgentAnalytics(data);
    }).catch(() => {});

    getActiveProfileId().then((p) => {
      if (p) activeProfileId.value = p;
    }).catch(() => {});

    // At start, user must always open in mode="chat"
    sidebarNewChatMode.value = "chat";
    localStorage.setItem("bk-sidebar-newchat-mode", "chat");

    try {
      const storedTabs = localStorage.getItem("bk-sidebar-pty-tabs");
      const storedActiveId = localStorage.getItem("bk-sidebar-pty-active-tab");
      let restoredTabs: PtyTab[] = [];
      if (storedTabs) {
        try {
          const parsed = JSON.parse(storedTabs);
          if (Array.isArray(parsed) && parsed.length > 0) {
            restoredTabs = parsed;
          }
        } catch {
          // ignore
        }
      }

      if (restoredTabs.length > 0) {
        ptyTabs.value = restoredTabs;
        const activeTab = restoredTabs.find((t) => t.id === storedActiveId) || restoredTabs[0];
        activePtyTabId.value = activeTab.id;
        ptySessionId.value = activeTab.id;
        // Do NOT set sidebarNewChatMode.value to terminal mode here!
        // At start when user opens, it must open in mode="chat".
        // The tabs remain restored in background so they are ready when terminal mode is explicitly chosen.
      }
    } catch {
      // ignore
    }

    invoke<any[]>("shop_list_staff", {}).then((staffList) => {
      if (Array.isArray(staffList)) {
        const map: Record<string, string> = {};
        for (const s of staffList) {
          const fullName = [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.display_name || s.name;
          if (s.id && fullName) map[s.id] = fullName;
          if (s.user_id && fullName) map[s.user_id] = fullName;
        }
        setCachedStaffLookup(map);
      }
    }).catch(() => {});

    const checkDesktop = () => {
      if (typeof window !== "undefined") {
        const isTouch =
          /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) ||
          (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 2 && /Macintosh/i.test(navigator.userAgent));
        const isNarrow = window.innerWidth <= 860;
        isDesktop.value = !isTouch && !isNarrow;
      }
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);

    // Auto-close open dropdowns when clicking outside
    const handleDocumentPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-agent-popover]") || target.closest("[data-agent-trigger]")) {
        return;
      }
      newChatMenuOpen.value = false;
      domainDropdownOpen.value = false;
      modelSwitcherOpen.value = false;
      autoMenuOpen.value = false;
      effortMenuOpen.value = false;
      slashMenuOpen.value = false;
      mobileSessionsOpen.value = false;
    };

    window.addEventListener("pointerdown", handleDocumentPointerDown);

    const setupListeners = async () => {
      unlistenToken = await listen<ChatTokenPayload>("chat-token", (event) => {
        if (event.payload.session_id === currentSessionId.value) {
          streamingText.value += event.payload.token;
          scrollToBottom();
        }
      });

      unlistenTool = await listen<ChatToolCallPayload>("chat-tool-call", (event) => {
        if (event.payload.session_id === currentSessionId.value) {
          const payload = event.payload;
          const existingIdx = activeToolActions.value.findIndex((t) => t.id === payload.tool_id);
          if (existingIdx >= 0) {
            const updated = [...activeToolActions.value];
            updated[existingIdx] = {
              id: payload.tool_id,
              tool: payload.tool_name,
              args: payload.args,
              result: payload.result,
              status: payload.status,
            };
            activeToolActions.value = updated;
          } else {
            activeToolActions.value = [
              ...activeToolActions.value,
              {
                id: payload.tool_id,
                tool: payload.tool_name,
                args: payload.args,
                result: payload.result,
                status: payload.status,
              },
            ];
          }
          scrollToBottom();
        }
      });

      unlistenDone = await listen<ChatDonePayload>("chat-done", (event) => {
        if (event.payload.session_id === currentSessionId.value) {
          const finishedAssistantMessage: UiMessage = {
            id: "msg_" + Math.random().toString(36).substring(2, 9),
            role: "assistant",
            content: event.payload.content || streamingText.value,
            toolActions: activeToolActions.value.length > 0 ? [...activeToolActions.value] : undefined,
            created_at: Date.now() / 1000,
          };

          const updated = [...messages.value, finishedAssistantMessage];
          messages.value = updated;
          setCachedSessionMessages(event.payload.session_id, updated);
          streamingText.value = "";
          activeToolActions.value = [];
          isStreaming.value = false;
          currentRequestId.value = null;
          scrollToBottom();

          // Refresh sessions list in background
          listChatSessions().then((list) => {
            sessions.value = list;
            const updated = list.find((s) => s.id === currentSessionId.value);
            if (updated) currentSessionTitle.value = updated.title;
          });
        }
      });

      unlistenError = await listen<ChatErrorPayload>("chat-error", (event) => {
        if (event.payload.session_id === currentSessionId.value) {
          errorBanner.value = event.payload.error;
          isStreaming.value = false;
          currentRequestId.value = null;
          streamingText.value = "";
          setTimeout(scrollToBottom, 50);
        }
      });
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        textareaRef.value?.focus();
      }
      if (e.key === "Escape") {
        domainDropdownOpen.value = false;
        modelSwitcherOpen.value = false;
        autoMenuOpen.value = false;
        slashMenuOpen.value = false;
        mobileSessionsOpen.value = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    setupListeners();
    loadSessions();

    cleanup(() => {
      window.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("bk-ai-connection-updated", handleConnectionUpdate);
      window.removeEventListener("bk-cli-model-updated", handleCliModelUpdate);
      window.removeEventListener("storage", handleStorage);
      unlistenToken?.();
      unlistenTool?.();
      unlistenDone?.();
      unlistenError?.();
    });
  });

  const handleSendMessage = $(async () => {
    let text = inputValue.value.trim();
    if (!text && !attachedFile.value) return;
    if (isStreaming.value) return;

    // ── PTY mode: send text directly into the terminal, no chat session ──
    if (sidebarNewChatMode.value.startsWith("cli_terminal") && ptySessionId.value) {
      const sendText = text ? text + "\n" : "";
      if (sendText) {
        writeTerminalInput(ptySessionId.value, sendText).catch(() => {});
      }
      inputValue.value = "";
      if (textareaRef.value) {
        textareaRef.value.value = "";
        textareaRef.value.style.height = "auto";
        textareaRef.value.blur();
      }
      slashMenuOpen.value = false;
      attachedFile.value = null;

      // Pass cursor directly to the active terminal input
      setTimeout(() => {
        const activePane = document.querySelector(".pty-tab-content-active") || document.querySelector(".pty-panels-container:not([style*='display: none'])");
        const termInput = (activePane?.querySelector(".xterm-helper-textarea") || document.querySelector(".xterm-helper-textarea")) as HTMLTextAreaElement | null;
        termInput?.focus();
      }, 30);

      return;
    }

    let attachmentName: string | undefined;
    if (attachedFile.value) {
      attachmentName = attachedFile.value.name;
      text = text ? `[Attached: ${attachedFile.value.name}]\n${text}` : `[Attached: ${attachedFile.value.name}] Process and extract data from this attached file.`;
    }

    let targetSessionId = currentSessionId.value;
    if (!targetSessionId) {
      try {
        const newSession = await startChatSession();
        sessions.value = [newSession, ...sessions.value];
        currentSessionId.value = newSession.id;
        currentSessionTitle.value = newSession.title || "New Conversation";
        targetSessionId = newSession.id;
      } catch (err: any) {
        console.error("Failed to auto-create session on send:", err);
        errorBanner.value = typeof err === "string" ? err : err.message || "Failed to initialize conversation session";
        setTimeout(scrollToBottom, 50);
        return;
      }
    }

    let attachmentPayload: AttachmentPayload | undefined;
    if (attachedFile.value && attachedFile.value.dataBase64) {
      attachmentPayload = {
        name: attachedFile.value.name,
        mimeType: attachedFile.value.type,
        dataBase64: attachedFile.value.dataBase64,
      };
    }

    errorBanner.value = "";
    inputValue.value = "";
    if (textareaRef.value) textareaRef.value.style.height = "auto";
    attachedFile.value = null;
    slashMenuOpen.value = false;
    modelSwitcherOpen.value = false;
    autoMenuOpen.value = false;
    effortMenuOpen.value = false;
    domainDropdownOpen.value = false;

    // Auto-sync Domain Selector if explicit domain command is used
    const detectedDomain = detectDomainFromCommand(text);
    if (detectedDomain && isDomainAvailable(detectedDomain, appCtx.installedApps.value)) {
      selectedDomain.value = detectedDomain;
      slashTab.value = detectedDomain;
      try {
        localStorage.setItem("bk-agent-domain", detectedDomain);
      } catch {
        // ignore storage error
      }
    }

    // Add user message to UI immediately
    const userMsg: UiMessage = {
      id: "usr_" + Math.random().toString(36).substring(2, 9),
      role: "user",
      content: text,
      attachmentName,
      created_at: Date.now() / 1000,
    };
    const updatedMessages = [...messages.value, userMsg];
    messages.value = updatedMessages;
    setCachedSessionMessages(targetSessionId, updatedMessages);

    // Reset stream signals
    streamingText.value = "";
    activeToolActions.value = [];
    isStreaming.value = true;
    const reqId = "req_" + Math.random().toString(36).substring(2, 11);
    currentRequestId.value = reqId;
    setTimeout(scrollToBottom, 50);

    const cmdIdToSend = sourceCommandId.value || undefined;
    sourceCommandId.value = null;

    try {
      await sendChatMessage(
        targetSessionId,
        text,
        reqId,
        selectedProvider.value,
        selectedModel.value,
        selectedDomain.value,
        attachmentPayload,
        thinkingEnabled.value ? reasoningEffort.value : "off",
        cmdIdToSend
      );
    } catch (err: any) {
      console.error("sendChatMessage error:", err);
      errorBanner.value = typeof err === "string" ? err : err.message || "Failed to send message";
      isStreaming.value = false;
      currentRequestId.value = null;
      setTimeout(scrollToBottom, 50);
    }
  });

  const handleStop = $(async () => {
    if (sidebarNewChatMode.value.startsWith("cli_terminal") && ptySessionId.value) {
      writeTerminalInput(ptySessionId.value, "\x03").catch(() => {});
      return;
    }
    if (currentRequestId.value) {
      try {
        await stopChatSession(currentRequestId.value);
      } catch (err) {
        console.error("Failed to stop chat:", err);
      }
      isStreaming.value = false;
      currentRequestId.value = null;
    }
  });

  const copyToClipboard = $((text: string, index: number) => {
    navigator.clipboard.writeText(text);
    copiedIndex.value = index;
    setTimeout(() => {
      copiedIndex.value = null;
    }, 2000);
  });

  const isPty = sidebarNewChatMode.value.startsWith("cli_terminal");
  const activePtyTab = isPty && activePtyTabId.value ? ptyTabs.value.find((t) => t.id === activePtyTabId.value) : null;
  const currentCliProvider = getCliProviderForSession({
    selectedProvider: selectedProvider.value,
    selectedModel: selectedModel.value,
    newChatMode: sidebarNewChatMode.value,
    activePtyTabProvider: activePtyTab?.provider,
  });
  const isCliOrPty = Boolean(currentCliProvider);
  const isCli = isCliOrPty && !isPty;
  const activeProviderKey = currentCliProvider || providerTab.value;
  const currentModelsList = currentCliProvider
    ? MODEL_OPTIONS[currentCliProvider] || []
    : MODEL_OPTIONS[activeProviderKey] || MODEL_OPTIONS["openrouter"] || [];
  const dynamicStarterCommands = DOMAIN_STARTER_COMMANDS[selectedDomain.value] || DOMAIN_STARTER_COMMANDS["all"];

  return (
    <div class="page-full agents-page-wrap">
      <div class="agents-workspace">
        {/* ── Left Sidebar (Conversations History) ───────────────────────────── */}
        <AgentSessionsSidebar
          sessions={sessions.value}
          currentSessionId={currentSessionId.value}
          loadingSessions={loadingSessions.value}
          selectedModel={selectedModel.value}
          selectedDomain={selectedDomain.value}
          onSelectSession$={selectSession}
          onTogglePin$={handleTogglePin}
          onToggleSave$={handleToggleSave}
          onRename$={handleRenameSession}
          onDelete$={handleDeleteSession}
        />

        {/* ── Main Chat Workspace (Right Column) ────────────────────────────── */}
        <div class="panel-chat">
          {/* Top Bar matching AgentChatSidebar (bg: surface-2) */}
          <div class="agent-header">
            <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;flex:1;">
              {/* Desktop title */}
              <div class="desktop-title" style="display:flex;align-items:center;gap:0.5rem;min-width:0;">
                <LuSparkles style="width:0.875rem;height:0.875rem;color:var(--text-secondary);flex-shrink:0;" />
                <span style="font-size:0.875rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  {currentSessionTitle.value}
                </span>
              </div>

              {/* Mobile session dropdown trigger (visible on mobile screens) */}
              <div class="mobile-only-trigger" style="position:relative;">
                <button
                  type="button"
                  data-agent-trigger="true"
                  onClick$={() => {
                    mobileSessionsOpen.value = !mobileSessionsOpen.value;
                    domainDropdownOpen.value = false;
                  }}
                  style="display:inline-flex;align-items:center;gap:0.375rem;padding:0 0.5rem;height:1.875rem;border-radius:0.375rem;background:transparent;border:1px solid var(--border);color:var(--text-primary);font-size:0.75rem;font-weight:600;max-width:180px;cursor:pointer;"
                >
                  {(() => {
                    const active = sessions.value.find((s) => s.id === currentSessionId.value);
                    return active ? (
                      <SessionIcon session={active} />
                    ) : (
                      <LuBot style="width:0.8125rem;height:0.8125rem;color:var(--text-secondary);flex-shrink:0;" />
                    );
                  })()}
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    {currentSessionTitle.value}
                  </span>
                  <LuChevronDown style="width:0.6875rem;height:0.6875rem;opacity:0.6;flex-shrink:0;" />
                </button>

                {mobileSessionsOpen.value && (
                  <div
                    data-agent-popover="true"
                    style="position:absolute;left:0;top:calc(100% + 6px);width:260px;max-height:320px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 12px 32px rgba(0,0,0,0.22);z-index:100;overflow-y:auto;padding:0.375rem;display:flex;flex-direction:column;gap:2px;"
                  >
                    <div style="padding:0.25rem 0.5rem;font-size:0.6875rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;display:flex;align-items:center;justify-content:space-between;">
                      <span>Conversations</span>
                      <button
                        type="button"
                        onClick$={$(() => {
                          mobileSessionsOpen.value = false;
                          handleNewChat();
                        })}
                        style="background:none;border:none;color:var(--text-primary);font-size:0.75rem;font-weight:600;cursor:pointer;display:inline-flex;align-items:center;gap:2px;"
                      >
                        <LuPlus style="width:0.75rem;height:0.75rem;" />
                        <span>New</span>
                      </button>
                    </div>
                    {sessions.value
                      .filter((s) => {
                        if (!isDesktop.value) {
                          const { isCli, isPty } = getSessionCliInfo(s);
                          if (isCli || isPty) return false;
                        }
                        return true;
                      })
                      .slice(0, sessionLimit.value)
                      .map((s) => (
                      <button
                        key={s.id}
                        type="button"
                        onClick$={$(() => {
                          mobileSessionsOpen.value = false;
                          selectSession(s.id);
                        })}
                        style={`width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;${s.id === currentSessionId.value ? "background:var(--surface-3);font-weight:600;color:var(--text-primary);" : "background:transparent;color:var(--text-secondary);"}`}
                      >
                        <div style="display:flex;align-items:center;gap:0.45rem;overflow:hidden;flex:1;">
                          <SessionIcon session={s} isMobileOrTablet={!isDesktop.value} />
                          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">{s.title || "Conversation"}</span>
                        </div>
                        <span style="font-size:0.6875rem;color:var(--text-secondary);opacity:0.8;flex-shrink:0;">{fmtWhen(s.updated_at)}</span>
                      </button>
                    ))}
                    {sessions.value.length > sessionLimit.value && (
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
                  </div>
                )}
              </div>
            </div>

            {/* Right Header Toolbar: Domain Selector + [+ New] Button (No Fill) */}
            <div style="display:flex;align-items:center;gap:0.375rem;flex-shrink:0;">
              {/* Domain Selector Dropdown (Transparent Background, Stroke Border Only) */}
              <DomainSelector
                selectedDomain={selectedDomain}
                isOpen={domainDropdownOpen}
                onSelect$={handleSelectDomain}
              />

              {/* Split Combo New Chat Button & Dropdown Menu */}
              <NewChat
                currentMode={sidebarNewChatMode}
                isOpen={newChatMenuOpen}
                isDesktop={isDesktop}
                onNewChat$={handleNewChatAction}
              />

              {/* Analytics Icon Button (hidden on desktop/tablet, visible on mobile) */}
              <div class="agent-header-analytics">
                <Link
                  href="/dashboard/agents/analytics"
                  title="Agent Analytics & Spend"
                  style="width:1.875rem;height:1.875rem;border-radius:0.375rem;border:1px solid var(--border);background:transparent;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s ease;padding:0;text-decoration:none;"
                  onMouseEnter$={(e, el) => {
                    el.style.color = "var(--text-primary)";
                    el.style.borderColor = "var(--text-secondary)";
                  }}
                  onMouseLeave$={(e, el) => {
                    el.style.color = "var(--text-secondary)";
                    el.style.borderColor = "var(--border)";
                  }}
                >
                  <LuBarChart3 style="width:0.875rem;height:0.875rem;" />
                </Link>
              </div>
            </div>
          </div>

          {/* ── PTY Tab Bar (below header, only in terminal mode) ── */}
          {sidebarNewChatMode.value.startsWith("cli_terminal") && ptyTabs.value.length > 0 && (
            <div style="display:flex;align-items:center;border-bottom:1px solid var(--border);background:var(--surface-2);height:30px;flex-shrink:0;">
              <PtyTabBar
                tabs={ptyTabs}
                activeTabId={activePtyTabId}
                onSelectTab$={$((id: string) => {
                  const tab = ptyTabs.value.find((t) => t.id === id);
                  if (!tab) return;
                  activePtyTabId.value = id;
                  ptySessionId.value = id;
                  const mode = `cli_terminal_${tab.cli === "antigravity" ? "antigravity" : tab.cli}` as any;
                  const model = tab.model || getDefaultModelForProvider(tab.provider);
                  sidebarNewChatMode.value = mode;
                  selectedProvider.value = tab.provider;
                  selectedModel.value = model;
                  providerTab.value = tab.provider;
                  localStorage.setItem("bk-sidebar-newchat-mode", mode);
                  localStorage.setItem("bk-agent-provider", tab.provider);
                  localStorage.setItem("bk-agent-model", model);
                  persistPtyTabs(ptyTabs.value, id);
                })}
                onCloseTab$={$((id: string) => {
                  stopTerminalSession(id).catch(() => {});
                  const remaining = ptyTabs.value.filter((t) => t.id !== id);
                  ptyTabs.value = remaining;
                  if (remaining.length > 0) {
                    const next = remaining[remaining.length - 1];
                    activePtyTabId.value = next.id;
                    ptySessionId.value = next.id;
                    const mode = `cli_terminal_${next.cli === "antigravity" ? "antigravity" : next.cli}` as any;
                    const model = next.model || getDefaultModelForProvider(next.provider);
                    sidebarNewChatMode.value = mode;
                    selectedProvider.value = next.provider;
                    selectedModel.value = model;
                    providerTab.value = next.provider;
                    localStorage.setItem("bk-sidebar-newchat-mode", mode);
                    localStorage.setItem("bk-agent-provider", next.provider);
                    localStorage.setItem("bk-agent-model", model);
                    persistPtyTabs(remaining, next.id);
                  } else {
                    activePtyTabId.value = "";
                    ptySessionId.value = "";
                    sidebarNewChatMode.value = "chat";
                    localStorage.setItem("bk-sidebar-newchat-mode", "chat");
                    persistPtyTabs([], "");
                  }
                })}
                onAddTab$={$(() => {
                  newChatMenuOpen.value = !newChatMenuOpen.value;
                })}
              />
            </div>
          )}

          {/* ── Multi-tab PTY terminal panels (kept mounted in DOM to preserve terminal session state) ── */}
          <div
            class="pty-panels-container"
            style={`display:${sidebarNewChatMode.value.startsWith("cli_terminal") && ptyTabs.value.length > 0 ? "flex" : "none"};flex:1;min-height:0;flex-direction:column;`}
          >
            {ptyTabs.value.map((tab) => (
              <div
                key={tab.id}
                class={`pty-tab-pane ${tab.id === activePtyTabId.value ? "pty-tab-content-active" : ""}`}
                style={`display:${tab.id === activePtyTabId.value ? "flex" : "none"};flex:1;min-height:0;flex-direction:column;`}
              >
                <AgentTerminalPanel
                  sessionId={tab.id}
                  profileId={activeProfileId.value}
                  cli={tab.cli}
                  provider={tab.provider}
                  onStop$={$(() => {
                    const remaining = ptyTabs.value.filter((t) => t.id !== tab.id);
                    ptyTabs.value = remaining;
                    if (remaining.length > 0) {
                      const next = remaining[remaining.length - 1];
                      activePtyTabId.value = next.id;
                      ptySessionId.value = next.id;
                      const mode = `cli_terminal_${next.cli === "antigravity" ? "antigravity" : next.cli}` as any;
                      const model = next.model || getDefaultModelForProvider(next.provider);
                      sidebarNewChatMode.value = mode;
                      selectedProvider.value = next.provider;
                      selectedModel.value = model;
                      providerTab.value = next.provider;
                      localStorage.setItem("bk-sidebar-newchat-mode", mode);
                      localStorage.setItem("bk-agent-provider", next.provider);
                      localStorage.setItem("bk-agent-model", model);
                      persistPtyTabs(remaining, next.id);
                    } else {
                      activePtyTabId.value = "";
                      ptySessionId.value = "";
                      sidebarNewChatMode.value = "chat";
                      localStorage.setItem("bk-sidebar-newchat-mode", "chat");
                      persistPtyTabs([], "");
                    }
                  })}
                />
              </div>
            ))}
          </div>

          {/* ── Message Stream Body Area (Full text selection enabled) ──────── */}
          <div
            class="agent-body"
            style={`display:${sidebarNewChatMode.value.startsWith("cli_terminal") && ptyTabs.value.length > 0 ? "none" : "flex"};`}
          >
            {messages.value.length === 0 && !isStreaming.value && (
              <div class="agent-msg-fade" style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:2rem 1rem;gap:0.5rem;margin:auto 0;box-sizing:border-box;">
                <div style="width:3.25rem;height:3.25rem;border-radius:0.75rem;background:transparent;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.05);margin-bottom:0.375rem;">
                  <LuBot style="width:1.625rem;height:1.625rem;" />
                </div>
                <h3 style="font-size:1.125rem;font-weight:600;color:var(--text-primary);margin:0;">
                  BusinessKit Agent
                </h3>
                <p
                  title="Manage your private inventory, invoices, contacts, and content using natural commands."
                  style="font-size:0.8125rem;color:var(--text-secondary);margin:0 0 1.25rem 0;line-height:1.5;max-width:420px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;width:100%;box-sizing:border-box;text-align:center;"
                >
                  Manage your private inventory, invoices, contacts, and content using natural commands.
                </p>

                {/* Dynamic Domain Starter Cards (No Fill, On Click Adds /command) */}
                <div class="starter-cards-grid">
                  {dynamicStarterCommands.map((item) => (
                    <button
                      key={item.cmd + item.name}
                      type="button"
                      onClick$={$(() => {
                        setComposerText(getCommandInputText(item.cmd), item.id);
                      })}
                      class="starter-card-item"
                    >
                      <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;flex:1;">
                        <div style="width:1.625rem;height:1.625rem;border-radius:0.3125rem;background:transparent;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-primary);flex-shrink:0;">
                          {item.iconType === "invoice" ? (
                            <LuFileText style="width:0.8125rem;height:0.8125rem;" />
                          ) : item.iconType === "package" ? (
                            <LuPackage style="width:0.8125rem;height:0.8125rem;" />
                          ) : item.iconType === "contact" ? (
                            <LuUserCheck style="width:0.8125rem;height:0.8125rem;" />
                          ) : item.iconType === "post" ? (
                            <LuPenTool style="width:0.8125rem;height:0.8125rem;" />
                          ) : (
                            <LuSparkles style="width:0.8125rem;height:0.8125rem;" />
                          )}
                        </div>
                        <div style="display:flex;flex-direction:column;min-width:0;flex:1;">
                          <span style="font-size:0.75rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">
                            {item.name}
                          </span>
                          <span style="font-size:0.625rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;">
                            {item.desc}
                          </span>
                        </div>
                      </div>
                      <LuArrowRight style="width:0.75rem;height:0.75rem;color:var(--text-secondary);flex-shrink:0;opacity:0.6;" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.value.map((msg, idx) => (
              <div
                key={msg.id}
                class="agent-msg-fade"
                style={`display:flex;flex-direction:column;${msg.role === 'user' ? 'align-items:flex-end;' : 'align-items:flex-start;width:100%;'}`}
              >
                <div
                  class="agent-selectable-text"
                  style={
                    msg.role === "user"
                      ? "background:var(--surface-1);color:var(--text-primary);border:1px solid var(--border);border-radius:0.75rem;padding:0.625rem 0.875rem;font-size:0.8125rem;max-width:80%;line-height:1.5;word-break:break-word;user-select:text;-webkit-user-select:text;box-shadow:0 1px 3px rgba(0,0,0,0.03);"
                      : "background:transparent;border:none;border-radius:0;padding:0.25rem 0;font-size:0.8125rem;color:var(--text-primary);width:100%;max-width:100%;line-height:1.6;word-break:break-word;position:relative;box-shadow:none;user-select:text;-webkit-user-select:text;"
                  }
                >
                  {msg.attachmentName && (
                    <div style="display:inline-flex;align-items:center;gap:0.25rem;padding:2px 6px;margin-bottom:0.375rem;border-radius:0.25rem;background:var(--surface-2);border:1px solid var(--border);font-size:0.6875rem;font-family:monospace;">
                      <LuImage style="width:0.6875rem;height:0.6875rem;" />
                      <span>{msg.attachmentName}</span>
                    </div>
                  )}

                  {msg.role === "user" ? (
                    <div style="white-space:pre-wrap;user-select:text;-webkit-user-select:text;">{msg.content}</div>
                  ) : (
                    <MarkdownRenderer content={msg.content} />
                  )}

                  {/* Render executed tool actions */}
                  {msg.toolActions && msg.toolActions.length > 0 && (
                    <div style="margin-top:0.625rem;display:flex;flex-direction:column;gap:0.5rem;width:100%;">
                      {msg.toolActions.map((tool) => (
                        <ToolResultCard key={tool.id} tool={tool} />
                      ))}
                    </div>
                  )}
                </div>

                {/* Footer metadata under bubble: Timestamp + Copy Icon + Retry Icon (for user) */}
                <div style={`display:flex;align-items:center;gap:0.5rem;padding:3px 6px 0;font-size:0.6875rem;color:var(--text-secondary);user-select:none;${msg.role === 'user' ? 'justify-content:flex-end;' : 'justify-content:flex-start;'}`}>
                  <span>{fmtWhen(msg.created_at)}</span>
                  <button
                    type="button"
                    onClick$={$(() => copyToClipboard(msg.content, idx))}
                    title="Copy message"
                    style="background:none;border:none;color:var(--text-secondary);display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:0 2px;opacity:0.75;font-size:0.6875rem;transition:opacity 0.15s;"
                    onMouseOver$={$((_, el) => { el.style.opacity = "1"; })}
                    onMouseOut$={$((_, el) => { el.style.opacity = "0.75"; })}
                  >
                    {copiedIndex.value === idx ? (
                      <>
                        <LuCheck style="width:0.6875rem;height:0.6875rem;color:var(--success);" />
                        <span style="color:var(--success);">Copied</span>
                      </>
                    ) : (
                      <>
                        <LuCopy style="width:0.6875rem;height:0.6875rem;" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>

                  {msg.role === "user" && (
                    <button
                      type="button"
                      onClick$={$(() => {
                        setComposerText(msg.content);
                      })}
                      title="Retry / Edit prompt"
                      style="background:none;border:none;color:var(--text-secondary);display:inline-flex;align-items:center;gap:0.25rem;cursor:pointer;padding:0 2px;opacity:0.75;font-size:0.6875rem;transition:opacity 0.15s;"
                      onMouseOver$={$((_, el) => { el.style.opacity = "1"; })}
                      onMouseOut$={$((_, el) => { el.style.opacity = "0.75"; })}
                    >
                      <LuRotateCcw style="width:0.6875rem;height:0.6875rem;" />
                      <span>Retry</span>
                    </button>
                  )}
                </div>
              </div>
            ))}

            {/* In-flight streaming message */}
            {isStreaming.value && (
              <div class="agent-msg-fade" style="display:flex;flex-direction:column;align-items:flex-start;width:100%;">
                <div class="agent-selectable-text" style="background:transparent;border:none;border-radius:0;padding:0.25rem 0;font-size:0.8125rem;color:var(--text-primary);width:100%;max-width:100%;line-height:1.6;word-break:break-word;box-shadow:none;user-select:text;-webkit-user-select:text;">
                  {streamingText.value ? (
                    <div>
                      <MarkdownRenderer content={streamingText.value} />
                      <span style="display:inline-block;width:3px;height:12px;background:var(--accent);margin-left:2px;vertical-align:middle;animation:spin 1s linear infinite;" />
                    </div>
                  ) : (
                    <div style="display:flex;align-items:center;gap:0.5rem;font-size:0.8125rem;color:var(--text-secondary);">
                      <LuLoader style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
                      <span>Thinking & running tools…</span>
                    </div>
                  )}

                  {activeToolActions.value.length > 0 && (
                    <div style="margin-top:0.625rem;display:flex;flex-direction:column;gap:0.5rem;width:100%;">
                      {activeToolActions.value.map((tool) => (
                        <ToolResultCard key={tool.id} tool={tool} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* In-Box Notification / Connection Prompt Card */}
            {errorBanner.value && (
              <div
                class="agent-selectable-text agent-msg-fade"
                style="background:var(--surface-1);border:1px solid var(--border);border-radius:0.625rem;padding:0.875rem 1rem;display:flex;flex-direction:column;gap:0.75rem;box-shadow:0 1px 4px rgba(0,0,0,0.04);user-select:text;-webkit-user-select:text;margin:0.25rem 0;"
              >
                <div style="display:flex;align-items:flex-start;gap:0.625rem;">
                  <div style="display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;margin-top:2px;">
                    <LuAlertCircle style="width:1.125rem;height:1.125rem;" />
                  </div>
                  <div style="display:flex;flex-direction:column;gap:0.25rem;flex:1;min-width:0;">
                    <span style="font-size:0.8125rem;font-weight:600;color:var(--text-primary);">
                      {errorBanner.value.toLowerCase().includes("connection") || errorBanner.value.toLowerCase().includes("api key")
                        ? "AI Connection Required"
                        : "Agent Notice"}
                    </span>
                    <span style="font-size:0.75rem;color:var(--text-secondary);line-height:1.55;word-break:break-word;">
                      {errorBanner.value}
                    </span>
                  </div>
                </div>

                <div style="display:flex;align-items:center;gap:0.5rem;padding-left:1.75rem;width:100%;box-sizing:border-box;">
                  {(errorBanner.value.toLowerCase().includes("connection") || errorBanner.value.toLowerCase().includes("settings")) && (
                    <Link
                      href="/dashboard/settings/connections"
                      class="bottom-card-btn"
                      style="flex:1;min-width:0;"
                    >
                      <div class="bottom-btn-left">
                        <LuSettings style="width:14px;height:14px;flex-shrink:0;" />
                        <span>Configure in Settings → Connections</span>
                      </div>
                      <LuArrowRight style="width:12px;height:12px;flex-shrink:0;opacity:0.6;" />
                    </Link>
                  )}
                  <button
                    type="button"
                    onClick$={$(() => (errorBanner.value = ""))}
                    class="bottom-card-btn"
                    style="width:auto;padding:7px 12px;flex-shrink:0;"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* ── Chips above composer (Session follow-up chips) ───────────────── */}
          {messages.value.length > 0 && !isStreaming.value && !sidebarNewChatMode.value.startsWith("cli_terminal") && (
            <div class="agent-followup-chips" style="display:flex;align-items:center;gap:0.375rem;padding:0.25rem 1rem;overflow-x:auto;background:transparent;border:none;flex-shrink:0;max-width:860px;margin:0 auto;width:100%;box-sizing:border-box;">
              {FOLLOWUP_CHIPS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick$={$(() => {
                    setComposerText(getCommandInputText(p.text), p.id);
                  })}
                  style="padding:0.2rem 0.5rem;border-radius:0.3125rem;background:var(--surface-1);border:1px solid var(--border);font-size:0.6875rem;font-weight:500;color:var(--text-secondary);cursor:pointer;white-space:nowrap;transition:all 0.15s;box-shadow:0 1px 2px rgba(0,0,0,0.03);"
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Chat Composer Area ───────────────────────────────────────────── */}
          <div class="agent-composer">


            {/* Model Switcher Popover (Opens Bottom Up Above Model Pill) */}
            {modelSwitcherOpen.value && (
              <div
                data-agent-popover="true"
                style="position:absolute;left:1rem;bottom:calc(100% + 8px);width:315px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.625rem;box-shadow:0 12px 32px rgba(0,0,0,0.22);z-index:100;overflow:hidden;display:flex;flex-direction:column;"
              >
                {/* Active Selected Provider Top Header */}
                <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:var(--surface-1);border-bottom:1px solid var(--border);">
                  <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;">
                    <ProviderIcon provider={activeProviderKey} size="1rem" />
                    <div style="display:flex;flex-direction:column;min-width:0;">
                      <span style="font-size:0.8125rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        {PROVIDER_OPTIONS.find((p) => p.id === activeProviderKey)?.name || "Provider"}
                      </span>
                      <span style="font-size:0.6875rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                        {isCliOrPty
                          ? "Local CLI • Free Inference"
                          : "Cloud API • Token Billed"}
                      </span>
                    </div>
                  </div>
                  <span
                    style={`font-size:0.625rem;font-weight:600;padding:2px 6px;border-radius:0.5rem;border:1px solid var(--border);${isCliOrPty ? "background:rgba(59,130,246,0.1);color:var(--accent);" : "background:var(--surface-3);color:var(--text-secondary);"}`}
                  >
                    {isCliOrPty ? (isPty ? "PTY Terminal" : "CLI Mode") : "Cloud"}
                  </span>
                </div>

                {/* Provider Selection Tabs — ONLY shown in Cloud mode.
                    In CLI/PTY sessions, switching to another CLI binary is prohibited within the session. */}
                {!isCliOrPty && (
                  <div style="display:flex;padding:0.375rem 0.5rem;gap:0.375rem;background:var(--surface-2);border-bottom:1px solid var(--border);overflow-x:auto;-webkit-overflow-scrolling:touch;align-items:center;">
                    {PROVIDER_OPTIONS.filter((p) => !p.isCli).map((p) => {
                      const isActive = providerTab.value === p.id;
                      return (
                        <button
                          key={p.id}
                          type="button"
                          onClick$={$(() => (providerTab.value = p.id))}
                          style={`flex-shrink:0;min-width:max-content;padding:0.3125rem 0.5rem;border-radius:0.375rem;font-size:0.6875rem;font-weight:600;border:none;cursor:pointer;transition:all 0.15s;display:flex;align-items:center;justify-content:center;gap:0.3125rem;white-space:nowrap;${isActive ? "background:var(--surface-3);color:var(--text-primary);box-shadow:0 1px 2px rgba(0,0,0,0.08);" : "background:transparent;color:var(--text-secondary);"}`}
                        >
                          <ProviderIcon provider={p.id} size="0.75rem" />
                          <span>{p.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Models List for Selected Provider */}
                <div style="overflow-y:auto;padding:0.375rem;display:flex;flex-direction:column;gap:3px;max-height:240px;">
                  {currentModelsList.map((m) => {
                    const isSelected = selectedModel.value === m.id || resolveCliModelId(selectedModel.value, activeProviderKey) === m.id;
                    const activeCliModelId = getCachedCliStatus()?.[activeProviderKey]?.model_id;
                    const isCurrent = activeCliModelId === m.id;

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick$={$(() => handleSelectModel(activeProviderKey, m.id))}
                        style={`width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;border:1px solid transparent;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;transition:all 0.15s;${isSelected ? "background:var(--surface-3);color:var(--text-primary);font-weight:500;" : "background:transparent;color:var(--text-secondary);"}`}
                      >
                        <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;flex:1;">
                          <ProviderIcon model={m.id} provider={m.provider || activeProviderKey} size="1.125rem" />
                          <div style="display:flex;flex-direction:column;min-width:0;flex:1;gap:2px;">
                            <div style="display:flex;align-items:center;gap:0.375rem;flex-wrap:wrap;">
                              <span style="font-size:0.8125rem;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                {m.name}
                              </span>
                              {isCurrent && (
                                <span style="font-size:0.625rem;font-weight:600;padding:1px 5px;border-radius:0.5rem;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#3b82f6;">
                                  Current
                                </span>
                              )}
                              {m.badge && (
                                <span style="font-size:0.625rem;font-weight:600;padding:1px 5px;border-radius:0.5rem;background:var(--surface-1);border:1px solid var(--border);color:var(--text-secondary);">
                                  {m.badge}
                                </span>
                              )}
                            </div>
                            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;min-width:0;font-family:monospace;font-size:0.6875rem;color:var(--text-secondary);opacity:0.8;">
                              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                {m.id}
                              </span>
                              {m.price && (
                                <span style="flex-shrink:0;">
                                  {m.price}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {isSelected && (
                          <div style="flex-shrink:0;margin-left:0.25rem;">
                            <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent);" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Auto Mode Selector Popover */}
            {autoMenuOpen.value && (
              <div
                data-agent-popover="true"
                style="position:absolute;left:7.5rem;bottom:calc(100% + 8px);width:210px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 12px 32px rgba(0,0,0,0.18);z-index:100;padding:0.375rem;display:flex;flex-direction:column;gap:2px;"
              >
                <div style="padding:0.25rem 0.5rem;font-size:0.6875rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">
                  Tool Execution Mode
                </div>
                <button
                  type="button"
                  onClick$={$(() => handleSelectAutoMode("auto"))}
                  style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.375rem 0.5rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;${autoMode.value === "auto" ? "background:var(--surface-3);font-weight:600;color:var(--success);" : "background:none;color:var(--text-primary);"}`}
                >
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <LuZap style="width:0.875rem;height:0.875rem;color:var(--success);" />
                    <span>Auto Execute</span>
                  </div>
                  {autoMode.value === "auto" && <LuCheck style="width:0.75rem;height:0.75rem;" />}
                </button>
                <button
                  type="button"
                  onClick$={$(() => handleSelectAutoMode("ask"))}
                  style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.375rem 0.5rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;${autoMode.value === "ask" ? "background:var(--surface-3);font-weight:600;color:var(--warning, #f59e0b);" : "background:none;color:var(--text-primary);"}`}
                >
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <LuShield style="width:0.875rem;height:0.875rem;color:var(--warning, #f59e0b);" />
                    <span>Ask Before Run</span>
                  </div>
                  {autoMode.value === "ask" && <LuCheck style="width:0.75rem;height:0.75rem;" />}
                </button>
                <button
                  type="button"
                  onClick$={$(() => handleSelectAutoMode("off"))}
                  style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.375rem 0.5rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;${autoMode.value === "off" ? "background:var(--surface-3);font-weight:600;color:var(--text-primary);" : "background:none;color:var(--text-secondary);"}`}
                >
                  <div style="display:flex;align-items:center;gap:0.5rem;">
                    <LuMessageSquare style="width:0.875rem;height:0.875rem;" />
                    <span>Chat Only</span>
                  </div>
                  {autoMode.value === "off" && <LuCheck style="width:0.75rem;height:0.75rem;" />}
                </button>
              </div>
            )}

            {/* Thinking & Effort Popover (Claude Style) */}
            {effortMenuOpen.value && (() => {
              const reasoningConfig = getModelReasoningConfig(selectedModel.value, selectedProvider.value);
              return (
                <div
                  data-agent-popover="true"
                  style="position:absolute;left:8.5rem;bottom:calc(100% + 8px);width:268px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.75rem;box-shadow:0 16px 40px rgba(0,0,0,0.24);z-index:100;padding:0.625rem;display:flex;flex-direction:column;gap:0.25rem;"
                >
                  {reasoningConfig.supportsReasoning ? (
                    <>
                      {/* Header Description */}
                      <div
                        title="Higher effort means more thorough responses, but takes longer and uses your limits faster."
                        style="font-size:0.75rem;line-height:1.35;color:var(--text-secondary);padding:0.125rem 0.375rem 0.375rem 0.375rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"
                      >
                        Higher effort means more thorough responses, but takes longer and uses your limits faster.
                      </div>

                      {/* Effort Options */}
                      <div style="display:flex;flex-direction:column;gap:1px;">
                        {/* Low (Default) */}
                        {reasoningConfig.supportedTiers.includes("low") && (
                          <button
                            type="button"
                            onClick$={$(() => handleSelectEffort("low"))}
                            style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.4375rem 0.5rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;transition:background-color 0.15s;${reasoningEffort.value === "low" ? "background:var(--surface-3);font-weight:500;color:var(--text-primary);" : "background:none;color:var(--text-secondary);"}`}
                          >
                            <div style="display:flex;align-items:center;gap:0.375rem;">
                              <span>Low</span>
                              <span style="font-size:0.625rem;font-weight:600;padding:1px 5px;border-radius:4px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-tertiary);">
                                Default
                              </span>
                            </div>
                            {reasoningEffort.value === "low" && <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent);" />}
                          </button>
                        )}

                        {/* Medium */}
                        {reasoningConfig.supportedTiers.includes("medium") && (
                          <button
                            type="button"
                            onClick$={$(() => handleSelectEffort("medium"))}
                            style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.4375rem 0.5rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;transition:background-color 0.15s;${reasoningEffort.value === "medium" ? "background:var(--surface-3);font-weight:500;color:var(--text-primary);" : "background:none;color:var(--text-secondary);"}`}
                          >
                            <span>Medium</span>
                            {reasoningEffort.value === "medium" && <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent);" />}
                          </button>
                        )}

                        {/* High */}
                        {reasoningConfig.supportedTiers.includes("high") && (
                          <button
                            type="button"
                            onClick$={$(() => handleSelectEffort("high"))}
                            style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.4375rem 0.5rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;transition:background-color 0.15s;${reasoningEffort.value === "high" ? "background:var(--surface-3);font-weight:500;color:var(--text-primary);" : "background:none;color:var(--text-secondary);"}`}
                          >
                            <span>High</span>
                            {reasoningEffort.value === "high" && <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent);" />}
                          </button>
                        )}

                        {/* Extra */}
                        {reasoningConfig.supportedTiers.includes("extra") && (
                          <button
                            type="button"
                            onClick$={$(() => handleSelectEffort("extra"))}
                            style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.4375rem 0.5rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;transition:background-color 0.15s;${reasoningEffort.value === "extra" ? "background:var(--surface-3);font-weight:500;color:var(--text-primary);" : "background:none;color:var(--text-secondary);"}`}
                          >
                            <span>Extra</span>
                            {reasoningEffort.value === "extra" && <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent);" />}
                          </button>
                        )}

                        {/* Max (3.5x usage warning) */}
                        {reasoningConfig.supportedTiers.includes("max") && (
                          <button
                            type="button"
                            onClick$={$(() => handleSelectEffort("max"))}
                            style={`display:flex;align-items:center;justify-content:space-between;width:100%;text-align:left;padding:0.4375rem 0.5rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;transition:background-color 0.15s;${reasoningEffort.value === "max" ? "background:var(--surface-3);font-weight:500;color:var(--text-primary);" : "background:none;color:var(--text-secondary);"}`}
                          >
                            <div style="display:flex;align-items:center;gap:0.375rem;">
                              <span>Max</span>
                              <span style="font-size:0.625rem;font-weight:600;padding:1px 5px;border-radius:4px;background:rgba(245,158,11,0.12);border:1px solid rgba(245,158,11,0.3);color:#f59e0b;display:inline-flex;align-items:center;gap:2px;">
                                <LuAlertTriangle style="width:0.625rem;height:0.625rem;" /> 3.5× or more usage
                              </span>
                            </div>
                            {reasoningEffort.value === "max" && <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent);" />}
                          </button>
                        )}
                      </div>

                      {/* Divider */}
                      <div style="height:1px;background:var(--border);margin:0.25rem 0;" />

                      {/* Thinking Toggle Switch */}
                      <div style="display:flex;align-items:center;justify-content:space-between;padding:0.375rem 0.5rem;">
                        <div style="display:flex;flex-direction:column;">
                          <span style="font-size:0.8125rem;font-weight:500;color:var(--text-primary);">AI Thinking</span>
                          <span style="font-size:0.6875rem;color:var(--text-secondary);line-height:1.2;">
                            {thinkingEnabled.value ? "Enabled for all turns" : "Off (fastest response)"}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick$={$(() => {
                            const nextVal = !thinkingEnabled.value;
                            thinkingEnabled.value = nextVal;
                            localStorage.setItem("bk-agent-thinking-enabled", String(nextVal));
                            if (selectedProvider.value.startsWith("cli") || selectedModel.value.startsWith("cli:")) {
                              setCliActiveModel(selectedProvider.value, selectedModel.value, nextVal ? reasoningEffort.value : "off").catch((err) => {
                                console.warn("Failed to update CLI thinking toggle:", err);
                              });
                              if (typeof window !== "undefined") {
                                window.dispatchEvent(
                                  new CustomEvent("bk-cli-model-updated", {
                                    detail: { provider: selectedProvider.value, modelId: selectedModel.value, effort: nextVal ? reasoningEffort.value : "off" },
                                  })
                                );
                              }
                            }
                          })}
                          style={`position:relative;width:34px;height:20px;border-radius:9999px;cursor:pointer;border:none;transition:background-color 0.2s;${thinkingEnabled.value ? "background:var(--accent, #3b82f6);" : "background:var(--surface-3);border:1px solid var(--border);"}`}
                          title="Toggle AI Thinking"
                        >
                          <div
                            style={`position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:9999px;box-shadow:0 1px 3px rgba(0,0,0,0.3);transition:transform 0.2s, background-color 0.2s;transform:${thinkingEnabled.value ? "translateX(14px)" : "translateX(0px)"};background:${thinkingEnabled.value ? "var(--toggle-knob-active, #ffffff)" : "var(--toggle-knob-off, #ffffff)"};`}
                          />
                        </button>
                      </div>
                    </>
                  ) : (
                    /* Non-Reasoning Direct Generation Explainer */
                    <div style="padding:0.375rem;display:flex;flex-direction:column;gap:0.375rem;">
                      <div style="font-size:0.8125rem;font-weight:600;color:var(--text-primary);display:flex;align-items:center;gap:0.375rem;">
                        <LuZap style="width:0.875rem;height:0.875rem;color:var(--warning, #f59e0b);" />
                        Direct Response Model
                      </div>
                      <div style="font-size:0.75rem;line-height:1.4;color:var(--text-secondary);">
                        This model generates responses directly without an extended reasoning or thinking phase. Reasoning effort cannot be adjusted.
                      </div>
                      <div style="font-size:0.6875rem;padding:0.25rem 0.5rem;border-radius:0.375rem;background:var(--surface-1);border:1px solid var(--border);color:var(--text-tertiary);">
                        ⚡ Instant Generation · Zero Thinking Overhead
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ── CLI/PTY mode: use CliCompose component ── */}
            {(isCli || sidebarNewChatMode.value.startsWith("cli_terminal")) ? (
              <CliCompose
                isSessionRunning={sidebarNewChatMode.value.startsWith("cli_terminal") && ptyTabs.value.length > 0}
                isPty={sidebarNewChatMode.value.startsWith("cli_terminal")}
                ptyCliLabel={
                  sidebarNewChatMode.value === "cli_terminal_claude" ? "Claude Code"
                  : sidebarNewChatMode.value === "cli_terminal_codex" ? "Codex"
                  : "Antigravity"
                }
                inputValue={inputValue}
                isStreaming={isStreaming}
                attachedFile={attachedFile}
                fileInputId="agent-page-file-input"
                messagesEndRef={messagesEndRef}
                selectedModel={selectedModel}
                selectedProvider={selectedProvider}
                thinkingEnabled={thinkingEnabled}
                reasoningEffort={reasoningEffort}
                autoMode={autoMode}
                textareaRef={textareaRef}
                slashMenuOpen={slashMenuOpen}
                slashTab={slashTab}
                onSelectCommand$={$((s, id) => setComposerText(s, id))}
                onToggleSlash$={$(() => {
                  const avail = SLASH_CATEGORIES.filter((c) => isDomainAvailable(c.id, appCtx.installedApps.value));
                  if (selectedDomain.value !== "all" && isDomainAvailable(selectedDomain.value, appCtx.installedApps.value)) {
                    slashTab.value = selectedDomain.value as any;
                  } else if (!avail.some((c) => c.id === slashTab.value)) {
                    slashTab.value = (avail[0]?.id as any) || "crm";
                  }
                  slashMenuOpen.value = !slashMenuOpen.value;
                  modelSwitcherOpen.value = false;
                  autoMenuOpen.value = false;
                  effortMenuOpen.value = false;
                  domainDropdownOpen.value = false;
                })}
                onToggleModelSwitcher$={$(() => {
                  modelSwitcherOpen.value = !modelSwitcherOpen.value;
                  slashMenuOpen.value = false;
                  autoMenuOpen.value = false;
                  effortMenuOpen.value = false;
                  if (modelSwitcherOpen.value) {
                    if (currentCliProvider) {
                      providerTab.value = currentCliProvider;
                    } else {
                      providerTab.value = findProviderForModel(selectedModel.value) || selectedProvider.value;
                    }
                  }
                })}
                onToggleEffort$={$(() => {
                  effortMenuOpen.value = !effortMenuOpen.value;
                  modelSwitcherOpen.value = false;
                  autoMenuOpen.value = false;
                  slashMenuOpen.value = false;
                })}
                onToggleAuto$={$(() => {
                  autoMenuOpen.value = !autoMenuOpen.value;
                  modelSwitcherOpen.value = false;
                  slashMenuOpen.value = false;
                  effortMenuOpen.value = false;
                })}
                onSend$={handleSendMessage}
                onStop$={handleStop}
                onInput$={$((v: string) => {
                  inputValue.value = v;
                  if (!v || v.trim() === "") {
                    sourceCommandId.value = null;
                  }
                })}
                onAutoDetectDomain$={$((v: string) => autoDetectDomainFromText(v))}
                onClearFile$={$(() => (attachedFile.value = null))}
                onFileChange$={handleFileChange}
              />
            ) : (
              /* Cloud chat compose — ChatCompose component */
              <div class="agent-input-container">
                <ChatCompose
                  inputValue={inputValue}
                  isStreaming={isStreaming}
                  attachedFile={attachedFile}
                  fileInputId="agent-page-file-input"
                  messagesEndRef={messagesEndRef}
                  selectedModel={selectedModel}
                  selectedProvider={selectedProvider}
                  thinkingEnabled={thinkingEnabled}
                  reasoningEffort={reasoningEffort}
                  autoMode={autoMode}
                  textareaRef={textareaRef}
                  slashMenuOpen={slashMenuOpen}
                  slashTab={slashTab}
                  onSelectCommand$={$((s, id) => setComposerText(s, id))}
                  onToggleSlash$={$(() => {
                    const avail = SLASH_CATEGORIES.filter((c) => isDomainAvailable(c.id, appCtx.installedApps.value));
                    if (selectedDomain.value !== "all" && isDomainAvailable(selectedDomain.value, appCtx.installedApps.value)) {
                      slashTab.value = selectedDomain.value as any;
                    } else if (!avail.some((c) => c.id === slashTab.value)) {
                      slashTab.value = (avail[0]?.id as any) || "crm";
                    }
                    slashMenuOpen.value = !slashMenuOpen.value;
                    modelSwitcherOpen.value = false;
                    autoMenuOpen.value = false;
                    effortMenuOpen.value = false;
                    domainDropdownOpen.value = false;
                  })}
                  onToggleModelSwitcher$={$(() => {
                    modelSwitcherOpen.value = !modelSwitcherOpen.value;
                    slashMenuOpen.value = false;
                    autoMenuOpen.value = false;
                    effortMenuOpen.value = false;
                    if (currentCliProvider) {
                      providerTab.value = currentCliProvider;
                    } else {
                      providerTab.value = findProviderForModel(selectedModel.value) || selectedProvider.value;
                    }
                  })}
                  onToggleEffort$={$(() => {
                    effortMenuOpen.value = !effortMenuOpen.value;
                    modelSwitcherOpen.value = false;
                    autoMenuOpen.value = false;
                    slashMenuOpen.value = false;
                  })}
                  onToggleAuto$={$(() => {
                    autoMenuOpen.value = !autoMenuOpen.value;
                    modelSwitcherOpen.value = false;
                    slashMenuOpen.value = false;
                    effortMenuOpen.value = false;
                  })}
                  onSend$={handleSendMessage}
                  onStop$={handleStop}
                  onInput$={$((v: string) => {
                    inputValue.value = v;
                    if (!v || v.trim() === "") {
                      sourceCommandId.value = null;
                    }
                  })}
                  onAutoDetectDomain$={$((v: string) => autoDetectDomainFromText(v))}
                  onClearFile$={$(() => (attachedFile.value = null))}
                />
              </div>
            )}

            {/* hidden file input shared by both compose modes */}
            <input
              id="agent-page-file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.csv,.txt"
              style="display:none;"
              onChange$={handleFileChange}
            />
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "AI Agents — BusinessKit",
};

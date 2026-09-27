// src/components/app/AgentChatSidebar.tsx
// Persistent Right-Side Agent Chat Panel for BusinessKit.
// Implements the native BusinessKit design system matching SlideOver, LinkModal, AppSidebar, and AppTopbar.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  useStylesScoped$,
} from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import {
  LuBot,
  LuX,
  LuPlus,
  LuSquare,
  LuArrowUp,
  LuPackage,
  LuFileText,
  LuUserCheck,
  LuPenTool,
  LuLayers,
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
  LuUsers,
  LuRotateCcw,
  LuAlertTriangle,
} from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { ProviderIcon } from "~/components/common/ProviderIcon";
import { useAppContext } from "~/lib/app-context";
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
  modelSupportsReasoning,
  getCachedSessionMessages,
  setCachedSessionMessages,
} from "~/lib/agent-config";
import {
  startChatSession,
  listChatSessions,
  getChatHistory,
  sendChatMessage,
  stopChatSession,
  setCliActiveModel,
} from "~/lib/ipc";
import type {
  ChatSession,
  ChatMessage,
  ChatTokenPayload,
  ChatToolCallPayload,
  ChatDonePayload,
  ChatErrorPayload,
} from "~/lib/types";
import {
  SLASH_CATEGORIES,
  SLASH_COMMANDS,
  FOLLOWUP_CHIPS,
  getCommandInputText,
  detectDomainFromCommand,
  detectDomainFromRoute,
  resolveDefaultDomain,
  MarkdownRenderer,
  ToolResultCard,
  DomainSelector,
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

const STARTER_ACTIONS = [
  {
    title: "Add Inventory from Invoice",
    desc: "Scan purchase invoice or PDF to auto-restock shop items",
    cmd: "/add-inventory-from-invoice",
    icon: "invoice_stock",
  },
  {
    title: "Check Stock Levels",
    desc: "Query current inventory levels across catalog",
    cmd: "/check-stock",
    icon: "package",
  },
  {
    title: "Adjust Stock Quantity",
    desc: "Add or remove inventory units for a SKU",
    cmd: "/adjust-stock",
    icon: "package",
  },
  {
    title: "Create Invoice",
    desc: "Draft a new invoice with document lines",
    cmd: "/create-invoice",
    icon: "invoice",
  },
  {
    title: "Add CRM Contact",
    desc: "Register a new lead with email and phone",
    cmd: "/add-contact",
    icon: "contact",
  },
];

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
  .agent-sidebar-backdrop {
    display: none;
  }

  .agent-sidebar-panel {
    position: fixed;
    right: 0;
    top: var(--titlebar-height, 2.1rem);
    bottom: var(--agent-keyboard-inset, 0px);
    height: auto;
    max-height: calc(100vh - var(--titlebar-height, 2.1rem));
    max-height: calc(100dvh - var(--titlebar-height, 2.1rem));
    z-index: 200;
    background: var(--surface-2);
    border-left: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    box-sizing: border-box;
    transition: width 150ms ease;
  }

  .agent-sidebar-panel::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .agent-header {
    height: calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));
    min-height: calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));
    max-height: calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));
    padding: 0 0.875rem;
    padding-top: env(safe-area-inset-top, 0px);
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

  .agent-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 1.25rem 1rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    background: var(--surface-2);
    box-sizing: border-box;
    user-select: text !important;
    -webkit-user-select: text !important;
  }

  .agent-body::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .agent-selectable-text {
    user-select: text !important;
    -webkit-user-select: text !important;
    cursor: text;
  }

  .agent-composer {
    padding: 0.5rem 0.875rem 0.875rem 0.875rem;
    background: transparent !important;
    border: none !important;
    border-top: none !important;
    flex-shrink: 0;
    box-sizing: border-box;
    position: relative;
  }

  .agent-input-container {
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

  .agent-card-hover {
    transition: all 150ms ease;
  }

  .agent-card-hover:hover {
    background: var(--surface-3) !important;
    border-color: var(--border-strong, var(--border)) !important;
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

  .agent-close-btn {
    display: inline-flex !important;
  }

  .agent-close-btn:hover {
    background: var(--surface-3) !important;
    color: var(--text-primary) !important;
  }

  /* Tablet / Touch devices (>= 641px): Match topbar clearance & composer bottom clearance */
  @media (min-width: 641px) and (hover: none) and (pointer: coarse) {
    .agent-header {
      padding-top: env(safe-area-inset-top, 0px) !important;
      height: calc(var(--header-box-height, 3.2rem) + env(safe-area-inset-top, 0px)) !important;
      min-height: calc(var(--header-box-height, 3.2rem) + env(safe-area-inset-top, 0px)) !important;
      max-height: calc(var(--header-box-height, 3.2rem) + env(safe-area-inset-top, 0px)) !important;
    }
    .agent-composer {
      padding-bottom: max(0.625rem, env(safe-area-inset-bottom, 0px)) !important;
    }
  }

  /* Mobile Safe Area (Top notch + bottom navigation safe area only on mobile) */
  @media (max-width: 640px) {
    .agent-sidebar-backdrop {
      display: block !important;
    }
    .agent-sidebar-panel {
      top: 0 !important;
      bottom: var(--agent-keyboard-inset, 0px) !important;
      left: 0 !important;
      right: 0 !important;
      width: 100vw !important;
      max-width: 100vw !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: 100% !important;
      z-index: 401 !important;
      border-left: none !important;
    }
    .agent-header {
      padding: 0 1rem !important;
      padding-top: env(safe-area-inset-top, 0px) !important;
      height: calc(var(--header-box-height, 3.2rem) + env(safe-area-inset-top, 0px)) !important;
      min-height: calc(var(--header-box-height, 3.2rem) + env(safe-area-inset-top, 0px)) !important;
      max-height: calc(var(--header-box-height, 3.2rem) + env(safe-area-inset-top, 0px)) !important;
    }
    .agent-body {
      padding: 1rem 0.875rem !important;
    }
    .agent-composer {
      padding-bottom: max(0.625rem, env(safe-area-inset-bottom, 0px)) !important;
    }
  }
`;

export const AgentChatSidebar = component$(() => {
  useStylesScoped$(STYLES);

  const appCtx = useAppContext();
  const isOpen = appCtx.agentChatOpen.value;
  const loc = useLocation();
  const panelWidth = appCtx.agentChatWidth.value;

  const sessions = useSignal<ChatSession[]>([]);
  const currentSessionId = useSignal<string | null>(null);
  const currentSessionTitle = useSignal<string>("New Conversation");
  const messages = useSignal<UiMessage[]>([]);
  const inputValue = useSignal("");
  const isStreaming = useSignal(false);
  const currentRequestId = useSignal<string | null>(null);
  const streamingText = useSignal("");
  const activeToolActions = useSignal<UiToolAction[]>([]);
  const errorBanner = useSignal("");
  const sessionsDropdownOpen = useSignal(false);
  const newChatMenuOpen = useSignal(false);
  const sessionLimit = useSignal(18);
  const modelSwitcherOpen = useSignal(false);
  const autoMenuOpen = useSignal(false);
  const slashMenuOpen = useSignal(false);
  const slashTab = useSignal<"shop" | "content" | "crm">("shop");
  const copiedIndex = useSignal<number | null>(null);
  const attachedFile = useSignal<{ name: string; type: string; previewUrl?: string; dataBase64?: string } | null>(null);
  const fileInputRef = useSignal<HTMLInputElement>();
  const messagesEndRef = useSignal<HTMLDivElement>();
  const textareaRef = useSignal<HTMLTextAreaElement>();
  const panelRef = useSignal<HTMLElement>();

  // Selected AI Provider & Model signals (persisted in localStorage)
  const selectedProvider = useSignal<string>("openrouter");
  const selectedModel = useSignal<string>("google/gemini-3.5-flash-lite");
  const selectedDomain = useSignal<string>("all");
  const domainDropdownOpen = useSignal(false);
  const providerTab = useSignal<string>("openrouter");
  const autoMode = useSignal<"auto" | "ask" | "off">("auto");
  const reasoningEffort = useSignal<"low" | "medium" | "high" | "extra" | "max">("low");
  const thinkingEnabled = useSignal<boolean>(false);
  const effortMenuOpen = useSignal(false);
  const isDesktop = useSignal<boolean>(true);

  const scrollToBottom = $(() => {
    if (messagesEndRef.value) {
      messagesEndRef.value.scrollIntoView({ behavior: "smooth" });
    }
  });

  const autoDetectDomainFromText = $((text: string) => {
    const domain = detectDomainFromCommand(text);
    if (domain && selectedDomain.value !== domain) {
      selectedDomain.value = domain;
      slashTab.value = domain;
      try {
        localStorage.setItem("bk-agent-domain", domain);
      } catch {
        // ignore storage error
      }
    }
  });

  const setComposerText = $((text: string) => {
    inputValue.value = text;
    autoDetectDomainFromText(text);
    if (textareaRef.value) {
      textareaRef.value.value = text;
      textareaRef.value.focus();
      textareaRef.value.style.height = "auto";
      textareaRef.value.style.height = `${Math.min(Math.max(textareaRef.value.scrollHeight, 36), 220)}px`;
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

  // Auto-start a new chat session when sidebar is opened after 60s of closure/inactivity
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const isSidebarOpen = track(() => appCtx.agentChatOpen.value);
    if (isSidebarOpen) {
      let closedDuration = Infinity;
      try {
        const storedClosedAt = localStorage.getItem("bk-agent-sidebar-closed-at");
        if (storedClosedAt) {
          const parsed = parseInt(storedClosedAt, 10);
          if (!isNaN(parsed)) {
            closedDuration = Date.now() - parsed;
          }
        }
      } catch (err) {
        console.debug("Failed to read sidebar closed timestamp:", err);
      }

      // Real-time route-based domain sync on open
      const routeDomain = detectDomainFromRoute(loc.url.pathname);
      if (routeDomain) {
        selectedDomain.value = routeDomain;
        slashTab.value = routeDomain;
      } else {
        const def = resolveDefaultDomain(appCtx.installedApps.value, loc.url.pathname);
        selectedDomain.value = def;
        if (def !== "all") {
          slashTab.value = def as any;
        }
      }

      // If closed for 60s or more, or if no active session, start a new chat
      if (closedDuration >= 60000 || !currentSessionId.value) {
        handleNewChat();
      } else {
        setTimeout(() => textareaRef.value?.focus(), 50);
      }

      listChatSessions().then((list) => {
        sessions.value = list;
      }).catch((err) => {
        console.debug("Failed to list chat sessions on open:", err);
      });
    } else {
      // Record closing timestamp
      try {
        localStorage.setItem("bk-agent-sidebar-closed-at", String(Date.now()));
      } catch (err) {
        console.debug("Failed to set sidebar closed timestamp:", err);
      }
    }
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

  const loadSessions = $(async () => {
    try {
      const list = await listChatSessions();
      sessions.value = list;
      if (list.length > 0 && !currentSessionId.value) {
        await selectSession(list[0].id);
      } else if (list.length === 0 && !currentSessionId.value) {
        await handleNewChat();
      }
    } catch (err: any) {
      console.error("Failed to load chat sessions:", err);
    }
  });

  const selectSession = $((sessionId: string) => {
    currentSessionId.value = sessionId;
    sessionsDropdownOpen.value = false;
    modelSwitcherOpen.value = false;
    autoMenuOpen.value = false;
    slashMenuOpen.value = false;
    errorBanner.value = "";

    const sess = sessions.value.find((s) => s.id === sessionId);
    if (sess) {
      currentSessionTitle.value = sess.title || "Conversation";
      if (sess.model) {
        selectedModel.value = sess.model;
        selectedProvider.value = sess.provider || findProviderForModel(sess.model);
        providerTab.value = selectedProvider.value;
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
    }).catch((err: any) => {
      console.error("Failed to load chat history:", err);
      if (!cached) {
        errorBanner.value = typeof err === "string" ? err : err.message || "Failed to load chat history";
      }
    });
  });

  const handleNewChatWith = $(async (providerOverride?: string, modelOverride?: string) => {
    newChatMenuOpen.value = false;
    sessionsDropdownOpen.value = false;
    modelSwitcherOpen.value = false;
    autoMenuOpen.value = false;
    slashMenuOpen.value = false;
    errorBanner.value = "";
    attachedFile.value = null;
    try {
      let prov = providerOverride || selectedProvider.value;
      let mdl = modelOverride || selectedModel.value;

      if (!providerOverride) {
        // If current provider is CLI, switch to default connection or cloud provider
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
        } else if (!selectedModel.value) {
          try {
            const conns: any = await invoke("list_connections");
            if (Array.isArray(conns) && conns.length > 0) {
              const def = detectDefaultAiConnection(conns);
              prov = def.provider;
              mdl = def.model;
              selectedProvider.value = def.provider;
              selectedModel.value = def.model;
              providerTab.value = def.provider;
              localStorage.setItem("bk-agent-provider", def.provider);
              localStorage.setItem("bk-agent-model", def.model);
            }
          } catch (e) {
            console.warn("Could not load connection defaults for new chat:", e);
          }
        }
      }

      if (providerOverride) {
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

      const newSession = await startChatSession(
        undefined,
        undefined,
        undefined,
        mdl,
        prov
      );
      sessions.value = [newSession, ...sessions.value];
      currentSessionId.value = newSession.id;
      currentSessionTitle.value = newSession.title || "New Conversation";
      messages.value = [];
      setTimeout(() => textareaRef.value?.focus(), 50);
    } catch (err: any) {
      console.error("Failed to start new chat session:", err);
      errorBanner.value = typeof err === "string" ? err : err.message || "Failed to start new session";
    }
  });

  const handleNewChat = $(async () => {
    await handleNewChatWith();
  });

  const handleSelectModel = $((providerId: string, modelId: string) => {
    selectedProvider.value = providerId;
    selectedModel.value = modelId;
    providerTab.value = providerId;
    localStorage.setItem("bk-agent-provider", providerId);
    localStorage.setItem("bk-agent-model", modelId);
    localStorage.setItem("bk-agent-model-manual", "true");
    modelSwitcherOpen.value = false;

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

    // Load saved width
    const savedWidth = localStorage.getItem("bk-agent-chat-width");
    if (savedWidth) {
      const parsed = parseInt(savedWidth, 10);
      if (!isNaN(parsed) && parsed >= 320 && parsed <= 900) {
        appCtx.agentChatWidth.value = parsed;
      }
    }

    // Load saved auto mode & reasoning effort
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
      // Fetch live CLI models directly from disk first
      const cliStatuses = await fetchAndSyncActiveCliModels().catch(() => null);

      const isManual = localStorage.getItem("bk-agent-model-manual") === "true";
      const savedModel = localStorage.getItem("bk-agent-model");
      const savedProvider = localStorage.getItem("bk-agent-provider");

      if (savedProvider && savedProvider.startsWith("cli") && cliStatuses && cliStatuses[savedProvider]) {
        const activeCli = cliStatuses[savedProvider];
        selectedProvider.value = savedProvider;
        selectedModel.value = activeCli.model_id;
        providerTab.value = savedProvider;
        if (activeCli.active_effort && ["low", "medium", "high", "extra", "max"].includes(activeCli.active_effort)) {
          reasoningEffort.value = activeCli.active_effort as any;
        }
        return;
      }

      if (isManual && savedModel) {
        selectedModel.value = savedModel;
        selectedProvider.value = savedProvider || findProviderForModel(savedModel);
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

      if (savedModel) {
        selectedModel.value = savedModel;
        selectedProvider.value = savedProvider || findProviderForModel(savedModel);
        providerTab.value = selectedProvider.value;
      }
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
    const checkDesktop = () => {
      if (typeof window !== "undefined") {
        isDesktop.value = window.innerWidth > 768;
      }
    };
    checkDesktop();
    window.addEventListener("resize", checkDesktop);

    fetchAndApplyLivePricing().catch(() => { });

    // Auto-close open dropdowns when clicking outside
    const handleDocumentPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("[data-agent-popover]") || target.closest("[data-agent-trigger]")) {
        return;
      }
      sessionsDropdownOpen.value = false;
      newChatMenuOpen.value = false;
      domainDropdownOpen.value = false;
      modelSwitcherOpen.value = false;
      autoMenuOpen.value = false;
      effortMenuOpen.value = false;
      slashMenuOpen.value = false;
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

          // Refresh sessions list in background to update title/timestamps
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

    // Handle mobile virtual keyboard via VisualViewport API
    const updateKeyboardInset = () => {
      if (typeof window === "undefined") return;
      const vv = window.visualViewport;
      if (!vv) return;
      const keyboardHeight = Math.max(0, window.innerHeight - vv.height - (vv.offsetTop || 0));
      if (keyboardHeight > 40) {
        document.documentElement.style.setProperty("--agent-keyboard-inset", `${keyboardHeight}px`);
        if (panelRef.value) {
          panelRef.value.style.bottom = `${keyboardHeight}px`;
        }
      } else {
        document.documentElement.style.setProperty("--agent-keyboard-inset", "0px");
        if (panelRef.value) {
          panelRef.value.style.bottom = "0px";
        }
      }
    };

    if (typeof window !== "undefined" && window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateKeyboardInset);
      window.visualViewport.addEventListener("scroll", updateKeyboardInset);
      updateKeyboardInset();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        textareaRef.value?.focus();
      }
      if (e.key === "Escape") {
        sessionsDropdownOpen.value = false;
        newChatMenuOpen.value = false;
        domainDropdownOpen.value = false;
        modelSwitcherOpen.value = false;
        autoMenuOpen.value = false;
        slashMenuOpen.value = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    setupListeners();
    loadSessions();

    cleanup(() => {
      if (typeof window !== "undefined" && window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateKeyboardInset);
        window.visualViewport.removeEventListener("scroll", updateKeyboardInset);
      }
      window.removeEventListener("pointerdown", handleDocumentPointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", checkDesktop);
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

    let attachmentName: string | undefined;
    if (attachedFile.value) {
      attachmentName = attachedFile.value.name;
      text = text ? `[Attached: ${attachedFile.value.name}]\n${text}` : `[Attached: ${attachedFile.value.name}] Process and extract data from this attached file.`;
    }

    // Auto-create new session if none is currently active
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

    let attachmentPayload: import("../../lib/types").AttachmentPayload | undefined;
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

    // Auto-sync Domain Selector if explicit domain command is used
    const trimmed = text.trim().toLowerCase();
    if (trimmed.startsWith("/add-inventory-from-invoice") || trimmed.startsWith("/check-stock") || trimmed.startsWith("/adjust-stock") || trimmed.startsWith("/create-invoice") || trimmed.startsWith("/send-invoice")) {
      selectedDomain.value = "shop";
      slashTab.value = "shop";
      localStorage.setItem("bk-agent-domain", "shop");
    } else if (trimmed.startsWith("/add-contact") || trimmed.startsWith("/update-contact") || trimmed.startsWith("/create-lead")) {
      selectedDomain.value = "crm";
      slashTab.value = "crm";
      localStorage.setItem("bk-agent-domain", "crm");
    } else if (trimmed.startsWith("/draft-post") || trimmed.startsWith("/publish-page")) {
      selectedDomain.value = "content";
      slashTab.value = "content";
      localStorage.setItem("bk-agent-domain", "content");
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

    try {
      await sendChatMessage(
        targetSessionId,
        text,
        reqId,
        selectedProvider.value,
        selectedModel.value,
        selectedDomain.value,
        attachmentPayload,
        thinkingEnabled.value ? reasoningEffort.value : "off"
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

  // Resizing logic for drag handle on left edge
  const startResizing = $((e: MouseEvent) => {
    // eslint-disable-next-line qwik/no-async-prevent-default
    e.preventDefault();
    const startX = e.clientX;
    const startW = appCtx.agentChatWidth.value;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = startX - moveEvent.clientX;
      const newWidth = Math.min(Math.max(startW + deltaX, 340), 800);
      appCtx.agentChatWidth.value = newWidth;
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      localStorage.setItem("bk-agent-chat-width", String(appCtx.agentChatWidth.value));
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  });

  const isCli = selectedProvider.value.startsWith("cli") || selectedModel.value.startsWith("cli:");
  const currentModelsList = MODEL_OPTIONS[providerTab.value] || (isCli ? MODEL_OPTIONS["cli_antigravity"] : MODEL_OPTIONS["openrouter"]) || [];

  if (!isOpen) {
    return null;
  }

  return (
    <>
      {/* ── Mobile Backdrop matching SlideOver.tsx ────────────────────────── */}
      <div
        onClick$={$(() => {
          appCtx.agentChatOpen.value = false;
          localStorage.setItem("bk-agent-chat-open", "false");
        })}
        class="agent-sidebar-backdrop"
        style={{
          position: "fixed",
          inset: "0",
          background: "rgba(0,0,0,0.35)",
          zIndex: "400",
          transition: "opacity 180ms ease",
        }}
      />

      <aside
        ref={panelRef}
        class="agent-sidebar-panel"
        style={`width: ${panelWidth}px;`}
      >
        {/* ── Left Drag Handle for Resizing ────────────────────────────────────── */}
        <div
          onMouseDown$={startResizing}
          onDblClick$={$(() => {
            appCtx.agentChatWidth.value = 420;
            localStorage.setItem("bk-agent-chat-width", "420");
          })}
          title="Drag to resize panel (Double-click to reset)"
          style="position:absolute;left:0;top:0;bottom:0;width:4px;cursor:col-resize;z-index:20;"
        />

        {/* ── Top Header Toolbar (Matches SlideOver & AppTopbar) ────────────────── */}
        <div class="agent-header">
          {/* Session Selector Dropdown Trigger */}
          <div style="position:relative;display:flex;align-items:center;min-width:0;flex:1;">
            <button
              type="button"
              data-agent-trigger="true"
              onClick$={$(() => {
                sessionsDropdownOpen.value = !sessionsDropdownOpen.value;
                modelSwitcherOpen.value = false;
                autoMenuOpen.value = false;
              })}
              style="display:flex;align-items:center;gap:0.4rem;max-width:100%;height:2rem;padding:0 0.5rem;border-radius:0.5rem;font-size:0.8125rem;font-weight:500;color:var(--text-primary);background:transparent;border:1px solid var(--border);cursor:pointer;transition:border-color 0.15s ease;"
              title="Switch conversation"
            >
              <LuSparkles style="width:0.8125rem;height:0.8125rem;color:var(--text-secondary);flex-shrink:0;" />
              <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;">
                {currentSessionTitle.value}
              </span>
              <LuChevronDown style="width:0.75rem;height:0.75rem;color:var(--text-secondary);flex-shrink:0;opacity:0.6;" />
            </button>

            {/* Sessions Dropdown Popover */}
            {sessionsDropdownOpen.value && (
              <div
                data-agent-popover="true"
                style="position:absolute;left:0;top:calc(100% + 6px);width:280px;max-height:360px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 12px 32px rgba(0,0,0,0.18);z-index:100;overflow:hidden;display:flex;flex-direction:column;"
              >
                <div style="padding:0.625rem 0.75rem;border-bottom:1px solid var(--border);background:var(--surface-1);display:flex;align-items:center;justify-content:space-between;">
                  <span style="font-size:0.6875rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.05em;">
                    Conversations
                  </span>
                  <button
                    type="button"
                    onClick$={handleNewChat}
                    style="display:flex;align-items:center;gap:0.25rem;font-size:0.75rem;font-weight:600;color:var(--text-primary);background:none;border:none;cursor:pointer;"
                  >
                    <LuPlus style="width:0.75rem;height:0.75rem;" />
                    <span>New</span>
                  </button>
                </div>

                <div style="overflow-y:auto;padding:0.25rem;display:flex;flex-direction:column;gap:2px;max-height:290px;">
                  {sessions.value.length === 0 ? (
                    <div style="padding:1rem;text-align:center;font-size:0.75rem;color:var(--text-secondary);">
                      No past conversations
                    </div>
                  ) : (
                    <>
                      {sessions.value.slice(0, sessionLimit.value).map((s) => {
                        const isSelected = s.id === currentSessionId.value;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick$={$(() => selectSession(s.id))}
                            style={`width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;transition:background 0.15s;${isSelected ? 'background:var(--surface-3);font-weight:600;color:var(--text-primary);' : 'background:transparent;color:var(--text-secondary);'}`}
                          >
                            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;">
                              {s.title || "Conversation"}
                            </span>
                            <span style="font-size:0.6875rem;color:var(--text-secondary);flex-shrink:0;">
                              {fmtWhen(s.updated_at)}
                            </span>
                          </button>
                        );
                      })}

                      {sessions.value.length > sessionLimit.value && sessionLimit.value < 36 && (
                        <button
                          type="button"
                          onClick$={$(() => {
                            sessionLimit.value = 36;
                          })}
                          style="width:100%;padding:0.45rem 0.5rem;font-size:0.75rem;font-weight:500;color:var(--text-primary);background:transparent;border:none;border-top:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.35rem;transition:background 0.15s;margin-top:2px;"
                          onMouseEnter$={(e, el) => (el.style.background = "var(--surface-3)")}
                          onMouseLeave$={(e, el) => (el.style.background = "transparent")}
                        >
                          <LuChevronDown style="width:0.75rem;height:0.75rem;" />
                          <span>Load 18 more</span>
                        </button>
                      )}

                      {sessionLimit.value >= 36 && (
                        <Link
                          href="/dashboard/agents"
                          onClick$={$(() => {
                            sessionsDropdownOpen.value = false;
                          })}
                          style="width:100%;padding:0.45rem 0.625rem;font-size:0.75rem;font-weight:500;color:var(--text-primary);background:var(--surface-1);border:none;border-top:1px solid var(--border);cursor:pointer;display:flex;align-items:center;justify-content:space-between;text-decoration:none;box-sizing:border-box;transition:background 0.15s;margin-top:2px;border-radius:0.25rem;"
                          onMouseEnter$={(e, el) => (el.style.background = "var(--surface-3)")}
                          onMouseLeave$={(e, el) => (el.style.background = "var(--surface-1)")}
                        >
                          <span>Open full Workspace</span>
                          <LuArrowRight style="width:0.75rem;height:0.75rem;color:var(--text-secondary);" />
                        </Link>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Right Header Actions: Domain Selector (No fill, stroke only) + [+] Button (No fill) & Close (Mobile only) */}
          <div style="display:flex;align-items:center;gap:0.375rem;flex-shrink:0;">
            {/* Domain Selector Dropdown (Transparent Background, Stroke Border Only) */}
            <DomainSelector
              selectedDomain={selectedDomain}
              isOpen={domainDropdownOpen}
              onSelect$={handleSelectDomain}
            />

            {/* [+] New Chat Button & Dropdown Menu */}
            <div style="position:relative;">
              <button
                type="button"
                onClick$={$(() => {
                  if (!isDesktop.value) {
                    handleNewChatWith();
                  } else {
                    newChatMenuOpen.value = !newChatMenuOpen.value;
                  }
                })}
                title={isDesktop.value ? "New conversation" : "New Chat"}
                data-agent-trigger="true"
                style="width:1.875rem;height:1.875rem;border-radius:0.375rem;border:1px solid var(--border);background:transparent;color:var(--text-primary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s ease;padding:0;"
              >
                <LuPlus style="width:0.875rem;height:0.875rem;" />
              </button>

              {isDesktop.value && newChatMenuOpen.value && (
                <div
                  data-agent-popover="true"
                  style="position:absolute;right:0;top:calc(100% + 6px);width:220px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.5rem;box-shadow:0 12px 32px rgba(0,0,0,0.22);z-index:110;padding:0.375rem;display:flex;flex-direction:column;gap:3px;"
                >
                  <button
                    type="button"
                    onClick$={$(() => handleNewChatWith())}
                    style="display:flex;align-items:center;gap:0.625rem;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:transparent;color:var(--text-primary);transition:background 0.12s;"
                    onMouseEnter$={$((_, el) => (el.style.background = "var(--surface-3)"))}
                    onMouseLeave$={$((_, el) => (el.style.background = "transparent"))}
                  >
                    <LuPlus style="width:1rem;height:1rem;color:var(--text-secondary);flex-shrink:0;" />
                    <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">New Chat</span>
                  </button>

                  <div style="height:1px;background:var(--border);margin:2px 0;" />

                  <button
                    type="button"
                    onClick$={$(() => handleNewChatWith("cli_claude", "cli:claude"))}
                    style="display:flex;align-items:center;gap:0.625rem;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:transparent;color:var(--text-primary);transition:background 0.12s;"
                    onMouseEnter$={$((_, el) => (el.style.background = "var(--surface-3)"))}
                    onMouseLeave$={$((_, el) => (el.style.background = "transparent"))}
                  >
                    <ProviderIcon provider="cli_claude" size="1.125rem" />
                    <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">Claude Code CLI</span>
                  </button>

                  <button
                    type="button"
                    onClick$={$(() => handleNewChatWith("cli_antigravity", "cli:antigravity"))}
                    style="display:flex;align-items:center;gap:0.625rem;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:transparent;color:var(--text-primary);transition:background 0.12s;"
                    onMouseEnter$={$((_, el) => (el.style.background = "var(--surface-3)"))}
                    onMouseLeave$={$((_, el) => (el.style.background = "transparent"))}
                  >
                    <ProviderIcon provider="cli_antigravity" size="1.125rem" />
                    <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">Antigravity CLI</span>
                  </button>

                  <button
                    type="button"
                    onClick$={$(() => handleNewChatWith("cli_codex", "cli:codex"))}
                    style="display:flex;align-items:center;gap:0.625rem;width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;border:none;cursor:pointer;background:transparent;color:var(--text-primary);transition:background 0.12s;"
                    onMouseEnter$={$((_, el) => (el.style.background = "var(--surface-3)"))}
                    onMouseLeave$={$((_, el) => (el.style.background = "transparent"))}
                  >
                    <ProviderIcon provider="cli_codex" size="1.125rem" />
                    <span style="font-weight:500;font-size:0.8125rem;color:var(--text-primary);">Codex CLI</span>
                  </button>
                </div>
              )}
            </div>

            {/* Close Button */}
            <button
              type="button"
              class="agent-close-btn"
              onClick$={$(() => {
                appCtx.agentChatOpen.value = false;
                localStorage.setItem("bk-agent-chat-open", "false");
              })}
              title="Close Agent Sidebar (Cmd+J / Ctrl+J)"
              style="width:1.875rem;height:1.875rem;border-radius:0.375rem;border:1px solid transparent;background:transparent;color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;transition:all 0.15s ease;padding:0;"
            >
              <LuX style="width:1rem;height:1rem;" />
            </button>
          </div>
        </div>

        {/* ── Message Stream Body Area (Full text selection enabled) ──────────── */}
        <div class="agent-body">
          {messages.value.length === 0 && !isStreaming.value && (
            <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:1.5rem 0.5rem;gap:0.5rem;margin:auto 0;box-sizing:border-box;">
              <div style="width:2.75rem;height:2.75rem;border-radius:0.625rem;background:transparent;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.05);margin-bottom:0.25rem;">
                <LuBot style="width:1.375rem;height:1.375rem;" />
              </div>
              <h3 style="font-size:0.9375rem;font-weight:600;color:var(--text-primary);margin:0;">
                BusinessKit Agent
              </h3>
              <p style="font-size:0.8125rem;color:var(--text-secondary);margin:0 0 1rem 0;line-height:1.5;max-width:320px;">
                Manage your private inventory, invoices, contacts, and content using natural commands.
              </p>

              {/* Quick Starter Action Cards (5 cards, stroke-only / no fill, card icon no fill, click inserts /command) */}
              <div style="display:flex;flex-direction:column;gap:0.5rem;width:100%;box-sizing:border-box;">
                {STARTER_ACTIONS.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick$={$(() => {
                      setComposerText(getCommandInputText(item.cmd));
                    })}
                    class="agent-card-hover"
                    style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.625rem 0.875rem;border-radius:0.5rem;background:transparent !important;border:1px solid var(--border);cursor:pointer;text-align:left;width:100%;box-sizing:border-box;"
                  >
                    <div style="display:flex;align-items:center;gap:0.625rem;min-width:0;flex:1;">
                      <div style="width:1.75rem;height:1.75rem;border-radius:0.375rem;background:transparent !important;border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-primary);flex-shrink:0;">
                        {item.icon === "invoice_stock" || item.icon === "invoice" ? (
                          <LuFileText style="width:0.875rem;height:0.875rem;" />
                        ) : item.icon === "package" ? (
                          <LuPackage style="width:0.875rem;height:0.875rem;" />
                        ) : item.icon === "contact" ? (
                          <LuUserCheck style="width:0.875rem;height:0.875rem;" />
                        ) : (
                          <LuPenTool style="width:0.875rem;height:0.875rem;" />
                        )}
                      </div>
                      <div style="display:flex;flex-direction:column;min-width:0;">
                        <span style="font-size:0.8125rem;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                          {item.title}
                        </span>
                        <span style="font-size:0.6875rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
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
            <div style="display:flex;flex-direction:column;align-items:flex-start;width:100%;">
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

          {/* ── In-Box Notification / Connection Prompt Card ─────────────────── */}
          {errorBanner.value && (
            <div
              class="agent-selectable-text"
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

        {/* ── Chips above composer (Session follow-up chips) ─────────────────── */}
        {messages.value.length > 0 && !isStreaming.value && (
          <div style="display:flex;align-items:center;gap:0.375rem;padding:0.25rem 0.875rem;overflow-x:auto;background:transparent;border:none;flex-shrink:0;">
            {FOLLOWUP_CHIPS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick$={$(() => {
                  setComposerText(getCommandInputText(p.text));
                })}
                style="padding:0.25rem 0.625rem;border-radius:0.375rem;background:var(--surface-1);border:1px solid var(--border);font-size:0.75rem;font-weight:500;color:var(--text-secondary);cursor:pointer;white-space:nowrap;transition:all 0.15s;box-shadow:0 1px 2px rgba(0,0,0,0.03);"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Chat Composer Area ─────────────────────────────────────────────── */}
        <div class="agent-composer">
          {/* Slash Commands Dropdown Popover (Shop | Content | CRM Tabs matching SettingTabs) */}
          {slashMenuOpen.value && (
            <div
              data-agent-popover="true"
              style="position:absolute;left:0.875rem;bottom:calc(100% + 8px);width:315px;max-width:calc(100vw - 2rem);background:var(--surface-2);border:1px solid var(--border);border-radius:0.625rem;box-shadow:0 12px 32px rgba(0,0,0,0.22);z-index:100;overflow:hidden;display:flex;flex-direction:column;"
            >
              {/* Category Selection Tabs (Styled matching SettingTabs.tsx) */}
              <div style="display:flex;gap:0.25rem;background:var(--surface-3);padding:3px;border-bottom:1px solid var(--border);height:36px;box-sizing:border-box;align-items:center;">
                {SLASH_CATEGORIES.map((c) => {
                  const isActive = slashTab.value === c.id;
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick$={$(() => (slashTab.value = c.id))}
                      style={`flex:1;padding:0 0.5rem;border-radius:0.375rem;font-size:0.8125rem;font-weight:500;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.375rem;height:100%;box-sizing:border-box;transition:all 0.15s;text-transform:capitalize;${isActive ? 'background:var(--surface-2);color:var(--text-primary);box-shadow:0 1px 3px rgba(0,0,0,0.1);font-weight:600;' : 'background:transparent;color:var(--text-secondary);'}`}
                    >
                      {c.id === "shop" ? (
                        <LuPackage style="width:0.875rem;height:0.875rem;flex-shrink:0;" />
                      ) : c.id === "content" ? (
                        <LuPenTool style="width:0.875rem;height:0.875rem;flex-shrink:0;" />
                      ) : (
                        <LuUsers style="width:0.875rem;height:0.875rem;flex-shrink:0;" />
                      )}
                      <span>{c.name}</span>
                    </button>
                  );
                })}
              </div>

              {/* Commands List for Selected Category (Clean Title + Description only, no icon stroke/fill) */}
              <div style="overflow-y:auto;padding:0.375rem;display:flex;flex-direction:column;gap:2px;max-height:260px;">
                {SLASH_COMMANDS.filter((cmd) => cmd.category === slashTab.value).map((cmd) => {
                  return (
                    <button
                      key={cmd.id}
                      type="button"
                      onClick$={$(() => {
                        slashMenuOpen.value = false;
                        setComposerText(getCommandInputText(cmd.slash));
                      })}
                      style="width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;border:1px solid transparent;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:0.75rem;transition:all 0.15s;background:transparent;color:var(--text-secondary);box-sizing:border-box;"
                      class="agent-cmd-item"
                    >
                      <div style="display:flex;align-items:center;gap:0.625rem;min-width:0;flex:1;">
                        <div style="display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;">
                          {cmd.category === "shop" ? (
                            cmd.id.includes("invoice") ? (
                              <LuFileText style="width:1rem;height:1rem;" />
                            ) : cmd.id.includes("adjust") ? (
                              <LuLayers style="width:1rem;height:1rem;" />
                            ) : (
                              <LuPackage style="width:1rem;height:1rem;" />
                            )
                          ) : cmd.category === "content" ? (
                            cmd.id.includes("post") ? (
                              <LuPenTool style="width:1rem;height:1rem;" />
                            ) : (
                              <LuSparkles style="width:1rem;height:1rem;" />
                            )
                          ) : (
                            <LuUserCheck style="width:1rem;height:1rem;" />
                          )}
                        </div>

                        <div style="display:flex;flex-direction:column;min-width:0;flex:1;gap:1px;">
                          <span style="font-size:0.8125rem;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            {cmd.name}
                          </span>
                          <span style="font-size:0.6875rem;color:var(--text-secondary);opacity:0.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            {cmd.desc}
                          </span>
                        </div>
                      </div>

                      <LuArrowRight style="width:0.75rem;height:0.75rem;color:var(--text-secondary);opacity:0.4;flex-shrink:0;" />
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Model Switcher Popover (Opens Bottom Up Above Model Pill) */}
          {modelSwitcherOpen.value && (
            <div
              data-agent-popover="true"
              style="position:absolute;left:0.875rem;bottom:calc(100% + 8px);width:315px;background:var(--surface-2);border:1px solid var(--border);border-radius:0.625rem;box-shadow:0 12px 32px rgba(0,0,0,0.22);z-index:100;overflow:hidden;display:flex;flex-direction:column;"
            >
              {/* Active Selected Provider Top Header */}
              <div style="display:flex;align-items:center;justify-content:space-between;padding:0.5rem 0.75rem;background:var(--surface-1);border-bottom:1px solid var(--border);">
                <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;">
                  <ProviderIcon provider={providerTab.value} size="1rem" />
                  <div style="display:flex;flex-direction:column;min-width:0;">
                    <span style="font-size:0.8125rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      {PROVIDER_OPTIONS.find((p) => p.id === providerTab.value)?.name || "Provider"}
                    </span>
                    <span style="font-size:0.6875rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      {PROVIDER_OPTIONS.find((p) => p.id === providerTab.value)?.isCli
                        ? "Local CLI • Free Inference"
                        : "Cloud API • Token Billed"}
                    </span>
                  </div>
                </div>
                <span
                  style={`font-size:0.625rem;font-weight:600;padding:2px 6px;border-radius:9999px;border:1px solid var(--border);${PROVIDER_OPTIONS.find((p) => p.id === providerTab.value)?.isCli ? "background:rgba(59,130,246,0.1);color:var(--accent);" : "background:var(--surface-3);color:var(--text-secondary);"}`}
                >
                  {PROVIDER_OPTIONS.find((p) => p.id === providerTab.value)?.isCli ? "CLI Mode" : "Cloud"}
                </span>
              </div>

              {/* Provider Selection Tabs */}
              <div style="display:flex;padding:0.375rem 0.5rem;gap:0.375rem;background:var(--surface-2);border-bottom:1px solid var(--border);overflow-x:auto;-webkit-overflow-scrolling:touch;align-items:center;">
                {PROVIDER_OPTIONS.filter((p) => (isCli ? p.isCli : !p.isCli)).map((p) => {
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

              {/* Models List for Selected Provider */}
              <div style="overflow-y:auto;padding:0.375rem;display:flex;flex-direction:column;gap:3px;max-height:240px;">
                {currentModelsList.map((m) => {
                  const isSelected = selectedModel.value === m.id;
                  const activeCliModelId = getCachedCliStatus()?.[providerTab.value]?.model_id;
                  const isCurrent = activeCliModelId === m.id;

                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick$={$(() => handleSelectModel(providerTab.value, m.id))}
                      style={`width:100%;text-align:left;padding:0.5rem 0.625rem;border-radius:0.375rem;border:1px solid transparent;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:0.5rem;transition:all 0.15s;${isSelected ? "background:var(--surface-3);color:var(--text-primary);font-weight:500;" : "background:transparent;color:var(--text-secondary);"}`}
                    >
                      <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;flex:1;">
                        <ProviderIcon model={m.id} provider={m.provider || providerTab.value} size="1.125rem" />
                        <div style="display:flex;flex-direction:column;min-width:0;flex:1;">
                          <div style="display:flex;align-items:center;gap:0.375rem;flex-wrap:wrap;">
                            <span style="font-size:0.8125rem;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                              {m.name}
                            </span>
                            {isCurrent && (
                              <span style="font-size:0.625rem;font-weight:600;padding:1px 5px;border-radius:9999px;background:rgba(59,130,246,0.15);border:1px solid rgba(59,130,246,0.3);color:#3b82f6;">
                                Current
                              </span>
                            )}
                            {m.badge && (
                              <span style="font-size:0.625rem;font-weight:600;padding:1px 5px;border-radius:9999px;background:var(--surface-1);border:1px solid var(--border);color:var(--text-secondary);">
                                {m.badge}
                              </span>
                            )}
                          </div>
                          <span style="font-family:monospace;font-size:0.6875rem;color:var(--text-secondary);opacity:0.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                            {m.id}
                          </span>
                        </div>
                      </div>

                      <div style="display:flex;align-items:center;gap:0.375rem;flex-shrink:0;">
                        {m.price && (
                          <span style="font-size:0.6875rem;color:var(--text-secondary);font-family:monospace;">
                            {m.price}
                          </span>
                        )}
                        {isSelected && (
                          <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent);" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Auto Mode Selector Popover (Opens Bottom Up Above Auto Pill) */}
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
                    <div style="font-size:0.75rem;line-height:1.35;color:var(--text-secondary);padding:0.125rem 0.375rem 0.375rem 0.375rem;">
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

          {/* CLI Mode Explainer Notice Banner */}
          {(selectedProvider.value.startsWith("cli") || selectedModel.value.startsWith("cli:")) && (
            <div style="display:flex;align-items:center;gap:0.375rem;padding:0.3125rem 0.625rem;border-radius:0.375rem;background:rgba(59,130,246,0.06);border:1px solid rgba(59,130,246,0.18);font-size:0.6875rem;color:var(--text-secondary);margin-bottom:0.375rem;">
              <LuSparkles style="width:0.75rem;height:0.75rem;color:var(--accent);flex-shrink:0;" />
              <span style="line-height:1.3;">
                Runs locally via {selectedModel.value.includes("claude") ? "Claude Code" : selectedModel.value.includes("antigravity") ? "Antigravity CLI" : "Codex CLI"}. Zero BusinessKit API costs.
              </span>
            </div>
          )}

          <div class="agent-input-container">
            {/* Attached File Chip (if any) */}
            {attachedFile.value && (
              <div style="display:inline-flex;align-items:center;gap:0.375rem;padding:2px 8px;border-radius:0.375rem;background:var(--surface-3);border:1px solid var(--border);width:max-content;max-width:100%;">
                <LuImage style="width:0.75rem;height:0.75rem;color:var(--accent);flex-shrink:0;" />
                <span style="font-size:0.6875rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">
                  {attachedFile.value.name}
                </span>
                <button
                  type="button"
                  onClick$={$(() => (attachedFile.value = null))}
                  style="background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;color:var(--text-secondary);"
                >
                  <LuX style="width:0.75rem;height:0.75rem;" />
                </button>
              </div>
            )}

            {/* Hidden File Input for Attachments */}
            <input
              id="agent-sidebar-file-input"
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf,.csv,.txt"
              style="display:none;"
              onChange$={handleFileChange}
            />

            {/* Textarea (Auto-expands up to 10 lines) */}
            <textarea
              ref={textareaRef}
              value={inputValue.value}
              onFocus$={$((_, el) => {
                setTimeout(() => {
                  el.scrollIntoView({ block: "nearest", behavior: "smooth" });
                  if (messagesEndRef.value) {
                    messagesEndRef.value.scrollIntoView({ behavior: "smooth" });
                  }
                }, 150);
              })}
              onInput$={$((e) => {
                const target = e.target as HTMLTextAreaElement;
                inputValue.value = target.value;
                autoDetectDomainFromText(target.value);
                if (target.value === "/") {
                  slashMenuOpen.value = true;
                  modelSwitcherOpen.value = false;
                  autoMenuOpen.value = false;
                  effortMenuOpen.value = false;
                }
                target.style.height = "auto";
                target.style.height = `${Math.min(Math.max(target.scrollHeight, 36), 220)}px`;
              })}
              onKeyDown$={$((e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  // eslint-disable-next-line qwik/no-async-prevent-default
                  e.preventDefault();
                  handleSendMessage();
                }
              })}
              placeholder="Ask anything or command your business agent…"
              rows={1}
              disabled={isStreaming.value}
              class="agent-textarea"
            />

            {/* Control bar inside composer (All pills uniform 21px height) */}
            <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding-top:0.25rem;">
              <div style="display:flex;align-items:center;gap:0.375rem;flex-wrap:nowrap;overflow-x:auto;">
                {/* Slash Commands / Quick Actions (/) (21px height) */}
                <button
                  type="button"
                  data-agent-trigger="true"
                  onClick$={$(() => {
                    if (selectedDomain.value !== "all") {
                      slashTab.value = selectedDomain.value as any;
                    }
                    slashMenuOpen.value = !slashMenuOpen.value;
                    modelSwitcherOpen.value = false;
                    autoMenuOpen.value = false;
                    effortMenuOpen.value = false;
                    domainDropdownOpen.value = false;
                  })}
                  title="Quick action slash commands (/)"
                  style={`height:21px;width:21px;min-height:21px;min-width:21px;max-height:21px;max-width:21px;border-radius:0.25rem;background:${selectedProvider.value.startsWith("cli") || selectedModel.value.startsWith("cli:") ? "var(--surface-1)" : "var(--surface-3)"};border:1px solid var(--border);color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-sizing:border-box;font-weight:600;font-size:0.8125rem;line-height:1;`}
                >
                  <span>/</span>
                </button>

                {/* Attach Image / Document Button (+) (21px height) */}
                <label
                  for="agent-sidebar-file-input"
                  title="Attach file, invoice image, or PDF (+)"
                  style={`height:21px;width:21px;min-height:21px;min-width:21px;max-height:21px;max-width:21px;border-radius:0.25rem;background:${selectedProvider.value.startsWith("cli") || selectedModel.value.startsWith("cli:") ? "var(--surface-1)" : "var(--surface-3)"};border:1px solid var(--border);color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-sizing:border-box;user-select:none;`}
                >
                  <LuPlus style="width:0.8125rem;height:0.8125rem;pointer-events:none;" />
                </label>

                {/* CLI Mode Badge Pill (when CLI provider/model is active) */}
                {(selectedProvider.value.startsWith("cli") || selectedModel.value.startsWith("cli:")) && (
                  <span
                    style="height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.3rem;padding:0 6px;border-radius:0.25rem;background:var(--surface-1);border:1px solid var(--border);color:var(--text-primary);font-size:0.6875rem;font-weight:600;box-sizing:border-box;line-height:1;white-space:nowrap;"
                    title="Running via local CLI & Stdio MCP server (Zero BusinessKit inference charges)"
                  >
                    <ProviderIcon provider={selectedProvider.value} size="0.75rem" />
                    <span>CLI</span>
                  </span>
                )}

                {/* Model Pill (Opens Model Switcher Bottom-Up, 21px height) */}
                <button
                  type="button"
                  data-agent-trigger="true"
                  onClick$={$(() => {
                    modelSwitcherOpen.value = !modelSwitcherOpen.value;
                    slashMenuOpen.value = false;
                    autoMenuOpen.value = false;
                    effortMenuOpen.value = false;
                    if (modelSwitcherOpen.value) {
                      providerTab.value = findProviderForModel(selectedModel.value) || selectedProvider.value;
                    }
                  })}
                  title="Click to switch AI Model"
                  style={`height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.3rem;padding:0 6px;border-radius:0.25rem;background:${selectedProvider.value.startsWith("cli") || selectedModel.value.startsWith("cli:") ? "var(--surface-1)" : "var(--surface-3)"};border:1px solid var(--border);font-size:0.6875rem;font-weight:500;color:var(--text-primary);cursor:pointer;box-sizing:border-box;line-height:1;`}
                >
                  <ProviderIcon model={selectedModel.value} provider={selectedProvider.value} size="0.75rem" />
                  <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:115px;">
                    {getModelDisplayName(selectedModel.value)}
                  </span>
                  <LuChevronDown style="width:0.625rem;height:0.625rem;opacity:0.6;flex-shrink:0;" />
                </button>

                {/* Thinking / Reasoning Effort Pill (shown when model supports reasoning or in CLI mode, 21px height) */}
                {modelSupportsReasoning(selectedModel.value, selectedProvider.value) && (
                  <button
                    type="button"
                    data-agent-trigger="true"
                    onClick$={$(() => {
                      effortMenuOpen.value = !effortMenuOpen.value;
                      modelSwitcherOpen.value = false;
                      autoMenuOpen.value = false;
                      slashMenuOpen.value = false;
                    })}
                    title="Set AI Thinking / Reasoning Effort"
                    style="height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.25rem;padding:0 6px;border-radius:0.25rem;background:var(--surface-1);border:1px solid var(--border);font-size:0.6875rem;font-weight:500;color:var(--text-primary);cursor:pointer;box-sizing:border-box;line-height:1;white-space:nowrap;"
                  >
                    <LuSparkles style={`width:0.625rem;height:0.625rem;flex-shrink:0;${thinkingEnabled.value ? "color:var(--accent);" : "color:var(--text-tertiary);opacity:0.6;"}`} />
                    <span>
                      {reasoningEffort.value === "low"
                        ? "Low"
                        : reasoningEffort.value === "extra"
                        ? "Extra"
                        : reasoningEffort.value === "max"
                        ? "Max"
                        : reasoningEffort.value === "high"
                        ? "High"
                        : "Medium"}
                    </span>
                    <LuChevronDown style="width:0.625rem;height:0.625rem;opacity:0.6;flex-shrink:0;" />
                  </button>
                )}

                {/* Auto Tools Dropdown Switch (21px height) */}
                <button
                  type="button"
                  data-agent-trigger="true"
                  onClick$={$(() => {
                    autoMenuOpen.value = !autoMenuOpen.value;
                    modelSwitcherOpen.value = false;
                    slashMenuOpen.value = false;
                    effortMenuOpen.value = false;
                  })}
                  title="Switch tool execution mode"
                  style={
                    autoMode.value === "auto"
                      ? "height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.25rem;padding:0 6px;border-radius:0.25rem;background:var(--success-soft, rgba(16,185,129,0.1));border:1px solid rgba(16,185,129,0.25);font-size:0.6875rem;font-weight:500;color:var(--success);cursor:pointer;box-sizing:border-box;line-height:1;"
                      : autoMode.value === "ask"
                        ? "height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.25rem;padding:0 6px;border-radius:0.25rem;background:var(--warning-soft, rgba(245,158,11,0.1));border:1px solid rgba(245,158,11,0.25);font-size:0.6875rem;font-weight:500;color:var(--warning, #f59e0b);cursor:pointer;box-sizing:border-box;line-height:1;"
                        : selectedProvider.value.startsWith("cli") || selectedModel.value.startsWith("cli:")
                          ? "height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.25rem;padding:0 6px;border-radius:0.25rem;background:var(--surface-1);border:1px solid var(--border);font-size:0.6875rem;font-weight:500;color:var(--text-secondary);cursor:pointer;box-sizing:border-box;line-height:1;"
                          : "height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.25rem;padding:0 6px;border-radius:0.25rem;background:var(--surface-3);border:1px solid var(--border);font-size:0.6875rem;font-weight:500;color:var(--text-secondary);cursor:pointer;box-sizing:border-box;line-height:1;"
                  }
                >
                  {autoMode.value === "auto" ? (
                    <LuZap style="width:0.625rem;height:0.625rem;flex-shrink:0;" />
                  ) : autoMode.value === "ask" ? (
                    <LuShield style="width:0.625rem;height:0.625rem;flex-shrink:0;" />
                  ) : (
                    <LuMessageSquare style="width:0.625rem;height:0.625rem;flex-shrink:0;" />
                  )}
                  <span>
                    {autoMode.value === "auto" ? "Auto" : autoMode.value === "ask" ? "Ask First" : "Chat Only"}
                  </span>
                  <LuChevronDown style="width:0.625rem;height:0.625rem;opacity:0.6;flex-shrink:0;" />
                </button>
              </div>

              {/* Send / Stop Button (21px height) */}
              {isStreaming.value ? (
                <button
                  type="button"
                  onClick$={handleStop}
                  title="Stop generation"
                  style="height:21px;width:21px;min-height:21px;min-width:21px;border-radius:0.25rem;background:var(--error);color:#ffffff;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;box-sizing:border-box;"
                >
                  <LuSquare style="width:0.6875rem;height:0.6875rem;fill:#ffffff;" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick$={handleSendMessage}
                  disabled={!inputValue.value.trim() && !attachedFile.value}
                  title="Send message (Enter)"
                  style={`height:21px;width:21px;min-height:21px;min-width:21px;border-radius:0.25rem;background:var(--text-primary);color:var(--surface-1);border:none;cursor:${!inputValue.value.trim() && !attachedFile.value ? 'default' : 'pointer'};display:inline-flex;align-items:center;justify-content:center;opacity:${!inputValue.value.trim() && !attachedFile.value ? '0.35' : '1'};transition:opacity 0.15s;padding:0;box-sizing:border-box;`}
                >
                  <LuArrowUp style="width:0.75rem;height:0.75rem;stroke-width:2.5;" />
                </button>
              )}
            </div>
          </div>
        </div>
      </aside>
    </>
  );
});



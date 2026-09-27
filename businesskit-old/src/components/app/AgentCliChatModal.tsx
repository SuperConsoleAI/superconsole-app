// src/components/app/AgentCliChatModal.tsx
// Dedicated CLI Chat Modal for Claude Code CLI, Antigravity CLI, and Codex CLI.
// Features local subprocess execution, stdio MCP tools, real-time streaming, and customizable reasoning effort.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  PropFunction,
} from "@builder.io/qwik";
import {
  LuX,
  LuSend,
  LuPlus,
  LuSquare,
  LuPackage,
  LuFileText,
  LuUserCheck,
  LuPenTool,
  LuLayers,
  LuSparkles,
  LuAlertCircle,
  LuCheckCircle2,
  LuChevronDown,
  LuCheck,
  LuCopy,
  LuRotateCcw,
  LuZap,
  LuShield,
  LuMessageSquare,
  LuUsers,
  LuTerminal,
  LuAlertTriangle,
} from "@qwikest/icons/lucide";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { ProviderIcon } from "~/components/common/ProviderIcon";
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
import { useLocation } from "@builder.io/qwik-city";
import { useAppContext } from "~/lib/app-context";
import {
  AGENT_PROVIDER_OPTIONS as MODAL_PROVIDER_OPTIONS,
  AGENT_MODEL_OPTIONS as MODAL_MODEL_OPTIONS,
  getModelDisplayName,
  findProviderForModel,
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
  detectDomainFromCommand,
  detectDomainFromRoute,
  resolveDefaultDomain,
} from "~/components/agents";

export interface AgentCliChatModalProps {
  isOpen: boolean;
  onClose$: PropFunction<() => void>;
  initialProvider?: "cli_claude" | "cli_antigravity" | "cli_codex" | string;
  initialModel?: string;
}

interface UiToolAction {
  id: string;
  tool: string;
  args?: any;
  result?: any;
  status: "executing" | "completed" | "failed";
}

interface UiMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  toolActions?: UiToolAction[];
  created_at: number;
}

const CLI_DOMAIN_OPTIONS = [
  { id: "all", name: "All Apps", shortName: "All Apps" },
  { id: "shop", name: "Shop & Stock", shortName: "Shop" },
  { id: "crm", name: "CRM & Leads", shortName: "CRM" },
  { id: "content", name: "Content & Blog", shortName: "CMS" },
];

const getCliDomainIcon = (id: string) => {
  switch (id) {
    case "shop":
      return LuPackage;
    case "crm":
      return LuUsers;
    case "content":
      return LuFileText;
    default:
      return LuLayers;
  }
};

const CLI_QUICK_STARTERS = [
  {
    title: "Check Inventory Stock",
    desc: "Scan all stock levels & low stock alerts",
    cmd: "Check stock levels for all products and list items low on stock",
    icon: "package",
  },
  {
    title: "Recent Invoices & Totals",
    desc: "List latest unpaid and paid invoices",
    cmd: "Show latest 5 invoices with customer names and total amounts",
    icon: "invoice",
  },
  {
    title: "CRM Contacts Overview",
    desc: "Summary of newest customer leads",
    cmd: "List newest contacts and pending CRM followup activities",
    icon: "contact",
  },
  {
    title: "Run MCP Tool Diagnostics",
    desc: "Verify active local tool connectors",
    cmd: "Inspect available MCP tools and report operational readiness",
    icon: "tool",
  },
];

export const AgentCliChatModal = component$<AgentCliChatModalProps>(
  ({ isOpen, onClose$, initialProvider = "cli_antigravity", initialModel = "cli:antigravity:gemini-3.7-flash" }) => {
    const appCtx = useAppContext();
    const loc = useLocation();
    const sessions = useSignal<ChatSession[]>([]);
    const currentSessionId = useSignal<string | null>(null);
    const selectedDomain = useSignal<string>("all");
    const domainDropdownOpen = useSignal(false);
    const isDesktop = useSignal<boolean>(true);
    const selectedProvider = useSignal<string>(initialProvider);
    const selectedModel = useSignal<string>(initialModel);
    const providerTab = useSignal<string>(initialProvider);
    const modelSwitcherOpen = useSignal(false);
    const autoMode = useSignal<"auto" | "ask" | "off">("auto");
    const autoMenuOpen = useSignal(false);
    const reasoningEffort = useSignal<"low" | "medium" | "high" | "extra" | "max">("low");
    const thinkingEnabled = useSignal<boolean>(false);
    const effortMenuOpen = useSignal(false);
    const copiedMsgId = useSignal<string | null>(null);
    const messages = useSignal<UiMessage[]>([]);
    const inputValue = useSignal("");
    const isStreaming = useSignal(false);
    const currentRequestId = useSignal<string | null>(null);
    const streamingText = useSignal("");
    const activeToolActions = useSignal<UiToolAction[]>([]);
    const errorBanner = useSignal("");
    const messagesEndRef = useSignal<HTMLDivElement>();
    const inputRef = useSignal<HTMLInputElement>();

    const scrollToBottom = $(() => {
      if (messagesEndRef.value) {
        messagesEndRef.value.scrollIntoView({ behavior: "smooth" });
      }
    });

    const loadSessions = $(async () => {
      try {
        const list = await listChatSessions();
        // Filter sessions that are CLI-oriented or show all
        sessions.value = list;
        if (list.length > 0 && !currentSessionId.value) {
          const cliSess = list.find((s) => s.provider?.startsWith("cli") || s.model?.startsWith("cli:"));
          await selectSession(cliSess ? cliSess.id : list[0].id);
        } else if (list.length === 0) {
          await handleNewChat();
        } else if (currentSessionId.value) {
          await selectSession(currentSessionId.value);
        }
      } catch (err: any) {
        console.error("Failed to load CLI chat sessions:", err);
      }
    });

    const selectSession = $((sessionId: string) => {
      currentSessionId.value = sessionId;
      errorBanner.value = "";

      const sess = sessions.value.find((s) => s.id === sessionId);
      if (sess && sess.model) {
        selectedModel.value = sess.model;
        selectedProvider.value = sess.provider || findProviderForModel(sess.model);
        providerTab.value = selectedProvider.value;
      }

      // In-Memory Instant Cache Hit
      const cached = getCachedSessionMessages(sessionId);
      if (cached && Array.isArray(cached)) {
        messages.value = cached;
        setTimeout(scrollToBottom, 20);
      }

      getChatHistory(sessionId)
        .then((history) => {
          const mapped = history.map((m: ChatMessage) => {
            let toolsList: UiToolAction[] | undefined;
            if (m.tool_calls_json) {
              try {
                const parsed = JSON.parse(m.tool_calls_json);
                if (Array.isArray(parsed)) {
                  toolsList = parsed.map((item) => ({
                    id: item.id || String(Math.random()),
                    tool: item.tool,
                    result: item.result,
                    status: "completed",
                  }));
                }
              } catch {
                // ignore
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

          setCachedSessionMessages(sessionId, mapped);
          if (currentSessionId.value === sessionId) {
            messages.value = mapped;
            setTimeout(scrollToBottom, 40);
          }
        })
        .catch((err: any) => {
          console.error("Failed to load chat history:", err);
          if (!cached) {
            errorBanner.value = typeof err === "string" ? err : err.message || "Failed to load chat history";
          }
        });
    });

    const handleNewChat = $(async () => {
      try {
        const prov = selectedProvider.value || "cli_antigravity";
        let mdl = selectedModel.value || (prov === "cli_claude" ? "cli:claude:claude-5-sonnet" : prov === "cli_codex" ? "cli:codex:gpt-5-mini" : "cli:antigravity:gemini-3.7-flash");

        const cliCache = getCachedCliStatus();
        if (cliCache && cliCache[prov]) {
          mdl = cliCache[prov].model_id;
          const eff = cliCache[prov].active_effort;
          if (eff && ["low", "medium", "high", "extra", "max"].includes(eff)) {
            reasoningEffort.value = eff as any;
          }
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
        messages.value = [];
        errorBanner.value = "";
      } catch (err: any) {
        console.error("Failed to start new CLI chat session:", err);
        errorBanner.value = typeof err === "string" ? err : err.message || "Failed to start new CLI session";
      }
    });

    const handleSelectModel = $((providerId: string, modelId: string) => {
      selectedProvider.value = providerId;
      selectedModel.value = modelId;
      providerTab.value = providerId;
      localStorage.setItem("bk-agent-provider", providerId);
      localStorage.setItem("bk-agent-model", modelId);
      localStorage.setItem("bk-agent-model-manual", "true");
      modelSwitcherOpen.value = false;

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

      // Validate & clamp effort to selected model's supported tiers
      const reasoningConfig = getModelReasoningConfig(modelId, providerId);
      if (reasoningConfig.supportsReasoning) {
        if (!reasoningConfig.supportedTiers.includes(reasoningEffort.value)) {
          reasoningEffort.value = reasoningConfig.defaultTier;
          localStorage.setItem("bk-agent-reasoning-effort", reasoningConfig.defaultTier);
        }
      }
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

    const handleCopy = $((msgId: string, text: string) => {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        navigator.clipboard.writeText(text);
        copiedMsgId.value = msgId;
        setTimeout(() => {
          if (copiedMsgId.value === msgId) {
            copiedMsgId.value = null;
          }
        }, 1500);
      }
    });

    const handleRetry = $((text: string) => {
      inputValue.value = text;
      if (inputRef.value) {
        inputRef.value.focus();
      }
    });

    // Setup Tauri event listeners for real-time streaming
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ cleanup }) => {
      let unlistenToken: UnlistenFn | undefined;
      let unlistenTool: UnlistenFn | undefined;
      let unlistenDone: UnlistenFn | undefined;
      let unlistenError: UnlistenFn | undefined;

      const checkDesktop = () => {
        if (typeof window !== "undefined") {
          isDesktop.value = window.innerWidth > 768;
        }
      };
      checkDesktop();
      window.addEventListener("resize", checkDesktop);

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
          }
        });

        unlistenError = await listen<ChatErrorPayload>("chat-error", (event) => {
          if (event.payload.session_id === currentSessionId.value) {
            errorBanner.value = event.payload.error;
            isStreaming.value = false;
            currentRequestId.value = null;
            streamingText.value = "";
          }
        });
      };

      setupListeners();

      cleanup(() => {
        unlistenToken?.();
        unlistenTool?.();
        unlistenDone?.();
        unlistenError?.();
      });
    });

    // Load preferences and sessions on open
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(({ track, cleanup }) => {
      track(() => isOpen);
      if (isOpen) {
        // Fetch live CLI models from disk
        fetchAndSyncActiveCliModels().then((cliStatuses) => {
          if (cliStatuses) {
            const curProv = selectedProvider.value || initialProvider || "cli_antigravity";
            if (cliStatuses[curProv]) {
              const activeCli = cliStatuses[curProv];
              selectedProvider.value = curProv;
              selectedModel.value = activeCli.model_id;
              providerTab.value = curProv;
              if (activeCli.active_effort && ["low", "medium", "high", "extra", "max"].includes(activeCli.active_effort)) {
                reasoningEffort.value = activeCli.active_effort as any;
              }
            }
          }
        }).catch(() => {});

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
        window.addEventListener("bk-cli-model-updated", handleCliModelUpdate);
        cleanup(() => {
          window.removeEventListener("bk-cli-model-updated", handleCliModelUpdate);
        });

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
        const routeDomain = detectDomainFromRoute(loc.url.pathname);
        if (routeDomain) {
          selectedDomain.value = routeDomain;
        } else {
          selectedDomain.value = resolveDefaultDomain(appCtx.installedApps.value, loc.url.pathname);
        }
        fetchAndApplyLivePricing().catch(() => {});
        loadSessions();
      }
    });

    const handleSendMessage = $(async () => {
      const text = inputValue.value.trim();
      if (!text || isStreaming.value || !currentSessionId.value) return;

      errorBanner.value = "";
      inputValue.value = "";

      const userMsg: UiMessage = {
        id: "usr_" + Math.random().toString(36).substring(2, 9),
        role: "user",
        content: text,
        created_at: Date.now() / 1000,
      };
      const updatedMessages = [...messages.value, userMsg];
      messages.value = updatedMessages;
      setCachedSessionMessages(currentSessionId.value, updatedMessages);

      streamingText.value = "";
      activeToolActions.value = [];
      isStreaming.value = true;
      const reqId = "req_" + Math.random().toString(36).substring(2, 11);
      currentRequestId.value = reqId;
      setTimeout(scrollToBottom, 50);

      try {
        await sendChatMessage(
          currentSessionId.value,
          text,
          reqId,
          selectedProvider.value,
          selectedModel.value,
          selectedDomain.value,
          undefined,
          thinkingEnabled.value ? reasoningEffort.value : "off"
        );
      } catch (err: any) {
        console.error("sendChatMessage error:", err);
        errorBanner.value = typeof err === "string" ? err : err.message || "Failed to send message";
        isStreaming.value = false;
        currentRequestId.value = null;
      }
    });

    const handleStop = $(async () => {
      if (currentRequestId.value) {
        try {
          await stopChatSession(currentRequestId.value);
        } catch (err) {
          console.error("Failed to stop CLI chat:", err);
        }
        isStreaming.value = false;
        currentRequestId.value = null;
      }
    });

    if (!isOpen) return null;

    const currentModelsList = MODAL_MODEL_OPTIONS[providerTab.value] || MODAL_MODEL_OPTIONS["cli_antigravity"] || [];

    return (
      <div class="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 md:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn">
        <div
          class="relative w-full max-w-5xl h-[88vh] bg-[var(--surface-1)] border border-[var(--border)] rounded-2xl shadow-2xl flex flex-col md:flex-row overflow-hidden"
          style="background: var(--surface-1);"
        >
          {/* Left Sidebar (Sessions) */}
          <div class="hidden md:flex flex-col w-64 border-r border-[var(--border)] bg-[var(--surface-2)] p-4 shrink-0">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <div class="w-7 h-7 rounded-lg bg-blue-500/15 flex items-center justify-center text-blue-500">
                  <LuTerminal class="w-4 h-4" />
                </div>
                <div class="flex flex-col">
                  <span class="font-semibold text-sm text-[var(--text-primary)]">CLI Chat</span>
                  <span class="text-[10px] text-[var(--text-tertiary)]">Local Subprocess</span>
                </div>
              </div>
              <button
                onClick$={handleNewChat}
                title="New CLI Conversation"
                class="p-1.5 rounded-lg hover:bg-[var(--surface-3)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <LuPlus class="w-4 h-4" />
              </button>
            </div>

            <div class="flex-1 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
              {sessions.value.map((s) => {
                const isSelected = s.id === currentSessionId.value;
                return (
                  <button
                    key={s.id}
                    onClick$={() => selectSession(s.id)}
                    class={`w-full text-left px-3 py-2.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 truncate cursor-pointer ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-sm"
                        : "text-[var(--text-secondary)] hover:bg-[var(--surface-3)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <LuTerminal class="w-3.5 h-3.5 shrink-0" />
                    <span class="truncate">{s.title || "CLI Session"}</span>
                  </button>
                );
              })}
            </div>

            {/* Sidebar Footer with Active CLI Model */}
            <div class="pt-3 border-t border-[var(--border)] flex items-center justify-between text-[11px] text-[var(--text-tertiary)]">
              <div class="flex items-center gap-1.5 overflow-hidden">
                <ProviderIcon model={selectedModel.value} provider={selectedProvider.value} size="0.95rem" />
                <span class="truncate text-[var(--text-secondary)] font-medium">
                  {getModelDisplayName(selectedModel.value)}
                </span>
              </div>
              <span class="flex items-center gap-1 shrink-0 text-blue-500 font-semibold text-[10px]">
                <span class="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block animate-pulse" />
                Local
              </span>
            </div>
          </div>

          {/* Main Chat Area */}
          <div class="flex-1 flex flex-col h-full bg-[var(--surface-1)] relative">
            {/* Top Bar */}
            <div class="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--surface-1)]">
              <div class="flex items-center gap-3">
                <div class="md:hidden flex items-center gap-2">
                  <button
                    onClick$={handleNewChat}
                    class="p-1.5 rounded-lg bg-[var(--surface-2)] text-[var(--text-secondary)]"
                  >
                    <LuPlus class="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <h3 class="font-semibold text-sm text-[var(--text-primary)] flex items-center gap-2">
                    <ProviderIcon provider={selectedProvider.value} size="1rem" />
                    <span>
                      {selectedProvider.value === "cli_claude"
                        ? "Claude Code CLI Agent"
                        : selectedProvider.value === "cli_codex"
                        ? "Codex CLI Agent"
                        : "Antigravity CLI Agent"}
                    </span>
                    <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                      CLI Mode
                    </span>
                  </h3>
                  <p class="text-[11px] text-[var(--text-tertiary)]">
                    Direct Subprocess · Stdio MCP Server · Zero Token Fees
                  </p>
                </div>
              </div>

              <div class="flex items-center gap-2">
                {/* Domain Selector Dropdown */}
                <div class="relative">
                  <button
                    type="button"
                    onClick$={() => {
                      domainDropdownOpen.value = !domainDropdownOpen.value;
                      modelSwitcherOpen.value = false;
                      effortMenuOpen.value = false;
                    }}
                    class="h-7 px-2.5 rounded-lg bg-transparent border border-[var(--border)] hover:border-blue-500/50 text-[var(--text-primary)] inline-flex items-center gap-1.5 text-xs font-medium cursor-pointer transition-colors"
                    title="Filter agent domain"
                  >
                    {(() => {
                      const currentDomain =
                        CLI_DOMAIN_OPTIONS.find((d) => d.id === selectedDomain.value) || CLI_DOMAIN_OPTIONS[0];
                      const CurrentIcon = getCliDomainIcon(currentDomain.id);
                      return (
                        <>
                          <CurrentIcon class="w-3.5 h-3.5 text-[var(--text-secondary)]" />
                          <span>{currentDomain.shortName}</span>
                        </>
                      );
                    })()}
                    <LuChevronDown class="w-3 h-3 text-[var(--text-secondary)] opacity-60" />
                  </button>

                  {domainDropdownOpen.value && (
                    <div class="absolute right-0 top-[calc(100%+6px)] w-44 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg shadow-xl z-50 p-1 flex flex-col gap-0.5 animate-fadeIn">
                      {CLI_DOMAIN_OPTIONS.map((d) => {
                        const isSelected = d.id === selectedDomain.value;
                        const Icon = getCliDomainIcon(d.id);
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick$={() => {
                              selectedDomain.value = d.id;
                              localStorage.setItem("bk-agent-domain", d.id);
                              domainDropdownOpen.value = false;
                            }}
                            class={`w-full text-left px-2.5 py-1.5 rounded-md text-xs border-none cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                              isSelected
                                ? "bg-[var(--surface-3)] font-semibold text-[var(--text-primary)]"
                                : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60 hover:text-[var(--text-primary)]"
                            }`}
                          >
                            <div class="flex items-center gap-2 min-w-0">
                              <Icon class="w-3.5 h-3.5 text-[var(--text-secondary)] shrink-0" />
                              <span class="truncate">{d.name}</span>
                            </div>
                            {isSelected && <LuCheck class="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  onClick$={onClose$}
                  class="p-1.5 rounded-lg hover:bg-[var(--surface-2)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                >
                  <LuX class="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Error Banner */}
            {errorBanner.value && (
              <div class="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-500 text-xs flex items-center gap-2">
                <LuAlertCircle class="w-4 h-4 shrink-0" />
                <span>{errorBanner.value}</span>
              </div>
            )}

            {/* Messages Stream */}
            <div class="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 custom-scrollbar">
              {messages.value.length === 0 && !isStreaming.value && (
                <div class="h-full flex flex-col items-center justify-center text-center p-6 space-y-4 max-w-md mx-auto">
                  <div class="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500 shadow-inner">
                    <LuTerminal class="w-6 h-6" />
                  </div>
                  <div>
                    <h4 class="font-semibold text-sm text-[var(--text-primary)]">
                      {selectedProvider.value === "cli_claude"
                        ? "Claude Code CLI Agent"
                        : selectedProvider.value === "cli_codex"
                        ? "Codex CLI Agent"
                        : "Antigravity CLI Agent"}
                    </h4>
                    <p class="text-xs text-[var(--text-secondary)] mt-1">
                      Runs your local CLI binaries directly with automatic stdio MCP tool execution.
                    </p>
                  </div>

                  <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full pt-2">
                    {CLI_QUICK_STARTERS.map((starter) => (
                      <button
                        key={starter.title}
                        onClick$={() => {
                          inputValue.value = starter.cmd;
                        }}
                        class="text-left p-2.5 rounded-xl border border-[var(--border)] bg-[var(--surface-2)] hover:bg-[var(--surface-3)] text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all cursor-pointer"
                      >
                        <div class="font-medium text-[var(--text-primary)] mb-0.5">{starter.title}</div>
                        <div class="text-[11px] opacity-75">{starter.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.value.map((msg) => (
                <div
                  key={msg.id}
                  class={`flex flex-col group ${msg.role === "user" ? "items-end" : "items-start w-full"}`}
                >
                  {msg.role === "user" ? (
                    <div class="flex flex-col items-end max-w-[80%]">
                      <div
                        class="rounded-xl px-4 py-2.5 text-xs sm:text-sm leading-relaxed border border-[var(--border)] text-[var(--text-primary)] shadow-sm whitespace-pre-wrap"
                        style="background: var(--surface-1); color: var(--text-primary);"
                      >
                        {msg.content}
                      </div>

                      <div class="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          onClick$={() => handleCopy(msg.id, msg.content)}
                          title={copiedMsgId.value === msg.id ? "Copied!" : "Copy message"}
                          class="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                        >
                          {copiedMsgId.value === msg.id ? (
                            <LuCheck class="w-3 h-3 text-emerald-500" />
                          ) : (
                            <LuCopy class="w-3 h-3" />
                          )}
                        </button>
                        <button
                          type="button"
                          onClick$={() => handleRetry(msg.content)}
                          title="Retry message"
                          class="p-1 rounded text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-3)] transition-colors cursor-pointer"
                        >
                          <LuRotateCcw class="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div class="w-full bg-transparent border-none shadow-none text-xs sm:text-sm leading-relaxed text-[var(--text-primary)]">
                      <MarkdownRenderer content={msg.content} />

                      {msg.toolActions && msg.toolActions.length > 0 && (
                        <div class="mt-2.5 space-y-2">
                          {msg.toolActions.map((tool) => (
                            <ToolResultCard key={tool.id} tool={tool} />
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {isStreaming.value && (
                <div class="w-full bg-transparent border-none shadow-none text-xs sm:text-sm leading-relaxed text-[var(--text-primary)]">
                  {streamingText.value ? (
                    <MarkdownRenderer content={streamingText.value} />
                  ) : (
                    <div class="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                      <span class="inline-block animate-spin w-3.5 h-3.5 border-2 border-blue-500 border-t-transparent rounded-full" />
                      <span>CLI executing subprocess & MCP tools...</span>
                    </div>
                  )}

                  {activeToolActions.value.length > 0 && (
                    <div class="mt-2.5 space-y-2">
                      {activeToolActions.value.map((tool) => (
                        <ToolResultCard key={tool.id} tool={tool} />
                      ))}
                    </div>
                  )}
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Model Switcher Popover */}
            {modelSwitcherOpen.value && (
              <div class="absolute left-4 bottom-[72px] w-80 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden flex flex-col animate-fadeIn">
                {/* Active Provider Header */}
                <div class="flex items-center justify-between p-2.5 bg-[var(--surface-1)] border-b border-[var(--border)]">
                  <div class="flex items-center gap-2 min-w-0">
                    <ProviderIcon provider={providerTab.value} size="1rem" />
                    <div class="flex flex-col min-w-0">
                      <span class="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {MODAL_PROVIDER_OPTIONS.find((p) => p.id === providerTab.value)?.name || "CLI Provider"}
                      </span>
                      <span class="text-[10px] text-[var(--text-secondary)] truncate">
                        Local CLI • Free Inference
                      </span>
                    </div>
                  </div>
                  <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/10 text-blue-500">
                    CLI Mode
                  </span>
                </div>

                {/* Provider Selection Tabs */}
                <div class="flex p-1.5 gap-1.5 bg-[var(--surface-2)] border-b border-[var(--border)] overflow-x-auto custom-scrollbar items-center">
                  {MODAL_PROVIDER_OPTIONS.filter((p) => p.isCli).map((p) => {
                    const isActive = providerTab.value === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick$={() => (providerTab.value = p.id)}
                        class={`px-2 py-1 rounded-md text-[11px] font-semibold border-none cursor-pointer transition-all flex items-center gap-1.5 shrink-0 whitespace-nowrap ${
                          isActive
                            ? "bg-[var(--surface-3)] text-[var(--text-primary)] shadow-sm"
                            : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60 hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <ProviderIcon provider={p.id} size="0.75rem" />
                        <span>{p.name}</span>
                      </button>
                    );
                  })}
                </div>

                {/* Models List for Selected Provider */}
                <div class="overflow-y-auto p-1.5 flex flex-col gap-1 max-h-60 custom-scrollbar">
                  {currentModelsList.map((m) => {
                    const isSelected = selectedModel.value === m.id;
                    const activeCliModelId = getCachedCliStatus()?.[providerTab.value]?.model_id;
                    const isCurrent = activeCliModelId === m.id;

                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick$={() => handleSelectModel(providerTab.value, m.id)}
                        class={`w-full text-left p-2 rounded-lg border cursor-pointer flex items-center justify-between gap-2 transition-all ${
                          isSelected
                            ? "border-transparent bg-[var(--surface-3)] text-[var(--text-primary)] font-medium"
                            : "border-transparent bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60 hover:text-[var(--text-primary)]"
                        }`}
                      >
                        <div class="flex items-center gap-2 min-w-0 flex-1">
                          <ProviderIcon model={m.id} provider={m.provider || providerTab.value} size="1.125rem" />
                          <div class="flex flex-col min-w-0 flex-1">
                            <div class="flex items-center gap-1.5 flex-wrap">
                              <span class="text-xs font-medium text-[var(--text-primary)] truncate">
                                {m.name}
                              </span>
                              {isCurrent && (
                                <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-500 dark:text-blue-400">
                                  Current
                                </span>
                              )}
                              {m.badge && (
                                <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-secondary)]">
                                  {m.badge}
                                </span>
                              )}
                            </div>
                            <span class="font-mono text-[10px] text-[var(--text-tertiary)] truncate">
                              {m.id}
                            </span>
                          </div>
                        </div>

                        <div class="flex items-center gap-1.5 shrink-0">
                          {m.price && (
                            <span class="text-[10px] text-[var(--text-tertiary)] font-mono">
                              {m.price}
                            </span>
                          )}
                          {isSelected && (
                            <LuCheck class="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Thinking & Effort Popover (Claude Style) */}
            {effortMenuOpen.value && (() => {
              const reasoningConfig = getModelReasoningConfig(selectedModel.value, selectedProvider.value);
              return (
                <div class="absolute left-36 bottom-[72px] w-68 bg-[var(--surface-2)] border border-[var(--border)] rounded-xl shadow-2xl z-50 p-2.5 flex flex-col gap-1 animate-fadeIn">
                  {reasoningConfig.supportsReasoning ? (
                    <>
                      {/* Header Description */}
                      <div class="text-xs text-[var(--text-secondary)] leading-relaxed px-1.5 pt-0.5 pb-1">
                        Higher effort means more thorough responses, but takes longer and uses your limits faster.
                      </div>

                      {/* Effort Options List */}
                      <div class="flex flex-col gap-0.5">
                        {/* Low (Default) */}
                        {reasoningConfig.supportedTiers.includes("low") && (
                          <button
                            type="button"
                            onClick$={() => handleSelectEffort("low")}
                            class={`w-full text-left px-2 py-1.5 rounded-md text-xs border-none cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                              reasoningEffort.value === "low"
                                ? "bg-[var(--surface-3)] font-medium text-[var(--text-primary)]"
                                : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60"
                            }`}
                          >
                            <div class="flex items-center gap-1.5">
                              <span>Low</span>
                              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-tertiary)]">
                                Default
                              </span>
                            </div>
                            {reasoningEffort.value === "low" && <LuCheck class="w-3.5 h-3.5 text-blue-500" />}
                          </button>
                        )}

                        {/* Medium */}
                        {reasoningConfig.supportedTiers.includes("medium") && (
                          <button
                            type="button"
                            onClick$={() => handleSelectEffort("medium")}
                            class={`w-full text-left px-2 py-1.5 rounded-md text-xs border-none cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                              reasoningEffort.value === "medium"
                                ? "bg-[var(--surface-3)] font-medium text-[var(--text-primary)]"
                                : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60"
                            }`}
                          >
                            <span>Medium</span>
                            {reasoningEffort.value === "medium" && <LuCheck class="w-3.5 h-3.5 text-blue-500" />}
                          </button>
                        )}

                        {/* High */}
                        {reasoningConfig.supportedTiers.includes("high") && (
                          <button
                            type="button"
                            onClick$={() => handleSelectEffort("high")}
                            class={`w-full text-left px-2 py-1.5 rounded-md text-xs border-none cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                              reasoningEffort.value === "high"
                                ? "bg-[var(--surface-3)] font-medium text-[var(--text-primary)]"
                                : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60"
                            }`}
                          >
                            <span>High</span>
                            {reasoningEffort.value === "high" && <LuCheck class="w-3.5 h-3.5 text-blue-500" />}
                          </button>
                        )}

                        {/* Extra */}
                        {reasoningConfig.supportedTiers.includes("extra") && (
                          <button
                            type="button"
                            onClick$={() => handleSelectEffort("extra")}
                            class={`w-full text-left px-2 py-1.5 rounded-md text-xs border-none cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                              reasoningEffort.value === "extra"
                                ? "bg-[var(--surface-3)] font-medium text-[var(--text-primary)]"
                                : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60"
                            }`}
                          >
                            <span>Extra</span>
                            {reasoningEffort.value === "extra" && <LuCheck class="w-3.5 h-3.5 text-blue-500" />}
                          </button>
                        )}

                        {/* Max (3.5x usage warning) */}
                        {reasoningConfig.supportedTiers.includes("max") && (
                          <button
                            type="button"
                            onClick$={() => handleSelectEffort("max")}
                            class={`w-full text-left px-2 py-1.5 rounded-md text-xs border-none cursor-pointer flex items-center justify-between gap-2 transition-colors ${
                              reasoningEffort.value === "max"
                                ? "bg-[var(--surface-3)] font-medium text-[var(--text-primary)]"
                                : "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--surface-3)]/60"
                            }`}
                          >
                            <div class="flex items-center gap-1.5">
                              <span>Max</span>
                              <span class="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center gap-1">
                                <LuAlertTriangle class="w-2.5 h-2.5" /> 3.5× or more usage
                              </span>
                            </div>
                            {reasoningEffort.value === "max" && <LuCheck class="w-3.5 h-3.5 text-blue-500" />}
                          </button>
                        )}
                      </div>

                      {/* Divider */}
                      <div class="h-px bg-[var(--border)] my-1" />

                      {/* Thinking Toggle (Direct on/off) */}
                      <div class="px-2 py-1 flex items-center justify-between gap-2">
                        <div class="flex flex-col">
                          <span class="text-xs font-medium text-[var(--text-primary)]">AI Thinking</span>
                          <span class="text-[11px] text-[var(--text-secondary)]">
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
                          class={`relative w-8 h-4.5 rounded-full cursor-pointer border-none transition-colors ${
                            thinkingEnabled.value ? "bg-blue-600 dark:bg-blue-500" : "bg-[var(--surface-3)] border border-[var(--border)]"
                          }`}
                          title="Toggle AI Thinking"
                        >
                          <div
                            class={`absolute top-0.5 left-0.5 w-3.5 h-3.5 rounded-full shadow-sm transition-all ${
                              thinkingEnabled.value
                                ? "translate-x-3.5 bg-white dark:bg-[#18181b]"
                                : "translate-x-0 bg-white dark:bg-[#a1a1aa]"
                            }`}
                          />
                        </button>
                      </div>
                    </>
                  ) : (
                    /* Non-Reasoning Model Explainer */
                    <div class="p-1.5 flex flex-col gap-1.5">
                      <div class="text-xs font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                        <LuZap class="w-3.5 h-3.5 text-amber-500" />
                        Direct Response Model
                      </div>
                      <div class="text-[11px] leading-relaxed text-[var(--text-secondary)]">
                        This model generates responses directly without an extended reasoning or thinking phase. Reasoning effort cannot be adjusted.
                      </div>
                      <div class="text-[10px] px-2 py-1 rounded bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-tertiary)]">
                        ⚡ Instant Generation · Zero Thinking Overhead
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Input Box & Toolbar (Using surface-1 fill for composer chips/buttons) */}
            <div class="p-3 sm:p-4 border-t border-[var(--border)] bg-[var(--surface-1)]">
              <div class="bg-[var(--surface-2)] border border-[var(--border)] rounded-xl focus-within:ring-2 focus-within:ring-blue-500/50 p-2 transition-all flex flex-col gap-2">
                <form
                  preventdefault:submit
                  onSubmit$={handleSendMessage}
                  class="relative flex items-center"
                >
                  <input
                    ref={inputRef}
                    type="text"
                    value={inputValue.value}
                    onInput$={(e) => {
                      const target = e.target as HTMLInputElement;
                      inputValue.value = target.value;
                      const d = detectDomainFromCommand(target.value);
                      if (d && selectedDomain.value !== d) {
                        selectedDomain.value = d;
                        try {
                          localStorage.setItem("bk-agent-domain", d);
                        } catch {
                          // ignore
                        }
                      }
                    }}
                    placeholder="Message your CLI agent (e.g. 'Audit low stock items and draft purchase orders')..."
                    disabled={isStreaming.value}
                    class="flex-1 bg-transparent border-none px-2 py-1 text-xs sm:text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none"
                  />

                  {isStreaming.value ? (
                    <button
                      type="button"
                      onClick$={handleStop}
                      class="p-2 rounded-lg bg-red-500 hover:bg-red-600 text-white font-medium text-xs flex items-center gap-1.5 transition-colors cursor-pointer shrink-0"
                    >
                      <LuSquare class="w-3.5 h-3.5 fill-white" />
                      <span>Stop</span>
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!inputValue.value.trim()}
                      class="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white transition-all cursor-pointer shrink-0"
                    >
                      <LuSend class="w-4 h-4" />
                    </button>
                  )}
                </form>

                {/* Bottom Toolbar Pills (Using surface-1 fill in CLI mode) */}
                <div class="flex items-center justify-between pt-1 border-t border-[var(--border)]/60 text-xs">
                  <div class="flex items-center gap-2 flex-wrap">
                    {/* CLI Mode Badge Pill */}
                    <span
                      class="h-6 px-2 rounded-md bg-[var(--surface-1)] border border-[var(--border)] text-[var(--text-primary)] inline-flex items-center gap-1.5 text-[11px] font-semibold whitespace-nowrap"
                      title="Running via local CLI subprocess & Stdio MCP server"
                    >
                      <ProviderIcon provider={selectedProvider.value} size="0.75rem" />
                      <span>CLI</span>
                    </span>

                    {/* Model Selector Pill (surface-1 fill) */}
                    <button
                      type="button"
                      onClick$={() => {
                        modelSwitcherOpen.value = !modelSwitcherOpen.value;
                        autoMenuOpen.value = false;
                        effortMenuOpen.value = false;
                        domainDropdownOpen.value = false;
                        if (modelSwitcherOpen.value) {
                          providerTab.value = findProviderForModel(selectedModel.value) || selectedProvider.value;
                        }
                      }}
                      title="Switch CLI Model"
                      class="h-6 px-2 rounded-md bg-[var(--surface-1)] border border-[var(--border)] hover:border-blue-500/50 text-[var(--text-primary)] inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer transition-colors"
                    >
                      <ProviderIcon model={selectedModel.value} provider={selectedProvider.value} size="0.875rem" />
                      <span class="max-w-[130px] truncate">
                        {getModelDisplayName(selectedModel.value)}
                      </span>
                      <LuChevronDown class="w-3 h-3 text-[var(--text-secondary)] opacity-60" />
                    </button>

                    {/* Thinking / Reasoning Effort Pill (surface-1 fill) */}
                    {modelSupportsReasoning(selectedModel.value, selectedProvider.value) && (
                      <button
                        type="button"
                        onClick$={() => {
                          effortMenuOpen.value = !effortMenuOpen.value;
                          modelSwitcherOpen.value = false;
                          autoMenuOpen.value = false;
                          domainDropdownOpen.value = false;
                        }}
                        title="Set AI Thinking / Reasoning Effort"
                        class="h-6 px-2 rounded-md bg-[var(--surface-1)] border border-[var(--border)] hover:border-blue-500/50 text-[var(--text-primary)] inline-flex items-center gap-1 text-[11px] font-medium cursor-pointer transition-colors whitespace-nowrap"
                      >
                        <LuSparkles class={`w-3 h-3 ${thinkingEnabled.value ? "text-blue-500" : "text-[var(--text-tertiary)] opacity-60"}`} />
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
                        <LuChevronDown class="w-3 h-3 opacity-60" />
                      </button>
                    )}

                    {/* Auto Tools Dropdown (surface-1 fill when off) */}
                    <button
                      type="button"
                      onClick$={() => {
                        autoMenuOpen.value = !autoMenuOpen.value;
                        modelSwitcherOpen.value = false;
                        effortMenuOpen.value = false;
                        domainDropdownOpen.value = false;
                      }}
                      title="Switch tool execution mode"
                      class={`h-6 px-2 rounded-md border text-[11px] font-medium inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                        autoMode.value === "auto"
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                          : autoMode.value === "ask"
                          ? "bg-amber-500/10 border-amber-500/30 text-amber-500"
                          : "bg-[var(--surface-1)] border-[var(--border)] text-[var(--text-secondary)]"
                      }`}
                    >
                      {autoMode.value === "auto" ? (
                        <LuZap class="w-3 h-3" />
                      ) : autoMode.value === "ask" ? (
                        <LuShield class="w-3 h-3" />
                      ) : (
                        <LuMessageSquare class="w-3 h-3" />
                      )}
                      <span>
                        {autoMode.value === "auto" ? "Auto" : autoMode.value === "ask" ? "Ask First" : "Chat Only"}
                      </span>
                      <LuChevronDown class="w-3 h-3 opacity-60" />
                    </button>
                  </div>

                  <div class="text-[10px] text-[var(--text-tertiary)] font-mono hidden sm:block">
                    Press Enter to send
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

// ── Tool Result Visual Card ───────────────────────────────────────────────────

const ToolResultCard = component$<{ tool: UiToolAction }>(({ tool }) => {
  const isCompleted = tool.status === "completed";
  const isExecuting = tool.status === "executing";
  const isFailed = tool.status === "failed";

  const getToolIcon = () => {
    switch (tool.tool) {
      case "create_invoice":
      case "get_invoice":
      case "list_invoices":
        return <LuFileText class="w-3.5 h-3.5 text-blue-500" />;
      case "adjust_inventory":
      case "get_inventory_levels":
        return <LuPackage class="w-3.5 h-3.5 text-emerald-500" />;
      case "create_contact":
      case "get_contact":
      case "search_contacts":
        return <LuUserCheck class="w-3.5 h-3.5 text-purple-500" />;
      case "create_post":
      case "publish_post":
        return <LuPenTool class="w-3.5 h-3.5 text-pink-500" />;
      default:
        return <LuLayers class="w-3.5 h-3.5 text-indigo-500" />;
    }
  };

  const getTitle = () => {
    switch (tool.tool) {
      case "adjust_inventory":
        return "Adjust Inventory Stock";
      case "get_inventory_levels":
        return "Query Stock Levels";
      case "create_invoice":
        return "Generate New Invoice";
      case "get_invoice":
        return "Fetch Invoice Details";
      case "list_invoices":
        return "List Invoices";
      case "create_contact":
        return "Create CRM Contact";
      case "get_contact":
        return "Retrieve CRM Profile";
      case "search_contacts":
        return "Search Customer Database";
      case "create_post":
        return "Draft CMS Post";
      case "publish_post":
        return "Publish CMS Post";
      default:
        return tool.tool.replace(/_/g, " ");
    }
  };

  const formatValue = (v: any) => {
    if (v === null || v === undefined) return "—";
    if (Array.isArray(v)) {
      if (v.length > 0 && typeof v[0] === "object") {
        return v
          .map((item) => {
            const name = item.item_name || item.name || item.sku || "Item";
            const qty = item.quantity_received ?? item.quantity_delta ?? item.quantity_on_hand ?? item.qty;
            const cost = item.unit_cost ?? item.unit_price;
            const selling = item.selling_price;
            if (qty !== undefined && cost !== undefined && cost > 0) {
              const spStr = selling ? ` · Selling ₹${selling}` : "";
              return `${name} (+${qty} @ ₹${cost}${spStr})`;
            } else if (qty !== undefined) {
              return `${name} (${qty >= 0 ? "+" : ""}${qty})`;
            }
            return name;
          })
          .join(", ");
      }
      return v.join(", ");
    }
    if (typeof v === "object") return JSON.stringify(v);
    return String(v);
  };

  return (
    <div class="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] overflow-hidden shadow-sm flex flex-col text-xs">
      <div class="flex items-center justify-between px-3 py-2 bg-[var(--surface-3)] border-b border-[var(--border)] select-none">
        <div class="flex items-center gap-2 font-medium text-[var(--text-primary)]">
          {getToolIcon()}
          <span>{getTitle()}</span>
        </div>

        <div class="flex items-center gap-1.5 text-[11px]">
          {isExecuting && (
            <span class="text-amber-500 flex items-center gap-1">
              <span class="inline-block animate-spin w-2.5 h-2.5 border-2 border-amber-500 border-t-transparent rounded-full" />
              Executing...
            </span>
          )}
          {isCompleted && (
            <span class="text-emerald-500 flex items-center gap-1">
              <LuCheckCircle2 class="w-3.5 h-3.5" />
              Applied
            </span>
          )}
          {isFailed && (
            <span class="text-red-500 flex items-center gap-1">
              <LuAlertCircle class="w-3.5 h-3.5" />
              Failed
            </span>
          )}
        </div>
      </div>

      {tool.result && (
        <div class="p-3 text-[11px] font-mono text-[var(--text-secondary)] overflow-x-auto leading-relaxed">
          {typeof tool.result === "object" ? (
            <div class="space-y-0.5">
              {Object.entries(tool.result).map(([k, v]) => (
                <div key={k} class="flex items-start gap-1.5">
                  <span class="text-[var(--text-tertiary)] flex-shrink-0">{k}:</span>
                  <span class="text-[var(--text-primary)] font-semibold break-words">{formatValue(v)}</span>
                </div>
              ))}
            </div>
          ) : (
            String(tool.result)
          )}
        </div>
      )}
    </div>
  );
});

// ── Markdown & Table Renderer ──────────────────────────────────────────────────

const MarkdownRenderer = component$<{ content: string }>(({ content }) => {
  const lines = content.split("\n");
  const elements: any[] = [];

  let inCodeBlock = false;
  let codeBlockContent: string[] = [];
  let codeBlockLang = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push({
          type: "code",
          lang: codeBlockLang,
          content: codeBlockContent.join("\n"),
        });
        inCodeBlock = false;
        codeBlockContent = [];
        codeBlockLang = "";
      } else {
        inCodeBlock = true;
        codeBlockLang = line.slice(3).trim();
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockContent.push(line);
      continue;
    }

    // Markdown Table parsing
    if (line.includes("|") && i + 1 < lines.length && /^\s*\|?\s*[-:]+[-| :]*\|?\s*$/.test(lines[i + 1])) {
      const parseCells = (r: string) => {
        const trimmed = r.trim().replace(/^\|/, "").replace(/\|$/, "");
        return trimmed.split("|").map((c) => c.trim());
      };

      const headers = parseCells(line);
      const alignLine = parseCells(lines[i + 1]);
      const alignments = alignLine.map((a) => {
        const trimmed = a.trim();
        if (trimmed.startsWith(":") && trimmed.endsWith(":")) return "center";
        if (trimmed.endsWith(":")) return "right";
        return "left";
      });

      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].trim().includes("|")) {
        rows.push(parseCells(lines[i]));
        i++;
      }
      i--;

      elements.push({
        type: "table",
        headers,
        alignments,
        rows,
      });
      continue;
    }

    if (line.startsWith("### ")) {
      elements.push({ type: "h3", content: line.slice(4) });
    } else if (line.startsWith("## ")) {
      elements.push({ type: "h2", content: line.slice(3) });
    } else if (line.startsWith("# ")) {
      elements.push({ type: "h1", content: line.slice(2) });
    } else if (line.startsWith("- ") || line.startsWith("* ") || line.startsWith("• ")) {
      elements.push({ type: "li", content: line.replace(/^[-*•]\s+/, "") });
    } else if (/^\d+\.\s/.test(line)) {
      elements.push({ type: "oli", content: line.replace(/^\d+\.\s/, "") });
    } else if (line.trim() === "") {
      elements.push({ type: "spacer" });
    } else {
      elements.push({ type: "p", content: line });
    }
  }

  if (inCodeBlock && codeBlockContent.length > 0) {
    elements.push({
      type: "code",
      lang: codeBlockLang,
      content: codeBlockContent.join("\n"),
    });
  }

  const formatInline = (text: string) => {
    const tokens = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return tokens.map((token, pIdx) => {
      if (token.startsWith("**") && token.endsWith("**") && token.length >= 4) {
        return (
          <strong key={pIdx} class="font-semibold text-[var(--text-primary)] select-text">
            {token.slice(2, -2)}
          </strong>
        );
      }
      if (token.startsWith("*") && token.endsWith("*") && token.length >= 2) {
        return (
          <em key={pIdx} class="italic text-[var(--text-primary)] select-text">
            {token.slice(1, -1)}
          </em>
        );
      }
      if (token.startsWith("`") && token.endsWith("`") && token.length >= 2) {
        return (
          <code
            key={pIdx}
            class="px-1 py-0.5 rounded bg-[var(--surface-3)] border border-[var(--border)] font-mono text-[11px] select-text"
          >
            {token.slice(1, -1)}
          </code>
        );
      }
      return token;
    });
  };

  const renderContentWithBreaks = (text: string) => {
    const segments = text.split(/<br\s*\/?>/gi);
    return segments.map((seg, sIdx) => (
      <span key={sIdx} class="inline">
        {sIdx > 0 && <br />}
        {formatInline(seg)}
      </span>
    ));
  };

  return (
    <div class="flex flex-col gap-1.5 select-text">
      {elements.map((el, idx) => {
        if (el.type === "h1") {
          return <h1 key={idx} class="text-sm font-semibold mt-1.5 mb-0.5 text-[var(--text-primary)] select-text">{renderContentWithBreaks(el.content)}</h1>;
        }
        if (el.type === "h2") {
          return <h2 key={idx} class="text-xs font-semibold mt-1 mb-0.5 text-[var(--text-primary)] select-text">{renderContentWithBreaks(el.content)}</h2>;
        }
        if (el.type === "h3") {
          return <h3 key={idx} class="text-xs font-semibold mt-1 mb-0.5 text-[var(--text-primary)] select-text">{renderContentWithBreaks(el.content)}</h3>;
        }
        if (el.type === "li") {
          return (
            <div key={idx} class="flex items-start gap-1.5 pl-1 select-text">
              <span class="text-[var(--text-secondary)] leading-relaxed">•</span>
              <span class="flex-1 select-text">{renderContentWithBreaks(el.content)}</span>
            </div>
          );
        }
        if (el.type === "oli") {
          return (
            <div key={idx} class="flex items-start gap-1.5 pl-1 select-text">
              <span class="text-xs text-[var(--text-secondary)] font-mono leading-relaxed">{idx + 1}.</span>
              <span class="flex-1 select-text">{renderContentWithBreaks(el.content)}</span>
            </div>
          );
        }
        if (el.type === "code") {
          return (
            <div key={idx} class="my-1.5 rounded-lg bg-[var(--surface-1)] border border-[var(--border)] overflow-hidden select-text">
              {el.lang && (
                <div class="px-2 py-1 bg-[var(--surface-3)] text-[10px] font-mono text-[var(--text-secondary)] border-b border-[var(--border)] select-none">
                  {el.lang}
                </div>
              )}
              <pre class="m-0 p-2.5 text-xs font-mono overflow-x-auto text-[var(--text-primary)] leading-relaxed select-text">
                <code class="select-text">{el.content}</code>
              </pre>
            </div>
          );
        }
        if (el.type === "table") {
          return (
            <div
              key={idx}
              class="my-2 rounded-lg border border-[var(--border)] overflow-x-auto bg-[var(--surface-1)] max-w-full select-text"
            >
              <table class="w-full border-collapse text-xs text-left leading-relaxed">
                <thead>
                  <tr class="bg-[var(--surface-3)] border-b border-[var(--border)]">
                    {el.headers.map((h: string, hIdx: number) => (
                      <th
                        key={hIdx}
                        class={`px-2.5 py-1.5 font-semibold text-[var(--text-primary)] whitespace-nowrap ${hIdx === el.headers.length - 1 ? "" : "border-r border-[var(--border)]"}`}
                        style={{ textAlign: el.alignments[hIdx] || "left" }}
                      >
                        {renderContentWithBreaks(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {el.rows.map((row: string[], rIdx: number) => (
                    <tr
                      key={rIdx}
                      class={`border-b border-[var(--border)] last:border-b-0 ${rIdx % 2 === 1 ? "bg-[var(--surface-2)]" : "bg-transparent"}`}
                    >
                      {row.map((cell: string, cIdx: number) => (
                        <td
                          key={cIdx}
                          class={`px-2.5 py-1.5 text-[var(--text-primary)] align-top ${cIdx === row.length - 1 ? "" : "border-r border-[var(--border)]"}`}
                          style={{ textAlign: el.alignments[cIdx] || "left" }}
                        >
                          {renderContentWithBreaks(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        if (el.type === "spacer") {
          return <div key={idx} class="h-1" />;
        }
        return <p key={idx} class="m-0 text-[var(--text-primary)] select-text">{renderContentWithBreaks(el.content)}</p>;
      })}
    </div>
  );
});

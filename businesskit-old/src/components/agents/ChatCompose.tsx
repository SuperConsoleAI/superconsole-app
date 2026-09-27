// src/components/agents/ChatCompose.tsx
// Cloud/hosted AI compose box — used when selectedProvider is NOT a CLI provider.
// Contains: slash button, attach, model pill, effort pill, auto mode, textarea, send/stop.
// The box border + bg comes from the parent .agent-input-container class in AgentChatSidebar.

import {
  component$,
  $,
  useStylesScoped$,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuPlus,
  LuSquare,
  LuArrowUp,
  LuSparkles,
  LuChevronDown,
  LuZap,
  LuShield,
  LuMessageSquare,
  LuImage,
  LuX,
} from "@qwikest/icons/lucide";
import { ProviderIcon } from "~/components/common/ProviderIcon";
import { getModelDisplayName, modelSupportsReasoning } from "~/lib/agent-config";

const STYLES = `
  .chat-textarea {
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
    width: 100%;
  }
  .chat-textarea::placeholder { color: var(--text-muted); }
`;

import { CommandSelector } from "./CommandSelector";

export interface ChatComposeProps {
  inputValue: Signal<string>;
  isStreaming: Signal<boolean>;
  attachedFile: Signal<{ name: string; type: string; previewUrl?: string; dataBase64?: string } | null>;
  fileInputId: string;
  messagesEndRef?: Signal<HTMLDivElement | undefined>;
  selectedModel: Signal<string>;
  selectedProvider: Signal<string>;
  thinkingEnabled: Signal<boolean>;
  reasoningEffort: Signal<"low" | "medium" | "high" | "extra" | "max">;
  autoMode: Signal<"auto" | "ask" | "off">;
  textareaRef?: Signal<HTMLTextAreaElement | undefined>;
  slashMenuOpen?: Signal<boolean>;
  slashTab?: Signal<string>;
  onSelectCommand$?: PropFunction<(cmdSlash: string, cmdId: string) => void>;
  onToggleSlash$: PropFunction<() => void>;
  onToggleModelSwitcher$: PropFunction<() => void>;
  onToggleEffort$: PropFunction<() => void>;
  onToggleAuto$: PropFunction<() => void>;
  onSend$: PropFunction<() => void>;
  onStop$: PropFunction<() => void>;
  onInput$: PropFunction<(value: string) => void>;
  onAutoDetectDomain$: PropFunction<(value: string) => void>;
  onClearFile$: PropFunction<() => void>;
}

export const ChatCompose = component$<ChatComposeProps>((props) => {
  useStylesScoped$(STYLES);

  const {
    inputValue, isStreaming, attachedFile,
    messagesEndRef, selectedModel, selectedProvider,
    thinkingEnabled, reasoningEffort, autoMode, fileInputId,
  } = props;

  const effortLabel =
    reasoningEffort.value === "low" ? "Low"
    : reasoningEffort.value === "extra" ? "Extra"
    : reasoningEffort.value === "max" ? "Max"
    : reasoningEffort.value === "high" ? "High"
    : "Medium";

  return (
    <>
      {/* Reusable Command Selector popover */}
      {props.slashMenuOpen && props.slashTab && props.onSelectCommand$ && (
        <CommandSelector
          isOpen={props.slashMenuOpen}
          slashTab={props.slashTab}
          onSelectCommand$={props.onSelectCommand$}
        />
      )}

      {/* Attached file chip */}
      {attachedFile.value && (
        <div style="display:inline-flex;align-items:center;gap:0.375rem;padding:2px 8px;border-radius:0.375rem;background:var(--surface-3);border:1px solid var(--border);width:max-content;max-width:100%;">
          <LuImage style="width:0.75rem;height:0.75rem;color:var(--accent);flex-shrink:0;" />
          <span style="font-size:0.6875rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px;">
            {attachedFile.value.name}
          </span>
          <button type="button" onClick$={props.onClearFile$}
            style="background:none;border:none;cursor:pointer;padding:0;display:flex;align-items:center;color:var(--text-secondary);">
            <LuX style="width:0.75rem;height:0.75rem;" />
          </button>
        </div>
      )}

      {/* Textarea */}
      <textarea
        ref={props.textareaRef}
        value={inputValue.value}
        onFocus$={$((_, el) => {
          setTimeout(() => {
            el.scrollIntoView({ block: "nearest", behavior: "smooth" });
            if (messagesEndRef?.value) messagesEndRef.value.scrollIntoView({ behavior: "smooth" });
          }, 150);
        })}
        onInput$={$((e) => {
          const t = e.target as HTMLTextAreaElement;
          props.onInput$(t.value);
          props.onAutoDetectDomain$(t.value);
          if (t.value === "/") props.onToggleSlash$();
          t.style.height = "auto";
          t.style.height = `${Math.min(Math.max(t.scrollHeight, 36), 220)}px`;
        })}
        onKeyDown$={$((e) => {
          // eslint-disable-next-line qwik/no-async-prevent-default
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); props.onSend$(); }
        })}
        placeholder="Ask anything or command your business agent…"
        rows={1}
        disabled={isStreaming.value}
        class="chat-textarea"
      />

      {/* Control bar */}
      <div style="display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding-top:0.25rem;">
        <div style="display:flex;align-items:center;gap:0.375rem;flex-wrap:nowrap;overflow-x:auto;">

          {/* / Slash */}
          <button type="button" data-agent-trigger="true" onClick$={props.onToggleSlash$}
            title="Slash commands (/)"
            style="height:21px;width:21px;min-height:21px;min-width:21px;max-height:21px;max-width:21px;border-radius:0.25rem;background:var(--surface-3);border:1px solid var(--border);color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-sizing:border-box;font-weight:600;font-size:0.8125rem;line-height:1;"
          >
            <span>/</span>
          </button>

          {/* + Attach */}
          <label for={fileInputId} title="Attach file or image"
            style="height:21px;width:21px;min-height:21px;min-width:21px;max-height:21px;max-width:21px;border-radius:0.25rem;background:var(--surface-3);border:1px solid var(--border);color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0;box-sizing:border-box;user-select:none;"
          >
            <LuPlus style="width:0.8125rem;height:0.8125rem;pointer-events:none;" />
          </label>

          {/* Model pill */}
          <button type="button" data-agent-trigger="true" onClick$={props.onToggleModelSwitcher$}
            title="Switch AI Model"
            style="height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.3rem;padding:0 6px;border-radius:0.25rem;background:var(--surface-3);border:1px solid var(--border);font-size:0.6875rem;font-weight:500;color:var(--text-primary);cursor:pointer;box-sizing:border-box;line-height:1;"
          >
            <ProviderIcon model={selectedModel.value} provider={selectedProvider.value} size="0.75rem" />
            <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:115px;">{getModelDisplayName(selectedModel.value)}</span>
            <LuChevronDown style="width:0.625rem;height:0.625rem;opacity:0.6;flex-shrink:0;" />
          </button>

          {/* Effort pill */}
          {modelSupportsReasoning(selectedModel.value, selectedProvider.value) && (
            <button type="button" data-agent-trigger="true" onClick$={props.onToggleEffort$}
              title="Set Reasoning Effort"
              style="height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.25rem;padding:0 6px;border-radius:0.25rem;background:var(--surface-3);border:1px solid var(--border);font-size:0.6875rem;font-weight:500;color:var(--text-primary);cursor:pointer;box-sizing:border-box;line-height:1;white-space:nowrap;"
            >
              <LuSparkles style={`width:0.625rem;height:0.625rem;flex-shrink:0;${thinkingEnabled.value ? "color:var(--accent);" : "color:var(--text-tertiary);opacity:0.6;"}`} />
              <span>{effortLabel}</span>
              <LuChevronDown style="width:0.625rem;height:0.625rem;opacity:0.6;flex-shrink:0;" />
            </button>
          )}

          {/* Auto mode */}
          <button type="button" data-agent-trigger="true" onClick$={props.onToggleAuto$}
            title="Tool execution mode"
            style={`height:21px;min-height:21px;max-height:21px;display:inline-flex;align-items:center;gap:0.25rem;padding:0 6px;border-radius:0.25rem;background:var(--surface-3);border:1px solid var(--border);font-size:0.6875rem;font-weight:500;color:${
              autoMode.value === "auto"
                ? "var(--success)"
                : autoMode.value === "ask"
                ? "#f59e0b"
                : "var(--text-secondary)"
            };cursor:pointer;box-sizing:border-box;line-height:1;`}
          >
            {autoMode.value === "auto" ? <LuZap style="width:0.625rem;height:0.625rem;flex-shrink:0;" />
              : autoMode.value === "ask" ? <LuShield style="width:0.625rem;height:0.625rem;flex-shrink:0;" />
              : <LuMessageSquare style="width:0.625rem;height:0.625rem;flex-shrink:0;" />}
            <span>{autoMode.value === "auto" ? "Auto" : autoMode.value === "ask" ? "Ask First" : "Chat Only"}</span>
            <LuChevronDown style="width:0.625rem;height:0.625rem;opacity:0.6;flex-shrink:0;" />
          </button>
        </div>

        {/* Send / Stop */}
        {isStreaming.value ? (
          <button type="button" onClick$={props.onStop$} title="Stop"
            style="height:21px;width:21px;min-height:21px;min-width:21px;border-radius:0.25rem;background:var(--error);color:#ffffff;border:none;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;padding:0;box-sizing:border-box;">
            <LuSquare style="width:0.6875rem;height:0.6875rem;fill:#ffffff;" />
          </button>
        ) : (
          <button type="button" onClick$={props.onSend$}
            disabled={!inputValue.value.trim() && !attachedFile.value}
            title="Send message (Enter)"
            style={`height:21px;width:21px;min-height:21px;min-width:21px;border-radius:0.25rem;background:var(--text-primary);color:var(--surface-1);border:none;cursor:${!inputValue.value.trim() && !attachedFile.value ? "default" : "pointer"};display:inline-flex;align-items:center;justify-content:center;opacity:${!inputValue.value.trim() && !attachedFile.value ? "0.35" : "1"};transition:opacity 0.15s;padding:0;box-sizing:border-box;`}
          >
            <LuArrowUp style="width:0.75rem;height:0.75rem;stroke-width:2.5;" />
          </button>
        )}
      </div>
    </>
  );
});

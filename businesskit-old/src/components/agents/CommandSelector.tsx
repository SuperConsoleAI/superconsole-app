// src/components/agents/CommandSelector.tsx
// Reusable Command Selector popover used by ChatCompose and CliCompose.
// Features:
// - Freezed / Sticky, compact, horizontally scrollable category header tabs
// - Filtered commands list scoped to default + installed domains
// - Immediate insertion into composer via onSelectCommand$

import { component$, $, type Signal, type PropFunction, useStylesScoped$ } from "@builder.io/qwik";
import {
  LuPackage,
  LuPenTool,
  LuLaptop,
  LuCpu,
  LuUsers,
  LuLayers,
  LuFileText,
  LuSparkles,
  LuUserCheck,
  LuArrowRight,
} from "@qwikest/icons/lucide";
import { useAppContext } from "~/lib/app-context";
import {
  SLASH_CATEGORIES,
  SLASH_COMMANDS,
  isDomainAvailable,
  getCommandInputText,
} from "./agent-commands";

const STYLES = `
  .cmd-selector-popover {
    position: absolute;
    left: 0;
    bottom: calc(100% + 8px);
    width: 320px;
    max-width: calc(100vw - 2rem);
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.625rem;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.22);
    z-index: 100;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .cmd-selector-header {
    position: sticky;
    top: 0;
    z-index: 10;
    background: var(--surface-3);
    padding: 4px 6px;
    border-bottom: 1px solid var(--border);
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    overflow-y: hidden;
    white-space: nowrap;
    scrollbar-width: none;
    -ms-overflow-style: none;
    flex-shrink: 0;
  }

  .cmd-selector-header::-webkit-scrollbar {
    display: none;
  }

  .cmd-tab-btn {
    flex-shrink: 0;
    white-space: nowrap;
    padding: 0 0.55rem;
    height: 26px;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    transition: all 0.15s ease;
    text-transform: capitalize;
  }

  .cmd-tab-btn.active {
    background: var(--surface-2);
    color: var(--text-primary);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
    font-weight: 600;
  }

  .cmd-tab-btn.inactive {
    background: transparent;
    color: var(--text-secondary);
  }

  .cmd-tab-btn.inactive:hover {
    color: var(--text-primary);
    background: rgba(255, 255, 255, 0.04);
  }

  .cmd-list {
    overflow-y: auto;
    max-height: 240px;
    padding: 0.375rem;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .cmd-item-btn {
    width: 100%;
    text-align: left;
    padding: 0.45rem 0.55rem;
    border-radius: 0.375rem;
    border: 1px solid transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.625rem;
    transition: all 0.15s ease;
    background: transparent;
    color: var(--text-secondary);
    box-sizing: border-box;
  }

  .cmd-item-btn:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }
`;

export interface CommandSelectorProps {
  isOpen: Signal<boolean>;
  slashTab: Signal<string>;
  onSelectCommand$: PropFunction<(cmdSlash: string, cmdId: string) => void>;
  /** Optional custom styling override for popover wrapper */
  style?: string;
}

export const CommandSelector = component$<CommandSelectorProps>((props) => {
  useStylesScoped$(STYLES);

  if (!props.isOpen.value) return null;

  const appCtx = useAppContext();
  const installed = appCtx.installedApps.value;
  const availableCategories = SLASH_CATEGORIES
    .filter((c) => isDomainAvailable(c.id, installed))
    .sort((a, b) => {
      if (a.id === "system") return 1;
      if (b.id === "system") return -1;
      return 0;
    });

  // If current tab is not available, default to first available
  const activeTab = availableCategories.some((c) => c.id === props.slashTab.value)
    ? props.slashTab.value
    : availableCategories[0]?.id || "crm";

  const availableCommands = SLASH_COMMANDS.filter(
    (cmd) => cmd.category === activeTab && isDomainAvailable(cmd.category, installed)
  );

  return (
    <div
      data-agent-popover="true"
      class="cmd-selector-popover"
      style={props.style}
    >
      {/* Horizontally scrollable, compact, frozen/sticky category tabs header */}
      <div class="cmd-selector-header">
        {availableCategories.map((c) => {
          const isActive = activeTab === c.id;
          return (
            <button
              key={c.id}
              type="button"
              onClick$={$(() => (props.slashTab.value = c.id))}
              class={`cmd-tab-btn ${isActive ? "active" : "inactive"}`}
              title={c.name}
            >
              {c.id === "shop" ? (
                <LuPackage style="width:0.75rem;height:0.75rem;flex-shrink:0;" />
              ) : c.id === "content" ? (
                <LuPenTool style="width:0.75rem;height:0.75rem;flex-shrink:0;" />
              ) : c.id === "pages" ? (
                <LuLaptop style="width:0.75rem;height:0.75rem;flex-shrink:0;" />
              ) : c.id === "system" ? (
                <LuCpu style="width:0.75rem;height:0.75rem;flex-shrink:0;" />
              ) : (
                <LuUsers style="width:0.75rem;height:0.75rem;flex-shrink:0;" />
              )}
              <span>{c.name}</span>
            </button>
          );
        })}
      </div>

      {/* Commands List for Active Category */}
      <div class="cmd-list">
        {availableCommands.length === 0 ? (
          <div style="padding: 1rem; text-align: center; font-size: 0.75rem; color: var(--text-tertiary);">
            No commands available
          </div>
        ) : (
          availableCommands.map((cmd) => (
            <button
              key={cmd.id}
              type="button"
              onClick$={$(() => {
                props.isOpen.value = false;
                props.onSelectCommand$(getCommandInputText(cmd.slash), cmd.id);
              })}
              class="cmd-item-btn"
            >
              <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;flex:1;">
                <div style="display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-shrink:0;">
                  {cmd.category === "shop" ? (
                    cmd.id.includes("invoice") ? (
                      <LuFileText style="width:0.875rem;height:0.875rem;" />
                    ) : cmd.id.includes("adjust") ? (
                      <LuLayers style="width:0.875rem;height:0.875rem;" />
                    ) : (
                      <LuPackage style="width:0.875rem;height:0.875rem;" />
                    )
                  ) : cmd.category === "content" ? (
                    cmd.id.includes("post") ? (
                      <LuPenTool style="width:0.875rem;height:0.875rem;" />
                    ) : (
                      <LuSparkles style="width:0.875rem;height:0.875rem;" />
                    )
                  ) : cmd.category === "pages" ? (
                    <LuLaptop style="width:0.875rem;height:0.875rem;" />
                  ) : cmd.category === "system" ? (
                    <LuCpu style="width:0.875rem;height:0.875rem;" />
                  ) : (
                    <LuUserCheck style="width:0.875rem;height:0.875rem;" />
                  )}
                </div>

                <div style="display:flex;flex-direction:column;min-width:0;flex:1;gap:1px;">
                  <span style="font-size:0.75rem;font-weight:500;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    {cmd.name}
                  </span>
                  <span style="font-size:0.6875rem;color:var(--text-secondary);opacity:0.8;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                    {cmd.desc}
                  </span>
                </div>
              </div>

              <LuArrowRight style="width:0.75rem;height:0.75rem;color:var(--text-secondary);opacity:0.4;flex-shrink:0;" />
            </button>
          ))
        )}
      </div>
    </div>
  );
});

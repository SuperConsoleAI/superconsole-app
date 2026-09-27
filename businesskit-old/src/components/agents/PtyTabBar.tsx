// src/components/agents/PtyTabBar.tsx
// PTY session tab bar — shown in the agent sidebar replacing the header when in terminal mode.
// Each tab = one running CLI session. [+] opens new-terminal dropdown.

import {
  component$,
  useStylesScoped$,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuX, LuPlus } from "@qwikest/icons/lucide";
import { ProviderIcon } from "~/components/common/ProviderIcon";

const STYLES = `
  .pty-tab-bar-wrap {
    display: flex;
    align-items: stretch;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    flex: 1;
    min-width: 0;
    background: var(--surface-2);
  }
  .pty-tab-bar-wrap::-webkit-scrollbar { display: none; }

  .pty-tab {
    display: inline-flex;
    align-items: center;
    gap: 0.3125rem;
    padding: 0 0.625rem;
    height: 100%;
    border: none;
    border-right: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--text-secondary);
    white-space: nowrap;
    flex-shrink: 0;
    position: relative;
    box-sizing: border-box;
    outline: none;
    /* No transition/animation on hover */
  }
  .pty-tab:first-child {
    border-left: none;
  }
  .pty-tab:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }
  .pty-tab.active {
    background: var(--surface-1);
    color: var(--text-primary);
    font-weight: 600;
  }
  /* 1px highlight at the bottom of active tab */
  .pty-tab.active::before {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1px;
    background: var(--accent, #3b82f6);
  }
  .pty-tab.exited {
    opacity: 0.45;
  }

  .pty-tab-close {
    width: 14px;
    height: 14px;
    min-width: 14px;
    border-radius: 0.2rem;
    background: none;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    padding: 0;
    margin-left: 2px;
  }
  .pty-tab-close:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }

  .pty-tab-add {
    height: 100%;
    min-width: 32px;
    padding: 0 0.375rem;
    border: none;
    border-left: 1px solid var(--border);
    background: var(--surface-2);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
    flex-shrink: 0;
  }
  .pty-tab-add:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }
`;

export interface PtyTab {
  id: string;
  cli: "claude" | "codex" | "antigravity";
  provider: string;
  label: string;
  isExited: boolean;
  model?: string;
}

export interface PtyTabBarProps {
  tabs: Signal<PtyTab[]>;
  activeTabId: Signal<string>;
  onSelectTab$: PropFunction<(id: string) => void>;
  onCloseTab$: PropFunction<(id: string) => void>;
  onAddTab$: PropFunction<() => void>;
}

export const PtyTabBar = component$<PtyTabBarProps>((props) => {
  useStylesScoped$(STYLES);
  const { tabs, activeTabId } = props;

  return (
    <>
      <div class="pty-tab-bar-wrap">
        {tabs.value.map((tab) => (
          <button
            key={tab.id}
            type="button"
            class={`pty-tab${tab.id === activeTabId.value ? " active" : ""}${tab.isExited ? " exited" : ""}`}
            onClick$={() => props.onSelectTab$(tab.id)}
          >
            <ProviderIcon provider={tab.provider} size="0.825rem" />
            <span>{tab.label}</span>
            <button
              type="button"
              class="pty-tab-close"
              title={`Close ${tab.label}`}
              onClick$={(e) => {
                e.stopPropagation();
                props.onCloseTab$(tab.id);
              }}
            >
              <LuX style="width:0.675rem;height:0.675rem;" />
            </button>
          </button>
        ))}
      </div>

      <button
        type="button"
        class="pty-tab-add"
        title="Open new terminal session"
        onClick$={props.onAddTab$}
      >
        <LuPlus style="width:0.975rem;height:0.975rem;" />
      </button>
    </>
  );
});

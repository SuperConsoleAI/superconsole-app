// src/components/agents/AgentTabs.tsx
// Unified navigation tabs for AI Agents & Agent Analytics.
// Displayed in AppTopbar on desktop and tablet breakpoints.

import { component$, useStyles$, useVisibleTask$, $ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import { LuBot, LuBarChart3, LuTerminal, LuWrench } from "@qwikest/icons/lucide";
import { MobileDock } from "~/components/MobileDock";
import { getAgentAnalytics, listChatSessions, listAgentCommands, listAgentTools } from "~/lib/ipc";
import {
  getCachedAgentAnalytics,
  setCachedAgentAnalytics,
  getCachedSessionsList,
  setCachedSessionsList,
  getCachedCommandsList,
  setCachedCommandsList,
  getCachedToolsList,
  setCachedToolsList,
} from "~/lib/agent-config";

const TAB_STYLES = `
  .tabs-container {
    display: flex;
  }
  .tabs-desktop {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    height: 32px;
    box-sizing: border-box;
    align-items: center;
  }
  @media (max-width: 768px) {
    .tabs-desktop {
      display: none !important;
    }
  }
`;

const TAB_ITEMS = [
  { id: "agents", label: "Agents", href: "/dashboard/agents/" },
  { id: "commands", label: "Commands", href: "/dashboard/agents/commands/" },
  { id: "tools", label: "Tools", href: "/dashboard/agents/tools/" },
  { id: "analytics", label: "Analytics", href: "/dashboard/agents/analytics/" },
] as const;

export const AgentTabs = component$(() => {
  useStyles$(TAB_STYLES);
  const loc = useLocation();
  const path = loc.url.pathname;

  // Pre-warm analytics, sessions, commands & tools immediately as soon as AgentTabs mounts in topbar
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    if (!getCachedAgentAnalytics()) {
      getAgentAnalytics().then((data) => {
        setCachedAgentAnalytics(data);
      }).catch(() => {});
    }
    if (!getCachedSessionsList()) {
      listChatSessions().then((list) => {
        setCachedSessionsList(list);
      }).catch(() => {});
    }
    if (!getCachedCommandsList()) {
      listAgentCommands().then((cmds) => {
        setCachedCommandsList(cmds);
      }).catch(() => {});
    }
    if (!getCachedToolsList()) {
      listAgentTools().then((tools) => {
        setCachedToolsList(tools);
      }).catch(() => {});
    }
  });

  const prefetchData = $((href: string) => {
    if (href === "/dashboard/agents/analytics/") {
      if (!getCachedAgentAnalytics()) {
        getAgentAnalytics().then((data) => {
          setCachedAgentAnalytics(data);
        }).catch(() => {});
      }
    } else if (href === "/dashboard/agents/") {
      if (!getCachedSessionsList()) {
        listChatSessions().then((list) => {
          setCachedSessionsList(list);
        }).catch(() => {});
      }
    } else if (href === "/dashboard/agents/commands/") {
      if (!getCachedCommandsList()) {
        listAgentCommands().then((cmds) => {
          setCachedCommandsList(cmds);
        }).catch(() => {});
      }
    } else if (href === "/dashboard/agents/tools/") {
      if (!getCachedToolsList()) {
        listAgentTools().then((tools) => {
          setCachedToolsList(tools);
        }).catch(() => {});
      }
    }
  });

  const getIsActive = (href: string) => {
    if (href === "/dashboard/agents/") {
      return path === "/dashboard/agents/" || path === "/dashboard/agents";
    }
    return path === href || (path.startsWith(href) && href !== "/dashboard/agents/");
  };

  const tabStyle = (isActive: boolean) =>
    `padding: 0 1rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500; text-decoration: none; text-transform: capitalize; display: flex; align-items: center; height: 100%; box-sizing: border-box; transition: background 0.15s; ${
      isActive
        ? "background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
        : "background: transparent; color: var(--text-secondary);"
    }`;

  return (
    <div class="tabs-container">
      {/* Desktop & Tablet Tabs Bar */}
      <div class="tabs-desktop">
        {TAB_ITEMS.map((t) => {
          const isActive = getIsActive(t.href);
          const href = t.href;
          return (
            <Link
              key={href}
              href={href}
              onMouseEnter$={() => prefetchData(href)}
              style={tabStyle(isActive)}
            >
              <span style="display: flex; align-items: center; gap: 0.5rem;">
                {t.id === "agents" ? (
                  <LuBot style="width: 1rem; height: 1rem;" />
                ) : t.id === "commands" ? (
                  <LuTerminal style="width: 1rem; height: 1rem;" />
                ) : t.id === "tools" ? (
                  <LuWrench style="width: 1rem; height: 1rem;" />
                ) : (
                  <LuBarChart3 style="width: 1rem; height: 1rem;" />
                )}
                {t.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Mobile Floating macOS Dock Slider (Shown on Commands, Tools, and Analytics pages) */}
      {(path.includes("/analytics") || path.includes("/commands") || path.includes("/tools")) && (
        <MobileDock>
          <div class="tabs-dock-slider">
            {TAB_ITEMS.map((t) => {
              const isActive = getIsActive(t.href);
              const href = t.href;
              return (
                <Link
                  key={href}
                  href={href}
                  class={`dock-tab-item ${isActive ? "active" : ""}`}
                >
                  {t.id === "agents" ? (
                    <LuBot style="width: 0.9375rem; height: 0.9375rem; flex-shrink: 0;" />
                  ) : t.id === "commands" ? (
                    <LuTerminal style="width: 0.9375rem; height: 0.9375rem; flex-shrink: 0;" />
                  ) : t.id === "tools" ? (
                    <LuWrench style="width: 0.9375rem; height: 0.9375rem; flex-shrink: 0;" />
                  ) : (
                    <LuBarChart3 style="width: 0.9375rem; height: 0.9375rem; flex-shrink: 0;" />
                  )}
                  <span>{t.label}</span>
                </Link>
              );
            })}
          </div>
        </MobileDock>
      )}
    </div>
  );
});

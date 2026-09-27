// src/components/account/AccountTabs.tsx
//
// Sub-navigation tabs for all Account module routes:
//   Accounts   → /dashboard/shop/accounts/
//   Journal    → /dashboard/shop/accounts/journal/
//   Bank       → /dashboard/shop/accounts/bank/
//   Expenses   → /dashboard/shop/accounts/expenses/
//   Reports    → /dashboard/shop/accounts/reports/
//
// Follows the exact same pattern as ProductTabs.tsx:
//   - Desktop pill tabs inside a surface-3 pill container
//   - Mobile dropdown with native details/summary
//   - Uses design-system CSS variables — works in light AND dark mode
//   - No server$, no fetch(). Pure routing + UI.

import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import {
  LuBookOpen,
  LuScroll,
  LuLandmark,
  LuReceipt,
  LuBarChart3,
} from "@qwikest/icons/lucide";
import { MobileDock } from "~/components/MobileDock";

const TAB_STYLES = `
  .at-container {
    display: flex;
  }
  .at-desktop {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    height: 32px;
    box-sizing: border-box;
    align-items: center;
  }
`;

const tabItemStyle = (isActive: boolean) =>
  `padding: 0 0.875rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500;
   text-decoration: none; display: flex; align-items: center; gap: 0.4rem; height: 100%;
   box-sizing: border-box; transition: background 0.15s, color 0.15s; white-space: nowrap;
   ${isActive
     ? "background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
     : "background: transparent; color: var(--text-secondary);"
   }`;

const TABS = [
  { label: "Accounts",  href: "/dashboard/accounts/",           icon: LuBookOpen,  soon: false },
  { label: "Journal",   href: "/dashboard/accounts/journal/",   icon: LuScroll,    soon: false },
  { label: "Bank",      href: "/dashboard/accounts/bank/",      icon: LuLandmark,  soon: false },
  { label: "Expenses",  href: "/dashboard/accounts/expenses/",  icon: LuReceipt,   soon: false },
  { label: "Reports",   href: "/dashboard/accounts/reports/",   icon: LuBarChart3, soon: false },
] as const;

export const AccountTabs = component$(() => {
  useStyles$(TAB_STYLES);

  const loc        = useLocation();
  const path       = loc.url.pathname.replace(/\/$/, "");

  const isActive = (href: string) => {
    const clean = href.replace(/\/$/, "");
    if (clean === "/dashboard/accounts") {
      return path === clean;
    }
    return path === clean || path.startsWith(clean + "/");
  };

  return (
    <div class="at-container">
      {/* Desktop pill tabs */}
      <div class="at-desktop">
        {TABS.map(tab => {
          const active = isActive(tab.href);
          const Icon   = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} style={tabItemStyle(active)}>
              <Icon style="width:0.875rem;height:0.875rem;" />
              {tab.label}
            </Link>
          );
        })}
      </div>

      {/* Mobile Floating macOS Dock Slider */}
      <MobileDock>
        <div class="tabs-dock-slider">
          {TABS.map(tab => {
            const active = isActive(tab.href);
            const Icon   = tab.icon;
            return (
              <Link
                key={tab.href}
                href={tab.href}
                class={`dock-tab-item ${active ? "active" : ""}`}
              >
                <Icon style="width:0.9375rem;height:0.9375rem;flex-shrink:0;" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </div>
      </MobileDock>
    </div>
  );
});

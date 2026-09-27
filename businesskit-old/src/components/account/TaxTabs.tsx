// src/components/account/TaxTabs.tsx
//
// Sub-navigation tabs for the Tax module — all 6 always visible.
// Overview · Settings · GST Returns · E-Invoice · E-Way Bill · TDS/TCS
//
// No regime-conditional hiding — all tabs are always accessible.
// Individual pages handle the "not configured" state themselves.
// Same pill-style pattern as ProductTabs / AccountTabs.

import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import {
  LuLayoutDashboard,
  LuSettings,
  LuClipboardList,
  LuFileText,
  LuTruck,
  LuScissors,
} from "@qwikest/icons/lucide";
import { MobileDock } from "~/components/MobileDock";

const TAB_STYLES = `
  .tt-container { display: flex; }
  .tt-desktop {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    height: 32px;
    box-sizing: border-box;
    align-items: center;
  }
  .tt-sep {
    width: 1px;
    height: 18px;
    background: var(--border);
    margin: 0 0.125rem;
    flex-shrink: 0;
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

const BASE_TABS = [
  { label: "Overview",  href: "/dashboard/tax/",          icon: LuLayoutDashboard },
  { label: "Settings",  href: "/dashboard/tax/settings/", icon: LuSettings        },
] as const;

const COMPLIANCE_TABS = [
  { label: "GST Returns", href: "/dashboard/tax/gst/",      icon: LuClipboardList },
  { label: "E-Invoice",   href: "/dashboard/tax/einvoice/", icon: LuFileText      },
  { label: "E-Way Bill",  href: "/dashboard/tax/eway/",     icon: LuTruck         },
  { label: "TDS / TCS",  href: "/dashboard/tax/tds/",      icon: LuScissors      },
] as const;

const ALL_TABS = [...BASE_TABS, ...COMPLIANCE_TABS];

export const TaxTabs = component$(() => {
  useStyles$(TAB_STYLES);

  const loc        = useLocation();
  const path       = loc.url.pathname.replace(/\/$/, "");

  const isActive = (href: string) => {
    const clean = href.replace(/\/$/, "");
    if (clean === "/dashboard/tax") return path === clean;
    return path === clean || path.startsWith(clean + "/");
  };

  return (
    <div class="tt-container">
      {/* Desktop pill tabs */}
      <div class="tt-desktop">
        {/* Base: Overview + Settings */}
        {BASE_TABS.map(tab => {
          const active = isActive(tab.href);
          const Icon   = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} style={tabItemStyle(active)}>
              <Icon style="width:0.875rem;height:0.875rem;" />
              {tab.label}
            </Link>
          );
        })}

        {/* Separator */}
        <div class="tt-sep" />

        {/* Compliance: GST Returns · E-Invoice · E-Way Bill · TDS/TCS */}
        {COMPLIANCE_TABS.map(tab => {
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
          {ALL_TABS.map(tab => {
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

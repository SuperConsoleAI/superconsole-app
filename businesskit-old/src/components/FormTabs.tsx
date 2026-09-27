// src/components/FormTabs.tsx
//
// WHAT:  Tab bar for /dashboard/forms/* routes — shown in AppTopbar center slot.
//        Copied from FormsMenuBar.tsx in businesskit-web.
//
// TABS (on detail routes only — when an [id] is in the path):
//   Build       → /dashboard/forms/[id]/edit
//   Submissions → /dashboard/forms/[id]/submissions
//   Summary     → /dashboard/forms/[id]/summary
//   Analytics   → /dashboard/forms/[id]/analytics
//
// On the list page (/dashboard/forms/) only the "Forms" label is shown (no tabs).
//
// HOW:  Same pill + mobile dropdown pattern as JobTabs / StoreTabs.

import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import {
  LuFileText, LuWrench, LuInbox, LuPieChart, LuBarChart3,
} from "@qwikest/icons/lucide";
import { MobileDock } from "~/components/MobileDock";

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
`;

const DETAIL_TABS = [
  { id: "forms",       label: "Forms",        icon: LuFileText, seg: ""            }, // back to list
  { id: "build",       label: "Build",        icon: LuWrench,   seg: "edit"        },
  { id: "submissions", label: "Submissions",  icon: LuInbox,    seg: "submissions" },
  { id: "summary",     label: "Summary",      icon: LuPieChart, seg: "summary"     },
  { id: "analytics",   label: "Analytics",    icon: LuBarChart3,seg: "analytics"   },
] as const;

export const FormTabs = component$(() => {
  useStyles$(TAB_STYLES);
  const loc = useLocation();
  const path = loc.url.pathname;

  // Extract form ID from path: /dashboard/forms/<id>/<segment>
  const segments = path.replace(/^\/dashboard\/forms\/?/, "").split("/").filter(Boolean);
  const formId   = segments[0] ?? null;
  const isOnDetail = !!formId && path !== "/dashboard/forms" && !path.endsWith("/forms/");

  const tabs = isOnDetail
    ? DETAIL_TABS.map((t) => ({
        label: t.label,
        href:  t.seg === "" ? "/dashboard/forms/" : `/dashboard/forms/${formId}/${t.seg}/`,
        icon:  t.icon,
        seg:   t.seg,
      }))
    : [{ label: "Forms", href: "/dashboard/forms/", icon: LuFileText, seg: "" }];

  const getIsActive = (href: string, seg: string) => {
    // "Forms" tab — active only when on the list page
    if (seg === "") return path === "/dashboard/forms" || path === "/dashboard/forms/";
    return path.includes(`/${seg}`) || path.includes(`/${seg}/`);
  };

  const tabStyle = (isActive: boolean) =>
    `padding: 0 1rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500;
     text-decoration: none; display: flex; align-items: center;
     height: 100%; box-sizing: border-box; transition: background 0.15s;
     ${isActive
       ? "background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
       : "background: transparent; color: var(--text-secondary);"
     }`;

  return (
    <div class="tabs-container">
      {/* Desktop pill */}
      <div class="tabs-desktop">
        {tabs.map((t) => {
          const isActive = getIsActive(t.href, t.seg);
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} style={tabStyle(isActive)}>
              <span style="display:flex;align-items:center;gap:0.5rem;">
                <Icon style="width:1rem;height:1rem;" /> {t.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Mobile Floating macOS Dock Slider */}
      <MobileDock>
        <div class="tabs-dock-slider">
          {tabs.map((t) => {
            const isActive = getIsActive(t.href, t.seg);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                class={`dock-tab-item ${isActive ? "active" : ""}`}
              >
                <Icon style="width:0.9375rem;height:0.9375rem;flex-shrink:0;" />
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </MobileDock>
    </div>
  );
});

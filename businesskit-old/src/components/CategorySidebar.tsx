/* eslint-disable @typescript-eslint/no-unused-vars */
// src/components/CategorySidebar.tsx
//
// WHAT:  Collapsible category navigation sidebar for /dashboard/* pages.
//        Exact port of businesskit-web CategorySidebar.tsx.
//
// HOW:   Fixed position: left=3rem (after AppSidebar), top=5rem (TitleBar 2rem + AppTopbar 3rem).
//        height = calc(100vh - 5rem) so it never overlaps either bar.
//        collapsed Signal owned by parent (dashboard/layout.tsx) — persists across nav.
//        link counts computed from allLinks.value keyed by category_id (= slug in Tauri).
//        onToggle$  → parent flips collapsed.
//        onManageCms$ → parent opens PageTypesModal.
//
// FLOW:
//   Parent layout.tsx → passes collapsed, allLinks, enabledCategories, onToggle$, onManageCms$
//   User clicks toggle chevron → onToggle$() → sidebar animates width 3rem ↔ 15rem
//   User clicks category → RouterLink → /dashboard/c/[slug] (or /dashboard/profile for links)
//   User clicks Manage CMS → onManageCms$() → PageTypesModal opens in parent

import { component$, useComputed$, type Signal, type PropFunction } from "@builder.io/qwik";
import { Link as RouterLink, useLocation } from "@builder.io/qwik-city";
import type { LinkRow } from "~/lib/types";
import {
  LuLink, LuWrench, LuBookOpen, LuCalendar, LuMusic, LuFilm,
  LuNewspaper, LuUser, LuShoppingBag, LuShirt, LuHelpCircle,
  LuRocket, LuRss, LuUsers, LuImage, LuStore, LuSettings,
  LuPanelLeftClose, LuPanelRightClose,
  LuHome, LuLayoutTemplate, LuPlus, LuGraduationCap,
} from "@qwikest/icons/lucide";
import { LuSocial } from "./LuSocial";

import { CATEGORY_GROUPS } from "~/components/PageTypesModal";

const ALL_CATEGORIES = Object.values(CATEGORY_GROUPS).flat();

export const CATEGORY_ICONS: Record<string, any> = Object.fromEntries(
  ALL_CATEGORIES.map((c) => [c.slug, c.icon])
);

const CATEGORY_ORDER = ALL_CATEGORIES.map((c) => c.slug);

// /dashboard/c/[slug]/ for everything — matches web static layout
const categoryRoute = (slug: string) => `/dashboard/c/${slug}/`;

// ── Width constants ───────────────────────────────────────────────────────────
export const SIDEBAR_WIDTH = { expanded: "14rem", collapsed: "var(--sidebar-collapsed-width, 3.6rem)" } as const;

// Fixed layout offsets (must match TitleBar + AppTopbar heights)
const TOP_OFFSET = "5rem"; // TitleBar(2rem) + AppTopbar(3rem)

// ── Props ─────────────────────────────────────────────────────────────────────
interface Props {
  collapsed: Signal<boolean>;
  allLinks: Signal<LinkRow[]>;
  enabledCategories: Signal<string[]>;
  onToggle$: PropFunction<() => void>;
  onManageCms$: PropFunction<() => void>;
}

// ── Component ─────────────────────────────────────────────────────────────────
export const CategorySidebar = component$<Props>(
  ({ collapsed, allLinks, enabledCategories, onToggle$, onManageCms$ }) => {
    const loc = useLocation();

    // Link count per category slug (category_id = slug in Tauri UserDB)
    const linkCounts = useComputed$(() => {
      const map: Record<string, number> = {};
      for (const l of allLinks.value) {
        const key = l.category_slug || l.category_id;
        map[key] = (map[key] ?? 0) + 1;
      }
      return map;
    });

    // Sorted enabled categories in canonical order
    const sortedEnabled = useComputed$(() => {
      const enabled = new Set(enabledCategories.value);
      return CATEGORY_ORDER.filter((s) => enabled.has(s) && s !== "about" && s !== "all");
    });

    const isCollapsed = collapsed.value;
    const w           = isCollapsed ? SIDEBAR_WIDTH.collapsed : SIDEBAR_WIDTH.expanded;
    const ToggleIcon  = isCollapsed ? LuPanelRightClose : LuPanelLeftClose;

    // Style atoms — exact match of web
    const r           = "0.5rem";
    const baseRow     = `display:flex;width:100%;align-items:center;gap:0.75rem;padding:0.5rem;border-radius:${r};transition:background-color 0.15s ease;`;
    const activeRow   = `${baseRow}background-color:var(--accent-soft);color:var(--text-primary);`;
    const iconWrap    = `padding:0.5rem;border-radius:${r};transition:background-color 0.15s ease;`;
    const iconActive  = `${iconWrap}background-color:var(--accent-soft);color:var(--text-primary);`;
    const muted       = "color:var(--text-secondary);text-decoration:none;display:block;";

    const isActive = (path: string) =>
      loc.url.pathname === path || loc.url.pathname.startsWith(path + "/");

    return (
      <aside style={`
        position: fixed;
        left: var(--sidebar-width);
        top: var(--titlebar-height, 2.1rem);
        display: flex;
        flex-direction: column;
        width: ${w};
        min-width: ${w};
        flex-shrink: 0;
        height: calc(100vh - var(--titlebar-height, 2.1rem));
        height: calc(100dvh - var(--titlebar-height, 2.1rem));
        background: var(--surface-2);
        border-right: 1px solid var(--border);
        overflow: hidden;
        z-index: 20;
        transition: width 0.2s ease, min-width 0.2s ease;
      `}>

        {/* ── Toggle button row ── */}
        <div style={`
          display: flex;
          align-items: center;
          justify-content: ${isCollapsed ? "center" : "space-between"};
          height: calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));
          min-height: calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));
          max-height: calc(var(--header-box-height, 3.4rem) + env(safe-area-inset-top, 0px));
          padding-top: env(safe-area-inset-top, 0px);
          flex-shrink: 0;
          border-bottom: 1px solid var(--border);
          padding-left: ${isCollapsed ? "0.5rem" : "1.5rem"};
          padding-right: ${isCollapsed ? "0.5rem" : "1.5rem"};
          box-sizing: border-box;
        `}>
          {!isCollapsed && (
            <h1 style="color:var(--text-primary);font-size:1.125rem;font-weight:600;margin:0;">
              Links + CMS
            </h1>
          )}
          <button
            type="button"
            onClick$={onToggle$}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            style="background:transparent;border:none;padding:0.35rem;cursor:pointer;color:var(--text-secondary);display:flex;align-items:center;justify-content:center;border-radius:0.375rem;transition:background 0.15s ease;"
          >
            <ToggleIcon style="width:1rem;height:1rem;display:block;" />
          </button>
        </div>

        {/* ── Nav list ── */}
        <div style={`flex:1;overflow-y:auto;padding:${isCollapsed ? "0.5rem 0 calc(3.5rem + env(safe-area-inset-bottom, 0px))" : "0.5rem 0.75rem calc(3.5rem + env(safe-area-inset-bottom, 0px))"};box-sizing:border-box;`}>
          <nav style="display:flex;flex-direction:column;gap:0.125rem;">

            {/* ── Enabled category links ── */}
            {sortedEnabled.value.map((slug) => {
              const Icon    = CATEGORY_ICONS[slug] ?? LuLink;
              const count   = linkCounts.value[slug] ?? 0;
              const href    = categoryRoute(slug);
              const active  = isActive(href);
              const label   = slug === "feed" ? "Feed (Social)" : slug.charAt(0).toUpperCase() + slug.slice(1);

              return (
                <RouterLink key={slug} href={href} style={muted} title={label}>
                  {isCollapsed ? (
                    <div style="display:flex;align-items:center;justify-content:center;width:100%;">
                      <span style={active ? iconActive : iconWrap}>
                        <Icon style="width:1rem;height:1rem;display:block;" />
                      </span>
                    </div>
                  ) : (
                    <div style={active ? activeRow : baseRow}>
                      <Icon style="width:1rem;height:1rem;flex-shrink:0;" />
                      <span style={`flex:1;font-size:0.875rem;font-weight:500;color:${active ? "var(--text-primary)" : "var(--text-secondary)"};`}>
                        {label}
                      </span>
                      <span style={`
                        min-width:1.25rem;height:1.25rem;padding:0 0.2rem;
                        display:inline-flex;align-items:center;justify-content:center;
                        border-radius:0.375rem;font-size:0.6875rem;font-weight:600;
                        background:${active ? "var(--accent-soft)" : "var(--badge-background)"};
                        color:${active ? "var(--text-primary)" : "var(--badge-text)"};
                      `}>
                        {count}
                      </span>
                    </div>
                  )}
                </RouterLink>
              );
            })}

            {/* ── Divider ── */}
            <div style={`height:1px;background:var(--border);margin:${isCollapsed ? "0.5rem 0" : "0.5rem 0"};`} />

            {/* ── All page ── */}
            <RouterLink href="/dashboard/c/all/" style={muted} title="All">
              {isCollapsed ? (
                <div style="display:flex;align-items:center;justify-content:center;width:100%;">
                  <span style={isActive("/dashboard/c/all") ? iconActive : iconWrap}>
                    <LuHome style="width:1rem;height:1rem;display:block;" />
                  </span>
                </div>
              ) : (
                <div style={isActive("/dashboard/c/all") ? activeRow : baseRow}>
                  <LuHome style="width:1rem;height:1rem;flex-shrink:0;" />
                  <span style={`flex:1;font-size:0.875rem;font-weight:500;color:${isActive("/dashboard/c/all") ? "var(--text-primary)" : "var(--text-secondary)"};`}>All</span>
                </div>
              )}
            </RouterLink>

            {/* ── About ── */}
            <RouterLink href="/dashboard/c/about/" style={muted} title="About">
              {isCollapsed ? (
                <div style="display:flex;align-items:center;justify-content:center;width:100%;">
                  <span style={isActive("/dashboard/c/about") ? iconActive : iconWrap}>
                    <LuUser style="width:1rem;height:1rem;display:block;" />
                  </span>
                </div>
              ) : (
                <div style={isActive("/dashboard/c/about") ? activeRow : baseRow}>
                  <LuUser style="width:1rem;height:1rem;flex-shrink:0;" />
                  <span style={`flex:1;font-size:0.875rem;font-weight:500;color:${isActive("/dashboard/c/about") ? "var(--text-primary)" : "var(--text-secondary)"};`}>About</span>
                </div>
              )}
            </RouterLink>

            {/* ── Manage CMS — opens PageTypesModal in parent ── */}
            <button
              type="button"
              onClick$={onManageCms$}
              title="Manage CMS — enable / disable categories"
              style={`
                margin-top:0.25rem;
                background:transparent;
                border:1px solid var(--border);
                border-radius:${r};
                cursor:pointer;
                padding:0.625rem 0.5rem;
                width:100%;
                text-align:left;
                color:var(--text-secondary);
                transition:border-color 0.15s ease, color 0.15s ease;
              `}
            >
              {isCollapsed ? (
                <div style="display:flex;align-items:center;justify-content:center;width:100%;">
                  <LuPlus style="width:1rem;height:1rem;display:block;" />
                </div>
              ) : (
                <div style="display:flex;align-items:center;justify-content:space-between;width:100%;gap:0.5rem;">
                  <span style="font-size:0.875rem;font-weight:500;">Manage CMS</span>
                  <span style="
                    width:1.25rem;height:1.25rem;
                    display:inline-flex;align-items:center;justify-content:center;
                    font-size:0.75rem;font-weight:700;
                    background:var(--button-primary-bg);
                    color:var(--button-primary-text);
                    border-radius:0.25rem;
                    flex-shrink:0;
                  ">+</span>
                </div>
              )}
            </button>

          </nav>
        </div>
      </aside>
    );
  }
);

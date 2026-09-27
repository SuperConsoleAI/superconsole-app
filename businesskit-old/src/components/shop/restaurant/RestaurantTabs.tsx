// src/components/shop/restaurant/RestaurantTabs.tsx
//
// WHAT:  Sub-navigation tabs for the Shop → Restaurant section.
//        Follows exact pill-style desktop tabs + MobileDock pattern as ProductTabs.tsx.

import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import {
  LuLayoutGrid,
  LuUtensils,
  LuSquare,
  LuReceipt,
  LuFlame,
  LuBookOpen,
  LuBarChart3,
  LuCalendarDays,
} from "@qwikest/icons/lucide";
import { MobileDock } from "~/components/MobileDock";
import { ShopMoreMenu } from "~/components/shop/ShopMoreMenu";

const TAB_STYLES = `
  .rt-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .rt-desktop {
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
    .rt-desktop {
      display: none !important;
    }
  }
`;

const tabItemStyle = (isActive: boolean) =>
  `padding: 0 0.75rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500;
   text-decoration: none; display: flex; align-items: center; gap: 0.4rem; height: 100%;
   box-sizing: border-box; transition: background 0.15s; white-space: nowrap;
   ${isActive
     ? "background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
     : "background: transparent; color: var(--text-secondary);"
   }`;

const TABS = [
  { label: "Overview",     href: "/dashboard/shop/restaurant",              icon: LuLayoutGrid },
  { label: "Menu",         href: "/dashboard/shop/restaurant/menu",         icon: LuUtensils },
  { label: "Tables",       href: "/dashboard/shop/restaurant/tables",       icon: LuSquare },
  { label: "Reservations", href: "/dashboard/shop/restaurant/reservations", icon: LuCalendarDays },
  { label: "Orders",       href: "/dashboard/shop/restaurant/orders",       icon: LuReceipt },
  { label: "Kitchen",      href: "/dashboard/shop/restaurant/kitchen",      icon: LuFlame },
  { label: "Recipes",      href: "/dashboard/shop/restaurant/recipes",      icon: LuBookOpen },
  { label: "Analytics",    href: "/dashboard/shop/restaurant/analytics",    icon: LuBarChart3 },
] as const;

export const RestaurantTabs = component$(() => {
  useStyles$(TAB_STYLES);

  const loc = useLocation();
  const path = loc.url.pathname.replace(/\/$/, "");

  const isActive = (href: string) => {
    const clean = href.replace(/\/$/, "");
    if (clean === "/dashboard/shop/restaurant") {
      return path === clean;
    }
    return path === clean || path.startsWith(clean + "/");
  };

  return (
    <div class="rt-container">
      {/* Desktop pill tabs */}
      <div class="rt-desktop">
        {TABS.map((tab) => {
          const active = isActive(tab.href);
          const Icon = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} style={tabItemStyle(active)}>
              <Icon style="width:0.875rem;height:0.875rem;" />
              {tab.label}
            </Link>
          );
        })}
        <ShopMoreMenu />
      </div>

      {/* Mobile Floating macOS Dock Slider */}
      <MobileDock>
        <div class="tabs-dock-slider">
          {TABS.map((tab) => {
            const active = isActive(tab.href);
            const Icon = tab.icon;
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
        <div style="flex-shrink:0;height:100%;display:flex;align-items:center;">
          <ShopMoreMenu />
        </div>
      </MobileDock>
    </div>
  );
});

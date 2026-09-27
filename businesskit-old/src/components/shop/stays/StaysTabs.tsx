// src/components/shop/stays/StaysTabs.tsx
//
// WHAT:  Sub-navigation tabs for the Shop → Stays section.
//        Follows exact pill-style desktop tabs + MobileDock pattern as RestaurantTabs.tsx.

import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import {
  LuLayoutGrid,
  LuBedDouble,
  LuCalendarDays,
  LuLogIn,
  LuLogOut,
  LuReceipt,
  LuUsers,
  LuBarChart3,
} from "@qwikest/icons/lucide";
import { MobileDock } from "~/components/MobileDock";
import { ShopMoreMenu } from "~/components/shop/ShopMoreMenu";

const TAB_STYLES = `
  .st-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .st-desktop {
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
    .st-desktop {
      display: none !important;
    }
  }
`;

const tabItemStyle = (isActive: boolean) =>
  `padding: 0 0.75rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500;
   text-decoration: none; display: flex; align-items: center; gap: 0.4rem; height: 100%;
   box-sizing: border-box; transition: background 0.15s; white-space: nowrap;
   ${
     isActive
       ? "background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
       : "background: transparent; color: var(--text-secondary);"
   }`;

const TABS = [
  { label: "Rooms",        href: "/dashboard/shop/stays",              icon: LuBedDouble },
  { label: "Reservations", href: "/dashboard/shop/stays/reservations", icon: LuLayoutGrid },
  { label: "Calendar",     href: "/dashboard/shop/stays/calendar",     icon: LuCalendarDays },
  { label: "Check-in",     href: "/dashboard/shop/stays/checkin",      icon: LuLogIn },
  { label: "Check-out",    href: "/dashboard/shop/stays/checkout",     icon: LuLogOut },
  { label: "Folios",       href: "/dashboard/shop/stays/folios",       icon: LuReceipt },
  { label: "Guests",       href: "/dashboard/shop/stays/guests",       icon: LuUsers },
  { label: "Analytics",    href: "/dashboard/shop/stays/analytics",    icon: LuBarChart3 },
] as const;

export const StaysTabs = component$(() => {
  useStyles$(TAB_STYLES);

  const loc = useLocation();
  const path = loc.url.pathname.replace(/\/$/, "");

  const isActive = (href: string) => {
    const clean = href.replace(/\/$/, "");
    if (clean === "/dashboard/shop/stays") {
      return path === clean;
    }
    return path === clean || path.startsWith(clean + "/");
  };

  return (
    <div class="st-container">
      {/* Desktop pill tabs */}
      <div class="st-desktop">
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

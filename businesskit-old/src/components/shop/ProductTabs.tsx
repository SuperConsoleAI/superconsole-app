// src/components/shop/ProductTabs.tsx
//
// WHAT:  Sub-navigation tabs for the Shop → Products section.
//        Adapted from StoreTabs.tsx — same pill-style desktop tabs +
//        dropdown fallback on small screens.
//
// TABS (Phase 1):
//   Products   → /dashboard/shop/products
//   Orders     → /dashboard/shop/products/orders     (Phase 2)
//   Inventory  → /dashboard/shop/products/inventory  (Phase 2)
//   Analytics  → /dashboard/shop/products/analytics  (Phase 2)
//
// RULES: No server$, no fetch(). Pure routing + UI.

import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import {
  LuPackage,
  LuWarehouse,
  LuReceipt,
  LuAlertTriangle,
  LuShoppingCart,
  LuBarChart3,
} from "@qwikest/icons/lucide";
import { MobileDock } from "~/components/MobileDock";
import { ShopMoreMenu } from "~/components/shop/ShopMoreMenu";

const TAB_STYLES = `
  .pt-container {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .pt-desktop {
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
    .pt-desktop {
      display: none !important;
    }
  }
`;

const tabItemStyle = (isActive: boolean) =>
  `padding: 0 0.875rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500;
   text-decoration: none; display: flex; align-items: center; gap: 0.4rem; height: 100%;
   box-sizing: border-box; transition: background 0.15s; white-space: nowrap;
   ${isActive
     ? "background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
     : "background: transparent; color: var(--text-secondary);"
   }`;

const TABS = [
  { label: "Products",  href: "/dashboard/shop/products",           icon: LuPackage,       soon: false },
  { label: "Inventory", href: "/dashboard/shop/products/inventory", icon: LuWarehouse,     soon: false },
  { label: "Billing",   href: "/dashboard/shop/products/billing",   icon: LuReceipt,       soon: false },
  { label: "Reorder",   href: "/dashboard/shop/products/reorder",   icon: LuAlertTriangle, soon: false },
  { label: "Orders",    href: "/dashboard/shop/products/orders",    icon: LuShoppingCart,  soon: true  },
  { label: "Analytics", href: "/dashboard/shop/products/billing/analytics", icon: LuBarChart3, soon: false },
] as const;

export const ProductTabs = component$(() => {
  useStyles$(TAB_STYLES);

  const loc           = useLocation();
  const path          = loc.url.pathname.replace(/\/$/, "");

  const isActive = (href: string) => {
    const clean = href.replace(/\/$/, "");
    if (clean === "/dashboard/shop/products") {
      return path === clean;
    }
    return path === clean || path.startsWith(clean + "/");
  };

  return (
    <div class="pt-container">
      {/* Desktop pill tabs */}
      <div class="pt-desktop">
        {TABS.map(tab => {
          const active = isActive(tab.href);
          const Icon   = tab.icon;
          return (
            <Link key={tab.href} href={tab.href} style={tabItemStyle(active)}>
              <Icon style="width:0.875rem;height:0.875rem;" />
              {tab.label}
              {tab.soon && (
                <span
                  style={{
                    fontSize: "0.625rem",
                    fontWeight: "600",
                    background: "var(--surface-2)",
                    color: "var(--text-secondary)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.25rem",
                    padding: "0.05rem 0.3rem",
                    letterSpacing: "0.03em",
                    marginLeft: "0.15rem",
                  }}
                >
                  soon
                </span>
              )}
            </Link>
          );
        })}
        <ShopMoreMenu />
      </div>

      {/* Mobile Floating macOS Dock Slider with ShopMoreMenu attached at right end */}
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
        <div style="flex-shrink:0;height:100%;display:flex;align-items:center;">
          <ShopMoreMenu />
        </div>
      </MobileDock>
    </div>
  );
});

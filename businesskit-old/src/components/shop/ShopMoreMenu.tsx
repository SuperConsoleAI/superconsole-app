// src/components/shop/ShopMoreMenu.tsx
//
// "More" dropdown using native <details>/<summary> — zero JS state,
// works in any WebView including Tauri/WKWebView. No serialization issues.

import { component$, useSignal, $ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import {
  LuLayoutGrid,
  LuFolderOpen,
  LuSettings,
  LuTag,
  LuChevronDown,
  LuUsers,
  LuTruck,
  LuListChecks,
  LuAward,
  LuGlobe,
  LuScale,
} from "@qwikest/icons/lucide";

const itemStyle = (active: boolean) => ({
  display: "flex",
  alignItems: "center",
  gap: "0.625rem",
  padding: "0.5rem 0.75rem",
  borderRadius: "0.375rem",
  fontSize: "0.875rem",
  textDecoration: "none",
  color: active ? "var(--text-primary)" : "var(--text-secondary)",
  fontWeight: active ? "600" : "400",
  background: active ? "var(--surface-3)" : "transparent",
  transition: "background 0.12s, color 0.12s",
  cursor: "pointer",
  border: "none",
  width: "100%",
  boxSizing: "border-box" as const,
});

export const ShopMoreMenu = component$(() => {
  const loc  = useLocation();
  const path = loc.url.pathname.replace(/\/$/, "");
  const detailsRef = useSignal<HTMLDetailsElement>();

  const closeMenu = $(() => {
    if (detailsRef.value) {
      detailsRef.value.open = false;
    }
  });

  const isActive = (href: string) =>
    path === href || path.startsWith(href + "/");

  const anyActive =
    isActive("/dashboard/shop/staff") ||
    isActive("/dashboard/shop/customers") ||
    isActive("/dashboard/shop/vendors") ||
    isActive("/dashboard/shop/collections") ||
    isActive("/dashboard/shop/categories") ||
    isActive("/dashboard/shop/brands") ||
    isActive("/dashboard/shop/units") ||
    isActive("/dashboard/shop/settings") ||
    isActive("/dashboard/shop/settings/currency");

  return (
    <details ref={detailsRef} style={{ position: "relative", listStyle: "none", height: "100%", display: "flex", alignItems: "center" }}>
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.35rem",
          height: "100%",
          padding: "0 0.75rem",
          borderRadius: "0.375rem",
          fontSize: "0.8125rem",
          fontWeight: anyActive ? "600" : "500",
          cursor: "pointer",
          listStyle: "none",
          border: "none",
          background: anyActive ? "var(--surface-2)" : "transparent",
          color: anyActive ? "var(--text-primary)" : "var(--text-secondary)",
          boxShadow: anyActive ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
          userSelect: "none",
          whiteSpace: "nowrap",
          boxSizing: "border-box",
          transition: "background 0.15s, color 0.15s",
        }}
      >
        More
        <LuChevronDown style="width:0.75rem;height:0.75rem;margin-left:0.1rem;" />
      </summary>

      <div
        class="shop-more-menu-panel"
        onClick$={closeMenu}
      >
        {/* ── Operations ─────────────────────── */}
        <Link href="/dashboard/shop/staff" style={itemStyle(isActive("/dashboard/shop/staff"))}>
          <LuUsers style="width:1rem;height:1rem;flex-shrink:0;" />
          Staff
        </Link>

        <Link href="/dashboard/shop/customers" style={itemStyle(isActive("/dashboard/shop/customers"))}>
          <LuUsers style="width:1rem;height:1rem;flex-shrink:0;" />
          Customers
        </Link>

        <Link href="/dashboard/shop/vendors" style={itemStyle(isActive("/dashboard/shop/vendors"))}>
          <LuTruck style="width:1rem;height:1rem;flex-shrink:0;" />
          Vendors
        </Link>

        <div style={{ height: "1px", background: "var(--border)", margin: "0.25rem 0" }} />

        {/* ── Finance ────────────────────────── */}
        <div style={{ padding: "0.25rem 0.75rem 0.1rem", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Finance
        </div>

        <Link href="/dashboard/shop/settings/currency/" style={itemStyle(isActive("/dashboard/shop/settings/currency"))}>
          <LuGlobe style="width:1rem;height:1rem;flex-shrink:0;" />
          Currency & Rates
        </Link>

        <div style={{ height: "1px", background: "var(--border)", margin: "0.25rem 0" }} />

        {/* ── Catalogue ──────────────────────── */}
        <div style={{ padding: "0.25rem 0.75rem 0.1rem", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Catalogue
        </div>

        <Link href="/dashboard/shop/collections" style={itemStyle(isActive("/dashboard/shop/collections"))}>
          <LuLayoutGrid style="width:1rem;height:1rem;flex-shrink:0;" />
          Collections
        </Link>

        <Link href="/dashboard/shop/categories" style={itemStyle(isActive("/dashboard/shop/categories"))}>
          <LuFolderOpen style="width:1rem;height:1rem;flex-shrink:0;" />
          Categories
        </Link>

        <Link href="/dashboard/shop/brands" style={itemStyle(isActive("/dashboard/shop/brands"))}>
          <LuAward style="width:1rem;height:1rem;flex-shrink:0;" />
          Brands
        </Link>

        <Link href="/dashboard/shop/units" style={itemStyle(isActive("/dashboard/shop/units"))}>
          <LuScale style="width:1rem;height:1rem;flex-shrink:0;" />
          Units of Measure
        </Link>

        <div style={{ height: "1px", background: "var(--border)", margin: "0.25rem 0" }} />

        <Link href="/dashboard/shop/settings/price-lists" style={itemStyle(isActive("/dashboard/shop/settings/price-lists"))}>
          <LuListChecks style="width:1rem;height:1rem;flex-shrink:0;" />
          Price Lists
        </Link>

        <Link href="/dashboard/shop/settings/discounts" style={itemStyle(isActive("/dashboard/shop/settings/discounts"))}>
          <LuTag style="width:1rem;height:1rem;flex-shrink:0;" />
          Discounts
        </Link>

        <div style={{ ...itemStyle(false), opacity: 0.45, cursor: "not-allowed" }}>
          <LuSettings style="width:1rem;height:1rem;flex-shrink:0;" />
          <span style="flex:1;">Settings</span>
          <span style={{ fontSize: "0.6rem", fontWeight: "700", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.2rem", padding: "0.05rem 0.3rem", color: "var(--text-secondary)" }}>soon</span>
        </div>
      </div>
    </details>
  );
});

// src/routes/dashboard/shop/products/index.tsx
//
// Shop Products page — Phase 1
//
// Uses AddProductModal component from ~/components/shop/AddProductModal.
// Features:
//   - Filter toggle before search bar: All | Today | inactive (POS) | Draft | Archive
//   - Search by name or SKU
//   - Max 30 items per page with "Load More"
//   - Restore & Delete actions for archived items

import {
  component$, useSignal, useContext, useComputed$, $, type PropFunction, useStylesScoped$,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuPlus, LuPackage } from "@qwikest/icons/lucide";
import { AddProductModal } from "~/components/shop/AddProductModal";
import { ShopProductTable } from "~/components/shop/ShopProductTable";
import type { ShopItem } from "~/components/shop/ShopProductTable";
import { SingleItemBillingAnalytics } from "~/components/shop/SingleItemBillingAnalytics";
import { ProductsCtx } from "./layout";

type ProductFilter = "all" | "today" | "inactive_pos" | "draft" | "untracked" | "archive";

const STYLES = `
  .prod-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .prod-toggle {
    display: flex;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    height: 36px;
    box-sizing: border-box;
    align-items: center;
    flex-shrink: 0;
  }
  .prod-tab {
    padding: 0 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.375rem;
    height: 100%;
    box-sizing: border-box;
    transition: background 0.15s, color 0.15s;
    border: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .prod-tab.active  { background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.12); font-weight: 600; }
  .prod-tab.inactive { background: transparent; color: var(--text-secondary); }
  .prod-tab.inactive:hover { color: var(--text-primary); }
  .prod-badge {
    background: var(--button-primary-bg, var(--accent));
    color: var(--button-primary-text);
    border-radius: 0.9rem;
    padding: 0 0.35rem;
    font-size: 0.65rem;
    font-weight: 700;
    min-width: 1rem;
    text-align: center;
    line-height: 1.4;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .prod-search-add {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    flex: 1;
    justify-content: flex-end;
    min-width: 0;
  }
  .prod-search-wrap {
    position: relative;
    flex: 1;
    max-width: 22rem;
    min-width: 8rem;
  }
  .prod-add-btn {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    border: none;
    border-radius: 0.375rem;
    padding: 0 1rem;
    height: 2.25rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    flex-shrink: 0;
    white-space: nowrap;
  }
  .prod-btn-suffix {
    display: inline;
  }
  .prod-tab-archive {
    display: flex;
  }
  @media (max-width: 768px) {
    .prod-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.625rem;
    }
    .prod-toggle {
      width: 100%;
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
    }
    .prod-tab {
      flex: 1;
      padding: 0 0.5rem;
      font-size: 0.75rem;
      gap: 0.25rem;
    }
    .prod-tab-archive {
      display: none !important;
    }
    .prod-search-add {
      width: 100%;
      justify-content: stretch;
    }
    .prod-search-wrap {
      max-width: 100%;
    }
    .prod-btn-suffix {
      display: none;
    }
    .prod-add-btn {
      padding: 0 0.75rem;
    }
  }
`;

export default component$(() => {
  useStylesScoped$(STYLES);

  const store = useContext(ProductsCtx);
  const search = useSignal("");
  const filter = useSignal<ProductFilter>("all");

  // SlideOver control
  const showModal    = useSignal(false);
  const editing      = useSignal<ShopItem | null>(null);
  const insightItem  = useSignal<ShopItem | null>(null);

  // Filter products for category cat_6 (or shop_category_id === 'cat_6' or physical type)
  const cat6AllItems = useComputed$(() => {
    return store.items.filter(
      i => i.category_id === "cat_6" || i.shop_category_id === "cat_6" || (!i.category_id && (!i.item_type || i.item_type === "physical"))
    );
  });

  // Calculate midnight epoch timestamp for "Today" filter
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = Math.floor(todayStart.getTime() / 1000);

  // Today count for badge
  const todayCount = useComputed$(() => {
    return cat6AllItems.value.filter(
      i => (i.archived ?? 0) !== 1 && (i.created_at || 0) >= todayTs
    ).length;
  });

  // Filtered items based on active toggle tab
  const tabFilteredItems = useComputed$(() => {
    switch (filter.value) {
      case "today":
        return cat6AllItems.value.filter(i => (i.archived ?? 0) !== 1 && (i.created_at || 0) >= todayTs);
      case "inactive_pos":
        return cat6AllItems.value.filter(i => (i.archived ?? 0) !== 1 && i.is_active === 0);
      case "draft":
        return cat6AllItems.value.filter(i => (i.archived ?? 0) !== 1 && i.published === 0);
      case "untracked":
        return cat6AllItems.value.filter(i => (i.archived ?? 0) !== 1 && (i.track_inventory === 0 || !i.track_inventory));
      case "archive":
        return cat6AllItems.value.filter(i => (i.archived ?? 0) === 1);
      case "all":
      default:
        return cat6AllItems.value.filter(i => (i.archived ?? 0) !== 1);
    }
  });

  const categoriesSignal  = useComputed$(() => store.categories);
  const collectionsSignal = useComputed$(() => store.collections);
  const unitsSignal       = useComputed$(() => store.units);

  const openAdd = $(() => {
    editing.value   = null;
    showModal.value = true;
  });

  const openEdit: PropFunction<(item: ShopItem) => void> = $((item: ShopItem) => {
    editing.value   = item;
    showModal.value = true;
  });

  const openInsight: PropFunction<(item: ShopItem) => void> = $((item: ShopItem) => {
    insightItem.value = item;
  });

  const handleSaved = $(async (saved: ShopItem) => {
    const exists = store.items.find(i => i.id === saved.id);
    if (exists) {
      store.items = store.items.map(i => i.id === saved.id ? saved : i);
    } else {
      store.items = [saved, ...store.items];
    }
    // Background refresh
    store.refresh();
  });

  const handleDelete = $(async (id: string) => {
    try {
      await invoke("shop_delete_item", { itemId: id });
      // Soft-delete: mark as archived in memory
      store.items = store.items.map(i => i.id === id ? { ...i, archived: 1 } : i);
      store.refresh();
    } catch (e) {
      console.error("[shop/products] delete failed:", e);
    }
  });

  const handleRestore = $(async (id: string) => {
    try {
      await invoke("shop_update_item", {
        itemId: id,
        data: { archived: 0 },
      });
      store.items = store.items.map(i => i.id === id ? { ...i, archived: 0 } : i);
      store.refresh();
    } catch (e) {
      console.error("[shop/products] restore failed:", e);
    }
  });

  const handleTogglePublished = $(async (id: string, published: boolean) => {
    try {
      await invoke("shop_update_item", {
        itemId: id,
        data: { published: published ? 1 : 0 },
      });
      store.items = store.items.map(i => i.id === id ? { ...i, published: published ? 1 : 0 } : i);
    } catch (e) {
      console.error("[shop/products] toggle published failed:", e);
      store.refresh();
    }
  });

  return (
    <>
      {/* ── Modal ───────────────────────────────────────────────────────── */}
      <AddProductModal
        open={showModal}
        editingItem={editing}
        categories={categoriesSignal}
        collections={collectionsSignal}
        units={unitsSignal}
        defaultCategoryId="cat_6"
        onSaved$={handleSaved}
      />

      {/* ── Billing Insights SlideOver ─────────────────────────────── */}
      {insightItem.value && (
        <SingleItemBillingAnalytics
          itemId={insightItem.value.id}
          itemName={insightItem.value.name}
          onClose$={$(() => { insightItem.value = null; })}
        />
      )}

      {/* ── Toolbar: [Filter Toggle] + [Search & Add Product Group] ─── */}
      <div class="prod-toolbar">
        {/* Filter Toggle — before search bar, full width on mobile */}
        <div class="prod-toggle">
          <button
            type="button"
            class={`prod-tab ${filter.value === "all" ? "active" : "inactive"}`}
            onClick$={() => { filter.value = "all"; }}
          >
            All
          </button>

          <button
            type="button"
            class={`prod-tab ${filter.value === "today" ? "active" : "inactive"}`}
            onClick$={() => { filter.value = "today"; }}
          >
            Today
            <span
              class="prod-badge"
              style={{
                background: todayCount.value > 0 ? "var(--button-primary-bg, var(--accent))" : "rgba(128,128,128,0.2)",
                color: todayCount.value > 0 ? "var(--button-primary-text)" : "var(--text-secondary)",
              }}
            >
              {todayCount.value}
            </span>
          </button>

          <button
            type="button"
            class={`prod-tab ${filter.value === "draft" ? "active" : "inactive"}`}
            onClick$={() => { filter.value = "draft"; }}
          >
            Draft
          </button>

          <button
            type="button"
            class={`prod-tab ${filter.value === "untracked" ? "active" : "inactive"}`}
            onClick$={() => { filter.value = "untracked"; }}
          >
            Untracked
          </button>

          <button
            type="button"
            class={`prod-tab ${filter.value === "inactive_pos" ? "active" : "inactive"}`}
            onClick$={() => { filter.value = "inactive_pos"; }}
          >
            inactive (POS)
          </button>

          <button
            type="button"
            class={`prod-tab prod-tab-archive ${filter.value === "archive" ? "active" : "inactive"}`}
            onClick$={() => { filter.value = "archive"; }}
          >
            Archive
          </button>
        </div>

        {/* Search Bar + Add Product in same div */}
        <div class="prod-search-add">
          <div class="prod-search-wrap">
            <span style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none", display: "flex" }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input
              type="search"
              placeholder="Search products…"
              value={search.value}
              onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; }}
              style={{
                width: "100%",
                height: "2.25rem",
                paddingLeft: "2rem",
                paddingRight: "0.75rem",
                background: "var(--field-fill)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                outline: "none",
                boxSizing: "border-box" as const,
              }}
            />
          </div>

          <button
            type="button"
            class="prod-add-btn"
            onClick$={openAdd}
          >
            <LuPlus style="width:1rem;height:1rem;" />
            Add<span class="prod-btn-suffix">&nbsp;Product</span>
          </button>
        </div>
      </div>

      {/* ── Content ─────────────────────────────────────────────────────── */}
      {store.loading ? (
        /* Skeleton rows */
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[1, 2, 3].map(i => (
            <div
              key={i}
              style={{
                height: "3rem",
                background: "var(--surface-2)",
                borderRadius: "0.375rem",
                animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite",
                animationDelay: `${(i - 1) * 150}ms`,
              }}
            />
          ))}
        </div>
      ) : cat6AllItems.value.length === 0 ? (
        /* Empty state */
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: "5rem 2rem",
            textAlign: "center",
            gap: "1rem",
          }}
        >
          <div
            style={{
              width: "3.5rem",
              height: "3.5rem",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
            }}
          >
            <LuPackage style="width:1.75rem;height:1.75rem;" />
          </div>
          <div style={{ fontSize: "1rem", fontWeight: "600", color: "var(--text-primary)" }}>
            No products yet
          </div>
          <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>
            Add your first product to start billing.
          </div>
          <button
            type="button"
            onClick$={openAdd}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "var(--button-primary-bg)",
              color: "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0 1.25rem",
              height: "2.25rem",
              fontSize: "0.875rem",
              fontWeight: "500",
              cursor: "pointer",
              marginTop: "0.25rem",
            }}
          >
            <LuPlus style="width:1rem;height:1rem;" />
            Add Product
          </button>
        </div>
      ) : (
        <ShopProductTable
          items={tabFilteredItems}
          units={unitsSignal}
          categories={categoriesSignal}
          search={search}
          pageSize={30}
          showLoadMore={true}
          onEdit$={openEdit}
          onDelete$={handleDelete}
          onRestore$={handleRestore}
          onInsight$={openInsight}
          onTogglePublished$={handleTogglePublished}
        />
      )}
    </>
  );
});

export const head: DocumentHead = { title: "Products — Shop" };

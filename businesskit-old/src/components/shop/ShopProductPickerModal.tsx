// src/components/shop/ShopProductPickerModal.tsx
//
// WHAT: Product Picker Modal for selecting an item (e.g., Parent Product or Stock Receive item).
//       Displays searchable list of shop items with product name, SKU, price, and selection state.
//       Optimized for large catalogs (3,000+ items): defaults to latest 12 items with instant search and load more.

import {
  component$,
  useSignal,
  useComputed$,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuSearch,
  LuCheck,
  LuLoader,
  LuPackage,
  LuX,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import { type ShopItem } from "~/components/shop/ShopProductTable";

export interface ShopProductPickerModalProps {
  open: Signal<boolean>;
  title?: string;
  subtitle?: string;
  selectedParentId?: string;
  excludeItemId?: string; // Exclude self when editing to avoid circular references
  systemCategoryId?: string; // System vertical category (cat_6, cat_29, cat_30)
  shopCategoryId?: string; // User store category from dropdown
  onSelect$: PropFunction<(item: ShopItem | null) => void>;
}

export const ShopProductPickerModal = component$<ShopProductPickerModalProps>(({
  open,
  title = "Select Product",
  subtitle = "Search or pick a product.",
  selectedParentId,
  excludeItemId,
  systemCategoryId,
  shopCategoryId,
  onSelect$,
}) => {
  const items = useSignal<ShopItem[]>([]);
  const loading = useSignal(false);
  const search = useSignal("");
  const visibleLimit = useSignal(12);

  const loadItems = $(async () => {
    loading.value = true;
    try {
      const [list, variants] = await Promise.all([
        invoke<ShopItem[]>("shop_list_items").catch(() => []),
        invoke<Array<{
          id: string;
          item_id: string;
          name: string;
          sku?: string;
          barcode?: string;
          price?: number;
          price_delta: number;
          cost_price?: number;
          default_mrp?: number;
          pack_size?: string;
          conversion_factor?: number;
          media_url?: string;
          seo_og_image?: string;
          discount_pct?: number;
          extra_discount?: number;
        }>>("shop_list_all_active_variants", {}).catch(() => []),
      ]);

      const expanded: ShopItem[] = [];
      const baseItems = Array.isArray(list) ? list : [];
      const varList = Array.isArray(variants) ? variants : [];

      for (const item of baseItems) {
        const itemVars = varList.filter((v) => v.item_id === item.id);
        if (item.has_variants === 1 && itemVars.length > 0) {
          for (const v of itemVars) {
            const vPrice = v.price !== undefined && v.price !== null && v.price !== 0
              ? v.price
              : ((v.price_delta || 0) !== 0 ? (item.price + v.price_delta) : item.price);
            expanded.push({
              ...item,
              id: v.id,
              name: `${item.name} — ${v.name}`,
              price: vPrice,
              cost_price: v.cost_price ?? item.cost_price,
              sku: v.sku || item.sku,
              barcode: v.barcode || item.barcode,
              default_mrp: v.default_mrp ?? item.default_mrp,
              pack_size: v.pack_size || item.pack_size,
              conversion_factor: v.conversion_factor ?? item.conversion_factor,
              discount_pct: v.discount_pct ?? item.discount_pct,
              extra_discount: v.extra_discount ?? item.extra_discount,
              media_url: v.media_url || item.media_url,
              seo_og_image: v.seo_og_image || v.media_url || item.seo_og_image,
            });
          }
        } else {
          expanded.push(item);
        }
      }
      items.value = expanded;
    } catch {
      items.value = [];
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const isOpen = track(() => open.value);
    if (isOpen) {
      visibleLimit.value = 12;
      search.value = "";
      loadItems();
    }
  });

  const filteredItems = useComputed$(() => {
    const query = search.value.toLowerCase().trim();
    return items.value.filter((item) => {
      if (excludeItemId && item.id === excludeItemId) return false;
      if (systemCategoryId) {
        if (systemCategoryId === "cat_6") {
          const isCat6 = item.category_id === "cat_6" || item.shop_category_id === "cat_6" || (!item.category_id && (!item.item_type || item.item_type === "physical"));
          if (!isCat6) return false;
        } else {
          if (item.category_id && item.category_id !== systemCategoryId && item.shop_category_id !== systemCategoryId) return false;
        }
      }
      if (shopCategoryId) {
        if (item.shop_category_id && item.shop_category_id !== shopCategoryId) return false;
      }
      if (!query) return true;
      return (
        item.name.toLowerCase().includes(query) ||
        (item.sku && item.sku.toLowerCase().includes(query)) ||
        (item.barcode && item.barcode.toLowerCase().includes(query))
      );
    });
  });

  const displayedItems = useComputed$(() => {
    // If there is an active search query, show more items (up to visibleLimit or 50)
    const limit = search.value.trim() ? Math.max(visibleLimit.value, 30) : visibleLimit.value;
    return filteredItems.value.slice(0, limit);
  });

  return (
    <SlideOver open={open} title={title} subtitle={subtitle} width="520px">
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {/* Search & Clear option */}
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <LuSearch
              style={{
                position: "absolute",
                left: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                width: "1rem",
                height: "1rem",
                color: "var(--text-tertiary)",
              }}
            />
            <input
              type="text"
              placeholder="Search products by name, SKU, or barcode..."
              value={search.value}
              onInput$={(e) => {
                search.value = (e.target as HTMLInputElement).value;
                visibleLimit.value = 30;
              }}
              style={{
                width: "100%",
                height: "2.375rem",
                paddingLeft: "2.25rem",
                paddingRight: "0.75rem",
                background: "var(--field-fill)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-primary)",
                fontSize: "0.875rem",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          {selectedParentId && (
            <button
              type="button"
              onClick$={() => {
                onSelect$(null);
                open.value = false;
              }}
              style={{
                height: "2.375rem",
                padding: "0 0.875rem",
                background: "transparent",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-secondary)",
                fontSize: "0.8125rem",
                fontWeight: "500",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                whiteSpace: "nowrap",
              }}
            >
              <LuX style={{ width: "0.875rem", height: "0.875rem" }} />
              Clear
            </button>
          )}
        </div>

        {/* Counter & Hint */}
        {!loading.value && filteredItems.value.length > 0 && (
          <div style={{ fontSize: "0.75rem", color: "var(--text-tertiary)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span>
              {search.value.trim()
                ? `Found ${filteredItems.value.length} matching products`
                : `Showing latest ${displayedItems.value.length} of ${filteredItems.value.length} products`}
            </span>
            {systemCategoryId && (
              <span style={{ padding: "0.1rem 0.4rem", background: "var(--surface-3)", borderRadius: "0.25rem", fontSize: "0.7rem" }}>
                Filter: {systemCategoryId}
              </span>
            )}
          </div>
        )}

        {/* Product List */}
        {loading.value ? (
          <div style={{ padding: "3rem 0", textAlign: "center", color: "var(--text-tertiary)", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}>
            <LuLoader style={{ width: "1.25rem", height: "1.25rem", animation: "spin 1s linear infinite" }} />
            <span>Loading products...</span>
          </div>
        ) : filteredItems.value.length === 0 ? (
          <div style={{ padding: "3rem 1rem", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "0.5rem", color: "var(--text-secondary)" }}>
            <LuPackage style={{ width: "2rem", height: "2rem", margin: "0 auto 0.5rem", opacity: 0.5 }} />
            <p style={{ margin: 0, fontSize: "0.875rem", fontWeight: "500" }}>No products found</p>
            <p style={{ margin: "0.25rem 0 0", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
              {search.value ? "Try adjusting your search query." : "No available products matching this filter."}
            </p>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem", maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
            {displayedItems.value.map((item) => {
              const isSelected = item.id === selectedParentId;
              return (
                <div
                  key={item.id}
                  onClick$={() => {
                    onSelect$(item);
                    open.value = false;
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.75rem 1rem",
                    background: isSelected ? "var(--surface-2)" : "var(--field-fill)",
                    border: `1px solid ${isSelected ? "var(--accent)" : "var(--border)"}`,
                    borderRadius: "0.5rem",
                    cursor: "pointer",
                    transition: "all 150ms ease",
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
                    <span style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)" }}>
                      {item.name}
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.625rem", fontSize: "0.75rem", color: "var(--text-tertiary)" }}>
                      {item.sku && <span>SKU: {item.sku}</span>}
                      <span>₹{(item.price ?? 0).toFixed(2)}</span>
                      {item.cost_price ? <span style={{ color: "var(--text-secondary)" }}>Cost: ₹{item.cost_price.toFixed(2)}</span> : null}
                    </div>
                  </div>

                  {isSelected && (
                    <div
                      style={{
                        width: "1.5rem",
                        height: "1.5rem",
                        borderRadius: "50%",
                        background: "var(--button-primary-bg, var(--accent))",
                        color: "var(--button-primary-text, #ffffff)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                      }}
                    >
                      <LuCheck style={{ width: "1rem", height: "1rem", strokeWidth: 3 }} />
                    </div>
                  )}
                </div>
              );
            })}

            {filteredItems.value.length > displayedItems.value.length && (
              <button
                type="button"
                class="btn btn-secondary"
                onClick$={() => { visibleLimit.value += 12; }}
                style={{ marginTop: "0.5rem", padding: "0.5rem", fontSize: "0.8125rem", fontWeight: "600" }}
              >
                + Load More (Showing {displayedItems.value.length} of {filteredItems.value.length})
              </button>
            )}
          </div>
        )}
      </div>
    </SlideOver>
  );
});

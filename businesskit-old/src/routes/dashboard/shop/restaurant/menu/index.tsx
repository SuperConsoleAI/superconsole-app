// src/routes/dashboard/shop/restaurant/menu/index.tsx
//
// Restaurant Menu Management Page — Path: /dashboard/shop/restaurant/menu

import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuUtensils, LuSearch, LuTag, LuPlus, LuPencil, LuBarChart2 } from "@qwikest/icons/lucide";
import { AddProductModal, type ShopCategory, type ShopCollection, type ShopUnit } from "~/components/shop/AddProductModal";
import { RestaurantDishAnalyticsSlideOver } from "~/components/shop/restaurant/RestaurantDishAnalyticsSlideOver";
import type { ShopItem } from "~/components/shop/ShopProductTable";
import { RestaurantContext } from "~/routes/dashboard/shop/restaurant/layout";

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_name?: string;
  description?: string;
  sku?: string;
  media_url?: string;
  is_published: boolean;
  category_id?: string;
  raw_item?: any;
}

export default component$(() => {
  const ctx = useContext(RestaurantContext);
  const search = useSignal("");
  const showModal = useSignal(false);
  const editingItem = useSignal<ShopItem | null>(null);
  const showAnalytics = useSignal(false);
  const analyticsItem = useSignal<MenuItem | null>(null);
  const categories = useSignal<ShopCategory[]>([]);
  const collections = useSignal<ShopCollection[]>([]);
  const units = useSignal<ShopUnit[]>([]);

  const loadItems = $(async () => {
    try {
      await ctx.loadData();
    } catch (e) {
      console.error("[restaurant/menu] load failed:", e);
    }
  });

  const handleEdit$ = $(async (item: MenuItem) => {
    try {
      const full = await invoke<ShopItem>("shop_get_item", { itemId: item.id });
      editingItem.value = full;
    } catch {
      editingItem.value = item.raw_item || (item as any);
    }
    showModal.value = true;
  });

  const filteredItems = ctx.menuItems
    .filter((i) => i.item_type === "menu" || !i.category_id || i.category_id === "cat_29")
    .map((i) => ({
      id: i.id,
      name: i.name,
      price: i.price || 0,
      category_name: i.category_name || "Menu",
      description: i.description,
      sku: i.sku,
      media_url: i.media_url || i.seo_og_image,
      is_published: i.published === 1,
      category_id: i.category_id,
      raw_item: i,
    }))
    .filter((i) => i.name.toLowerCase().includes(search.value.toLowerCase()));

  return (
    <div>
      {/* Search & Actions Bar */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: "1.5rem", alignItems: "center" }}>
        <div style={{ position: "relative", flex: 1, maxWidth: "320px" }}>
          <LuSearch style="width:1rem;height:1rem;position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);color:var(--text-secondary);" />
          <input
            type="text"
            placeholder="Search menu dishes..."
            value={search.value}
            onInput$={(e) => (search.value = (e.target as HTMLInputElement).value)}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem 0.5rem 2.25rem",
              borderRadius: "0.5rem",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-primary)",
              boxSizing: "border-box",
            }}
          />
        </div>

        <button
          onClick$={() => {
            editingItem.value = null;
            showModal.value = true;
          }}
          style={{
            padding: "0.5rem 1.25rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-text)",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <LuPlus style="width:1rem;height:1rem;" />
          Add Dish
        </button>
      </div>

      {/* Menu Table / Cards */}
      {ctx.loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading menu items...
        </div>
      ) : filteredItems.length === 0 ? (
        <div style={{ padding: "4rem 2rem", textAlign: "center", background: "var(--surface-2)", borderRadius: "0.75rem", border: "1px dashed var(--border)" }}>
          <LuUtensils style="width:3rem;height:3rem;color:var(--text-secondary);margin-bottom:1rem;" />
          <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: 600 }}>No Menu Items Found</h3>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
            Click "+ Add Dish" above to create dishes in your restaurant menu.
          </p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: "1rem" }}>
          {filteredItems.map((item) => (
            <div
              key={item.id}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "0.75rem",
                padding: "1rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.5rem",
              }}
            >
              {/* Image Banner */}
              <div style={{ height: "130px", borderRadius: "0.5rem", overflow: "hidden", marginBottom: "0.25rem", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {item.media_url ? (
                  <img src={item.media_url} alt={item.name} width={300} height={130} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (
                  <LuUtensils style="width:2rem;height:2rem;color:var(--text-secondary);opacity:0.4;" />
                )}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>{item.name}</h4>
                <span style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--brand-primary, #2563eb)" }}>
                  ₹{item.price}
                </span>
              </div>

              {item.category_name && (
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                  <LuTag style="width:0.75rem;height:0.75rem;" />
                  {item.category_name}
                </div>
              )}

              {item.description && (
                <p style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", margin: 0, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                  {item.description}
                </p>
              )}

              {/* Action row with Analytics & Edit buttons */}
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "auto", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {item.is_published ? "Published" : "Draft"}
                </span>
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    type="button"
                    title="Dish Analytics"
                    onClick$={() => {
                      analyticsItem.value = item;
                      showAnalytics.value = true;
                    }}
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--brand-primary, #6366f1)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <LuBarChart2 style="width:0.8125rem;height:0.8125rem;" />
                    Analytics
                  </button>

                  <button
                    type="button"
                    onClick$={() => handleEdit$(item)}
                    style={{
                      background: "var(--surface-1)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      padding: "0.3rem 0.6rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <LuPencil style="width:0.75rem;height:0.75rem;" />
                    Edit
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add / Edit Product Modal */}
      <AddProductModal
        open={showModal}
        editingItem={editingItem}
        categories={categories}
        collections={collections}
        units={units}
        defaultCategoryId="cat_29"
        defaultItemType="menu"
        onSaved$={$(async () => {
          await loadItems();
        })}
      />

      {/* Per-Dish Restaurant Analytics SlideOver */}
      {showAnalytics.value && analyticsItem.value && (
        <RestaurantDishAnalyticsSlideOver
          itemId={analyticsItem.value.id}
          itemName={analyticsItem.value.name}
          onClose$={$(() => {
            showAnalytics.value = false;
            analyticsItem.value = null;
          })}
        />
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Restaurant Menu | BusinessKit",
};

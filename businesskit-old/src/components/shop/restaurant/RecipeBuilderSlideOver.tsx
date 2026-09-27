// src/components/shop/restaurant/RecipeBuilderSlideOver.tsx
//
// WHAT: SlideOver to create / edit dish recipes & BOM ingredient breakdown.
//       Matches exact design language of AddProductModal.tsx.
//       Includes rich searchable popover dropdown with images for Target Dish
//       and raw catalogue materials.

import {
  component$,
  useSignal,
  useStore,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuSave,
  LuLoader,
  LuPlus,
  LuTrash2,
  LuUtensils,
  LuSearch,
  LuChevronDown,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";

export interface BOMLine {
  id: string;
  component_item_id: string;
  component_item_name: string;
  qty_required: number;
  unit?: string;
  wastage_pct: number;
}

export interface ShopRecipe {
  id: string;
  item_id: string;
  item_name: string;
  yield_qty: number;
  yield_unit?: string;
  lines: BOMLine[];
  notes?: string;
}

export interface RecipeBuilderSlideOverProps {
  open: Signal<boolean>;
  onSaved$: PropFunction<(recipe: ShopRecipe) => void>;
}

export interface ItemOption {
  id: string;
  name: string;
  price?: number;
  media_url?: string;
  category_name?: string;
  category_id?: string;
}

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};



export const RecipeBuilderSlideOver = component$<RecipeBuilderSlideOverProps>(
  ({ open, onSaved$ }) => {
    const dishes        = useSignal<ItemOption[]>([]);
    const rawItems      = useSignal<ItemOption[]>([]);
    const selDish       = useSignal<ItemOption | null>(null);
    const yieldQty      = useSignal(1);
    const yieldUnit     = useSignal("portion");
    const notes         = useSignal("");
    const lines         = useStore<BOMLine[]>([]);
    const saving        = useSignal(false);
    const error         = useSignal<string | null>(null);

    // Target Dish Searchable Picker
    const isDishPickerOpen = useSignal(false);
    const dishSearch       = useSignal("");

    // Raw Ingredient Searchable Picker
    const isIngPickerOpen  = useSignal(false);
    const ingSearch        = useSignal("");
    const selectedIngItem  = useSignal<ItemOption | null>(null);

    // Custom ingredient fallback
    const customIngName = useSignal("");
    const pickerQty     = useSignal(1);
    const pickerUnit    = useSignal("g");
    const pickerWastage = useSignal(0);

    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track }) => {
      const isOpen = track(() => open.value);
      if (!isOpen) return;

      try {
        const res = await invoke<any[]>("shop_list_items", {});
        const mapped: ItemOption[] = res.map((i) => ({
          id: i.id,
          name: i.name,
          price: i.price || 0,
          media_url: i.media_url || i.seo_og_image,
          category_name: i.category_name || (i.category_id === "cat_29" ? "Menu" : "General"),
          category_id: i.category_id,
        }));
        const menuDishes = mapped.filter((i) => i.category_id === "cat_29");
        dishes.value   = menuDishes.length > 0 ? menuDishes : mapped;
        
        // Ingredients: only show physical shop items (category_id = cat_6)
        const shopIngredients = mapped.filter((i) => i.category_id === "cat_6");
        rawItems.value = shopIngredients.length > 0 ? shopIngredients : mapped.filter((i) => i.category_id !== "cat_29");
      } catch (e) {
        console.error("[RecipeBuilderSlideOver] load items failed:", e);
      }
    });

    const addIngredient = $(() => {
      const ingId = selectedIngItem.value?.id || "";
      let ingName = customIngName.value.trim();

      if (selectedIngItem.value) {
        ingName = selectedIngItem.value.name;
      }

      if (!ingName) return;

      lines.push({
        id: `line-${Date.now()}-${Math.random()}`,
        component_item_id: ingId || `custom-${Date.now()}`,
        component_item_name: ingName,
        qty_required: Number(pickerQty.value) || 1,
        unit: pickerUnit.value,
        wastage_pct: Number(pickerWastage.value) || 0,
      });

      selectedIngItem.value = null;
      customIngName.value   = "";
      pickerQty.value       = 1;
      pickerWastage.value   = 0;
      isIngPickerOpen.value = false;
    });

    const removeLine = $((idx: number) => {
      lines.splice(idx, 1);
    });

    const handleSave = $(async () => {
      if (!selDish.value) {
        error.value = "Please select a target menu dish";
        return;
      }
      if (lines.length === 0) {
        error.value = "Please add at least one raw ingredient";
        return;
      }
      saving.value = true;
      error.value  = null;

      try {
        const res = await invoke<ShopRecipe>("shop_save_recipe", {
          recipe: {
            id: `recipe-${Date.now()}`,
            item_id: selDish.value.id,
            item_name: selDish.value.name,
            yield_qty: Number(yieldQty.value) || 1,
            yield_unit: yieldUnit.value,
            lines: lines.map((l) => ({
              id: l.id,
              component_item_id: l.component_item_id,
              component_item_name: l.component_item_name,
              qty_required: l.qty_required,
              unit: l.unit,
              wastage_pct: l.wastage_pct,
            })),
            notes: notes.value.trim() || undefined,
          },
        });
        await onSaved$(res);
        open.value = false;
        lines.length = 0;
      } catch (e: any) {
        error.value = String(e);
      } finally {
        saving.value = false;
      }
    });

    const filteredDishes = dishes.value.filter((d) =>
      d.name.toLowerCase().includes(dishSearch.value.toLowerCase()) ||
      (d.category_name && d.category_name.toLowerCase().includes(dishSearch.value.toLowerCase()))
    );

    const filteredIngredients = rawItems.value.filter((i) =>
      i.name.toLowerCase().includes(ingSearch.value.toLowerCase()) ||
      (i.category_name && i.category_name.toLowerCase().includes(ingSearch.value.toLowerCase()))
    );

    return (
      <SlideOver
        open={open}
        title="Recipe & BOM Manager"
        subtitle="Dish ingredient breakdown, yield & wastage %"
        width="540px"
        icon="book"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {error.value && (
            <div
              style={{
                background: "#fee2e2",
                color: "#dc2626",
                padding: "0.75rem",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
              }}
            >
              {error.value}
            </div>
          )}

          {/* Section 1: Target Menu Dish (Searchable Popover) */}
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.75rem", marginTop: "-0.5rem" }}>
              The prepared food/drink item from your catalogue that guests order.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              
              {/* Rich Searchable Dish Picker */}
              <div style={{ position: "relative" }}>
                <label style={labelStyle}>Target Menu Dish *</label>

                <button
                  type="button"
                  onClick$={() => {
                    isDishPickerOpen.value = !isDishPickerOpen.value;
                    isIngPickerOpen.value = false;
                  }}
                  style={{
                    ...inputStyle,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  {selDish.value ? (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", overflow: "hidden" }}>
                      <div style={{ width: "24px", height: "24px", borderRadius: "0.25rem", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {selDish.value.media_url ? (
                          <img src={selDish.value.media_url} width={24} height={24} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <LuUtensils style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />
                        )}
                      </div>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)" }}>
                        {selDish.value.name}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        ({selDish.value.category_name})
                      </span>
                      <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--brand-primary)", marginLeft: "auto", paddingRight: "0.5rem" }}>
                        ₹{selDish.value.price}
                      </span>
                    </div>
                  ) : (
                    <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>-- Search & Pick Target Dish --</span>
                  )}
                  <LuChevronDown style="width:1rem;height:1rem;color:var(--text-secondary);flex-shrink:0;" />
                </button>

                {/* Popover list for Dish Picker */}
                {isDishPickerOpen.value && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      zIndex: 60,
                      marginTop: "0.25rem",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                      padding: "0.5rem",
                      maxHeight: "260px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.5rem",
                    }}
                  >
                    <div style={{ position: "relative" }}>
                      <LuSearch style="width:0.875rem;height:0.875rem;position:absolute;left:0.5rem;top:50%;transform:translateY(-50%);color:var(--text-secondary);" />
                      <input
                        type="text"
                        placeholder="Search menu dishes..."
                        value={dishSearch.value}
                        onInput$={(e) => (dishSearch.value = (e.target as HTMLInputElement).value)}
                        style={{
                          width: "100%",
                          padding: "0.35rem 0.5rem 0.35rem 1.75rem",
                          fontSize: "0.8125rem",
                          borderRadius: "0.375rem",
                          border: "1px solid var(--border)",
                          background: "var(--surface-1)",
                          color: "var(--text-primary)",
                          boxSizing: "border-box",
                        }}
                      />
                    </div>

                    <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                      {filteredDishes.length === 0 ? (
                        <div style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          No dishes found
                        </div>
                      ) : (
                        filteredDishes.map((dish) => (
                          <button
                            key={dish.id}
                            type="button"
                            onClick$={() => {
                              selDish.value = dish;
                              isDishPickerOpen.value = false;
                            }}
                            style={{
                              width: "100%",
                              display: "flex",
                              alignItems: "center",
                              gap: "0.5rem",
                              padding: "0.45rem 0.5rem",
                              border: "none",
                              borderRadius: "0.375rem",
                              background: selDish.value?.id === dish.id ? "var(--surface-3)" : "transparent",
                              cursor: "pointer",
                              textAlign: "left",
                            }}
                          >
                            <div style={{ width: "30px", height: "30px", borderRadius: "0.375rem", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                              {dish.media_url ? (
                                <img src={dish.media_url} width={30} height={30} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                              ) : (
                                <LuUtensils style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />
                              )}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {dish.name}
                              </div>
                              <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                                {dish.category_name}
                              </div>
                            </div>
                            <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--brand-primary)" }}>
                              ₹{dish.price}
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div>
                  <label style={labelStyle}>Yield Quantity</label>
                  <input
                    type="number"
                    min="1"
                    value={yieldQty.value}
                    onInput$={(e) => (yieldQty.value = Number((e.target as HTMLInputElement).value))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Yield Unit</label>
                  <input
                    type="text"
                    placeholder="portion, plate, kg"
                    value={yieldUnit.value}
                    onInput$={(e) => (yieldUnit.value = (e.target as HTMLInputElement).value)}
                    style={inputStyle}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Ingredients Breakdown */}
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.75rem", marginTop: "-0.5rem" }}>
              Raw stock/groceries deducted from inventory when this dish is prepared.
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem", marginBottom: "1rem" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                
                {/* Custom Catalogue Dropdown with Images */}
                <div style={{ position: "relative" }}>
                  <label style={labelStyle}>Pick From Inventory</label>
                  
                  <button
                    type="button"
                    onClick$={() => {
                      isIngPickerOpen.value = !isIngPickerOpen.value;
                      isDishPickerOpen.value = false;
                    }}
                    style={{
                      ...inputStyle,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      cursor: "pointer",
                      textAlign: "left",
                    }}
                  >
                    {selectedIngItem.value ? (
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", overflow: "hidden" }}>
                        <div style={{ width: "22px", height: "22px", borderRadius: "0.25rem", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {selectedIngItem.value.media_url ? (
                            <img src={selectedIngItem.value.media_url} width={22} height={22} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          ) : (
                            <LuUtensils style="width:0.75rem;height:0.75rem;color:var(--text-secondary);" />
                          )}
                        </div>
                        <span style={{ fontSize: "0.8125rem", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {selectedIngItem.value.name}
                        </span>
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>-- Pick Stock Item --</span>
                    )}
                    <LuChevronDown style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />
                  </button>

                  {/* Popover list for Ingredients */}
                  {isIngPickerOpen.value && (
                    <div
                      style={{
                        position: "absolute",
                        top: "100%",
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        marginTop: "0.25rem",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                        boxShadow: "0 8px 24px rgba(0,0,0,0.15)",
                        padding: "0.5rem",
                        maxHeight: "240px",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.5rem",
                      }}
                    >
                      <div style={{ position: "relative" }}>
                        <LuSearch style="width:0.875rem;height:0.875rem;position:absolute;left:0.5rem;top:50%;transform:translateY(-50%);color:var(--text-secondary);" />
                        <input
                          type="text"
                          placeholder="Search ingredients..."
                          value={ingSearch.value}
                          onInput$={(e) => (ingSearch.value = (e.target as HTMLInputElement).value)}
                          style={{
                            width: "100%",
                            padding: "0.35rem 0.5rem 0.35rem 1.75rem",
                            fontSize: "0.8125rem",
                            borderRadius: "0.375rem",
                            border: "1px solid var(--border)",
                            background: "var(--surface-1)",
                            color: "var(--text-primary)",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>

                      <div style={{ overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                        {filteredIngredients.length === 0 ? (
                          <div style={{ padding: "0.75rem", textAlign: "center", fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                            No items found
                          </div>
                        ) : (
                          filteredIngredients.map((item) => (
                            <button
                              key={item.id}
                              type="button"
                              onClick$={() => {
                                selectedIngItem.value = item;
                                customIngName.value = "";
                                isIngPickerOpen.value = false;
                              }}
                              style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                                padding: "0.4rem 0.5rem",
                                border: "none",
                                borderRadius: "0.375rem",
                                background: selectedIngItem.value?.id === item.id ? "var(--surface-3)" : "transparent",
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                            >
                              <div style={{ width: "28px", height: "28px", borderRadius: "0.375rem", overflow: "hidden", background: "var(--surface-3)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {item.media_url ? (
                                  <img src={item.media_url} width={28} height={28} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                ) : (
                                  <LuUtensils style="width:0.875rem;height:0.875rem;color:var(--text-secondary);" />
                                )}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontSize: "0.8125rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                  {item.name}
                                </div>
                                <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                                  {item.category_name}
                                </div>
                              </div>
                              {item.price !== undefined && item.price > 0 && (
                                <span style={{ fontSize: "0.75rem", fontWeight: 700, color: "var(--brand-primary)" }}>
                                  ₹{item.price}
                                </span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Or Type Custom Ingredient</label>
                  <input
                    type="text"
                    placeholder="e.g. Fresh Paneer, Spices"
                    value={customIngName.value}
                    onInput$={(e) => {
                      customIngName.value = (e.target as HTMLInputElement).value;
                      if (customIngName.value) selectedIngItem.value = null;
                    }}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-end" }}>
                <div style={{ flex: 1 }}>
                  <label style={labelStyle}>Qty Required</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    placeholder="Qty"
                    value={pickerQty.value}
                    onInput$={(e) => (pickerQty.value = Number((e.target as HTMLInputElement).value))}
                    style={inputStyle}
                  />
                </div>

                <div style={{ width: "90px" }}>
                  <label style={labelStyle}>Unit</label>
                  <select
                    value={pickerUnit.value}
                    onChange$={(e) => (pickerUnit.value = (e.target as HTMLSelectElement).value)}
                    style={inputStyle}
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="ml">ml</option>
                    <option value="L">L</option>
                    <option value="pcs">pcs</option>
                    <option value="tsp">tsp</option>
                    <option value="tbsp">tbsp</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick$={addIngredient}
                  disabled={!selectedIngItem.value && !customIngName.value.trim()}
                  style={{
                    height: "2.25rem",
                    padding: "0 1rem",
                    background: selectedIngItem.value || customIngName.value.trim() ? "var(--button-primary-bg)" : "var(--muted)",
                    color: selectedIngItem.value || customIngName.value.trim() ? "var(--button-primary-text)" : "var(--text-secondary)",
                    border: "none",
                    borderRadius: "0.375rem",
                    fontSize: "0.8125rem",
                    fontWeight: 600,
                    cursor: selectedIngItem.value || customIngName.value.trim() ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.3rem",
                  }}
                >
                  <LuPlus style="width:0.875rem;height:0.875rem;" />
                  Add Item
                </button>
              </div>
            </div>

            {/* Added Ingredients Table */}
            {lines.length === 0 ? (
              <div
                style={{
                  padding: "2rem",
                  textAlign: "center",
                  background: "var(--surface-1)",
                  borderRadius: "0.375rem",
                  border: "1px dashed var(--border)",
                  color: "var(--text-secondary)",
                  fontSize: "0.8125rem",
                }}
              >
                No raw ingredients added yet. Pick or type an ingredient above and click Add Item.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {lines.map((item, idx) => (
                  <div
                    key={item.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.625rem 0.75rem",
                      background: "var(--surface-1)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                    }}
                  >
                    <div>
                      <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{item.component_item_name}</span>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <span style={{ fontWeight: 700, fontSize: "0.875rem", background: "var(--surface-3)", padding: "0.2rem 0.5rem", borderRadius: "0.25rem" }}>
                        {item.qty_required} {item.unit || "g"}
                      </span>
                      <button
                        type="button"
                        onClick$={() => removeLine(idx)}
                        style={{
                          background: "none",
                          border: "none",
                          color: "#dc2626",
                          cursor: "pointer",
                        }}
                      >
                        <LuTrash2 style="width:0.875rem;height:0.875rem;" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div q:slot="footer" style={{ borderTop: "1px solid var(--border)", padding: "1rem 1.5rem", background: "var(--surface-1)" }}>
          <button
            type="button"
            onClick$={handleSave}
            disabled={saving.value}
            style={{
              width: "100%",
              height: "2.625rem",
              background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
              color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: saving.value ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "background 150ms ease, opacity 150ms ease",
            }}
          >
            {saving.value ? (
              <>
                <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                Saving Recipe…
              </>
            ) : (
              <>
                <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                Save Recipe (BOM)
              </>
            )}
          </button>
        </div>
      </SlideOver>
    );
  }
);

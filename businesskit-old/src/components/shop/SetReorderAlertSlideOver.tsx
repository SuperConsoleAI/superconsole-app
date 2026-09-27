// src/components/shop/SetReorderAlertSlideOver.tsx
//
// WHAT: Slide-over panel to create or update a reorder alert (shop_reorder_rules).
//       Explains how the rule works, lets you pick item + warehouse,
//       set Min Qty and Reorder Qty, then saves via shop_set_reorder_rule.
//
// PROPS:
//   open                — Signal<boolean> controls visibility
//   onSaved$            — called after a successful save (parent reloads list)
//   prefillItemId       — optional item_id or Signal<string | undefined> to pre-select
//   prefillWarehouseId  — optional warehouse_id or Signal<string | undefined> to pre-select
//
// IPC: shop_list_items, shop_list_warehouses, shop_get_reorder_rule, shop_set_reorder_rule

import {
  component$,
  useSignal,
  useVisibleTask$,
  useComputed$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { SlideOver } from "~/components/SlideOver";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ShopItem {
  id: string;
  name: string;
  sku?: string | null;
}

interface Warehouse {
  id: string;
  name: string;
  is_default: number;
}

interface ReorderRuleRecord {
  id: string;
  item_id: string;
  warehouse_id: string;
  min_qty: number;
  reorder_qty: number;
  is_active: number;
}

export interface SetReorderAlertSlideOverProps {
  open: Signal<boolean>;
  onSaved$: PropFunction<() => void>;
  prefillItemId?: string | Signal<string | undefined>;
  prefillWarehouseId?: string | Signal<string | undefined>;
}

// ── Style atoms ───────────────────────────────────────────────────────────────

const inp = {
  height: "2.375rem",
  width: "100%",
  padding: "0 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  boxSizing: "border-box" as const,
  fontFamily: "inherit",
};

const lbl = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

// ── Component ─────────────────────────────────────────────────────────────────

export const SetReorderAlertSlideOver = component$<SetReorderAlertSlideOverProps>((props) => {
  const shopItems = useSignal<ShopItem[]>([]);
  const warehouses = useSignal<Warehouse[]>([]);
  const loading = useSignal(false);
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);
  const hasExistingRule = useSignal(false);

  // Form state
  const itemId = useSignal("");
  const wareId = useSignal("");
  const minQty = useSignal("5");
  const reorderQty = useSignal("20");
  const search = useSignal("");

  const loadRuleForSelection = $(async (itId: string, whId: string) => {
    if (!itId) {
      hasExistingRule.value = false;
      return;
    }
    try {
      const rule = await invoke<ReorderRuleRecord | null>("shop_get_reorder_rule", {
        itemId: itId,
        warehouseId: whId ? whId : null,
      });
      if (rule) {
        minQty.value = String(rule.min_qty);
        reorderQty.value = String(rule.reorder_qty);
        hasExistingRule.value = true;
      } else {
        hasExistingRule.value = false;
      }
    } catch {
      hasExistingRule.value = false;
    }
  });

  // Load items + warehouses when panel opens or prefill changes
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const isOpen = track(() => props.open.value);
    const pItemId = track(() => {
      if (!props.prefillItemId) return "";
      return typeof props.prefillItemId === "string" ? props.prefillItemId : props.prefillItemId.value ?? "";
    });
    const pWhId = track(() => {
      if (!props.prefillWarehouseId) return "";
      return typeof props.prefillWarehouseId === "string" ? props.prefillWarehouseId : props.prefillWarehouseId.value ?? "";
    });

    if (!isOpen) {
      error.value = null;
      search.value = "";
      itemId.value = "";
      return;
    }

    loading.value = true;
    try {
      const [its, whs] = await Promise.all([
        invoke<ShopItem[]>("shop_list_items", {}).catch(() => [] as ShopItem[]),
        invoke<Warehouse[]>("shop_list_warehouses", {}).catch(() => [] as Warehouse[]),
      ]);

      const targetItemId = pItemId || "";
      const targetWhId = pWhId || whs.find((w) => w.is_default)?.id || whs[0]?.id || "";

      // If target item is not in its list, fetch it specifically so it always selects properly
      if (targetItemId && !its.some((i) => i.id === targetItemId)) {
        try {
          const singleItem = await invoke<ShopItem | null>("shop_get_item", { id: targetItemId });
          if (singleItem) {
            its.unshift(singleItem);
          }
        } catch (err) {
          void err;
        }
      }

      shopItems.value = its;
      warehouses.value = whs;

      itemId.value = targetItemId;
      wareId.value = targetWhId;

      if (targetItemId) {
        await loadRuleForSelection(targetItemId, targetWhId);
      } else {
        minQty.value = "5";
        reorderQty.value = "20";
        hasExistingRule.value = false;
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  });

  const filtered = useComputed$(() => {
    const q = search.value.toLowerCase().trim();
    if (!q) return shopItems.value;
    return shopItems.value.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.sku ?? "").toLowerCase().includes(q)
    );
  });

  const selectedItem = useComputed$(() =>
    shopItems.value.find((i) => i.id === itemId.value) ?? null
  );

  const handleSelectItem = $(async (item: ShopItem) => {
    itemId.value = item.id;
    search.value = "";
    await loadRuleForSelection(item.id, wareId.value);
  });

  const handleWarehouseChange = $(async (newWhId: string) => {
    wareId.value = newWhId;
    if (itemId.value) {
      await loadRuleForSelection(itemId.value, newWhId);
    }
  });

  const handleSave = $(async () => {
    if (!itemId.value) {
      error.value = "Please select an item.";
      return;
    }
    saving.value = true;
    error.value = null;
    try {
      await invoke("shop_set_reorder_rule", {
        data: {
          item_id: itemId.value,
          warehouse_id: wareId.value || undefined,
          min_qty: parseFloat(minQty.value) || 0,
          reorder_qty: parseFloat(reorderQty.value) || 0,
        },
      });
      props.open.value = false;
      await props.onSaved$();
    } catch (e: any) {
      console.error("[SetReorderAlert] save failed:", e);
      error.value = typeof e === "string" ? e : e?.message || "Failed to save reorder alert";
    } finally {
      saving.value = false;
    }
  });

  return (
    <SlideOver
      open={props.open}
      title="Set Reorder Alert"
      subtitle="Get flagged when stock drops below threshold."
      width="420px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
        {/* ── How it works callout ─────────────────────────────────────── */}
        <div
          style={{
            display: "flex",
            gap: "0.75rem",
            alignItems: "flex-start",
            padding: "0.875rem 1rem",
            background:
              "linear-gradient(135deg, rgba(var(--accent-rgb,99,102,241),0.06) 0%, rgba(var(--accent-rgb,99,102,241),0.02) 100%)",
            border: "1px solid rgba(var(--accent-rgb,99,102,241),0.18)",
            borderRadius: "0.5rem",
          }}
        >
          <div style={{ fontSize: "1.25rem", lineHeight: 1, marginTop: "0.05rem" }}>
            🔔
          </div>
          <div
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              lineHeight: "1.65",
            }}
          >
            <strong
              style={{
                color: "var(--text-primary)",
                display: "block",
                marginBottom: "0.2rem",
              }}
            >
              How this works
            </strong>
            When <em>stock on hand ≤ Min Qty</em>, the item appears in the{" "}
            <strong>Triggered Alerts</strong> tab. You can review all configured
            alerts under <strong>All Rules</strong>.
            Saving again for the same item updates the threshold.
          </div>
        </div>

        {/* ── Error ───────────────────────────────────────────────────── */}
        {error.value && (
          <div
            style={{
              padding: "0.625rem 0.875rem",
              background: "rgba(239,68,68,0.07)",
              border: "1px solid rgba(239,68,68,0.22)",
              borderRadius: "0.375rem",
              color: "var(--error)",
              fontSize: "0.8125rem",
            }}
          >
            {error.value}
          </div>
        )}

        {/* ── Item picker ─────────────────────────────────────────────── */}
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.375rem",
            }}
          >
            <label style={lbl}>Item *</label>
            {hasExistingRule.value && (
              <span
                style={{
                  fontSize: "0.72rem",
                  fontWeight: "600",
                  color: "var(--accent)",
                  background: "rgba(var(--accent-rgb,99,102,241),0.1)",
                  padding: "0.1rem 0.45rem",
                  borderRadius: "0.25rem",
                }}
              >
                Editing existing rule
              </span>
            )}
          </div>

          {/* Selected chip */}
          {selectedItem.value && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                marginBottom: "0.5rem",
                padding: "0.5rem 0.75rem",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                style={{ color: "var(--accent)", flexShrink: 0 }}
              >
                <path d="M20 7H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2Z" />
                <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
              </svg>
              <span
                style={{
                  flex: 1,
                  fontWeight: "500",
                  fontSize: "0.875rem",
                  color: "var(--text-primary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {selectedItem.value.name}
                {selectedItem.value.sku && (
                  <span
                    style={{
                      color: "var(--text-secondary)",
                      fontWeight: "400",
                      marginLeft: "0.375rem",
                      fontFamily: "monospace",
                      fontSize: "0.8rem",
                    }}
                  >
                    ({selectedItem.value.sku})
                  </span>
                )}
              </span>
              <button
                type="button"
                onClick$={() => {
                  itemId.value = "";
                  search.value = "";
                  hasExistingRule.value = false;
                }}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  fontSize: "1rem",
                  lineHeight: 1,
                  padding: "0.1rem",
                }}
              >
                ✕
              </button>
            </div>
          )}

          {/* Search + list */}
          {!selectedItem.value && (
            <div
              style={{
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  padding: "0.5rem",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface-2)",
                }}
              >
                <div style={{ position: "relative" }}>
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    style={{
                      position: "absolute",
                      left: "0.6rem",
                      top: "50%",
                      transform: "translateY(-50%)",
                      color: "var(--text-secondary)",
                      pointerEvents: "none",
                    }}
                  >
                    <circle cx="11" cy="11" r="8" />
                    <path d="m21 21-4.35-4.35" />
                  </svg>
                  <input
                    type="search"
                    placeholder="Search items…"
                    value={search.value}
                    onInput$={(e) => {
                      search.value = (e.target as HTMLInputElement).value;
                    }}
                    style={{
                      ...inp,
                      paddingLeft: "2rem",
                      height: "2rem",
                      fontSize: "0.8125rem",
                    }}
                    autoFocus
                  />
                </div>
              </div>
              <div
                style={{
                  maxHeight: "12rem",
                  overflowY: "auto",
                  background: "var(--surface-1)",
                }}
              >
                {loading.value ? (
                  <div
                    style={{
                      padding: "1.25rem",
                      textAlign: "center",
                      color: "var(--text-secondary)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    Loading items…
                  </div>
                ) : filtered.value.length === 0 ? (
                  <div
                    style={{
                      padding: "1.25rem",
                      textAlign: "center",
                      color: "var(--text-secondary)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    No items found
                  </div>
                ) : (
                  filtered.value.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick$={$(() => handleSelectItem(item))}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.5rem",
                        width: "100%",
                        padding: "0.6rem 0.875rem",
                        background: "transparent",
                        border: "none",
                        borderBottom: "1px solid var(--border)",
                        cursor: "pointer",
                        textAlign: "left",
                        transition: "background 0.1s",
                      }}
                    >
                      <span
                        style={{
                          flex: 1,
                          fontWeight: "500",
                          fontSize: "0.875rem",
                          color: "var(--text-primary)",
                        }}
                      >
                        {item.name}
                      </span>
                      {item.sku && (
                        <span
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            fontFamily: "monospace",
                          }}
                        >
                          {item.sku}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Warehouse ────────────────────────────────────────────────── */}
        <div>
          <label style={lbl}>Warehouse *</label>
          <select
            value={wareId.value}
            onChange$={(e) => {
              handleWarehouseChange((e.target as HTMLSelectElement).value);
            }}
            style={{ ...inp, cursor: "pointer" }}
          >
            {warehouses.value.length === 0 && (
              <option value="">Main Warehouse (Default)</option>
            )}
            {warehouses.value.map((w) => (
              <option key={w.id} value={w.id}>
                {`${w.name}${w.is_default ? " (default)" : ""}`}
              </option>
            ))}
          </select>
        </div>

        {/* ── Qty fields ───────────────────────────────────────────────── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.875rem",
          }}
        >
          <div>
            <label style={lbl}>Min Qty</label>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                marginBottom: "0.4rem",
              }}
            >
              Alert when stock ≤ this
            </div>
            <input
              type="number"
              min="0"
              step="1"
              value={minQty.value}
              onInput$={(e) => {
                minQty.value = (e.target as HTMLInputElement).value;
              }}
              style={inp}
            />
          </div>
          <div>
            <label style={lbl}>Reorder Qty</label>
            <div
              style={{
                fontSize: "0.75rem",
                color: "var(--text-secondary)",
                marginBottom: "0.4rem",
              }}
            >
              Suggested purchase qty
            </div>
            <input
              type="number"
              min="0"
              step="1"
              value={reorderQty.value}
              onInput$={(e) => {
                reorderQty.value = (e.target as HTMLInputElement).value;
              }}
              style={inp}
            />
          </div>
        </div>

        {/* ── Preview pill ─────────────────────────────────────────────── */}
        {selectedItem.value && (
          <div
            style={{
              padding: "0.625rem 0.875rem",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
            }}
          >
            Alert when{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {selectedItem.value.name}
            </strong>{" "}
            stock drops to{" "}
            <strong style={{ color: "var(--error)" }}>
              {minQty.value || "0"}
            </strong>{" "}
            or below. Suggest ordering{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {reorderQty.value || "0"}
            </strong>{" "}
            units.
          </div>
        )}

        {/* ── Footer ───────────────────────────────────────────────────── */}
        <div
          style={{
            position: "sticky",
            bottom: "-1.5rem",
            margin: "0 -1.5rem -1.5rem",
            padding: "1rem 1.5rem",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            type="button"
            disabled={saving.value}
            onClick$={handleSave}
            style={{
              width: "100%",
              height: "2.625rem",
              background: saving.value
                ? "var(--muted)"
                : "var(--button-primary-bg)",
              color: saving.value
                ? "var(--text-secondary)"
                : "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.9375rem",
              fontWeight: "600",
              cursor: saving.value ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "background 150ms ease",
            }}
          >
            {saving.value
              ? "Saving…"
              : hasExistingRule.value
              ? "Update Alert"
              : "Set Alert"}
          </button>
        </div>
      </div>
    </SlideOver>
  );
});

// src/routes/dashboard/shop/products/reorder/index.tsx
//
// Phase 2 — Reorder / Low Stock Alerts
//
// How shop_reorder_rules works:
//   One rule per (item_id, warehouse_id) pair (UNIQUE index).
//   When stock (SUM qty_in - SUM qty_out from ledger) <= min_qty,
//   the item is flagged in Triggered Alerts.
//   All configured rules can be managed in the All Rules tab.
//
// IPC: shop_get_low_stock_items, shop_get_all_reorder_rules, shop_set_reorder_rule, shop_delete_reorder_rule

import {
  component$,
  useSignal,
  useContext,
  useVisibleTask$,
  useComputed$,
  $,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { SetReorderAlertSlideOver } from "~/components/shop/SetReorderAlertSlideOver";
import { ProductsCtx, type LowStockItem } from "../layout";

const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));

const smallInp = {
  height: "1.875rem",
  width: "5.5rem",
  padding: "0 0.5rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.25rem",
  color: "var(--text-primary)",
  fontSize: "0.8125rem",
  outline: "none",
  boxSizing: "border-box" as const,
};

export default component$(() => {
  const store = useContext(ProductsCtx);
  const triggeredItems = useSignal<LowStockItem[]>(store.lowStockItems);
  const allRules = useSignal<LowStockItem[]>([]);
  const loading = useSignal(true);
  const showAlert = useSignal(false);
  const activeTab = useSignal<"triggered" | "all">("triggered");
  const searchQuery = useSignal("");

  // Slide-over prefill state
  const editItemId = useSignal<string | undefined>(undefined);
  const editWarehouseId = useSignal<string | undefined>(undefined);

  // Inline edit state
  const editingKey = useSignal<string | null>(null);
  const editMin = useSignal("0");
  const editReorder = useSignal("0");
  const editSaving = useSignal(false);
  const deletingKey = useSignal<string | null>(null);

  const load = $(async () => {
    loading.value = true;
    try {
      const [triggeredRes, allRes] = await Promise.all([
        invoke<LowStockItem[]>("shop_get_low_stock_items", {}).catch(() => []),
        invoke<LowStockItem[]>("shop_get_all_reorder_rules", {}).catch(() => []),
      ]);
      triggeredItems.value = Array.isArray(triggeredRes) ? triggeredRes : [];
      allRules.value = Array.isArray(allRes) ? allRes : [];
      store.lowStockItems = triggeredItems.value;
    } catch (e) {
      console.error("[Reorder] load failed:", e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await load();
  });

  const displayedList = useComputed$(() => {
    const base =
      activeTab.value === "triggered"
        ? triggeredItems.value
        : allRules.value;
    const q = searchQuery.value.toLowerCase().trim();
    if (!q) return base;
    return base.filter(
      (item) =>
        item.item_name.toLowerCase().includes(q) ||
        (item.sku ?? "").toLowerCase().includes(q) ||
        item.warehouse_name.toLowerCase().includes(q)
    );
  });

  const openCreateSlideOver = $(() => {
    editItemId.value = undefined;
    editWarehouseId.value = undefined;
    showAlert.value = true;
  });

  const openEditSlideOver = $((item: LowStockItem) => {
    editItemId.value = item.item_id;
    editWarehouseId.value = item.warehouse_id;
    showAlert.value = true;
  });

  const startInlineEdit = $((item: LowStockItem) => {
    editingKey.value = `${item.item_id}::${item.warehouse_id}`;
    editMin.value = String(item.min_qty);
    editReorder.value = String(item.reorder_qty);
  });

  const saveInlineEdit = $(async (item: LowStockItem) => {
    editSaving.value = true;
    try {
      await invoke("shop_set_reorder_rule", {
        data: {
          item_id: item.item_id,
          warehouse_id: item.warehouse_id,
          min_qty: parseFloat(editMin.value) || 0,
          reorder_qty: parseFloat(editReorder.value) || 0,
        },
      });
      editingKey.value = null;
      await load();
      store.refresh();
    } catch (e) {
      console.error("[Reorder] inline save failed:", e);
    } finally {
      editSaving.value = false;
    }
  });

  const deleteRule = $(async (item: LowStockItem) => {
    const key = `${item.item_id}::${item.warehouse_id}`;
    if (!confirm(`Remove reorder alert for "${item.item_name}"?`)) return;
    deletingKey.value = key;
    try {
      await invoke("shop_delete_reorder_rule", {
        itemId: item.item_id,
        warehouseId: item.warehouse_id,
      });
      await load();
      store.refresh();
    } catch (e) {
      console.error("[Reorder] delete rule failed:", e);
    } finally {
      deletingKey.value = null;
    }
  });

  return (
    <>
      {/* ── SetReorderAlert panel ─────────────────────────────────────────── */}
      <SetReorderAlertSlideOver
        open={showAlert}
        prefillItemId={editItemId}
        prefillWarehouseId={editWarehouseId}
        onSaved$={$(async () => {
          await load();
          store.refresh();
        })}
      />

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1.25rem",
          gap: "1rem",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              fontSize: "1rem",
              fontWeight: "600",
              color: "var(--text-primary)",
              margin: 0,
            }}
          >
            Reorder Alerts
          </h2>
          <p
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              margin: "0.25rem 0 0",
            }}
          >
            Configure inventory thresholds and monitor low stock items.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <button
            type="button"
            onClick$={load}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.35rem",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              padding: "0 0.75rem",
              height: "2.25rem",
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <path d="M23 4v6h-6" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
            Refresh
          </button>
          <button
            type="button"
            onClick$={openCreateSlideOver}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "var(--button-primary-bg)",
              color: "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              padding: "0 0.875rem",
              height: "2.25rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: "pointer",
            }}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2.5"
            >
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Set Alert
          </button>
        </div>
      </div>

      {/* ── Tabs & Search Bar ──────────────────────────────────────────────── */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          marginBottom: "1rem",
          flexWrap: "wrap",
        }}
      >
        {/* Tab Pills */}
        <div
          style={{
            display: "inline-flex",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "0.2rem",
            gap: "0.25rem",
          }}
        >
          <button
            type="button"
            onClick$={() => {
              activeTab.value = "triggered";
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.35rem 0.75rem",
              borderRadius: "0.375rem",
              border: "none",
              fontSize: "0.8125rem",
              fontWeight: activeTab.value === "triggered" ? "600" : "500",
              background:
                activeTab.value === "triggered"
                  ? "var(--surface-1)"
                  : "transparent",
              color:
                activeTab.value === "triggered"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              boxShadow:
                activeTab.value === "triggered"
                  ? "0 1px 3px rgba(0,0,0,0.08)"
                  : "none",
              cursor: "pointer",
            }}
          >
            <span>Triggered Alerts</span>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "0.05rem 0.4rem",
                borderRadius: "1rem",
                fontWeight: "700",
                background:
                  triggeredItems.value.length > 0
                    ? "rgba(239,68,68,0.15)"
                    : "var(--surface-3)",
                color:
                  triggeredItems.value.length > 0
                    ? "var(--error)"
                    : "var(--text-secondary)",
              }}
            >
              {triggeredItems.value.length}
            </span>
          </button>

          <button
            type="button"
            onClick$={() => {
              activeTab.value = "all";
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.35rem 0.75rem",
              borderRadius: "0.375rem",
              border: "none",
              fontSize: "0.8125rem",
              fontWeight: activeTab.value === "all" ? "600" : "500",
              background:
                activeTab.value === "all" ? "var(--surface-1)" : "transparent",
              color:
                activeTab.value === "all"
                  ? "var(--text-primary)"
                  : "var(--text-secondary)",
              boxShadow:
                activeTab.value === "all"
                  ? "0 1px 3px rgba(0,0,0,0.08)"
                  : "none",
              cursor: "pointer",
            }}
          >
            <span>All Rules</span>
            <span
              style={{
                fontSize: "0.72rem",
                padding: "0.05rem 0.4rem",
                borderRadius: "1rem",
                fontWeight: "700",
                background: "var(--surface-3)",
                color: "var(--text-secondary)",
              }}
            >
              {allRules.value.length}
            </span>
          </button>
        </div>

        {/* Search */}
        <div style={{ position: "relative", minWidth: "220px", flex: "1 1 200px", maxWidth: "340px" }}>
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            style={{
              position: "absolute",
              left: "0.65rem",
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
            placeholder="Search rules by item or warehouse…"
            value={searchQuery.value}
            onInput$={(e) => {
              searchQuery.value = (e.target as HTMLInputElement).value;
            }}
            style={{
              height: "2.125rem",
              width: "100%",
              padding: "0 0.75rem 0 2rem",
              background: "var(--field-fill)",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              color: "var(--text-primary)",
              fontSize: "0.8125rem",
              outline: "none",
              boxSizing: "border-box",
            }}
          />
        </div>
      </div>

      {/* ── Content ──────────────────────────────────────────────────────── */}
      {loading.value ? (
        <div
          style={{
            textAlign: "center",
            padding: "3rem 0",
            color: "var(--text-secondary)",
            fontSize: "0.875rem",
          }}
        >
          Checking stock levels & alerts…
        </div>
      ) : displayedList.value.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 0" }}>
          <div style={{ fontSize: "2.5rem", marginBottom: "0.75rem" }}>🔔</div>
          <div
            style={{
              fontSize: "0.9375rem",
              fontWeight: "600",
              color: "var(--text-primary)",
              marginBottom: "0.375rem",
            }}
          >
            {activeTab.value === "triggered"
              ? "No alerts currently triggered"
              : searchQuery.value
              ? "No matching reorder rules"
              : "No reorder rules configured yet"}
          </div>
          <div
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-secondary)",
              marginBottom: "1.5rem",
              maxWidth: "24rem",
              margin: "0 auto 1.5rem",
              lineHeight: 1.5,
            }}
          >
            {activeTab.value === "triggered"
              ? allRules.value.length > 0
                ? "All configured items are currently above their reorder minimums. Click 'All Rules' tab to view or adjust them."
                : "Configure alerts to get notified whenever an item's stock on hand drops to or below a minimum quantity."
              : "Set minimum and reorder quantities for your items to keep track of stock restocking requirements."}
          </div>
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "center" }}>
            {activeTab.value === "triggered" && allRules.value.length > 0 && (
              <button
                type="button"
                onClick$={() => {
                  activeTab.value = "all";
                }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  padding: "0 1rem",
                  height: "2.375rem",
                  fontSize: "0.875rem",
                  fontWeight: "500",
                  cursor: "pointer",
                }}
              >
                View All Rules ({allRules.value.length})
              </button>
            )}
            <button
              type="button"
              onClick$={openCreateSlideOver}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
                background: "var(--button-primary-bg)",
                color: "var(--button-primary-text)",
                border: "none",
                borderRadius: "0.375rem",
                padding: "0 1.25rem",
                height: "2.375rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2.5"
              >
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              Set New Alert
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.875rem",
            }}
          >
            <thead>
              <tr
                style={{
                  background: "var(--surface-3)",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                {[
                  "Item",
                  "Warehouse",
                  "Status",
                  "On Hand",
                  "Min Qty",
                  "Reorder Qty",
                  "Actions",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      padding: "0.625rem 0.875rem",
                      textAlign: "left",
                      fontWeight: "600",
                      color: "var(--text-secondary)",
                      fontSize: "0.75rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.04em",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedList.value.map((item) => {
                const key = `${item.item_id}::${item.warehouse_id}`;
                const isEditing = editingKey.value === key;
                const isZero = item.qty_on_hand <= 0;
                const isLow = item.qty_on_hand <= item.min_qty;
                const isDeleting = deletingKey.value === key;

                return (
                  <tr
                    key={key}
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    {/* Item name + SKU */}
                    <td style={{ padding: "0.625rem 0.875rem" }}>
                      <div
                        style={{
                          fontWeight: "500",
                          color: "var(--text-primary)",
                        }}
                      >
                        {item.item_name}
                      </div>
                      {item.sku && (
                        <div
                          style={{
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                            fontFamily: "monospace",
                            marginTop: "0.1rem",
                          }}
                        >
                          {item.sku}
                        </div>
                      )}
                    </td>

                    {/* Warehouse */}
                    <td
                      style={{
                        padding: "0.625rem 0.875rem",
                        color: "var(--text-secondary)",
                      }}
                    >
                      {item.warehouse_name}
                    </td>

                    {/* Status Badge */}
                    <td style={{ padding: "0.625rem 0.875rem" }}>
                      {isZero ? (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: "700",
                            background: "rgba(239,68,68,0.12)",
                            color: "var(--error)",
                            border: "1px solid rgba(239,68,68,0.3)",
                            borderRadius: "0.2rem",
                            padding: "0.1rem 0.4rem",
                            letterSpacing: "0.04em",
                          }}
                        >
                          OUT OF STOCK
                        </span>
                      ) : isLow ? (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: "700",
                            background: "rgba(245,158,11,0.12)",
                            color: "#f59e0b",
                            border: "1px solid rgba(245,158,11,0.3)",
                            borderRadius: "0.2rem",
                            padding: "0.1rem 0.4rem",
                            letterSpacing: "0.04em",
                          }}
                        >
                          LOW STOCK
                        </span>
                      ) : (
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: "700",
                            background: "rgba(16,185,129,0.12)",
                            color: "#10b981",
                            border: "1px solid rgba(16,185,129,0.3)",
                            borderRadius: "0.2rem",
                            padding: "0.1rem 0.4rem",
                            letterSpacing: "0.04em",
                          }}
                        >
                          IN STOCK
                        </span>
                      )}
                    </td>

                    {/* On hand */}
                    <td style={{ padding: "0.625rem 0.875rem" }}>
                      <span
                        style={{
                          fontWeight: "700",
                          color: isZero
                            ? "var(--error)"
                            : isLow
                            ? "#f59e0b"
                            : "var(--text-primary)",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmt(item.qty_on_hand)}
                      </span>
                    </td>

                    {/* Editable min / reorder */}
                    {isEditing ? (
                      <>
                        <td style={{ padding: "0.5rem 0.875rem" }}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={editMin.value}
                            onInput$={(e) => {
                              editMin.value = (e.target as HTMLInputElement).value;
                            }}
                            style={smallInp}
                          />
                        </td>
                        <td style={{ padding: "0.5rem 0.875rem" }}>
                          <input
                            type="number"
                            min="0"
                            step="1"
                            value={editReorder.value}
                            onInput$={(e) => {
                              editReorder.value = (e.target as HTMLInputElement).value;
                            }}
                            style={smallInp}
                          />
                        </td>
                        <td style={{ padding: "0.5rem 0.875rem" }}>
                          <div style={{ display: "flex", gap: "0.375rem" }}>
                            <button
                              type="button"
                              disabled={editSaving.value}
                              onClick$={$(() => saveInlineEdit(item))}
                              style={{
                                height: "1.875rem",
                                padding: "0 0.625rem",
                                background: "var(--button-primary-bg)",
                                color: "var(--button-primary-text)",
                                border: "none",
                                borderRadius: "0.25rem",
                                fontSize: "0.8125rem",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              {editSaving.value ? "…" : "Save"}
                            </button>
                            <button
                              type="button"
                              onClick$={() => {
                                editingKey.value = null;
                              }}
                              style={{
                                height: "1.875rem",
                                padding: "0 0.5rem",
                                background: "transparent",
                                color: "var(--text-secondary)",
                                border: "1px solid var(--border)",
                                borderRadius: "0.25rem",
                                fontSize: "0.8125rem",
                                cursor: "pointer",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td
                          style={{
                            padding: "0.625rem 0.875rem",
                            color: "var(--text-secondary)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmt(item.min_qty)}
                        </td>
                        <td
                          style={{
                            padding: "0.625rem 0.875rem",
                            color: "var(--text-secondary)",
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {fmt(item.reorder_qty)}
                        </td>
                        <td style={{ padding: "0.625rem 0.875rem" }}>
                          <div style={{ display: "flex", gap: "0.375rem", alignItems: "center" }}>
                            <button
                              type="button"
                              onClick$={$(() => startInlineEdit(item))}
                              style={{
                                height: "1.875rem",
                                padding: "0 0.625rem",
                                background: "var(--surface-3)",
                                border: "1px solid var(--border)",
                                borderRadius: "0.25rem",
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                              }}
                              title="Quick edit quantities"
                            >
                              Quick Edit
                            </button>
                            <button
                              type="button"
                              onClick$={() => openEditSlideOver(item)}
                              style={{
                                height: "1.875rem",
                                padding: "0 0.5rem",
                                background: "transparent",
                                border: "1px solid var(--border)",
                                borderRadius: "0.25rem",
                                fontSize: "0.75rem",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                              }}
                              title="Full edit dialog"
                            >
                              ⚙️
                            </button>
                            <button
                              type="button"
                              disabled={isDeleting}
                              onClick$={$(() => deleteRule(item))}
                              style={{
                                height: "1.875rem",
                                padding: "0 0.5rem",
                                background: "transparent",
                                border: "1px solid rgba(239,68,68,0.25)",
                                borderRadius: "0.25rem",
                                fontSize: "0.75rem",
                                color: "var(--error)",
                                cursor: isDeleting ? "not-allowed" : "pointer",
                              }}
                              title="Delete this reorder rule"
                            >
                              {isDeleting ? "…" : "🗑️"}
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
});

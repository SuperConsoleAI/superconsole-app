// src/components/shop/AdjustStockSlideOver.tsx
//
// WHAT: Manual stock correction panel.
//       Pick item → enter new qty → pick reason → shop_adjust_stock.
//
// LOADING STRATEGY (why we load what we load):
//   • Opened WITH prefillItemId (from a position row):
//       → only load warehouses + current balance for THAT item.
//       → do NOT load all items — we already know the item.
//       → if user clicks "Change item", lazy-load the full list then.
//   • Opened WITHOUT prefillItemId (standalone button):
//       → load all items + warehouses so user can pick.
//
// IPC: shop_list_items, shop_list_warehouses, shop_adjust_stock,
//      shop_get_stock_position (used only to read current balance)

import {
  component$,
  useSignal,
  useVisibleTask$,
  useComputed$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuLoader } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";

interface ShopItem    { id: string; name: string; sku?: string; }
interface Warehouse   { id: string; name: string; is_default: number; }
interface StockPosition { item_id: string; warehouse_id: string; qty_on_hand: number; }

export interface AdjustStockSlideOverProps {
  open: Signal<boolean>;
  /** Pre-fill item when opening from a specific row */
  prefillItemId?: Signal<string>;
  /** Pre-fill item name (avoids a round-trip when known) */
  prefillItemName?: Signal<string>;
  onSaved$: PropFunction<() => void>;
}

const ADJUSTMENT_TYPES = [
  { value: "count",   label: "Physical Count Correction" },
  { value: "damage",  label: "Damage / Spoilage" },
  { value: "theft",   label: "Theft / Loss" },
  { value: "expiry",  label: "Expired / Write-off" },
  { value: "opening", label: "Opening Stock Entry" },
  { value: "other",   label: "Other" },
];

const inputStyle = {
  width: "100%", height: "2.25rem", padding: "0 0.75rem",
  background: "var(--field-fill)", border: "1px solid var(--border)",
  borderRadius: "0.375rem", color: "var(--text-primary)",
  fontSize: "0.875rem", outline: "none", boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block", fontSize: "0.8125rem",
  fontWeight: "500" as const, color: "var(--text-secondary)", marginBottom: "0.375rem",
};

export const AdjustStockSlideOver = component$<AdjustStockSlideOverProps>(
  ({ open, prefillItemId, prefillItemName, onSaved$ }) => {

    // Reference data
    const allItems     = useSignal<ShopItem[]>([]);  // only loaded when picker is needed
    const warehouses   = useSignal<Warehouse[]>([]);
    const currentQty   = useSignal<number | null>(null);

    // UI state
    const loadingRef   = useSignal(false);  // loading warehouses/balance
    const loadingItems = useSignal(false);  // loading full item list (lazy)
    const showPicker   = useSignal(false);  // show dropdown (when no prefill or user clicks Change)

    // Form state
    const selItemId    = useSignal("");
    const selItemName  = useSignal("");
    const selWareId    = useSignal("");
    const newQty       = useSignal("");
    const adjType      = useSignal("count");
    const reason       = useSignal("");
    const saving       = useSignal(false);
    const error        = useSignal<string | null>(null);


    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async ({ track }) => {
      const isOpen = track(() => open.value);
      if (!isOpen) return;

      // Reset form every open
      newQty.value  = "";
      reason.value  = "";
      adjType.value = "count";
      error.value   = null;

      const prefill = prefillItemId?.value ?? "";

      if (prefill) {
        // ── FAST PATH: item already known ─────────────────────────
        selItemId.value   = prefill;
        selItemName.value = prefillItemName?.value ?? "";
        showPicker.value  = false;
        currentQty.value  = null;

        // Only load warehouses + current balance (no full item list)
        loadingRef.value = true;
        try {
          const [whs, pos] = await Promise.all([
            invoke<Warehouse[]>("shop_list_warehouses", {}).catch(() => [] as Warehouse[]),
            invoke<StockPosition[]>("shop_get_stock_position", {}).catch(() => [] as StockPosition[]),
          ]);
          warehouses.value = whs;
          const defaultWh = whs.find(w => w.is_default) ?? whs[0];
          if (defaultWh) selWareId.value = defaultWh.id;

          // Current balance for this item
          const posRow = pos.find(p => p.item_id === prefill);
          currentQty.value = posRow?.qty_on_hand ?? null;

          // If name not passed via prop, leave blank (inventory page should always pass it)
          if (!selItemName.value) selItemName.value = prefill;
        } finally {
          loadingRef.value = false;
        }

      } else {
        // ── NEEDS PICKER: load items + warehouses together ─────────
        selItemId.value   = "";
        selItemName.value = "";
        currentQty.value  = null;
        showPicker.value  = true;

        loadingRef.value = true;
        try {
          const [its, whs] = await Promise.all([
            invoke<ShopItem[]>("shop_list_items", {}),
            invoke<Warehouse[]>("shop_list_warehouses", {}).catch(() => [] as Warehouse[]),
          ]);
          allItems.value   = its;
          warehouses.value = whs;
          const defaultWh  = whs.find(w => w.is_default) ?? whs[0];
          if (defaultWh) selWareId.value = defaultWh.id;
        } finally {
          loadingRef.value = false;
        }
      }
    });

    // When item is chosen from picker, look up current qty
    const onItemPicked = $(async (itemId: string) => {
      selItemId.value = itemId;
      const item = allItems.value.find(i => i.id === itemId);
      selItemName.value = item?.name ?? "";
      currentQty.value  = null;
      if (!itemId) return;
      try {
        const pos = await invoke<StockPosition[]>("shop_get_stock_position", {});
        const row = pos.find(p => p.item_id === itemId);
        currentQty.value = row?.qty_on_hand ?? null;
      } catch {
        currentQty.value = null;
      }
    });

    const qtyChange = useComputed$(() => {
      const n = parseFloat(newQty.value);
      if (isNaN(n)) return null;
      if (currentQty.value === null) return n; // opening stock
      return n - currentQty.value;
    });

    const handleSave = $(async () => {
      if (!selItemId.value) { error.value = "Select an item."; return; }
      const change = qtyChange.value;
      if (change === null) { error.value = "Enter a valid new quantity."; return; }
      if (change === 0)    { error.value = "No change — new qty equals current qty."; return; }
      if (!reason.value.trim()) { error.value = "Notes / reason is required."; return; }

      saving.value = true;
      error.value  = null;
      try {
        await invoke("shop_adjust_stock", {
          data: {
            item_id:         selItemId.value,
            warehouse_id:    selWareId.value || null,
            qty_change:      change,
            adjustment_type: adjType.value,
            reason:          reason.value.trim(),
          },
        });
        open.value      = false;
        selItemId.value = "";
        newQty.value    = "";
        reason.value    = "";
        error.value     = null;
        await onSaved$();
      } catch (e) {
        error.value = String(e);
      } finally {
        saving.value = false;
      }
    });

    return (
      <SlideOver open={open} title="Adjust Stock" subtitle="Correct stock levels from a physical count or write-off." width="460px">
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

          {error.value && (
            <div style={{ padding: "0.75rem 1rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem" }}>
              {error.value}
            </div>
          )}

          {/* ── Item ─────────────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Item *</label>

            {/* Chip mode: item locked — no changing when opened from a table row */}
            {!showPicker.value && selItemId.value ? (
              <div style={{ padding: "0.5rem 0.875rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", display: "flex", flexDirection: "column", justifyContent: "center", minHeight: "2.25rem" }}>
                <span style={{ fontSize: "0.875rem", color: "var(--text-primary)", fontWeight: "500" }}>{selItemName.value}</span>
                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", fontFamily: "monospace", marginTop: "0.1rem" }}>{selItemId.value}</span>
              </div>
            ) : (
              /* Picker mode */
              loadingItems.value ? (
                <div style={{ height: "2.25rem", display: "flex", alignItems: "center", gap: "0.5rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  <LuLoader style="width:1rem;height:1rem;" /> Loading items…
                </div>
              ) : (
                <select
                  onChange$={(e) => { onItemPicked((e.target as HTMLSelectElement).value); }}
                  style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="">— select item —</option>
                  {allItems.value.map(i => (
                    <option key={i.id} value={i.id} selected={i.id === selItemId.value}>
                      {`${i.name}${i.sku ? ` (${i.sku})` : ""}`}
                    </option>
                  ))}
                </select>
              )
            )}
          </div>

          {/* ── Warehouse ─────────────────────────────────────────── */}
          {!loadingRef.value && warehouses.value.length > 0 && (
            <div>
              <label style={labelStyle}>Warehouse</label>
              <select
                onChange$={(e) => { selWareId.value = (e.target as HTMLSelectElement).value; }}
                style={{ ...inputStyle, cursor: "pointer" }}>
                {warehouses.value.map(w => (
                  <option key={w.id} value={w.id} selected={w.id === selWareId.value}>
                    {`${w.name}${w.is_default ? " (default)" : ""}`}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* ── Current stock chip ──────────────────────────────── */}
          {selItemId.value && !loadingRef.value && (
            <div style={{ padding: "0.625rem 0.875rem", background: "var(--surface-3)", borderRadius: "0.375rem", fontSize: "0.875rem", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-secondary)" }}>Current stock</span>
              <strong style={{ color: currentQty.value !== null && currentQty.value > 0 ? "var(--text-primary)" : "var(--error)", fontSize: "1rem" }}>
                {currentQty.value !== null ? `${currentQty.value} units` : "Not tracked yet"}
              </strong>
            </div>
          )}

          {/* ── New quantity ─────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>New Quantity (after correction) *</label>
            <input type="number" min="0" step="0.01" value={newQty.value}
              onInput$={(e) => { newQty.value = (e.target as HTMLInputElement).value; }}
              placeholder={currentQty.value !== null ? `Currently ${currentQty.value}` : "e.g. 48"}
              style={inputStyle} />
            {qtyChange.value !== null && qtyChange.value !== 0 && (
              <div style={{ marginTop: "0.375rem", fontSize: "0.8125rem", fontWeight: "600", color: qtyChange.value > 0 ? "#22c55e" : "var(--error)" }}>
                {qtyChange.value > 0 ? `+${qtyChange.value}` : qtyChange.value} units will be adjusted
              </div>
            )}
          </div>

          {/* ── Reason type ──────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Reason Type *</label>
            <select
              onChange$={(e) => { adjType.value = (e.target as HTMLSelectElement).value; }}
              style={{ ...inputStyle, cursor: "pointer" }}>
              {ADJUSTMENT_TYPES.map(t => (
                <option key={t.value} value={t.value} selected={t.value === adjType.value}>{t.label}</option>
              ))}
            </select>
          </div>

          {/* ── Notes ────────────────────────────────────────────── */}
          <div>
            <label style={labelStyle}>Notes / Detail *</label>
            <textarea value={reason.value}
              onInput$={(e) => { reason.value = (e.target as HTMLTextAreaElement).value; }}
              placeholder="e.g. Physical count done on 26 Jul, found 45 instead of 47"
              style={{ ...inputStyle, height: "4rem", paddingTop: "0.5rem", resize: "vertical" as const }} />
          </div>

          {/* ── Footer ───────────────────────────────────────────── */}
          <div style={{ position: "sticky", bottom: "-1.5rem", margin: "0 -1.5rem -1.5rem", padding: "1rem 1.5rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
            <button type="button" disabled={saving.value} onClick$={handleSave}
              style={{ width: "100%", height: "2.5rem", background: saving.value ? "var(--muted)" : "var(--button-primary-bg)", color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.9375rem", fontWeight: "600", cursor: saving.value ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}>
              {saving.value ? <><LuLoader style="width:1rem;height:1rem;" /> Saving…</> : "Save Adjustment"}
            </button>
          </div>

        </div>
      </SlideOver>
    );
  }
);

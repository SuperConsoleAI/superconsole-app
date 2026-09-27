// src/routes/dashboard/shop/products/inventory/index.tsx
//
// Phase 2 — Stock Position + Movement History
//
// LAYOUT (top to bottom):
//   1. Stats cards (always visible)
//   2. Toolbar — search (left) | pill toggle | Receive Stock | Refresh (right)
//   3. Tab content
//
// POSITION tab: When does it show data?
//   • A row appears for every item that has at least one entry in shop_stock_ledger
//     (purchases, sales, adjustments, transfers).
//   • Zero-stock rows appear for items where track_inventory = 1 but NO ledger row exists.
//   • If you just set track_inventory = 1 on an item and never received stock → it appears
//     as a zero-stock row.
//   • If stock was received → it shows the live sum (qty_in - qty_out).
//   Currently empty = the warehouse JOIN is missing. Most likely the item was received but
//   the warehouse row doesn't exist in shop_warehouses. Use "Receive Stock" again.
//
// MOVEMENTS tab: lazy-loads 80 rows at a time with "Load More".
//
// IPC: shop_get_stock_position, shop_get_stock_ledger (limit, offset)

import {
  component$,
  useSignal,
  useContext,
  useVisibleTask$,
  useComputed$,
  useStylesScoped$,
  $,
} from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { LuPlus, LuEye, LuBell, LuRefreshCw } from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { ReceiveStockSlideOver } from "~/components/shop/ReceiveStockSlideOver";
import { AdjustStockSlideOver } from "~/components/shop/AdjustStockSlideOver";
import { PurchaseInvoiceView } from "~/components/shop/PurchaseInvoiceView";
import { SetReorderAlertSlideOver } from "~/components/shop/SetReorderAlertSlideOver";
import { ProductsCtx, type StockPosition, type LedgerEntry } from "../layout";

// ── Scoped styles — pill toggle matching ProductTabs ──────────────────────────

const STYLES = `
  .inv-stat-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 0.75rem 1rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    transition: all 0.15s ease;
    box-sizing: border-box;
  }
  .inv-stat-card.clickable {
    cursor: pointer;
  }
  .inv-stat-card.clickable:hover {
    border-color: var(--accent, #3b82f6);
    background: var(--surface-3);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0,0,0,0.06);
  }
  .inv-stat-card.warn {
    border-color: rgba(239,68,68,0.35);
  }
  .inv-toggle {
    display: flex;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    height: 32px;
    box-sizing: border-box;
    align-items: center;
  }
  .inv-tab {
    padding: 0 0.875rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    height: 100%;
    box-sizing: border-box;
    transition: background 0.15s, color 0.15s;
    border: none;
    cursor: pointer;
    white-space: nowrap;
  }
  .inv-tab.active  { background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.12); }
  .inv-tab.inactive { background: transparent; color: var(--text-secondary); }
  .inv-tab.inactive:hover { color: var(--text-primary); }
  .inv-badge {
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
  .inv-toolbar {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    margin-bottom: 1rem;
    flex-wrap: wrap;
  }
  .inv-search-wrap {
    position: relative;
    flex: 1;
    min-width: 12rem;
    max-width: 22rem;
  }
  .inv-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .inv-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    height: 2.25rem;
    padding: 0 0.875rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    cursor: pointer;
    box-sizing: border-box;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .inv-btn-primary {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    border: none;
    font-weight: 600;
  }
  .inv-btn-secondary {
    background: var(--surface-2);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    font-weight: 500;
  }
  .inv-btn-secondary:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }
  @media (max-width: 640px) {
    .inv-toolbar {
      flex-direction: column;
      align-items: stretch;
      gap: 0.5rem;
    }
    .inv-search-wrap {
      width: 100%;
      min-width: 0;
      max-width: 100%;
    }
    .inv-toggle {
      width: 100%;
      display: flex;
    }
    .inv-tab {
      flex: 1 1 0;
      justify-content: center;
      padding: 0 0.25rem;
      font-size: 0.75rem;
      gap: 0.25rem;
      min-width: 0;
      text-align: center;
    }
    .inv-badge {
      font-size: 0.625rem;
      padding: 0 0.25rem;
      min-width: 0.75rem;
    }
    .inv-actions {
      display: flex;
      width: 100%;
      gap: 0.375rem;
      align-items: center;
    }
    .inv-actions > .inv-btn {
      flex: 1 1 0;
      min-width: 0;
      padding: 0 0.35rem;
      font-size: 0.78125rem;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .inv-actions > .pb-refresh-btn {
      flex-shrink: 0;
    }
  }
  @keyframes pb-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .pb-refresh-btn {
    height: 2.25rem;
    width: 2.25rem;
    padding: 0;
    border-radius: 0.375rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
    box-sizing: border-box;
  }
  .pb-refresh-btn:hover:not(:disabled) {
    background: var(--surface-3);
    color: var(--text-primary);
    border-color: var(--border-hover, var(--border));
  }
  .pb-refresh-btn:disabled {
    opacity: 0.65;
    cursor: wait;
  }
  .pb-refresh-spinning {
    animation: pb-spin 0.75s linear infinite;
  }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────

const PAGE = 80;
const fmt = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(2));
const fmtCur = (n: number) =>
  n === 0 ? "—" : `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (ts: number) => {
  if (!ts) return "—";
  const d = new Date(ts * 1000);
  return (
    d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) +
    " " + d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true })
  );
};

const MV: Record<string, { label: string; color: string; bg: string }> = {
  purchase:       { label: "Purchase",     color: "#22c55e", bg: "rgba(34,197,94,0.1)"   },
  opening:        { label: "Opening",      color: "#6366f1", bg: "rgba(99,102,241,0.1)"  },
  sale:           { label: "Sale",         color: "#f59e0b", bg: "rgba(245,158,11,0.1)"  },
  adjustment:     { label: "Adjustment",   color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  adjustment_in:  { label: "Adjustment",   color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  adjustment_out: { label: "Adjustment",   color: "#64748b", bg: "rgba(100,116,139,0.1)" },
  transfer_in:    { label: "Transfer In",  color: "#06b6d4", bg: "rgba(6,182,212,0.1)"   },
  transfer_out:   { label: "Transfer Out", color: "#f97316", bg: "rgba(249,115,22,0.1)"  },
  return:         { label: "Return",       color: "#a855f7", bg: "rgba(168,85,247,0.1)"  },
};
const mv = (type: string) => MV[type] ?? { label: type, color: "var(--text-secondary)", bg: "var(--surface-3)" };

// ── Component ─────────────────────────────────────────────────────────────────

export interface GoodsReceiptSummary {
  id: string;
  doc_number: string;
  ref_number?: string;
  doc_date: number;
  vendor_bill_date?: number;
  status: string;
  subtotal: number;
  cash_discount_pct: number;
  cash_discount_amt: number;
  inward_expense: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  payment_method?: string;
  warehouse_id?: string;
  warehouse_name?: string;
  vendor_id?: string;
  vendor_name?: string;
  line_count: number;
  total_qty: number;
  notes?: string;
  created_at: number;
  updated_at?: number | null;
  user_id?: string | null;
  updated_by?: string | null;
  staff_id?: string | null;
  creator_name?: string | null;
  updater_name?: string | null;
  staff_name?: string | null;
  is_modified?: boolean | null;
  modified_at?: number | null;
  modified_by?: string | null;
}

export default component$(() => {
  useStylesScoped$(STYLES);

  const nav = useNavigate();
  const store      = useContext(ProductsCtx);
  const positions  = useSignal<StockPosition[]>(store.positions);
  const ledger     = useSignal<LedgerEntry[]>(store.ledger);
  const receipts   = useSignal<GoodsReceiptSummary[]>([]);
  const loadingPos = useSignal(store.loading && store.positions.length === 0);
  const loadingLed = useSignal(store.loading && store.ledger.length === 0);
  const loadingReceipts = useSignal(false);
  const loadingMore = useSignal(false);
  const unitsOnHold = useSignal(0);
  const holdOrdersCount = useSignal(0);
  const loadingHold = useSignal(false);
  const hasMore    = useSignal(true);   // false once a page returns < PAGE rows
  const offset     = useSignal(0);
  const tab        = useSignal<"position" | "movements" | "purchases">("position");
  const search     = useSignal("");
  const showReceive  = useSignal(false);
  const showAdjust   = useSignal(false);
  const showPurchaseInvoice = useSignal(false);
  const showAlert = useSignal(false);
  const alertItemId = useSignal<string | undefined>(undefined);
  const alertWarehouseId = useSignal<string | undefined>(undefined);
  const viewReceiptDocId = useSignal<string | null>(null);
  const editingReceipt = useSignal<any | null>(null);
  const adjustItemId   = useSignal("");
  const adjustItemName = useSignal("");
  const isRefreshing   = useSignal(false);

  // Sync with store when store updates
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const sPos = track(() => store.positions);
    const sLed = track(() => store.ledger);
    const sLoad = track(() => store.loading);

    if (sPos.length > 0) {
      positions.value = sPos;
      loadingPos.value = false;
    }
    if (sLed.length > 0) {
      ledger.value = sLed;
      loadingLed.value = false;
    }
    if (!sLoad) {
      loadingPos.value = false;
      loadingLed.value = false;
    }
  });

  // ── Loaders ────────────────────────────────────────────────────────────

  const loadPosition = $(async () => {
    if (positions.value.length === 0) loadingPos.value = true;
    try {
      const res = await invoke<StockPosition[]>("shop_get_stock_position", {});
      positions.value = res;
      store.positions = res;
    } catch (e) {
      console.error("[Inventory] position failed:", e);
    } finally {
      loadingPos.value = false;
    }
  });

  const loadLedgerPage = $(async (reset: boolean) => {
    const off = reset ? 0 : offset.value;
    if (reset) {
      if (ledger.value.length === 0) loadingLed.value = true;
      hasMore.value    = true;
    } else {
      loadingMore.value = true;
    }
    try {
      const page = await invoke<LedgerEntry[]>("shop_get_stock_ledger", {
        limit: PAGE,
        offset: off,
      });
      if (reset) {
        ledger.value = page;
        store.ledger = page;
      } else {
        ledger.value = [...ledger.value, ...page];
        store.ledger = ledger.value;
      }
      offset.value    = off + page.length;
      hasMore.value   = page.length === PAGE;  // got a full page → probably more
    } catch (e) {
      console.error("[Inventory] ledger failed:", e);
    } finally {
      loadingLed.value  = false;
      loadingMore.value = false;
    }
  });

  const loadReceipts = $(async () => {
    loadingReceipts.value = true;
    try {
      const res = await invoke<GoodsReceiptSummary[]>("shop_list_goods_receipts", { limit: 100, offset: 0 });
      receipts.value = res;
    } catch (e) {
      console.error("[Inventory] loadReceipts failed:", e);
    } finally {
      loadingReceipts.value = false;
    }
  });

  const loadHoldStats = $(async () => {
    loadingHold.value = true;
    try {
      const stats = await invoke<{
        units_on_hold: number;
        pending_orders_count: number;
        total_hold_value: number;
      }>("shop_get_b2b_hold_stats");
      unitsOnHold.value = stats.units_on_hold || 0;
      holdOrdersCount.value = stats.pending_orders_count || 0;
    } catch (e) {
      console.warn("[Inventory] loadHoldStats fallback:", e);
      try {
        const orders = await invoke<any[]>("shop_list_sales_orders", { statusFilter: null, limit: 100, offset: 0 });
        const openOrders = (orders || []).filter(o => o.status !== "invoiced" && o.status !== "rejected" && o.status !== "cancelled");
        holdOrdersCount.value = openOrders.length;
      } catch {
        // ignore fallback errors
      }
    } finally {
      loadingHold.value = false;
    }
  });

  const reloadAll = $(async () => {
    isRefreshing.value = true;
    try {
      await Promise.all([
        loadPosition(),
        loadLedgerPage(true),
        loadReceipts(),
        loadHoldStats(),
        store.refresh(),
      ]);
    } finally {
      setTimeout(() => {
        isRefreshing.value = false;
      }, 350);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    if (positions.value.length === 0) loadPosition();
    if (ledger.value.length === 0) loadLedgerPage(true);
    loadReceipts();
    loadHoldStats();
  });

  // ── Computed ───────────────────────────────────────────────────────────

  const filteredPos = useComputed$(() => {
    const q = search.value.toLowerCase().trim();
    if (!q) return positions.value;
    return positions.value.filter(p =>
      p.item_name.toLowerCase().includes(q) ||
      (p.sku ?? "").toLowerCase().includes(q) ||
      p.warehouse_name.toLowerCase().includes(q)
    );
  });

  const filteredLed = useComputed$(() => {
    const q = search.value.toLowerCase().trim();
    if (!q) return ledger.value;
    return ledger.value.filter(e =>
      e.item_name.toLowerCase().includes(q) ||
      (e.sku ?? "").toLowerCase().includes(q) ||
      e.warehouse_name.toLowerCase().includes(q) ||
      e.movement_type.toLowerCase().includes(q)
    );
  });

  const filteredReceipts = useComputed$(() => {
    const q = search.value.toLowerCase().trim();
    if (!q) return receipts.value;
    return receipts.value.filter(r =>
      r.doc_number.toLowerCase().includes(q) ||
      (r.ref_number ?? "").toLowerCase().includes(q) ||
      (r.vendor_name ?? "").toLowerCase().includes(q) ||
      (r.warehouse_name ?? "").toLowerCase().includes(q) ||
      r.status.toLowerCase().includes(q)
    );
  });

  const totalSkus  = useComputed$(() => new Set(positions.value.map(p => p.item_id)).size);
  const totalUnits = useComputed$(() =>
    positions.value.reduce((s, p) => s + Math.max(0, p.qty_on_hand), 0)
  );
  const lowCount   = useComputed$(() => positions.value.filter(p => p.is_low).length);
  const zeroCount  = useComputed$(() => positions.value.filter(p => p.qty_on_hand <= 0).length);
  const stockValue = useComputed$(() =>
    ledger.value.reduce((s, e) => s + e.qty_in * e.unit_cost, 0)
  );

  // Today stats for cards & tab badges
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime() / 1000;

  const todayMovements = useComputed$(() =>
    ledger.value.filter(e => e.created_at >= todayTs)
  );

  const todayPurchases = useComputed$(() =>
    receipts.value.filter(r => (r.doc_date || r.created_at) >= todayTs)
  );
  const todayPurchasesTotal = useComputed$(() =>
    todayPurchases.value.reduce((s, r) => s + (r.grand_total || 0), 0)
  );

  const openAdjust = $((itemId: string, itemName: string) => {
    adjustItemId.value   = itemId;
    adjustItemName.value = itemName;
    showAdjust.value     = true;
  });

  // Standalone adjust — no prefill, user picks the item
  const openAdjustBlank = $(() => {
    adjustItemId.value   = "";
    adjustItemName.value = "";
    showAdjust.value     = true;
  });

  const openEditReceipt = $(async (r: GoodsReceiptSummary) => {
    try {
      const detail = await invoke<any>("shop_get_goods_receipt", { docId: r.id });
      editingReceipt.value = detail;
      showReceive.value = true;
    } catch (e) {
      console.error("[Inventory] openEditReceipt failed:", e);
    }
  });

  const openViewReceipt = $((r: GoodsReceiptSummary) => {
    viewReceiptDocId.value = r.id;
    showPurchaseInvoice.value = true;
  });

  const openAlert = $((itemId?: string, warehouseId?: string) => {
    alertItemId.value = itemId;
    alertWarehouseId.value = warehouseId;
    showAlert.value = true;
  });

  // ── Styles ─────────────────────────────────────────────────────────────

  const thL = { padding: "0.625rem 0.75rem", textAlign: "left"  as const, fontWeight: "600" as const, color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase" as const, letterSpacing: "0.04em", whiteSpace: "nowrap" as const };
  const thR = { ...thL, textAlign: "right" as const };

  return (
    <>
      <ReceiveStockSlideOver open={showReceive} editingDocument={editingReceipt} onSaved$={reloadAll} />
      <AdjustStockSlideOver  open={showAdjust}  prefillItemId={adjustItemId} prefillItemName={adjustItemName} onSaved$={reloadAll} />
      <PurchaseInvoiceView   open={showPurchaseInvoice} docId={viewReceiptDocId} />
      <SetReorderAlertSlideOver
        open={showAlert}
        prefillItemId={alertItemId}
        prefillWarehouseId={alertWarehouseId}
        onSaved$={reloadAll}
      />

      {/* ── 1. Stats cards ─────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px,1fr))", gap: "0.75rem", marginBottom: "1rem" }}>
        {[
          { label: "Total SKUs",   value: String(totalSkus.value),    warn: false },
          { label: "Units on Hand", value: fmt(totalUnits.value),      warn: false },
          { label: "Stock Value",  value: fmtCur(stockValue.value),   warn: false, small: true },
          { label: "Low Stock",    value: String(lowCount.value),     warn: lowCount.value > 0 },
          { label: "Zero Stock",   value: String(zeroCount.value),    warn: zeroCount.value > 0 },
          {
            label: "Today's Inward",
            value: todayPurchasesTotal.value > 0 ? fmtCur(todayPurchasesTotal.value) : "—",
            sub: `${todayPurchases.value.length} purchase${todayPurchases.value.length !== 1 ? "s" : ""}`,
            warn: false,
            small: true,
          },
          {
            label: "Units on Hold",
            badge: "B2B Orders",
            value: loadingHold.value && unitsOnHold.value === 0 ? "—" : fmt(unitsOnHold.value),
            sub: `${holdOrdersCount.value} B2B order${holdOrdersCount.value !== 1 ? "s" : ""}`,
            warn: false,
            clickable: true,
            title: "Reserved units for pending B2B orders from Online Order Review (Click to view orders in Billing)",
            onClick$: $(() => nav("/dashboard/shop/products/billing/?tab=orders")),
          },
        ].map(c => (
          <div
            key={c.label}
            onClick$={c.onClick$}
            title={c.title}
            class={`inv-stat-card ${c.clickable ? "clickable" : ""} ${c.warn ? "warn" : ""}`}
          >
            <div>
              <div style={{ fontSize: c.small ? "1.125rem" : "1.5rem", fontWeight: "700", color: c.warn ? "var(--error)" : "var(--text-primary)", fontVariantNumeric: "tabular-nums", lineHeight: 1.2 }}>{c.value}</div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.25rem" }}>
                <span>{c.label}</span>
                {c.badge && (
                  <span style={{ fontSize: "0.625rem", background: "rgba(59,130,246,0.12)", color: "var(--accent, #3b82f6)", padding: "0.05rem 0.35rem", borderRadius: "0.25rem", fontWeight: "600", whiteSpace: "nowrap" }}>
                    {c.badge}
                  </span>
                )}
              </div>
            </div>
            {c.sub && (
              <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginTop: "0.35rem", opacity: 0.85 }}>
                {c.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* ── 2. Toolbar: [Search] ----------- [toggle | Receive | Adjust | Refresh] ─── */}
      <div class="inv-toolbar">

        {/* Search — left */}
        <div class="inv-search-wrap">
          <span style={{ position: "absolute", left: "0.65rem", top: "50%", transform: "translateY(-50%)", color: "var(--text-secondary)", pointerEvents: "none", display: "flex" }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input type="search" placeholder="Search items or warehouse…" value={search.value}
            onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; }}
            style={{ width: "100%", height: "2.25rem", paddingLeft: "2rem", paddingRight: "0.75rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-primary)", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" as const }}
          />
        </div>

        {/* Spacer — push buttons to right on desktop */}
        <div style={{ flex: 1 }} class="hidden sm:block" />

        {/* 3 Toggle buttons — full width on mobile */}
        <div class="inv-toggle">
          <button type="button" class={`inv-tab ${tab.value === "position" ? "active" : "inactive"}`} onClick$={() => { tab.value = "position"; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
            <span>Position</span>
          </button>
          <button type="button" class={`inv-tab ${tab.value === "movements" ? "active" : "inactive"}`} onClick$={() => { tab.value = "movements"; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"/><line x1="18" y1="20" x2="18" y2="4"/><line x1="6" y1="20" x2="6" y2="16"/></svg>
            <span>Movements</span>
            <span
              class="inv-badge"
              style={{
                background: todayMovements.value.length > 0 ? "var(--button-primary-bg, var(--accent))" : "rgba(128,128,128,0.2)",
                color: todayMovements.value.length > 0 ? "var(--button-primary-text)" : "var(--text-secondary)",
              }}
              title={`${todayMovements.value.length} movement${todayMovements.value.length !== 1 ? "s" : ""} today`}
            >
              {todayMovements.value.length}
            </span>
          </button>
          <button type="button" class={`inv-tab ${tab.value === "purchases" ? "active" : "inactive"}`} onClick$={() => { tab.value = "purchases"; }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            <span>Purchases</span>
            <span
              class="inv-badge"
              style={{
                background: todayPurchases.value.length > 0 ? "var(--button-primary-bg, var(--accent))" : "rgba(128,128,128,0.2)",
                color: todayPurchases.value.length > 0 ? "var(--button-primary-text)" : "var(--text-secondary)",
              }}
              title={`${todayPurchases.value.length} purchase${todayPurchases.value.length !== 1 ? "s" : ""} today`}
            >
              {todayPurchases.value.length}
            </span>
          </button>
        </div>

        {/* 3 Action buttons: Receive Stock | Adjust | Refresh — full width on mobile */}
        <div class="inv-actions">
          <button type="button" onClick$={() => { editingReceipt.value = null; showReceive.value = true; }} class="inv-btn inv-btn-primary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            <span>Receive Stock</span>
          </button>

          <button type="button" onClick$={openAdjustBlank} class="inv-btn inv-btn-secondary">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            <span>Adjust</span>
          </button>

          <button
            type="button"
            onClick$={reloadAll}
            disabled={isRefreshing.value}
            class="pb-refresh-btn"
            title="Refresh inventory and movements"
            aria-label="Refresh inventory"
          >
            <LuRefreshCw
              style="width: 0.9375rem; height: 0.9375rem;"
              class={isRefreshing.value ? "pb-refresh-spinning" : ""}
            />
          </button>
        </div>
      </div>

      {/* ── 3a. POSITION tab ────────────────────────────────────────────────── */}
      {tab.value === "position" && (
        loadingPos.value ? (
          <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading stock position…</div>
        ) : filteredPos.value.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📦</div>
            <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.375rem" }}>No stock position yet</div>
            <div style={{ fontSize: "0.8125rem", maxWidth: "28rem", margin: "0 auto 0.75rem", lineHeight: 1.65 }}>
              This tab shows data when:<br/>
              • You click <strong>Receive Stock</strong> and add units → item appears with On Hand qty<br/>
              • A product has <strong>Track Stock = ON</strong> and was received before<br/>
              • A product with Track Stock = ON has zero movements → shows as <em>0 on hand</em>
            </div>
            <button type="button" onClick$={() => { showReceive.value = true; }}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", padding: "0 1.25rem", height: "2.5rem", fontSize: "0.9375rem", fontWeight: "600", cursor: "pointer" }}>
              Receive Stock Now
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                  <th style={thL}>Item</th>
                  <th style={thL}>SKU</th>
                  <th style={thL}>Warehouse</th>
                  <th style={thR}>On Hand</th>
                  <th style={{ ...thL, textAlign: "center" }}>Status</th>
                  <th style={{ ...thL, width: "2.75rem", padding: "0.625rem 0.5rem" }} />
                </tr>
              </thead>
              <tbody>
                {filteredPos.value.map(pos => (
                  <tr key={`${pos.item_id}-${pos.warehouse_id}`} style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick$={$(() => openAdjust(pos.item_id, pos.item_name))}>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-primary)", fontWeight: "500" }}>{pos.item_name}</td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)", fontFamily: "monospace", fontSize: "0.8125rem" }}>{pos.sku ?? "—"}</td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)" }}>{pos.warehouse_name}</td>
                    <td style={{ padding: "0.625rem 0.875rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: "700", color: pos.qty_on_hand <= 0 ? "var(--error)" : "var(--text-primary)" }}>{fmt(pos.qty_on_hand)}</td>
                    <td style={{ padding: "0.625rem 0.875rem", textAlign: "center" }}>
                      {pos.qty_on_hand <= 0 ? (
                        <span style={{ background: "rgba(239,68,68,0.12)", color: "var(--error)", borderRadius: "0.25rem", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>Out of stock</span>
                      ) : pos.is_low ? (
                        <span style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", borderRadius: "0.25rem", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>Low</span>
                      ) : (
                        <span style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", borderRadius: "0.25rem", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: "600" }}>OK</span>
                      )}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "center", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", gap: "0.35rem", alignItems: "center" }}>
                        <button
                          type="button"
                          onClick$={(e) => {
                            e.stopPropagation();
                            openAlert(pos.item_id, pos.warehouse_id);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "1.75rem",
                            height: "1.75rem",
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: "0.375rem",
                            color: pos.reorder_min != null ? "var(--accent)" : "var(--text-secondary)",
                            cursor: "pointer",
                            padding: 0,
                            transition: "border-color 0.15s, color 0.15s",
                          }}
                          title={pos.reorder_min != null ? `Alert configured (Min: ${pos.reorder_min})` : "Set reorder alert"}
                        >
                          <LuBell style={{ width: "0.875rem", height: "0.875rem", strokeWidth: 2 }} />
                        </button>
                        <button
                          type="button"
                          onClick$={(e) => {
                            e.stopPropagation();
                            openAdjust(pos.item_id, pos.item_name);
                          }}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "1.75rem",
                            height: "1.75rem",
                            background: "transparent",
                            border: "1px solid var(--border)",
                            borderRadius: "0.375rem",
                            color: "var(--text-secondary)",
                            cursor: "pointer",
                            padding: 0,
                            transition: "border-color 0.15s, color 0.15s",
                          }}
                          onMouseOver$={(e) => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.borderColor = "var(--accent)";
                            el.style.color = "var(--accent)";
                          }}
                          onMouseOut$={(e) => {
                            const el = e.currentTarget as HTMLElement;
                            el.style.borderColor = "var(--border)";
                            el.style.color = "var(--text-secondary)";
                          }}
                          title="Adjust stock for this item"
                        >
                          <LuPlus style={{ width: "0.875rem", height: "0.875rem", strokeWidth: 2 }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* ── 3b. MOVEMENTS tab ───────────────────────────────────────────────── */}
      {tab.value === "movements" && (
        loadingLed.value ? (
          <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading movements…</div>
        ) : filteredLed.value.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>📋</div>
            <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.375rem" }}>No movements yet</div>
            <div style={{ fontSize: "0.8125rem" }}>Receive, adjust, or sell stock to see entries here.</div>
          </div>
        ) : (
          <>
            <div style={{ overflowX: "auto", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
                <thead>
                  <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                    <th style={thL}>Date</th>
                    <th style={thL}>Item</th>
                    <th style={thL}>Warehouse</th>
                    <th style={thL}>Type</th>
                    <th style={thR}>Qty In</th>
                    <th style={thR}>Qty Out</th>
                    <th style={thR}>Unit Cost</th>
                    <th style={thR}>Total Cost</th>
                    <th style={thR}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLed.value.map(entry => {
                    const m = mv(entry.movement_type);
                    const isModBill = !!(entry.notes && (
                      entry.notes.includes("Modified Bill") ||
                      entry.notes.includes("Modified invoice") ||
                      entry.notes.toLowerCase().includes("modified")
                    ));
                    return (
                      <tr key={entry.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap", color: "var(--text-secondary)", fontSize: "0.8rem" }}>{fmtDate(entry.created_at)}</td>
                        <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
                            <span style={{ fontWeight: "500", color: "var(--text-primary)" }}>{entry.item_name}</span>
                            {entry.sku && (
                              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                                {entry.sku}
                              </span>
                            )}
                          </div>
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap", fontSize: "0.8125rem" }}>{entry.warehouse_name}</td>
                        <td style={{ padding: "0.5rem 0.75rem" }}>
                          <div style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
                            <span style={{ background: m.bg, color: m.color, border: `1px solid ${m.color}33`, borderRadius: "0.25rem", padding: "0.15rem 0.45rem", fontSize: "0.72rem", fontWeight: "700", whiteSpace: "nowrap" }}>{m.label}</span>
                            {isModBill && (
                              <span
                                style={{
                                  background: "transparent",
                                  color: "var(--text-secondary)",
                                  border: "1px solid var(--border)",
                                  borderRadius: "0.25rem",
                                  padding: "0.1rem 0.35rem",
                                  fontSize: "0.625rem",
                                  fontWeight: "700",
                                  whiteSpace: "nowrap",
                                  letterSpacing: "0.03em",
                                }}
                                title={entry.notes || "Stock movement via Modified Bill"}
                              >
                                MOD
                              </span>
                            )}
                          </div>
                          {entry.notes && (
                            <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.15rem", maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={entry.notes}>
                              {entry.notes}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontVariantNumeric: "tabular-nums", fontWeight: "600", color: entry.qty_in > 0 ? "#22c55e" : "var(--text-secondary)", textAlign: "right" }}>
                          {entry.qty_in > 0 ? `+${fmt(entry.qty_in)}` : "—"}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontVariantNumeric: "tabular-nums", fontWeight: "600", color: entry.qty_out > 0 ? "var(--error)" : "var(--text-secondary)", textAlign: "right" }}>
                          {entry.qty_out > 0 ? `-${fmt(entry.qty_out)}` : "—"}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)", textAlign: "right", fontSize: "0.8125rem" }}>
                          {entry.unit_cost > 0 ? fmtCur(entry.unit_cost) : "—"}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontVariantNumeric: "tabular-nums", fontWeight: "600", color: "var(--text-primary)", textAlign: "right" }}>
                          {entry.total_cost > 0 ? fmtCur(entry.total_cost) : "—"}
                        </td>
                        <td style={{ padding: "0.5rem 0.75rem", fontVariantNumeric: "tabular-nums", fontWeight: "700", color: entry.balance_after <= 0 ? "var(--error)" : "var(--text-primary)", textAlign: "right" }}>
                          {fmt(entry.balance_after)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Footer: count + load more */}
              <div style={{ padding: "0.75rem 0.875rem", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {filteredLed.value.length} movement{filteredLed.value.length !== 1 ? "s" : ""}{search.value ? " (filtered)" : ""} · newest first
                </span>
                {hasMore.value && !search.value && (
                  <button type="button"
                    disabled={loadingMore.value}
                    onClick$={$(() => loadLedgerPage(false))}
                    style={{ display: "flex", alignItems: "center", gap: "0.35rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.35rem 0.875rem", fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: loadingMore.value ? "not-allowed" : "pointer", fontWeight: "500" }}>
                    {loadingMore.value ? (
                      <>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style={{ animation: "spin 1s linear infinite" }}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        Loading…
                      </>
                    ) : (
                      <>Load {PAGE} more</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        )
      )}

      {/* ── 3c. PURCHASES tab ───────────────────────────────────────────────── */}
      {tab.value === "purchases" && (
        loadingReceipts.value ? (
          <div style={{ textAlign: "center", padding: "3rem 0", color: "var(--text-secondary)", fontSize: "0.875rem" }}>Loading purchases…</div>
        ) : filteredReceipts.value.length === 0 ? (
          <div style={{ textAlign: "center", padding: "4rem 0", color: "var(--text-secondary)" }}>
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🧾</div>
            <div style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", marginBottom: "0.375rem" }}>No purchase receipts yet</div>
            <div style={{ fontSize: "0.8125rem", maxWidth: "26rem", margin: "0 auto 0.75rem", lineHeight: 1.65 }}>
              Click <strong>Receive Stock</strong> to log a vendor bill / purchase entry with rates, trade discounts, and tax slabs.
            </div>
            <button
              type="button"
              onClick$={() => {
                editingReceipt.value = null;
                showReceive.value = true;
              }}
              style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", padding: "0 1.25rem", height: "2.5rem", fontSize: "0.9375rem", fontWeight: "600", cursor: "pointer" }}
            >
              Receive Stock
            </button>
          </div>
        ) : (
          <div style={{ overflowX: "auto", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                  <th style={thL}>Receipt / Bill #</th>
                  <th style={thL}>Date</th>
                  <th style={thL}>Vendor / Supplier</th>
                  <th style={thL}>Warehouse</th>
                  <th style={thR}>Items / Qty</th>
                  <th style={thR}>Grand Total</th>
                  <th style={thR}>Paid</th>
                  <th style={{ ...thL, textAlign: "center" }}>Status</th>
                  <th style={{ ...thL, width: "7.5rem", textAlign: "center" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredReceipts.value.map(r => (
                  <tr
                    key={r.id}
                    style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                    onClick$={() => openEditReceipt(r)}
                  >
                    <td style={{ padding: "0.625rem 0.875rem", whiteSpace: "nowrap" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <span style={{ fontWeight: "600", color: "var(--text-primary)", fontFamily: "monospace", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>{r.doc_number}</span>
                        {r.status !== "draft" && r.status !== "cancelled" && (r.is_modified ?? (r.updated_at && r.created_at && r.updated_at > r.created_at + 10)) ? (
                          <span
                            style={{
                              fontSize: "0.625rem",
                              fontWeight: 700,
                              padding: "0.1rem 0.35rem",
                              borderRadius: "0.25rem",
                              background: "transparent",
                              color: "var(--text-secondary)",
                              border: "1px solid var(--border)",
                              letterSpacing: "0.02em",
                            }}
                            title="Modified Receipt"
                          >
                            MOD
                          </span>
                        ) : null}
                      </div>
                      {r.ref_number && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                          Bill: {r.ref_number}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                      {fmtDate(r.vendor_bill_date || r.doc_date || r.created_at)}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-primary)", fontWeight: "500", whiteSpace: "nowrap" }}>
                      {r.vendor_name || "—"}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      {r.warehouse_name || "Main Warehouse"}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                      <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>{r.line_count}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "0.25rem" }}>({r.total_qty} units)</span>
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: "700", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                      ₹{r.grand_total.toFixed(2)}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", textAlign: "right", fontVariantNumeric: "tabular-nums", color: r.amount_paid > 0 ? "#16a34a" : "var(--text-secondary)", whiteSpace: "nowrap" }}>
                      ₹{r.amount_paid.toFixed(2)}
                    </td>
                    <td style={{ padding: "0.625rem 0.875rem", textAlign: "center", whiteSpace: "nowrap" }}>
                      {r.status === "paid" ? (
                        <span style={{ background: "rgba(34,197,94,0.1)", color: "#22c55e", borderRadius: "0.25rem", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: "600", whiteSpace: "nowrap" }}>Paid</span>
                      ) : r.status === "partial" ? (
                        <span style={{ background: "rgba(245,158,11,0.12)", color: "#f59e0b", borderRadius: "0.25rem", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: "600", whiteSpace: "nowrap" }}>Partial</span>
                      ) : (
                        <span style={{ background: "rgba(239,68,68,0.12)", color: "var(--error)", borderRadius: "0.25rem", padding: "0.15rem 0.5rem", fontSize: "0.75rem", fontWeight: "600", whiteSpace: "nowrap" }}>Unpaid / Credit</span>
                      )}
                    </td>
                    <td style={{ padding: "0.625rem 0.75rem", textAlign: "center", whiteSpace: "nowrap" }}>
                      <div style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem" }}>
                        <button
                          type="button"
                          title="View / Print Invoice"
                          onClick$={(e) => {
                            e.stopPropagation();
                            openViewReceipt(r);
                          }}
                          style={{
                            background: "var(--surface-3)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.375rem",
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "0.25rem",
                          }}
                        >
                          <LuEye style={{ width: "0.875rem", height: "0.875rem" }} />
                          <span>View</span>
                        </button>
                        <button
                          type="button"
                          onClick$={(e) => {
                            e.stopPropagation();
                            openEditReceipt(r);
                          }}
                          style={{
                            background: "var(--surface-3)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.375rem",
                            padding: "0.25rem 0.5rem",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            color: "var(--accent)",
                            cursor: "pointer",
                          }}
                        >
                          Edit
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer: count */}
            <div style={{ padding: "0.75rem 0.875rem", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {filteredReceipts.value.length} purchase receipt{filteredReceipts.value.length !== 1 ? "s" : ""}{search.value ? " (filtered)" : ""} · newest first
              </span>
            </div>
          </div>
        )
      )}
    </>
  );
});

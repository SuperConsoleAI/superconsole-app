// src/components/shop/CustomerRateHistory.tsx
//
// WHAT: SlideOver / Modal displaying past invoice pricing history for a specific product.
//       Highlights the last rate & discount charged to the selected customer,
//       followed by complete sales invoice rate history across all customers.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  type Signal,
} from "@builder.io/qwik";
import {
  LuX,
  LuHistory,
  LuUser,
  LuTag,
  LuLoader2,
  LuChevronDown,
} from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { fmtMoney } from "~/lib/fin-format";

export interface RateHistoryEntry {
  document_id: string;
  doc_number: string;
  doc_date: number;
  status: string;
  customer_id?: string | null;
  customer_name: string;
  unit_price: number;
  discount_pct: number;
  discount_amt: number;
  qty: number;
  free_qty: number;
  line_total: number;
  mrp?: number | null;
  batch_no?: string | null;
  created_at: number;
}

export interface RateHistoryResult {
  item_id: string;
  item_name: string;
  sku?: string | null;
  standard_selling_price: number;
  standard_mrp?: number | null;
  default_discount_pct?: number | null;
  extra_discount?: number | null;
  cost_price?: number | null;
  unit?: string | null;
  last_customer_rate?: RateHistoryEntry | null;
  customer_history?: RateHistoryEntry[];
  history: RateHistoryEntry[];
}

export interface CustomerRateHistoryProps {
  open: Signal<boolean>;
  itemId: Signal<string | null>;
  itemName?: string;
  customerId?: Signal<string | null> | string | null;
  customerName?: Signal<string | null> | string | null;
}

const rateHistoryCache = new Map<string, RateHistoryResult>();

export const CustomerRateHistory = component$<CustomerRateHistoryProps>((props) => {
  const loading = useSignal(false);
  const data = useSignal<RateHistoryResult | null>(null);
  const error = useSignal<string | null>(null);

  const customerDisplayLimit = useSignal(9);
  const allDisplayLimit = useSignal(9);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const isOpen = track(() => props.open.value);
    const itId = track(() => props.itemId.value);
    const cId = track(() => {
      if (typeof props.customerId === "object" && props.customerId !== null && "value" in props.customerId) {
        return (props.customerId as Signal<string | null>).value;
      }
      return props.customerId as string | null | undefined;
    });
    const cName = track(() => {
      if (typeof props.customerName === "object" && props.customerName !== null && "value" in props.customerName) {
        return (props.customerName as Signal<string | null>).value;
      }
      return props.customerName as string | null | undefined;
    });

    if (!isOpen || !itId) {
      data.value = null;
      return;
    }

    customerDisplayLimit.value = 9;
    allDisplayLimit.value = 9;

    const cacheKey = `${itId}:${cId || cName || ""}`;
    if (rateHistoryCache.has(cacheKey)) {
      data.value = rateHistoryCache.get(cacheKey)!;
    } else {
      loading.value = true;
    }
    error.value = null;

    try {
      const res = await invoke<RateHistoryResult>("shop_get_item_rate_history", {
        itemId: itId,
        customerId: cId || cName || null,
        limit: 100,
      });
      data.value = res;
      rateHistoryCache.set(cacheKey, res);
    } catch (e: any) {
      if (!data.value) {
        console.error("[CustomerRateHistory] fetch failed:", e);
        error.value = e?.message || String(e) || "Failed to load rate history";
      }
    } finally {
      loading.value = false;
    }
  });

  if (!props.open.value) return null;

  const activeCustId = typeof props.customerId === "object" && props.customerId !== null && "value" in props.customerId
    ? (props.customerId as Signal<string | null>).value
    : (props.customerId as string | null | undefined);

  const activeCustName = (typeof props.customerName === "object" && props.customerName !== null && "value" in props.customerName
    ? (props.customerName as Signal<string | null>).value
    : (props.customerName as string | null | undefined)) || (data.value?.last_customer_rate?.customer_name);

  const fmtDate = (ts: number) => {
    if (!ts) return "—";
    return new Date(ts * 1000).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const custHistory = data.value?.customer_history || (data.value?.last_customer_rate ? [data.value.last_customer_rate] : []);
  const visibleCustHistory = custHistory.slice(0, customerDisplayLimit.value);
  const remainingCustCount = custHistory.length - customerDisplayLimit.value;

  const allHistory = data.value?.history || [];
  const visibleAllHistory = allHistory.slice(0, allDisplayLimit.value);
  const remainingAllCount = allHistory.length - allDisplayLimit.value;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        boxSizing: "border-box",
      }}
      onClick$={$((e) => {
        if (e.target === e.currentTarget) {
          props.open.value = false;
        }
      })}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "720px",
          maxHeight: "88vh",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "0.75rem",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.45)",
          overflow: "hidden",
        }}
        onClick$={$((e) => e.stopPropagation())}
      >
        {/* Header */}
        <div
          style={{
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            background: "var(--surface-2)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <div
              style={{
                width: "2rem",
                height: "2rem",
                borderRadius: "0.375rem",
                background: "rgba(59, 130, 246, 0.12)",
                color: "#3b82f6",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LuHistory style={{ width: "1.1rem", height: "1.1rem" }} />
            </div>
            <div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                {data.value?.item_name || props.itemName || "Item Pricing & Rate History"}
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                {data.value?.sku && <span>SKU: {data.value.sku}</span>}
                {data.value?.sku && data.value?.unit && <span>•</span>}
                {data.value?.unit && <span>Unit: {data.value.unit}</span>}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick$={() => { props.open.value = false; }}
            style={{
              background: "transparent",
              border: "1px solid var(--border)",
              borderRadius: "0.375rem",
              width: "1.85rem",
              height: "1.85rem",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text-secondary)",
              cursor: "pointer",
            }}
            title="Close"
          >
            <LuX style={{ width: "1rem", height: "1rem" }} />
          </button>
        </div>

        {/* Body Content */}
        <div
          style={{
            padding: "1rem 1.25rem",
            overflowY: "auto",
            display: "flex",
            flexDirection: "column",
            gap: "1rem",
            flex: 1,
          }}
        >
          {loading.value && !data.value ? (
            <div
              style={{
                padding: "3rem 1rem",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                color: "var(--text-secondary)",
                fontSize: "0.875rem",
              }}
            >
              <LuLoader2 style={{ width: "1.5rem", height: "1.5rem", animation: "spin 1s linear infinite" }} />
              <span>Fetching past billing records…</span>
            </div>
          ) : error.value ? (
            <div
              style={{
                padding: "0.875rem 1rem",
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                borderRadius: "0.5rem",
                color: "#ef4444",
                fontSize: "0.8125rem",
              }}
            >
              {error.value}
            </div>
          ) : data.value ? (
            <>
              {/* Reference Rates Bar */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "0.5rem",
                }}
              >
                <div
                  style={{
                    background: "var(--surface-3)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    padding: "0.5rem 0.75rem",
                  }}
                >
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                    Standard Rate
                  </div>
                  <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(data.value.standard_selling_price)}
                  </div>
                </div>

                {data.value.standard_mrp !== undefined && data.value.standard_mrp !== null && data.value.standard_mrp > 0 && (
                  <div
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      padding: "0.5rem 0.75rem",
                    }}
                  >
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                      Catalog MRP
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(data.value.standard_mrp)}
                    </div>
                  </div>
                )}

                {((data.value.default_discount_pct !== undefined && data.value.default_discount_pct !== null && data.value.default_discount_pct > 0) ||
                  (data.value.extra_discount !== undefined && data.value.extra_discount !== null && data.value.extra_discount > 0)) && (
                  <div
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      padding: "0.5rem 0.75rem",
                    }}
                  >
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                      Default Discount
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                      {data.value.default_discount_pct || 0}%
                      {data.value.extra_discount && data.value.extra_discount > 0 ? ` + ${data.value.extra_discount}%` : ""}
                    </div>
                  </div>
                )}

                {data.value.cost_price !== undefined && data.value.cost_price !== null && data.value.cost_price > 0 && (
                  <div
                    style={{
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      padding: "0.5rem 0.75rem",
                    }}
                  >
                    <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600, textTransform: "uppercase" }}>
                      Cost Price
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                      {fmtMoney(data.value.cost_price)}
                    </div>
                  </div>
                )}
              </div>

              {/* Specific Customer Card & History (If a customer is active) */}
              {(activeCustId || activeCustName) ? (
                <div
                  style={{
                    background: "transparent",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    padding: "0.875rem 1rem",
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.8125rem", fontWeight: 700, color: "#3b82f6" }}>
                      <LuUser style={{ width: "0.9rem", height: "0.9rem" }} />
                      <span>Last Billed to {activeCustName || "Selected Customer"}</span>
                    </div>
                    {data.value.last_customer_rate && (
                      <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                        {fmtDate(data.value.last_customer_rate.doc_date)} ({data.value.last_customer_rate.doc_number})
                      </span>
                    )}
                  </div>

                  {data.value.last_customer_rate ? (
                    <>
                      {/* Summary Badges */}
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))",
                          gap: "0.5rem",
                        }}
                      >
                        <div style={{ background: "transparent", padding: "0.4rem 0.6rem", borderRadius: "0.375rem", border: "1px solid var(--border)" }}>
                          <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>Rate Charged</div>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                            {fmtMoney(data.value.last_customer_rate.unit_price)}
                          </div>
                        </div>

                        {data.value.last_customer_rate.discount_pct > 0 && (
                          <div style={{ background: "transparent", padding: "0.4rem 0.6rem", borderRadius: "0.375rem", border: "1px solid var(--border)" }}>
                            <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>Discount %</div>
                            <div style={{ fontSize: "1rem", fontWeight: 700, color: "#10b981" }}>
                              {data.value.last_customer_rate.discount_pct}% OFF
                            </div>
                          </div>
                        )}

                        <div style={{ background: "transparent", padding: "0.4rem 0.6rem", borderRadius: "0.375rem", border: "1px solid var(--border)" }}>
                          <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>Net Line Total</div>
                          <div style={{ fontSize: "1rem", fontWeight: 700, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                            {fmtMoney(data.value.last_customer_rate.line_total)}
                          </div>
                        </div>

                        <div style={{ background: "transparent", padding: "0.4rem 0.6rem", borderRadius: "0.375rem", border: "1px solid var(--border)" }}>
                          <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>Qty Given</div>
                          <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
                            {data.value.last_customer_rate.qty}
                            {data.value.last_customer_rate.free_qty > 0 ? ` (+${data.value.last_customer_rate.free_qty} free)` : ""}
                          </div>
                        </div>
                      </div>

                      {/* Customer's Prior Invoices Table (Max 9 + Load 9 more) */}
                      {custHistory.length > 0 && (
                        <div style={{ marginTop: "0.25rem" }}>
                          <div style={{ fontSize: "0.72rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                            Past Invoices for {activeCustName || "Customer"} ({custHistory.length})
                          </div>
                          <div style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "0.375rem", overflowX: "auto" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-3)" }}>
                                  <th style={{ textAlign: "left", padding: "0.4rem 0.6rem", color: "var(--text-secondary)", fontWeight: 600 }}>Invoice</th>
                                  <th style={{ textAlign: "right", padding: "0.4rem 0.6rem", color: "var(--text-secondary)", fontWeight: 600 }}>Rate</th>
                                  <th style={{ textAlign: "right", padding: "0.4rem 0.6rem", color: "var(--text-secondary)", fontWeight: 600 }}>Disc %</th>
                                  <th style={{ textAlign: "right", padding: "0.4rem 0.6rem", color: "var(--text-secondary)", fontWeight: 600 }}>Qty</th>
                                  <th style={{ textAlign: "right", padding: "0.4rem 0.6rem", color: "var(--text-secondary)", fontWeight: 600 }}>Total</th>
                                </tr>
                              </thead>
                              <tbody>
                                {visibleCustHistory.map((row) => (
                                  <tr key={`cust-${row.document_id}-${row.created_at}`} style={{ borderBottom: "1px solid var(--border)" }}>
                                    <td style={{ padding: "0.4rem 0.6rem", whiteSpace: "nowrap" }}>
                                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{row.doc_number}</span>
                                      <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", marginLeft: "0.35rem" }}>({fmtDate(row.doc_date)})</span>
                                    </td>
                                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                                      {fmtMoney(row.unit_price)}
                                    </td>
                                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", color: row.discount_pct > 0 ? "#10b981" : "var(--text-secondary)", fontWeight: row.discount_pct > 0 ? 600 : 400 }}>
                                      {row.discount_pct > 0 ? `${row.discount_pct}%` : "—"}
                                    </td>
                                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", color: "var(--text-secondary)" }}>
                                      {row.qty}{row.free_qty > 0 ? ` (+${row.free_qty})` : ""}
                                    </td>
                                    <td style={{ padding: "0.4rem 0.6rem", textAlign: "right", fontWeight: 700, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                                      {fmtMoney(row.line_total)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>

                          {remainingCustCount > 0 && (
                            <button
                              type="button"
                              onClick$={() => { customerDisplayLimit.value += 9; }}
                              style={{
                                width: "100%",
                                padding: "0.4rem",
                                background: "transparent",
                                border: "1px solid var(--border)",
                                borderRadius: "0.375rem",
                                color: "var(--accent, #3b82f6)",
                                fontSize: "0.72rem",
                                fontWeight: 600,
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyItems: "center",
                                justifyContent: "center",
                                gap: "0.3rem",
                                marginTop: "0.4rem",
                              }}
                            >
                              <LuChevronDown style={{ width: "0.8rem", height: "0.8rem" }} />
                              <span>Load 9 more ({remainingCustCount} remaining)</span>
                            </button>
                          )}
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", padding: "0.25rem 0" }}>
                      No prior invoices recorded for <strong>{activeCustName || "this customer"}</strong> with this item.
                    </div>
                  )}
                </div>
              ) : null}

              {/* All Invoices Rate History Table (Max 9 + Load 9 more) */}
              <div>
                <div
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "0.5rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  <LuTag style={{ width: "0.85rem", height: "0.85rem" }} />
                  <span>Recent Sales Invoices ({allHistory.length})</span>
                </div>

                {allHistory.length === 0 ? (
                  <div
                    style={{
                      padding: "2rem 1rem",
                      textAlign: "center",
                      background: "transparent",
                      border: "1px dashed var(--border)",
                      borderRadius: "0.5rem",
                      color: "var(--text-secondary)",
                      fontSize: "0.8125rem",
                    }}
                  >
                    No sales invoice history recorded for this item yet.
                  </div>
                ) : (
                  <div>
                    <div
                      style={{
                        background: "transparent",
                        border: "1px solid var(--border)",
                        borderRadius: "0.5rem",
                        overflowX: "auto",
                      }}
                    >
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                        <thead>
                          <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)" }}>
                            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                              Date & Invoice
                            </th>
                            <th style={{ textAlign: "left", padding: "0.5rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                              Customer
                            </th>
                            <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                              Rate
                            </th>
                            <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                              Disc %
                            </th>
                            <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                              Qty
                            </th>
                            <th style={{ textAlign: "right", padding: "0.5rem 0.75rem", fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleAllHistory.map((row) => {
                            const isCurrentCustomer = !!(
                              (activeCustId && row.customer_id === activeCustId) ||
                              (activeCustName && row.customer_name && row.customer_name.toLowerCase() === activeCustName.toLowerCase())
                            );
                            return (
                              <tr
                                key={`all-${row.document_id}-${row.created_at}`}
                                style={{
                                  borderBottom: "1px solid var(--border)",
                                  background: isCurrentCustomer ? "rgba(59, 130, 246, 0.06)" : undefined,
                                }}
                              >
                                <td style={{ padding: "0.5rem 0.75rem", whiteSpace: "nowrap" }}>
                                  <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{row.doc_number}</div>
                                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>{fmtDate(row.doc_date)}</div>
                                </td>

                                <td style={{ padding: "0.5rem 0.75rem" }}>
                                  <div style={{ fontWeight: isCurrentCustomer ? 700 : 500, color: isCurrentCustomer ? "#3b82f6" : "var(--text-primary)", whiteSpace: "nowrap" }}>
                                    {row.customer_name}
                                  </div>
                                  {row.batch_no && (
                                    <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                                      Batch: {row.batch_no}
                                    </div>
                                  )}
                                </td>

                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                  {fmtMoney(row.unit_price)}
                                </td>

                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: row.discount_pct > 0 ? "#10b981" : "var(--text-secondary)", fontWeight: row.discount_pct > 0 ? 600 : 400, whiteSpace: "nowrap" }}>
                                  {row.discount_pct > 0 ? `${row.discount_pct}%` : "—"}
                                </td>

                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                  {row.qty}
                                  {row.free_qty > 0 && <span style={{ color: "#10b981", marginLeft: "0.2rem" }}>+{row.free_qty}</span>}
                                </td>

                                <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                                  {fmtMoney(row.line_total)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {remainingAllCount > 0 && (
                      <button
                        type="button"
                        onClick$={() => { allDisplayLimit.value += 9; }}
                        style={{
                          width: "100%",
                          padding: "0.5rem",
                          background: "transparent",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          color: "var(--text-primary)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.35rem",
                          marginTop: "0.5rem",
                        }}
                      >
                        <LuChevronDown style={{ width: "0.85rem", height: "0.85rem" }} />
                        <span>Load 9 more ({remainingAllCount} remaining)</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
});

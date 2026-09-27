// src/components/shop/OnlineOrderReviewSlideOver.tsx
// Wholesaler Desktop Review & Conversion Drawer for B2B Retailer Online Orders

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
import {
  LuCheckCircle2,
  LuXCircle,
  LuBuilding2,
  LuPhone,
  LuMail,
  LuMapPin,
  LuTruck,
  LuFileText,
  LuAlertTriangle,
  LuRefreshCw,
  LuCreditCard,
  LuSlidersHorizontal,
  LuUser,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { WhatsAppIcon } from "./InvoicePrintModal";
import { fmtMoney } from "~/lib/fin-format";
import type { InvoiceDetail, InvoiceLine } from "./InvoiceDetailSlideOver";
import type { ItemBatch } from "./NewBillModal";
import type { CustomerBillingContext } from "./CustomerDetailSlideOver";
export type { ItemBatch };

export interface AcceptForBillingPayload {
  order: InvoiceDetail;
  lines: InvoiceLine[];
  selectedBatches: Record<string, ItemBatch | null>;
  mode?: "pos" | "custom";
}

export interface OnlineOrderReviewSlideOverProps {
  open: Signal<boolean>;
  orderId: Signal<string | null>;
  customers?: Signal<any[]>;
  onOrderProcessed$?: PropFunction<() => void>;
  onInvoiceCreated$?: PropFunction<(invoice: InvoiceDetail) => void>;
  onAcceptForBilling$?: PropFunction<(payload: AcceptForBillingPayload, mode?: "pos" | "custom") => void>;
}

export const OnlineOrderReviewSlideOver = component$<OnlineOrderReviewSlideOverProps>((props) => {
  const {
    open,
    orderId,
    customers,
    onOrderProcessed$,
    onAcceptForBilling$,
  } = props;
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);
  const order = useSignal<InvoiceDetail | null>(null);
  const lines = useSignal<InvoiceLine[]>([]);
  const batchMap = useSignal<Record<string, ItemBatch[]>>({});
  const selectedBatches = useSignal<Record<string, ItemBatch | null>>({});

  const submitting = useSignal(false);
  const showRejectConfirm = useSignal(false);
  const rejectReason = useSignal("");

  // Credit Line & Customer Context state (matches CustomerDetailSlideOver)
  const creditContext = useSignal<CustomerBillingContext | null>(null);
  const showOutstanding = useSignal(false);
  const isEditingCreditLimit = useSignal(false);
  const newCreditLimit = useSignal("");

  const loadOrder = $(async (id: string) => {
    loading.value = true;
    error.value = null;
    try {
      const detail = await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: id });
      order.value = detail;
      lines.value = detail.lines || [];

      // ── Smart Multi-Stage Customer Matching (ID -> Phone -> Email -> Directory fuzzy) ──
      let ctx: CustomerBillingContext | null = null;

      // Stage 1: Direct customer_id lookup if present
      if (detail.customer_id) {
        try {
          ctx = await invoke<CustomerBillingContext>("shop_get_customer_billing_context", { customerId: detail.customer_id });
        } catch {
          ctx = null;
        }
      }

      // Stage 2: Direct lookup by phone if present
      if (!ctx && detail.customer_phone && detail.customer_phone.trim()) {
        try {
          ctx = await invoke<CustomerBillingContext>("shop_get_customer_billing_context", { customerId: detail.customer_phone.trim() });
        } catch {
          ctx = null;
        }
      }

      // Stage 3: Direct lookup by email if present
      if (!ctx && detail.customer_email && detail.customer_email.trim()) {
        try {
          ctx = await invoke<CustomerBillingContext>("shop_get_customer_billing_context", { customerId: detail.customer_email.trim() });
        } catch {
          ctx = null;
        }
      }

      // Stage 4: Scan customer directory for phone number suffix, email, GSTIN, or name
      if (!ctx) {
        try {
          const allCusts: any[] = (customers?.value && customers.value.length > 0)
            ? customers.value
            : await invoke<any[]>("shop_list_customers").catch(() => []);

          const orderPhoneDigits = (detail.customer_phone || "").replace(/\D/g, "");
          const orderEmail = (detail.customer_email || "").trim().toLowerCase();
          const orderGstin = (detail.customer_gstin || "").trim().toUpperCase();
          const orderName = (detail.customer_name || "").trim().toLowerCase();

          const matched = allCusts.find((c) => {
            if (c.phone && orderPhoneDigits.length >= 7) {
              const custDigits = String(c.phone).replace(/\D/g, "");
              if (
                custDigits === orderPhoneDigits ||
                (orderPhoneDigits.length >= 10 && custDigits.endsWith(orderPhoneDigits.slice(-10))) ||
                (custDigits.length >= 10 && orderPhoneDigits.endsWith(custDigits.slice(-10)))
              ) {
                return true;
              }
            }
            if (orderEmail && c.email && String(c.email).trim().toLowerCase() === orderEmail) return true;
            if (orderGstin && c.gstin && String(c.gstin).trim().toUpperCase() === orderGstin) return true;
            if (orderName && c.name && String(c.name).trim().toLowerCase() === orderName) return true;
            return false;
          });

          if (matched && matched.id) {
            ctx = await invoke<CustomerBillingContext>("shop_get_customer_billing_context", { customerId: matched.id });
          }
        } catch (e) {
          console.warn("[OnlineOrderReviewSlideOver] Directory search fallback error:", e);
        }
      }

      if (ctx) {
        creditContext.value = ctx;
        newCreditLimit.value = String(ctx.credit_limit || 0);
        if (ctx.customer_id) {
          detail.customer_id = ctx.customer_id;
        }
      } else {
        creditContext.value = null;
      }

      // Fetch active batches for all items in order
      const itemIds = Array.from(new Set(lines.value.map((l) => l.item_id)));
      const batchesObj: Record<string, ItemBatch[]> = {};
      const selObj: Record<string, ItemBatch | null> = {};

      for (const itemId of itemIds) {
        try {
          const batches = await invoke<ItemBatch[]>("shop_list_item_batches", { itemId }).catch(() => []);
          batchesObj[itemId] = batches || [];
          if (batches && batches.length > 0) {
            // Pick earliest expiring batch with stock
            const valid = batches.find((b) => b.qty_remaining > 0) || batches[0];
            selObj[itemId] = valid;
          }
        } catch {
          batchesObj[itemId] = [];
        }
      }

      batchMap.value = batchesObj;
      selectedBatches.value = selObj;
    } catch (err) {
      console.error("[OnlineOrderReviewSlideOver] Load failed:", err);
      error.value = String(err);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const isOpen = track(() => open.value);
    const id = track(() => orderId.value);
    if (isOpen && id) {
      loadOrder(id);
    } else {
      order.value = null;
      lines.value = [];
      creditContext.value = null;
      showOutstanding.value = false;
      isEditingCreditLimit.value = false;
      showRejectConfirm.value = false;
      rejectReason.value = "";
    }
  });

  const totals = useComputed$(() => {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalTax = 0;

    for (const l of lines.value) {
      const lineSub = l.qty * l.unit_price;
      const lineDisc = lineSub * ((l.discount_pct || 0) / 100);
      subtotal += lineSub;
      totalDiscount += lineDisc;
      totalTax += (l.tax_amount || 0);
    }

    const grand = Math.round((subtotal - totalDiscount + totalTax) * 100) / 100;
    return {
      subtotal,
      totalDiscount,
      totalTax,
      grand,
    };
  });

  const updateLineQty = $((idx: number, delta: number) => {
    const next = [...lines.value];
    if (!next[idx]) return;
    const newQty = Math.max(0, next[idx].qty + delta);
    if (newQty === 0) {
      next.splice(idx, 1);
    } else {
      const l = next[idx];
      let freeQty = l.free_qty || 0;
      if (l.scheme_on && l.scheme_on > 0 && l.scheme_free && l.scheme_free > 0) {
        freeQty = Math.floor(newQty / l.scheme_on) * l.scheme_free;
      }
      const lineSub = newQty * l.unit_price;
      const discAmt = lineSub * ((l.discount_pct || 0) / 100);
      next[idx] = {
        ...l,
        qty: newQty,
        free_qty: freeQty,
        discount_amt: discAmt,
        line_total: lineSub - discAmt + (l.tax_amount || 0),
      };
    }
    lines.value = next;
  });

  const handleAcceptAndBill = $(async (mode: "pos" | "custom" = "pos") => {
    if (!order.value || lines.value.length === 0) return;
    if (onAcceptForBilling$) {
      await onAcceptForBilling$({
        order: order.value,
        lines: lines.value,
        selectedBatches: selectedBatches.value,
        mode,
      }, mode);
      open.value = false;
    }
  });

  const handleRejectOrder = $(async () => {
    if (!order.value) return;
    submitting.value = true;
    error.value = null;

    try {
      await invoke("shop_reject_sales_order", {
        orderId: order.value.id,
        reason: rejectReason.value.trim() || undefined,
      });

      showRejectConfirm.value = false;
      open.value = false;
      if (onOrderProcessed$) await onOrderProcessed$();
    } catch (err) {
      console.error("[OnlineOrderReviewSlideOver] Rejection failed:", err);
      error.value = String(err);
    } finally {
      submitting.value = false;
    }
  });

  const openWhatsAppToBuyer = $(() => {
    if (!order.value) return;
    const phone = (order.value.customer_phone || "").replace(/\D/g, "");
    if (!phone) return;

    const message = encodeURIComponent(
      `Hello ${order.value.customer_name || "Customer"},\n` +
      `Regarding your B2B Order *${order.value.doc_number}* (Total: ${fmtMoney(order.value.grand_total)}):\n` +
      `We are reviewing your order at the warehouse. Please let us know if you need any adjustments or express dispatch.`
    );

    const fullPhone = phone.length === 10 ? `91${phone}` : phone;
    const url = `https://wa.me/${fullPhone}?text=${message}`;
    invoke("shop_open_url", { url }).catch(() => {
      window.open(url, "_blank");
    });
  });

  const handleRegisterBuyerAsCustomer = $(async () => {
    if (!order.value) return;
    submitting.value = true;
    error.value = null;
    try {
      const newCust = await invoke<any>("shop_create_customer", {
        data: {
          name: order.value.customer_name || "Direct Retail Buyer",
          phone: order.value.customer_phone || null,
          email: order.value.customer_email || null,
          gstin: order.value.customer_gstin || null,
          pan: order.value.customer_pan || null,
          billing_addr: order.value.customer_address || null,
          city: order.value.customer_city || null,
          state: order.value.customer_state || null,
          credit_limit: 0,
        },
      });
      if (newCust?.id) {
        order.value.customer_id = newCust.id;
        const ctx = await invoke<CustomerBillingContext>("shop_get_customer_billing_context", { customerId: newCust.id });
        creditContext.value = ctx;
        newCreditLimit.value = "0";
        isEditingCreditLimit.value = true;
        if (onOrderProcessed$) await onOrderProcessed$();
      }
    } catch (err) {
      console.error("[OnlineOrderReviewSlideOver] Failed to register buyer:", err);
      alert(String(err));
    } finally {
      submitting.value = false;
    }
  });

  return (
    <SlideOver
      open={open}
      title={order.value ? `Review B2B Order ${order.value.doc_number}` : "Review B2B Online Order"}
      subtitle="Verify items, assign stock batches, and convert to confirmed tax invoice."
      width="680px"
    >
      {loading.value ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
          <LuRefreshCw style="width: 1.5rem; height: 1.5rem; animation: spin 1s linear infinite; margin: 0 auto 0.5rem;" />
          <div>Loading order details & inventory batches…</div>
        </div>
      ) : error.value ? (
        <div style={{ padding: "1rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.5rem", color: "#ef4444" }}>
          <div style={{ fontWeight: "600", marginBottom: "0.25rem" }}>Failed to load order</div>
          <div style={{ fontSize: "0.875rem" }}>{error.value}</div>
        </div>
      ) : !order.value ? (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>
          No order selected.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          
          {/* Status & Buyer Card */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.75rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <LuBuilding2 style="width: 1.1rem; height: 1.1rem; color: var(--accent);" />
                  <span style={{ fontWeight: "600", fontSize: "1rem", color: "var(--text-primary)" }}>
                    {creditContext.value?.customer_name || order.value.customer_name || "Direct Retail Buyer"}
                  </span>
                  {creditContext.value && (
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: "600",
                        padding: "0.15rem 0.45rem",
                        borderRadius: "0.25rem",
                        background: "rgba(16,185,129,0.12)",
                        color: "#10b981",
                        border: "1px solid rgba(16,185,129,0.25)",
                      }}
                    >
                      ✓ Customer Directory Linked
                    </span>
                  )}
                </div>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: "600",
                    padding: "0.2rem 0.6rem",
                    borderRadius: "1rem",
                    background: order.value.status === "invoiced"
                      ? "rgba(16,185,129,0.15)"
                      : order.value.status === "rejected"
                      ? "rgba(239,68,68,0.15)"
                      : "rgba(245,158,11,0.15)",
                    color: order.value.status === "invoiced"
                      ? "#10b981"
                      : order.value.status === "rejected"
                      ? "#ef4444"
                      : "#f59e0b",
                    textTransform: "uppercase",
                  }}
                >
                  {order.value.status.replace("_", " ")}
                </span>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.5rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                {(creditContext.value?.phone || order.value.customer_phone) && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <LuPhone style="width: 0.85rem; height: 0.85rem; flex-shrink: 0;" />
                    <span>{creditContext.value?.phone || order.value.customer_phone}</span>
                  </div>
                )}
                {(creditContext.value?.email || order.value.customer_email) && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <LuMail style="width: 0.85rem; height: 0.85rem; flex-shrink: 0;" />
                    <span>{creditContext.value?.email || order.value.customer_email}</span>
                  </div>
                )}
                {(creditContext.value?.gstin || order.value.customer_gstin) && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <LuFileText style="width: 0.85rem; height: 0.85rem; flex-shrink: 0;" />
                    <span>GSTIN: <strong>{creditContext.value?.gstin || order.value.customer_gstin}</strong></span>
                  </div>
                )}
                {(creditContext.value?.billing_addr || order.value.customer_address) && (
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <LuMapPin style="width: 0.85rem; height: 0.85rem; flex-shrink: 0;" />
                    <span>{creditContext.value?.billing_addr || order.value.customer_address}</span>
                  </div>
                )}
              </div>

              {order.value.notes && (
                <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "1px dashed var(--border)", fontSize: "0.8125rem", color: "var(--text-secondary)", display: "flex", alignItems: "flex-start", gap: "0.4rem" }}>
                  <LuTruck style="width: 0.9rem; height: 0.9rem; margin-top: 0.1rem; color: var(--accent);" />
                  <div>
                    <strong style={{ color: "var(--text-primary)" }}>Transport & Dispatch Notes: </strong>
                    {order.value.notes}
                  </div>
                </div>
              )}
            </div>

            {/* ── Credit Line & Account Balance (Matches CustomerDetailSlideOver) ──── */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem 1rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <LuCreditCard style="width: 0.95rem; height: 0.95rem; color: var(--accent);" />
                  <span style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                    Credit Line &amp; Balance {creditContext.value?.customer_name ? `(${creditContext.value.customer_name})` : ""}
                  </span>
                </div>
                {creditContext.value && (
                  <button
                    type="button"
                    onClick$={() => { isEditingCreditLimit.value = !isEditingCreditLimit.value; }}
                    style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.8125rem", cursor: "pointer", padding: 0 }}
                  >
                    {isEditingCreditLimit.value ? "Cancel" : "Edit Limit"}
                  </button>
                )}
              </div>

              {/* Edit Credit Limit inline */}
              {isEditingCreditLimit.value && (
                <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
                  <input
                    type="number"
                    min="0"
                    placeholder="Credit Limit (₹)"
                    value={newCreditLimit.value}
                    onInput$={(e) => { newCreditLimit.value = (e.target as HTMLInputElement).value; }}
                    style={{
                      flex: 1,
                      padding: "0.4rem 0.6rem",
                      background: "var(--field-fill)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.375rem",
                      color: "var(--text-primary)",
                      fontSize: "0.8125rem",
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick$={$(async () => {
                      const targetId = creditContext.value?.customer_id || order.value?.customer_id;
                      if (!targetId) return;
                      const limit = parseFloat(newCreditLimit.value) || 0;
                      try {
                        await invoke("shop_update_customer", {
                          data: {
                            id: targetId,
                            name: creditContext.value?.customer_name || order.value?.customer_name || "Customer",
                            phone: creditContext.value?.phone || order.value?.customer_phone || null,
                            email: creditContext.value?.email || order.value?.customer_email || null,
                            credit_limit: limit,
                          },
                        });
                        if (creditContext.value) {
                          const used = creditContext.value.credit_used;
                          creditContext.value = {
                            ...creditContext.value,
                            credit_limit: limit,
                            available_credit: Math.max(0, limit - used),
                            is_over_limit: used > limit,
                          };
                        }
                        isEditingCreditLimit.value = false;
                      } catch (err) {
                        console.error("Failed to update credit limit:", err);
                      }
                    })}
                    style={{ padding: "0 0.875rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                  >
                    Save
                  </button>
                </div>
              )}

              {creditContext.value ? (
                <div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.5rem", padding: "0.25rem 0" }}>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Credit Limit</div>
                      <div style={{ fontWeight: "600", fontSize: "0.875rem", color: "var(--text-primary)", marginTop: "0.15rem" }}>
                        {fmtMoney(creditContext.value.credit_limit)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Prior Dues</div>
                      <div style={{ fontWeight: "600", fontSize: "0.875rem", color: creditContext.value.credit_used > 0 ? "var(--error, #ef4444)" : "var(--text-primary)", marginTop: "0.15rem" }}>
                        {fmtMoney(creditContext.value.credit_used)}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>Available Credit</div>
                      <div style={{ fontWeight: "700", fontSize: "0.875rem", color: creditContext.value.available_credit > 0 ? "#10b981" : "var(--error, #ef4444)", marginTop: "0.15rem" }}>
                        {fmtMoney(creditContext.value.available_credit)}
                      </div>
                    </div>
                  </div>

                  {/* Over limit warning if order exceeds available credit */}
                  {totals.value.grand > creditContext.value.available_credit && (
                    <div style={{
                      marginTop: "0.625rem",
                      padding: "0.4rem 0.6rem",
                      borderRadius: "0.375rem",
                      background: "rgba(239,68,68,0.1)",
                      border: "1px solid rgba(239,68,68,0.25)",
                      color: "#ef4444",
                      fontSize: "0.75rem",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.4rem"
                    }}>
                      <LuAlertTriangle style="width: 0.9rem; height: 0.9rem; flex-shrink: 0;" />
                      <span>
                        Order amount ({fmtMoney(totals.value.grand)}) exceeds available credit limit ({fmtMoney(creditContext.value.available_credit)}) by {fmtMoney(totals.value.grand - creditContext.value.available_credit)}
                      </span>
                    </div>
                  )}

                  {/* Wallet / Store Credit balance */}
                  {Boolean(creditContext.value.wallet_balance && creditContext.value.wallet_balance > 0) && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", justifyContent: "space-between" }}>
                      <span>Customer Wallet Balance</span>
                      <span style={{ fontWeight: "600", color: "#10b981" }}>{fmtMoney(creditContext.value.wallet_balance || 0)}</span>
                    </div>
                  )}

                  {/* Lifetime Customer Metrics */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", marginTop: "0.625rem", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                      Lifetime Spend: <strong style={{ color: "var(--text-primary)" }}>{fmtMoney(creditContext.value.total_spent || 0)}</strong>
                    </div>
                    <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", textAlign: "right" }}>
                      Total Orders: <strong style={{ color: "var(--text-primary)" }}>{creditContext.value.total_orders || 0}</strong>
                    </div>
                  </div>

                  {/* Outstanding Invoices Accordion */}
                  {creditContext.value.outstanding_invoices.length > 0 && (
                    <div style={{ marginTop: "0.5rem", borderTop: "1px solid var(--border)", paddingTop: "0.4rem" }}>
                      <button
                        type="button"
                        onClick$={() => { showOutstanding.value = !showOutstanding.value; }}
                        style={{ background: "transparent", border: "none", color: "var(--accent)", fontSize: "0.75rem", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                      >
                        {showOutstanding.value ? "Hide prior unpaid invoices" : `View ${creditContext.value.outstanding_invoices.length} prior unpaid invoice(s)`}
                      </button>
                      {showOutstanding.value && (
                        <div style={{ marginTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.35rem", maxHeight: "130px", overflowY: "auto" }}>
                          {creditContext.value.outstanding_invoices.map((inv) => (
                            <div key={inv.document_id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", padding: "0.25rem 0", borderBottom: "1px solid var(--border)" }}>
                              <span style={{ color: "var(--text-primary)" }}>{inv.doc_number}</span>
                              <span style={{ color: "var(--error, #ef4444)", fontWeight: "600" }}>Due: {fmtMoney(inv.amount_due)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ padding: "0.25rem 0" }}>
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                    No registered credit customer matches phone <strong>{order.value.customer_phone || "—"}</strong> or email <strong>{order.value.customer_email || "—"}</strong>.
                  </div>
                  <button
                    type="button"
                    onClick$={handleRegisterBuyerAsCustomer}
                    disabled={submitting.value}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      padding: "0.35rem 0.75rem",
                      borderRadius: "0.375rem",
                      border: "1px solid var(--accent)",
                      background: "rgba(59,130,246,0.08)",
                      color: "var(--accent)",
                      fontSize: "0.75rem",
                      fontWeight: "600",
                      cursor: "pointer",
                    }}
                  >
                    <LuUser style="width: 0.85rem; height: 0.85rem;" />
                    <span>Register {order.value.customer_name || "Buyer"} as Customer &amp; Set Credit</span>
                  </button>
                </div>
              )}
            </div>

            {/* Line Items Table */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", overflow: "hidden" }}>
              <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--surface-1)" }}>
                <span style={{ fontWeight: "600", fontSize: "0.875rem", color: "var(--text-primary)" }}>
                  Order Line Items ({lines.value.length})
                </span>
                <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Assign warehouse batch (FEFO)
                </span>
              </div>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)", background: "var(--surface-2)", color: "var(--text-secondary)", textAlign: "left" }}>
                      <th style={{ padding: "0.5rem 0.75rem" }}>Item & Batch</th>
                      <th style={{ padding: "0.5rem 0.5rem", textAlign: "center" }}>Qty</th>
                      <th style={{ padding: "0.5rem 0.5rem", textAlign: "right" }}>Rate</th>
                      <th style={{ padding: "0.5rem 0.5rem", textAlign: "right" }}>Disc%</th>
                      <th style={{ padding: "0.5rem 0.75rem", textAlign: "right" }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.value.map((line, idx) => {
                      const itemBatches = batchMap.value[line.item_id] || [];
                      const selectedBatch = selectedBatches.value[line.item_id];
                      const hasScheme = (line.scheme_on || 0) > 0 && (line.scheme_free || 0) > 0;

                      return (
                        <tr key={line.id || idx} style={{ borderBottom: "1px solid var(--border)" }}>
                          {/* Item & Batch Picker */}
                          <td style={{ padding: "0.6rem 0.75rem", verticalAlign: "top" }}>
                            <div style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                              {line.description || "Item"}
                            </div>
                            {line.pack_size && (
                              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                                Pack: {line.pack_size}
                              </div>
                            )}

                            {/* Batch selector dropdown */}
                            <div style={{ marginTop: "0.35rem" }}>
                              {itemBatches.length === 0 ? (
                                <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", background: "var(--surface-3)", padding: "0.1rem 0.35rem", borderRadius: "0.2rem" }}>
                                  No tracked batches
                                </span>
                              ) : (
                                <select
                                  value={selectedBatch?.id || ""}
                                  onChange$={(e) => {
                                    const bId = (e.target as HTMLSelectElement).value;
                                    const found = itemBatches.find((b) => b.id === bId) || null;
                                    selectedBatches.value = {
                                      ...selectedBatches.value,
                                      [line.item_id]: found,
                                    };
                                  }}
                                  style={{
                                    fontSize: "0.725rem",
                                    padding: "0.15rem 0.4rem",
                                    borderRadius: "0.25rem",
                                    border: "1px solid var(--border)",
                                    background: "var(--field-fill)",
                                    color: "var(--text-primary)",
                                    maxWidth: "100%",
                                  }}
                                >
                                  {itemBatches.map((b) => (
                                    <option key={b.id} value={b.id}>
                                      {`Batch ${b.batch_no || (b as any).batch_number} (${b.qty_remaining} left)`}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </div>
                          </td>

                          {/* Qty & Schemes */}
                          <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", textAlign: "center" }}>
                            <div style={{ display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                              <button
                                type="button"
                                onClick$={() => updateLineQty(idx, -1)}
                                style={{ width: "1.25rem", height: "1.25rem", borderRadius: "0.25rem", border: "1px solid var(--border)", background: "var(--surface-3)", color: "var(--text-primary)", cursor: "pointer", fontSize: "0.75rem" }}
                              >
                                -
                              </button>
                              <span style={{ fontWeight: "600", minWidth: "1.5rem", textAlign: "center" }}>
                                {line.qty}
                              </span>
                              <button
                                type="button"
                                onClick$={() => updateLineQty(idx, 1)}
                                style={{ width: "1.25rem", height: "1.25rem", borderRadius: "0.25rem", border: "1px solid var(--border)", background: "var(--surface-3)", color: "var(--text-primary)", cursor: "pointer", fontSize: "0.75rem" }}
                              >
                                +
                              </button>
                            </div>
                            {hasScheme && (
                              <div style={{ fontSize: "0.675rem", color: "#10b981", fontWeight: "600", marginTop: "0.2rem" }}>
                                +{line.free_qty || 0} Free
                              </div>
                            )}
                          </td>

                          {/* Rate */}
                          <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", textAlign: "right" }}>
                            {fmtMoney(line.unit_price)}
                          </td>

                          {/* Disc% */}
                          <td style={{ padding: "0.6rem 0.5rem", verticalAlign: "top", textAlign: "right", color: line.discount_pct > 0 ? "#10b981" : "var(--text-secondary)" }}>
                            {line.discount_pct > 0 ? `${line.discount_pct}%` : "—"}
                          </td>

                          {/* Line Total */}
                          <td style={{ padding: "0.6rem 0.75rem", verticalAlign: "top", textAlign: "right", fontWeight: "600", color: "var(--text-primary)" }}>
                            {fmtMoney(line.line_total)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Totals Breakdown */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.75rem 1rem", alignSelf: "flex-end", width: "100%", maxWidth: "280px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                <span>Subtotal</span>
                <span>{fmtMoney(totals.value.subtotal)}</span>
              </div>
              {totals.value.totalDiscount > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "#10b981", marginBottom: "0.35rem" }}>
                  <span>Scheme / Cash Disc</span>
                  <span>-{fmtMoney(totals.value.totalDiscount)}</span>
                </div>
              )}
              {totals.value.totalTax > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                  <span>GST Tax</span>
                  <span>{fmtMoney(totals.value.totalTax)}</span>
                </div>
              )}
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1rem", fontWeight: "700", color: "var(--text-primary)", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
                <span>Grand Total</span>
                <span>{fmtMoney(totals.value.grand)}</span>
              </div>
            </div>

            {/* Rejection Prompt */}
            {showRejectConfirm.value && (
              <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "0.5rem", padding: "0.75rem 1rem", marginTop: "0.5rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#ef4444", fontWeight: "600", fontSize: "0.875rem", marginBottom: "0.35rem" }}>
                  <LuAlertTriangle style="width: 1rem; height: 1rem;" />
                  <span>Reject this Order?</span>
                </div>
                <input
                  type="text"
                  placeholder="Reason for rejection (e.g. Out of stock, Credit limit exceeded)…"
                  value={rejectReason.value}
                  onInput$={(e) => { rejectReason.value = (e.target as HTMLInputElement).value; }}
                  style={{
                    width: "100%",
                    padding: "0.4rem 0.6rem",
                    borderRadius: "0.375rem",
                    border: "1px solid var(--border)",
                    background: "var(--field-fill)",
                    color: "var(--text-primary)",
                    fontSize: "0.8125rem",
                    marginBottom: "0.5rem",
                    boxSizing: "border-box",
                  }}
                />
                <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    onClick$={() => { showRejectConfirm.value = false; }}
                    style={{ padding: "0.35rem 0.75rem", borderRadius: "0.375rem", border: "1px solid var(--border)", background: "var(--surface-3)", color: "var(--text-primary)", fontSize: "0.75rem", cursor: "pointer" }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick$={handleRejectOrder}
                    disabled={submitting.value}
                    style={{ padding: "0.35rem 0.75rem", borderRadius: "0.375rem", border: "none", background: "#ef4444", color: "#fff", fontSize: "0.75rem", fontWeight: "600", cursor: "pointer" }}
                  >
                    {submitting.value ? "Rejecting…" : "Confirm Rejection"}
                  </button>
                </div>
              </div>
            )}
        </div>
      )}

      {/* ── Fixed Bottom Actions Footer ───────────────────────────── */}
      {order.value && !loading.value && (
        <div
          q:slot="footer"
          style={{
            padding: "0.875rem 1.25rem",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.75rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            {order.value.customer_phone && (
              <button
                type="button"
                onClick$={openWhatsAppToBuyer}
                title="Chat with retailer on WhatsApp"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  height: "2.375rem",
                  padding: "0 0.875rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                  background: "#25D366",
                  color: "#fff",
                  fontSize: "0.8125rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                <WhatsAppIcon style="width: 1rem; height: 1rem; fill: currentColor;" />
                <span>WhatsApp</span>
              </button>
            )}
            {order.value.status !== "invoiced" && order.value.status !== "rejected" && !showRejectConfirm.value && (
              <button
                type="button"
                onClick$={() => { showRejectConfirm.value = true; }}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                  height: "2.375rem",
                  padding: "0 0.875rem",
                  borderRadius: "0.375rem",
                  border: "1px solid rgba(239,68,68,0.3)",
                  background: "transparent",
                  color: "#ef4444",
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                <LuXCircle style="width: 0.9rem; height: 0.9rem;" />
                <span>Reject</span>
              </button>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            {order.value.status === "invoiced" ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.4rem 0.875rem",
                  borderRadius: "0.375rem",
                  background: "rgba(16,185,129,0.12)",
                  color: "#10b981",
                  border: "1px solid rgba(16,185,129,0.3)",
                  fontSize: "0.8125rem",
                  fontWeight: "600",
                }}
              >
                <LuCheckCircle2 style="width: 1rem; height: 1rem;" />
                <span>Tax Invoice Generated</span>
              </span>
            ) : order.value.status === "rejected" ? (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  padding: "0.4rem 0.875rem",
                  borderRadius: "0.375rem",
                  background: "rgba(239,68,68,0.12)",
                  color: "#ef4444",
                  border: "1px solid rgba(239,68,68,0.3)",
                  fontSize: "0.8125rem",
                  fontWeight: "600",
                }}
              >
                <LuXCircle style="width: 1rem; height: 1rem;" />
                <span>Order Rejected</span>
              </span>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  type="button"
                  onClick$={() => handleAcceptAndBill("pos")}
                  disabled={submitting.value || lines.value.length === 0}
                  title="Open standard POS modal"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                    height: "2.5rem",
                    padding: "0 1rem",
                    borderRadius: "0.375rem",
                    border: "1px solid var(--border)",
                    background: "var(--surface-3)",
                    color: "var(--text-primary)",
                    fontSize: "0.8125rem",
                    fontWeight: "600",
                    cursor: submitting.value ? "not-allowed" : "pointer",
                    opacity: submitting.value ? 0.7 : 1,
                    transition: "all 120ms ease",
                  }}
                >
                  <LuCheckCircle2 style="width: 0.95rem; height: 0.95rem; color: #10b981;" />
                  <span>Bill in POS</span>
                </button>

                <button
                  type="button"
                  onClick$={() => handleAcceptAndBill("custom")}
                  disabled={submitting.value || lines.value.length === 0}
                  title="Open Custom Bill with inline discount % and rate overrides"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    height: "2.5rem",
                    padding: "0 1.25rem",
                    borderRadius: "0.375rem",
                    border: "none",
                    background: "var(--button-primary-bg)",
                    color: "var(--button-primary-text)",
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    cursor: submitting.value ? "not-allowed" : "pointer",
                    opacity: submitting.value ? 0.7 : 1,
                    boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
                    transition: "all 120ms ease",
                  }}
                >
                  <LuSlidersHorizontal style="width: 1rem; height: 1rem;" />
                  <span>Custom Bill</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </SlideOver>
  );
});

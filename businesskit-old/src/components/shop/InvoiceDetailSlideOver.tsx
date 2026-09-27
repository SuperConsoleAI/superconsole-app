// src/components/shop/InvoiceDetailSlideOver.tsx
//
// IPC: shop_get_invoice → InvoiceWithLines (#[serde(flatten)] — all fields at root)

import {
  component$,
  useSignal,
  useStylesScoped$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import { LuPrinter, LuDownload, LuCreditCard, LuHistory, LuSparkles, LuPencil } from "@qwikest/icons/lucide";
import { WhatsAppIcon } from "./InvoicePrintModal";
import { SlideOver } from "~/components/SlideOver";
import { fmtMoney } from "~/lib/fin-format";
import { invoke } from "@tauri-apps/api/core";
import { DemoBillGenerator } from "./DemoBillGenerator";

export const CreditCardReaderIcon = component$<{ style?: any; class?: string }>(({ style, class: className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    style={style}
    class={className}
  >
    <path d="M3 5v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2Z" />
    <path d="M7 15h10" />
    <path d="M7 11h2" />
    <path d="M13 11h4" />
    <path d="M3 8h18" />
  </svg>
));

export const Columns3CogIcon = component$<{ style?: any; class?: string }>(({ style, class: className }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    style={style}
    class={className}
  >
    <rect width="18" height="18" x="3" y="3" rx="2" />
    <path d="M9 3v18" />
    <path d="M15 3v6" />
    <path d="m19 14.2.5.3a.8.8 0 0 1 .3.5v.6a.8.8 0 0 1-.3.5l-.5.3-.1.6.5.5a.8.8 0 0 1 .1.6l-.3.5a.8.8 0 0 1-.5.3l-.6-.1-.3.5a.8.8 0 0 1-.5.3h-.6a.8.8 0 0 1-.5-.3l-.3-.5-.6.1a.8.8 0 0 1-.5-.3l-.3-.5a.8.8 0 0 1 .1-.6l.5-.5-.1-.6-.5-.3a.8.8 0 0 1-.3-.5v-.6a.8.8 0 0 1 .3-.5l.5-.3.1-.6-.5-.5a.8.8 0 0 1-.1-.6l.3-.5a.8.8 0 0 1 .5-.3l.6.1.3-.5a.8.8 0 0 1 .5-.3h.6a.8.8 0 0 1 .5.3l.3.5.6-.1a.8.8 0 0 1 .5.3l.3.5a.8.8 0 0 1-.1.6l-.5.5.1.6Z" />
    <circle cx="17.5" cy="16.5" r="1.2" />
  </svg>
));

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoiceBasic {
  id: string;
  user_id?: string | null;
  updated_by?: string | null;
  creator_name?: string | null;
  updater_name?: string | null;
  staff_id?: string | null;
  staff_name?: string | null;
  doc_number: string;
  doc_date: number;
  status: string;
  subtotal: number;
  discount_amt: number;
  tax_amount: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  profit: number;           // 0 for old invoices with no cost data
  customer_name: string | null;
  payment_mode: string | null;
  created_at?: number;
  updated_at?: number;
  is_modified?: boolean | null;
  modified_at?: number | null;
  modified_by?: string | null;
}

export interface InvoiceLine {
  id: string;
  item_id: string;
  description: string | null;
  qty: number;
  free_qty?: number | null;
  pack_size?: string | null;
  conversion_factor?: number | null;
  unit_price: number;
  unit_cost: number;
  landing_cost?: number | null;
  mrp?: number | null;
  hsn_sac_code?: string | null;
  hsn?: string | null;
  resolved_hsn?: string | null;
  scheme_on?: number | null;
  scheme_free?: number | null;
  discount_pct: number;
  discount_amt: number;
  tax_amount: number;
  line_meta?: string | null;
  line_total: number;
  sort_order?: number;
  pricing_snapshot?: string | null;
}

export interface DocumentPayment {
  id: string;
  amount: number;
  currency: string;
  payment_mode: string;
  reference?: string | null;
  payment_date: number;
  notes?: string | null;
}

// Flat — matches Rust InvoiceWithLines { #[serde(flatten)] invoice, lines, payments }
export interface InvoiceDetail {
  id: string;
  user_id?: string | null;
  updated_by?: string | null;
  creator_name?: string | null;
  updater_name?: string | null;
  staff_id?: string | null;
  staff_name?: string | null;
  is_modified?: boolean | null;
  modified_at?: number | null;
  modified_by?: string | null;
  doc_number: string;
  doc_date: number;
  status: string;
  channel: string;
  subtotal: number;
  discount_amt: number;
  tax_amount: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  profit: number;
  notes: string | null;
  created_at: number;
  updated_at?: number;
  customer_id?: string | null;
  customer_name: string | null;
  payment_mode: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  customer_gstin?: string | null;
  customer_pan?: string | null;
  customer_address?: string | null;
  customer_city?: string | null;
  customer_state?: string | null;
  customer_dl_no?: string | null;
  customer_gst_supply_type?: string | null;
  customer_country?: string | null;
  bill_discount_pct?: number | null;
  bill_discount_amt?: number | null;
  lines: InvoiceLine[];
  payments?: DocumentPayment[];
}

export interface InvoiceDetailSlideOverProps {
  open: Signal<boolean>;
  invoice: Signal<InvoiceBasic | null>;
  detail: Signal<InvoiceDetail | null>;
  loading: Signal<boolean>;
  error: Signal<string | null>;
  onEdit$?: PropFunction<(detail: InvoiceDetail) => void>;
  onEditInPos$?: PropFunction<(detail: InvoiceDetail) => void>;
  onEditInCustom$?: PropFunction<(detail: InvoiceDetail) => void>;
  onPrint$?: PropFunction<(detail: InvoiceDetail) => void>;
  onDownload$?: PropFunction<(detail: InvoiceDetail) => void>;
  onWhatsApp$?: PropFunction<(detail: InvoiceDetail) => void>;
  onPaymentRecorded$?: PropFunction<() => void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number, currency?: string) => fmtMoney(n, currency);

const fmtDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });

const fmtDateTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const PAY_ICON: Record<string, string> = {
  cash: "💵",
  card: "💳",
  upi: "📱",
  bank: "🏦",
  cheque: "📝",
};

const inpStyle = {
  width: "100%", height: "2.25rem", padding: "0 0.65rem",
  background: "var(--field-fill)", border: "1px solid var(--border)",
  borderRadius: "0.375rem", color: "var(--text-primary)",
  fontSize: "0.875rem", outline: "none", boxSizing: "border-box" as const,
};

const STYLES = `
  .invoice-slideover-btn {
    height: 1.5rem;
    padding: 0 0.5rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    box-sizing: border-box;
    line-height: 1;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .invoice-slideover-btn:hover {
    filter: brightness(1.08);
  }

  .invoice-slideover-btn-collect {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    border: none;
  }

  .invoice-slideover-btn-edit {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-secondary);
  }

  .invoice-slideover-btn-custom {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-primary);
  }

  .invoice-slideover-btn-wa {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-primary);
  }

  .invoice-slideover-btn-pdf,
  .invoice-slideover-btn-print {
    background: transparent;
    color: var(--text-primary);
    border: 1px solid var(--border);
  }

  .badge-mod-full {
    display: inline;
  }
  .badge-mod-short {
    display: none;
  }
  .creator-label {
    display: inline;
  }

  @media (max-width: 640px) {
    .creator-label {
      display: none !important;
    }
    .badge-mod-full {
      display: none !important;
    }
    .badge-mod-short {
      display: inline !important;
    }
    .btn-text {
      display: none !important;
    }
    .btn-text-mobile {
      display: inline !important;
    }
    .invoice-slideover-btn {
      height: 1.5rem;
      padding: 0 0.4rem;
      gap: 0;
    }
    .invoice-slideover-btn-collect {
      padding: 0 0.45rem;
      gap: 0.25rem;
    }
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export const InvoiceDetailSlideOver = component$<InvoiceDetailSlideOverProps>(
  ({ open, invoice, detail, loading, error, onEdit$, onEditInPos$, onEditInCustom$, onPrint$, onDownload$, onWhatsApp$, onPaymentRecorded$ }) => {
    useStylesScoped$(STYLES);
    const inv = invoice.value;

    // False bill / custom generator modal state
    const showFalseBillModal = useSignal(false);

    // Collect payment form state
    const showCollect = useSignal(false);
    const collectAmount = useSignal("");
    const collectMode = useSignal("cash");
    const collectRef = useSignal("");
    const collectNotes = useSignal("");
    const collecting = useSignal(false);
    const collectError = useSignal<string | null>(null);

    // Compute UI status badge from state matrix
    const getStatusBadge = () => {
      if (!inv) return { label: "Draft", bg: "var(--surface-3)", text: "var(--text-secondary)" };
      if (inv.status === "draft") return { label: "Draft", bg: "var(--surface-3)", text: "var(--text-secondary)" };
      if (inv.status === "cancelled") return { label: "Cancelled", bg: "rgba(239,68,68,0.12)", text: "#ef4444" };
      if (inv.status === "refunded") return { label: "Refunded", bg: "rgba(245,158,11,0.12)", text: "#f59e0b" };
      if (inv.amount_paid <= 0.005) return { label: "Unpaid", bg: "rgba(239,68,68,0.12)", text: "#ef4444" };
      if (inv.amount_due > 0.005) return { label: "Partially Paid", bg: "rgba(245,158,11,0.12)", text: "#f59e0b" };
      return { label: "Paid", bg: "rgba(16,185,129,0.12)", text: "#10b981" };
    };

    const sc = getStatusBadge();

    // Profit calculation
    const hasCostData = detail.value
      ? detail.value.lines.some(l => l.unit_cost > 0)
      : false;
    const profit = hasCostData
      ? detail.value!.lines.reduce((sum, l) => sum + (l.unit_price - l.unit_cost) * l.qty, 0)
      : null;
    const margin = profit !== null && detail.value && detail.value.subtotal > 0
      ? (profit / detail.value.subtotal) * 100
      : null;

    const handleOpenCollect = $(() => {
      collectAmount.value = inv ? String(inv.amount_due) : "";
      collectMode.value = "cash";
      collectRef.value = "";
      collectNotes.value = "";
      collectError.value = null;
      showCollect.value = !showCollect.value;
    });

    const handleRecordPayment = $(async () => {
      if (!inv) return;
      const amt = parseFloat(collectAmount.value);
      if (isNaN(amt) || amt <= 0) {
        collectError.value = "Please enter a valid payment amount";
        return;
      }
      collecting.value = true;
      collectError.value = null;
      try {
        await invoke("shop_record_payment", {
          data: {
            invoice_id: inv.id,
            amount: amt,
            payment_mode: collectMode.value,
            reference: collectRef.value.trim() || null,
            notes: collectNotes.value.trim() || null,
          },
        });

        // Re-fetch detail to update lines and payment history
        const refreshed = await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: inv.id });
        detail.value = refreshed;
        invoice.value = {
          ...inv,
          amount_paid: refreshed.amount_paid,
          amount_due: refreshed.amount_due,
          status: refreshed.status,
          payment_mode: refreshed.payment_mode,
        };
        showCollect.value = false;
        if (onPaymentRecorded$) await onPaymentRecorded$();
      } catch (err: any) {
        collectError.value = String(err?.message || err);
      } finally {
        collecting.value = false;
      }
    });

    return (
      <>
        <SlideOver
          open={open}
          title={inv?.doc_number ?? "Invoice"}
          subtitle={inv ? fmtDate(inv.doc_date) : ""}
          width="480px"
        >
          {inv && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

              {/* ── Customer + payment method ───────────────────────────── */}
              {(inv.customer_name || inv.payment_mode) && (
                <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", padding: "0.625rem 0.875rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div style={{ fontSize: "0.875rem", color: "var(--text-primary)", fontWeight: "500" }}>
                      {inv.customer_name ?? "Walk-in"}
                    </div>
                    {inv.payment_mode && (
                      <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.25rem" }}>
                        {PAY_ICON[inv.payment_mode] ?? "💰"} {inv.payment_mode.toUpperCase()}
                      </span>
                    )}
                  </div>
                  {detail.value?.customer_gst_supply_type && detail.value.customer_gst_supply_type !== "regular" && (
                    <div style={{ fontSize: "0.72rem", color: "#3b82f6", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.2)", borderRadius: "0.25rem", padding: "0.25rem 0.5rem", marginTop: "0.15rem" }}>
                      🛡️ <strong>Zero-Rated Supply ({detail.value.customer_gst_supply_type.toUpperCase()}):</strong> Supply meant for export/SEZ under Letter of Undertaking (LUT) without payment of integrated tax.
                    </div>
                  )}
                </div>
              )}

              {/* ── Stat cards ─────────────────────────────────────────── */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.625rem" }}>
                {[
                  { label: "Total", value: fmt(inv.grand_total), color: "var(--text-primary)" },
                  { label: "Paid", value: fmt(inv.amount_paid), color: "#10b981" },
                  { label: "Due", value: inv.amount_due > 0 ? fmt(inv.amount_due) : "—", color: inv.amount_due > 0 ? "#ef4444" : "var(--text-secondary)" },
                ].map(s => (
                  <div key={s.label} style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.625rem 0.75rem" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "0.25rem" }}>{s.label}</div>
                    <div style={{ fontSize: "1rem", fontWeight: "700", color: s.color, fontVariantNumeric: "tabular-nums" }}>{s.value}</div>
                  </div>
                ))}
              </div>

              {/* Status badge + MODIFIED badge + channel + Profit */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                <span style={{ display: "inline-block", padding: "0.2rem 0.8rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: "700", textTransform: "capitalize", background: sc.bg, color: sc.text }}>
                  {sc.label}
                </span>
                {detail.value?.status !== "draft" && detail.value?.status !== "cancelled" && !!(detail.value?.is_modified || detail.value?.modified_at || (detail.value?.updated_at && detail.value?.created_at && detail.value.updated_at > detail.value.created_at + 10)) && (
                  <span style={{ display: "inline-flex", alignItems: "center", padding: "0.15rem 0.5rem", borderRadius: "0.5rem", fontSize: "0.72rem", fontWeight: "600", background: "transparent", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                    MODIFIED
                  </span>
                )}
                {detail.value?.channel && (
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>via {detail.value.channel}</span>
                )}
                {profit !== null && (
                  <span style={{ fontSize: "0.75rem", fontWeight: "600", color: profit >= 0 ? "#10b981" : "#ef4444", marginLeft: "auto" }}>
                    Profit {fmt(profit)}{margin !== null ? ` (${margin.toFixed(1)}%)` : ""}
                  </span>
                )}
              </div>

              {/* ── Collect Payment CTA Button (when unpaid / partial / due) ── */}
              {inv.status !== "draft" && inv.amount_due > 0.005 && !showCollect.value && (
                <button
                  type="button"
                  onClick$={handleOpenCollect}
                  style={{
                    width: "100%",
                    height: "2.35rem",
                    background: "var(--button-primary-bg)",
                    color: "var(--button-primary-text)",
                    border: "none",
                    borderRadius: "0.5rem",
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "0.5rem",
                    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                    transition: "all 0.15s ease",
                  }}
                >
                  <LuCreditCard style={{ width: "1rem", height: "1rem" }} />
                  <span>Collect Payment (Due: {fmt(inv.amount_due)})</span>
                </button>
              )}

              {/* ── Collect Payment Form (Collapsible) ───────────────────── */}
              {showCollect.value && (
                <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)" }}>
                    Collect Payment (Due: {fmt(inv.amount_due)})
                  </div>
                  {collectError.value && (
                    <div style={{ padding: "0.4rem 0.6rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.25rem", color: "#ef4444", fontSize: "0.75rem" }}>
                      {collectError.value}
                    </div>
                  )}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Amount (₹) *</label>
                      <input
                        type="number"
                        step="0.01"
                        value={collectAmount.value}
                        onInput$={(e) => { collectAmount.value = (e.target as HTMLInputElement).value; }}
                        style={inpStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Payment Mode</label>
                      <select
                        value={collectMode.value}
                        onChange$={(e) => { collectMode.value = (e.target as HTMLSelectElement).value; }}
                        style={{ ...inpStyle, cursor: "pointer" }}
                      >
                        <option value="cash">Cash 💵</option>
                        <option value="upi">UPI 📱</option>
                        <option value="card">Card 💳</option>
                        <option value="bank">Bank Transfer 🏦</option>
                        <option value="cheque">Cheque 📝</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Reference / Txn ID</label>
                      <input
                        type="text"
                        placeholder="e.g. UPI Ref / Cheque No"
                        value={collectRef.value}
                        onInput$={(e) => { collectRef.value = (e.target as HTMLInputElement).value; }}
                        style={inpStyle}
                      />
                    </div>
                    <div>
                      <label style={{ display: "block", fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.2rem" }}>Notes (Optional)</label>
                      <input
                        type="text"
                        placeholder="e.g. Paid in cash at desk"
                        value={collectNotes.value}
                        onInput$={(e) => { collectNotes.value = (e.target as HTMLInputElement).value; }}
                        style={inpStyle}
                      />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "0.25rem" }}>
                    <button
                      type="button"
                      onClick$={() => { showCollect.value = false; }}
                      style={{ padding: "0 0.875rem", height: "2rem", background: "transparent", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.75rem", color: "var(--text-secondary)", cursor: "pointer" }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={collecting.value}
                      onClick$={handleRecordPayment}
                      style={{ padding: "0 1rem", height: "2rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", cursor: collecting.value ? "not-allowed" : "pointer" }}
                    >
                      {collecting.value ? "Recording…" : `Confirm ${collectAmount.value ? fmt(parseFloat(collectAmount.value) || 0) : ""} Payment`}
                    </button>
                  </div>
                </div>
              )}

              {/* ── Transaction History (if payments exist) ─────────────── */}
              {detail.value?.payments && detail.value.payments.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <LuHistory style={{ width: "0.85rem", height: "0.85rem" }} />
                    Transactions & Payments ({detail.value.payments.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                    {detail.value.payments.map((p) => (
                      <div
                        key={p.id}
                        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.5rem 0.75rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem" }}
                      >
                        <div>
                          <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                            <span>{PAY_ICON[p.payment_mode] ?? "💰"}</span>
                            <span>{p.payment_mode.toUpperCase()}</span>
                            {p.reference && (
                              <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontFamily: "monospace", marginLeft: "0.25rem" }}>
                                ({p.reference})
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                            {fmtDateTime(p.payment_date || inv.doc_date)} {p.notes ? `• ${p.notes}` : ""}
                          </div>
                        </div>
                        <div style={{ fontSize: "0.875rem", fontWeight: "700", color: p.amount < 0 ? "#ef4444" : "#10b981", fontVariantNumeric: "tabular-nums" }}>
                          {p.amount < 0 ? `−${fmt(Math.abs(p.amount))}` : `+${fmt(p.amount)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Line items with Action Buttons on Right ──────────────── */}
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "0.625rem",
                    paddingBottom: "0.35rem",
                    borderBottom: "1px solid var(--border)",
                  }}
                >
                  <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    Items
                  </span>

                  {/* Action Icons (Edit, Manual, WhatsApp, PDF, Print) — Icon Only */}
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    {/* Edit button — only for draft invoices */}
                    {inv.status === "draft" && detail.value && onEdit$ && (
                      <button
                        type="button"
                        onClick$={() => onEdit$!(detail.value!)}
                        class="invoice-slideover-btn invoice-slideover-btn-edit"
                        title="Edit draft invoice"
                        style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
                      >
                        <LuPencil style={{ width: "0.85rem", height: "0.85rem" }} />
                      </button>
                    )}

                    {/* Demo Bill Generator button */}
                    {detail.value && (
                      <button
                        type="button"
                        onClick$={() => { showFalseBillModal.value = true; }}
                        title="Demo Bill Generator (Customize discounts, rates, or items & download/print demo bill without modifying live invoice)"
                        class="invoice-slideover-btn invoice-slideover-btn-custom"
                        style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
                      >
                        <LuSparkles style={{ width: "0.85rem", height: "0.85rem" }} />
                      </button>
                    )}

                    {/* WhatsApp button */}
                    {detail.value && inv.status !== "draft" && onWhatsApp$ && (
                      <button
                        type="button"
                        onClick$={() => onWhatsApp$!(detail.value!)}
                        class="invoice-slideover-btn invoice-slideover-btn-wa"
                        title="Share on WhatsApp"
                        style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
                      >
                        <WhatsAppIcon style={{ width: "0.85rem", height: "0.85rem" }} />
                      </button>
                    )}

                    {/* Download PDF button */}
                    {detail.value && inv.status !== "draft" && onDownload$ && (
                      <button
                        type="button"
                        onClick$={() => onDownload$!(detail.value!)}
                        class="invoice-slideover-btn invoice-slideover-btn-pdf"
                        title="Download PDF"
                        style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
                      >
                        <LuDownload style={{ width: "0.85rem", height: "0.85rem" }} />
                      </button>
                    )}

                    {/* Print button */}
                    {detail.value && inv.status !== "draft" && onPrint$ && (
                      <button
                        type="button"
                        onClick$={() => onPrint$!(detail.value!)}
                        class="invoice-slideover-btn invoice-slideover-btn-print"
                        title="Print Invoice"
                        style={{ width: "1.75rem", height: "1.75rem", padding: 0 }}
                      >
                        <LuPrinter style={{ width: "0.85rem", height: "0.85rem" }} />
                      </button>
                    )}
                  </div>
                </div>

                {error.value ? (
                  <div style={{ padding: "0.75rem", background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", borderRadius: "0.375rem", fontSize: "0.8125rem", color: "#ef4444" }}>
                    {error.value}
                  </div>
                ) : loading.value ? (
                  <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", padding: "0.5rem 0" }}>Loading items…</div>
                ) : detail.value ? (
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {detail.value.lines.map((line, i) => {
                      let originalQty: number | undefined = undefined;
                      let isAdded = false;
                      let increasedQty: number | undefined = undefined;
                      let reducedQty: number | undefined = undefined;
                      let originalPrice: number | undefined = undefined;
                      let originalDiscountPct: number | undefined = undefined;
                      if (line.line_meta) {
                        try {
                          const m = typeof line.line_meta === "string" ? JSON.parse(line.line_meta) : line.line_meta;
                          if (m.original_qty !== undefined) originalQty = Number(m.original_qty);
                          if (m.is_added) isAdded = true;
                          if (m.increased_qty !== undefined) increasedQty = Number(m.increased_qty);
                          if (m.reduced_qty !== undefined) reducedQty = Number(m.reduced_qty);
                          if (m.original_price !== undefined && Math.abs(Number(m.original_price) - line.unit_price) > 0.005) {
                            originalPrice = Number(m.original_price);
                          }
                          if (m.original_discount_pct !== undefined && Math.abs(Number(m.original_discount_pct) - line.discount_pct) > 0.005) {
                            originalDiscountPct = Number(m.original_discount_pct);
                          }
                        } catch { /* noop */ }
                      }
                      const isReturned = line.qty === 0;
                      const isNewlyAdded = isAdded || (originalQty === 0 && line.qty > 0);
                      const isPartiallyReturned = !isNewlyAdded && originalQty !== undefined && line.qty > 0 && line.qty < originalQty;
                      const isQuantityIncreased = !isNewlyAdded && ((increasedQty !== undefined && increasedQty > 0) || (originalQty !== undefined && originalQty > 0 && line.qty > originalQty));
                      const lineProfit = (line.unit_price - line.unit_cost) * line.qty;
                      const hasProfit = line.unit_cost > 0 && !isReturned;
                      return (
                        <div
                          key={line.id}
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "flex-start",
                            padding: "0.5rem 0",
                            borderBottom: i < detail.value!.lines.length - 1 ? "1px solid var(--border)" : "none",
                            opacity: isReturned ? 0.7 : 1,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div
                              style={{
                                fontSize: "0.875rem",
                                fontWeight: "500",
                                color: isReturned ? "var(--text-secondary)" : "var(--text-primary)",
                                textDecoration: isReturned ? "line-through" : "none",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                                display: "flex",
                                alignItems: "center",
                                gap: "0.4rem",
                                flexWrap: "wrap",
                              }}
                            >
                              <span>{line.description ?? line.item_id}</span>
                              {isNewlyAdded && (
                                <span style={{ fontSize: "0.625rem", color: "#10b981", fontWeight: "700", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.35rem", letterSpacing: "0.02em" }}>
                                  +ADDED
                                </span>
                              )}
                              {isReturned && (
                                <span style={{ fontSize: "0.625rem", color: "#ef4444", fontWeight: "700", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem" }}>
                                  RETURNED ({originalQty ?? 0} UNITS)
                                </span>
                              )}
                              {isPartiallyReturned && (
                                <span style={{ fontSize: "0.625rem", color: "#d97706", fontWeight: "600", background: "rgba(217,119,6,0.12)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem" }}>
                                  ORIG: {originalQty} (−{reducedQty ?? (originalQty! - line.qty)})
                                </span>
                              )}
                              {isQuantityIncreased && (
                                <span style={{ fontSize: "0.625rem", color: "#3b82f6", fontWeight: "600", background: "rgba(59,130,246,0.12)", border: "1px solid rgba(59,130,246,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem" }}>
                                  ORIG: {originalQty} (+{increasedQty ?? (line.qty - originalQty!)})
                                </span>
                              )}
                              {originalPrice !== undefined && (
                                <span style={{ fontSize: "0.625rem", color: "#8b5cf6", fontWeight: "600", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem" }}>
                                  RATE: {fmt(originalPrice)} → {fmt(line.unit_price)}
                                </span>
                              )}
                              {originalDiscountPct !== undefined && (
                                <span style={{ fontSize: "0.625rem", color: "#ec4899", fontWeight: "600", background: "rgba(236,72,153,0.12)", border: "1px solid rgba(236,72,153,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem" }}>
                                  DISC: {originalDiscountPct}% → {line.discount_pct}%
                                </span>
                              )}
                            </div>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem", display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                              <span style={{ textDecoration: line.discount_pct > 0 || isReturned ? "line-through" : "none" }}>{fmt(line.unit_price)} × {line.qty}</span>
                              {line.discount_pct > 0 && (
                                <span style={{ color: "#10b981", fontWeight: 600 }}>{line.discount_pct}% off −{fmt(line.discount_amt)}</span>
                              )}
                              {line.tax_amount > 0 && (
                                <span style={{ color: "#f59e0b" }}>(incl. {fmt(line.tax_amount)} tax)</span>
                              )}
                              {hasProfit && <span style={{ color: lineProfit >= 0 ? "#10b981" : "#ef4444" }}>profit {fmt(lineProfit)}</span>}
                            </div>
                          </div>
                          <div
                            style={{
                              fontSize: "0.9375rem",
                              fontWeight: "600",
                              color: isReturned ? "var(--text-secondary)" : "var(--text-primary)",
                              textDecoration: isReturned ? "line-through" : "none",
                              fontVariantNumeric: "tabular-nums",
                              marginLeft: "1rem",
                              flexShrink: 0,
                            }}
                          >
                            {fmt(line.line_total)}
                          </div>
                        </div>
                      );
                    })}

                    {/* Totals */}
                    <div style={{ marginTop: "0.75rem", paddingTop: "0.75rem", borderTop: "2px solid var(--border)", display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                      {(() => {
                        const itemsGross = detail.value.lines.reduce((s, l) => s + l.unit_price * l.qty, 0);
                        return (
                          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Items Subtotal</span>
                            <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>{fmt(itemsGross)}</span>
                          </div>
                        );
                      })()}
                      {detail.value.discount_amt > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Discount</span>
                          <span style={{ color: "#10b981", fontVariantNumeric: "tabular-nums" }}>−{fmt(detail.value.discount_amt)}</span>
                        </div>
                      )}
                      {detail.value.tax_amount > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Taxable Value (Pre-tax)</span>
                          <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-secondary)" }}>{fmt(detail.value.subtotal)}</span>
                        </div>
                      )}
                      {detail.value.tax_amount > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem" }}>
                          <span style={{ color: "var(--text-secondary)" }}>Tax (GST/VAT Incl.)</span>
                          <span style={{ fontVariantNumeric: "tabular-nums", color: "#f59e0b" }}>{fmt(detail.value.tax_amount)}</span>
                        </div>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "1rem", fontWeight: "700", borderTop: "1px solid var(--border)", paddingTop: "0.35rem", marginTop: "0.2rem" }}>
                        <span>Grand Total</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>{fmt(detail.value.grand_total)}</span>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>

              {/* Notes */}
              {detail.value?.notes && (
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "0.5rem" }}>Notes</div>
                  <div style={{ fontSize: "0.875rem", color: "var(--text-primary)", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.625rem 0.75rem" }}>
                    {detail.value.notes}
                  </div>
                </div>
              )}

              {/* ── Audit Info: 3-column layout inside slideover body ──── */}
              {detail.value && (() => {
                const doc = detail.value;
                const isModifiedDoc = doc.status !== "draft" && doc.status !== "cancelled" && !!(doc.is_modified || doc.modified_at || (doc.updated_at && doc.created_at && doc.updated_at > doc.created_at + 10));
                const fmtAuditDate = (ts?: number | null) => {
                  if (!ts) return "—";
                  const d = new Date(ts * 1000);
                  const dt = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
                  const tm = d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
                  return `${dt} ${tm}`;
                };
                const creator = doc.staff_name || doc.creator_name || doc.user_id || "—";
                const updater = doc.updater_name || doc.updated_by || creator;
                const modifier = (doc.modified_by ? (doc.updater_name || doc.modified_by) : doc.updater_name) || "—";
                return (
                  <div
                    style={{
                      marginTop: "0.75rem",
                      display: "grid",
                      gridTemplateColumns: isModifiedDoc ? "repeat(3, minmax(0, 1fr))" : "repeat(2, minmax(0, 1fr))",
                      gap: "0.75rem",
                      padding: "0.75rem 0.875rem",
                      background: "var(--surface-3)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                    }}
                  >
                    {/* Col 1: Created by */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                        Created by
                      </span>
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={creator}>
                        {creator}
                      </span>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", opacity: 0.85, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                        {fmtAuditDate(doc.created_at)}
                      </span>
                    </div>

                    {/* Col 2: Updated by */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                        Updated by
                      </span>
                      <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={updater}>
                        {updater}
                      </span>
                      <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", opacity: 0.85, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                        {fmtAuditDate(doc.updated_at || doc.created_at)}
                      </span>
                    </div>

                    {/* Col 3: Modified by (only when lines modified) */}
                    {isModifiedDoc && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", minWidth: 0 }}>
                        <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: 600 }}>
                          Modified by
                        </span>
                        <span style={{ fontSize: "0.8125rem", color: "var(--text-primary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={modifier}>
                          {modifier}
                        </span>
                        <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", opacity: 0.85, whiteSpace: "nowrap", fontFamily: "monospace" }}>
                          {fmtAuditDate(doc.modified_at || doc.updated_at)}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Modify Actions (Inside scrollable body at bottom to prevent accidental clicks) */}
              {detail.value && inv && inv.status !== "cancelled" && (
                <div
                  style={{
                    marginTop: "0.25rem",
                    paddingBottom: "1.5rem",
                    display: "flex",
                    gap: "0.5rem",
                  }}
                >
                  <button
                    type="button"
                    onClick$={() => {
                      if (onEditInPos$) onEditInPos$(detail.value!);
                      else if (onEdit$) onEdit$(detail.value!);
                    }}
                    class="invoice-slideover-btn"
                    style={{
                      flex: 1,
                      height: "2.125rem",
                      padding: "0 0.6rem",
                      borderRadius: "0.375rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.35rem",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      transition: "all 150ms ease",
                    }}
                  >
                    <CreditCardReaderIcon style={{ width: "0.95rem", height: "0.95rem", color: "var(--accent)" }} />
                    <span>Modify in POS</span>
                  </button>
                  <button
                    type="button"
                    onClick$={() => {
                      if (onEditInCustom$) onEditInCustom$(detail.value!);
                      else if (onEdit$) onEdit$(detail.value!);
                    }}
                    class="invoice-slideover-btn"
                    style={{
                      flex: 1,
                      height: "2.125rem",
                      padding: "0 0.6rem",
                      borderRadius: "0.375rem",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.35rem",
                      background: "transparent",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      transition: "all 150ms ease",
                    }}
                  >
                    <Columns3CogIcon style={{ width: "0.95rem", height: "0.95rem", color: "var(--accent)" }} />
                    <span>Modify in Custom Bill</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </SlideOver>

        {/* Demo Bill Generator Modal (No DB changes) */}
        <DemoBillGenerator
          open={showFalseBillModal}
          invoiceDetail={detail.value}
        />
      </>
    );
  });


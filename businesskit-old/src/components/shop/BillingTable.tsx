// src/components/shop/BillingTable.tsx
//
// WHAT: Reusable billing & invoices table component.
//       Used in both standard Billing (/dashboard/shop/billing) and
//       Restaurant Orders & Billing (/dashboard/shop/restaurant/orders).

import { component$, useStylesScoped$, $, type PropFunction } from "@builder.io/qwik";
import {
  LuFileText,
  LuPencil,
  LuTrash2,
  LuChevronDown,
  LuPrinter,
  LuDownload,
} from "@qwikest/icons/lucide";
import { WhatsAppIcon } from "./InvoicePrintModal";
import type { InvoiceBasic } from "./InvoiceDetailSlideOver";
import { fmtMoney } from "~/lib/fin-format";

export interface BillingTableProps {
  invoices: InvoiceBasic[];
  loading: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  pageSize?: number;
  showProfitColumns?: boolean;
  onLoadMore$?: PropFunction<() => void>;
  onSelectInvoice$?: PropFunction<(invoice: InvoiceBasic) => void>;
  onEditInvoice$?: PropFunction<(invoice: InvoiceBasic) => void>;
  onDeleteInvoice$?: PropFunction<(invoice: InvoiceBasic) => void>;
  onPrintInvoice$?: PropFunction<(invoice: InvoiceBasic) => void>;
  onDownloadInvoice$?: PropFunction<(invoice: InvoiceBasic) => void>;
  onWhatsAppInvoice$?: PropFunction<(invoice: InvoiceBasic) => void>;
}

const statusColors: Record<string, { bg: string; text: string; border?: string }> = {
  paid: { bg: "rgba(16,185,129,0.12)", text: "#10b981", border: "rgba(16,185,129,0.3)" },
  confirmed: { bg: "rgba(59,130,246,0.12)", text: "#3b82f6", border: "rgba(59,130,246,0.3)" },
  draft: { bg: "rgba(59,130,246,0.18)", text: "#60a5fa", border: "rgba(59,130,246,0.45)" }, // Bluish highlighter
  cancelled: { bg: "rgba(239,68,68,0.12)", text: "#ef4444", border: "rgba(239,68,68,0.3)" },
  refunded: { bg: "rgba(245,158,11,0.12)", text: "#f59e0b", border: "rgba(245,158,11,0.3)" },
};

const PAY_ICON: Record<string, string> = {
  cash: "💵",
  card: "💳",
  upi: "📱",
  bank: "🏦",
  cheque: "📝",
};

const fmt = (n: number, currency?: string) => fmtMoney(n, currency);

const TABLE_STYLES = `
  .billing-table-row {
    border-bottom: 1px solid var(--border);
  }
  .billing-table-row:hover {
    background: var(--surface-3, rgba(255, 255, 255, 0.04));
  }
  .billing-row-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    justify-content: flex-end;
  }
  .billing-hover-action {
    visibility: hidden;
    pointer-events: none;
  }
  .billing-table-row:hover .billing-hover-action {
    visibility: visible;
    pointer-events: auto;
  }
  .billing-action-btn {
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.3rem 0.4rem;
    border-radius: 0.375rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .billing-action-btn:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }
  .billing-action-btn.whatsapp {
    color: #25D366;
  }
  .billing-action-btn.whatsapp:hover {
    background: rgba(37, 211, 102, 0.15);
    color: #25D366;
  }
  .billing-action-btn.delete {
    color: var(--error, #ef4444);
  }
  .billing-action-btn.delete:hover {
    background: rgba(239, 68, 68, 0.15);
  }
  @media (hover: none) {
    .billing-hover-action {
      visibility: visible;
      pointer-events: auto;
    }
  }
`;

export const BillingTable = component$<BillingTableProps>(({
  invoices,
  loading,
  hasMore = false,
  loadingMore = false,
  pageSize = 30,
  showProfitColumns = true,
  onLoadMore$,
  onSelectInvoice$,
  onEditInvoice$,
  onDeleteInvoice$,
  onPrintInvoice$,
  onDownloadInvoice$,
  onWhatsAppInvoice$,
}) => {
  useStylesScoped$(TABLE_STYLES);
  if (loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {[1, 2, 3, 4, 5].map((i) => (
          <div
            key={i}
            style={{
              height: "3rem",
              background: "var(--surface-2)",
              borderRadius: "0.375rem",
              opacity: 1 - i * 0.15,
            }}
          />
        ))}
      </div>
    );
  }

  if (invoices.length === 0) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "4rem 2rem",
          textAlign: "center",
          background: "var(--surface-2)",
          borderRadius: "0.75rem",
          border: "1px dashed var(--border)",
          gap: "0.75rem",
        }}
      >
        <div
          style={{
            width: "3rem",
            height: "3rem",
            background: "var(--surface-3)",
            border: "1px solid var(--border)",
            borderRadius: "50%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "var(--text-secondary)",
          }}
        >
          <LuFileText style={{ width: "1.5rem", height: "1.5rem" }} />
        </div>
        <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>
          No invoices yet
        </div>
        <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
          Hit "New Bill (POS)" to record and print your first sale.
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "0.5rem",
          overflowX: "auto",
          WebkitOverflowScrolling: "touch",
        }}
      >
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "var(--surface-3)" }}>
              <th style={{ textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                #
              </th>
              <th style={{ textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                Date
              </th>
              <th style={{ textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                Customer
              </th>
              <th style={{ textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                Pay
              </th>
              <th style={{ textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                Status
              </th>
              <th style={{ textAlign: "right", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                Net (Excl. Tax)
              </th>
              <th style={{ textAlign: "right", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                Tax
              </th>
              <th style={{ textAlign: "right", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-primary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                Total Billed
              </th>
              {showProfitColumns && (
                <>
                  <th style={{ textAlign: "right", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    Profit
                  </th>
                  <th style={{ textAlign: "right", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    %
                  </th>
                </>
              )}
              <th style={{ textAlign: "right", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                Due
              </th>
              <th style={{ textAlign: "right", fontSize: "0.75rem", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }} />
            </tr>
          </thead>
          <tbody>
            {invoices.map((inv) => {
              const d = new Date(inv.doc_date * 1000);
              const dateStr = d.toLocaleDateString("en-IN", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              });
              const timeStr = d.toLocaleTimeString("en-IN", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: true,
              });
              const sc = statusColors[inv.status] ?? statusColors.draft;
              const netExclTax = inv.subtotal > 0 ? inv.subtotal : inv.grand_total - inv.tax_amount;
              const base = inv.subtotal > 0 ? inv.subtotal : inv.grand_total;
              const pct = base > 0 ? (inv.profit / base) * 100 : 0;

              return (
                <tr
                  key={inv.id}
                  class="billing-table-row"
                  onClick$={$(() => {
                    if (onSelectInvoice$) onSelectInvoice$(inv);
                  })}
                  style={{
                    cursor: onSelectInvoice$ ? "pointer" : "default",
                  }}
                >
                  <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span>{inv.doc_number}</span>
                      {inv.status !== "draft" && inv.status !== "cancelled" && (inv.is_modified ?? (inv.updated_at && inv.created_at && inv.updated_at > inv.created_at + 10)) ? (
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
                          title="Modified Bill"
                        >
                          MOD
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    <span style={{ fontWeight: 500, color: "var(--text-primary)" }}>{dateStr}</span>
                    <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "0.4rem", opacity: 0.85 }}>{timeStr}</span>
                  </td>
                  <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", color: "var(--text-primary)", maxWidth: "12rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {inv.customer_name ?? <span style={{ color: "var(--text-secondary)" }}>Walk-in</span>}
                  </td>
                  <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    {inv.payment_mode ? `${PAY_ICON[inv.payment_mode] ?? ""} ${inv.payment_mode}` : "—"}
                  </td>
                  <td style={{ padding: "0.6875rem 0.875rem" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "0.15rem 0.6rem",
                        borderRadius: "9999px",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        textTransform: "capitalize",
                        background: sc.bg,
                        color: sc.text,
                        border: `1px solid ${sc.border || "var(--border)"}`,
                      }}
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", color: "var(--text-secondary)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {fmt(netExclTax)}
                  </td>
                  <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", color: inv.tax_amount > 0 ? "var(--warning, #f59e0b)" : "var(--text-secondary)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {inv.tax_amount > 0 ? fmt(inv.tax_amount) : "—"}
                  </td>
                  <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {fmt(inv.grand_total)}
                  </td>

                  {showProfitColumns && (
                    <>
                      <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", fontWeight: 600, color: inv.profit > 0 ? "#10b981" : "var(--text-secondary)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {inv.profit > 0 ? fmt(inv.profit) : "—"}
                      </td>
                      <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", color: inv.profit > 0 ? "#10b981" : "var(--text-secondary)", textAlign: "right", whiteSpace: "nowrap" }}>
                        {inv.profit > 0 ? `${pct.toFixed(1)}%` : "—"}
                      </td>
                    </>
                  )}

                  <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.875rem", fontWeight: 600, color: inv.amount_due > 0 ? "var(--error, #ef4444)" : "var(--text-secondary)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                    {inv.amount_due > 0 ? fmt(inv.amount_due) : "—"}
                  </td>

                  <td style={{ padding: "0.6875rem 0.5rem", textAlign: "right", whiteSpace: "nowrap" }}>
                    <div class="billing-row-actions">
                      {inv.status === "draft" && onDeleteInvoice$ && (
                        <button
                          type="button"
                          class="billing-action-btn delete"
                          title="Delete draft"
                          onClick$={$((e: Event) => {
                            e.stopPropagation();
                            onDeleteInvoice$(inv);
                          })}
                        >
                          <LuTrash2 style={{ width: "0.875rem", height: "0.875rem" }} />
                        </button>
                      )}
                      {inv.status === "draft" && onEditInvoice$ && (
                        <button
                          type="button"
                          class="billing-action-btn"
                          title="Edit draft"
                          onClick$={$((e: Event) => {
                            e.stopPropagation();
                            onEditInvoice$(inv);
                          })}
                        >
                          <LuPencil style={{ width: "0.875rem", height: "0.875rem" }} />
                        </button>
                      )}
                      {inv.status !== "draft" && onWhatsAppInvoice$ && (
                        <button
                          type="button"
                          class="billing-action-btn whatsapp billing-hover-action"
                          title="Send via WhatsApp"
                          onClick$={$((e: Event) => {
                            e.stopPropagation();
                            onWhatsAppInvoice$(inv);
                          })}
                        >
                          <WhatsAppIcon style={{ width: "0.9375rem", height: "0.9375rem" }} />
                        </button>
                      )}
                      {onDownloadInvoice$ && (
                        <button
                          type="button"
                          class="billing-action-btn billing-hover-action"
                          title="Download invoice as PDF"
                          onClick$={$((e: Event) => {
                            e.stopPropagation();
                            onDownloadInvoice$(inv);
                          })}
                        >
                          <LuDownload style={{ width: "0.875rem", height: "0.875rem" }} />
                        </button>
                      )}
                      {onPrintInvoice$ && (
                        <button
                          type="button"
                          class="billing-action-btn"
                          title="Print invoice"
                          onClick$={$((e: Event) => {
                            e.stopPropagation();
                            onPrintInvoice$(inv);
                          })}
                        >
                          <LuPrinter style={{ width: "0.875rem", height: "0.875rem" }} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {/* Footer: count + load more matching inventory style */}
        <div style={{ padding: "0.75rem 0.875rem", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
            {invoices.length} invoice{invoices.length !== 1 ? "s" : ""} · newest first
          </span>
          {hasMore && onLoadMore$ && (
            <button
              type="button"
              disabled={loadingMore}
              onClick$={onLoadMore$}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                padding: "0.35rem 0.875rem",
                fontSize: "0.8125rem",
                color: "var(--text-secondary)",
                cursor: loadingMore ? "not-allowed" : "pointer",
                fontWeight: "500",
              }}
            >
              {loadingMore ? (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style={{ animation: "spin 1s linear infinite" }}>
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  Loading…
                </>
              ) : (
                <>
                  <LuChevronDown style={{ width: "0.875rem", height: "0.875rem" }} />
                  Load {pageSize} more
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </>
  );
});

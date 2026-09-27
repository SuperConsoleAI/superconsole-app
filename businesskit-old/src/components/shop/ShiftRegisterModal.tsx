// src/components/shop/ShiftRegisterModal.tsx
//
// WHAT: POS Shift Register & Reconciliation (Z-Report / Day Close).
//       Modeled after Shopify POS register session drawer reconciliation.

import {
  component$,
  useSignal,
  useStylesScoped$,
  useVisibleTask$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuSparkles,
  LuCheckCircle2,
  LuPrinter,
  LuRefreshCw,
  LuX,
} from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { fmtMoney } from "~/lib/fin-format";

export interface ShiftRegisterModalProps {
  open: Signal<boolean>;
  onShiftChanged$?: PropFunction<() => void>;
}

export interface ShiftSummary {
  cash_sales: number;
  cash_refunds: number;
  cash_payouts: number;
  upi_sales: number;
  card_sales: number;
  other_sales: number;
  total_sales: number;
  total_tax: number;
  invoice_count: number;
  payments_count: number;
  by_payment_mode?: Record<string, number>;
}

export interface ShopShift {
  id: string;
  profile_id: string;
  staff_id: string | null;
  opened_by: string;
  closed_by: string | null;
  opened_by_name?: string | null;
  closed_by_name?: string | null;
  staff_name?: string | null;
  opened_at: number;
  closed_at: number | null;
  opening_float: number;
  cash_sales: number;
  cash_refunds: number;
  cash_payouts: number;
  expected_cash: number;
  counted_cash: number | null;
  variance: number;
  status: "open" | "closed";
  notes: string | null;
  summary_json: string;
  created_at: number;
  updated_at: number;
}

const STYLES = `
  .shift-modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    padding: 1rem;
    box-sizing: border-box;
  }
  .shift-modal-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    width: 100%;
    max-width: 32rem;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: var(--text-primary);
  }
  .shift-header {
    padding: 1rem 1.25rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }
  .shift-body {
    padding: 1.25rem;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .shift-section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .shift-section-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
  .shift-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.875rem;
    padding: 0.25rem 0;
  }
  .shift-row-label {
    color: var(--text-secondary);
  }
  .shift-row-value {
    color: var(--text-primary);
    font-weight: 500;
  }
  .shift-input {
    width: 100%;
    height: 2.25rem;
    padding: 0 0.75rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    color: var(--text-primary);
    font-size: 0.875rem;
    outline: none;
    box-sizing: border-box;
  }
  .shift-input:focus {
    border-color: var(--accent, #10b981);
  }
  .shift-btn {
    height: 2.375rem;
    padding: 0 1rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    transition: all 0.15s ease;
    border: none;
    white-space: nowrap;
  }
  .shift-btn-primary {
    background: var(--button-primary-bg, #10b981);
    color: var(--button-primary-text, #ffffff);
  }
  .shift-btn-primary:hover {
    filter: brightness(1.08);
  }
  .shift-btn-naked {
    background: transparent;
    border: 1px solid var(--border);
    color: var(--text-primary);
    border-radius: 0.375rem;
    padding: 0.35rem 0.65rem;
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    line-height: 1;
  }
  .shift-btn-naked:hover {
    background: var(--surface-1);
  }
  @keyframes shift-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .shift-spinning {
    animation: shift-spin 0.75s linear infinite;
  }
  .z-report-paper {
    background: #fff;
    color: #111;
    font-family: 'Courier New', Courier, monospace;
    font-size: 0.8125rem;
    padding: 1.25rem;
    border-radius: 0.375rem;
    border: 1px solid #e5e7eb;
    line-height: 1.4;
  }
  @media print {
    body * {
      visibility: hidden;
    }
    .z-report-paper, .z-report-paper * {
      visibility: visible;
    }
    .z-report-paper {
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      border: none;
      box-shadow: none;
    }
  }
`;

const formatShopifyTime = (tsSec: number): string => {
  const d = new Date(tsSec * 1000);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const timeStr = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true });
  if (isToday) {
    return `Today at ${timeStr}`;
  }
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${dateStr} at ${timeStr}`;
};

export const ShiftRegisterModal = component$<ShiftRegisterModalProps>(({ open, onShiftChanged$ }) => {
  useStylesScoped$(STYLES);

  const loading = useSignal(false);
  const isRefreshing = useSignal(false);
  const isPrinting = useSignal(false);
  const activeShift = useSignal<ShopShift | null>(null);
  const shiftSummary = useSignal<ShiftSummary | null>(null);
  const errorMsg = useSignal<string | null>(null);

  // Open shift form
  const openFloat = useSignal("0");
  const openStaffId = useSignal("");
  const openNotes = useSignal("");

  // Close shift form
  const closeCountedCash = useSignal("");
  const closeNotes = useSignal("");
  const showZReport = useSignal(false);
  const closedShiftResult = useSignal<ShopShift | null>(null);

  const loadActiveShift = $(async () => {
    loading.value = true;
    isRefreshing.value = true;
    errorMsg.value = null;
    const startTime = Date.now();
    try {
      const shift = await invoke<ShopShift | null>("shop_get_active_shift");
      activeShift.value = shift;
      if (shift && shift.summary_json) {
        try {
          shiftSummary.value = JSON.parse(shift.summary_json);
        } catch {
          shiftSummary.value = null;
        }
      }
    } catch (e: any) {
      errorMsg.value = String(e?.message || e);
    } finally {
      loading.value = false;
      const elapsed = Date.now() - startTime;
      const remainingSpin = Math.max(0, 650 - elapsed);
      setTimeout(() => { isRefreshing.value = false; }, remainingSpin);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const isOpen = track(() => open.value);
    if (isOpen) {
      showZReport.value = false;
      closedShiftResult.value = null;
      closeCountedCash.value = "";
      closeNotes.value = "";
      loadActiveShift();
    }
  });

  const handleOpenShift = $(async () => {
    const flt = parseFloat(openFloat.value || "0");
    if (isNaN(flt) || flt < 0) {
      errorMsg.value = "Please enter a valid starting cash float";
      return;
    }
    loading.value = true;
    errorMsg.value = null;
    try {
      const shift = await invoke<ShopShift>("shop_open_shift", {
        data: {
          opening_float: flt,
          staff_id: openStaffId.value.trim() || null,
          notes: openNotes.value.trim() || null,
        },
      });
      activeShift.value = shift;
      if (onShiftChanged$) await onShiftChanged$();
    } catch (e: any) {
      errorMsg.value = String(e?.message || e);
    } finally {
      loading.value = false;
    }
  });

  const handleCloseShift = $(async () => {
    if (!activeShift.value) return;
    const counted = parseFloat(closeCountedCash.value);
    if (isNaN(counted) || counted < 0) {
      errorMsg.value = "Please count and enter the cash physically in drawer";
      return;
    }
    loading.value = true;
    errorMsg.value = null;
    try {
      const closed = await invoke<ShopShift>("shop_close_shift", {
        data: {
          shift_id: activeShift.value.id,
          counted_cash: counted,
          notes: closeNotes.value.trim() || null,
        },
      });
      closedShiftResult.value = closed;
      activeShift.value = null;
      showZReport.value = true;
      if (onShiftChanged$) await onShiftChanged$();
    } catch (e: any) {
      errorMsg.value = String(e?.message || e);
    } finally {
      loading.value = false;
    }
  });

  const generatePdfBlobAndDataUri = $(async (printElement: HTMLElement) => {
    if (typeof document !== "undefined" && (document as any).fonts) {
      try { await (document as any).fonts.ready; } catch (e) { console.debug(e); }
    }

    const { toCanvas } = await import("html-to-image");
    const { jsPDF } = await import("jspdf");

    const canvas = await toCanvas(printElement, {
      pixelRatio: 2,
      backgroundColor: "#ffffff",
      cacheBust: true,
      style: {
        boxShadow: "none",
        margin: "0",
        borderRadius: "0",
      },
    });

    const imgData = canvas.toDataURL("image/jpeg", 0.98);
    const pdfWidthMm = 80;
    const pdfHeightMm = Math.max(100, (canvas.height * pdfWidthMm) / canvas.width + 4);
    const marginMm = 1;
    const contentWidthMm = pdfWidthMm - (marginMm * 2);
    const contentHeightMm = (canvas.height * contentWidthMm) / canvas.width;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: [pdfWidthMm, pdfHeightMm],
    });

    pdf.addImage(imgData, "JPEG", marginMm, marginMm, contentWidthMm, contentHeightMm);
    const pdfBase64 = pdf.output("datauristring");
    const pdfBlob = pdf.output("blob");

    return { pdfBase64, pdfBlob };
  });

  const handlePrint = $(async () => {
    const printElement = document.getElementById("shift-print-canvas") || document.querySelector(".z-report-paper") as HTMLElement;
    if (!printElement) {
      window.print();
      return;
    }

    isPrinting.value = true;
    try {
      const { pdfBase64, pdfBlob } = await generatePdfBlobAndDataUri(printElement);
      const shiftId = closedShiftResult.value?.id || activeShift.value?.id || "shift-report";
      const fileName = `shift-report-${shiftId.slice(-8)}.pdf`;

      // 1. Mobile (Android / iOS): Open native Print / Share Sheet
      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator !== "undefined" && typeof File !== "undefined") {
        try {
          const file = new File([pdfBlob], fileName, { type: "application/pdf" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Print Shift Report ${shiftId.slice(-8)}`,
              text: `Shift Register Report`,
            });
            return;
          }
        } catch (shareErr) {
          console.warn("[ShiftRegisterModal] Mobile print/share sheet fallback:", shareErr);
        }
      }

      // 2. Desktop Tauri: Open PDF in system print preview/viewer
      try {
        await invoke<string>("shop_open_pdf", {
          fileName,
          base64Data: pdfBase64,
        });
        return;
      } catch (tauriErr) {
        console.warn("[ShiftRegisterModal] Tauri shop_open_pdf fallback:", tauriErr);
      }

      // 3. Desktop Web fallback
      window.print();
    } catch (err) {
      console.error("[ShiftRegisterModal] Native print error:", err);
      window.print();
    } finally {
      isPrinting.value = false;
    }
  });

  if (!open.value) return null;

  return (
    <div class="shift-modal-backdrop" onClick$={() => { open.value = false; }}>
      <div class="shift-modal-card" onClick$={(e) => e.stopPropagation()}>
        {/* Hidden / Offscreen Print Canvas for PDF / Thermal generation */}
        <div style={{ position: "absolute", left: "-9999px", top: "-9999px", width: "320px" }}>
          <div
            id="shift-print-canvas"
            style={{
              width: "320px",
              padding: "1rem",
              background: "#ffffff",
              color: "#000000",
              fontFamily: "'Courier New', Courier, monospace",
              fontSize: "12px",
              lineHeight: "1.4",
              boxSizing: "border-box",
            }}
          >
            {(() => {
              const target = closedShiftResult.value || activeShift.value;
              if (!target) return null;
              const isClosed = target.status === "closed" || showZReport.value;
              return (
                <div>
                  <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "14px", marginBottom: "4px" }}>
                    {isClosed ? "*** SHIFT REGISTER Z-REPORT ***" : "*** SHIFT REGISTER X-REPORT ***"}
                  </div>
                  <div style={{ textAlign: "center", fontSize: "11px", color: "#555", marginBottom: "8px" }}>
                    {isClosed ? "END OF DAY RECONCILIATION" : "MID-SHIFT REGISTER SUMMARY"}
                  </div>
                  <div style={{ borderTop: "1px dashed #666", borderBottom: "1px dashed #666", padding: "6px 0", margin: "6px 0", fontSize: "11px" }}>
                    <div>Shift ID: {target.id}</div>
                    <div>Opened: {new Date(target.opened_at * 1000).toLocaleString("en-IN")}</div>
                    <div>Closed: {target.closed_at ? new Date(target.closed_at * 1000).toLocaleString("en-IN") : "Ongoing (Open)"}</div>
                    <div>Cashier: {target.opened_by_name || (target.opened_by === "owner" ? "You (Owner)" : target.opened_by)}</div>
                    {target.closed_by_name && <div>Closed by: {target.closed_by_name}</div>}
                    {target.staff_name && <div>Staff: {target.staff_name}</div>}
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: "3px", margin: "6px 0", fontSize: "12px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Opening Float:</span>
                      <span>{fmtMoney(target.opening_float)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Cash Sales:</span>
                      <span>+{fmtMoney(target.cash_sales)}</span>
                    </div>
                    {shiftSummary.value?.upi_sales ? (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>UPI Sales:</span>
                        <span>+{fmtMoney(shiftSummary.value.upi_sales)}</span>
                      </div>
                    ) : null}
                    {shiftSummary.value?.card_sales ? (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Card Sales:</span>
                        <span>+{fmtMoney(shiftSummary.value.card_sales)}</span>
                      </div>
                    ) : null}
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Cash Refunds/Payouts:</span>
                      <span>−{fmtMoney(target.cash_refunds + target.cash_payouts)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", borderTop: "1px solid #999", paddingTop: "4px", marginTop: "2px" }}>
                      <span>Expected Drawer Cash:</span>
                      <span>{fmtMoney(target.expected_cash)}</span>
                    </div>
                    {isClosed && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                          <span>Counted Cash (Physical):</span>
                          <span>{fmtMoney(target.counted_cash ?? 0)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", color: target.variance === 0 ? "#10b981" : target.variance > 0 ? "#2563eb" : "#dc2626" }}>
                          <span>Discrepancy / Variance:</span>
                          <span>
                            {target.variance > 0 ? `+${fmtMoney(target.variance)} (OVER)` : target.variance < 0 ? `${fmtMoney(target.variance)} (SHORT)` : "₹0.00 (MATCH)"}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {target.notes && (
                    <div style={{ marginTop: "6px", borderTop: "1px dashed #666", paddingTop: "6px", fontSize: "11px" }}>
                      <strong>Notes:</strong> {target.notes}
                    </div>
                  )}
                  <div style={{ textAlign: "center", fontSize: "10px", color: "#888", marginTop: "8px" }}>
                    Printed on {new Date().toLocaleString("en-IN")}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Modal Header - Shopify POS style */}
        <div class="shift-header">
          <div style={{ fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-primary)" }}>
            {showZReport.value && closedShiftResult.value
              ? `Session #${closedShiftResult.value.id.slice(-10)}`
              : activeShift.value
              ? `Session #${activeShift.value.id.slice(-10)}`
              : "Register Shift"}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {activeShift.value && (
              <button
                type="button"
                class="shift-btn-naked"
                onClick$={loadActiveShift}
                title="Refresh Session"
                disabled={isRefreshing.value}
              >
                <LuRefreshCw
                  class={isRefreshing.value ? "animate-spin shift-spinning" : ""}
                  style={{
                    width: "0.8125rem",
                    height: "0.8125rem",
                    animation: isRefreshing.value ? "spin 0.75s linear infinite" : "none",
                  }}
                />
                <span>Refresh</span>
              </button>
            )}
            {(showZReport.value || activeShift.value) && (
              <button
                type="button"
                class="shift-btn-naked"
                onClick$={handlePrint}
                title="Print Report"
                disabled={isPrinting.value}
              >
                <LuPrinter style={{ width: "0.8125rem", height: "0.8125rem" }} />
                <span>{isPrinting.value ? "Printing…" : "Print"}</span>
              </button>
            )}
            <button
              type="button"
              class="shift-btn-naked"
              style={{ width: "1.875rem", height: "1.875rem", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}
              onClick$={() => { open.value = false; }}
              title="Close"
            >
              <LuX style={{ width: "1rem", height: "1rem" }} />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div class="shift-body">
          {errorMsg.value && (
            <div style={{ padding: "0.75rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "0.375rem", fontSize: "0.8125rem", color: "#ef4444" }}>
              {errorMsg.value}
            </div>
          )}

          {/* VIEW 1: Z-Report Print Preview (After Closing) */}
          {showZReport.value && closedShiftResult.value && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div class="z-report-paper">
                <div style={{ textAlign: "center", fontWeight: "bold", fontSize: "1rem", marginBottom: "0.25rem" }}>
                  *** SHIFT REGISTER Z-REPORT ***
                </div>
                <div style={{ textAlign: "center", fontSize: "0.75rem", color: "#666", marginBottom: "0.75rem" }}>
                  END OF DAY RECONCILIATION
                </div>
                <div style={{ borderTop: "1px dashed #999", borderBottom: "1px dashed #999", padding: "0.5rem 0", margin: "0.5rem 0" }}>
                  <div>Shift ID: {closedShiftResult.value.id}</div>
                  <div>Opened: {new Date(closedShiftResult.value.opened_at * 1000).toLocaleString("en-IN")}</div>
                  <div>Closed: {new Date((closedShiftResult.value.closed_at || Date.now() / 1000) * 1000).toLocaleString("en-IN")}</div>
                  <div>Cashier: {closedShiftResult.value.opened_by_name || (closedShiftResult.value.opened_by === "owner" ? "You (Owner)" : closedShiftResult.value.opened_by)}</div>
                  {closedShiftResult.value.closed_by_name && (
                    <div>Closed by: {closedShiftResult.value.closed_by_name}</div>
                  )}
                  {closedShiftResult.value.staff_name && (
                    <div>Staff: {closedShiftResult.value.staff_name}</div>
                  )}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem", margin: "0.5rem 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Opening Float:</span>
                    <span>{fmtMoney(closedShiftResult.value.opening_float)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Cash Sales:</span>
                    <span>+{fmtMoney(closedShiftResult.value.cash_sales)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Cash Refunds/Payouts:</span>
                    <span>−{fmtMoney(closedShiftResult.value.cash_refunds + closedShiftResult.value.cash_payouts)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", borderTop: "1px solid #ccc", paddingTop: "0.25rem" }}>
                    <span>Expected Drawer Cash:</span>
                    <span>{fmtMoney(closedShiftResult.value.expected_cash)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold" }}>
                    <span>Counted Cash (Physical):</span>
                    <span>{fmtMoney(closedShiftResult.value.counted_cash ?? 0)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", color: closedShiftResult.value.variance === 0 ? "#10b981" : closedShiftResult.value.variance > 0 ? "#2563eb" : "#dc2626" }}>
                    <span>Discrepancy / Variance:</span>
                    <span>
                      {closedShiftResult.value.variance > 0 ? `+${fmtMoney(closedShiftResult.value.variance)} (OVER)` : closedShiftResult.value.variance < 0 ? `${fmtMoney(closedShiftResult.value.variance)} (SHORT)` : "₹0.00 (MATCH)"}
                    </span>
                  </div>
                </div>

                {closedShiftResult.value.notes && (
                  <div style={{ marginTop: "0.5rem", borderTop: "1px dashed #999", paddingTop: "0.5rem", fontSize: "0.75rem" }}>
                    <strong>Notes:</strong> {closedShiftResult.value.notes}
                  </div>
                )}
              </div>

              <button
                type="button"
                class="shift-btn shift-btn-primary"
                style={{ width: "100%" }}
                onClick$={() => { open.value = false; }}>
                <span>Done</span>
              </button>
            </div>
          )}

          {/* VIEW 2: Open Shift Form (When No Active Shift) */}
          {!showZReport.value && !activeShift.value && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                  Opening a register shift establishes the starting float balance in your cash drawer and tracks real-time sales and blind cash reconciliation.
                </div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                    Opening Cash Float (₹) *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    class="shift-input"
                    placeholder="e.g. 1000.00"
                    value={openFloat.value}
                    onInput$={(e) => { openFloat.value = (e.target as HTMLInputElement).value; }}
                  />
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                    Shift Notes / Drawer Number (Optional)
                  </label>
                  <input
                    type="text"
                    class="shift-input"
                    placeholder="e.g. Morning Shift - Drawer 1"
                    value={openNotes.value}
                    onInput$={(e) => { openNotes.value = (e.target as HTMLInputElement).value; }}
                  />
                </div>
              </div>

              <button
                type="button"
                class="shift-btn shift-btn-primary"
                style={{ width: "100%" }}
                onClick$={handleOpenShift}
                disabled={loading.value}
              >
                <LuSparkles style={{ width: "0.875rem", height: "0.875rem" }} />
                <span>{loading.value ? "Opening…" : "Open Shift Register"}</span>
              </button>
            </div>
          )}

          {/* VIEW 3: Active Shift Status & Shopify POS Layout */}
          {!showZReport.value && activeShift.value && (
            <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              {/* Section 1: Overview */}
              <div class="shift-section">
                <div class="shift-section-title">Overview</div>
                <div class="shift-row">
                  <span class="shift-row-label">Drawer</span>
                  <span class="shift-row-value">1</span>
                </div>
                <div class="shift-row">
                  <span class="shift-row-label">Session ID</span>
                  <span class="shift-row-value">{activeShift.value.id.slice(-10)}</span>
                </div>
                <div class="shift-row">
                  <span class="shift-row-label">Start time</span>
                  <span class="shift-row-value">{formatShopifyTime(activeShift.value.opened_at)}</span>
                </div>
                <div class="shift-row">
                  <span class="shift-row-label">End time</span>
                  <span class="shift-row-value" style={{ color: "#10b981" }}>Ongoing (Open)</span>
                </div>
                <div class="shift-row">
                  <span class="shift-row-label">Opened by</span>
                  <span class="shift-row-value">{activeShift.value.opened_by_name || (activeShift.value.opened_by === "owner" ? "You (Owner)" : activeShift.value.opened_by)}</span>
                </div>
                {activeShift.value.staff_name && (
                  <div class="shift-row">
                    <span class="shift-row-label">Staff</span>
                    <span class="shift-row-value">{activeShift.value.staff_name}</span>
                  </div>
                )}
              </div>

              <div style={{ height: "1px", background: "var(--border)" }} />

              {/* Section 2: Net Payments */}
              <div class="shift-section">
                <div class="shift-section-title">Net payments</div>
                <div class="shift-row">
                  <span class="shift-row-label">Cash</span>
                  <span class="shift-row-value">{fmtMoney(activeShift.value.cash_sales)}</span>
                </div>
                <div class="shift-row">
                  <span class="shift-row-label">UPI</span>
                  <span class="shift-row-value">{fmtMoney(shiftSummary.value?.upi_sales || 0)}</span>
                </div>
                <div class="shift-row">
                  <span class="shift-row-label">Card</span>
                  <span class="shift-row-value">{fmtMoney(shiftSummary.value?.card_sales || 0)}</span>
                </div>
                <div class="shift-row" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.375rem" }}>
                  <span class="shift-row-label" style={{ fontWeight: 600, color: "var(--text-primary)" }}>Total</span>
                  <span class="shift-row-value" style={{ color: "#10b981", fontWeight: 700 }}>
                    {fmtMoney(shiftSummary.value?.total_sales || (activeShift.value.cash_sales + (shiftSummary.value?.upi_sales || 0) + (shiftSummary.value?.card_sales || 0)))}
                  </span>
                </div>
              </div>

              <div style={{ height: "1px", background: "var(--border)" }} />

              {/* Section 3: Cash Tracking */}
              <div class="shift-section">
                <div class="shift-section-title">Cash Tracking</div>
                <div class="shift-row">
                  <span class="shift-row-label">Expected cash at open</span>
                  <span class="shift-row-value">{fmtMoney(activeShift.value.opening_float)}</span>
                </div>
                <div class="shift-row">
                  <span class="shift-row-label">Cash sales</span>
                  <span class="shift-row-value" style={{ color: "#10b981" }}>+{fmtMoney(activeShift.value.cash_sales)}</span>
                </div>
                <div class="shift-row">
                  <span class="shift-row-label">Cash refunds</span>
                  <span class="shift-row-value" style={{ color: activeShift.value.cash_refunds > 0 ? "#ef4444" : "inherit" }}>
                    −{fmtMoney(activeShift.value.cash_refunds)}
                  </span>
                </div>
                <div class="shift-row">
                  <span class="shift-row-label">Cash adjustments / payouts</span>
                  <span class="shift-row-value" style={{ color: activeShift.value.cash_payouts > 0 ? "#ef4444" : "inherit" }}>
                    −{fmtMoney(activeShift.value.cash_payouts)}
                  </span>
                </div>
                <div class="shift-row" style={{ borderTop: "1px solid var(--border)", paddingTop: "0.375rem" }}>
                  <span class="shift-row-label" style={{ fontWeight: 600, color: "var(--text-primary)" }}>Expected cash</span>
                  <span class="shift-row-value" style={{ color: "#10b981", fontWeight: 700 }}>
                    {fmtMoney(activeShift.value.expected_cash)}
                  </span>
                </div>

                {/* Blind Count Entry */}
                <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                      Counted at close (₹) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      class="shift-input"
                      placeholder="Count physical cash in drawer"
                      value={closeCountedCash.value}
                      onInput$={(e) => { closeCountedCash.value = (e.target as HTMLInputElement).value; }}
                    />
                  </div>

                  {/* Discrepancy feedback */}
                  {(() => {
                    const counted = parseFloat(closeCountedCash.value);
                    if (isNaN(counted)) return null;
                    const exp = activeShift.value.expected_cash;
                    const diff = counted - exp;
                    return (
                      <div class="shift-row" style={{ padding: "0.375rem 0.5rem", background: "var(--surface-1)", borderRadius: "0.375rem", border: "1px solid var(--border)" }}>
                        <span class="shift-row-label">Closing discrepancy</span>
                        <span style={{ fontWeight: 700, color: diff === 0 ? "#10b981" : diff > 0 ? "#3b82f6" : "#ef4444" }}>
                          {diff === 0 ? "₹0.00 (Balanced)" : diff > 0 ? `+${fmtMoney(diff)} (Over)` : `${fmtMoney(diff)} (Short)`}
                        </span>
                      </div>
                    );
                  })()}

                  <div>
                    <label style={{ display: "block", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", marginBottom: "0.375rem" }}>
                      Closing notes (Optional)
                    </label>
                    <input
                      type="text"
                      class="shift-input"
                      placeholder="e.g. Discrepancy reason or drawer handover note"
                      value={closeNotes.value}
                      onInput$={(e) => { closeNotes.value = (e.target as HTMLInputElement).value; }}
                    />
                  </div>
                </div>
              </div>

              {/* Primary Action Button */}
              <button
                type="button"
                class="shift-btn shift-btn-primary"
                style={{ width: "100%", height: "2.5rem" }}
                onClick$={handleCloseShift}
                disabled={loading.value || !closeCountedCash.value}
              >
                <LuCheckCircle2 style={{ width: "0.875rem", height: "0.875rem" }} />
                <span>{loading.value ? "Closing…" : "Close Shift & Reconcile"}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

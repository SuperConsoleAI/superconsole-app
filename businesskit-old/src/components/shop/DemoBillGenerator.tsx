// src/components/shop/CustomBillgenerator.tsx
//
// WHAT: Interactive Custom Bill Generator & Live Invoice Editor.
//       Allows user to modify any invoice line, discount, rate, tax, customer, or totals
//       in real-time without modifying the database, and download/print the resulting bill.
//       Layout: Compact popup, Box 1 (Info), Box 2 (Line Items), Box 3 (Totals), Box 4 (Discount), Box 5 (Preview + Action Buttons).

import {
  component$,
  useSignal,
  useComputed$,
  useStylesScoped$,
  useVisibleTask$,
  $,
  type Signal,
} from "@builder.io/qwik";
import {
  LuPrinter,
  LuDownload,
  LuLoader2,
  LuX,
  LuReceipt,
  LuFileText,
  LuBuilding,
  LuRotateCcw,
  LuSparkles,
  LuSettings2,
} from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import type { InvoiceDetail } from "./InvoiceDetailSlideOver";
import { WhatsAppIcon, openWhatsAppInvoice, type PrintFormat } from "./InvoicePrintModal";
import { fmtMoney } from "~/lib/fin-format";

export interface DemoBillGeneratorProps {
  open: Signal<boolean>;
  invoiceDetail: InvoiceDetail | null;
  storeName?: string;
  storeAddress?: string;
  storeCity?: string;
  storeState?: string;
  storeDlNo?: string;
  storePhone?: string;
  storeGstin?: string;
  storePan?: string;
  terms?: string;
}

export type CustomBillgeneratorProps = DemoBillGeneratorProps;
export type FalseBillGeneratorProps = DemoBillGeneratorProps;

export interface EditableBillLine {
  id: string;
  item_id: string;
  description: string;
  pack_size: string;
  batch_no: string;
  expiry_date: string;
  hsn_sac_code: string;
  shelf_location: string;
  mfg_by: string;
  qty: number;
  free_qty: number;
  unit_price: number;
  mrp: number;
  discount_pct: number;
  extra_discount: number;
  tax_rate_pct: number;
}

function numberToWords(num: number): string {
  const a = [
    "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
    "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
    "Seventeen", "Eighteen", "Nineteen",
  ];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

  const rounded = Math.round(num);
  if (rounded === 0) return "Zero";

  function convert(n: number): string {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 !== 0 ? " " + a[n % 10] : "");
    if (n < 1000) return a[Math.floor(n / 100)] + " Hundred" + (n % 100 !== 0 ? " " + convert(n % 100) : "");
    if (n < 100000) return convert(Math.floor(n / 1000)) + " Thousand" + (n % 1000 !== 0 ? " " + convert(n % 1000) : "");
    if (n < 10000000) return convert(Math.floor(n / 100000)) + " Lakh" + (n % 100000 !== 0 ? " " + convert(n % 100000) : "");
    return convert(Math.floor(n / 10000000)) + " Crore" + (n % 10000000 !== 0 ? " " + convert(n % 10000000) : "");
  }

  return convert(rounded).trim();
}

const STYLES = `
  .fb-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(4px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 1rem 0.5rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .fb-modal {
    background: var(--surface-1, #121214);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    width: 96vw;
    max-width: 1080px;
    height: 92vh;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.6);
    overflow: hidden;
    margin: auto;
  }
  .fb-topbar {
    padding: 0.5rem 0.875rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2, #18181b);
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex-shrink: 0;
  }
  .fb-topbar-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 0.5rem;
  }
  .fb-topbar-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .fb-topbar-right {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-left: auto;
  }
  .format-tabs-desktop {
    display: flex;
    gap: 0.2rem;
    background: var(--surface-3);
    padding: 0.15rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border);
  }
  .format-tabs-mobile {
    display: none;
  }
  .format-tab {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    padding: 0.25rem 0.55rem;
    font-size: 0.72rem;
    font-weight: 600;
    border-radius: 0.25rem;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--text-secondary);
    transition: all 0.15s ease;
    white-space: nowrap;
  }
  .format-tab.active {
    background: var(--button-primary-bg, #3b82f6);
    color: var(--button-primary-text, #ffffff);
    box-shadow: 0 1px 2px rgba(0,0,0,0.2);
  }
  .fb-icon-btn {
    background: transparent;
    border: 1px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.25rem;
    border-radius: 0.375rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }
  .fb-icon-btn:hover {
    color: var(--text-primary);
    background: var(--surface-3);
    border-color: var(--border);
  }
  .fb-modal-body {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1 1 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--surface-1);
  }
  .fb-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .fb-card-title {
    font-size: 0.75rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-primary);
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: none;
    padding: 0;
  }
  .fb-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
    gap: 0.35rem;
  }
  .fb-label {
    font-size: 0.65rem;
    font-weight: 600;
    color: var(--text-secondary);
    margin-bottom: 0.1rem;
    display: block;
  }
  .fb-input {
    width: 100%;
    padding: 0.22rem 0.4rem;
    font-size: 0.72rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    color: var(--text-primary);
    box-sizing: border-box;
  }
  .fb-input:focus {
    outline: none;
    border-color: var(--primary, #3b82f6);
    box-shadow: 0 0 0 1px var(--primary, #3b82f6);
  }
  .fb-input:disabled,
  .fb-table-input:disabled,
  select.fb-input:disabled {
    opacity: 1;
    cursor: default;
    background: var(--surface-2, #18181b) !important;
    color: var(--text-secondary) !important;
    border-color: var(--border) !important;
    user-select: text;
  }
  .fb-table-container {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
  }
  .fb-table {
    width: 100%;
    min-width: 680px;
    border-collapse: collapse;
    font-size: 0.72rem;
  }
  .fb-table th {
    background: var(--surface-3);
    padding: 0.35rem 0.35rem;
    font-weight: 600;
    text-align: left;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  .fb-table td {
    padding: 0.22rem 0.35rem;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
    vertical-align: middle;
    text-align: left;
  }
  .fb-table-input {
    width: 100%;
    padding: 0.18rem 0.3rem;
    font-size: 0.72rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    color: var(--text-primary);
    box-sizing: border-box;
    text-align: left;
  }
  .fb-table-input:focus {
    outline: none;
    border-color: var(--primary, #3b82f6);
  }
  .fb-btn {
    height: 1.75rem;
    padding: 0 0.65rem;
    border-radius: 0.375rem;
    font-size: 0.72rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.3rem;
    white-space: nowrap;
    border: 1px solid transparent;
    transition: all 0.15s ease;
    text-decoration: none;
  }
  .fb-btn-primary {
    background: var(--button-primary-bg, #3b82f6);
    color: var(--button-primary-text, #ffffff);
  }
  .fb-btn-primary:hover {
    background: #2563eb;
  }
  .fb-btn-secondary {
    background: var(--surface-3);
    border-color: var(--border);
    color: var(--text-primary);
  }
  .fb-btn-secondary:hover {
    background: var(--surface-1);
  }
  .fb-btn-whatsapp {
    background: #25D366;
    color: #ffffff;
  }
  .fb-btn-whatsapp:hover {
    background: #1eb956;
  }
  .fb-add-line-desktop {
    display: inline-flex;
  }
  .fb-add-line-mobile {
    display: none;
  }
  .fb-preview-container {
    padding: 1rem;
    background: var(--surface-2, #18181b);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    width: 100%;
    box-sizing: border-box;
    overflow: visible;
  }
  .fb-preview-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.4rem;
    flex-wrap: wrap;
    width: 100%;
  }
  .fb-canvas-scroll-wrapper {
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
    width: 100%;
    box-sizing: border-box;
    display: block;
  }
  @media (max-width: 640px) {
    .fb-overlay {
      padding: 0 0.25rem;
    }
    .fb-modal {
      border-radius: 0.5rem;
      margin: 2rem auto;
      max-width: 100vw;
      width: 100%;
      height: calc(100vh - 4rem);
      height: calc(100dvh - 4rem);
      max-height: calc(100vh - 4rem);
      max-height: calc(100dvh - 4rem);
    }
    .fb-topbar {
      padding: 0.45rem 0.6rem;
      gap: 0.35rem;
    }
    .format-tabs-desktop {
      display: none;
    }
    .format-tabs-mobile {
      display: flex;
      width: 100%;
      background: var(--surface-3);
      padding: 0.15rem;
      border-radius: 0.375rem;
      border: 1px solid var(--border);
      gap: 0.2rem;
      box-sizing: border-box;
    }
    .format-tabs-mobile .format-tab {
      flex: 1 1 0;
      padding: 0.25rem 0.2rem;
      font-size: 0.68rem;
    }
    .fb-modal-body {
      padding: 0.75rem;
      gap: 0.75rem;
      flex: 1 1 0;
      min-height: 0;
    }
    .fb-card {
      padding: 0.75rem;
      gap: 0.5rem;
    }
    .fb-add-line-desktop {
      display: none;
    }
    .fb-add-line-mobile {
      display: flex;
      width: 100%;
      margin-top: 0.35rem;
    }
    .fb-preview-container {
      padding: 0.75rem;
      gap: 0.75rem;
    }
  }
  @media print {
    :global(body *) {
      visibility: hidden !important;
    }
    :global(body) {
      background: #ffffff !important;
      color: #000000 !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .fb-overlay {
      position: static !important;
      background: transparent !important;
      padding: 0 !important;
      overflow: visible !important;
      display: block !important;
      backdrop-filter: none !important;
    }
    .fb-topbar, .fb-card, button, input, select, .fb-table-container {
      display: none !important;
    }
    .fb-preview-container, .fb-canvas-scroll-wrapper {
      background: transparent !important;
      border: none !important;
      padding: 0 !important;
      display: block !important;
      overflow: visible !important;
      min-height: auto !important;
    }
    .fb-modal {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      max-width: 100% !important;
      width: 100% !important;
      height: auto !important;
      margin: 0 !important;
      overflow: visible !important;
    }
    #false-bill-print-canvas, #false-bill-print-canvas * {
      visibility: visible !important;
    }
    #false-bill-print-canvas {
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      margin: 0 !important;
      box-shadow: none !important;
      border: none !important;
    }
  }
`;

export const DemoBillGenerator = component$<DemoBillGeneratorProps>(({
  open,
  invoiceDetail,
  storeName,
  storeAddress,
  storeCity,
  storeState,
  storeDlNo,
  storePhone,
  storeGstin,
  storePan,
  terms,
}) => {
  useStylesScoped$(STYLES);

  const activeFormat = useSignal<PrintFormat>("dotmatrix");
  const thermalWidth = useSignal<"80mm" | "58mm">("80mm");
  const showConfigDrawer = useSignal(false);
  const isDownloadingPdf = useSignal(false);
  const isPrinting = useSignal(false);
  const isOpeningWhatsApp = useSignal(false);
  const downloadToast = useSignal<string | null>(null);
  const activeStaffId = useSignal<string | null>(null);

  // Editable Header Details
  const docNumber = useSignal("");
  const docDate = useSignal("");
  const paymentMode = useSignal("cash");
  const customerName = useSignal("");
  const customerPhone = useSignal("");
  const customerAddress = useSignal("");
  const customerCity = useSignal("");
  const customerState = useSignal("");
  const customerGstin = useSignal("");
  const customerPan = useSignal("");
  const customerDlNo = useSignal("");
  const notes = useSignal("");

  // Whole-Bill Extra Discount (Optional Flat ₹ or %)
  const billDiscountMode = useSignal<"flat" | "pct">("flat");
  const billDiscountAmt = useSignal(0);
  const billDiscountPct = useSignal(0);

  // Editable Store Info
  const storeInfo = useSignal({
    name: storeName || "MY STORE",
    address: storeAddress || "",
    city: storeCity || "",
    state: storeState || "",
    dlNo: storeDlNo || "",
    phone: storePhone || "",
    gstin: storeGstin || "",
    pan: storePan || "",
    regime: "GST",
    terms: terms || "All Subject to Local Jurisdiction only. Goods once sold will not be taken back.",
    headerTopText: "[ OM ]",
    invoiceTitleText: "[ GST INVOICE ]",
    digitalSignUrl: "",
    signatoryName: "",
    jurisdictionCity: "",
    lutNumber: "",
    watermark: 1,
  });

  // Editable Lines Array
  const lines = useSignal<EditableBillLine[]>([]);

  // Initialize from invoiceDetail when opened or changed
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track, cleanup }) => {
    const isOpen = track(() => open.value);
    const detail = track(() => invoiceDetail);
    if (!isOpen || !detail) return;

    // Hydrate active staff from global localStorage / events
    if (typeof localStorage !== "undefined") {
      const savedStaffId = localStorage.getItem("bk-active-staff-id");
      if (savedStaffId) {
        activeStaffId.value = savedStaffId;
      }
    }

    const handleStaffChange = (e: any) => {
      activeStaffId.value = e.detail || null;
    };

    if (typeof window !== "undefined") {
      window.addEventListener("bk-staff-changed", handleStaffChange);
      cleanup(() => {
        window.removeEventListener("bk-staff-changed", handleStaffChange);
      });
    }

    // Load tax config if available
    try {
      const cfg = await invoke<any>("fin_get_tax_config").catch(() => null);
      if (cfg) {
        storeInfo.value = {
          name: cfg.legal_name || storeName || "MY STORE",
          address: cfg.address || (cfg.trade_name ? `${cfg.trade_name}` : (storeAddress || "")),
          city: cfg.jurisdiction_city || storeCity || "",
          state: cfg.state_code || storeState || "",
          dlNo: cfg.dl_no || storeDlNo || "",
          phone: cfg.phone || storePhone || "",
          gstin: cfg.gstin || storeGstin || "",
          pan: cfg.pan || storePan || "",
          regime: cfg.regime || "GST",
          terms: cfg.invoice_terms || terms || "All Subject to Local Jurisdiction only. Goods once sold will not be taken back.",
          headerTopText: cfg.header_top_text || (cfg.regime === "None" ? "" : "[ OM ]"),
          invoiceTitleText: cfg.invoice_title_text || (cfg.regime === "None" ? "INVOICE / BILL" : "[ GST INVOICE ]"),
          digitalSignUrl: cfg.digital_sign_url || "",
          signatoryName: cfg.signatory_name || (cfg.legal_name ? `For: ${cfg.legal_name}` : "Authorized Signatory"),
          jurisdictionCity: cfg.jurisdiction_city || "Local",
          lutNumber: cfg.lut_number || "",
          watermark: cfg.watermark !== undefined ? cfg.watermark : 1,
        };
      }
    } catch { /* noop */ }

    docNumber.value = detail.doc_number;
    docDate.value = new Date(detail.doc_date * 1000).toISOString().split("T")[0];
    paymentMode.value = detail.payment_mode || "cash";
    customerName.value = detail.customer_name || "";
    customerPhone.value = detail.customer_phone || "";
    customerAddress.value = detail.customer_address || "";
    customerCity.value = detail.customer_city || "";
    customerState.value = detail.customer_state || "";
    customerGstin.value = detail.customer_gstin || "";
    customerPan.value = detail.customer_pan || "";
    customerDlNo.value = detail.customer_dl_no || "";
    notes.value = detail.notes || "";

    const parsedLines: EditableBillLine[] = (detail.lines || []).map((l, i) => {
      let extraDisc = 0;
      let snapshotDisc2 = 0;
      if ((l as any).pricing_snapshot) {
        try {
          const snap = typeof (l as any).pricing_snapshot === "string"
            ? JSON.parse((l as any).pricing_snapshot)
            : (l as any).pricing_snapshot;
          if (snap?.discount2) snapshotDisc2 = Number(snap.discount2);
        } catch { /* noop */ }
      }

      let meta: any = {};
      if (l.line_meta) {
        try {
          meta = typeof l.line_meta === "string" ? JSON.parse(l.line_meta) : l.line_meta;
        } catch { /* noop */ }
      }

      extraDisc = Number(
        meta.discount2 ??
        meta.dis2 ??
        meta.extra_discount ??
        snapshotDisc2 ??
        (l as any).discount2 ??
        (l as any).extra_discount ??
        0
      );

      // In SQLite, line.discount_pct may store total discount (dis1 + dis2)
      const dis1 = meta.discount_pct !== undefined
        ? Number(meta.discount_pct)
        : (meta.dis1 !== undefined
          ? Number(meta.dis1)
          : (extraDisc > 0 ? Math.max(0, (l.discount_pct || 0) - extraDisc) : (l.discount_pct || 0)));

      const pack = l.pack_size || meta.pack || meta.pack_size || "";
      const batch = meta.batch_no || "";
      const exp = meta.expiry_date || "";
      const mfg = meta.mfg_by || meta.brand_name || (l as any).brand_name || "";
      const shelf = meta.shelf_id || meta.shelf_location || "";
      const hsn = (l as any).hsn_sac_code || (l as any).resolved_hsn || (l as any).hsn || meta.hsn_sac_code || meta.hsn || meta.resolved_hsn || "";
      const mrp = l.mrp || meta.mrp || l.unit_price || 0;

      let taxPct = 0;
      if (meta.tax_rate_pct !== undefined) {
        taxPct = Number(meta.tax_rate_pct);
      } else if (meta.cgst_pct !== undefined && meta.sgst_pct !== undefined) {
        taxPct = Number(meta.cgst_pct) + Number(meta.sgst_pct);
      } else if (l.tax_amount && l.tax_amount > 0) {
        const lineGross = (l.unit_price || 0) * (l.qty || 1);
        const lineDisc = l.discount_amt || (lineGross * (dis1 + extraDisc) / 100);
        const lineNet = Math.max(0, lineGross - lineDisc);
        if (lineNet > 0) {
          taxPct = Math.round((l.tax_amount / lineNet) * 100);
        }
      }

      return {
        id: l.id || `line-${i}`,
        item_id: l.item_id || `item-${i}`,
        description: l.description || `Item ${i + 1}`,
        pack_size: pack,
        batch_no: batch,
        expiry_date: exp,
        hsn_sac_code: hsn,
        shelf_location: shelf,
        mfg_by: mfg,
        qty: l.qty || 1,
        free_qty: l.free_qty || 0,
        unit_price: l.unit_price || 0,
        mrp: mrp,
        discount_pct: dis1,
        extra_discount: extraDisc,
        tax_rate_pct: taxPct,
      };
    });

    lines.value = parsedLines;

    // Calculate sum of initial line discounts
    const sumLineDiscounts = parsedLines.reduce((s, l) => {
      const gross = l.unit_price * l.qty;
      const totalDiscPct = (l.discount_pct || 0) + (l.extra_discount || 0);
      return s + (totalDiscPct > 0 ? (gross * totalDiscPct) / 100 : 0);
    }, 0);

    // Any remaining discount in detail.discount_amt is the whole-bill discount
    const extraBillDisc = Math.max(0, Math.round(((detail.discount_amt || 0) - sumLineDiscounts) * 100) / 100);
    billDiscountAmt.value = extraBillDisc;
    billDiscountPct.value = 0;
    billDiscountMode.value = "flat";
  });

  // ── Real-Time Recalculations ──────────────────────────────────────────────
  const computedLines = useComputed$(() => {
    return lines.value.map(l => {
      const gross = l.unit_price * l.qty;
      const totalDiscPct = (l.discount_pct || 0) + (l.extra_discount || 0);
      const discAmt = totalDiscPct > 0 ? (gross * totalDiscPct) / 100 : 0;
      const taxable = Math.max(0, gross - discAmt);
      const taxAmt = l.tax_rate_pct > 0 ? (taxable * l.tax_rate_pct) / 100 : 0;
      const total = taxable + taxAmt;
      const rateAD = l.qty > 0 ? taxable / l.qty : (totalDiscPct > 0 ? l.unit_price * (1 - totalDiscPct / 100) : l.unit_price);

      return {
        ...l,
        gross,
        totalDiscPct,
        discAmt,
        taxable,
        taxAmt,
        total,
        rateAD,
      };
    });
  });

  const totals = useComputed$(() => {
    const cl = computedLines.value;
    const grossTotal = cl.reduce((s, l) => s + l.gross, 0);
    const itemDiscounts = cl.reduce((s, l) => s + l.discAmt, 0);
    const postItemSubtotal = Math.max(0, grossTotal - itemDiscounts);

    let billDisc = 0;
    if (billDiscountMode.value === "pct") {
      billDisc = (postItemSubtotal * Math.min(100, Math.max(0, billDiscountPct.value || 0))) / 100;
    } else {
      billDisc = Math.min(postItemSubtotal, Math.max(0, billDiscountAmt.value || 0));
    }

    const totalDiscount = itemDiscounts + billDisc;
    const taxableTotal = Math.max(0, grossTotal - totalDiscount);
    const totalTax = cl.reduce((s, l) => s + l.taxAmt, 0);
    const grandTotal = Math.round((taxableTotal + totalTax) * 100) / 100;
    const halfTax = totalTax / 2;

    const taxableVal = taxableTotal > 0 ? taxableTotal : grossTotal;
    const avgGstRate = taxableVal > 0 ? ((totalTax / taxableVal) * 100) : 0;
    const halfGstRate = (avgGstRate / 2).toFixed(1);

    return {
      grossTotal,
      itemDiscounts,
      billDisc,
      totalDiscount,
      taxableTotal,
      totalTax,
      halfTax,
      avgGstRate,
      halfGstRate,
      grandTotal,
      roundedTotal: Math.round(grandTotal),
      wordsAmount: numberToWords(grandTotal),
    };
  });

  const resetToOriginal = $(() => {
    if (!invoiceDetail) return;
    const detail = invoiceDetail;
    docNumber.value = detail.doc_number;
    docDate.value = new Date(detail.doc_date * 1000).toISOString().split("T")[0];
    paymentMode.value = detail.payment_mode || "cash";
    customerName.value = detail.customer_name || "";
    customerPhone.value = detail.customer_phone || "";
    customerAddress.value = detail.customer_address || "";
    customerCity.value = detail.customer_city || "";
    customerState.value = detail.customer_state || "";
    customerGstin.value = detail.customer_gstin || "";
    customerPan.value = detail.customer_pan || "";
    customerDlNo.value = detail.customer_dl_no || "";
    notes.value = detail.notes || "";

    const parsedLines: EditableBillLine[] = (detail.lines || []).map((l, i) => {
      let extraDisc = 0;
      let snapshotDisc2 = 0;
      if ((l as any).pricing_snapshot) {
        try {
          const snap = typeof (l as any).pricing_snapshot === "string"
            ? JSON.parse((l as any).pricing_snapshot)
            : (l as any).pricing_snapshot;
          if (snap?.discount2) snapshotDisc2 = Number(snap.discount2);
        } catch { /* noop */ }
      }

      let meta: any = {};
      if (l.line_meta) {
        try {
          meta = typeof l.line_meta === "string" ? JSON.parse(l.line_meta) : l.line_meta;
        } catch { /* noop */ }
      }

      extraDisc = Number(
        meta.discount2 ??
        meta.dis2 ??
        meta.extra_discount ??
        snapshotDisc2 ??
        (l as any).discount2 ??
        (l as any).extra_discount ??
        0
      );

      const dis1 = meta.discount_pct !== undefined
        ? Number(meta.discount_pct)
        : (meta.dis1 !== undefined
          ? Number(meta.dis1)
          : (extraDisc > 0 ? Math.max(0, (l.discount_pct || 0) - extraDisc) : (l.discount_pct || 0)));

      const pack = l.pack_size || meta.pack || meta.pack_size || "";
      const batch = meta.batch_no || "";
      const exp = meta.expiry_date || "";
      const mfg = meta.mfg_by || meta.brand_name || (l as any).brand_name || "";
      const shelf = meta.shelf_id || meta.shelf_location || "";
      const hsn = (l as any).hsn_sac_code || (l as any).resolved_hsn || (l as any).hsn || meta.hsn_sac_code || meta.hsn || meta.resolved_hsn || "";
      const mrp = l.mrp || meta.mrp || l.unit_price || 0;

      let taxPct = 0;
      if (meta.tax_rate_pct !== undefined) {
        taxPct = Number(meta.tax_rate_pct);
      } else if (meta.cgst_pct !== undefined && meta.sgst_pct !== undefined) {
        taxPct = Number(meta.cgst_pct) + Number(meta.sgst_pct);
      } else if (l.tax_amount && l.tax_amount > 0) {
        const lineGross = (l.unit_price || 0) * (l.qty || 1);
        const lineDisc = l.discount_amt || (lineGross * (dis1 + extraDisc) / 100);
        const lineNet = Math.max(0, lineGross - lineDisc);
        if (lineNet > 0) {
          taxPct = Math.round((l.tax_amount / lineNet) * 100);
        }
      }

      return {
        id: l.id || `line-${i}`,
        item_id: l.item_id || `item-${i}`,
        description: l.description || `Item ${i + 1}`,
        pack_size: pack,
        batch_no: batch,
        expiry_date: exp,
        hsn_sac_code: hsn,
        shelf_location: shelf,
        mfg_by: mfg,
        qty: l.qty || 1,
        free_qty: l.free_qty || 0,
        unit_price: l.unit_price || 0,
        mrp: mrp,
        discount_pct: dis1,
        extra_discount: extraDisc,
        tax_rate_pct: taxPct,
      };
    });

    lines.value = parsedLines;

    const sumLineDiscounts = parsedLines.reduce((s, l) => {
      const gross = l.unit_price * l.qty;
      const totalDiscPct = (l.discount_pct || 0) + (l.extra_discount || 0);
      return s + (totalDiscPct > 0 ? (gross * totalDiscPct) / 100 : 0);
    }, 0);

    const extraBillDisc = Math.max(0, Math.round(((detail.discount_amt || 0) - sumLineDiscounts) * 100) / 100);
    billDiscountAmt.value = extraBillDisc;
    billDiscountPct.value = 0;
    billDiscountMode.value = "flat";
  });

  // ── Native PDF Generation Helper ──────────────────────────────────────────
  const generatePdfBlobAndDataUri = $(async (printElement: HTMLElement) => {
    if (typeof document !== "undefined" && document.fonts) {
      try { await document.fonts.ready; } catch (e) { console.debug(e); }
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
    const isThermal = activeFormat.value === "thermal";
    const pdfWidthMm = isThermal ? (thermalWidth.value === "58mm" ? 58 : 80) : 210;
    const pdfHeightMm = isThermal ? Math.max(120, (canvas.height * pdfWidthMm) / canvas.width + 4) : 297;
    const marginMm = isThermal ? 1 : 0;
    const contentWidthMm = pdfWidthMm - (marginMm * 2);
    const contentHeightMm = (canvas.height * contentWidthMm) / canvas.width;

    const pdf = new jsPDF({
      orientation: "portrait",
      unit: "mm",
      format: isThermal ? [pdfWidthMm, pdfHeightMm] : "a4",
    });

    pdf.addImage(imgData, "JPEG", marginMm, marginMm, contentWidthMm, contentHeightMm);
    const pdfBase64 = pdf.output("datauristring");
    const pdfBlob = pdf.output("blob");

    return { pdfBase64, pdfBlob };
  });

  // ── Record 1 row per Demo Bill action into demo_bills ─────────────────────
  const recordDemoBillAction = $(async (action: "download_pdf" | "print" | "whatsapp") => {
    try {
      const payload = {
        original_invoice_id: invoiceDetail?.id || null,
        doc_number: docNumber.value || "DEMO-BILL",
        doc_date: docDate.value ? Math.floor(new Date(docDate.value).getTime() / 1000) : Math.floor(Date.now() / 1000),
        payment_mode: paymentMode.value || "cash",
        customer_name: customerName.value || null,
        customer_phone: customerPhone.value || null,
        customer_address: customerAddress.value || null,
        customer_gstin: customerGstin.value || null,
        customer_dl_no: customerDlNo.value || null,
        subtotal: totals.value.grossTotal,
        discount_amt: totals.value.totalDiscount,
        tax_amount: totals.value.totalTax,
        grand_total: totals.value.grandTotal,
        notes: notes.value || null,
        lines_snapshot: JSON.stringify(computedLines.value),
        staff_id: activeStaffId.value || (invoiceDetail as any)?.staff_id || null,
        action,
      };
      await invoke("shop_save_demo_bill", { data: payload });
    } catch (err) {
      console.warn("[DemoBillGenerator] shop_save_demo_bill record failed:", err);
    }
  });

  // ── Download PDF (No DB Changes to live invoices) ─────────────────────────
  const handleDownloadPdf = $(async () => {
    const printElement = (document.querySelector("#false-bill-print-canvas .print-canvas") as HTMLElement) || document.getElementById("false-bill-print-canvas");
    if (!printElement) return;
    isDownloadingPdf.value = true;
    try {
      const { pdfBase64, pdfBlob } = await generatePdfBlobAndDataUri(printElement);
      const fileName = `${docNumber.value || "demo-bill"}.pdf`;

      // Record demo bill row
      await recordDemoBillAction("download_pdf");

      // 1. Try Tauri Native Download (saves to public /storage/emulated/0/Download on Android or ~/Downloads on Desktop)
      try {
        const res = await invoke<{ file_path: string; file_name: string; directory?: string }>("shop_download_pdf", {
          fileName,
          base64Data: pdfBase64,
        });
        if (res?.file_path) {
          downloadToast.value = `✓ Saved to Downloads (${res.file_name})`;
          setTimeout(() => { downloadToast.value = null; }, 4500);
          return;
        }
      } catch (tauriErr) {
        console.warn("[DemoBillGenerator] shop_download_pdf fallback:", tauriErr);
      }

      // 2. Mobile (Android / iOS): Save via Web Share Sheet file export
      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator !== "undefined" && typeof File !== "undefined") {
        try {
          const file = new File([pdfBlob], fileName, { type: "application/pdf" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Save Invoice ${docNumber.value || ""}`,
              text: `Download Invoice ${docNumber.value || ""}`,
            });
            return;
          }
        } catch (shareErr) {
          console.warn("[DemoBillGenerator] Mobile download/share sheet fallback:", shareErr);
        }
      }

      // 3. Standard Web Browser File Download
      const link = document.createElement("a");
      link.href = URL.createObjectURL(pdfBlob);
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);
      downloadToast.value = `✓ Downloaded ${fileName}`;
      setTimeout(() => { downloadToast.value = null; }, 4500);
    } catch (err) {
      console.error("[DemoBillGenerator] PDF download error:", err);
    } finally {
      isDownloadingPdf.value = false;
    }
  });

  // ── Native Print (No DB Changes to live invoices) ─────────────────────────
  const handlePrint = $(async () => {
    const printElement = (document.querySelector("#false-bill-print-canvas .print-canvas") as HTMLElement) || document.getElementById("false-bill-print-canvas");
    if (!printElement) {
      window.print();
      return;
    }

    isPrinting.value = true;
    try {
      const { pdfBase64, pdfBlob } = await generatePdfBlobAndDataUri(printElement);
      const fileName = `${docNumber.value || "demo-bill"}.pdf`;

      // Record demo bill row
      await recordDemoBillAction("print");

      // 1. Mobile (Android / iOS): Open native Print / Share Sheet
      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator !== "undefined" && typeof File !== "undefined") {
        try {
          const file = new File([pdfBlob], fileName, { type: "application/pdf" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Print Invoice ${docNumber.value || ""}`,
              text: `Print Invoice ${docNumber.value || ""}`,
            });
            return;
          }
        } catch (shareErr) {
          console.warn("[DemoBillGenerator] Mobile print/share sheet fallback:", shareErr);
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
        console.warn("[DemoBillGenerator] Tauri shop_open_pdf fallback:", tauriErr);
      }

      // 3. Desktop Web fallback
      window.print();
    } catch (err) {
      console.error("[DemoBillGenerator] Native print error:", err);
      window.print();
    } finally {
      isPrinting.value = false;
    }
  });

  // ── WhatsApp Share (No DB Changes to live invoices) ───────────────────────
  const handleWhatsApp = $(async () => {
    isOpeningWhatsApp.value = true;
    try {
      const fakeInv = {
        doc_number: docNumber.value,
        doc_date: Math.floor(new Date(docDate.value || Date.now()).getTime() / 1000),
        subtotal: totals.value.grossTotal,
        discount_amt: totals.value.totalDiscount,
        tax_amount: totals.value.totalTax,
        grand_total: totals.value.grandTotal,
        amount_paid: totals.value.grandTotal,
        amount_due: 0,
        customer_name: customerName.value,
        customer_phone: customerPhone.value,
        lines: computedLines.value.map(l => ({
          description: l.description,
          qty: l.qty,
          free_qty: l.free_qty,
          unit_price: l.unit_price,
          line_total: l.total,
        })),
      };

      // Record demo bill row
      await recordDemoBillAction("whatsapp");

      await openWhatsAppInvoice(fakeInv, customerPhone.value, storeInfo.value.name);
    } catch (e) {
      console.error("[DemoBillGenerator] WhatsApp error:", e);
    } finally {
      isOpeningWhatsApp.value = false;
    }
  });

  if (!open.value) return null;

  const isTaxExempt = (storeInfo.value.regime || "").toLowerCase() === "none" || (storeInfo.value.regime || "").toLowerCase() === "exempt";
  const dateFormatted = docDate.value ? new Date(docDate.value).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

  return (
    <div class="fb-overlay">
      <div class="fb-modal">
        {/* ── Top Header Toolbar ── */}
        <div class="fb-topbar">
          {/* Main row: Title on left, [Format Tabs Desktop] + Reset + Close on right */}
          <div class="fb-topbar-main">
            {/* Left: Title + Badge */}
            <div class="fb-topbar-left">
              <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: "700", fontSize: "0.85rem", color: "var(--text-primary)" }}>
                <LuSparkles style={{ width: "0.95rem", height: "0.95rem", color: "#f59e0b" }} />
                Demo Bill Generator
              </div>
              <span style={{ fontSize: "0.65rem", fontWeight: "700", background: "rgba(245,158,11,0.15)", color: "#f59e0b", border: "1px solid rgba(245,158,11,0.3)", borderRadius: "9999px", padding: "0.08rem 0.4rem" }}>
                ⚡ Demo
              </span>
            </div>

            {/* Right: Desktop Format Tabs + Reset Button + Close [X] Button */}
            <div class="fb-topbar-right">
              <div class="format-tabs-desktop">
                <button
                  type="button"
                  class={["format-tab", activeFormat.value === "dotmatrix" ? "active" : ""].join(" ")}
                  onClick$={() => { activeFormat.value = "dotmatrix"; }}
                >
                  <LuFileText style="width:0.75rem;height:0.75rem;" />
                  Dot Matrix
                </button>
                <button
                  type="button"
                  class={["format-tab", activeFormat.value === "thermal" ? "active" : ""].join(" ")}
                  onClick$={() => { activeFormat.value = "thermal"; }}
                >
                  <LuReceipt style="width:0.75rem;height:0.75rem;" />
                  Thermal
                </button>
                <button
                  type="button"
                  class={["format-tab", activeFormat.value === "standard" ? "active" : ""].join(" ")}
                  onClick$={() => { activeFormat.value = "standard"; }}
                >
                  <LuBuilding style="width:0.75rem;height:0.75rem;" />
                  Standard A4
                </button>
              </div>

              {/* Reset Icon Button (Before X) */}
              <button
                type="button"
                onClick$={resetToOriginal}
                class="fb-icon-btn"
                title="Revert to original invoice data"
              >
                <LuRotateCcw style="width:0.9rem;height:0.9rem;" />
              </button>

              {/* Close [X] Button */}
              <button
                type="button"
                onClick$={() => { open.value = false; }}
                class="fb-icon-btn"
                title="Close"
              >
                <LuX style="width:1.1rem;height:1.1rem;" />
              </button>
            </div>
          </div>

          {/* Mobile Full-Width Format Tabs (Below top row on mobile) */}
          <div class="format-tabs-mobile">
            <button
              type="button"
              class={["format-tab", activeFormat.value === "dotmatrix" ? "active" : ""].join(" ")}
              onClick$={() => { activeFormat.value = "dotmatrix"; }}
            >
              <LuFileText style="width:0.75rem;height:0.75rem;" />
              Dot Matrix
            </button>
            <button
              type="button"
              class={["format-tab", activeFormat.value === "thermal" ? "active" : ""].join(" ")}
              onClick$={() => { activeFormat.value = "thermal"; }}
            >
              <LuReceipt style="width:0.75rem;height:0.75rem;" />
              Thermal
            </button>
            <button
              type="button"
              class={["format-tab", activeFormat.value === "standard" ? "active" : ""].join(" ")}
              onClick$={() => { activeFormat.value = "standard"; }}
            >
              <LuBuilding style="width:0.75rem;height:0.75rem;" />
              Standard A4
            </button>
          </div>
        </div>

        {/* ── Main Single-Column Scrollable Body ── */}
        <div class="fb-modal-body">
          {/* ══════════════════════════════════════════════════════════ */}
          {/* BOX 1: DOCUMENT & CUSTOMER DETAILS (NO DIVIDER)            */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div class="fb-card">
            <div class="fb-card-title">
              <span>Invoice & Customer Information</span>
              <span style={{ fontSize: "0.68rem", color: "var(--text-secondary)", fontWeight: "normal" }}>Invoice Details</span>
            </div>
            <div class="fb-grid">
              <div>
                <label class="fb-label">Bill Number</label>
                <input
                  type="text"
                  class="fb-input"
                  value={docNumber.value}
                  disabled
                />
              </div>
              <div>
                <label class="fb-label">Bill Date</label>
                <input
                  type="date"
                  class="fb-input"
                  value={docDate.value}
                  disabled
                />
              </div>
              <div>
                <label class="fb-label">Payment Mode</label>
                <select
                  class="fb-input"
                  value={paymentMode.value}
                  disabled
                >
                  <option value="cash">CASH</option>
                  <option value="card">CARD</option>
                  <option value="upi">UPI</option>
                  <option value="bank">BANK</option>
                  <option value="credit">CREDIT</option>
                </select>
              </div>
              <div>
                <label class="fb-label">Customer Name</label>
                <input
                  type="text"
                  class="fb-input"
                  value={customerName.value}
                  placeholder="Walk-in Customer"
                  disabled
                />
              </div>
              <div>
                <label class="fb-label">Customer Phone</label>
                <input
                  type="text"
                  class="fb-input"
                  value={customerPhone.value}
                  disabled
                />
              </div>
              <div>
                <label class="fb-label">Customer GSTIN</label>
                <input
                  type="text"
                  class="fb-input"
                  value={customerGstin.value}
                  disabled
                />
              </div>
              <div>
                <label class="fb-label">Customer DL No</label>
                <input
                  type="text"
                  class="fb-input"
                  value={customerDlNo.value}
                  disabled
                />
              </div>
              <div>
                <label class="fb-label">Customer Address</label>
                <input
                  type="text"
                  class="fb-input"
                  value={customerAddress.value}
                  disabled
                />
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* BOX 2: INTERACTIVE LINE ITEMS EDITOR (NO DIVIDER)          */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div class="fb-card">
            <div class="fb-card-title">
              <span>Line Items ({lines.value.length})</span>
            </div>

            <div class="fb-table-container">
              <table class="fb-table">
                <thead>
                  <tr>
                    <th style={{ width: "24%", textAlign: "left" }}>Item Description</th>
                    <th style={{ width: "12%", textAlign: "left" }}>Batch / Exp</th>
                    <th style={{ width: "8%", textAlign: "left" }}>Qty</th>
                    <th style={{ width: "8%", textAlign: "left" }}>Free</th>
                    <th style={{ width: "12%", textAlign: "left" }}>Rate (₹)</th>
                    <th style={{ width: "9%", textAlign: "left" }}>Disc 1 %</th>
                    <th style={{ width: "9%", textAlign: "left" }}>Dis 2 %</th>
                    <th style={{ width: "9%", textAlign: "left" }}>Rate AD</th>
                    <th style={{ width: "9%", textAlign: "left" }}>Net Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.value.map((l, idx) => {
                    const cl = computedLines.value[idx];
                    return (
                      <tr key={l.id}>
                        <td>
                          <input
                            type="text"
                            class="fb-table-input"
                            value={l.description}
                            disabled
                          />
                        </td>
                        <td>
                          <input
                            type="text"
                            class="fb-table-input"
                            value={l.batch_no}
                            placeholder="Batch"
                            disabled
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            class="fb-table-input"
                            value={l.qty}
                            onInput$={(e) => {
                              const val = Number((e.target as HTMLInputElement).value) || 0;
                              lines.value = lines.value.map((item, i) => i === idx ? { ...item, qty: val } : item);
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            class="fb-table-input"
                            value={l.free_qty}
                            onInput$={(e) => {
                              const val = Number((e.target as HTMLInputElement).value) || 0;
                              lines.value = lines.value.map((item, i) => i === idx ? { ...item, free_qty: val } : item);
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            class="fb-table-input"
                            style={{ fontWeight: "600" }}
                            value={l.unit_price}
                            onInput$={(e) => {
                              const val = Number((e.target as HTMLInputElement).value) || 0;
                              lines.value = lines.value.map((item, i) => i === idx ? { ...item, unit_price: val } : item);
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            class="fb-table-input"
                            style={{ color: "#3b82f6", fontWeight: "600" }}
                            value={l.discount_pct}
                            onInput$={(e) => {
                              const val = Number((e.target as HTMLInputElement).value) || 0;
                              lines.value = lines.value.map((item, i) => i === idx ? { ...item, discount_pct: val } : item);
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max="100"
                            step="any"
                            class="fb-table-input"
                            value={l.extra_discount}
                            onInput$={(e) => {
                              const val = Number((e.target as HTMLInputElement).value) || 0;
                              lines.value = lines.value.map((item, i) => i === idx ? { ...item, extra_discount: val } : item);
                            }}
                          />
                        </td>
                        <td style={{ textAlign: "left", color: "#10b981", fontWeight: "600", fontVariantNumeric: "tabular-nums" }}>
                          ₹{cl ? cl.rateAD.toFixed(2) : "0.00"}
                        </td>
                        <td style={{ textAlign: "left", fontWeight: "700", fontVariantNumeric: "tabular-nums" }}>
                          ₹{cl ? cl.total.toFixed(2) : "0.00"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* BOX 3: LIVE CALCULATED TOTALS (NO TITLE, NO SURFACE-3)     */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div class="fb-card">
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.5rem" }}>
              <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", padding: "0.5rem 0.65rem", borderRadius: "0.375rem" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Gross Subtotal</div>
                <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "var(--text-primary)" }}>₹{totals.value.grossTotal.toFixed(2)}</div>
              </div>
              <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", padding: "0.5rem 0.65rem", borderRadius: "0.375rem" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Total Discount</div>
                <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "#10b981" }}>-₹{totals.value.totalDiscount.toFixed(2)}</div>
              </div>
              <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", padding: "0.5rem 0.65rem", borderRadius: "0.375rem" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Taxable Total</div>
                <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "var(--text-primary)" }}>₹{totals.value.taxableTotal.toFixed(2)}</div>
              </div>
              <div style={{ background: "var(--surface-1)", border: "1px solid var(--border)", padding: "0.5rem 0.65rem", borderRadius: "0.375rem" }}>
                <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Grand Total</div>
                <div style={{ fontSize: "1rem", fontWeight: "800", color: "var(--primary, #3b82f6)" }}>₹{totals.value.grandTotal.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* BOX 4: WHOLE-BILL DISCOUNT (NO TITLE, EQUAL HEIGHT)         */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div class="fb-card">
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", width: "100%" }}>
              <div style={{ display: "flex", gap: "0.2rem", background: "var(--surface-1)", padding: "2px", borderRadius: "0.375rem", border: "1px solid var(--border)", height: "2rem", boxSizing: "border-box", flexShrink: 0 }}>
                <button
                  type="button"
                  class={["format-tab", billDiscountMode.value === "flat" ? "active" : ""].join(" ")}
                  style={{ height: "100%", padding: "0 0.65rem", fontSize: "0.72rem" }}
                  onClick$={() => { billDiscountMode.value = "flat"; }}
                >
                  Flat (₹)
                </button>
                <button
                  type="button"
                  class={["format-tab", billDiscountMode.value === "pct" ? "active" : ""].join(" ")}
                  style={{ height: "100%", padding: "0 0.65rem", fontSize: "0.72rem" }}
                  onClick$={() => { billDiscountMode.value = "pct"; }}
                >
                  Percent (%)
                </button>
              </div>
              <div style={{ flex: 1, minWidth: "140px" }}>
                {billDiscountMode.value === "flat" ? (
                  <input
                    type="number"
                    min="0"
                    step="any"
                    class="fb-input"
                    style={{ height: "2rem", fontSize: "0.75rem", padding: "0 0.55rem" }}
                    value={billDiscountAmt.value || ""}
                    placeholder="Extra Flat ₹ Discount (e.g. 50)"
                    onInput$={(e) => { billDiscountAmt.value = Number((e.target as HTMLInputElement).value) || 0; }}
                  />
                ) : (
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    class="fb-input"
                    style={{ height: "2rem", fontSize: "0.75rem", padding: "0 0.55rem" }}
                    value={billDiscountPct.value || ""}
                    placeholder="Extra % Discount (e.g. 5%)"
                    onInput$={(e) => { billDiscountPct.value = Number((e.target as HTMLInputElement).value) || 0; }}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ══════════════════════════════════════════════════════════ */}
          {/* BOX 5: INVOICE PREVIEW (WITH TOOLBAR BUTTONS INSIDE)       */}
          {/* ══════════════════════════════════════════════════════════ */}
          <div class="fb-preview-container">
            {/* Action Toolbar Inside Preview Container */}
            <div class="fb-preview-toolbar">
              {activeFormat.value === "thermal" && (
                <select
                  value={thermalWidth.value}
                  onChange$={(e) => { thermalWidth.value = (e.target as HTMLSelectElement).value as "80mm" | "58mm"; }}
                  class="fb-input"
                  style={{ width: "auto", height: "2rem", padding: "0 0.5rem", fontSize: "0.72rem" }}
                >
                  <option value="80mm">80mm Roll</option>
                  <option value="58mm">58mm Roll</option>
                </select>
              )}

              <button
                type="button"
                onClick$={() => { showConfigDrawer.value = !showConfigDrawer.value; }}
                title="Configure Store Header & Inscriptions"
                class="fb-btn fb-btn-secondary"
                style={{ height: "2rem", padding: "0 0.75rem", fontSize: "0.72rem" }}
              >
                <LuSettings2 style="width:0.8rem;height:0.8rem;" />
                Header
              </button>

              <button
                type="button"
                onClick$={handleDownloadPdf}
                disabled={isDownloadingPdf.value}
                class="fb-btn fb-btn-primary"
                title="Download customized invoice as PDF"
                style={{ height: "2rem", padding: "0 0.75rem", fontSize: "0.72rem" }}
              >
                {isDownloadingPdf.value ? (
                  <LuLoader2 style="width:0.8rem;height:0.8rem;animation:spin 1s linear infinite;" />
                ) : (
                  <LuDownload style="width:0.8rem;height:0.8rem;" />
                )}
                {isDownloadingPdf.value ? "Saving…" : "PDF"}
              </button>

              <button
                type="button"
                onClick$={handlePrint}
                disabled={isPrinting.value}
                class="fb-btn fb-btn-secondary"
                title="Print custom invoice"
                style={{ height: "2rem", padding: "0 0.75rem", fontSize: "0.72rem" }}
              >
                <LuPrinter style="width:0.8rem;height:0.8rem;" />
                Print
              </button>

              <button
                type="button"
                onClick$={handleWhatsApp}
                disabled={isOpeningWhatsApp.value}
                class="fb-btn fb-btn-whatsapp"
                title="Share custom bill via WhatsApp"
                style={{ height: "2rem", padding: "0 0.75rem", fontSize: "0.72rem" }}
              >
                <WhatsAppIcon style={{ width: "0.8rem", height: "0.8rem" }} />
                WhatsApp
              </button>
            </div>

            {/* Toast Notification */}
            {downloadToast.value && (
              <div style={{ background: "#10b981", color: "#ffffff", padding: "0.35rem 0.65rem", fontSize: "0.72rem", fontWeight: "600", textAlign: "center", borderRadius: "0.375rem" }}>
                {downloadToast.value}
              </div>
            )}

            {/* Store Header Quick Configuration Drawer */}
            {showConfigDrawer.value && (
              <div style={{ padding: "0.65rem", background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: "0.375rem", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: "0.4rem", fontSize: "0.72rem" }}>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Top Inscription</label>
                  <input
                    type="text"
                    value={storeInfo.value.headerTopText}
                    onInput$={(e) => { storeInfo.value = { ...storeInfo.value, headerTopText: (e.target as HTMLInputElement).value }; }}
                    placeholder="[ OM ]"
                    class="fb-input"
                  />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Invoice Title</label>
                  <input
                    type="text"
                    value={storeInfo.value.invoiceTitleText}
                    onInput$={(e) => { storeInfo.value = { ...storeInfo.value, invoiceTitleText: (e.target as HTMLInputElement).value }; }}
                    placeholder="[ GST INVOICE ]"
                    class="fb-input"
                  />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Store / Firm Name</label>
                  <input
                    type="text"
                    value={storeInfo.value.name}
                    onInput$={(e) => { storeInfo.value = { ...storeInfo.value, name: (e.target as HTMLInputElement).value }; }}
                    class="fb-input"
                  />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Address</label>
                  <input
                    type="text"
                    value={storeInfo.value.address}
                    onInput$={(e) => { storeInfo.value = { ...storeInfo.value, address: (e.target as HTMLInputElement).value }; }}
                    class="fb-input"
                  />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>City & State</label>
                  <input
                    type="text"
                    value={`${storeInfo.value.city}${storeInfo.value.state ? `, ${storeInfo.value.state}` : ""}`}
                    onInput$={(e) => {
                      const val = (e.target as HTMLInputElement).value;
                      storeInfo.value = { ...storeInfo.value, city: val.split(",")[0]?.trim() || val, state: val.split(",")[1]?.trim() || "" };
                    }}
                    class="fb-input"
                  />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>GSTIN</label>
                  <input
                    type="text"
                    value={storeInfo.value.gstin}
                    onInput$={(e) => { storeInfo.value = { ...storeInfo.value, gstin: (e.target as HTMLInputElement).value }; }}
                    class="fb-input"
                  />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Drug License (D.L. No)</label>
                  <input
                    type="text"
                    value={storeInfo.value.dlNo}
                    onInput$={(e) => { storeInfo.value = { ...storeInfo.value, dlNo: (e.target as HTMLInputElement).value }; }}
                    class="fb-input"
                  />
                </div>
                <div>
                  <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Phone / Mobile</label>
                  <input
                    type="text"
                    value={storeInfo.value.phone}
                    onInput$={(e) => { storeInfo.value = { ...storeInfo.value, phone: (e.target as HTMLInputElement).value }; }}
                    class="fb-input"
                  />
                </div>
              </div>
            )}
            {/* Document Preview Canvas Area (Horizontal Scroll ONLY for Canvas) */}
            <div class="fb-canvas-scroll-wrapper">
              <div
                id="false-bill-print-canvas"
                style={{
                  width: "100%",
                  margin: "0 auto",
                  display: activeFormat.value === "thermal" ? "flex" : "block",
                  justifyContent: activeFormat.value === "thermal" ? "center" : undefined,
                  minWidth: activeFormat.value === "thermal" ? "240px" : "max-content",
                }}
              >
              {/* ────────────────────────────────────────────────────────── */}
              {/* FORMAT 1: DOT MATRIX / PHARMA CONTINUOUS FEED TRACTOR PAPER */}
              {/* ────────────────────────────────────────────────────────── */}
              {activeFormat.value === "dotmatrix" && (
                <div
                  class="print-canvas"
                  style={{
                    width: "100%",
                    minWidth: "760px",
                    background: "#ffffff",
                    color: "#111111",
                    fontFamily: "'Courier New', Courier, Consolas, monospace",
                    fontSize: "10px",
                    lineHeight: "1.35",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                    display: "flex",
                    flexDirection: "column",
                    position: "relative",
                    margin: "0 auto",
                    borderRadius: "2px",
                    padding: "24px",
                    boxSizing: "border-box",
                  }}
                >
                  {/* Top header title */}
                  <div style={{ textAlign: "center", marginBottom: "6px" }}>
                    {storeInfo.value.headerTopText && (
                      <div style={{ fontWeight: "bold", fontSize: "11px", letterSpacing: "2px" }}>
                        {storeInfo.value.headerTopText}
                      </div>
                    )}
                    <div style={{ fontWeight: "bold", fontSize: "12px", letterSpacing: "1.5px" }}>
                      {storeInfo.value.invoiceTitleText || "[ GST INVOICE ]"}
                    </div>
                  </div>

                  {/* Store Name on Top (Bigger font) */}
                  <div style={{ fontWeight: "bold", fontSize: "14px", letterSpacing: "0.5px", marginBottom: "4px" }}>
                    {storeInfo.value.name.toUpperCase()}
                  </div>

                  {/* 3-Column Header Info below the Name */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1.3fr 0.9fr", gap: "10px", marginBottom: "6px", fontSize: "10px", lineHeight: "1.3" }}>
                    {/* Seller details */}
                    <div>
                      {storeInfo.value.address && <div>{storeInfo.value.address.toUpperCase()}</div>}
                      {storeInfo.value.city && <div>{storeInfo.value.city.toUpperCase()}</div>}
                      {storeInfo.value.state && <div>{storeInfo.value.state.toUpperCase()}</div>}
                      {storeInfo.value.dlNo && <div>D.L.No.{storeInfo.value.dlNo}</div>}
                      {storeInfo.value.phone && <div>MOB-{storeInfo.value.phone}</div>}
                      {storeInfo.value.gstin && <div style={{ fontWeight: "bold" }}>GSTIN--{storeInfo.value.gstin}</div>}
                    </div>

                    {/* Buyer / Customer details */}
                    <div>
                      <div style={{ fontWeight: "bold" }}>
                        To : {(customerName.value || "COUNTER SALE / WALK-IN").toUpperCase()}
                      </div>
                      {customerAddress.value && <div>   : {customerAddress.value.toUpperCase()}</div>}
                      {!isTaxExempt && <div>DLNO:{customerDlNo.value ? customerDlNo.value : "—"}</div>}
                      {!isTaxExempt && <div>GST :{customerGstin.value ? customerGstin.value : "—"}</div>}
                      {!isTaxExempt && <div>PAN :{customerPan.value ? customerPan.value : "—"}</div>}
                      {customerPhone.value ? <div>PH  :{customerPhone.value}</div> : null}
                    </div>

                    {/* Document details */}
                    <div>
                      <div><span style={{ fontWeight: "bold" }}>B.No:</span>{docNumber.value}</div>
                      <div><span style={{ fontWeight: "bold" }}>Date:</span>{dateFormatted || docDate.value}</div>
                      <div style={{ fontWeight: "bold", marginTop: "4px" }}>
                        {paymentMode.value.toUpperCase()}
                      </div>
                    </div>
                  </div>

                  {/* Top Thin Solid Line above Table */}
                  <div style={{ borderTop: "1px solid #333", margin: "5px 0 3px 0" }} />

                  {/* Dot Matrix Table */}
                  <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0", fontSize: "9.5px", lineHeight: "1.2", textAlign: "left" }}>
                    <thead>
                      <tr style={{ verticalAlign: "middle" }}>
                        <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", width: "16%", maxWidth: "130px" }}>Particular</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", width: "4%", whiteSpace: "nowrap", borderLeft: "1px dashed #888" }}>ShelfID</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", width: "5%", whiteSpace: "nowrap", borderLeft: "1px dashed #888" }}>Pack</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", width: "6%", minWidth: "40px", whiteSpace: "nowrap", borderLeft: "1px dashed #888" }}>HSN</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", width: "5%", whiteSpace: "nowrap", borderLeft: "1px dashed #888" }}>MfgBy</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", width: "6%", whiteSpace: "nowrap", borderLeft: "1px dashed #888" }}>Batch No</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4%", borderLeft: "1px dashed #888" }}>Qnty</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4%", borderLeft: "1px dashed #888" }}>Free</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "6.5%", borderLeft: "1px dashed #888" }}>Rate</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "7%", borderLeft: "1px dashed #888" }}>Amount</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4.5%", borderLeft: "1px dashed #888" }}>Disc</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4.5%", borderLeft: "1px dashed #888" }}>Dis2</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "6.5%", whiteSpace: "nowrap", borderLeft: "1px dashed #888" }}>Rate AD</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "7.5%", whiteSpace: "nowrap", borderLeft: "1px dashed #888" }}>Amount AD</th>
                        {!isTaxExempt && (
                          <>
                            <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4.5%", borderLeft: "1px dashed #888" }}>CGST%</th>
                            <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4.5%", borderLeft: "1px dashed #888" }}>SGST%</th>
                          </>
                        )}
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "6.5%", borderLeft: "1px dashed #888" }}>M.R.P.</th>
                        <th style={{ padding: "6px 2px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "5%", borderLeft: "1px dashed #888" }}>Exp.</th>
                      </tr>
                      <tr>
                        <td colSpan={isTaxExempt ? 16 : 18} style={{ padding: "0" }}>
                          <div style={{ borderTop: "1px solid #333", margin: "4px 0 6px 0" }} />
                        </td>
                      </tr>
                    </thead>
                    <tbody>
                      {computedLines.value.map((l, idx) => {
                        const discStr = l.discount_pct > 0 ? `${l.discount_pct.toFixed(l.discount_pct % 1 === 0 ? 0 : 1)}%` : "0.00";
                        const dis2Str = l.extra_discount > 0 ? `${l.extra_discount.toFixed(l.extra_discount % 1 === 0 ? 0 : 1)}%` : "0.00";
                        const lineCgst = l.tax_rate_pct > 0 ? (l.tax_rate_pct / 2).toFixed(1) : totals.value.halfGstRate;
                        const lineSgst = l.tax_rate_pct > 0 ? (l.tax_rate_pct / 2).toFixed(1) : totals.value.halfGstRate;

                        return (
                          <tr key={l.id || idx} style={{ verticalAlign: "middle" }}>
                            <td style={{ padding: "5px 3px", fontWeight: "bold", maxWidth: "105px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                              {l.description.toUpperCase()}
                            </td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{l.shelf_location || "—"}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{l.pack_size || "—"}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{l.hsn_sac_code || "—"}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{l.mfg_by || "—"}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{l.batch_no || "—"}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", fontWeight: "bold", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>{l.qty}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", fontWeight: "bold", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>{l.free_qty > 0 ? l.free_qty : "—"}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", fontWeight: "bold", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>{l.unit_price.toFixed(2)}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", fontWeight: "bold", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>{l.gross.toFixed(2)}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", fontWeight: "bold", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>{discStr}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>{dis2Str}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", fontWeight: "bold", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>{l.rateAD.toFixed(2)}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", fontWeight: "bold", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>{l.taxable.toFixed(2)}</td>
                            {!isTaxExempt && (
                              <>
                                <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", verticalAlign: "middle" }}>{lineCgst}</td>
                                <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", verticalAlign: "middle" }}>{lineSgst}</td>
                              </>
                            )}
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", verticalAlign: "middle", fontVariantNumeric: "tabular-nums" }}>{l.mrp > 0 ? l.mrp.toFixed(2) : l.unit_price.toFixed(2)}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", textAlign: "right", verticalAlign: "middle", whiteSpace: "nowrap" }}>{l.expiry_date || "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Middle Line below Table */}
                  <div style={{ borderTop: "1px solid #333", margin: "6px 0 8px 0" }} />

                  {/* Bottom Multi-Column Section */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: "12px", alignItems: "flex-start", marginTop: "4px" }}>
                    {/* Left Column: Terms, GST Summary, Words */}
                    <div style={{ fontSize: "9.5px", lineHeight: "1.3" }}>
                      <div style={{ marginBottom: "6px" }}>
                        <div style={{ fontWeight: "bold" }}>TERMS & CONDITIONS:</div>
                        <div>{storeInfo.value.terms}</div>
                      </div>

                      {/* GST / Tax Summary Sub-table */}
                      <div style={{ borderTop: "1px dashed #777", paddingTop: "4px", marginTop: "4px" }}>
                        <div style={{ fontWeight: "bold", marginBottom: "2px" }}>GST TAX BREAKDOWN:</div>
                        {!isTaxExempt && totals.value.totalTax > 0 && (
                          <div style={{ display: "flex", flexDirection: "column", gap: "1px", fontSize: "9px" }}>
                            <div>CGST {totals.value.halfGstRate}% on {totals.value.taxableTotal.toFixed(2)} = {totals.value.halfTax.toFixed(2)}</div>
                            <div>SGST {totals.value.halfGstRate}% on {totals.value.taxableTotal.toFixed(2)} = {totals.value.halfTax.toFixed(2)}</div>
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: "6px", fontWeight: "bold", fontSize: "10px" }}>
                        Rupees: {totals.value.wordsAmount} Only
                      </div>
                    </div>

                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <div style={{ borderLeft: "1px dashed #777", paddingLeft: "8px", display: "flex", flexDirection: "column", gap: "2px", fontSize: "9.5px" }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ width: "96px" }}>TOTAL :</span>
                          <span style={{ width: "64px", textAlign: "right", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>{totals.value.grossTotal.toFixed(2)}</span>
                          <span style={{ marginLeft: "8px", fontSize: "9px", color: "#333", flex: 1, whiteSpace: "nowrap" }}># {lines.value.length} ITEMS Cases No</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ width: "96px" }}>DISCOUNT :</span>
                          <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totals.value.totalDiscount > 0 ? totals.value.totalDiscount.toFixed(2) : "0.00"}</span>
                          <span style={{ marginLeft: "8px", fontSize: "9px", color: "#333", flex: 1, whiteSpace: "nowrap" }}># {docNumber.value}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ width: "96px" }}>TOTAL AFT DISC:</span>
                          <span style={{ width: "64px", textAlign: "right", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>{totals.value.taxableTotal.toFixed(2)}</span>
                        </div>
                        {!isTaxExempt && totals.value.totalTax > 0 && (
                          <>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ width: "96px" }}>ADD CGST :</span>
                              <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totals.value.halfTax.toFixed(2)}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ width: "96px" }}>ADD SGST :</span>
                              <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totals.value.halfTax.toFixed(2)}</span>
                            </div>
                          </>
                        )}
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ width: "96px" }}>(-)Claims:</span>
                          <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>0.00</span>
                          <span style={{ marginLeft: "8px", fontSize: "8.5px", color: "#333", flex: 1, whiteSpace: "nowrap" }}>Packed By &nbsp; Checked By</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ width: "96px" }}>(+/-)Oth :</span>
                          <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>0.00</span>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", fontWeight: "bold", marginTop: "3px" }}>
                          <span style={{ width: "96px" }}>NetAmount:</span>
                          <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totals.value.grandTotal.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Lower Block: (Rounded) + Signature matching InvoicePrintModal */}
                      <div style={{ paddingLeft: "8px", marginTop: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", fontWeight: "bold", fontSize: "14px" }}>
                          <span style={{ width: "84px" }}>(Rounded):</span>
                          <span style={{ width: "76px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totals.value.roundedTotal.toFixed(2)}</span>
                        </div>

                        <div style={{ marginTop: "12px", textAlign: "right" }}>
                          {storeInfo.value.digitalSignUrl ? (
                            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "2px" }}>
                              <img src={storeInfo.value.digitalSignUrl} alt="Digital Sign" width={120} height={32} style={{ maxHeight: "32px", objectFit: "contain" }} />
                            </div>
                          ) : (
                            <div style={{ height: "16px" }} />
                          )}
                          <div style={{ fontWeight: "bold", fontSize: "9.5px" }}>
                            {storeInfo.value.signatoryName || `For:${storeInfo.value.name.toUpperCase()}`}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Dotted/Dashed Perforation Line at end of invoice */}
                  <div style={{ borderTop: "1px dashed #000", margin: "14px 0 0 0", width: "100%" }} />

                  {/* Watermark Branding Footer */}
                  {storeInfo.value.watermark !== 0 && (
                    <div style={{ textAlign: "center", fontSize: "8.5px", color: "#555", marginTop: "8px", letterSpacing: "0.5px" }}>
                      Bill Generated on BusinessKit App
                    </div>
                  )}
                </div>
              )}

              {/* ────────────────────────────────────────────────────────── */}
              {/* FORMAT 2: STANDARD MODERN A4 CANVAS                        */}
              {/* ────────────────────────────────────────────────────────── */}
              {activeFormat.value === "standard" && (
                <div
                  class="print-canvas"
                  style={{
                    width: "100%",
                    minWidth: "720px",
                    background: "#ffffff",
                    color: "#1f2937",
                    fontFamily: "Arial, Helvetica, sans-serif",
                    fontSize: "12px",
                    lineHeight: "1.3",
                    padding: "28px",
                    boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
                    borderRadius: "2px",
                    boxSizing: "border-box",
                    margin: "0 auto",
                  }}
                >
                  {/* Header */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid #111827", paddingBottom: "18px" }}>
                    <div>
                      <h1 style={{ margin: 0, fontSize: "22px", fontWeight: "800", color: "#111827", letterSpacing: "-0.02em" }}>
                        {storeInfo.value.name}
                      </h1>
                      <div style={{ marginTop: "4px", fontSize: "11px", color: "#4b5563", maxWidth: "340px", lineHeight: "1.35" }}>
                        {storeInfo.value.address && <div>{storeInfo.value.address}</div>}
                        {(storeInfo.value.city || storeInfo.value.state) && (
                          <div>{storeInfo.value.city} {storeInfo.value.state && `(${storeInfo.value.state})`}</div>
                        )}
                        {storeInfo.value.phone && <div>Ph: {storeInfo.value.phone}</div>}
                        {storeInfo.value.gstin && <div>GSTIN: <strong>{storeInfo.value.gstin}</strong></div>}
                        {storeInfo.value.dlNo && <div>D.L. No.: <strong>{storeInfo.value.dlNo}</strong></div>}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "20px", fontWeight: "900", color: "#111827", letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                        {storeInfo.value.invoiceTitleText || "TAX INVOICE"}
                      </div>
                      <div style={{ marginTop: "6px", fontSize: "11px", color: "#4b5563" }}>
                        <div>Invoice No: <strong style={{ color: "#111827" }}>{docNumber.value}</strong></div>
                        <div>Date: <strong style={{ color: "#111827" }}>{dateFormatted || docDate.value}</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* Billed To & Payment Details */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", padding: "16px 0", borderBottom: "1px solid #e5e7eb" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                        Billed To
                      </div>
                      <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>
                        {customerName.value || "Walk-in Customer"}
                      </div>
                      {customerAddress.value && (
                        <div style={{ fontSize: "11px", color: "#4b5563", marginTop: "2px" }}>{customerAddress.value}</div>
                      )}
                      {(customerCity.value || customerState.value) && (
                        <div style={{ fontSize: "11px", color: "#4b5563" }}>{customerCity.value} {customerState.value}</div>
                      )}
                      {customerPhone.value && (
                        <div style={{ fontSize: "11px", color: "#4b5563" }}>Phone: {customerPhone.value}</div>
                      )}
                      {!isTaxExempt && customerGstin.value && (
                        <div style={{ fontSize: "11px", color: "#111827", marginTop: "2px" }}>GSTIN: <strong>{customerGstin.value}</strong></div>
                      )}
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                        Payment Details
                      </div>
                      <div style={{ fontSize: "11px", color: "#4b5563", lineHeight: "1.4" }}>
                        <div>Payment Mode: <strong style={{ textTransform: "uppercase", color: "#111827" }}>{paymentMode.value}</strong></div>
                        <div>Grand Total: <strong style={{ color: "#111827" }}>{fmtMoney(totals.value.grandTotal)}</strong></div>
                        <div>Amount Paid: <strong style={{ color: "#10b981" }}>{fmtMoney(totals.value.grandTotal)}</strong></div>
                      </div>
                    </div>
                  </div>

                  {/* Items Table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", margin: "16px 0", fontSize: "11px" }}>
                    <thead>
                      <tr style={{ background: "#f3f4f6", borderBottom: "2px solid #e5e7eb" }}>
                        <th style={{ padding: "10px 10px", textAlign: "left", fontWeight: "700", color: "#374151", verticalAlign: "middle", lineHeight: "1.2", width: "40px" }}>#</th>
                        <th style={{ padding: "10px 10px", textAlign: "left", fontWeight: "700", color: "#374151", verticalAlign: "middle", lineHeight: "1.2", width: "32%" }}>Item Description</th>
                        <th style={{ padding: "10px 10px", textAlign: "right", fontWeight: "700", color: "#374151", verticalAlign: "middle", lineHeight: "1.2", width: "10%" }}>Qty</th>
                        <th style={{ padding: "10px 10px", textAlign: "right", fontWeight: "700", color: "#374151", verticalAlign: "middle", lineHeight: "1.2", width: "15%" }}>Unit Price</th>
                        <th style={{ padding: "10px 10px", textAlign: "right", fontWeight: "700", color: "#374151", verticalAlign: "middle", lineHeight: "1.2", width: "12%" }}>Disc%</th>
                        {!isTaxExempt && <th style={{ padding: "10px 10px", textAlign: "right", fontWeight: "700", color: "#374151", verticalAlign: "middle", lineHeight: "1.2", width: "12%" }}>Tax</th>}
                        <th style={{ padding: "10px 10px", textAlign: "right", fontWeight: "700", color: "#374151", verticalAlign: "middle", lineHeight: "1.2", width: "15%" }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computedLines.value.map((l, idx) => {
                        const discText = (l.discount_pct > 0 && l.extra_discount > 0)
                          ? `${l.discount_pct.toFixed(l.discount_pct % 1 === 0 ? 0 : 1)}%+${l.extra_discount.toFixed(l.extra_discount % 1 === 0 ? 0 : 1)}%`
                          : (l.discount_pct > 0
                            ? `${l.discount_pct.toFixed(l.discount_pct % 1 === 0 ? 0 : 1)}%`
                            : (l.extra_discount > 0
                              ? `${l.extra_discount.toFixed(l.extra_discount % 1 === 0 ? 0 : 1)}%`
                              : "—"));

                        return (
                          <tr key={l.id || idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                            <td style={{ padding: "10px 10px", color: "#6b7280", verticalAlign: "middle", lineHeight: "1.2" }}>{idx + 1}</td>
                            <td style={{ padding: "10px 10px", fontWeight: "600", color: "#111827", verticalAlign: "middle", lineHeight: "1.2" }}>
                              <div>{l.description}</div>
                              {(l.pack_size || l.hsn_sac_code) && (
                                <div style={{ fontSize: "9.5px", color: "#6b7280", fontWeight: "normal", marginTop: "2px" }}>
                                  {[l.pack_size ? `Pack: ${l.pack_size}` : null, l.hsn_sac_code ? `HSN: ${l.hsn_sac_code}` : null].filter(Boolean).join("  •  ")}
                                </div>
                              )}
                            </td>
                            <td style={{ padding: "10px 10px", textAlign: "right", color: "#374151", verticalAlign: "middle", lineHeight: "1.2" }}>{l.qty}</td>
                            <td style={{ padding: "10px 10px", textAlign: "right", color: "#374151", verticalAlign: "middle", lineHeight: "1.2" }}>{fmtMoney(l.unit_price)}</td>
                            <td style={{ padding: "10px 10px", textAlign: "right", color: (l.discount_pct > 0 || l.extra_discount > 0) ? "#10b981" : "#9ca3af", fontWeight: (l.discount_pct > 0 || l.extra_discount > 0) ? "600" : "normal", verticalAlign: "middle", lineHeight: "1.2" }}>
                              {discText}
                            </td>
                            {!isTaxExempt && (
                              <td style={{ padding: "10px 10px", textAlign: "right", color: l.taxAmt > 0 ? "#f59e0b" : "#9ca3af", verticalAlign: "middle", lineHeight: "1.2" }}>
                                {l.taxAmt > 0 ? fmtMoney(l.taxAmt) : "0%"}
                              </td>
                            )}
                            <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: "700", color: "#111827", verticalAlign: "middle", lineHeight: "1.2" }}>
                              {fmtMoney(l.total)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Summary Bottom Grid */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: "24px", alignItems: "flex-start", marginTop: "12px" }}>
                    <div>
                      <div style={{ fontSize: "11px", fontWeight: "700", color: "#4b5563", textTransform: "uppercase", marginBottom: "4px" }}>
                        Amount in Words
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: "600", color: "#111827", padding: "8px 12px", minHeight: "36px", display: "flex", alignItems: "center", background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "4px", boxSizing: "border-box", lineHeight: "1.2" }}>
                        {totals.value.wordsAmount} Rupees Only
                      </div>

                      <div style={{ marginTop: "14px", fontSize: "11px", color: "#6b7280" }}>
                        <strong>Terms & Conditions:</strong>
                        <div style={{ marginTop: "2px" }}>{storeInfo.value.terms}</div>
                      </div>
                    </div>

                    <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "5px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", lineHeight: "1.2" }}>
                        <span style={{ color: "#6b7280" }}>Subtotal (Gross):</span>
                        <span style={{ fontWeight: "600" }}>{fmtMoney(totals.value.grossTotal)}</span>
                      </div>
                      {totals.value.totalDiscount > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#10b981", lineHeight: "1.2" }}>
                          <span>Total Discount:</span>
                          <span>−{fmtMoney(totals.value.totalDiscount)}</span>
                        </div>
                      )}
                      {totals.value.totalDiscount > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", lineHeight: "1.2" }}>
                          <span style={{ color: "#6b7280" }}>Total After Discount:</span>
                          <span style={{ fontWeight: "600" }}>{fmtMoney(totals.value.taxableTotal)}</span>
                        </div>
                      )}
                      {!isTaxExempt && totals.value.totalTax > 0 && (
                        <>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#4b5563", lineHeight: "1.2" }}>
                            <span>CGST ({totals.value.halfGstRate}%):</span>
                            <span>{fmtMoney(totals.value.halfTax)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#4b5563", lineHeight: "1.2" }}>
                            <span>SGST ({totals.value.halfGstRate}%):</span>
                            <span>{fmtMoney(totals.value.halfTax)}</span>
                          </div>
                        </>
                      )}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "2px solid #e5e7eb", paddingTop: "6px", marginTop: "3px", fontSize: "15px", fontWeight: "800", color: "#111827", lineHeight: "1.2" }}>
                        <span>Grand Total:</span>
                        <span>{fmtMoney(totals.value.grandTotal)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#6b7280", lineHeight: "1.2" }}>
                        <span>Amount Paid:</span>
                        <span>{fmtMoney(totals.value.grandTotal)}</span>
                      </div>
                    </div>
                  </div>

                  {/* Signature Block */}
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "28px", textAlign: "right" }}>
                    <div>
                      {storeInfo.value.digitalSignUrl ? (
                        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "4px" }}>
                          <img src={storeInfo.value.digitalSignUrl} alt="Digital Sign" width={140} height={42} style={{ maxHeight: "42px", objectFit: "contain" }} />
                        </div>
                      ) : (
                        <div style={{ borderBottom: "1px solid #d1d5db", width: "180px", marginBottom: "4px", height: "30px" }} />
                      )}
                      <div style={{ fontWeight: "700", fontSize: "11px", color: "#111827" }}>
                        {storeInfo.value.signatoryName || "Authorized Signatory"}
                      </div>
                      <div style={{ fontSize: "10px", color: "#6b7280" }}>For {storeInfo.value.name}</div>
                    </div>
                  </div>

                  {/* Footer Watermark */}
                  {storeInfo.value.watermark !== 0 && (
                    <div style={{ textAlign: "center", fontSize: "9px", color: "#9ca3af", marginTop: "18px", letterSpacing: "0.5px", borderTop: "1px solid #f3f4f6", paddingTop: "8px" }}>
                      Bill Generated on BusinessKit App
                    </div>
                  )}
                </div>
              )}

              {/* ────────────────────────────────────────────────────────── */}
              {/* FORMAT 3: THERMAL POS RECEIPT                              */}
              {/* ────────────────────────────────────────────────────────── */}
              {activeFormat.value === "thermal" && (
                <div
                  class="print-canvas"
                  style={{
                    width: thermalWidth.value === "80mm" ? "320px" : "240px",
                    background: "#ffffff",
                    color: "#000000",
                    fontFamily: "'Courier New', Courier, monospace",
                    fontSize: thermalWidth.value === "80mm" ? "11px" : "10px",
                    padding: "16px 12px",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
                    margin: "0 auto",
                    borderRadius: "2px",
                  }}
                >
                  <div style={{ textAlign: "center", marginBottom: "8px" }}>
                    {storeInfo.value.headerTopText && (
                      <div style={{ fontSize: "10px", fontWeight: "bold" }}>{storeInfo.value.headerTopText}</div>
                    )}
                    <div style={{ fontWeight: "900", fontSize: "14px", letterSpacing: "0.5px" }}>
                      {storeInfo.value.name.toUpperCase()}
                    </div>
                    {storeInfo.value.address && <div>{storeInfo.value.address}</div>}
                    {(storeInfo.value.city || storeInfo.value.state) && (
                      <div>{storeInfo.value.city}{storeInfo.value.state ? `, ${storeInfo.value.state}` : ""}</div>
                    )}
                    {storeInfo.value.phone && <div>Ph: {storeInfo.value.phone}</div>}
                    {storeInfo.value.gstin && <div>GSTIN: {storeInfo.value.gstin}</div>}
                    {storeInfo.value.dlNo && <div>D.L.No: {storeInfo.value.dlNo}</div>}
                  </div>

                  <div style={{ borderTop: "1px dashed #000", margin: "6px 0" }} />

                  <div style={{ fontSize: "10.5px", lineHeight: "1.4" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Bill: <strong>{docNumber.value}</strong></span>
                      <span>{dateFormatted || docDate.value}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Cust: {customerName.value || "Walk-in"}</span>
                      <span>Pay: {paymentMode.value.toUpperCase()}</span>
                    </div>
                    {customerPhone.value && (
                      <div>Ph: {customerPhone.value}</div>
                    )}
                  </div>

                  <div style={{ borderTop: "1px dashed #000", margin: "6px 0 4px 0" }} />

                  {/* Items Table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10.5px", lineHeight: "1.35" }}>
                    <thead>
                      <tr>
                        <th style={{ textAlign: "left", padding: "4px 0 6px 0", borderBottom: "1px dashed #000" }}>Item</th>
                        <th style={{ textAlign: "right", padding: "4px 0 6px 0", borderBottom: "1px dashed #000" }}>Qty</th>
                        <th style={{ textAlign: "right", padding: "4px 0 6px 0", borderBottom: "1px dashed #000" }}>Rate</th>
                        <th style={{ textAlign: "right", padding: "4px 0 6px 0", borderBottom: "1px dashed #000" }}>Amt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {computedLines.value.map((l, idx) => (
                        <tr key={l.id || idx}>
                          <td style={{ padding: "5px 0 4px 0", maxWidth: "120px", wordBreak: "break-word" }}>
                            {l.description}
                          </td>
                          <td style={{ textAlign: "right", padding: "5px 0 4px 0" }}>{l.qty}</td>
                          <td style={{ textAlign: "right", padding: "5px 0 4px 0" }}>{l.unit_price.toFixed(2)}</td>
                          <td style={{ textAlign: "right", padding: "5px 0 4px 0", fontWeight: "bold" }}>{l.total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div style={{ borderTop: "1px dashed #000", margin: "6px 0 8px 0" }} />

                  {/* Totals */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "10.5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Total (Gross):</span>
                      <span>{totals.value.grossTotal.toFixed(2)}</span>
                    </div>
                    {totals.value.totalDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>Discount:</span>
                        <span>−{totals.value.totalDiscount.toFixed(2)}</span>
                      </div>
                    )}
                    {totals.value.totalDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "600" }}>
                        <span>Total After Disc:</span>
                        <span>{totals.value.taxableTotal.toFixed(2)}</span>
                      </div>
                    )}
                    {!isTaxExempt && totals.value.totalTax > 0 && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>CGST ({totals.value.halfGstRate}%):</span>
                          <span>{totals.value.halfTax.toFixed(2)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                          <span>SGST ({totals.value.halfGstRate}%):</span>
                          <span>{totals.value.halfTax.toFixed(2)}</span>
                        </div>
                      </>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "900", borderTop: "1px dashed #000", borderBottom: "1px dashed #000", padding: "4px 0", margin: "3px 0" }}>
                      <span>TOTAL:</span>
                      <span>{fmtMoney(totals.value.grandTotal)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Paid ({paymentMode.value.toUpperCase()}):</span>
                      <span>{fmtMoney(totals.value.grandTotal)}</span>
                    </div>
                  </div>

                  <div style={{ textAlign: "center", marginTop: "14px", borderTop: "1px dashed #000", paddingTop: "8px", fontSize: "9.5px" }}>
                    <div style={{ fontWeight: "bold" }}>*** THANK YOU! VISIT AGAIN ***</div>
                    <div style={{ marginTop: "4px" }}>Item count: {lines.value.length}</div>
                    <div style={{ marginTop: "4px", fontSize: "8.5px", color: "#444" }}>
                      {storeInfo.value.terms}
                    </div>
                    {storeInfo.value.watermark !== 0 && (
                      <div style={{ marginTop: "6px", fontSize: "8px", color: "#666", letterSpacing: "0.4px" }}>
                        Bill Generated on BusinessKit App
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
  );
});

export const CustomBillgenerator = DemoBillGenerator;
export const CustomBillGenerator = DemoBillGenerator;
export const FalseBillGenerator = DemoBillGenerator;



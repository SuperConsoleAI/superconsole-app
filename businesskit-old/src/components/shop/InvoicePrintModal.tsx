// src/components/shop/InvoicePrintModal.tsx
//
// Multi-Format Invoice Print & Preview Modal:
// 1. Dot Matrix / Pharma / Wholesale (Continuous Feed Tractor Paper GST Invoice with Punch Holes)
// 2. Thermal POS Receipt (80mm / 58mm Vertical Slip)
// 3. Classic Modern Business Invoice (A4 / Standard Full Page)
//
// Dynamic configuration from GST Tax Config (fin_get_tax_config) & Active Customer.

import {
  component$,
  useSignal,
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
  LuSettings2,
} from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import type { InvoiceDetail, InvoiceLine } from "./InvoiceDetailSlideOver";
import { fmtMoney } from "~/lib/fin-format";
import { QRCodeView } from "~/components/QRCode";

export type PrintFormat = "dotmatrix" | "thermal" | "standard";

export const WhatsAppIcon = component$<{ style?: any; class?: string }>(({ style, class: className }) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="currentColor"
    style={style}
    class={className}
  >
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.82 11.82 0 00-3.48-8.413z" />
  </svg>
));

export function buildInvoiceWhatsAppMessage(
  inv: {
    doc_number: string;
    doc_date: number;
    subtotal?: number;
    discount_amt?: number;
    tax_amount?: number;
    grand_total: number;
    amount_paid: number;
    amount_due: number;
    customer_name?: string | null;
    lines?: Array<{
      description?: string | null;
      item_id?: string;
      qty: number;
      free_qty?: number | null;
      unit_price: number;
      line_total?: number;
    }>;
  },
  storeName?: string
): string {
  const dateStr = new Date(inv.doc_date * 1000).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  const totalStr = fmtMoney(inv.grand_total);
  const paidStr = fmtMoney(inv.amount_paid);
  const dueStr = fmtMoney(inv.amount_due);
  const store = storeName || "Our Store";
  const customer = inv.customer_name || "Valued Customer";

  const lines: string[] = [
    `*Invoice from ${store}*`,
    `----------------------------------------`,
    `*Invoice #:* ${inv.doc_number}`,
    `*Date:* ${dateStr}`,
    `*Billed To:* ${customer}`,
    `----------------------------------------`,
  ];

  // Include item lines if present
  if (inv.lines && inv.lines.length > 0) {
    lines.push(`*ITEMS:*`);
    for (const l of inv.lines) {
      const name = (l.description || l.item_id || "Item").toUpperCase();
      const lineTotal = l.line_total ?? (l.qty * l.unit_price);
      const freeText = l.free_qty && l.free_qty > 0 ? ` (+${l.free_qty} Free)` : "";
      lines.push(`• ${name}`);
      lines.push(`  ${l.qty}${freeText} x ${fmtMoney(l.unit_price)} = ${fmtMoney(lineTotal)}`);
    }
    lines.push(`----------------------------------------`);
  }

  if (inv.subtotal && inv.subtotal > 0 && inv.subtotal !== inv.grand_total) {
    lines.push(`*Subtotal:* ${fmtMoney(inv.subtotal)}`);
  }
  if (inv.discount_amt && inv.discount_amt > 0) {
    lines.push(`*Discount:* -${fmtMoney(inv.discount_amt)}`);
  }
  if (inv.tax_amount && inv.tax_amount > 0) {
    lines.push(`*Tax (GST):* +${fmtMoney(inv.tax_amount)}`);
  }

  lines.push(`*Total Amount:* ${totalStr}`);
  lines.push(`*Amount Paid:* ${paidStr}`);

  if (inv.amount_due > 0) {
    lines.push(`*Amount Due:* ${dueStr}`);
  }

  lines.push(`----------------------------------------`);
  lines.push(`Thank you for your business!`);

  return lines.join("\r\n");
}

export async function openWhatsAppInvoice(
  inv: {
    id?: string;
    doc_number: string;
    doc_date: number;
    subtotal?: number;
    discount_amt?: number;
    tax_amount?: number;
    grand_total: number;
    amount_paid: number;
    amount_due: number;
    customer_name?: string | null;
    customer_phone?: string | null;
    lines?: any[];
  },
  phone?: string | null,
  storeName?: string
) {
  let fullInv = inv;
  if ((!inv.lines || inv.lines.length === 0) && inv.id) {
    try {
      const detail = await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: inv.id });
      if (detail && detail.lines) {
        fullInv = detail;
      }
    } catch { /* noop */ }
  }

  const text = buildInvoiceWhatsAppMessage(fullInv, storeName);
  let cleanPhone = (phone || fullInv.customer_phone || "").replace(/\D/g, "");
  if (cleanPhone.length === 10) {
    cleanPhone = "91" + cleanPhone;
  }
  const encodedText = encodeURIComponent(text);
  const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);

  // Direct desktop web.whatsapp.com avoids intermediate redirect page which strips newlines on desktop browsers
  const baseUrl = isMobile ? "https://api.whatsapp.com/send" : "https://web.whatsapp.com/send";
  const url = cleanPhone
    ? `${baseUrl}?phone=${cleanPhone}&text=${encodedText}`
    : `${baseUrl}?text=${encodedText}`;

  // 1. Try native backend URL opener (opens system browser or WhatsApp app directly on Android / iOS / Desktop)
  try {
    await invoke("shop_open_url", { url });
    return;
  } catch (tauriErr) {
    console.warn("[WhatsApp] shop_open_url fallback:", tauriErr);
  }

  // 2. Try Tauri plugin shell
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  } catch (err) {
    console.warn("[WhatsApp] plugin-shell fallback:", err);
  }

  // 3. Web fallback
  if (typeof window !== "undefined") {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
    }, 500);
  }
}

export interface InvoicePrintModalProps {
  open: Signal<boolean>;
  invoice: Signal<InvoiceDetail | null> | InvoiceDetail | null;
  storeName?: string;
  storeAddress?: string;
  storeCity?: string;
  storeState?: string;
  storeGstin?: string;
  storeDlNo?: string;
  storePhone?: string;
  storeEmail?: string;
  storePan?: string;
  terms?: string;
}

// ── Number to Words converter (Indian numbering system) ──────────────────────
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

// ── Helper to parse line_meta ────────────────────────────────────────────────
interface ParsedLineMeta {
  pack?: string;
  pack_size?: string;
  hsn_sac_code?: string;
  hsn?: string;
  resolved_hsn?: string;
  mfg_by?: string;
  brand_name?: string;
  batch_no?: string;
  expiry_date?: string;
  mrp?: number;
  free_qty?: number;
  cgst_pct?: number;
  sgst_pct?: number;
  igst_pct?: number;
  shelf_id?: string;
  shelf_location?: string;
  shelf?: string;
  discount2?: number;
  dis2?: number;
  extra_discount?: number;
  discount_pct?: number;
  dis1?: number;
}

function parseLineMeta(metaStr?: string | null): ParsedLineMeta {
  if (!metaStr) return {};
  try {
    return JSON.parse(metaStr) as ParsedLineMeta;
  } catch {
    return {};
  }
}

const STYLES = `
  .print-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(0, 0, 0, 0.8);
    backdrop-filter: blur(4px);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    padding: 1.25rem 1rem;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  .print-modal {
    background: var(--surface-1, #121214);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    width: 95vw;
    max-width: 1140px;
    height: 92vh;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
    margin: auto;
    overflow: hidden;
  }

  .modal-topbar {
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
  }

  .modal-topbar-row1 {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 1rem;
  }

  .topbar-title-group {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  .format-tabs-desktop {
    display: flex;
    gap: 0.375rem;
    background: var(--surface-3);
    padding: 0.25rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
  }

  .format-tabs-mobile {
    display: none;
  }

  .format-tab {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.35rem 0.75rem;
    font-size: 0.8125rem;
    font-weight: 600;
    border-radius: 0.375rem;
    border: none;
    cursor: pointer;
    background: transparent;
    color: var(--text-secondary);
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .format-tab.active {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  }

  .topbar-close-btn {
    height: 2rem;
    width: 2rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.375rem;
    flex-shrink: 0;
    transition: color 0.15s ease;
  }
  .topbar-close-btn:hover {
    color: var(--text-primary);
  }

  .modal-topbar-row2 {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.5rem;
    width: 100%;
  }

  .action-btn {
    height: 2rem;
    padding: 0 0.875rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 600;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    white-space: nowrap;
    width: auto;
  }

  .action-btn-header {
    background: var(--surface-3);
    color: var(--text-secondary);
    border: 1px solid var(--border);
    font-size: 0.75rem;
    padding: 0 0.65rem;
  }

  .action-btn-print {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    border: none;
  }

  .action-btn-pdf {
    background: var(--surface-3);
    color: var(--text-primary);
    border: 1px solid var(--border);
  }

  .action-btn-whatsapp {
    background: #25D366;
    color: #ffffff;
    border: none;
  }

  .thermal-select {
    height: 2rem;
    padding: 0 0.5rem;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-primary);
  }

  .preview-container {
    padding: 1.25rem;
    background: var(--surface-2, #18181b);
    display: block;
    overflow-x: auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1 1 auto;
    min-height: 420px;
    width: 100%;
    box-sizing: border-box;
  }

  .toast-banner {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: #059669;
    color: #ffffff;
    font-size: 0.8125rem;
    font-weight: 600;
    padding: 0.6rem 1.2rem;
    border-radius: 9999px;
    box-shadow: 0 10px 25px rgba(0,0,0,0.4);
    z-index: 10000;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translate(-50%, 10px); }
    to { opacity: 1; transform: translate(-50%, 0); }
  }

  @media (max-width: 640px) {
    .print-overlay {
      padding: 0 0.375rem;
    }
    .print-modal {
      border-radius: 0.5rem;
      margin: 2rem auto;
      max-width: 100vw;
      height: calc(100vh - 4rem);
      height: calc(100dvh - 4rem);
      max-height: calc(100vh - 4rem);
      max-height: calc(100dvh - 4rem);
    }
    .modal-topbar {
      padding: 0.625rem 0.75rem;
      gap: 0.5rem;
    }
    .format-tabs-desktop {
      display: none;
    }
    .format-tabs-mobile {
      display: flex;
      width: 100%;
      justify-content: space-between;
      gap: 0.25rem;
      background: var(--surface-3);
      padding: 0.25rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
    }
    .format-tab {
      flex: 1 1 0;
      justify-content: center;
      padding: 0.35rem 0.35rem;
      font-size: 0.75rem;
      gap: 0.25rem;
    }
    .modal-topbar-row2 {
      justify-content: space-between;
      gap: 0.375rem;
    }
    .action-btn {
      flex: 1 1 0;
      min-width: 0;
      padding: 0 0.35rem;
      font-size: 0.75rem;
    }
    .preview-container {
      padding: 0.75rem 0.375rem;
      display: block;
      overflow-x: auto;
      overflow-y: auto;
      flex: 1 1 auto;
      min-height: 0;
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
    .print-overlay {
      position: static !important;
      background: transparent !important;
      padding: 0 !important;
      overflow: visible !important;
      display: block !important;
      backdrop-filter: none !important;
    }
    .modal-topbar, .format-tabs, button, input, select {
      display: none !important;
    }
    .preview-container {
      background: transparent !important;
      padding: 0 !important;
      display: block !important;
      overflow: visible !important;
      min-height: auto !important;
    }
    .print-modal {
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      max-width: 100% !important;
      width: 100% !important;
      margin: 0 !important;
      overflow: visible !important;
    }
    #invoice-print-canvas, #invoice-print-canvas * {
      visibility: visible !important;
    }
    #invoice-print-canvas {
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

export const InvoicePrintModal = component$<InvoicePrintModalProps>((props) => {
  useStylesScoped$(STYLES);

  const activeFormat = useSignal<PrintFormat>("dotmatrix");
  const thermalWidth = useSignal<"80mm" | "58mm">("80mm");
  const showConfigDrawer = useSignal(false);
  const isDownloadingPdf = useSignal(false);
  const isPrinting = useSignal(false);
  const isOpeningWhatsApp = useSignal(false);
  const downloadToast = useSignal<string | null>(null);
  const einvoiceInfo = useSignal<any | null>(null);

  // Dynamic store details initialized with prop fallbacks
  const storeInfo = useSignal({
    name: props.storeName || "MY STORE",
    address: props.storeAddress || "",
    city: props.storeCity || "",
    state: props.storeState || "",
    dlNo: props.storeDlNo || "",
    phone: props.storePhone || "",
    gstin: props.storeGstin || "",
    pan: props.storePan || "",
    regime: "GST",
    terms: props.terms || "All Subject to Local Jurisdiction only. Goods once sold will not be taken back.",
    headerTopText: "[ OM ]",
    invoiceTitleText: "[ GST INVOICE ]",
    digitalSignUrl: "",
    signatoryName: "",
    jurisdictionCity: "",
    lutNumber: "",
    watermark: 1,
  });

  // Load GST Tax Config from backend automatically
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => props.open.value);
    if (!props.open.value) return;

    try {
      const cfg = await invoke<any>("fin_get_tax_config").catch(() => null);
      if (cfg) {
        storeInfo.value = {
          name: cfg.legal_name || props.storeName || "MY STORE",
          address: cfg.address || props.storeAddress || "",
          city: cfg.jurisdiction_city || props.storeCity || "",
          state: cfg.state_code || props.storeState || "",
          dlNo: cfg.dl_no || props.storeDlNo || "",
          phone: cfg.phone || props.storePhone || "",
          gstin: cfg.gstin || props.storeGstin || "",
          pan: cfg.pan || props.storePan || "",
          regime: cfg.regime || "GST",
          terms: cfg.invoice_terms || props.terms || "All Subject to Local Jurisdiction only. Goods once sold will not be taken back.",
          headerTopText: cfg.header_top_text || (cfg.regime === "None" ? "" : "[ OM ]"),
          invoiceTitleText: cfg.invoice_title_text || (cfg.regime === "None" ? "INVOICE / BILL" : "[ GST INVOICE ]"),
          digitalSignUrl: cfg.digital_sign_url || "",
          signatoryName: cfg.signatory_name || (cfg.legal_name ? `For: ${cfg.legal_name}` : "Authorized Signatory"),
          jurisdictionCity: cfg.jurisdiction_city || "Local",
          lutNumber: cfg.lut_number || "",
          watermark: cfg.watermark !== undefined ? cfg.watermark : 1,
        };

        if (cfg.default_bill_design && ["dotmatrix", "thermal", "standard"].includes(cfg.default_bill_design)) {
          activeFormat.value = cfg.default_bill_design as PrintFormat;
        }
      }

      // Check if this invoice has an associated e-invoice record
      const currentDocId = (props.invoice && typeof props.invoice === "object" && "value" in props.invoice)
        ? (props.invoice as Signal<InvoiceDetail | null>).value?.id
        : (props.invoice as InvoiceDetail | null)?.id;

      if (currentDocId) {
        try {
          const ei = await invoke<any>("fin_get_einvoice_status", { documentId: currentDocId });
          einvoiceInfo.value = ei || null;
        } catch {
          einvoiceInfo.value = null;
        }
      }
    } catch (e) {
      console.error("[InvoicePrintModal] Failed to load tax config:", e);
    }
  });

  const inv = (props.invoice && typeof props.invoice === "object" && "value" in props.invoice)
    ? (props.invoice as Signal<InvoiceDetail | null>).value
    : (props.invoice as InvoiceDetail | null);

  if (!inv) return null;

  const dateStr = new Date(inv.doc_date * 1000).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = new Date(inv.doc_date * 1000).toLocaleTimeString("en-IN", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });

  const grandTotal = inv.grand_total;
  const roundedTotal = Math.round(grandTotal);
  const wordsAmount = numberToWords(roundedTotal);

  // Gross Total, Discounts, Taxable Amount, Tax & Grand Total
  const grossTotal = (inv.lines && inv.lines.length > 0)
    ? inv.lines.reduce((sum, l) => sum + (l.unit_price * l.qty), 0)
    : ((inv.subtotal || 0) + (inv.discount_amt || 0));

  const lineDiscounts = (inv.lines && inv.lines.length > 0)
    ? inv.lines.reduce((sum, l) => sum + (l.discount_amt || (l.discount_pct > 0 ? (l.unit_price * l.qty * l.discount_pct / 100) : 0)), 0)
    : 0;

  const totalDiscount = Math.max(inv.discount_amt || 0, lineDiscounts);
  const totalAfterDiscount = Math.max(0, grossTotal - totalDiscount);

  // CGST & SGST Split
  const taxAmount = inv.tax_amount || 0;
  const halfTax = taxAmount / 2;
  const taxableVal = totalAfterDiscount > 0 ? totalAfterDiscount : (inv.subtotal > 0 ? inv.subtotal : (grandTotal - taxAmount));
  const avgGstRate = taxableVal > 0 ? ((taxAmount / taxableVal) * 100) : 0;
  const halfGstRate = (avgGstRate / 2).toFixed(1);

  // Customer values from invoice
  const custName = inv.customer_name || "COUNTER SALE / WALK-IN";
  const custAddr = inv.customer_address || (inv.customer_city ? `${inv.customer_city}${inv.customer_state ? `, ${inv.customer_state}` : ""}` : "");
  const custDlNo = inv.customer_dl_no || "";
  const custGstin = inv.customer_gstin || "";
  const custPan = inv.customer_pan || "";
  const custPhone = inv.customer_phone || "";
  const isTaxExempt = (storeInfo.value.regime || "").toLowerCase() === "none" || (storeInfo.value.regime || "").toLowerCase() === "exempt";

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

  // ── Native Print Handler ──────────────────────────────────────────────────
  const handlePrint = $(async () => {
    const printElement = (document.querySelector("#invoice-print-canvas .print-canvas") as HTMLElement) || document.getElementById("invoice-print-canvas");
    if (!printElement) {
      window.print();
      return;
    }

    isPrinting.value = true;
    try {
      const { pdfBase64, pdfBlob } = await generatePdfBlobAndDataUri(printElement);
      const fileName = `${inv.doc_number || "invoice"}.pdf`;

      // 1. Mobile (Android / iOS): Open native Print / Share Sheet
      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator !== "undefined" && typeof File !== "undefined") {
        try {
          const file = new File([pdfBlob], fileName, { type: "application/pdf" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Print Invoice ${inv.doc_number || ""}`,
              text: `Print Invoice ${inv.doc_number || ""}`,
            });
            return;
          }
        } catch (shareErr) {
          console.warn("[InvoicePrintModal] Mobile print/share sheet fallback:", shareErr);
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
        console.warn("[InvoicePrintModal] Tauri shop_open_pdf fallback:", tauriErr);
      }

      // 3. Desktop Web fallback
      window.print();
    } catch (err) {
      console.error("[InvoicePrintModal] Native print error:", err);
      window.print();
    } finally {
      isPrinting.value = false;
    }
  });

  const handleDownloadPdf = $(async () => {
    const printElement = (document.querySelector("#invoice-print-canvas .print-canvas") as HTMLElement) || document.getElementById("invoice-print-canvas");
    if (!printElement) return;
    isDownloadingPdf.value = true;
    try {
      const { pdfBase64, pdfBlob } = await generatePdfBlobAndDataUri(printElement);
      const fileName = `${inv.doc_number || "invoice"}.pdf`;

      // 1. Try Tauri Native Download (saves to public /storage/emulated/0/Download on Android or ~/Downloads on Desktop)
      try {
        const res = await invoke<{ file_path: string; file_name: string; directory: string }>("shop_download_pdf", {
          fileName,
          base64Data: pdfBase64,
        });
        if (res?.file_path) {
          downloadToast.value = `✓ Saved to Downloads (${res.file_name})`;
          setTimeout(() => { downloadToast.value = null; }, 4500);
          return;
        }
      } catch (tauriErr) {
        console.warn("[InvoicePrintModal] shop_download_pdf fallback:", tauriErr);
      }

      // 2. Mobile (Android / iOS): Save via Web Share Sheet file export
      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator !== "undefined" && typeof File !== "undefined") {
        try {
          const file = new File([pdfBlob], fileName, { type: "application/pdf" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Save Invoice ${inv.doc_number || ""}`,
              text: `Download Invoice ${inv.doc_number || ""}`,
            });
            return;
          }
        } catch (shareErr) {
          console.warn("[InvoicePrintModal] Mobile download/share sheet fallback:", shareErr);
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
      console.error("[InvoicePrintModal] PDF download error:", err);
    } finally {
      isDownloadingPdf.value = false;
    }
  });

  const handleWhatsApp = $(async () => {
    isOpeningWhatsApp.value = true;
    try {
      await openWhatsAppInvoice(inv, custPhone, storeInfo.value.name);
    } catch (e) {
      console.error("[InvoicePrintModal] WhatsApp launch error:", e);
    } finally {
      setTimeout(() => {
        isOpeningWhatsApp.value = false;
      }, 1500);
    }
  });

  return (
    <div class="print-overlay" onClick$={() => { props.open.value = false; }}>
      {downloadToast.value && (
        <div class="toast-banner">
          <span>{downloadToast.value}</span>
        </div>
      )}

      <div class="print-modal" onClick$={(e) => e.stopPropagation()}>
        {/* ── Modal Topbar ────────────────────────────────────────── */}
        <div class="modal-topbar">
          {/* Row 1: Invoice Title on Left + (3-Toggle Switcher & Close [X] on Right) */}
          <div class="modal-topbar-row1">
            <div class="topbar-title-group">
              <h2 style={{ margin: 0, fontSize: "0.9375rem", fontWeight: "700", color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                {inv.doc_number}
              </h2>
              <span style={{ fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "9999px", background: "var(--surface-3)", color: "var(--text-secondary)", fontWeight: "600", whiteSpace: "nowrap" }}>
                {fmtMoney(inv.grand_total)}
              </span>
            </div>

            {/* Desktop Right: All 3 toggle buttons + X close icon */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <div class="format-tabs-desktop">
                <button
                  type="button"
                  class={`format-tab ${activeFormat.value === "dotmatrix" ? "active" : ""}`}
                  onClick$={() => { activeFormat.value = "dotmatrix"; }}
                >
                  <LuBuilding style="width:0.875rem;height:0.875rem;flex-shrink:0;" />
                  <span>Dot Matrix / Pharma</span>
                </button>
                <button
                  type="button"
                  class={`format-tab ${activeFormat.value === "thermal" ? "active" : ""}`}
                  onClick$={() => { activeFormat.value = "thermal"; }}
                >
                  <LuReceipt style="width:0.875rem;height:0.875rem;flex-shrink:0;" />
                  <span>Thermal POS ({thermalWidth.value})</span>
                </button>
                <button
                  type="button"
                  class={`format-tab ${activeFormat.value === "standard" ? "active" : ""}`}
                  onClick$={() => { activeFormat.value = "standard"; }}
                >
                  <LuFileText style="width:0.875rem;height:0.875rem;flex-shrink:0;" />
                  <span>Standard Business (A4)</span>
                </button>
              </div>

              {/* Close [X] Button on the Far Right */}
              <button
                type="button"
                class="topbar-close-btn"
                onClick$={() => { props.open.value = false; }}
                title="Close modal"
              >
                <LuX style="width:1.25rem;height:1.25rem;" />
              </button>
            </div>
          </div>

          {/* Mobile Format Tabs Switcher */}
          <div class="format-tabs-mobile">
            <button
              type="button"
              class={`format-tab ${activeFormat.value === "dotmatrix" ? "active" : ""}`}
              onClick$={() => { activeFormat.value = "dotmatrix"; }}
            >
              <LuBuilding style="width:0.875rem;height:0.875rem;flex-shrink:0;" />
              <span>Dot Matrix</span>
            </button>
            <button
              type="button"
              class={`format-tab ${activeFormat.value === "thermal" ? "active" : ""}`}
              onClick$={() => { activeFormat.value = "thermal"; }}
            >
              <LuReceipt style="width:0.875rem;height:0.875rem;flex-shrink:0;" />
              <span>Thermal</span>
            </button>
            <button
              type="button"
              class={`format-tab ${activeFormat.value === "standard" ? "active" : ""}`}
              onClick$={() => { activeFormat.value = "standard"; }}
            >
              <LuFileText style="width:0.875rem;height:0.875rem;flex-shrink:0;" />
              <span>Standard</span>
            </button>
          </div>

          {/* Row 2: Contained action buttons (Header, Print, PDF, WhatsApp) */}
          <div class="modal-topbar-row2">
            {activeFormat.value === "thermal" && (
              <select
                value={thermalWidth.value}
                onChange$={(e) => { thermalWidth.value = (e.target as HTMLSelectElement).value as "80mm" | "58mm"; }}
                class="thermal-select"
              >
                <option value="80mm">80mm Roll</option>
                <option value="58mm">58mm Roll</option>
              </select>
            )}

            <button
              type="button"
              onClick$={() => { showConfigDrawer.value = !showConfigDrawer.value; }}
              title="Configure Store Header & Custom Texts"
              class="action-btn action-btn-header"
            >
              <LuSettings2 style="width:0.875rem;height:0.875rem;" />
              Header
            </button>

            <button
              type="button"
              onClick$={handlePrint}
              disabled={isPrinting.value}
              title="Print invoice on WiFi / Bluetooth / USB printer"
              class="action-btn action-btn-print"
            >
              {isPrinting.value ? (
                <LuLoader2 style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
              ) : (
                <LuPrinter style="width:0.875rem;height:0.875rem;" />
              )}
              {isPrinting.value ? "Opening…" : "Print"}
            </button>

            <button
              type="button"
              onClick$={handleDownloadPdf}
              disabled={isDownloadingPdf.value}
              title="Download invoice as PDF"
              class="action-btn action-btn-pdf"
            >
              {isDownloadingPdf.value ? (
                <LuLoader2 style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
              ) : (
                <LuDownload style="width:0.875rem;height:0.875rem;" />
              )}
              {isDownloadingPdf.value ? "Saving…" : "PDF"}
            </button>

            <button
              type="button"
              onClick$={handleWhatsApp}
              disabled={isOpeningWhatsApp.value}
              title="Share invoice on WhatsApp"
              class="action-btn action-btn-whatsapp"
            >
              {isOpeningWhatsApp.value ? (
                <LuLoader2 style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
              ) : (
                <WhatsAppIcon style={{ width: "0.9375rem", height: "0.9375rem" }} />
              )}
              {isOpeningWhatsApp.value ? "Opening…" : "WhatsApp"}
            </button>
          </div>
        </div>

        {/* ── Store Header Quick Configuration Drawer ────────────── */}
        {showConfigDrawer.value && (
          <div style={{ padding: "0.875rem 1.25rem", background: "var(--surface-2)", borderBottom: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0.625rem", fontSize: "0.75rem" }}>
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Top Inscription</label>
              <input
                type="text"
                value={storeInfo.value.headerTopText}
                onInput$={(e) => { storeInfo.value = { ...storeInfo.value, headerTopText: (e.target as HTMLInputElement).value }; }}
                placeholder="[ OM ]"
                style={{ width: "100%", height: "1.75rem", padding: "0 0.4rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Invoice Title</label>
              <input
                type="text"
                value={storeInfo.value.invoiceTitleText}
                onInput$={(e) => { storeInfo.value = { ...storeInfo.value, invoiceTitleText: (e.target as HTMLInputElement).value }; }}
                placeholder="[ GST INVOICE ]"
                style={{ width: "100%", height: "1.75rem", padding: "0 0.4rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Store / Firm Name</label>
              <input
                type="text"
                value={storeInfo.value.name}
                onInput$={(e) => { storeInfo.value = { ...storeInfo.value, name: (e.target as HTMLInputElement).value }; }}
                style={{ width: "100%", height: "1.75rem", padding: "0 0.4rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Address</label>
              <input
                type="text"
                value={storeInfo.value.address}
                onInput$={(e) => { storeInfo.value = { ...storeInfo.value, address: (e.target as HTMLInputElement).value }; }}
                style={{ width: "100%", height: "1.75rem", padding: "0 0.4rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
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
                style={{ width: "100%", height: "1.75rem", padding: "0 0.4rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>GSTIN</label>
              <input
                type="text"
                value={storeInfo.value.gstin}
                onInput$={(e) => { storeInfo.value = { ...storeInfo.value, gstin: (e.target as HTMLInputElement).value }; }}
                style={{ width: "100%", height: "1.75rem", padding: "0 0.4rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Drug License (D.L. No)</label>
              <input
                type="text"
                value={storeInfo.value.dlNo}
                onInput$={(e) => { storeInfo.value = { ...storeInfo.value, dlNo: (e.target as HTMLInputElement).value }; }}
                style={{ width: "100%", height: "1.75rem", padding: "0 0.4rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
              />
            </div>
            <div>
              <label style={{ display: "block", color: "var(--text-secondary)", marginBottom: "2px" }}>Phone / Mobile</label>
              <input
                type="text"
                value={storeInfo.value.phone}
                onInput$={(e) => { storeInfo.value = { ...storeInfo.value, phone: (e.target as HTMLInputElement).value }; }}
                style={{ width: "100%", height: "1.75rem", padding: "0 0.4rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.25rem", color: "var(--text-primary)", fontSize: "0.75rem" }}
              />
            </div>
          </div>
        )}

        {/* ── Document Preview Area ───────────────────────────────── */}
        <div class="preview-container">
          <div
            id="invoice-print-canvas"
            style={{
              width: "100%",
              margin: "0 auto",
              display: activeFormat.value === "thermal" ? "flex" : "block",
              justifyContent: activeFormat.value === "thermal" ? "center" : undefined,
              minWidth: activeFormat.value === "thermal" ? "240px" : "max-content",
            }}
          >

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* FORMAT 1: DOT MATRIX / PHARMA CONTINUOUS FEED TRACTOR PAPER */}
            {/* ══════════════════════════════════════════════════════════════ */}
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
                {/* Main Dot Matrix Content Canvas */}
                <div style={{ width: "100%" }}>
                  {inv.status === "draft" && (
                    <div style={{ textAlign: "center", color: "#dc2626", fontWeight: "bold", fontSize: "11px", letterSpacing: "1px", border: "1px dashed #dc2626", padding: "3px", marginBottom: "6px" }}>
                      *** DRAFT INVOICE — FOR REVIEW ONLY (NOT A TAX INVOICE) ***
                    </div>
                  )}

                  {/* Top header title */}
                  <div style={{ textAlign: "center", marginBottom: "6px" }}>
                    {storeInfo.value.headerTopText && (
                      <div style={{ fontWeight: "bold", fontSize: "11px", letterSpacing: "2px" }}>
                        {storeInfo.value.headerTopText}
                      </div>
                    )}
                    <div style={{ fontWeight: "bold", fontSize: "12px", letterSpacing: "1.5px" }}>
                      {inv.status === "draft" ? "[ DRAFT ESTIMATE / BILL ]" : (storeInfo.value.invoiceTitleText || "[ GST INVOICE ]")}
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
                        To : {custName.toUpperCase()}
                      </div>
                      {custAddr && <div>   : {custAddr.toUpperCase()}</div>}
                      {!isTaxExempt && <div>DLNO:{custDlNo ? custDlNo : "—"}</div>}
                      {!isTaxExempt && <div>GST :{custGstin ? custGstin : "—"}</div>}
                      {!isTaxExempt && <div>PAN :{custPan ? custPan : "—"}</div>}
                      {custPhone ? <div>PH  :{custPhone}</div> : null}
                    </div>

                    {/* Document details */}
                    <div>
                      <div><span style={{ fontWeight: "bold" }}>B.No:</span>{inv.doc_number}</div>
                      <div><span style={{ fontWeight: "bold" }}>Date:</span>{dateStr}</div>
                      <div><span style={{ fontWeight: "bold" }}>Time:</span>{timeStr}</div>
                      <div style={{ fontWeight: "bold", marginTop: "4px" }}>
                        {inv.payment_mode ? inv.payment_mode.toUpperCase() : "CASH"}
                      </div>
                    </div>
                  </div>

                  {/* Top Thin Solid Line above Table */}
                  <div style={{ borderTop: "1px solid #333", margin: "5px 0 3px 0" }} />

                  {/* Dot Matrix Table with Vertically Centered Headers & Explicit Pipe Column Dividers */}
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
                      {/* Physical thin solid separator row below header with balanced margins */}
                      <tr>
                        <td colSpan={isTaxExempt ? 16 : 18} style={{ padding: "0" }}>
                          <div style={{ borderTop: "1px solid #333", margin: "4px 0 6px 0" }} />
                        </td>
                      </tr>
                    </thead>
                    <tbody>
                      {inv.lines.map((line: InvoiceLine, idx: number) => {
                        const meta = parseLineMeta(line.line_meta);
                        const shelf = meta.shelf_id || meta.shelf_location || meta.shelf || (line as any).shelf_location || (line as any).shelf_id || "—";
                        const pack = meta.pack || meta.pack_size || line.pack_size || (line as any).pack || "—";
                        const hsn = (line as any).hsn_sac_code || (line as any).resolved_hsn || (line as any).hsn || meta.hsn_sac_code || meta.hsn || meta.resolved_hsn || "—";
                        const mfg = meta.mfg_by || meta.brand_name || (line as any).brand_name || (line as any).mfg_by || "—";
                        const batch = meta.batch_no || "—";
                        const exp = meta.expiry_date || "—";
                        const mrp = meta.mrp ? meta.mrp.toFixed(2) : line.unit_price.toFixed(2);
                        const freeQty = meta.free_qty ? String(meta.free_qty) : (line.free_qty ? String(line.free_qty) : "");

                        let snapshotDisc2 = 0;
                        if ((line as any).pricing_snapshot) {
                          try {
                            const snap = typeof (line as any).pricing_snapshot === "string"
                              ? JSON.parse((line as any).pricing_snapshot)
                              : (line as any).pricing_snapshot;
                            if (snap?.discount2) snapshotDisc2 = Number(snap.discount2);
                          } catch { /* noop */ }
                        }

                        const dis2Val = Number(
                          meta.discount2 ??
                          meta.dis2 ??
                          meta.extra_discount ??
                          snapshotDisc2 ??
                          (line as any).discount2 ??
                          (line as any).extra_discount ??
                          0
                        );

                        const dis1Val = meta.discount_pct !== undefined
                          ? Number(meta.discount_pct)
                          : (meta.dis1 !== undefined
                            ? Number(meta.dis1)
                            : (dis2Val > 0 ? Math.max(0, line.discount_pct - dis2Val) : line.discount_pct));

                        const discVal = dis1Val > 0
                          ? `${dis1Val.toFixed(dis1Val % 1 === 0 ? 0 : 1)}%`
                          : (line.discount_amt > 0 && dis2Val === 0 ? line.discount_amt.toFixed(2) : "0.00");

                        const dis2Str = dis2Val > 0
                          ? `${dis2Val.toFixed(dis2Val % 1 === 0 ? 0 : 1)}%`
                          : "0.00";

                        const lineGross = line.unit_price * line.qty;
                        const totalDiscPct = dis1Val + dis2Val;
                        const lineDiscTotal = totalDiscPct > 0
                          ? (lineGross * totalDiscPct / 100)
                          : (line.discount_amt > 0 && dis2Val === 0 ? line.discount_amt : 0);
                        const lineNet = Math.max(0, lineGross - lineDiscTotal);
                        const rateAD = line.qty > 0 ? (lineNet / line.qty) : (totalDiscPct > 0 ? line.unit_price * (1 - totalDiscPct / 100) : line.unit_price);

                        const lineCgstPct = meta.cgst_pct !== undefined ? meta.cgst_pct.toFixed(1) : halfGstRate;
                        const lineSgstPct = meta.sgst_pct !== undefined ? meta.sgst_pct.toFixed(1) : halfGstRate;

                        return (
                          <tr key={line.id || idx} style={{ verticalAlign: "middle" }}>
                            <td style={{ padding: "5px 3px", fontWeight: "bold", maxWidth: "105px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle" }}>
                              {(line.description || line.item_id).toUpperCase()}
                            </td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{shelf}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{pack}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{hsn}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{mfg}</td>
                            <td style={{ padding: "5px 2px", borderLeft: "1px dashed #888", verticalAlign: "middle", whiteSpace: "nowrap" }}>{batch}</td>
                            <td style={{ padding: "5px 2px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{line.qty}</td>
                            <td style={{ padding: "5px 2px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{freeQty}</td>
                            <td style={{ padding: "5px 2px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{line.unit_price.toFixed(2)}</td>
                            <td style={{ padding: "5px 2px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{lineGross.toFixed(2)}</td>
                            <td style={{ padding: "5px 2px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{discVal}</td>
                            <td style={{ padding: "5px 2px", textAlign: "right", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{dis2Str}</td>
                            <td style={{ padding: "5px 2px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{rateAD.toFixed(2)}</td>
                            <td style={{ padding: "5px 2px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{lineNet.toFixed(2)}</td>
                            {!isTaxExempt && (
                              <>
                                <td style={{ padding: "5px 2px", textAlign: "right", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{lineCgstPct}</td>
                                <td style={{ padding: "5px 2px", textAlign: "right", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{lineSgstPct}</td>
                              </>
                            )}
                            <td style={{ padding: "5px 2px", textAlign: "right", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{mrp}</td>
                            <td style={{ padding: "5px 2px", textAlign: "right", borderLeft: "1px dashed #888", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{exp}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Dotted/Dashed Line below all item list */}
                  <div style={{ borderTop: "1px dashed #000", margin: "6px 0 8px 0" }} />

                  {/* Dot Matrix Summary Footer */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px", fontSize: "9.5px", lineHeight: "1.3" }}>
                    {/* Left Bottom: Terms & Conditions + Tax Split + In Words */}
                    <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: "bold", marginBottom: "2px" }}>Terms & Conditions:-</div>
                        <div style={{ fontSize: "9px", marginBottom: "3px" }}>
                          1.)All Subject to {storeInfo.value.jurisdictionCity || storeInfo.value.city.split("-")[0] || "Local"} Jurisdiction only.
                        </div>
                        {storeInfo.value.dlNo ? (
                          <div style={{ fontSize: "8.5px", marginBottom: "4px", lineHeight: "1.25" }}>
                            N.B.On the assurance of the party that he has got a valid DLno or He is RMP we are Executing Indent[Sec-18,Drug & Cosmetic Act,1940].
                          </div>
                        ) : null}
                        {storeInfo.value.terms ? (
                          <div style={{ fontSize: "8.5px", marginBottom: "4px", lineHeight: "1.2" }}>
                            {storeInfo.value.terms}
                          </div>
                        ) : null}

                        {/* Tax breakdown */}
                        {!isTaxExempt && taxAmount > 0 ? (
                          <div style={{ fontSize: "9.5px", fontWeight: "bold", marginTop: "4px" }}>
                            <div>CGST {halfGstRate}% on {totalAfterDiscount.toFixed(2)} = {halfTax.toFixed(2)}</div>
                            <div>SGST {halfGstRate}% on {totalAfterDiscount.toFixed(2)} = {halfTax.toFixed(2)}</div>
                          </div>
                        ) : (inv.customer_gst_supply_type && inv.customer_gst_supply_type !== "regular") ? (
                          <div style={{ fontSize: "8.5px", fontWeight: "bold", border: "1px dashed #000", padding: "3px 4px", margin: "4px 0", lineHeight: "1.2" }}>
                            SUPPLY MEANT FOR EXPORT/SEZ UNDER LETTER OF UNDERTAKING ({storeInfo.value.lutNumber ? `LUT: ${storeInfo.value.lutNumber}` : "LUT ON FILE"}) WITHOUT PAYMENT OF INTEGRATED TAX
                          </div>
                        ) : null}
                      </div>

                      {/* In Words */}
                      <div style={{ marginTop: "6px", fontWeight: "bold", fontSize: "10px" }}>
                        Rupees: {wordsAmount} Only
                      </div>
                    </div>

                    {/* Right Bottom: Totals & Signature */}
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      {/* Upper Totals Block WITH Left Divider (Stops at NetAmount) */}
                      <div style={{ borderLeft: "1px dashed #777", paddingLeft: "8px", display: "flex", flexDirection: "column", gap: "2px", fontSize: "9.5px" }}>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ width: "96px" }}>TOTAL :</span>
                          <span style={{ width: "64px", textAlign: "right", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>{grossTotal.toFixed(2)}</span>
                          <span style={{ marginLeft: "8px", fontSize: "9px", color: "#333", flex: 1, whiteSpace: "nowrap" }}># {inv.lines.length} ITEMS Cases No</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ width: "96px" }}>DISCOUNT :</span>
                          <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{totalDiscount > 0 ? totalDiscount.toFixed(2) : "0.00"}</span>
                          <span style={{ marginLeft: "8px", fontSize: "9px", color: "#333", flex: 1, whiteSpace: "nowrap" }}># {inv.doc_number}</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center" }}>
                          <span style={{ width: "96px" }}>TOTAL AFT DISC:</span>
                          <span style={{ width: "64px", textAlign: "right", fontWeight: "bold", fontVariantNumeric: "tabular-nums" }}>{totalAfterDiscount.toFixed(2)}</span>
                        </div>
                        {!isTaxExempt && taxAmount > 0 && (
                          <>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ width: "96px" }}>ADD CGST :</span>
                              <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{halfTax.toFixed(2)}</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <span style={{ width: "96px" }}>ADD SGST :</span>
                              <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{halfTax.toFixed(2)}</span>
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

                        {/* NetAmount without top/bottom horizontal lines */}
                        <div style={{ display: "flex", alignItems: "center", fontWeight: "bold", marginTop: "3px" }}>
                          <span style={{ width: "96px" }}>NetAmount:</span>
                          <span style={{ width: "64px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{grandTotal.toFixed(2)}</span>
                        </div>
                      </div>

                      {/* Lower Block WITHOUT Left Divider (Rounded a bit more below + bigger text) */}
                      <div style={{ paddingLeft: "8px", marginTop: "14px" }}>
                        <div style={{ display: "flex", alignItems: "center", fontWeight: "bold", fontSize: "14px" }}>
                          <span style={{ width: "84px" }}>(Rounded):</span>
                          <span style={{ width: "76px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{roundedTotal.toFixed(2)}</span>
                        </div>

                        {/* Signature Block */}
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
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* FORMAT 2: THERMAL POS RECEIPT (80mm / 58mm VERTICAL ROLL)   */}
            {/* ══════════════════════════════════════════════════════════════ */}
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
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: "8px" }}>
                  {inv.status === "draft" && (
                    <div style={{ fontSize: "11px", fontWeight: "900", color: "#dc2626", border: "1px dashed #dc2626", padding: "2px", marginBottom: "4px" }}>
                      *** DRAFT RECEIPT / ESTIMATE ***
                    </div>
                  )}
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
                    <span>Bill: <strong>{inv.doc_number}</strong></span>
                    <span>{dateStr} {timeStr}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Cust: {custName}</span>
                    <span>Pay: {inv.payment_mode ? inv.payment_mode.toUpperCase() : "CASH"}</span>
                  </div>
                  {custPhone && (
                    <div>Ph: {custPhone}</div>
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
                    {inv.lines.map((line: InvoiceLine, idx: number) => {
                      const lineTot = line.line_total || (line.unit_price * line.qty);
                      return (
                        <tr key={line.id || idx}>
                          <td style={{ padding: "5px 0 4px 0", maxWidth: "120px", wordBreak: "break-word" }}>
                            {line.description || line.item_id}
                          </td>
                          <td style={{ textAlign: "right", padding: "5px 0 4px 0" }}>{line.qty}</td>
                          <td style={{ textAlign: "right", padding: "5px 0 4px 0" }}>{line.unit_price.toFixed(2)}</td>
                          <td style={{ textAlign: "right", padding: "5px 0 4px 0", fontWeight: "bold" }}>{lineTot.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ borderTop: "1px dashed #000", margin: "6px 0 8px 0" }} />

                {/* Totals */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "10.5px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Total (Gross):</span>
                    <span>{grossTotal.toFixed(2)}</span>
                  </div>
                  {totalDiscount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span>Discount:</span>
                      <span>−{totalDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {totalDiscount > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "600" }}>
                      <span>Total After Disc:</span>
                      <span>{totalAfterDiscount.toFixed(2)}</span>
                    </div>
                  )}
                  {!isTaxExempt && taxAmount > 0 ? (
                    <>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>CGST ({halfGstRate}%):</span>
                        <span>{halfTax.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between" }}>
                        <span>SGST ({halfGstRate}%):</span>
                        <span>{halfTax.toFixed(2)}</span>
                      </div>
                    </>
                  ) : (inv.customer_gst_supply_type && inv.customer_gst_supply_type !== "regular") ? (
                    <div style={{ fontSize: "8px", fontWeight: "bold", border: "1px dashed #000", padding: "2px 0", textAlign: "center", margin: "2px 0" }}>
                      ZERO-RATED UNDER LUT (NO IGST)
                    </div>
                  ) : null}
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", fontWeight: "900", borderTop: "1px dashed #000", borderBottom: "1px dashed #000", padding: "4px 0", margin: "3px 0" }}>
                    <span>TOTAL:</span>
                    <span>{fmtMoney(roundedTotal)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span>Paid ({inv.payment_mode?.toUpperCase() || "CASH"}):</span>
                    <span>{fmtMoney(inv.amount_paid || roundedTotal)}</span>
                  </div>
                  {inv.amount_due > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "#dc2626", fontWeight: "bold" }}>
                      <span>Due Balance:</span>
                      <span>{fmtMoney(inv.amount_due)}</span>
                    </div>
                  )}
                </div>

                {/* Thermal Footer */}
                <div style={{ textAlign: "center", marginTop: "14px", borderTop: "1px dashed #000", paddingTop: "8px", fontSize: "9.5px" }}>
                  <div style={{ fontWeight: "bold" }}>*** THANK YOU! VISIT AGAIN ***</div>
                  <div style={{ marginTop: "4px" }}>Item count: {inv.lines.length}</div>
                  <div style={{ marginTop: "4px", fontSize: "8.5px", color: "#444" }}>
                    {storeInfo.value.terms || "Goods once sold will not be returned."}
                  </div>
                  {storeInfo.value.watermark !== 0 && (
                    <div style={{ marginTop: "6px", fontSize: "8px", color: "#666", letterSpacing: "0.4px" }}>
                      Bill Generated on BusinessKit App
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════ */}
            {/* FORMAT 3: CLASSIC MODERN BUSINESS INVOICE (A4 / FULL PAGE)   */}
            {/* ══════════════════════════════════════════════════════════════ */}
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
                  boxShadow: "0 10px 25px rgba(0,0,0,0.3)",
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

                  {einvoiceInfo.value && (
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", padding: "6px 10px", border: "1px solid #111827", borderRadius: "4px", background: "#f9fafb", margin: "0 12px" }}>
                      <QRCodeView value={einvoiceInfo.value.qr_code || einvoiceInfo.value.irn} size={64} />
                      <div style={{ fontSize: "9px", color: "#111827", maxWidth: "160px", lineHeight: "1.3" }}>
                        <div style={{ fontWeight: "800", textTransform: "uppercase", fontSize: "9.5px", color: "#10b981" }}>✓ E-INVOICE SIGNED</div>
                        {einvoiceInfo.value.ack_number && <div>Ack: <strong>{einvoiceInfo.value.ack_number}</strong></div>}
                        <div style={{ fontFamily: "monospace", fontSize: "7.5px", wordBreak: "break-all", marginTop: "2px", color: "#4b5563" }}>
                          IRN: {einvoiceInfo.value.irn.slice(0, 16)}...{einvoiceInfo.value.irn.slice(-8)}
                        </div>
                      </div>
                    </div>
                  )}

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "20px", fontWeight: "900", color: inv.status === "draft" ? "#2563eb" : "#111827", letterSpacing: "-0.02em", textTransform: "uppercase" }}>
                      {inv.status === "draft" ? "DRAFT INVOICE" : (storeInfo.value.invoiceTitleText || "TAX INVOICE")}
                    </div>
                    <div style={{ marginTop: "6px", fontSize: "11px", color: "#4b5563" }}>
                      <div>Invoice No: <strong style={{ color: "#111827" }}>{inv.doc_number}</strong></div>
                      <div>Date: <strong style={{ color: "#111827" }}>{dateStr}</strong></div>
                      <div>Status: <span style={{ textTransform: "uppercase", fontWeight: "700", color: inv.status === "confirmed" ? "#10b981" : (inv.status === "draft" ? "#2563eb" : "#4b5563"), background: inv.status === "draft" ? "rgba(59,130,246,0.12)" : "transparent", padding: inv.status === "draft" ? "1px 6px" : "0", borderRadius: "3px" }}>{inv.status}</span></div>
                    </div>
                  </div>
                </div>

                {/* Draft Banner for Standard A4 */}
                {inv.status === "draft" && (
                  <div style={{ margin: "10px 0 0 0", padding: "6px 12px", background: "#eff6ff", border: "1px dashed #3b82f6", borderRadius: "4px", fontSize: "11px", color: "#1d4ed8", fontWeight: "600", textAlign: "center" }}>
                    ⚠️ DRAFT COPY — FOR REVIEW ONLY (NOT A VALID GST TAX INVOICE)
                  </div>
                )}

                {/* Billed To */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "20px", padding: "16px 0", borderBottom: "1px solid #e5e7eb" }}>
                  <div>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                      Billed To
                    </div>
                    <div style={{ fontSize: "13px", fontWeight: "700", color: "#111827" }}>
                      {inv.customer_name || "Walk-in Customer"}
                    </div>
                    {inv.customer_address && (
                      <div style={{ fontSize: "11px", color: "#4b5563", marginTop: "2px" }}>{inv.customer_address}</div>
                    )}
                    {(inv.customer_city || inv.customer_state) && (
                      <div style={{ fontSize: "11px", color: "#4b5563" }}>{inv.customer_city} {inv.customer_state}</div>
                    )}
                    {inv.customer_phone && (
                      <div style={{ fontSize: "11px", color: "#4b5563" }}>Phone: {inv.customer_phone}</div>
                    )}
                    {!isTaxExempt && inv.customer_gstin && (
                      <div style={{ fontSize: "11px", color: "#111827", marginTop: "2px" }}>GSTIN: <strong>{inv.customer_gstin}</strong></div>
                    )}
                  </div>

                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: "10px", fontWeight: "700", color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "4px" }}>
                      Payment Details
                    </div>
                    <div style={{ fontSize: "11px", color: "#4b5563", lineHeight: "1.4" }}>
                      <div>Payment Mode: <strong style={{ textTransform: "uppercase", color: "#111827" }}>{inv.payment_mode || "CASH"}</strong></div>
                      <div>Grand Total: <strong style={{ color: "#111827" }}>{fmtMoney(roundedTotal)}</strong></div>
                      <div>Amount Paid: <strong style={{ color: "#10b981" }}>{fmtMoney(inv.amount_paid || roundedTotal)}</strong></div>
                      {inv.amount_due > 0 && (
                        <div style={{ color: "#dc2626", fontWeight: "700" }}>Balance Due: {fmtMoney(inv.amount_due)}</div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Statutory Export / SEZ Notice if zero-rated */}
                {inv.customer_gst_supply_type && inv.customer_gst_supply_type !== "regular" && (
                  <div style={{ margin: "12px 0 6px 0", padding: "8px 12px", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "4px", fontSize: "11px", color: "#1e40af" }}>
                    <strong>Statutory Declaration:</strong> Supply meant for export/SEZ under bond or Letter of Undertaking ({storeInfo.value.lutNumber ? `LUT ARN: ${storeInfo.value.lutNumber}` : "LUT on file with GST department"}) without payment of integrated tax.
                  </div>
                )}

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
                    {inv.lines.map((line: InvoiceLine, idx: number) => {
                      const meta = parseLineMeta(line.line_meta);
                      let snapshotDisc2 = 0;
                      if ((line as any).pricing_snapshot) {
                        try {
                          const snap = typeof (line as any).pricing_snapshot === "string"
                            ? JSON.parse((line as any).pricing_snapshot)
                            : (line as any).pricing_snapshot;
                          if (snap?.discount2) snapshotDisc2 = Number(snap.discount2);
                        } catch { /* noop */ }
                      }
                      const d2 = Number(
                        meta.discount2 ??
                        meta.dis2 ??
                        meta.extra_discount ??
                        snapshotDisc2 ??
                        (line as any).discount2 ??
                        (line as any).extra_discount ??
                        0
                      );
                      const d1 = meta.discount_pct !== undefined
                        ? Number(meta.discount_pct)
                        : (meta.dis1 !== undefined
                          ? Number(meta.dis1)
                          : (d2 > 0 ? Math.max(0, line.discount_pct - d2) : line.discount_pct));

                      const discText = (d1 > 0 && d2 > 0)
                        ? `${d1.toFixed(d1 % 1 === 0 ? 0 : 1)}%+${d2.toFixed(d2 % 1 === 0 ? 0 : 1)}%`
                        : (d1 > 0
                          ? `${d1.toFixed(d1 % 1 === 0 ? 0 : 1)}%`
                          : (d2 > 0
                            ? `${d2.toFixed(d2 % 1 === 0 ? 0 : 1)}%`
                            : (line.discount_pct > 0 ? `${line.discount_pct}%` : "—")));

                      const packStr = line.pack_size || meta.pack_size || meta.pack;
                      const hsnStr = (line as any).hsn_sac_code || (line as any).resolved_hsn || (line as any).hsn || meta.hsn_sac_code || meta.hsn || meta.resolved_hsn;
                      const subDetails = [packStr ? `Pack: ${packStr}` : null, hsnStr ? `HSN: ${hsnStr}` : null].filter(Boolean).join("  •  ");

                      return (
                        <tr key={line.id || idx} style={{ borderBottom: "1px solid #f3f4f6" }}>
                          <td style={{ padding: "10px 10px", color: "#6b7280", verticalAlign: "middle", lineHeight: "1.2" }}>{idx + 1}</td>
                          <td style={{ padding: "10px 10px", fontWeight: "600", color: "#111827", verticalAlign: "middle", lineHeight: "1.2" }}>
                            <div>{line.description || line.item_id}</div>
                            {subDetails && (
                              <div style={{ fontSize: "9.5px", color: "#6b7280", fontWeight: "normal", marginTop: "2px" }}>
                                {subDetails}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: "10px 10px", textAlign: "right", color: "#374151", verticalAlign: "middle", lineHeight: "1.2" }}>{line.qty}</td>
                          <td style={{ padding: "10px 10px", textAlign: "right", color: "#374151", verticalAlign: "middle", lineHeight: "1.2" }}>{fmtMoney(line.unit_price)}</td>
                          <td style={{ padding: "10px 10px", textAlign: "right", color: (d1 > 0 || d2 > 0 || line.discount_pct > 0) ? "#10b981" : "#9ca3af", fontWeight: (d1 > 0 || d2 > 0) ? "600" : "normal", verticalAlign: "middle", lineHeight: "1.2" }}>
                            {discText}
                          </td>
                          {!isTaxExempt && (
                            <td style={{ padding: "10px 10px", textAlign: "right", color: line.tax_amount > 0 ? "#f59e0b" : "#9ca3af", verticalAlign: "middle", lineHeight: "1.2" }}>
                              {line.tax_amount > 0 ? fmtMoney(line.tax_amount) : "0%"}
                            </td>
                          )}
                          <td style={{ padding: "10px 10px", textAlign: "right", fontWeight: "700", color: "#111827", verticalAlign: "middle", lineHeight: "1.2" }}>
                            {fmtMoney(line.line_total)}
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
                      {wordsAmount} Rupees Only
                    </div>

                    <div style={{ marginTop: "14px", fontSize: "11px", color: "#6b7280" }}>
                      <strong>Terms & Conditions:</strong>
                      <div style={{ marginTop: "2px" }}>{storeInfo.value.terms}</div>
                    </div>
                  </div>

                  <div style={{ background: "#f9fafb", border: "1px solid #e5e7eb", borderRadius: "6px", padding: "10px 14px", display: "flex", flexDirection: "column", gap: "5px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", lineHeight: "1.2" }}>
                      <span style={{ color: "#6b7280" }}>Subtotal (Gross):</span>
                      <span style={{ fontWeight: "600" }}>{fmtMoney(grossTotal)}</span>
                    </div>
                    {totalDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#10b981", lineHeight: "1.2" }}>
                        <span>Total Discount:</span>
                        <span>−{fmtMoney(totalDiscount)}</span>
                      </div>
                    )}
                    {totalDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", lineHeight: "1.2" }}>
                        <span style={{ color: "#6b7280" }}>Total After Discount:</span>
                        <span style={{ fontWeight: "600" }}>{fmtMoney(totalAfterDiscount)}</span>
                      </div>
                    )}
                    {!isTaxExempt && taxAmount > 0 && (
                      <>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#4b5563", lineHeight: "1.2" }}>
                          <span>CGST ({halfGstRate}%):</span>
                          <span>{fmtMoney(halfTax)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", color: "#4b5563", lineHeight: "1.2" }}>
                          <span>SGST ({halfGstRate}%):</span>
                          <span>{fmtMoney(halfTax)}</span>
                        </div>
                      </>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "2px solid #e5e7eb", paddingTop: "6px", marginTop: "3px", fontSize: "15px", fontWeight: "800", color: "#111827", lineHeight: "1.2" }}>
                      <span>Grand Total:</span>
                      <span>{fmtMoney(roundedTotal)}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "11px", color: "#6b7280", lineHeight: "1.2" }}>
                      <span>Amount Paid:</span>
                      <span>{fmtMoney(inv.amount_paid || roundedTotal)}</span>
                    </div>
                    {inv.amount_due > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "12px", fontWeight: "700", color: "#ef4444", lineHeight: "1.2" }}>
                        <span>Balance Due:</span>
                        <span>{fmtMoney(inv.amount_due)}</span>
                      </div>
                    )}
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

          </div>
        </div>
      </div>
    </div>
  );
});

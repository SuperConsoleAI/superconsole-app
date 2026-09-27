// src/components/shop/PurchaseInvoiceView.tsx
//
// WHAT: Multi-Format Purchase Invoice / Goods Receipt Preview & Print Modal.
//       Supports 3 formats:
//         1. Dot Matrix / Tractor Feed Continuous Paper Format (Pharma / Wholesale)
//         2. Thermal POS Receipt (80mm & 58mm roll with selector)
//         3. Standard Business A4 Modern Clean GST Purchase Bill Format
//       Features:
//         - Mobile slide-in animation & responsive tabs matching InvoicePrintModal
//         - Top action bar (Format switchers, Thermal roll selector, Print, PDF, WhatsApp, Close)
//         - Sticky bottom action bar with prominent "Download Invoice PDF" button
//         - Native PDF generation & direct system printing via Tauri / Web Print
//         - Strictly aligned with ReceiveStockSlideOver.tsx schema & pricing snapshot

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
  LuPrinter,
  LuDownload,
  LuLoader2,
  LuX,
  LuReceipt,
  LuFileText,
  LuBuilding,
  LuImage,
  LuExternalLink,
} from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { fmtMoney } from "~/lib/fin-format";
import { WhatsAppIcon } from "./InvoicePrintModal";
import type { MediaItem } from "~/components/media/MediaPickerModal";

export type PurchasePrintFormat = "dotmatrix" | "thermal" | "standard" | "original";

export interface PurchaseLineDetail {
  id: string;
  item_id: string;
  item_name: string;
  qty: number;
  free_qty?: number | null;
  cost?: number | null;
  unit_price?: number | null;
  selling_price?: number | null;
  mrp?: number | null;
  pack_size?: string | null;
  conversion_factor?: number | null;
  scheme_on?: number | null;
  scheme_free?: number | null;
  batch_no?: string | null;
  expiry_date?: string | number | null;
  shelf_location?: string | null;
  pricing_snapshot?: string | any | null;
  line_total?: number | null;
  hsn_sac_code?: string | null;
  brand_name?: string | null;
}

export interface PurchaseInvoiceData {
  id: string;
  doc_number: string;
  ref_number?: string | null;
  doc_date: number;
  vendor_bill_date?: number | null;
  status: string;
  subtotal: number;
  cash_discount_pct?: number;
  cash_discount_amt?: number;
  inward_expense?: number;
  grand_total: number;
  amount_paid: number;
  amount_due: number;
  payment_method?: string | null;
  warehouse_id?: string | null;
  warehouse_name?: string | null;
  vendor_id?: string | null;
  vendor_name?: string | null;
  vendor_phone?: string | null;
  vendor_email?: string | null;
  vendor_gstin?: string | null;
  vendor_pan?: string | null;
  vendor_address?: string | null;
  vendor_city?: string | null;
  vendor_state?: string | null;
  vendor_country?: string | null;
  vendor_dl_no?: string | null;
  line_count?: number;
  total_qty?: number;
  notes?: string | null;
  created_at?: number;
  transaction_id?: string | null;
  transporter_name?: string | null;
  lr_number?: string | null;
  vehicle_number?: string | null;
  media_id?: string | null;
  lines: PurchaseLineDetail[];
}

export interface PurchaseInvoiceViewProps {
  open: Signal<boolean>;
  receipt?: Signal<PurchaseInvoiceData | null> | PurchaseInvoiceData | null;
  docId?: Signal<string | null> | string | null;
  onClose$?: PropFunction<() => void>;
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
    animation: fadeInOverlay 0.2s ease-out;
  }

  @keyframes fadeInOverlay {
    from { opacity: 0; }
    to { opacity: 1; }
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
    animation: modalSlideUp 0.25s ease-out;
  }

  @keyframes modalSlideUp {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .modal-topbar {
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 0.625rem;
    box-sizing: border-box;
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
    min-width: 0;
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
    flex-wrap: wrap;
  }

  .thermal-select {
    height: 2rem;
    padding: 0 0.5rem;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    font-size: 0.75rem;
    color: var(--text-primary);
    cursor: pointer;
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

  .preview-container {
    padding: 1.25rem;
    background: var(--surface-2, #18181b);
    display: block;
    overflow-x: auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    box-sizing: border-box;
  }

  .preview-container.is-original {
    padding: 1rem;
  }

  #purchase-invoice-print-canvas {
    width: 100%;
    margin: 0 auto;
  }

  .bottom-action-bar {
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .toast-banner {
    position: fixed;
    bottom: 1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: #10b981;
    color: #ffffff;
    padding: 0.625rem 1.25rem;
    border-radius: 9999px;
    font-size: 0.875rem;
    font-weight: 600;
    box-shadow: 0 10px 25px rgba(0,0,0,0.4);
    z-index: 10001;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    animation: toastSlideUp 0.2s ease-out;
  }

  @keyframes toastSlideUp {
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
      background: var(--surface-3);
      padding: 0.25rem;
      border-radius: 0.5rem;
      border: 1px solid var(--border);
      gap: 0.25rem;
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
      min-height: 0;
      display: block;
      overflow-x: auto;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      flex: 1 1 auto;
    }
    .preview-container.is-original {
      padding: 0 !important;
      overflow-x: hidden;
    }
    .print-canvas.is-original {
      padding: 0.25rem 0 1rem !important;
      border: none !important;
      border-radius: 0 !important;
      box-shadow: none !important;
      background: transparent !important;
    }
    .original-meta-bar {
      padding: 0.625rem 0.875rem 0.75rem !important;
    }
    .standard-canvas {
      min-width: 740px !important;
      width: 740px !important;
    }
    .dotmatrix-canvas {
      min-width: 760px !important;
      width: 760px !important;
    }
    .bottom-action-bar {
      border-top: none;
    }
  }

  .force-print-light {
    --surface-1: #f8fafc !important;
    --surface-2: #ffffff !important;
    --surface-3: #f1f5f9 !important;
    --text-primary: #000000 !important;
    --text-secondary: #475569 !important;
    --border: #cbd5e1 !important;
    --border-strong: #334155 !important;
    --field-fill: #ffffff !important;
    --success: #16a34a !important;
    --error: #dc2626 !important;
    background: #ffffff !important;
    color: #000000 !important;
    box-shadow: none !important;
  }
  .force-print-light * {
    --surface-1: #f8fafc !important;
    --surface-2: #ffffff !important;
    --surface-3: #f1f5f9 !important;
    --text-primary: #000000 !important;
    --text-secondary: #475569 !important;
    --border: #cbd5e1 !important;
    --border-strong: #334155 !important;
    --field-fill: #ffffff !important;
    --success: #16a34a !important;
    --error: #dc2626 !important;
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
    .modal-topbar, .format-tabs-desktop, .format-tabs-mobile, .bottom-action-bar, button, input, select {
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
    #purchase-invoice-print-canvas, #purchase-invoice-print-canvas * {
      visibility: visible !important;
    }
    #purchase-invoice-print-canvas {
      --surface-1: #f8fafc !important;
      --surface-2: #ffffff !important;
      --surface-3: #f1f5f9 !important;
      --text-primary: #000000 !important;
      --text-secondary: #475569 !important;
      --border: #cbd5e1 !important;
      --border-strong: #334155 !important;
      --field-fill: #ffffff !important;
      --success: #16a34a !important;
      --error: #dc2626 !important;
      position: absolute !important;
      left: 0 !important;
      top: 0 !important;
      width: 100% !important;
      margin: 0 !important;
      box-shadow: none !important;
      border: none !important;
      background: #ffffff !important;
      color: #000000 !important;
    }
  }
`;

export const PurchaseInvoiceView = component$<PurchaseInvoiceViewProps>((props) => {
  useStylesScoped$(STYLES);

  const activeFormat = useSignal<PurchasePrintFormat>("dotmatrix");
  const thermalWidth = useSignal<"80mm" | "58mm">("80mm");
  const isDownloadingPdf = useSignal(false);
  const isPrinting = useSignal(false);
  const isOpeningWhatsApp = useSignal(false);
  const downloadToast = useSignal<string | null>(null);
  const fetchedReceipt = useSignal<PurchaseInvoiceData | null>(null);
  const attachedMedia = useSignal<MediaItem | null>(null);
  const loadingMedia = useSignal(false);

  // Dynamic store details initialized with prop fallbacks
  const storeInfo = useSignal({
    name: props.storeName || "MY STORE",
    address: props.storeAddress || "",
    city: props.storeCity || "",
    state: props.storeState || "",
    dlNo: props.storeDlNo || "",
    gstin: props.storeGstin || "",
    phone: props.storePhone || "",
    email: props.storeEmail || "",
    pan: props.storePan || "",
    regime: "",
    headerTopText: "", // Empty: no unwanted top text
    invoiceTitleText: "PURCHASE INVOICE / GOODS RECEIPT",
    terms: props.terms || "Goods received in good condition.",
    signatoryName: "",
  });

  // Load store / tax settings dynamically
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => props.open.value);
    if (!props.open.value) return;

    try {
      const [settings, taxCfg] = await Promise.all([
        invoke<any>("get_settings").catch(() => null),
        invoke<any>("fin_get_tax_config").catch(() => null),
      ]);

      if (settings || taxCfg) {
        storeInfo.value = {
          name: settings?.store_name || taxCfg?.registered_name || taxCfg?.legal_name || props.storeName || "MY STORE",
          address: settings?.store_address || taxCfg?.address || props.storeAddress || "",
          city: settings?.store_city || taxCfg?.city || props.storeCity || "",
          state: settings?.store_state || taxCfg?.state || props.storeState || "",
          dlNo: settings?.dl_no || settings?.drug_license_no || taxCfg?.dl_no || props.storeDlNo || "",
          gstin: settings?.gstin || taxCfg?.gstin || props.storeGstin || "",
          phone: settings?.store_phone || taxCfg?.phone || props.storePhone || "",
          email: settings?.store_email || taxCfg?.email || props.storeEmail || "",
          pan: settings?.pan || taxCfg?.pan || props.storePan || "",
          regime: taxCfg?.regime || "",
          headerTopText: "",
          invoiceTitleText: "PURCHASE INVOICE / GOODS RECEIPT",
          terms: settings?.terms_and_conditions || taxCfg?.invoice_terms || props.terms || "Goods received in good condition.",
          signatoryName: settings?.signatory_name || taxCfg?.signatory_name || "",
        };
      }
    } catch (e) {
      console.warn("[PurchaseInvoiceView] Settings load fallback:", e);
    }
  });

  // Auto-fetch receipt details if docId is provided
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const isOpen = track(() => props.open.value);
    const docIdVal = typeof props.docId === "string" ? props.docId : props.docId?.value;

    if (!isOpen) return;

    if (docIdVal) {
      try {
        const detail = await invoke<PurchaseInvoiceData>("shop_get_goods_receipt", { docId: docIdVal });
        if (detail) {
          fetchedReceipt.value = detail;
        }
      } catch (e) {
        console.error("[PurchaseInvoiceView] Failed to fetch goods receipt detail:", e);
      }
    }
  });

  // Auto-fetch attached media item when media_id exists
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => props.open.value);
    track(() => activeFormat.value);
    track(() => fetchedReceipt.value);
    const currReceipt = (props.receipt && "value" in props.receipt ? props.receipt.value : props.receipt) || fetchedReceipt.value;
    const mId = currReceipt?.media_id;
    if (!mId) {
      attachedMedia.value = null;
      return;
    }
    if (attachedMedia.value?.id === mId || attachedMedia.value?.url === mId) return;

    loadingMedia.value = true;
    try {
      const items = await invoke<MediaItem[]>("media_list", {
        fileType: null,
        search: null,
      }).catch(() => [] as MediaItem[]);

      const found = items.find(
        (m) => m.id === mId || m.url === mId || m.local_url === mId
      );
      if (found) {
        attachedMedia.value = found;
      } else {
        attachedMedia.value = {
          id: mId,
          filename: "Original Invoice",
          url: mId,
          file_type: "image",
          size_bytes: 0,
          storage_provider: "direct",
          created_at: Math.floor(Date.now() / 1000),
        };
      }
    } catch (e) {
      console.warn("[PurchaseInvoiceView] Media fetch error:", e);
    } finally {
      loadingMedia.value = false;
    }
  });

  if (!props.open.value) return null;

  // Resolve active receipt data from props or fetched state
  const rawReceipt = (props.receipt && "value" in props.receipt ? props.receipt.value : props.receipt) || fetchedReceipt.value;

  const defaultReceipt: PurchaseInvoiceData = {
    id: "preview-id",
    doc_number: "GR-PREVIEW",
    ref_number: "BILL-001",
    doc_date: Math.floor(Date.now() / 1000),
    status: "confirmed",
    subtotal: 0,
    grand_total: 0,
    amount_paid: 0,
    amount_due: 0,
    lines: [],
  };

  const receipt: PurchaseInvoiceData = rawReceipt || defaultReceipt;

  const dateVal = receipt.vendor_bill_date || receipt.doc_date || receipt.created_at || Math.floor(Date.now() / 1000);
  const dateObj = new Date(dateVal > 10000000000 ? dateVal : dateVal * 1000);
  const dateStr = dateObj.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const timeStr = dateObj.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true });

  const grandTotal = receipt.grand_total || 0;
  const roundedTotal = Math.round(grandTotal);
  const wordsAmount = numberToWords(roundedTotal);

  const subtotal = receipt.subtotal || 0;
  const cashDiscAmt = receipt.cash_discount_amt || (receipt.cash_discount_pct ? (subtotal * receipt.cash_discount_pct / 100) : 0);
  const inwardFreight = receipt.inward_expense || 0;
  const paidAmt = receipt.amount_paid || 0;
  const dueAmt = receipt.amount_due || Math.max(0, grandTotal - paidAmt);

  // Vendor / Supplier details
  const vendorName = (receipt.vendor_name || "VENDOR / SUPPLIER").toUpperCase();
  const vendorAddr = receipt.vendor_address || (receipt.vendor_city ? `${receipt.vendor_city}${receipt.vendor_state ? `, ${receipt.vendor_state}` : ""}` : "");
  const vendorDlNo = receipt.vendor_dl_no || "";
  const vendorGstin = receipt.vendor_gstin || "";
  const vendorPan = receipt.vendor_pan || "";
  const vendorPhone = receipt.vendor_phone || "";
  const isTaxExempt = (storeInfo.value.regime || "").toLowerCase() === "none" || (storeInfo.value.regime || "").toLowerCase() === "exempt";

  const totalTax = receipt.lines.reduce((sum, l) => {
    let snap: any = null;
    if (l.pricing_snapshot) {
      try { snap = typeof l.pricing_snapshot === "string" ? JSON.parse(l.pricing_snapshot) : l.pricing_snapshot; } catch { /* noop */ }
    }
    const r = Number(snap?.rate ?? l.cost ?? l.unit_price ?? 0);
    const d1 = Number(snap?.discount ?? 0);
    const d2 = Number(snap?.discount2 ?? 0);
    const t = Number(snap?.tax ?? 0);
    const g = r * l.qty;
    const disc = (d1 + d2) > 0 ? (g * (d1 + d2) / 100) : 0;
    const net = Math.max(0, g - disc);
    return sum + (t > 0 ? (net * t / 100) : 0);
  }, 0);

  // ── Native PDF Generation Helper ──────────────────────────────────────────
  const generatePdfBlobAndDataUri = $(async (printElement: HTMLElement) => {
    if (typeof document !== "undefined" && document.fonts) {
      try { await document.fonts.ready; } catch (e) { console.debug(e); }
    }

    const { toCanvas } = await import("html-to-image");
    const { jsPDF } = await import("jspdf");

    // Temporarily apply light print theme styles to ensure black-on-white text in exported PDF
    printElement.classList.add("force-print-light");

    let canvas: HTMLCanvasElement;
    try {
      canvas = await toCanvas(printElement, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
        style: {
          boxShadow: "none",
          margin: "0",
          borderRadius: "0",
        },
      });
    } finally {
      printElement.classList.remove("force-print-light");
    }

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
    const printElement = (document.querySelector("#purchase-invoice-print-canvas .print-canvas") as HTMLElement) || document.getElementById("purchase-invoice-print-canvas");
    if (!printElement) {
      window.print();
      return;
    }

    isPrinting.value = true;
    try {
      const { pdfBase64, pdfBlob } = await generatePdfBlobAndDataUri(printElement);
      const fileName = `Purchase_${receipt.ref_number || receipt.doc_number || "Invoice"}.pdf`;

      // Mobile share
      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator !== "undefined" && typeof File !== "undefined") {
        try {
          const file = new File([pdfBlob], fileName, { type: "application/pdf" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Print Purchase ${receipt.doc_number || ""}`,
              text: `Print Purchase ${receipt.doc_number || ""}`,
            });
            return;
          }
        } catch (shareErr) {
          console.warn("[PurchaseInvoiceView] Mobile print fallback:", shareErr);
        }
      }

      // Desktop Tauri
      try {
        await invoke<string>("shop_open_pdf", {
          fileName,
          base64Data: pdfBase64,
        });
        return;
      } catch (tauriErr) {
        console.warn("[PurchaseInvoiceView] Tauri shop_open_pdf fallback:", tauriErr);
      }

      window.print();
    } catch (err) {
      console.error("[PurchaseInvoiceView] Native print error:", err);
      window.print();
    } finally {
      isPrinting.value = false;
    }
  });

  // ── Native PDF Download Handler ───────────────────────────────────────────
  const handleDownloadPdf = $(async () => {
    const printElement = (document.querySelector("#purchase-invoice-print-canvas .print-canvas") as HTMLElement) || document.getElementById("purchase-invoice-print-canvas");
    if (!printElement) return;
    isDownloadingPdf.value = true;
    try {
      const { pdfBase64, pdfBlob } = await generatePdfBlobAndDataUri(printElement);
      const fileName = `Purchase_${receipt.ref_number || receipt.doc_number || "Invoice"}.pdf`;

      // 1. Try Tauri Native Download (saves to Downloads folder)
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
        console.warn("[PurchaseInvoiceView] shop_download_pdf fallback:", tauriErr);
      }

      // 2. Mobile web share fallback
      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      if (isMobile && typeof navigator !== "undefined" && typeof File !== "undefined") {
        try {
          const file = new File([pdfBlob], fileName, { type: "application/pdf" });
          if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
              files: [file],
              title: `Save Purchase ${receipt.doc_number || ""}`,
              text: `Download Purchase ${receipt.doc_number || ""}`,
            });
            return;
          }
        } catch (shareErr) {
          console.warn("[PurchaseInvoiceView] Mobile web share fallback:", shareErr);
        }
      }

      // 3. Browser direct blob download
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);

      downloadToast.value = `✓ Downloaded ${fileName}`;
      setTimeout(() => { downloadToast.value = null; }, 4000);
    } catch (err) {
      console.error("[PurchaseInvoiceView] PDF export error:", err);
      downloadToast.value = "Failed to export PDF";
      setTimeout(() => { downloadToast.value = null; }, 3500);
    } finally {
      isDownloadingPdf.value = false;
    }
  });

  // ── WhatsApp Share Handler ────────────────────────────────────────────────
  const handleWhatsApp = $(async () => {
    isOpeningWhatsApp.value = true;
    try {
      const linesSummary = receipt.lines.map((l, i) =>
        `${i + 1}. *${l.item_name}* (Qty: ${l.qty}${l.free_qty ? ` + Free: ${l.free_qty}` : ""}) @ ₹${(l.cost || l.unit_price || 0).toFixed(2)}`
      ).join("\n");

      const text = `*PURCHASE RECEIPT / GOODS INWARD*\n` +
        `*${storeInfo.value.name.toUpperCase()}*\n` +
        `─────────────────────\n` +
        `Receipt #: *${receipt.doc_number}*\n` +
        (receipt.ref_number ? `Bill/Ref #: *${receipt.ref_number}*\n` : "") +
        `Date: ${dateStr}\n` +
        `Supplier: *${vendorName}*\n` +
        `─────────────────────\n` +
        `*Items (${receipt.lines.length}):*\n${linesSummary}\n` +
        `─────────────────────\n` +
        `Subtotal: ₹${subtotal.toFixed(2)}\n` +
        (cashDiscAmt > 0 ? `Cash Discount: -₹${cashDiscAmt.toFixed(2)}\n` : "") +
        (inwardFreight > 0 ? `Inward Freight: +₹${inwardFreight.toFixed(2)}\n` : "") +
        `*Grand Total: ₹${grandTotal.toFixed(2)}*\n` +
        `Paid: ₹${paidAmt.toFixed(2)}\n` +
        (dueAmt > 0 ? `*Balance Due: ₹${dueAmt.toFixed(2)}*\n` : "") +
        `Status: *${(receipt.status || "CONFIRMED").toUpperCase()}*\n\n` +
        `_Generated via BusinessKit App_`;

      let cleanPhone = (receipt.vendor_phone || "").replace(/\D/g, "");
      if (cleanPhone.length === 10) cleanPhone = "91" + cleanPhone;

      const isMobile = typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
      const baseUrl = isMobile ? "https://api.whatsapp.com/send" : "https://web.whatsapp.com/send";
      const url = cleanPhone
        ? `${baseUrl}?phone=${cleanPhone}&text=${encodeURIComponent(text)}`
        : `${baseUrl}?text=${encodeURIComponent(text)}`;

      try {
        await invoke("shop_open_url", { url });
        return;
      } catch {
        if (typeof window !== "undefined") {
          window.open(url, "_blank");
        }
      }
    } finally {
      isOpeningWhatsApp.value = false;
    }
  });

  const handleClose = $(() => {
    if (props.onClose$) {
      props.onClose$();
    } else {
      props.open.value = false;
    }
  });

  return (
    <div class="print-overlay" onClick$={handleClose}>
      <div class="print-modal" onClick$={(e) => e.stopPropagation()}>
        {/* ── Top Control Bar ── */}
        <div class="modal-topbar">
          {/* Row 1: Title, Format Switcher, Close Button */}
          <div class="modal-topbar-row1">
            <div class="topbar-title-group">
              <LuBuilding style={{ width: "1.125rem", height: "1.125rem", color: "var(--accent)" }} />
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "700", color: "var(--text-primary)", lineHeight: 1.2 }}>
                  {receipt.doc_number}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                  {receipt.ref_number ? `Bill: ${receipt.ref_number} · ` : ""}{fmtMoney(grandTotal)}
                </div>
              </div>
            </div>

            {/* Desktop Format Tabs (3 formats: DOT Matrix, Thermal, Standard A4) */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
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

              <div class="format-tabs-desktop">
                <button
                  type="button"
                  class={["format-tab", activeFormat.value === "dotmatrix" ? "active" : ""]}
                  onClick$={() => { activeFormat.value = "dotmatrix"; }}
                >
                  <LuReceipt style={{ width: "0.875rem", height: "0.875rem" }} />
                  DOT Matrix
                </button>
                <button
                  type="button"
                  class={["format-tab", activeFormat.value === "thermal" ? "active" : ""]}
                  onClick$={() => { activeFormat.value = "thermal"; }}
                >
                  <LuFileText style={{ width: "0.875rem", height: "0.875rem" }} />
                  Thermal POS
                </button>
                <button
                  type="button"
                  class={["format-tab", activeFormat.value === "standard" ? "active" : ""]}
                  onClick$={() => { activeFormat.value = "standard"; }}
                >
                  <LuFileText style={{ width: "0.875rem", height: "0.875rem" }} />
                  Standard A4
                </button>
                <button
                  type="button"
                  class={["format-tab", activeFormat.value === "original" ? "active" : ""]}
                  onClick$={() => { activeFormat.value = "original"; }}
                >
                  <LuImage style={{ width: "0.875rem", height: "0.875rem" }} />
                  Original
                </button>
              </div>

              <button type="button" class="topbar-close-btn" onClick$={handleClose} title="Close modal">
                <LuX style={{ width: "1.25rem", height: "1.25rem" }} />
              </button>
            </div>
          </div>

          {/* Mobile Format Tabs */}
          <div class="format-tabs-mobile">
            <button
              type="button"
              class={["format-tab", activeFormat.value === "dotmatrix" ? "active" : ""]}
              onClick$={() => { activeFormat.value = "dotmatrix"; }}
            >
              <LuReceipt style={{ width: "0.875rem", height: "0.875rem" }} />
              DOT
            </button>
            <button
              type="button"
              class={["format-tab", activeFormat.value === "thermal" ? "active" : ""]}
              onClick$={() => { activeFormat.value = "thermal"; }}
            >
              <LuFileText style={{ width: "0.875rem", height: "0.875rem" }} />
              Thermal
            </button>
            <button
              type="button"
              class={["format-tab", activeFormat.value === "standard" ? "active" : ""]}
              onClick$={() => { activeFormat.value = "standard"; }}
            >
              <LuFileText style={{ width: "0.875rem", height: "0.875rem" }} />
              A4
            </button>
            <button
              type="button"
              class={["format-tab", activeFormat.value === "original" ? "active" : ""]}
              onClick$={() => { activeFormat.value = "original"; }}
            >
              <LuImage style={{ width: "0.875rem", height: "0.875rem" }} />
              Original
            </button>
            {activeFormat.value === "thermal" && (
              <select
                value={thermalWidth.value}
                onChange$={(e) => { thermalWidth.value = (e.target as HTMLSelectElement).value as "80mm" | "58mm"; }}
                class="thermal-select"
                style={{ height: "1.75rem", fontSize: "0.7rem", padding: "0 0.25rem" }}
              >
                <option value="80mm">80mm</option>
                <option value="58mm">58mm</option>
              </select>
            )}
          </div>
        </div>

        {/* ── Preview Canvas Container ── */}
        <div class={["preview-container", activeFormat.value === "original" ? "is-original" : ""]}>
          <div
            id="purchase-invoice-print-canvas"
            style={{
              width: "100%",
              maxWidth: activeFormat.value === "thermal" ? "380px" : activeFormat.value === "dotmatrix" ? "100%" : "780px",
              minWidth: (activeFormat.value === "standard" || activeFormat.value === "dotmatrix") ? "max-content" : undefined,
              margin: "0 auto",
              display: activeFormat.value === "thermal" ? "flex" : "block",
              justifyContent: activeFormat.value === "thermal" ? "center" : undefined,
              boxSizing: "border-box",
            }}
          >
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* FORMAT 1: DOT MATRIX / CONTINUOUS PAPER GST BILL                    */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {activeFormat.value === "dotmatrix" && (
              <div
                class="print-canvas dotmatrix-canvas"
                style={{
                  width: "100%",
                  minWidth: "760px",
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
                  fontFamily: '"Courier New", Courier, monospace, monospace',
                  fontSize: "9px",
                  lineHeight: "1.25",
                  margin: "0 auto",
                  boxShadow: "var(--shadow-md, 0 4px 20px rgba(0,0,0,0.15))",
                  border: "1px solid var(--border)",
                  padding: "6mm 8mm",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  boxSizing: "border-box",
                  borderRadius: "0.375rem",
                }}
              >
                <div>
                  <div>
                    {/* Header Top Title */}
                    <div style={{ textAlign: "center", fontSize: "12px", fontWeight: "bold", letterSpacing: "2px", margin: "0 0 4px 0", color: "var(--text-primary)" }}>
                      [ PURCHASE INVOICE / GOODS RECEIPT ]
                    </div>

                    {/* Top Divider */}
                    <div style={{ borderTop: "1px solid var(--border-strong)", margin: "2px 0 4px 0" }} />

                    {/* Two-Column Header: Left = Vendor (Billed By), Right = Store (Delivered To) */}
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px", fontSize: "9px", lineHeight: "1.2" }}>
                      {/* Left: Vendor / Supplier Info */}
                      <div style={{ borderRight: "1px dashed var(--border)", paddingRight: "6px" }}>
                        <div style={{ fontWeight: "bold", fontSize: "10px", color: "var(--text-secondary)" }}>SUPPLIER / BILLED BY:</div>
                        <div style={{ fontWeight: "bold", fontSize: "11px", color: "var(--text-primary)" }}>{vendorName}</div>
                        {vendorAddr && <div style={{ color: "var(--text-primary)" }}>{vendorAddr}</div>}
                        {!isTaxExempt && vendorGstin && <div style={{ color: "var(--text-primary)" }}>GSTIN: <strong>{vendorGstin}</strong></div>}
                        {!isTaxExempt && vendorPan && <div style={{ color: "var(--text-primary)" }}>PAN: {vendorPan}</div>}
                        {!isTaxExempt && vendorDlNo && <div style={{ color: "var(--text-primary)" }}>DL No: {vendorDlNo}</div>}
                        {vendorPhone && <div style={{ color: "var(--text-primary)" }}>Phone: {vendorPhone}</div>}
                      </div>

                      {/* Right: Store / Consignee Info */}
                      <div style={{ paddingLeft: "2px" }}>
                        <div style={{ fontWeight: "bold", fontSize: "10px", color: "var(--text-secondary)" }}>CONSIGNEE / BILLED TO:</div>
                        <div style={{ fontWeight: "bold", fontSize: "11px", color: "var(--text-primary)" }}>{storeInfo.value.name.toUpperCase()}</div>
                        {storeInfo.value.address && <div style={{ color: "var(--text-primary)" }}>{storeInfo.value.address}</div>}
                        {storeInfo.value.city && <div style={{ color: "var(--text-primary)" }}>{storeInfo.value.city}{storeInfo.value.state ? `, ${storeInfo.value.state}` : ""}</div>}
                        {!isTaxExempt && storeInfo.value.gstin && <div style={{ color: "var(--text-primary)" }}>GSTIN: <strong>{storeInfo.value.gstin}</strong></div>}
                        {!isTaxExempt && storeInfo.value.dlNo && <div style={{ color: "var(--text-primary)" }}>DL No: {storeInfo.value.dlNo}</div>}
                        {storeInfo.value.phone && <div style={{ color: "var(--text-primary)" }}>Phone: {storeInfo.value.phone}</div>}
                      </div>
                    </div>

                    {/* Document Meta Row */}
                    <div style={{ borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)", background: "var(--surface-3)", margin: "4px 0 3px 0", padding: "4px 6px", borderRadius: "0.25rem", display: "grid", gridTemplateColumns: "repeat(5, 1fr)", fontSize: "8.5px", gap: "4px", color: "var(--text-primary)" }}>
                      <div><strong>Receipt #:</strong> {receipt.doc_number}</div>
                      <div><strong>Bill/Ref #:</strong> {receipt.ref_number || "—"}</div>
                      <div><strong>Date:</strong> {dateStr}</div>
                      <div><strong>Warehouse:</strong> {receipt.warehouse_name || "Main"}</div>
                      <div><strong>Status:</strong> {(receipt.status || "CONFIRMED").toUpperCase()}</div>
                    </div>

                    {/* Dot Matrix Table */}
                    <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0", fontSize: "9px", lineHeight: "1.25", textAlign: "left" }}>
                      <thead>
                        <tr style={{ verticalAlign: "middle" }}>
                          <th style={{ padding: "6px 4px", fontWeight: "bold", verticalAlign: "middle", width: "16%", maxWidth: "130px", color: "var(--text-primary)" }}>Particular</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", width: "4%", whiteSpace: "nowrap", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>ShelfID</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", width: "5%", whiteSpace: "nowrap", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Pack</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", width: "6%", minWidth: "40px", whiteSpace: "nowrap", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>HSN</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", width: "5%", whiteSpace: "nowrap", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>MfgBy</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", width: "6%", whiteSpace: "nowrap", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Batch No</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Qnty</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Free</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "6.5%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Rate</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "7%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Amount</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4.5%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Disc</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4.5%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Dis2</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "6.5%", whiteSpace: "nowrap", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Rate AD</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "7.5%", whiteSpace: "nowrap", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Amount AD</th>
                          {!isTaxExempt && (
                            <>
                              <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4.5%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>CGST%</th>
                              <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "4.5%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>SGST%</th>
                            </>
                          )}
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "6.5%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>M.R.P.</th>
                          <th style={{ padding: "6px 3px", fontWeight: "bold", verticalAlign: "middle", textAlign: "right", width: "5%", borderLeft: "1px dashed var(--border)", color: "var(--text-primary)" }}>Exp.</th>
                        </tr>
                        <tr>
                          <td colSpan={isTaxExempt ? 16 : 18} style={{ padding: "0" }}>
                            <div style={{ borderTop: "1px solid var(--border-strong)", margin: "3px 0 5px 0" }} />
                          </td>
                        </tr>
                      </thead>
                      <tbody>
                        {receipt.lines.map((line: PurchaseLineDetail, idx: number) => {
                          let snap: any = null;
                          if (line.pricing_snapshot) {
                            try {
                              snap = typeof line.pricing_snapshot === "string" ? JSON.parse(line.pricing_snapshot) : line.pricing_snapshot;
                            } catch { /* noop */ }
                          }

                          const rate = Number(snap?.rate ?? line.cost ?? line.unit_price ?? 0);
                          const dis1Val = Number(snap?.discount ?? 0);
                          const dis2Val = Number(snap?.discount2 ?? 0);
                          const taxVal = Number(snap?.tax ?? 0);

                          const discVal = dis1Val > 0 ? `${dis1Val}%` : "0.00";
                          const dis2Str = dis2Val > 0 ? `${dis2Val}%` : "0.00";

                          const lineGross = rate * line.qty;
                          const totalDiscPct = dis1Val + dis2Val;
                          const lineDiscTotal = totalDiscPct > 0 ? (lineGross * totalDiscPct / 100) : 0;
                          const lineNet = Math.max(0, lineGross - lineDiscTotal);
                          const rateAD = line.qty > 0 ? (lineNet / line.qty) : rate;

                          const halfTaxPct = (taxVal / 2).toFixed(1);
                          const shelf = line.shelf_location || "—";
                          const pack = line.pack_size || "—";
                          const hsn = line.hsn_sac_code || "—";
                          const mfg = line.brand_name || "—";
                          const batch = line.batch_no || "—";
                          const expStr = line.expiry_date
                            ? (typeof line.expiry_date === "number" && line.expiry_date > 1000000000
                              ? new Date(line.expiry_date > 10000000000 ? line.expiry_date : line.expiry_date * 1000).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" })
                              : String(line.expiry_date))
                            : "—";
                          const mrpStr = line.mrp && line.mrp > 0 ? line.mrp.toFixed(2) : "—";
                          const freeQtyStr = line.free_qty && line.free_qty > 0 ? String(line.free_qty) : "";

                          return (
                            <tr key={line.id || idx} style={{ verticalAlign: "middle" }}>
                              <td style={{ padding: "5px 4px", fontWeight: "bold", maxWidth: "110px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", verticalAlign: "middle", color: "var(--text-primary)" }}>
                                {line.item_name.toUpperCase()}
                              </td>
                              <td style={{ padding: "5px 3px", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{shelf}</td>
                              <td style={{ padding: "5px 3px", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{pack}</td>
                              <td style={{ padding: "5px 3px", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{hsn}</td>
                              <td style={{ padding: "5px 3px", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{mfg}</td>
                              <td style={{ padding: "5px 3px", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{batch}</td>
                              <td style={{ padding: "5px 3px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{line.qty}</td>
                              <td style={{ padding: "5px 3px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{freeQtyStr}</td>
                              <td style={{ padding: "5px 3px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{rate.toFixed(2)}</td>
                              <td style={{ padding: "5px 3px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{lineGross.toFixed(2)}</td>
                              <td style={{ padding: "5px 3px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{discVal}</td>
                              <td style={{ padding: "5px 3px", textAlign: "right", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{dis2Str}</td>
                              <td style={{ padding: "5px 3px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{rateAD.toFixed(2)}</td>
                              <td style={{ padding: "5px 3px", textAlign: "right", fontWeight: "bold", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{lineNet.toFixed(2)}</td>
                              {!isTaxExempt && (
                                <>
                                  <td style={{ padding: "5px 3px", textAlign: "right", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{halfTaxPct}</td>
                                  <td style={{ padding: "5px 3px", textAlign: "right", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{halfTaxPct}</td>
                                </>
                              )}
                              <td style={{ padding: "5px 3px", textAlign: "right", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{mrpStr}</td>
                              <td style={{ padding: "5px 3px", textAlign: "right", borderLeft: "1px dashed var(--border)", verticalAlign: "middle", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: "var(--text-primary)" }}>{expStr}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Dotted Line below all item list */}
                    <div style={{ borderTop: "1px dashed var(--border-strong)", margin: "6px 0 8px 0" }} />

                    {/* Dot Matrix Summary Footer */}
                    <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: "14px", fontSize: "9.5px", lineHeight: "1.3" }}>
                      {/* Left Bottom: Terms, In Words, Logistics */}
                      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ color: "var(--text-secondary)" }}><strong style={{ color: "var(--text-primary)" }}>Terms & Conditions:</strong> {storeInfo.value.terms}</div>
                          <div style={{ marginTop: "4px", color: "var(--text-secondary)" }}>
                            <strong style={{ color: "var(--text-primary)" }}>Amount in Words:</strong> {wordsAmount} Rupees Only
                          </div>
                          {(receipt.transporter_name || receipt.lr_number || receipt.vehicle_number) && (
                            <div style={{ marginTop: "4px", fontSize: "9px", color: "var(--text-secondary)" }}>
                              {receipt.transporter_name && <span>Transport: {receipt.transporter_name} · </span>}
                              {receipt.lr_number && <span>LR#: {receipt.lr_number} · </span>}
                              {receipt.vehicle_number && <span>Vehicle: {receipt.vehicle_number}</span>}
                            </div>
                          )}
                        </div>

                        {/* GST Summary Split */}
                        {!isTaxExempt && totalTax > 0 && (
                          <div style={{ marginTop: "8px", border: "1px dashed var(--border)", background: "var(--surface-3)", borderRadius: "0.25rem", padding: "4px 6px" }}>
                            <div style={{ fontWeight: "bold", marginBottom: "2px", color: "var(--text-primary)" }}>GST TAX BREAKDOWN:</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", fontSize: "8.5px", borderBottom: "1px dashed var(--border)", paddingBottom: "2px", color: "var(--text-secondary)" }}>
                              <span>GST%</span>
                              <span style={{ textAlign: "right" }}>Taxable</span>
                              <span style={{ textAlign: "right" }}>CGST</span>
                              <span style={{ textAlign: "right" }}>SGST</span>
                            </div>
                            {[0, 5, 12, 18, 28].map((ratePct) => {
                              const matchingLines = receipt.lines.filter(l => {
                                let snap: any = null;
                                if (l.pricing_snapshot) {
                                  try { snap = typeof l.pricing_snapshot === "string" ? JSON.parse(l.pricing_snapshot) : l.pricing_snapshot; } catch { /* noop */ }
                                }
                                return Math.round(Number(snap?.tax ?? 0)) === ratePct;
                              });
                              if (matchingLines.length === 0) return null;
                              const taxVal = matchingLines.reduce((acc, l) => {
                                let snap: any = null;
                                if (l.pricing_snapshot) {
                                  try { snap = typeof l.pricing_snapshot === "string" ? JSON.parse(l.pricing_snapshot) : l.pricing_snapshot; } catch { /* noop */ }
                                }
                                const r = Number(snap?.rate ?? l.cost ?? l.unit_price ?? 0);
                                const d1 = Number(snap?.discount ?? 0);
                                const d2 = Number(snap?.discount2 ?? 0);
                                const g = r * l.qty;
                                const disc = (d1 + d2) > 0 ? (g * (d1 + d2) / 100) : 0;
                                return acc + Math.max(0, g - disc);
                              }, 0);
                              const halfTax = taxVal * (ratePct / 2) / 100;
                              return (
                                <div key={ratePct} style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", fontSize: "8.5px", marginTop: "2px", color: "var(--text-primary)" }}>
                                  <span>{ratePct}%</span>
                                  <span style={{ textAlign: "right" }}>{taxVal.toFixed(2)}</span>
                                  <span style={{ textAlign: "right" }}>{halfTax.toFixed(2)}</span>
                                  <span style={{ textAlign: "right" }}>{halfTax.toFixed(2)}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Right Bottom: Numerical Totals */}
                      <div style={{ borderLeft: "1px dashed var(--border)", paddingLeft: "10px", display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                        <div>
                          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                            <span>Sub Total (Taxable):</span>
                            <span style={{ fontWeight: "bold", color: "var(--text-primary)" }}>{subtotal.toFixed(2)}</span>
                          </div>
                          {cashDiscAmt > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                              <span>(-) Cash Discount:</span>
                              <span style={{ fontWeight: "bold", color: "var(--text-primary)" }}>{cashDiscAmt.toFixed(2)}</span>
                            </div>
                          )}
                          {inwardFreight > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                              <span>(+) Inward Freight:</span>
                              <span style={{ fontWeight: "bold", color: "var(--text-primary)" }}>{inwardFreight.toFixed(2)}</span>
                            </div>
                          )}
                          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", fontSize: "11.5px", marginTop: "4px", borderTop: "1px dashed var(--border-strong)", paddingTop: "4px", color: "var(--text-primary)" }}>
                            <span>Grand Total:</span>
                            <span>{grandTotal.toFixed(2)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginTop: "2px", color: "var(--text-secondary)" }}>
                            <span>Amount Paid:</span>
                            <span style={{ color: "var(--text-primary)" }}>{paidAmt.toFixed(2)}</span>
                          </div>
                          {dueAmt > 0 && (
                            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", color: "var(--error)", marginTop: "2px" }}>
                              <span>Balance Payable:</span>
                              <span>{dueAmt.toFixed(2)}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Signatory Footer */}
                  <div style={{ borderTop: "1px dashed var(--border)", paddingTop: "6px", marginTop: "10px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: "9px" }}>
                    <div>
                      <div style={{ color: "var(--text-primary)" }}>Verified By: ___________________</div>
                      <div style={{ fontSize: "8px", color: "var(--text-secondary)" }}>Receiver / Store Incharge</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: "var(--text-primary)" }}>{storeInfo.value.signatoryName || `For: ${storeInfo.value.name}`}</div>
                      <div style={{ height: "24px" }} />
                      <div style={{ fontWeight: "bold", color: "var(--text-primary)" }}>Authorized Signatory</div>
                    </div>
                  </div>

                  {/* Watermark / Verification Footer */}
                  <div style={{ textAlign: "center", fontSize: "8.5px", color: "var(--text-secondary)", marginTop: "14px", borderTop: "1px dashed var(--border)", paddingTop: "6px" }}>
                    <div>Verified & Logged Inward Entry</div>
                    <div style={{ fontWeight: "bold", marginTop: "2px", color: "var(--text-primary)" }}>BusinessKit ERP</div>
                  </div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* FORMAT 2: THERMAL POS RECEIPT (80mm / 58mm VERTICAL ROLL)             */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {activeFormat.value === "thermal" && (
              <div
                class="print-canvas"
                style={{
                  width: thermalWidth.value === "80mm" ? "320px" : "240px",
                  minWidth: thermalWidth.value === "80mm" ? "320px" : "240px",
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
                  fontFamily: "'Courier New', Courier, monospace",
                  fontSize: thermalWidth.value === "80mm" ? "11px" : "10px",
                  padding: "16px 12px",
                  boxShadow: "var(--shadow-md, 0 4px 20px rgba(0,0,0,0.15))",
                  border: "1px solid var(--border)",
                  margin: "0 auto",
                  borderRadius: "0.375rem",
                  boxSizing: "border-box",
                }}
              >
                {/* Header */}
                <div style={{ textAlign: "center", marginBottom: "8px" }}>
                  <div style={{ fontWeight: "900", fontSize: "14px", letterSpacing: "0.5px", color: "var(--text-primary)" }}>
                    {storeInfo.value.name.toUpperCase()}
                  </div>
                  {storeInfo.value.address && <div style={{ color: "var(--text-secondary)" }}>{storeInfo.value.address}</div>}
                  {(storeInfo.value.city || storeInfo.value.state) && (
                    <div style={{ color: "var(--text-secondary)" }}>{storeInfo.value.city}{storeInfo.value.state ? `, ${storeInfo.value.state}` : ""}</div>
                  )}
                  {storeInfo.value.phone && <div style={{ color: "var(--text-secondary)" }}>Ph: {storeInfo.value.phone}</div>}
                  {!isTaxExempt && storeInfo.value.gstin && <div style={{ color: "var(--text-secondary)" }}>GSTIN: {storeInfo.value.gstin}</div>}
                  {!isTaxExempt && storeInfo.value.dlNo && <div style={{ color: "var(--text-secondary)" }}>D.L.No: {storeInfo.value.dlNo}</div>}
                  <div style={{ fontWeight: "bold", marginTop: "4px", fontSize: "11px", borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)", padding: "3px 0", color: "var(--text-primary)" }}>
                    PURCHASE INVOICE / RECEIPT
                  </div>
                </div>

                <div style={{ fontSize: "10px", lineHeight: "1.35", marginBottom: "6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                    <span>GR #: <strong style={{ color: "var(--text-primary)" }}>{receipt.doc_number}</strong></span>
                    <span>{dateStr} {timeStr}</span>
                  </div>
                  {receipt.ref_number && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                      <span>Bill #: <strong style={{ color: "var(--text-primary)" }}>{receipt.ref_number}</strong></span>
                      <span>{receipt.warehouse_name || "Main"}</span>
                    </div>
                  )}
                  <div style={{ borderTop: "1px dashed var(--border)", marginTop: "3px", paddingTop: "3px", color: "var(--text-secondary)" }}>
                    <span>Supplier: <strong style={{ color: "var(--text-primary)" }}>{vendorName}</strong></span>
                  </div>
                  {!isTaxExempt && vendorGstin && <div style={{ color: "var(--text-secondary)" }}>Vendor GSTIN: {vendorGstin}</div>}
                </div>

                {/* Items Table */}
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", lineHeight: "1.3" }}>
                  <thead>
                    <tr style={{ borderTop: "1px dashed var(--border)", borderBottom: "1px dashed var(--border)", color: "var(--text-primary)" }}>
                      <th style={{ textAlign: "left", padding: "4px 0" }}>Item</th>
                      <th style={{ textAlign: "right", padding: "4px 0" }}>Qty</th>
                      <th style={{ textAlign: "right", padding: "4px 0" }}>Rate</th>
                      <th style={{ textAlign: "right", padding: "4px 0" }}>Amt</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.lines.map((line: PurchaseLineDetail, idx: number) => {
                      let snap: any = null;
                      if (line.pricing_snapshot) {
                        try { snap = typeof line.pricing_snapshot === "string" ? JSON.parse(line.pricing_snapshot) : line.pricing_snapshot; } catch { /* noop */ }
                      }
                      const rate = Number(snap?.rate ?? line.cost ?? line.unit_price ?? 0);
                      const dis1 = Number(snap?.discount ?? 0);
                      const dis2 = Number(snap?.discount2 ?? 0);
                      const g = rate * line.qty;
                      const disc = (dis1 + dis2) > 0 ? (g * (dis1 + dis2) / 100) : 0;
                      const net = Math.max(0, g - disc);

                      return (
                        <tr key={line.id || idx}>
                          <td style={{ padding: "4px 0", maxWidth: "120px", wordBreak: "break-word" }}>
                            <div style={{ fontWeight: "bold", color: "var(--text-primary)" }}>{line.item_name}</div>
                            {line.batch_no && <div style={{ fontSize: "8.5px", color: "var(--text-secondary)" }}>B:{line.batch_no}</div>}
                          </td>
                          <td style={{ textAlign: "right", padding: "4px 0", color: "var(--text-primary)" }}>
                            {line.qty}{line.free_qty ? `+${line.free_qty}` : ""}
                          </td>
                          <td style={{ textAlign: "right", padding: "4px 0", color: "var(--text-primary)" }}>{rate.toFixed(2)}</td>
                          <td style={{ textAlign: "right", padding: "4px 0", fontWeight: "bold", color: "var(--text-primary)" }}>{net.toFixed(2)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div style={{ borderTop: "1px dashed var(--border)", margin: "6px 0" }} />

                {/* Totals */}
                <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "10px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                    <span>Subtotal (Taxable):</span>
                    <span style={{ color: "var(--text-primary)" }}>₹{subtotal.toFixed(2)}</span>
                  </div>
                  {cashDiscAmt > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                      <span>Cash Discount:</span>
                      <span style={{ color: "var(--text-primary)" }}>-₹{cashDiscAmt.toFixed(2)}</span>
                    </div>
                  )}
                  {inwardFreight > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                      <span>Inward Freight:</span>
                      <span style={{ color: "var(--text-primary)" }}>+₹{inwardFreight.toFixed(2)}</span>
                    </div>
                  )}
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "900", fontSize: "12px", borderTop: "1px dashed var(--border-strong)", borderBottom: "1px dashed var(--border-strong)", padding: "3px 0", margin: "3px 0", color: "var(--text-primary)" }}>
                    <span>GRAND TOTAL:</span>
                    <span>₹{grandTotal.toFixed(2)}</span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                    <span>Amount Paid:</span>
                    <span style={{ color: "var(--text-primary)" }}>₹{paidAmt.toFixed(2)}</span>
                  </div>
                  {dueAmt > 0 && (
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: "bold", color: "var(--error)" }}>
                      <span>Balance Due:</span>
                      <span>₹{dueAmt.toFixed(2)}</span>
                    </div>
                  )}
                </div>

                <div style={{ textAlign: "center", fontSize: "9px", marginTop: "12px", borderTop: "1px dashed var(--border)", paddingTop: "6px", color: "var(--text-secondary)" }}>
                  <div>Verified & Logged Inward Entry</div>
                  <div style={{ marginTop: "2px", fontWeight: "bold", color: "var(--text-primary)" }}>BusinessKit ERP</div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* FORMAT 3: STANDARD A4 CLEAN MODERN GST PURCHASE INVOICE              */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {activeFormat.value === "standard" && (
              <div
                class="print-canvas standard-canvas"
                style={{
                  width: "100%",
                  minWidth: "740px",
                  maxWidth: "780px",
                  background: "var(--surface-2)",
                  color: "var(--text-primary)",
                  fontFamily: 'var(--font-family, "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif)',
                  fontSize: "11px",
                  lineHeight: "1.4",
                  padding: "18px 22px",
                  margin: "0 auto",
                  boxShadow: "var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.2))",
                  border: "1px solid var(--border)",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  borderRadius: "0.5rem",
                }}
              >
                <div>
                  {/* Top Header Card */}
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "2px solid var(--border-strong)", paddingBottom: "12px", marginBottom: "14px" }}>
                    <div>
                      <div style={{ fontSize: "18px", fontWeight: "800", color: "var(--text-primary)", letterSpacing: "-0.5px" }}>
                        {storeInfo.value.name.toUpperCase()}
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "11px", marginTop: "2px" }}>
                        {storeInfo.value.address} {storeInfo.value.city ? `· ${storeInfo.value.city}` : ""}{storeInfo.value.state ? `, ${storeInfo.value.state}` : ""}
                      </div>
                      <div style={{ color: "var(--text-secondary)", fontSize: "11px", marginTop: "2px" }}>
                        {!isTaxExempt && storeInfo.value.gstin && <span><strong>GSTIN:</strong> {storeInfo.value.gstin} &nbsp;</span>}
                        {!isTaxExempt && storeInfo.value.dlNo && <span><strong>DL:</strong> {storeInfo.value.dlNo} &nbsp;</span>}
                        {storeInfo.value.phone && <span><strong>Ph:</strong> {storeInfo.value.phone}</span>}
                      </div>
                    </div>

                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: "13px", fontWeight: "800", color: "var(--accent, #3b82f6)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {storeInfo.value.invoiceTitleText}
                      </div>
                      <div style={{ fontSize: "12px", fontWeight: "700", color: "var(--text-primary)", marginTop: "4px" }}>
                        Doc #: {receipt.doc_number}
                      </div>
                      {receipt.ref_number && (
                        <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                          Vendor Bill #: <strong>{receipt.ref_number}</strong>
                        </div>
                      )}
                      <div style={{ fontSize: "11px", color: "var(--text-secondary)" }}>
                        Date: {dateStr}
                      </div>
                    </div>
                  </div>

                  {/* Supplier and Delivery Addresses */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", padding: "10px 0", borderBottom: "1px solid var(--border)", marginBottom: "14px", fontSize: "11px" }}>
                    <div>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Supplier / Billed By:</div>
                      <div style={{ fontWeight: "700", fontSize: "12px", color: "var(--text-primary)", marginTop: "2px" }}>{vendorName}</div>
                      {vendorAddr && <div style={{ color: "var(--text-secondary)" }}>{vendorAddr}</div>}
                      <div style={{ marginTop: "3px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
                        {!isTaxExempt && vendorGstin && <span><strong style={{ color: "var(--text-primary)" }}>GSTIN:</strong> {vendorGstin} &nbsp;</span>}
                        {!isTaxExempt && vendorPan && <span><strong style={{ color: "var(--text-primary)" }}>PAN:</strong> {vendorPan}</span>}
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: "10px", fontWeight: "700", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.5px" }}>Delivered / Received At:</div>
                      <div style={{ fontWeight: "700", fontSize: "12px", color: "var(--text-primary)", marginTop: "2px" }}>{receipt.warehouse_name || "Main Warehouse"}</div>
                      <div style={{ color: "var(--text-secondary)" }}>{storeInfo.value.name} — {storeInfo.value.address}</div>
                      <div style={{ marginTop: "3px", fontSize: "10.5px", color: "var(--text-secondary)" }}>
                        <span>Status: <strong style={{ color: "var(--success)" }}>{(receipt.status || "CONFIRMED").toUpperCase()}</strong></span>
                        {receipt.payment_method && <span style={{ marginLeft: "10px" }}>Payment: <strong style={{ color: "var(--text-primary)" }}>{receipt.payment_method.toUpperCase()}</strong></span>}
                      </div>
                    </div>
                  </div>

                  {/* Clean A4 Table */}
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "10px", marginBottom: "14px", tableLayout: "auto" }}>
                    <thead>
                      <tr style={{ background: "var(--surface-3)", color: "var(--text-primary)", borderBottom: "1px solid var(--border)" }}>
                        <th style={{ padding: "6px 6px", textAlign: "center", width: "28px" }}>#</th>
                        <th style={{ padding: "6px 8px", textAlign: "left" }}>Item Description</th>
                        <th style={{ padding: "6px 6px", textAlign: "left", width: "60px" }}>HSN</th>
                        <th style={{ padding: "6px 6px", textAlign: "left", width: "65px" }}>Batch</th>
                        <th style={{ padding: "6px 6px", textAlign: "left", width: "50px" }}>Exp</th>
                        <th style={{ padding: "6px 6px", textAlign: "right", width: "45px" }}>Qty</th>
                        <th style={{ padding: "6px 6px", textAlign: "right", width: "42px" }}>Free</th>
                        <th style={{ padding: "6px 6px", textAlign: "right", width: "65px" }}>Rate</th>
                        <th style={{ padding: "6px 6px", textAlign: "right", width: "48px" }}>Disc%</th>
                        {!isTaxExempt && <th style={{ padding: "6px 6px", textAlign: "right", width: "48px" }}>Tax%</th>}
                        <th style={{ padding: "6px 8px", textAlign: "right", width: "75px" }}>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {receipt.lines.map((line: PurchaseLineDetail, idx: number) => {
                        let snap: any = null;
                        if (line.pricing_snapshot) {
                          try { snap = typeof line.pricing_snapshot === "string" ? JSON.parse(line.pricing_snapshot) : line.pricing_snapshot; } catch { /* noop */ }
                        }
                        const rate = Number(snap?.rate ?? line.cost ?? line.unit_price ?? 0);
                        const dis1 = Number(snap?.discount ?? 0);
                        const dis2 = Number(snap?.discount2 ?? 0);
                        const taxVal = Number(snap?.tax ?? 0);

                        const totalDisc = dis1 + dis2;
                        const gross = rate * line.qty;
                        const discAmt = totalDisc > 0 ? (gross * totalDisc / 100) : 0;
                        const netTaxable = Math.max(0, gross - discAmt);
                        const taxAmt = (netTaxable * taxVal / 100);
                        const lineTotal = netTaxable + taxAmt;

                        const expStr = line.expiry_date
                          ? (typeof line.expiry_date === "number" && line.expiry_date > 1000000000
                            ? new Date(line.expiry_date > 10000000000 ? line.expiry_date : line.expiry_date * 1000).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" })
                            : String(line.expiry_date))
                          : "—";

                        return (
                          <tr key={line.id || idx} style={{ borderBottom: "1px solid var(--border)", background: idx % 2 === 0 ? "var(--surface-1)" : "var(--surface-2)" }}>
                            <td style={{ padding: "6px 6px", textAlign: "center", color: "var(--text-secondary)" }}>{idx + 1}</td>
                            <td style={{ padding: "6px 8px", fontWeight: "600", color: "var(--text-primary)", wordBreak: "break-word" }}>
                              {line.item_name}
                              {line.pack_size && <span style={{ fontSize: "9px", color: "var(--text-secondary)", marginLeft: "4px" }}>({line.pack_size})</span>}
                            </td>
                            <td style={{ padding: "6px 6px", color: "var(--text-secondary)" }}>{line.hsn_sac_code || "—"}</td>
                            <td style={{ padding: "6px 6px", color: "var(--text-secondary)", fontFamily: "monospace" }}>{line.batch_no || "—"}</td>
                            <td style={{ padding: "6px 6px", color: "var(--text-secondary)" }}>{expStr}</td>
                            <td style={{ padding: "6px 6px", textAlign: "right", fontWeight: "600", color: "var(--text-primary)" }}>{line.qty}</td>
                            <td style={{ padding: "6px 6px", textAlign: "right", color: line.free_qty ? "var(--success)" : "var(--text-secondary)" }}>{line.free_qty || "—"}</td>
                            <td style={{ padding: "6px 6px", textAlign: "right", color: "var(--text-primary)" }}>₹{rate.toFixed(2)}</td>
                            <td style={{ padding: "6px 6px", textAlign: "right", color: totalDisc > 0 ? "var(--success)" : "var(--text-secondary)" }}>{totalDisc > 0 ? `${totalDisc}%` : "—"}</td>
                            {!isTaxExempt && <td style={{ padding: "6px 6px", textAlign: "right", color: "var(--text-primary)" }}>{taxVal > 0 ? `${taxVal}%` : "0%"}</td>}
                            <td style={{ padding: "6px 8px", textAlign: "right", fontWeight: "700", color: "var(--text-primary)" }}>₹{lineTotal.toFixed(2)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Summary Footer */}
                  <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: "16px", marginTop: "12px", fontSize: "11px" }}>
                    <div>
                      <div style={{ background: "var(--surface-1)", padding: "8px 10px", borderRadius: "6px", border: "1px solid var(--border)" }}>
                        <div style={{ fontWeight: "700", color: "var(--text-secondary)" }}>Amount in Words:</div>
                        <div style={{ color: "var(--text-primary)", marginTop: "2px" }}>{wordsAmount} Rupees Only</div>
                        {receipt.notes && (
                          <div style={{ marginTop: "6px", color: "var(--text-secondary)" }}>
                            <strong style={{ color: "var(--text-primary)" }}>Notes:</strong> {receipt.notes}
                          </div>
                        )}
                      </div>
                    </div>

                    <div style={{ background: "var(--surface-1)", padding: "10px 12px", borderRadius: "6px", border: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                        <span>Subtotal (Taxable):</span>
                        <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>₹{subtotal.toFixed(2)}</span>
                      </div>
                      {cashDiscAmt > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--success)" }}>
                          <span>Cash Discount:</span>
                          <span>-₹{cashDiscAmt.toFixed(2)}</span>
                        </div>
                      )}
                      {inwardFreight > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
                          <span>Inward Freight / Charges:</span>
                          <span style={{ color: "var(--text-primary)" }}>+₹{inwardFreight.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ borderTop: "2px solid var(--border-strong)", marginTop: "6px", paddingTop: "6px", display: "flex", justifyContent: "space-between", fontSize: "14px", fontWeight: "800", color: "var(--text-primary)" }}>
                        <span>Grand Total:</span>
                        <span>₹{grandTotal.toFixed(2)}</span>
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginTop: "4px", color: "var(--text-secondary)" }}>
                        <span>Amount Paid:</span>
                        <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>₹{paidAmt.toFixed(2)}</span>
                      </div>
                      {dueAmt > 0 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", marginTop: "2px", color: "var(--error)", fontWeight: "700" }}>
                          <span>Balance Payable:</span>
                          <span>₹{dueAmt.toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Bottom Signatures */}
                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px", marginTop: "16px", display: "flex", justifyContent: "space-between", alignItems: "flex-end", fontSize: "10.5px" }}>
                  <div>
                    <div style={{ color: "var(--text-secondary)" }}>Goods verified and received by:</div>
                    <div style={{ fontWeight: "600", color: "var(--text-primary)", marginTop: "20px" }}>Authorized Store Incharge</div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ color: "var(--text-secondary)" }}>{storeInfo.value.signatoryName || `For ${storeInfo.value.name}`}</div>
                    <div style={{ height: "24px" }} />
                    <div style={{ fontWeight: "700", color: "var(--text-primary)" }}>Authorized Signatory</div>
                  </div>
                </div>

                {/* Watermark / Verification Footer */}
                <div style={{ textAlign: "center", fontSize: "9.5px", color: "var(--text-secondary)", marginTop: "16px", borderTop: "1px dashed var(--border)", paddingTop: "8px" }}>
                  <div>Verified & Logged Inward Entry</div>
                  <div style={{ fontWeight: "700", color: "var(--text-primary)", marginTop: "2px" }}>BusinessKit ERP</div>
                </div>
              </div>
            )}

            {/* ══════════════════════════════════════════════════════════════════════ */}
            {/* FORMAT 4: ORIGINAL ATTACHED INVOICE (SCREENSHOT / DOCUMENT / PDF)    */}
            {/* ══════════════════════════════════════════════════════════════════════ */}
            {activeFormat.value === "original" && (
              <div
                class="print-canvas is-original"
                style={{
                  width: "100%",
                  maxWidth: "780px",
                  margin: "0 auto",
                  background: "var(--surface-2)",
                  borderRadius: "0.5rem",
                  border: "1px solid var(--border)",
                  boxShadow: "var(--shadow-lg, 0 10px 25px rgba(0,0,0,0.2))",
                  padding: "18px 22px",
                  boxSizing: "border-box",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.75rem",
                }}
              >
                {/* Header Meta Bar */}
                <div
                  class="original-meta-bar"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.5rem 0.875rem",
                    gap: "0.875rem",
                    flexWrap: "wrap",
                    boxSizing: "border-box",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
                    <div
                      style={{
                        width: "2.25rem",
                        height: "2.25rem",
                        borderRadius: "0.375rem",
                        background: "rgba(59, 130, 246, 0.12)",
                        border: "1px solid rgba(59, 130, 246, 0.25)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#3b82f6",
                        flexShrink: 0,
                      }}
                    >
                      <LuImage style={{ width: "1.25rem", height: "1.25rem" }} />
                    </div>
                    <div>
                      <div style={{ fontSize: "0.9375rem", fontWeight: "700", color: "var(--text-primary)" }}>
                        Original Vendor Invoice
                      </div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                        {receipt.media_id ? (
                          <>
                            Attachment ID: <span style={{ fontFamily: "monospace", color: "var(--text-primary)", fontWeight: "600" }}>{receipt.media_id}</span>
                            {attachedMedia.value?.filename && ` · ${attachedMedia.value.filename}`}
                            {attachedMedia.value?.size_bytes ? ` (${(attachedMedia.value.size_bytes / 1024).toFixed(1)} KB)` : ""}
                          </>
                        ) : (
                          "No original document attached to this goods receipt."
                        )}
                      </div>
                    </div>
                  </div>

                  {receipt.media_id && (attachedMedia.value?.url || attachedMedia.value?.local_url || receipt.media_id.startsWith("http") || receipt.media_id.startsWith("/")) && (
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <button
                        type="button"
                        onClick$={$(async () => {
                          const url = attachedMedia.value?.url || attachedMedia.value?.local_url || receipt.media_id || "";
                          if (!url) return;
                          try {
                            await invoke("shop_open_url", { url });
                          } catch {
                            if (typeof window !== "undefined") window.open(url, "_blank");
                          }
                        })}
                        style={{
                          padding: "0.45rem 0.875rem",
                          background: "var(--surface-3)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          color: "var(--text-primary)",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <LuExternalLink style={{ width: "0.8125rem", height: "0.8125rem" }} />
                        Open Full
                      </button>
                      <button
                        type="button"
                        onClick$={$(() => {
                          const url = attachedMedia.value?.url || attachedMedia.value?.local_url || receipt.media_id || "";
                          if (!url) return;
                          const fileName = attachedMedia.value?.filename || `Invoice_${receipt.ref_number || receipt.doc_number || "Attachment"}`;
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = fileName;
                          a.target = "_blank";
                          document.body.appendChild(a);
                          a.click();
                          setTimeout(() => { document.body.removeChild(a); }, 500);
                        })}
                        style={{
                          padding: "0.45rem 1rem",
                          background: "var(--button-primary-bg, #2563eb)",
                          border: "none",
                          borderRadius: "0.375rem",
                          color: "var(--button-primary-text, #ffffff)",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.35rem",
                        }}
                      >
                        <LuDownload style={{ width: "0.8125rem", height: "0.8125rem" }} />
                        Download
                      </button>
                    </div>
                  )}
                </div>

                {/* Content Area */}
                {loadingMedia.value ? (
                  <div style={{ padding: "4rem 1rem", textAlign: "center", color: "var(--text-secondary)" }}>
                    <LuLoader2 style={{ width: "2rem", height: "2rem", animation: "spin 1s linear infinite", margin: "0 auto 0.75rem" }} />
                    <div style={{ fontSize: "0.875rem" }}>Loading original invoice document…</div>
                  </div>
                ) : receipt.media_id ? (
                  (() => {
                    const mediaUrl = attachedMedia.value?.url || attachedMedia.value?.local_url || receipt.media_id || "";
                    const isPdf =
                      mediaUrl.toLowerCase().endsWith(".pdf") ||
                      mediaUrl.toLowerCase().includes(".pdf?") ||
                      attachedMedia.value?.mime_type === "application/pdf" ||
                      attachedMedia.value?.mime_type?.includes("pdf") ||
                      attachedMedia.value?.file_type === "document" ||
                      attachedMedia.value?.file_type === "pdf" ||
                      mediaUrl.startsWith("data:application/pdf");

                    return (
                      <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center" }}>
                        {isPdf ? (
                          <div style={{ width: "100%" }}>
                            <iframe
                              src={mediaUrl}
                              style={{
                                width: "100%",
                                minHeight: "850px",
                                height: "1000px",
                                borderRadius: "0.375rem",
                                border: "1px solid var(--border)",
                                background: "#ffffff",
                              }}
                              title="Original Invoice PDF"
                            />
                          </div>
                        ) : (
                          <div
                            style={{
                              width: "100%",
                              display: "flex",
                              justifyContent: "center",
                              alignItems: "center",
                              padding: 0,
                              margin: 0,
                            }}
                          >
                            <img
                              src={mediaUrl}
                              alt={attachedMedia.value?.filename || "Original Invoice Attachment"}
                              width={800}
                              height={600}
                              style={{
                                width: "100%",
                                maxWidth: "100%",
                                height: "auto",
                                display: "block",
                                borderRadius: "0.25rem",
                              }}
                            />
                          </div>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div
                    style={{
                      padding: "4rem 2rem",
                      textAlign: "center",
                      background: "var(--surface-1)",
                      borderRadius: "0.5rem",
                      border: "1px dashed var(--border)",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "0.75rem",
                    }}
                  >
                    <div
                      style={{
                        width: "3.5rem",
                        height: "3.5rem",
                        borderRadius: "50%",
                        background: "var(--surface-3)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--text-secondary)",
                      }}
                    >
                      <LuImage style={{ width: "1.75rem", height: "1.75rem" }} />
                    </div>
                    <div style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-primary)" }}>
                      No Original Document Attached
                    </div>
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", maxWidth: "420px", lineHeight: "1.5" }}>
                      No vendor invoice screenshot or document was attached to Goods Receipt <strong>{receipt.doc_number}</strong>.
                      You can attach original vendor invoices when receiving stock via the Receive Stock panel.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Bottom Sticky Action Bar with Prominent Download Button ── */}
        <div class="bottom-action-bar">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Format: <strong>{activeFormat.value === "dotmatrix" ? "DOT Matrix (Continuous)" : activeFormat.value === "thermal" ? `Thermal POS (${thermalWidth.value})` : activeFormat.value === "standard" ? "Standard A4 (Clean)" : "Original Invoice Attachment"}</strong>
            </span>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick$={handleWhatsApp}
              disabled={isOpeningWhatsApp.value}
              style={{
                height: "2.25rem",
                padding: "0 0.875rem",
                background: "#25D366",
                border: "none",
                borderRadius: "0.375rem",
                color: "#ffffff",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
              }}
            >
              {isOpeningWhatsApp.value ? <LuLoader2 style={{ width: "0.875rem", height: "0.875rem", animation: "spin 1s linear infinite" }} /> : <WhatsAppIcon style={{ width: "0.875rem", height: "0.875rem" }} />}
              WhatsApp
            </button>
            <button
              type="button"
              onClick$={handlePrint}
              disabled={isPrinting.value}
              style={{
                height: "2.25rem",
                padding: "0 1rem",
                background: "var(--surface-3)",
                border: "1px solid var(--border)",
                borderRadius: "0.375rem",
                color: "var(--text-primary)",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.4rem",
              }}
            >
              {isPrinting.value ? <LuLoader2 style={{ width: "1rem", height: "1rem", animation: "spin 1s linear infinite" }} /> : <LuPrinter style={{ width: "1rem", height: "1rem" }} />}
              Print
            </button>
            <button
              type="button"
              onClick$={handleDownloadPdf}
              disabled={isDownloadingPdf.value}
              style={{
                height: "2.25rem",
                padding: "0 1.25rem",
                background: "var(--button-primary-bg, #2563eb)",
                border: "none",
                borderRadius: "0.375rem",
                color: "var(--button-primary-text, #ffffff)",
                fontSize: "0.875rem",
                fontWeight: "700",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.45rem",
                boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
              }}
            >
              {isDownloadingPdf.value ? <LuLoader2 style={{ width: "1rem", height: "1rem", animation: "spin 1s linear infinite" }} /> : <LuDownload style={{ width: "1rem", height: "1rem" }} />}
              {isDownloadingPdf.value ? "Saving…" : "PDF"}
            </button>
          </div>
        </div>

        {/* ── Toast Notification ── */}
        {downloadToast.value && (
          <div class="toast-banner">
            <LuDownload style={{ width: "1rem", height: "1rem" }} />
            {downloadToast.value}
          </div>
        )}
      </div>
    </div>
  );
});

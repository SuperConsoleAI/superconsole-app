// src/components/shop/CustomNewBill.tsx
//
// WHAT: Custom Wholesale POS & New Bill with inline discount % and rate overrides.
//       Built on top of the responsive SlideOver architecture of NewBillModal & DemoBillGenerator.
//
// FEATURES:
//   - Catalog Grid with search, stock limits, and rich details (MRP, discounts, schemes, pack sizes, variants)
//   - 1-line compact table item design (same as DemoBillGenerator)
//   - Inline rate (₹), Disc 1 %, Dis 2 %, Qty, Free Qty, Batch selection
//   - Live accurate GST / Tax calculations (fixed calcItemTaxRate & round-off)
//   - Clicking selected customer opens CustomerDetailSlideOver (same as NewBillModal)
//   - Segmented toggle design for % | ₹ and Cash | UPI | Bank | Credit | Cheque with high dark-mode contrast
//   - Clean padding-free and bg-free layout
//   - Checkout options: Mark Paid, Unpaid / Credit, Draft (shop_create_invoice + shop_record_payment)

/* eslint-disable qwik/no-async-prevent-default */
import {
  component$,
  useSignal,
  useTask$,
  useVisibleTask$,
  useComputed$,
  useStylesScoped$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuSearch,
  LuPlus,
  LuTrash2,
  LuRotateCcw,
  LuUser,
  LuLoader2,
  LuChevronRight,
  LuX,
  LuInfo,
  LuPencil,
} from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import { SlideOver } from "~/components/SlideOver";
import { fmtMoney } from "~/lib/fin-format";
import { CustomerLookupSlideOver, type CustomerBasic } from "~/components/shop/CustomerLookupSlideOver";
import { CustomerDetailSlideOver } from "~/components/shop/CustomerDetailSlideOver";
import { CustomerRateHistory } from "~/components/shop/CustomerRateHistory";
import { AddProductModal, type ShopCategory, type ShopCollection, type ShopUnit, type ShopItem as ModalShopItem } from "~/components/shop/AddProductModal";
import type { InvoiceDetail } from "~/components/shop/InvoiceDetailSlideOver";
import {
  type ShopItem,
  type ItemBatch,
  type TaxRate,
  type TaxConfig,
  type BilledResult,
  type PrefillBillLine,
  type SplitPaymentEntry,
  calcItemTaxRate,
  calcFreeQty,
} from "./NewBillModal";
import { ShopStaffSelector } from "./ShopStaffSelector";
import { BillShortcutsModal } from "./BillShortcutsModal";

export interface CustomBillLine {
  item: ShopItem;
  qty: number;
  free_qty: number;
  unit_price: number;
  discount_pct: number;
  extra_discount: number;
  batch?: ItemBatch | null;
  original_qty?: number;
}

export interface CustomNewBillProps {
  open: Signal<boolean>;
  customers?: Signal<CustomerBasic[]>;
  onBilled$?: PropFunction<(result: BilledResult) => void>;
  filterCategoryId?: string;
  editInvoice?: Signal<InvoiceDetail | null>;
  prefillCustomer?: Signal<CustomerBasic | null>;
  prefillCustomerName?: Signal<string>;
  prefillCustomerId?: Signal<string | null>;
  prefillLines?: Signal<PrefillBillLine[]>;
  salesOrderId?: Signal<string | null>;
}

const STYLES = `
  .cnb-layout {
    display: flex;
    gap: 1rem;
    height: 100%;
    min-height: 0;
    flex: 1;
    overflow: hidden;
    padding: 0;
    box-sizing: border-box;
  }
  .cnb-catalog-panel {
    flex: 1;
    min-width: 260px;
    max-width: 412px;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
    overflow: hidden;
    padding: 0;
  }
  .cnb-bill-panel {
    flex: 2;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    min-height: 0;
    overflow: hidden;
    margin: 0;
  }

  /* Catalog grid matching NewBillModal */
  .cnb-item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(115px, 1fr));
    gap: 0.5rem;
    overflow-y: auto;
    flex: 1;
    min-height: 140px;
    align-content: start;
    padding-right: 0.25rem;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .cnb-item-grid::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
  .cnb-item-card {
    background: var(--surface-2);
    border: 0.5px solid var(--border);
    border-radius: 0.5rem;
    overflow: hidden;
    cursor: pointer;
    transition: border-color 150ms ease, box-shadow 150ms ease;
    user-select: none;
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 85px;
    height: auto;
    flex-shrink: 0;
  }
  .cnb-item-card:hover {
    border-color: var(--accent, #3b82f6);
    box-shadow: 0 0 0 0.5px var(--accent, #3b82f6);
    transform: none;
  }
  .cnb-item-card.is-focused {
    border-color: var(--accent, #3b82f6) !important;
    box-shadow: none !important;
    outline: none;
  }
  .cnb-batch-card.is-focused {
    border-color: var(--accent, #3b82f6) !important;
    box-shadow: none !important;
    background: rgba(59, 130, 246, 0.08) !important;
  }
  .cnb-shortcut-badge {
    font-size: 0.625rem;
    font-family: monospace;
    padding: 0.1rem 0.35rem;
    border-radius: 0.25rem;
    background: var(--surface-3);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    font-weight: 600;
    line-height: 1;
    user-select: none;
    flex-shrink: 0;
  }
  .cnb-item-card.is-disabled,
  .cnb-item-card.is-out {
    opacity: 0.42 !important;
    filter: grayscale(0.85) !important;
    cursor: not-allowed !important;
  }
  .cnb-item-card.is-disabled:hover,
  .cnb-item-card.is-out:hover {
    border-color: var(--border) !important;
    box-shadow: none !important;
    cursor: not-allowed !important;
  }
  .cnb-item-info {
    padding: 0.45rem 0.55rem;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 0.2rem;
    flex: 1;
    overflow: visible;
  }
  .cnb-item-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.3;
    word-break: break-word;
  }
  .cnb-item-price-val {
    font-size: 0.875rem;
    font-weight: 700;
    color: var(--accent, #3b82f6);
    font-variant-numeric: tabular-nums;
  }
  .cnb-card-actions {
    position: absolute;
    bottom: 0.35rem;
    right: 0.35rem;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    opacity: 0;
    pointer-events: none;
    z-index: 3;
  }
  .cnb-item-card:hover .cnb-card-actions {
    opacity: 1;
    pointer-events: auto;
  }
  .cnb-card-edit-btn,
  .cnb-card-info-btn {
    width: 1.35rem;
    height: 1.35rem;
    background: var(--surface-2);
    border: 0.5px solid var(--border);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    border-radius: 0.25rem;
    padding: 0;
    transition: all 0.15s ease;
  }
  .cnb-card-edit-btn:hover,
  .cnb-card-info-btn:hover {
    color: var(--accent, #3b82f6);
    border-color: var(--accent, #3b82f6);
    box-shadow: 0 0 0 0.5px var(--accent, #3b82f6);
    background: var(--surface-1);
  }
  .cnb-row-edit-btn,
  .cnb-row-info-btn {
    background: transparent;
    border: 0.5px solid transparent;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0.1rem 0.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    pointer-events: none;
    flex-shrink: 0;
    border-radius: 0.25rem;
    transition: color 0.15s, border-color 0.15s, box-shadow 0.15s, background-color 0.15s, opacity 0.15s;
  }
  tr:hover .cnb-row-edit-btn,
  tr:hover .cnb-row-info-btn {
    opacity: 1;
    pointer-events: auto;
  }
  .cnb-row-edit-btn:hover,
  .cnb-row-info-btn:hover {
    color: var(--accent, #3b82f6);
    border-color: var(--accent, #3b82f6);
    box-shadow: 0 0 0 0.5px var(--accent, #3b82f6);
    background: var(--surface-3);
  }

  /* 1-Line Items Table matching DemoBillGenerator */
  .cnb-table-container {
    flex: 1;
    overflow-x: auto;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    min-height: 0;
  }
  .cnb-table {
    width: 100%;
    min-width: 630px;
    border-collapse: collapse;
    font-size: 0.75rem;
  }
  .cnb-table th {
    background: var(--surface-3);
    padding: 0.4rem 0.35rem;
    font-weight: 600;
    text-align: left;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 2;
  }
  .cnb-table th:first-child {
    padding-left: 0.5rem;
  }
  .cnb-table td {
    padding: 0.28rem 0.35rem;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
    vertical-align: middle;
  }
  .cnb-table td:first-child {
    padding-left: 0.5rem;
  }
  .cnb-table-input {
    width: 100%;
    padding: 0.22rem 0.35rem;
    font-size: 0.75rem;
    background: var(--surface-1);
    border: 1px solid var(--border);
    border-radius: 0.25rem;
    color: var(--text-primary);
    box-sizing: border-box;
  }
  .cnb-table-input:focus {
    outline: none;
    border-color: var(--accent, #3b82f6);
  }
  .cnb-table-batch-btn {
    background: var(--surface-1);
    border: 1px dashed var(--border);
    border-radius: 0.25rem;
    padding: 0.2rem 0.45rem;
    font-size: 0.7rem;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    display: inline-block;
  }
  .cnb-table-batch-btn.active {
    background: rgba(59,130,246,0.12);
    border-color: rgba(59,130,246,0.3);
    color: #3b82f6;
    font-weight: 600;
  }
  .cnb-table-trash-btn {
    background: transparent;
    border: none;
    color: var(--error, #ef4444);
    cursor: pointer;
    padding: 0.2rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 0.25rem;
  }
  .cnb-table-trash-btn:hover {
    background: rgba(239,68,68,0.1);
  }

  /* Segmented Toggle Control (% | ₹ and Payment Modes) */
  .cnb-toggle-wrap {
    display: inline-flex;
    align-items: center;
    background: var(--surface-3);
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    padding: 2px;
    gap: 2px;
  }
  .cnb-toggle-btn {
    padding: 0.2rem 0.55rem;
    font-size: 0.72rem;
    border-radius: 0.25rem;
    border: 1px solid transparent;
    cursor: pointer;
    background: transparent;
    color: var(--text-secondary);
    transition: all 0.15s ease;
    font-weight: 500;
    line-height: 1.2;
    white-space: nowrap;
    user-select: none;
  }
  .cnb-toggle-btn:hover {
    color: var(--text-primary);
  }
  .cnb-toggle-btn.active {
    background: var(--surface-1);
    color: var(--text-primary) !important;
    border-color: var(--border);
    font-weight: 700;
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.15);
  }

  .cnb-mode-label {
    font-size: 0.72rem;
    color: var(--text-secondary);
  }

  /* Responsive Media Queries */
  @media (max-width: 900px) {
    .cnb-layout {
      flex-direction: column !important;
      overflow-y: auto !important;
    }
    .cnb-catalog-panel {
      max-width: 100% !important;
      height: 280px !important;
      flex-shrink: 0 !important;
      padding: 0 !important;
    }
    .cnb-bill-panel {
      width: 100% !important;
      flex: 1 0 auto !important;
      margin: 0 !important;
    }
  }

  @media (max-width: 640px) {
    .cnb-layout {
      gap: 0.5rem !important;
    }
    .cnb-catalog-panel {
      height: 220px !important;
    }
    .cnb-mode-label {
      display: none !important;
    }
    .cnb-toggle-btn {
      padding: 0.2rem 0.4rem;
      font-size: 0.68rem;
    }
  }
`;

export const CustomNewBill = component$<CustomNewBillProps>((props) => {
  useStylesScoped$(STYLES);

  // ── Signals ─────────────────────────────────────────────────────────────────
  const allItems = useSignal<ShopItem[]>([]);
  const stockMap = useSignal<Record<string, number>>({});
  const allBatches = useSignal<ItemBatch[]>([]);
  const taxRates = useSignal<TaxRate[]>([]);
  const taxConfig = useSignal<TaxConfig | null>(null);
  const isTaxExempt = useComputed$(() => {
    const r = (taxConfig.value?.regime || "").toLowerCase().trim();
    return r === "none" || r === "exempt";
  });
  const loading = useSignal(false);
  const loaded = useSignal(false);
  const submitting = useSignal(false);
  const errorMsg = useSignal<string | null>(null);

  // Search & Catalog
  const query = useSignal("");
  const enforceStockLimit = useSignal(false);
  const focusedCatalogIndex = useSignal<number>(-1);
  const focusedBatchIndex = useSignal<number>(0);

  // The Active Running Custom Bill
  const bill = useSignal<CustomBillLine[]>([]);

  // Customer Management
  const fallbackCustomers = useSignal<CustomerBasic[]>([]);
  const effectiveCustomers = props.customers || fallbackCustomers;
  const pickedCustomer = useSignal<CustomerBasic | null>(props.prefillCustomer?.value || null);
  const showCustPicker = useSignal(false);
  const showCustomerDetail = useSignal(false);

  // Batch Picker Modal matching NewBillModal
  const batchPickerOpen = useSignal(false);
  const batchPickerItem = useSignal<ShopItem | null>(null);
  const batchPickerList = useSignal<ItemBatch[]>([]);
  const batchPickerTargetLineIndex = useSignal<number | null>(null);
  const batchMap = useSignal<Record<string, ItemBatch[]>>({});

  // Whole-Bill Extra Discount (Optional Flat ₹ or %)
  const orderDiscountMode = useSignal<"pct" | "flat">("pct");
  const orderDiscountPct = useSignal<number>(0);
  const orderDiscountAmt = useSignal<number>(0);

  // Checkout State
  const paymentMode = useSignal("cash");
  const billNotes = useSignal("");
  const staffList = useSignal<Array<{ id: string; name: string; display_name?: string; role?: string }>>([]);
  const selectedStaffId = useSignal<string | null>(null);
  const hasPrefilled = useSignal(false);

  // Split / Partial Payment State
  const showPartialPayModal = useSignal(false);
  const splitPayments = useSignal<SplitPaymentEntry[]>([]);
  const splitTenderAmt = useSignal<string>("");

  // Rate History Modal
  const showRateHistory = useSignal(false);
  const rateHistoryItemId = useSignal<string | null>(null);
  const rateHistoryItemName = useSignal<string>("");

  // Quick Add Product Modal
  const categories = useSignal<ShopCategory[]>([]);
  const collections = useSignal<ShopCollection[]>([]);
  const units = useSignal<ShopUnit[]>([]);
  const showAddProductModal = useSignal(false);
  const editingProduct = useSignal<ModalShopItem | null>(null);

  // Keyboard Shortcuts Cheatsheet Modal
  const showShortcutsModal = useSignal(false);

  const isEditMode = useComputed$(() => !!(props.editInvoice?.value));

  // ── Reset Form State on Close (keeps catalog cached in memory) ───────────────
  useTask$(({ track }) => {
    const isOpen = track(() => props.open.value);
    if (!isOpen) {
      bill.value = [];
      errorMsg.value = null;
      query.value = "";
      focusedCatalogIndex.value = -1;
      focusedBatchIndex.value = 0;
      orderDiscountPct.value = 0;
      orderDiscountAmt.value = 0;
      paymentMode.value = "cash";
      billNotes.value = "";
      batchPickerOpen.value = false;
      batchPickerItem.value = null;
      batchPickerList.value = [];
      batchPickerTargetLineIndex.value = null;
      showCustPicker.value = false;
      showCustomerDetail.value = false;
      showShortcutsModal.value = false;
      hasPrefilled.value = false;
      pickedCustomer.value = null;
      showPartialPayModal.value = false;
      splitPayments.value = [];
      splitTenderAmt.value = "";
    } else if (props.prefillCustomer?.value) {
      pickedCustomer.value = props.prefillCustomer.value;
    }
  });

  // ── Pre-fill from editInvoice when opened in edit mode ───────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const inv = track(() => props.editInvoice?.value);
    const isOpen = track(() => props.open.value);
    if (!inv || !isOpen) return;

    if (inv.customer_name) {
      if (inv.customer_id && props.customers?.value) {
        const matched = props.customers.value.find((c) => c.id === inv.customer_id);
        if (matched) {
          pickedCustomer.value = matched;
        } else {
          pickedCustomer.value = {
            id: inv.customer_id,
            name: inv.customer_name,
            phone: inv.customer_phone || "",
            email: "",
            city: inv.customer_city || "",
            state: inv.customer_state || "",
            gstin: inv.customer_gstin || "",
          };
        }
      } else {
        pickedCustomer.value = {
          id: inv.customer_id || "temp-cust",
          name: inv.customer_name,
          phone: inv.customer_phone || "",
          email: "",
          city: inv.customer_city || "",
          state: inv.customer_state || "",
          gstin: inv.customer_gstin || "",
        };
      }
    }

    if (inv.notes) {
      billNotes.value = inv.notes;
    }

    if (inv.payment_mode) {
      paymentMode.value = inv.payment_mode.toLowerCase() as any;
    }

    if (inv.bill_discount_pct && inv.bill_discount_pct > 0) {
      orderDiscountMode.value = "pct";
      orderDiscountPct.value = inv.bill_discount_pct;
      orderDiscountAmt.value = 0;
    } else if (inv.bill_discount_amt && inv.bill_discount_amt > 0) {
      orderDiscountMode.value = "flat";
      orderDiscountAmt.value = inv.bill_discount_amt;
      orderDiscountPct.value = 0;
    }

    if ((inv as any).staff_id) {
      selectedStaffId.value = (inv as any).staff_id;
    }

    invoke<any[]>("shop_list_staff", {})
      .then((res) => { staffList.value = res || []; })
      .catch(() => { });

    const parseLineDiscounts = (l: any) => {
      let d1 = l.discount_pct ?? 0;
      let d2 = 0;
      let pack: string | undefined = l.pack_size ?? undefined;
      let hsn: string | undefined = l.hsn_sac_code ?? undefined;
      let batchNo: string | undefined = l.batch_no ?? undefined;
      let shelf: string | undefined = l.shelf_location ?? undefined;
      let original_qty: number | undefined = undefined;
      let return_qty: number | undefined = undefined;
      let billed_qty: number | undefined = undefined;
      if (l.line_meta) {
        try {
          const m = typeof l.line_meta === "string" ? JSON.parse(l.line_meta) : l.line_meta;
          d2 = Number(m.extra_discount ?? m.discount2 ?? m.dis2 ?? 0);
          if (m.discount_pct !== undefined) d1 = Number(m.discount_pct);
          else if (m.dis1 !== undefined) d1 = Number(m.dis1);
          else if (d2 > 0) d1 = Math.max(0, d1 - d2);
          if (!pack) pack = m.pack_size || m.pack || undefined;
          if (!hsn) hsn = m.hsn_sac_code || m.hsn || undefined;
          if (!batchNo) batchNo = m.batch_no || m.batch || undefined;
          if (!shelf) shelf = m.shelf_id || m.shelf_location || undefined;
          if (m.original_qty !== undefined) original_qty = Number(m.original_qty);
          if (m.return_qty !== undefined) return_qty = Number(m.return_qty);
          if (m.billed_qty !== undefined) billed_qty = Number(m.billed_qty);
        } catch { /* noop */ }
      }
      return { d1, d2, pack, hsn, batchNo, shelf, original_qty, return_qty, billed_qty };
    };

    const mapInvoiceLinesToBill = (lines: any[]) => {
      return lines.map((l) => {
        const meta = parseLineDiscounts(l);
        const origQty = l.original_qty ?? (meta.original_qty !== undefined ? meta.original_qty : (inv.status !== "draft" ? l.qty : undefined));
        const matchedItem = allItems.value.find((i) => i.id === l.item_id);
        const item: ShopItem = matchedItem
          ? {
            ...matchedItem,
            price: l.unit_price,
            default_mrp: l.mrp || matchedItem.default_mrp || 0,
            pack_size: meta.pack || matchedItem.pack_size,
            conversion_factor: l.conversion_factor || matchedItem.conversion_factor,
            scheme_on: l.scheme_on ?? matchedItem.scheme_on,
            scheme_free: l.scheme_free ?? matchedItem.scheme_free,
            hsn_sac_code: meta.hsn || matchedItem.hsn_sac_code,
          }
          : {
            id: l.item_id,
            name: l.description || l.item_id,
            price: l.unit_price,
            item_type: "physical",
            category_id: "cat_6",
            default_mrp: l.mrp || 0,
            discount_pct: meta.d1,
            extra_discount: meta.d2,
            pack_size: meta.pack || undefined,
            conversion_factor: l.conversion_factor || 1,
            scheme_on: l.scheme_on || 0,
            scheme_free: l.scheme_free || 0,
            hsn_sac_code: meta.hsn || undefined,
          };

        const batch: ItemBatch | null = (l.batch_id || meta.batchNo)
          ? allBatches.value.find(
            (b) => b.id === l.batch_id || (meta.batchNo && b.batch_no === meta.batchNo && b.item_id === l.item_id)
          ) || {
            id: l.batch_id || `batch-${Math.random()}`,
            profile_id: "",
            item_id: l.item_id,
            batch_no: meta.batchNo || l.batch_no || "—",
            mrp: l.mrp || 0,
            purchase_price: l.unit_price || 0,
            landing_cost: l.unit_price || 0,
            qty_received: 0,
            qty_remaining: 0,
            pack_size: meta.pack || null,
            conversion_factor: l.conversion_factor || 1,
            expiry_date: l.expiry_date
              ? typeof l.expiry_date === "number"
                ? l.expiry_date
                : Math.floor(new Date(l.expiry_date).getTime() / 1000) || 0
              : 0,
            shelf_location: meta.shelf || l.shelf_location || null,
            is_active: 1,
          }
          : null;

        return {
          item,
          qty: l.qty,
          free_qty: l.free_qty || 0,
          unit_price: l.unit_price,
          discount_pct: meta.d1,
          extra_discount: meta.d2,
          batch,
          original_qty: origQty,
        };
      });
    };

    if (inv.lines && inv.lines.length > 0) {
      bill.value = mapInvoiceLinesToBill(inv.lines);
      hasPrefilled.value = true;
    } else {
      loading.value = true;
      try {
        const detail = await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: inv.id });
        if (detail) {
          if (props.editInvoice) props.editInvoice.value = detail;
          bill.value = mapInvoiceLinesToBill(detail.lines);
          hasPrefilled.value = true;
        }
      } catch (err) {
        console.error("[CustomNewBill] failed to lazy load invoice lines:", err);
      } finally {
        loading.value = false;
      }
    }
  });

  // ── Prefill Lines & Customer (from B2B Sales Orders) ──────────────────────────
  useTask$(({ track }) => {
    const isOpen = track(() => props.open.value);
    const prefill = track(() => props.prefillLines?.value);
    const custPrefill = track(() => props.prefillCustomerName?.value);
    const custIdPrefill = track(() => props.prefillCustomerId?.value);
    const custObjPrefill = track(() => props.prefillCustomer?.value);
    const items = track(() => allItems.value);
    const custList = track(() => props.customers?.value);

    if (!isOpen) {
      hasPrefilled.value = false;
      return;
    }

    if (isOpen) {
      if (custObjPrefill) {
        pickedCustomer.value = custObjPrefill;
      } else if (custPrefill) {
        if (custIdPrefill && custList && custList.length > 0) {
          const matchedCust = custList.find((c) => c.id === custIdPrefill);
          if (matchedCust) {
            pickedCustomer.value = matchedCust;
          }
        }
      }

      if (prefill && prefill.length > 0 && !hasPrefilled.value) {
        if (items.length > 0 || loaded.value) {
          const initialBill: CustomBillLine[] = [];
          for (const pl of prefill) {
            let matched = items.find((i) => i.id === pl.itemId);
            if (!matched && pl.name) {
              matched = items.find((i) => i.name.toLowerCase() === pl.name.toLowerCase());
            }
            if (matched) {
              initialBill.push({
                item: {
                  ...matched,
                  price: pl.price !== undefined ? pl.price : matched.price,
                  pack_size: pl.pack_size || matched.pack_size,
                  conversion_factor: pl.conversion_factor || matched.conversion_factor,
                  scheme_on: pl.scheme_on ?? matched.scheme_on,
                  scheme_free: pl.scheme_free ?? matched.scheme_free,
                },
                qty: pl.qty,
                free_qty: pl.free_qty !== undefined ? pl.free_qty : calcFreeQty(pl.qty, matched),
                unit_price: pl.price !== undefined ? pl.price : (matched.unit_price || matched.price || 0),
                discount_pct: pl.discount_pct !== undefined ? pl.discount_pct : (matched.discount_pct || 0),
                extra_discount: pl.extra_discount !== undefined ? pl.extra_discount : ((matched as any).extra_discount || 0),
                batch: pl.batch || null,
              });
            } else {
              initialBill.push({
                item: {
                  id: pl.itemId || `temp-${Math.random()}`,
                  name: pl.name,
                  price: pl.price || 0,
                  item_type: "physical",
                  category_id: "cat_6",
                  default_mrp: pl.price || 0,
                  discount_pct: pl.discount_pct || 0,
                  extra_discount: pl.extra_discount || 0,
                  pack_size: pl.pack_size || undefined,
                  conversion_factor: pl.conversion_factor || 1,
                  scheme_on: pl.scheme_on || 0,
                  scheme_free: pl.scheme_free || 0,
                },
                qty: pl.qty,
                free_qty: pl.free_qty || 0,
                unit_price: pl.price || 0,
                discount_pct: pl.discount_pct || 0,
                extra_discount: pl.extra_discount || 0,
                batch: pl.batch || null,
              });
            }
          }
          bill.value = initialBill;
          hasPrefilled.value = true;
        }
      }
    }
  });

  // ── Load Catalog, Variants & Tax Settings (Loads ONCE, 0ms on subsequent opens) ───
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track, cleanup }) => {
    const isOpen = track(() => props.open.value);
    if (!isOpen || loaded.value) return;

    loading.value = true;
    try {
      const [items, positions, rates, tConfig, batches, variants, staff, cats, colls, uns] = await Promise.all([
        invoke<ShopItem[]>("shop_list_items", {}).catch(() => []),
        invoke<any[]>("shop_get_stock_position", {}).catch(() => []),
        invoke<TaxRate[]>("fin_list_tax_rates", {}).catch(() => []),
        invoke<TaxConfig>("fin_get_tax_config", {}).catch(() => null),
        invoke<ItemBatch[]>("shop_list_all_active_batches", {}).catch(() => []),
        invoke<Array<{
          id: string;
          item_id: string;
          name: string;
          sku?: string;
          barcode?: string;
          price?: number;
          price_delta: number;
          media_url?: string;
          seo_og_image?: string;
          stock_qty?: number;
          discount_pct?: number;
          tax_rate_id?: string;
          is_taxable?: number;
          tax_inclusive?: number;
          track_inventory?: number;
        }>>("shop_list_all_active_variants", {}).catch(() => []),
        invoke<any[]>("shop_list_staff", {}).catch(() => []),
        invoke<ShopCategory[]>("shop_list_categories", {}).catch(() => []),
        invoke<ShopCollection[]>("shop_list_collections", {}).catch(() => []),
        invoke<ShopUnit[]>("shop_list_units", {}).catch(() => []),
      ]);

      taxRates.value = Array.isArray(rates) ? rates : [];
      taxConfig.value = tConfig || null;
      allBatches.value = Array.isArray(batches) ? batches : [];
      staffList.value = Array.isArray(staff) ? staff : [];
      categories.value = Array.isArray(cats) ? cats : [];
      collections.value = Array.isArray(colls) ? colls : [];
      units.value = Array.isArray(uns) ? uns : [];

      if (!props.editInvoice?.value) {
        const savedStaffId = typeof localStorage !== "undefined" ? localStorage.getItem("bk-active-staff-id") : null;
        if (savedStaffId) {
          selectedStaffId.value = savedStaffId;
        }
      }

      const handleStaffChange = (e: any) => {
        if (!props.editInvoice?.value) {
          selectedStaffId.value = e.detail || null;
        }
      };
      if (typeof window !== "undefined") {
        window.addEventListener("bk-staff-changed", handleStaffChange);
        cleanup(() => {
          window.removeEventListener("bk-staff-changed", handleStaffChange);
        });
      }

      const activeRawItems = (Array.isArray(items) ? items : []).filter(
        (item) => ((item as any).archived !== 1 && (item as any).archived !== true) && ((item as any).is_active === undefined || (item as any).is_active === 1 || (item as any).is_active === true)
      );
      const activeVariants = (Array.isArray(variants) ? variants : []).filter(
        (v) => (v as any).is_active === undefined || (v as any).is_active === 1 || (v as any).is_active === true
      );

      const bMap: Record<string, ItemBatch[]> = {};
      if (Array.isArray(batches)) {
        for (const b of batches) {
          if (!bMap[b.item_id]) bMap[b.item_id] = [];
          bMap[b.item_id].push(b);
        }
      }

      const map: Record<string, number> = {};
      if (Array.isArray(positions)) {
        for (const p of positions) {
          if (p.item_id) {
            const q = (p.qty_on_hand !== undefined ? p.qty_on_hand : (p as any).quantity_on_hand) ?? 0;
            map[p.item_id] = (map[p.item_id] ?? 0) + q;
          }
        }
      }

      for (const v of activeVariants) {
        const vStockVal = v.stock_qty !== undefined ? v.stock_qty : 0;
        map[v.id] = Math.max(map[v.id] ?? 0, vStockVal);
      }
      for (const it of activeRawItems) {
        const itStockVal = (it as any).stock_qty !== undefined ? (it as any).stock_qty : 0;
        map[it.id] = Math.max(map[it.id] ?? 0, itStockVal);
      }
      for (const [itemId, bList] of Object.entries(bMap)) {
        const bSum = bList.reduce((sum, b) => sum + Math.max(0, b.qty_remaining || 0), 0);
        if (bSum > 0) {
          map[itemId] = Math.max(map[itemId] ?? 0, bSum);
        }
      }
      stockMap.value = map;

      // Expand variants exactly matching NewBillModal
      const expandedItems: ShopItem[] = [];
      for (const item of activeRawItems) {
        const itemVars = activeVariants.filter((v) => v.item_id === item.id);
        if (item.has_variants === 1 && itemVars.length > 0) {
          for (const v of itemVars) {
            const vPrice = v.price !== undefined && v.price !== null && v.price !== 0
              ? v.price
              : ((v.price_delta || 0) !== 0 ? (item.price + v.price_delta) : item.price);

            const hasDirectBatches = Array.isArray(bMap[v.id]) && bMap[v.id].length > 0;
            if (!hasDirectBatches && bMap[item.id] && bMap[item.id].some(b => b.qty_remaining > 0)) {
              bMap[v.id] = bMap[item.id];
            }

            const vPosStock = map[v.id] !== undefined ? map[v.id] : (v.stock_qty !== undefined ? v.stock_qty : 0);
            const vDirectBatchStock = hasDirectBatches
              ? (bMap[v.id]?.filter(b => (b.is_active === 1 || (b as any).is_active === undefined) && b.qty_remaining > 0).reduce((sum, b) => sum + b.qty_remaining, 0) ?? 0)
              : 0;

            const vStock = hasDirectBatches && vDirectBatchStock > 0
              ? Math.max(vDirectBatchStock, vPosStock)
              : vPosStock;
            map[v.id] = vStock;

            expandedItems.push({
              ...item,
              id: v.id,
              name: `${item.name} — ${v.name}`,
              price: vPrice,
              sku: v.sku || item.sku,
              media_url: v.media_url || item.media_url,
              seo_og_image: v.seo_og_image || v.media_url || item.seo_og_image,
              stock_qty: vStock,
              track_inventory: v.track_inventory !== undefined ? v.track_inventory : item.track_inventory,
              discount_pct: v.discount_pct || item.discount_pct || 0,
              extra_discount: (v as any).extra_discount || item.extra_discount || 0,
              pack_size: (v as any).pack_size || item.pack_size,
              conversion_factor: (v as any).conversion_factor || item.conversion_factor,
              scheme_on: (v as any).scheme_on || item.scheme_on || 0,
              scheme_free: (v as any).scheme_free || item.scheme_free || 0,
              tax_rate_id: (v as any).tax_rate_id || item.tax_rate_id,
              is_taxable: (v as any).is_taxable ?? item.is_taxable,
              tax_inclusive: (v as any).tax_inclusive ?? item.tax_inclusive,
              parent_item_id: item.id,
              is_active: 1,
            } as any);
          }
        } else {
          expandedItems.push(item);
        }
      }
      batchMap.value = bMap;
      allItems.value = expandedItems;
      loaded.value = true;
    } catch (err) {
      console.error("[CustomNewBill] failed to load catalog:", err);
      errorMsg.value = "Failed to load products or tax rates";
    } finally {
      loading.value = false;
    }
  });

  // ── Filtered Catalog ────────────────────────────────────────────────────────
  const filteredItems = useComputed$(() => {
    const targetCatId = props.filterCategoryId || "cat_6";
    let list = allItems.value.filter(
      (i) => ((i as any).archived !== 1 && (i as any).archived !== true) && ((i as any).is_active === undefined || (i as any).is_active === 1 || (i as any).is_active === true)
    );
    if (targetCatId) {
      list = list.filter((i) =>
        i.category_id === targetCatId ||
        (targetCatId === "cat_6" &&
          (i.item_type === "physical" || !i.category_id || i.category_id === "cat_6") &&
          i.category_id !== "cat_28" &&
          i.category_id !== "cat_29")
      );
    }
    const q = query.value.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.sku && i.sku.toLowerCase().includes(q)) ||
        ((i as any).barcode && (i as any).barcode.toLowerCase().includes(q))
    );
  });

  // ── Keyboard Navigation Helpers ─────────────────────────────────────────────
  const focusSearchInput = $(() => {
    focusedCatalogIndex.value = -1;
    setTimeout(() => {
      const searchInput = document.getElementById("cnb-search-input") as HTMLInputElement;
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    }, 20);
  });

  const focusTableRowInput = $((rowIndex: number, field: "qty" | "free" | "price" | "disc" | "extra") => {
    focusedCatalogIndex.value = -1;
    setTimeout(() => {
      const el = document.getElementById(`cnb-${field}-${rowIndex}`) as HTMLInputElement;
      if (el) {
        el.focus();
        el.select();
      }
    }, 30);
  });

  const focusNextTableInput = $((rowIndex: number, currentField: "qty" | "free" | "price" | "disc" | "extra") => {
    if (currentField === "qty") {
      focusTableRowInput(rowIndex, "free");
    } else if (currentField === "free") {
      focusTableRowInput(rowIndex, "price");
    } else if (currentField === "price") {
      focusTableRowInput(rowIndex, "disc");
    } else if (currentField === "disc") {
      focusTableRowInput(rowIndex, "extra");
    } else if (currentField === "extra") {
      if (rowIndex < bill.value.length - 1) {
        focusTableRowInput(rowIndex + 1, "qty");
      } else {
        // Loops straight back to search bar for next item
        focusSearchInput();
      }
    }
  });

  const focusPrevTableInput = $((rowIndex: number, currentField: "qty" | "free" | "price" | "disc" | "extra") => {
    if (currentField === "extra") {
      focusTableRowInput(rowIndex, "disc");
    } else if (currentField === "disc") {
      focusTableRowInput(rowIndex, "price");
    } else if (currentField === "price") {
      focusTableRowInput(rowIndex, "free");
    } else if (currentField === "free") {
      focusTableRowInput(rowIndex, "qty");
    } else if (currentField === "qty") {
      if (rowIndex > 0) {
        focusTableRowInput(rowIndex - 1, "extra");
      } else {
        focusSearchInput();
      }
    }
  });

  const focusVerticalTableInput = $((rowIndex: number, field: "qty" | "free" | "price" | "disc" | "extra", direction: "up" | "down") => {
    if (direction === "up") {
      if (rowIndex > 0) {
        focusTableRowInput(rowIndex - 1, field);
      } else {
        focusSearchInput();
      }
    } else {
      if (rowIndex < bill.value.length - 1) {
        focusTableRowInput(rowIndex + 1, field);
      }
    }
  });

  // ── Cart Actions ────────────────────────────────────────────────────────────
  const openBatchPickerForLine = $(async (lineIdx: number) => {
    const line = bill.value[lineIdx];
    if (!line) return;
    try {
      let batches = batchMap.value[line.item.id];
      const parentId = (line.item as any).parent_item_id || (line.item as any).item_id;
      if ((!batches || batches.length === 0) && parentId && batchMap.value[parentId]) {
        batches = batchMap.value[parentId];
      }
      if (batches === undefined || batches.length === 0) {
        batches = await invoke<ItemBatch[]>("shop_list_item_batches", { itemId: line.item.id }).catch(() => []);
        if ((!batches || batches.length === 0) && parentId) {
          const parentBatches = await invoke<ItemBatch[]>("shop_list_item_batches", { itemId: parentId }).catch(() => []);
          if (parentBatches && parentBatches.length > 0) {
            batches = parentBatches;
          }
        }
        if (batches && batches.length > 0) {
          batchMap.value = { ...batchMap.value, [line.item.id]: batches };
        }
      }
      batchPickerItem.value = line.item;
      batchPickerList.value = batches || [];
      batchPickerTargetLineIndex.value = lineIdx;
      batchPickerOpen.value = true;
    } catch (err) {
      console.warn("[CustomNewBill] Failed to load batches for line:", err);
    }
  });

  const selectBatchForBill = $((batch: ItemBatch) => {
    let targetIdx = 0;
    if (batchPickerTargetLineIndex.value !== null) {
      const idx = batchPickerTargetLineIndex.value;
      const copy = [...bill.value];
      if (copy[idx]) {
        const line = copy[idx];
        const isTracked = line.item.track_inventory === 1 || Boolean((line.item as any).track_inventory);
        const trackInv = enforceStockLimit.value && isTracked;
        const nextQty = trackInv ? Math.min(line.qty, batch.qty_remaining) : line.qty;
        copy[idx] = {
          ...line,
          batch,
          qty: nextQty,
          free_qty: calcFreeQty(nextQty, line.item),
        };
        bill.value = copy;
        targetIdx = idx;
      }
    } else if (batchPickerItem.value) {
      const item = batchPickerItem.value;
      const isTracked = item.track_inventory === 1 || Boolean((item as any).track_inventory);
      const trackInv = enforceStockLimit.value && isTracked;
      const itemStock = stockMap.value[item.id] ?? (item as any).stock_qty ?? batch.qty_remaining;
      const effectiveLimit = trackInv ? Math.min(batch.qty_remaining, itemStock) : batch.qty_remaining;

      const inCart = bill.value.filter(l => l.item.id === item.id && l.batch?.id === batch.id).reduce((s, l) => s + l.qty, 0);
      const totalInCart = bill.value.filter(l => l.item.id === item.id).reduce((s, l) => s + l.qty, 0);
      const batchRem = effectiveLimit - inCart;

      if (trackInv && (batchRem <= 0 || totalInCart >= itemStock)) {
        batchPickerOpen.value = false;
        batchPickerItem.value = null;
        batchPickerTargetLineIndex.value = null;
        return;
      }
      const existing = bill.value.findIndex((l) => l.item.id === item.id && l.batch?.id === batch.id);
      if (existing >= 0) {
        const copy = [...bill.value];
        const currentQty = copy[existing].qty;
        if (trackInv && (currentQty >= effectiveLimit || totalInCart >= itemStock)) {
          batchPickerOpen.value = false;
          batchPickerItem.value = null;
          batchPickerTargetLineIndex.value = null;
          return;
        }
        const nextQty = trackInv ? Math.min(currentQty + 1, effectiveLimit) : currentQty + 1;
        copy[existing] = {
          ...copy[existing],
          qty: nextQty,
          free_qty: calcFreeQty(nextQty, copy[existing].item),
        };
        bill.value = copy;
        targetIdx = existing;
      } else {
        const basePrice = item.unit_price || item.price || 0;
        bill.value = [
          ...bill.value,
          {
            item,
            qty: 1,
            free_qty: calcFreeQty(1, item),
            unit_price: basePrice,
            discount_pct: item.discount_pct || 0,
            extra_discount: (item as any).extra_discount || 0,
            batch,
          },
        ];
        targetIdx = bill.value.length - 1;
      }
    }
    batchPickerOpen.value = false;
    batchPickerItem.value = null;
    batchPickerTargetLineIndex.value = null;
    focusTableRowInput(targetIdx, "qty");
  });

  const addItem = $(async (item: ShopItem) => {
    try {
      const parentId = (item as any).parent_item_id || (item as any).item_id;
      let directBatches = batchMap.value[item.id];
      let batches = directBatches || (parentId ? batchMap.value[parentId] : undefined);
      if (batches === undefined) {
        batches = await invoke<ItemBatch[]>("shop_list_item_batches", { itemId: item.id }).catch(() => []);
        if ((!batches || batches.length === 0) && parentId) {
          const parentBatches = await invoke<ItemBatch[]>("shop_list_item_batches", { itemId: parentId }).catch(() => []);
          if (parentBatches && parentBatches.length > 0) {
            batches = parentBatches;
          }
        }
        if (batches && batches.length > 0) {
          batchMap.value = { ...batchMap.value, [item.id]: batches };
        }
      }
      directBatches = batchMap.value[item.id];

      const isTracked = item.track_inventory === 1 || Boolean((item as any).track_inventory);
      const trackInv = enforceStockLimit.value && isTracked;

      const availableBatches = Array.isArray(batches)
        ? batches.filter((b) => (b.is_active === 1 || (b as any).is_active === undefined) && b.qty_remaining > 0)
        : [];

      const posStock = stockMap.value[item.id] ?? (item as any).stock_qty ?? 0;
      const hasDirectBatches = Array.isArray(directBatches) && directBatches.length > 0;
      const directBatchStock = hasDirectBatches
        ? directBatches.filter((b) => (b.is_active === 1 || (b as any).is_active === undefined) && b.qty_remaining > 0).reduce((s, b) => s + b.qty_remaining, 0)
        : 0;

      const totalStock = hasDirectBatches && directBatchStock > 0
        ? Math.max(directBatchStock, posStock)
        : posStock;

      const inCartTotal = bill.value
        .filter((l) => l.item.id === item.id)
        .reduce((s, l) => s + l.qty, 0);

      // If stock limit is active and item is tracked, check overall remaining stock
      if (trackInv && inCartTotal >= totalStock) {
        return; // Truly out of stock or cart reached max limit
      }

      // If multiple active positive batches exist, show batch picker so user chooses
      if (availableBatches.length > 1) {
        batchPickerItem.value = item;
        batchPickerList.value = batches || availableBatches;
        batchPickerTargetLineIndex.value = null;
        batchPickerOpen.value = true;
        return;
      }

      const basePrice = item.unit_price || item.price || 0;
      const defaultDiscount = item.discount_pct || 0;
      const defaultExtra = (item as any).extra_discount || 0;

      // If exactly one active batch with positive stock exists, attach it
      if (availableBatches.length === 1) {
        const singleBatch = availableBatches[0];
        const effectiveBatchLimit = trackInv ? Math.min(singleBatch.qty_remaining, totalStock) : singleBatch.qty_remaining;
        const inCartForBatch = bill.value
          .filter((l) => l.item.id === item.id && l.batch?.id === singleBatch.id)
          .reduce((s, l) => s + l.qty, 0);

        if (trackInv && (inCartForBatch >= effectiveBatchLimit || inCartTotal >= totalStock)) {
          return;
        }

        const existingIdx = bill.value.findIndex((l) => l.item.id === item.id && (!singleBatch || l.batch?.id === singleBatch.id));
        if (existingIdx >= 0) {
          const copy = [...bill.value];
          const currentQty = copy[existingIdx].qty;
          if (trackInv && (currentQty >= effectiveBatchLimit || inCartTotal >= totalStock)) return;
          const nextQty = trackInv ? Math.min(currentQty + 1, effectiveBatchLimit) : currentQty + 1;
          copy[existingIdx] = {
            ...copy[existingIdx],
            qty: nextQty,
            free_qty: calcFreeQty(nextQty, copy[existingIdx].item),
          };
          bill.value = copy;
          focusTableRowInput(existingIdx, "qty");
          return;
        }

        bill.value = [
          ...bill.value,
          {
            item,
            qty: 1,
            free_qty: calcFreeQty(1, item),
            unit_price: basePrice,
            discount_pct: defaultDiscount,
            extra_discount: defaultExtra,
            batch: singleBatch,
          },
        ];
        focusTableRowInput(bill.value.length - 1, "qty");
        return;
      }

      // Non-batch item (or items where batches are 0 but warehouse positions are positive)
      const existingIdx = bill.value.findIndex((l) => l.item.id === item.id && !l.batch);
      if (existingIdx >= 0) {
        const copy = [...bill.value];
        const currentQty = copy[existingIdx].qty;
        if (trackInv && inCartTotal >= totalStock) return;
        const nextQty = trackInv ? Math.min(currentQty + 1, totalStock) : currentQty + 1;
        copy[existingIdx] = {
          ...copy[existingIdx],
          qty: nextQty,
          free_qty: calcFreeQty(nextQty, copy[existingIdx].item),
        };
        bill.value = copy;
        focusTableRowInput(existingIdx, "qty");
        return;
      }

      bill.value = [
        ...bill.value,
        {
          item,
          qty: 1,
          free_qty: calcFreeQty(1, item),
          unit_price: basePrice,
          discount_pct: defaultDiscount,
          extra_discount: defaultExtra,
          batch: null,
        },
      ];
      focusTableRowInput(bill.value.length - 1, "qty");
    } catch (err) {
      console.warn("[CustomNewBill] addItem error:", err);
    }
  });

  const handleProductSaved = $((savedItem: ModalShopItem) => {
    const exists = allItems.value.some((i) => i.id === savedItem.id);
    if (!exists) {
      allItems.value = [savedItem as unknown as ShopItem, ...allItems.value];
      addItem(savedItem as unknown as ShopItem);
    } else {
      allItems.value = allItems.value.map((i) => (i.id === savedItem.id ? (savedItem as unknown as ShopItem) : i));
      bill.value = bill.value.map((line) => {
        if (line.item.id === savedItem.id) {
          const updatedItem = savedItem as unknown as ShopItem;
          return {
            ...line,
            item: updatedItem,
            unit_price: (updatedItem as any).selling_price || updatedItem.price || line.unit_price,
            discount_pct: (updatedItem as any).discount_percent ?? updatedItem.discount_pct ?? line.discount_pct,
          };
        }
        return line;
      });
    }
    showAddProductModal.value = false;
    editingProduct.value = null;
  });

  const removeLine = $((idx: number) => {
    const line = bill.value[idx];
    if (isEditMode.value && props.editInvoice?.value?.status !== "draft" && line && line.original_qty !== undefined && line.original_qty > 0) {
      // Confirmed bill modification: If not already 0, set to 0 (return all units). If already 0, restore to original_qty.
      const copy = [...bill.value];
      if (copy[idx].qty > 0) {
        copy[idx].qty = 0;
        copy[idx].free_qty = 0;
      } else {
        copy[idx].qty = copy[idx].original_qty || 1;
        copy[idx].free_qty = calcFreeQty(copy[idx].qty, copy[idx].item);
      }
      bill.value = copy;
    } else {
      bill.value = bill.value.filter((_, i) => i !== idx);
    }
  });

  const isItemDecimal = (item?: ShopItem | null): boolean => {
    if (!item) return true;
    const unitId = item.unit_id ? String(item.unit_id).trim() : "";
    const unitSym = (item as any)?.unit || (item as any)?.unit_name || (item as any)?.unit_symbol;
    const cleanSym = unitSym ? String(unitSym).trim() : "";

    // If unit_id is NULL or empty string (and no unit symbol), allow decimal
    if (!unitId && !cleanSym) {
      return true;
    }

    if (unitId) {
      const u = units.value.find((un) => un.id === unitId);
      if (u) return u.is_decimal === 1;
    }

    if (cleanSym) {
      const lower = cleanSym.toLowerCase();
      const u = units.value.find((un) => un.symbol.toLowerCase() === lower || un.name.toLowerCase() === lower);
      if (u) return u.is_decimal === 1;
    }

    return true;
  };

  const updateQty = $((idx: number, qty: number) => {
    const copy = [...bill.value];
    if (!copy[idx]) return;
    const item = copy[idx].item;
    let allowsDecimal = true;
    if (item) {
      const unitId = item.unit_id ? String(item.unit_id).trim() : "";
      const unitSym = (item as any)?.unit || (item as any)?.unit_name || (item as any)?.unit_symbol;
      const cleanSym = unitSym ? String(unitSym).trim() : "";

      if (unitId) {
        const u = units.value.find((un) => un.id === unitId);
        if (u) allowsDecimal = u.is_decimal === 1;
      } else if (cleanSym) {
        const lower = cleanSym.toLowerCase();
        const u = units.value.find((un) => un.symbol.toLowerCase() === lower || un.name.toLowerCase() === lower);
        if (u) allowsDecimal = u.is_decimal === 1;
      }
    }

    let newQty = isNaN(qty) ? 0 : qty;
    if (!allowsDecimal) {
      newQty = Math.round(newQty);
    }
    const isConfirmedEdit = isEditMode.value && props.editInvoice?.value?.status !== "draft";
    const minQty = isConfirmedEdit ? 0 : (allowsDecimal ? 0 : 1);
    newQty = Math.max(minQty, newQty);

    const isTracked = item ? (item.track_inventory === 1 || Boolean((item as any).track_inventory)) : false;
    const trackInv = enforceStockLimit.value && isTracked;
    if (trackInv) {
      const line = copy[idx];
      const itemStock = stockMap.value[item.id] ?? (item as any).stock_qty ?? 0;
      const maxStock = line.batch
        ? Math.min(line.batch.qty_remaining, itemStock || line.batch.qty_remaining)
        : itemStock;
      if (maxStock > 0) {
        newQty = Math.min(newQty, maxStock);
      }
    }

    copy[idx].qty = newQty;
    copy[idx].free_qty = newQty === 0 ? 0 : calcFreeQty(newQty, copy[idx].item);
    bill.value = copy;
  });

  const updateFreeQty = $((idx: number, free: number) => {
    const copy = [...bill.value];
    if (!copy[idx]) return;
    const item = copy[idx].item;
    let allowsDecimal = true;
    if (item) {
      const unitId = item.unit_id ? String(item.unit_id).trim() : "";
      const unitSym = (item as any)?.unit || (item as any)?.unit_name || (item as any)?.unit_symbol;
      const cleanSym = unitSym ? String(unitSym).trim() : "";

      if (unitId) {
        const u = units.value.find((un) => un.id === unitId);
        if (u) allowsDecimal = u.is_decimal === 1;
      } else if (cleanSym) {
        const lower = cleanSym.toLowerCase();
        const u = units.value.find((un) => un.symbol.toLowerCase() === lower || un.name.toLowerCase() === lower);
        if (u) allowsDecimal = u.is_decimal === 1;
      }
    }

    let newFree = Math.max(0, isNaN(free) ? 0 : free);
    if (!allowsDecimal) {
      newFree = Math.round(newFree);
    }
    copy[idx].free_qty = newFree;
    bill.value = copy;
  });

  const updatePrice = $((idx: number, price: number) => {
    const copy = [...bill.value];
    copy[idx].unit_price = Math.max(0, price);
    bill.value = copy;
  });

  const updateDiscount = $((idx: number, disc: number) => {
    const copy = [...bill.value];
    copy[idx].discount_pct = Math.max(0, Math.min(100, disc));
    bill.value = copy;
  });

  const updateExtraDiscount = $((idx: number, extraDisc: number) => {
    const copy = [...bill.value];
    copy[idx].extra_discount = Math.max(0, Math.min(100, extraDisc));
    bill.value = copy;
  });

  // ── Accurate Calculations (matches NewBillModal & DemoBillGenerator) ─────────
  const computedLines = useComputed$(() => {
    const ratesList = taxRates.value;
    const cfg = taxConfig.value;

    return bill.value.map((line) => {
      const lineGross = line.unit_price * line.qty;
      const totalDiscPct = (line.discount_pct || 0) + (line.extra_discount || 0);
      const discAmt = totalDiscPct > 0 ? (lineGross * totalDiscPct) / 100 : 0;
      const taxable = Math.max(0, lineGross - discAmt);
      const rateAD = line.qty > 0 ? taxable / line.qty : (totalDiscPct > 0 ? line.unit_price * (1 - totalDiscPct / 100) : line.unit_price);

      // Tax rate lookup
      const isExempt = isTaxExempt.value;
      const tInfo = isExempt ? { ratePct: 0 } : calcItemTaxRate(line.item, ratesList, cfg);
      const ratePct = isExempt ? 0 : (tInfo.ratePct || 0);
      const isInclusive = isExempt
        ? true
        : (cfg?.tax_mode === "global"
          ? (cfg?.tax_inclusive === 1)
          : (line.item.tax_inclusive === 1));

      let taxAmt = 0;
      if (ratePct > 0) {
        if (isInclusive) {
          const base = taxable / (1 + ratePct / 100);
          taxAmt = taxable - base;
        } else {
          taxAmt = (taxable * ratePct) / 100;
        }
      }

      const total = isInclusive ? taxable : (taxable + taxAmt);

      return {
        ...line,
        gross: lineGross,
        totalDiscPct,
        discAmt,
        taxable,
        rateAD,
        ratePct,
        taxAmt,
        isInclusive,
        total,
      };
    });
  });

  const summary = useComputed$(() => {
    const rawSubtotal = computedLines.value.reduce((s, l) => s + l.gross, 0);
    const sumLineDisc = computedLines.value.reduce((s, l) => s + l.discAmt, 0);
    const postItemSubtotal = Math.max(0, rawSubtotal - sumLineDisc);

    let billDisc = 0;
    if (orderDiscountMode.value === "flat") {
      billDisc = Math.min(postItemSubtotal, Math.max(0, orderDiscountAmt.value || 0));
    } else {
      const pct = Math.min(100, Math.max(0, orderDiscountPct.value || 0));
      billDisc = (postItemSubtotal * pct) / 100;
    }

    const netTaxable = Math.max(0, postItemSubtotal - billDisc);
    const sumTax = computedLines.value.reduce((s, l) => s + l.taxAmt, 0);

    // If items are exclusive, tax is added on top. If inclusive, tax is already inside netTaxable.
    const hasExclusive = computedLines.value.some((l) => !l.isInclusive && l.ratePct > 0);
    const netTotal = hasExclusive ? (netTaxable + sumTax) : netTaxable;

    const roundedTotal = Math.round(netTotal);
    const roundOff = Math.round((roundedTotal - netTotal) * 100) / 100;

    return {
      rawSubtotal,
      sumLineDisc,
      billDisc,
      totalDiscount: sumLineDisc + billDisc,
      netTaxable,
      sumTax,
      netTotal,
      roundedTotal,
      roundOff,
    };
  });

  const totalFreeUnits = useComputed$(() =>
    bill.value.reduce((s, l) => s + (l.free_qty || 0), 0)
  );

  // ── Split / Partial Payment Totals & Methods ────────────────────────────────
  const totalSplitTendered = useComputed$(() =>
    splitPayments.value.reduce((sum, p) => sum + p.amount, 0)
  );

  const remainingBalanceDue = useComputed$(() =>
    Math.max(0, Math.round((summary.value.roundedTotal - totalSplitTendered.value) * 100) / 100)
  );

  const addSplitPayment = $((mode: "cash" | "card" | "upi" | "bank" | "cheque") => {
    const inputVal = parseFloat(splitTenderAmt.value);
    const amt = (!isNaN(inputVal) && inputVal > 0)
      ? Math.min(inputVal, remainingBalanceDue.value)
      : remainingBalanceDue.value;

    if (amt <= 0.005) return;

    const modeLabels: Record<string, string> = {
      cash: "Cash",
      card: "Card",
      upi: "UPI",
      bank: "Bank",
      cheque: "Cheque",
    };

    splitPayments.value = [
      ...splitPayments.value,
      {
        id: `split-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        mode,
        label: modeLabels[mode] || mode,
        amount: Math.round(amt * 100) / 100,
      },
    ];

    splitTenderAmt.value = "";
  });

  const removeSplitPayment = $((idx: number) => {
    const updated = [...splitPayments.value];
    updated.splice(idx, 1);
    splitPayments.value = updated;
    splitTenderAmt.value = "";
  });

  // ── Checkout / Invoicing Flow ───────────────────────────────────────────────
  const handleCheckout = $(async (isPaid: boolean, invoiceStatus: "paid" | "unpaid" | "draft") => {
    if (bill.value.length === 0) {
      errorMsg.value = "Cart is empty. Add at least one item.";
      return;
    }

    submitting.value = true;
    errorMsg.value = null;

    try {
      const linesPayload = bill.value.map((l) => {
        const origQty = l.original_qty ?? (isEditMode.value && props.editInvoice?.value?.status !== "draft" ? l.qty : undefined);
        const retQty = origQty !== undefined ? Math.max(0, origQty - l.qty) : undefined;
        return {
          item_id: l.item.id,
          item_name: l.item.name,
          batch_id: l.batch?.id ?? null,
          qty: l.qty,
          free_qty: l.free_qty || 0,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct || 0,
          extra_discount: l.extra_discount || 0,
          scheme_on: l.item.scheme_on ?? 0,
          scheme_free: l.item.scheme_free ?? 0,
          mrp: l.batch?.mrp || l.item.default_mrp || 0,
          pack_size: l.batch?.pack_size || l.item.pack_size || null,
          conversion_factor: l.batch?.conversion_factor || l.item.conversion_factor || 1,
          hsn_sac_code: l.item.hsn_sac_code ?? null,
          line_meta: JSON.stringify({
            shelf_id: l.batch?.shelf_location || (l.item as any).shelf_location || null,
            shelf_location: l.batch?.shelf_location || (l.item as any).shelf_location || null,
            pack: l.batch?.pack_size || l.item.pack_size || null,
            hsn_sac_code: l.item.hsn_sac_code || null,
            hsn: l.item.hsn_sac_code || null,
            batch_no: l.batch?.batch_no || null,
            expiry_date: l.batch?.expiry_date ? new Date(l.batch.expiry_date * 1000).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" }) : null,
            mrp: l.batch?.mrp || l.item.default_mrp || 0,
            extra_discount: l.extra_discount || 0,
            discount2: l.extra_discount || 0,
            dis2: l.extra_discount || 0,
            discount_pct: l.discount_pct || 0,
            dis1: l.discount_pct || 0,
            original_qty: origQty,
            return_qty: retQty,
            billed_qty: l.qty,
          }),
        };
      });

      let invId = "";
      let invDocNumber = "";
      let invTotal = 0;

      const paymentsPayload = isPaid ? (
        splitPayments.value.length > 0 ? (
          splitPayments.value.filter(sp => sp.amount > 0).map(sp => ({
            amount: sp.amount,
            payment_mode: sp.mode,
            reference: `SPLIT-${sp.mode.toUpperCase()}`,
            notes: `Split payment (${sp.label}) (Custom Bill)`,
          }))
        ) : [
          {
            amount: Math.max(0, summary.value.roundedTotal),
            payment_mode: paymentMode.value,
            reference: `CUSTOM-${paymentMode.value.toUpperCase()}`,
            notes: `Paid via ${paymentMode.value.toUpperCase()} (Custom Bill)`,
          }
        ]
      ) : undefined;

      if (isEditMode.value && props.editInvoice?.value) {
        const isDraftEdit = props.editInvoice.value.status === "draft";
        const updated = await invoke<{
          id: string;
          doc_number: string;
          grand_total: number;
          lines: unknown[];
        }>("shop_update_invoice", {
          data: {
            invoice_id: props.editInvoice.value.id,
            lines: linesPayload,
            channel: "wholesale",
            service_mode: "delivery",
            status: isDraftEdit ? (invoiceStatus === "draft" ? "draft" : "confirmed") : undefined,
            customer_id: pickedCustomer.value?.id ?? null,
            staff_id: selectedStaffId.value || undefined,
            sales_order_id: props.salesOrderId?.value || undefined,
            bill_discount_pct: orderDiscountPct.value > 0 ? orderDiscountPct.value : undefined,
            bill_discount_amt: orderDiscountAmt.value > 0 ? orderDiscountAmt.value : undefined,
            payments: (isPaid && isDraftEdit) ? paymentsPayload : undefined,
            notes: [
              pickedCustomer.value ? `Customer: ${pickedCustomer.value.name}` : "Direct Counter Sale",
              billNotes.value.trim() ? billNotes.value.trim() : undefined,
              props.salesOrderId?.value ? `Sales Order: ${props.salesOrderId.value}` : undefined,
              "Custom Bill",
            ].filter(Boolean).join(" • "),
          },
        });

        invId = updated.id;
        invDocNumber = updated.doc_number;
        invTotal = updated.grand_total;
      } else {
        const created = await invoke<{
          id: string;
          doc_number: string;
          grand_total: number;
          lines: unknown[];
        }>("shop_create_invoice", {
          data: {
            lines: linesPayload,
            channel: "wholesale",
            service_mode: "delivery",
            status: invoiceStatus,
            customer_id: pickedCustomer.value?.id ?? null,
            staff_id: selectedStaffId.value || undefined,
            sales_order_id: props.salesOrderId?.value || undefined,
            bill_discount_pct: orderDiscountPct.value > 0 ? orderDiscountPct.value : undefined,
            bill_discount_amt: orderDiscountAmt.value > 0 ? orderDiscountAmt.value : undefined,
            payments: paymentsPayload,
            notes: [
              pickedCustomer.value ? `Customer: ${pickedCustomer.value.name}` : "Direct Counter Sale",
              billNotes.value.trim() ? billNotes.value.trim() : undefined,
              props.salesOrderId?.value ? `Sales Order: ${props.salesOrderId.value}` : undefined,
              "Custom Bill",
            ].filter(Boolean).join(" • "),
          },
        });

        invId = created.id;
        invDocNumber = created.doc_number;
        invTotal = created.grand_total;
      }

      if (props.salesOrderId) props.salesOrderId.value = null;
      if (props.prefillLines) props.prefillLines.value = [];
      if (props.editInvoice) props.editInvoice.value = null;
      splitPayments.value = [];
      splitTenderAmt.value = "";

      props.open.value = false;
      if (props.onBilled$) {
        await props.onBilled$({
          invoiceId: invId,
          docNumber: invDocNumber,
          total: invTotal,
        });
      }
    } catch (err: any) {
      console.error("[CustomNewBill] checkout failed:", err);
      errorMsg.value = String(err?.message || err || "Checkout failed");
    } finally {
      submitting.value = false;
    }
  });

  // ── Mark as Partially Paid ──────────────────────────────────────────────────
  const handleMarkPartiallyPaid = $(async () => {
    if (bill.value.length === 0 || splitPayments.value.length === 0) return;
    submitting.value = true;
    errorMsg.value = null;
    try {
      const linesPayload = bill.value.map((l) => {
        const origQty = l.original_qty ?? (isEditMode.value && props.editInvoice?.value?.status !== "draft" ? l.qty : undefined);
        const retQty = origQty !== undefined ? Math.max(0, origQty - l.qty) : undefined;
        return {
          item_id: l.item.id,
          item_name: l.item.name,
          batch_id: l.batch?.id ?? null,
          qty: l.qty,
          free_qty: l.free_qty || 0,
          unit_price: l.unit_price,
          discount_pct: l.discount_pct || 0,
          extra_discount: l.extra_discount || 0,
          scheme_on: l.item.scheme_on ?? 0,
          scheme_free: l.item.scheme_free ?? 0,
          mrp: l.batch?.mrp || l.item.default_mrp || 0,
          pack_size: l.batch?.pack_size || l.item.pack_size || null,
          conversion_factor: l.batch?.conversion_factor || l.item.conversion_factor || 1,
          hsn_sac_code: l.item.hsn_sac_code ?? null,
          line_meta: JSON.stringify({
            shelf_id: l.batch?.shelf_location || (l.item as any).shelf_location || null,
            shelf_location: l.batch?.shelf_location || (l.item as any).shelf_location || null,
            pack: l.batch?.pack_size || l.item.pack_size || null,
            hsn_sac_code: l.item.hsn_sac_code || null,
            hsn: l.item.hsn_sac_code || null,
            batch_no: l.batch?.batch_no || null,
            expiry_date: l.batch?.expiry_date ? new Date(l.batch.expiry_date * 1000).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" }) : null,
            mrp: l.batch?.mrp || l.item.default_mrp || 0,
            extra_discount: l.extra_discount || 0,
            discount2: l.extra_discount || 0,
            dis2: l.extra_discount || 0,
            discount_pct: l.discount_pct || 0,
            dis1: l.discount_pct || 0,
            original_qty: origQty,
            return_qty: retQty,
            billed_qty: l.qty,
          }),
        };
      });

      let invId = "";
      let invDocNumber = "";
      let invTotal = 0;
      const totalTendered = splitPayments.value.reduce((s, p) => s + p.amount, 0);
      const isFullyPaid = totalTendered >= summary.value.roundedTotal - 0.01;

      const partialPaymentsPayload = splitPayments.value.filter(sp => sp.amount > 0).map(sp => ({
        amount: sp.amount,
        payment_mode: sp.mode,
        reference: `SPLIT-${sp.mode.toUpperCase()}`,
        notes: `Split payment (${sp.label}) (Custom Bill)`,
      }));

      if (isEditMode.value && props.editInvoice?.value) {
        const isDraftEdit = props.editInvoice.value.status === "draft";
        const updated = await invoke<{
          id: string;
          doc_number: string;
          grand_total: number;
          lines: unknown[];
        }>("shop_update_invoice", {
          data: {
            invoice_id: props.editInvoice.value.id,
            lines: linesPayload,
            channel: "wholesale",
            service_mode: "delivery",
            status: isDraftEdit ? "confirmed" : undefined,
            customer_id: pickedCustomer.value?.id ?? null,
            staff_id: selectedStaffId.value || undefined,
            sales_order_id: props.salesOrderId?.value || undefined,
            bill_discount_pct: orderDiscountPct.value > 0 ? orderDiscountPct.value : undefined,
            bill_discount_amt: orderDiscountAmt.value > 0 ? orderDiscountAmt.value : undefined,
            payments: partialPaymentsPayload,
            notes: [
              pickedCustomer.value ? `Customer: ${pickedCustomer.value.name}` : "Direct Counter Sale",
              billNotes.value.trim() ? billNotes.value.trim() : undefined,
              props.salesOrderId?.value ? `Sales Order: ${props.salesOrderId.value}` : undefined,
              isFullyPaid ? "[Split Payment]" : "[Partially Paid]",
              "Custom Bill",
            ].filter(Boolean).join(" • "),
          },
        });
        invId = updated.id;
        invDocNumber = updated.doc_number;
        invTotal = updated.grand_total;
      } else {
        const created = await invoke<{
          id: string;
          doc_number: string;
          grand_total: number;
          lines: unknown[];
        }>("shop_create_invoice", {
          data: {
            lines: linesPayload,
            channel: "wholesale",
            service_mode: "delivery",
            status: "confirmed",
            customer_id: pickedCustomer.value?.id ?? null,
            staff_id: selectedStaffId.value || undefined,
            sales_order_id: props.salesOrderId?.value || undefined,
            bill_discount_pct: orderDiscountPct.value > 0 ? orderDiscountPct.value : undefined,
            bill_discount_amt: orderDiscountAmt.value > 0 ? orderDiscountAmt.value : undefined,
            payments: partialPaymentsPayload,
            notes: [
              pickedCustomer.value ? `Customer: ${pickedCustomer.value.name}` : "Direct Counter Sale",
              billNotes.value.trim() ? billNotes.value.trim() : undefined,
              props.salesOrderId?.value ? `Sales Order: ${props.salesOrderId.value}` : undefined,
              isFullyPaid ? "[Split Payment]" : "[Partially Paid]",
              "Custom Bill",
            ].filter(Boolean).join(" • "),
          },
        });
        invId = created.id;
        invDocNumber = created.doc_number;
        invTotal = created.grand_total;
      }

      showPartialPayModal.value = false;
      splitPayments.value = [];
      splitTenderAmt.value = "";

      if (props.salesOrderId) props.salesOrderId.value = null;
      if (props.prefillLines) props.prefillLines.value = [];
      if (props.editInvoice) props.editInvoice.value = null;

      props.open.value = false;
      if (props.onBilled$) {
        await props.onBilled$({
          invoiceId: invId,
          docNumber: invDocNumber,
          total: invTotal,
        });
      }
    } catch (err: any) {
      console.error("[CustomNewBill] partial payment checkout failed:", err);
      errorMsg.value = String(err?.message || err || "Payment failed");
    } finally {
      submitting.value = false;
    }
  });

  // ── Global Keyboard Hotkeys Listener inside Modal ─────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    const isOpen = track(() => props.open.value);
    if (!isOpen) return;

    // Focus search input immediately on open
    setTimeout(() => {
      focusSearchInput();
    }, 120);

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // If any submodal is open, do not intercept hotkeys in CustomNewBill
      if (
        showCustPicker.value ||
        showShortcutsModal.value ||
        showCustomerDetail.value ||
        showPartialPayModal.value ||
        showAddProductModal.value
      ) {
        if (e.key === "Escape") {
          e.preventDefault();
          if (showShortcutsModal.value) showShortcutsModal.value = false;
          else if (showCustPicker.value) showCustPicker.value = false;
          else if (showCustomerDetail.value) showCustomerDetail.value = false;
          else if (showPartialPayModal.value) showPartialPayModal.value = false;
          else if (showAddProductModal.value) showAddProductModal.value = false;
          focusSearchInput();
        }
        return;
      }

      // 1. If batch picker is open, handle batch navigation / escape
      if (batchPickerOpen.value) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.min(batchPickerList.value.length - 1, focusedBatchIndex.value + 1);
          focusedBatchIndex.value = next;
          document.getElementById(`cnb-batch-card-${next}`)?.scrollIntoView({ block: "nearest" });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          const prev = Math.max(0, focusedBatchIndex.value - 1);
          focusedBatchIndex.value = prev;
          document.getElementById(`cnb-batch-card-${prev}`)?.scrollIntoView({ block: "nearest" });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const targetBatch = batchPickerList.value[focusedBatchIndex.value];
          if (targetBatch) {
            selectBatchForBill(targetBatch);
          }
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          batchPickerOpen.value = false;
          batchPickerItem.value = null;
          batchPickerTargetLineIndex.value = null;
          focusSearchInput();
          return;
        }
        return;
      }

      // 2. If catalog item is focused via keyboard arrow keys
      if (focusedCatalogIndex.value >= 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          const next = Math.min(filteredItems.value.length - 1, focusedCatalogIndex.value + 2);
          focusedCatalogIndex.value = next;
          document.getElementById(`cnb-catalog-card-${next}`)?.scrollIntoView({ block: "nearest" });
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          if (focusedCatalogIndex.value <= 1) {
            focusSearchInput();
          } else {
            const prev = Math.max(0, focusedCatalogIndex.value - 2);
            focusedCatalogIndex.value = prev;
            document.getElementById(`cnb-catalog-card-${prev}`)?.scrollIntoView({ block: "nearest" });
          }
          return;
        }
        if (e.key === "ArrowRight") {
          e.preventDefault();
          const next = Math.min(filteredItems.value.length - 1, focusedCatalogIndex.value + 1);
          focusedCatalogIndex.value = next;
          document.getElementById(`cnb-catalog-card-${next}`)?.scrollIntoView({ block: "nearest" });
          return;
        }
        if (e.key === "ArrowLeft") {
          e.preventDefault();
          const prev = Math.max(0, focusedCatalogIndex.value - 1);
          focusedCatalogIndex.value = prev;
          document.getElementById(`cnb-catalog-card-${prev}`)?.scrollIntoView({ block: "nearest" });
          return;
        }
        if (e.key === "Enter") {
          e.preventDefault();
          const targetItem = filteredItems.value[focusedCatalogIndex.value];
          if (targetItem) addItem(targetItem);
          return;
        }
      }

      // 3. F3 or '/' (when not editing an input) or 'Ctrl+K' / 'Cmd+K' focuses the search input
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (
        e.key === "F3" ||
        ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) ||
        (e.key === "/" && !isInput)
      ) {
        e.preventDefault();
        focusSearchInput();
        return;
      }

      // 4. F4 or Alt+T: Toggle between Search Input and Table
      if (e.key === "F4" || (e.altKey && (e.key === "t" || e.key === "T"))) {
        e.preventDefault();
        if (document.activeElement?.id === "cnb-search-input") {
          if (bill.value.length > 0) {
            focusTableRowInput(bill.value.length - 1, "qty");
          }
        } else {
          focusSearchInput();
        }
        return;
      }

      // 4. F6 or Alt+K or Cmd+U: Select Customer
      if (e.key === "F6" || (e.altKey && (e.key === "k" || e.key === "K")) || ((e.ctrlKey || e.metaKey) && (e.key === "u" || e.key === "U"))) {
        e.preventDefault();
        (document.activeElement as HTMLElement)?.blur();
        showCustPicker.value = true;
        setTimeout(() => {
          document.getElementById("cust-lookup-search-input")?.focus();
        }, 50);
        return;
      }

      // 5. F9 or Ctrl+Enter / Cmd+Enter: Instant Mark as Paid / Checkout
      if (e.key === "F9" || ((e.ctrlKey || e.metaKey) && e.key === "Enter")) {
        e.preventDefault();
        if (bill.value.length > 0 && !submitting.value) {
          handleCheckout(true, "paid");
        }
        return;
      }

      // 6. F8 or Alt+U: Mark as Unpaid / Credit
      if (e.key === "F8" || (e.altKey && (e.key === "u" || e.key === "U"))) {
        e.preventDefault();
        if (bill.value.length > 0 && !submitting.value) {
          handleCheckout(false, "unpaid");
        }
        return;
      }

      // 7. F7 or Alt+D: Save as Draft
      if (e.key === "F7" || (e.altKey && (e.key === "d" || e.key === "D"))) {
        e.preventDefault();
        if (bill.value.length > 0 && !submitting.value) {
          handleCheckout(false, "draft");
        }
        return;
      }

      // 8. F1 or '?' (when not editing an input): Open Shortcuts Cheatsheet Modal
      if (e.key === "F1" || (e.key === "?" && !isInput)) {
        e.preventDefault();
        showShortcutsModal.value = true;
        return;
      }

      // 9. Escape: Close submodals or clear search
      if (e.key === "Escape") {
        if (showShortcutsModal.value) {
          e.preventDefault();
          showShortcutsModal.value = false;
          focusSearchInput();
        } else if (showCustPicker.value) {
          e.preventDefault();
          showCustPicker.value = false;
          focusSearchInput();
        } else if (showCustomerDetail.value) {
          e.preventDefault();
          showCustomerDetail.value = false;
          focusSearchInput();
        } else if (showPartialPayModal.value) {
          e.preventDefault();
          showPartialPayModal.value = false;
          focusSearchInput();
        } else if (showAddProductModal.value) {
          e.preventDefault();
          showAddProductModal.value = false;
          focusSearchInput();
        } else if (showRateHistory.value) {
          e.preventDefault();
          showRateHistory.value = false;
          focusSearchInput();
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleWindowKeyDown);
      cleanup(() => {
        window.removeEventListener("keydown", handleWindowKeyDown);
      });
    }
  });

  return (
    <>
      <SlideOver
        open={props.open}
        title={
          isEditMode.value
            ? (props.editInvoice?.value?.status === "draft"
              ? `Edit Draft (${props.editInvoice?.value?.doc_number || ""})`
              : `Edit Invoice (${props.editInvoice?.value?.doc_number || ""})`)
            : props.salesOrderId?.value
              ? "Custom Bill — B2B Online Order"
              : "Custom Bill"
        }
        subtitle={
          isEditMode.value
            ? "Modify items, inline discounts, rates, or batches & update invoice"
            : pickedCustomer.value
              ? `Customer: ${pickedCustomer.value.name} — tap to view details`
              : "Wholesale custom billing with inline rates & discounts"
        }
        width="calc(92vw + 1rem)"
        onClose$={$(() => {
          // If cart has items, backdrop click is ignored to prevent accidental loss - only top-right X button closes
          if (bill.value.length > 0) return;
          props.open.value = false;
        })}
      >
        {/* ── Top Bar Header Actions (Staff Selector + Shortcuts [i] button before close cross icon) ── */}
        <div q:slot="header-actions" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <ShopStaffSelector
            selectedStaffId={selectedStaffId}
            variant="top-bar"
          />
          <button
            type="button"
            onClick$={$(() => { showShortcutsModal.value = true; })}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "1.85rem",
              height: "1.85rem",
              borderRadius: "0.25rem",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-secondary)",
              cursor: "pointer",
              transition: "all 0.15s ease",
              flexShrink: 0,
            }}
            onMouseOver$={$((e: Event) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "var(--surface-3)";
              el.style.color = "var(--accent, #3b82f6)";
              el.style.borderColor = "var(--accent, #3b82f6)";
            })}
            onMouseOut$={$((e: Event) => {
              const el = e.currentTarget as HTMLElement;
              el.style.background = "var(--surface-2)";
              el.style.color = "var(--text-secondary)";
              el.style.borderColor = "var(--border)";
            })}
            title="Keyboard Shortcuts Cheatsheet [? or F1]"
          >
            <LuInfo style="width:0.95rem;height:0.95rem;" />
          </button>
        </div>

        {/* Error Notification */}
        {errorMsg.value && (
          <div style={{ padding: "0.5rem 1rem", background: "rgba(239,68,68,0.12)", color: "#ef4444", fontSize: "0.8125rem", borderBottom: "1px solid rgba(239,68,68,0.25)" }}>
            {errorMsg.value}
          </div>
        )}

        <div class="cnb-layout">
          {/* ════════ LEFT PANE: PRODUCT CATALOG ════════ */}
          <div class="cnb-catalog-panel">
            {/* Search Bar, [+] Quick Add, & Stock Limit Toggle */}
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexShrink: 0, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  background: "var(--field-fill)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.375rem",
                  padding: "0 0.6rem",
                  height: "2.1rem",
                  flex: 1,
                  minWidth: 0,
                  boxSizing: "border-box",
                }}
              >
                <LuSearch style="width:0.875rem;height:0.875rem;color:var(--text-secondary);flex-shrink:0;" />
                <input
                  id="cnb-search-input"
                  type="text"
                  placeholder="Search products… (↓ arrow or Enter)"
                  value={query.value}
                  onInput$={(e) => {
                    query.value = (e.target as HTMLInputElement).value;
                    focusedCatalogIndex.value = -1;
                  }}
                  onKeyDown$={$((e: KeyboardEvent) => {
                    if (
                      showCustPicker.value ||
                      showShortcutsModal.value ||
                      showCustomerDetail.value ||
                      showPartialPayModal.value ||
                      showAddProductModal.value
                    ) {
                      e.preventDefault();
                      (e.target as HTMLElement)?.blur();
                      return;
                    }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      if (filteredItems.value.length > 0) {
                        focusedCatalogIndex.value = 0;
                        const el = document.getElementById("cnb-catalog-card-0");
                        el?.scrollIntoView({ block: "nearest" });
                      }
                    } else if (e.key === "Enter") {
                      e.preventDefault();
                      if (filteredItems.value.length > 0) {
                        const targetItem = focusedCatalogIndex.value >= 0 ? filteredItems.value[focusedCatalogIndex.value] : filteredItems.value[0];
                        addItem(targetItem);
                      }
                    } else if (e.key === "Escape") {
                      if (query.value) {
                        query.value = "";
                      } else if (bill.value.length === 0) {
                        props.open.value = false;
                      }
                    }
                  })}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    outline: "none",
                    color: "var(--text-primary)",
                    fontSize: "0.8125rem",
                  }}
                />
                <span class="cnb-shortcut-badge" title="Press F3 or / anywhere to focus search">F3</span>
              </div>

              {/* Quick Add Product [+] Button */}
              <button
                type="button"
                onClick$={$(() => {
                  editingProduct.value = null;
                  showAddProductModal.value = true;
                })}
                title="Create new product & add to cart (+)"
                style={{
                  height: "2.1rem",
                  width: "2.1rem",
                  minWidth: "2.1rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                  background: "var(--surface-3)",
                  color: "var(--text-primary)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                  padding: 0,
                  flexShrink: 0,
                  transition: "all 0.15s ease",
                }}
              >
                <LuPlus style={{ width: "0.95rem", height: "0.95rem" }} />
              </button>

              {/* Stock Limit Toggle */}
              <button
                type="button"
                onClick$={$(() => { enforceStockLimit.value = !enforceStockLimit.value; })}
                style={{
                  height: "2.1rem",
                  padding: "0 0.5rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                  background: enforceStockLimit.value ? "rgba(16,185,129,0.12)" : "var(--surface-3)",
                  color: enforceStockLimit.value ? "#10b981" : "var(--text-secondary)",
                  fontSize: "0.72rem",
                  fontWeight: "600",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: "0.3rem",
                  whiteSpace: "nowrap",
                }}
              >
                <span
                  style={{
                    width: "0.45rem",
                    height: "0.45rem",
                    borderRadius: "50%",
                    background: enforceStockLimit.value ? "#10b981" : "#94a3b8",
                  }}
                />
                {enforceStockLimit.value ? "Limit" : "No Cap"}
              </button>
            </div>

            {/* Catalog Grid matching NewBillModal (clean cards with full rich details) */}
            {loading.value ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                <LuLoader2 style="width:1.25rem;height:1.25rem;animation:spin 1s linear infinite;margin:0 auto 0.5rem;" />
                Loading products…
              </div>
            ) : filteredItems.value.length === 0 ? (
              <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                No products found.
              </div>
            ) : (
              <div class="cnb-item-grid">
                {filteredItems.value.map((item, idx) => {
                  const isTracked = item.track_inventory === 1 || Boolean((item as any).track_inventory);
                  const directBatches = batchMap.value[item.id];
                  const hasDirectBatches = Array.isArray(directBatches) && directBatches.length > 0;
                  const directBatchStock = hasDirectBatches
                    ? directBatches.filter(b => (b.is_active === 1 || (b as any).is_active === undefined) && b.qty_remaining > 0).reduce((sum, b) => sum + b.qty_remaining, 0)
                    : 0;
                  const posStock = stockMap.value[item.id] ?? (item as any).stock_qty ?? 0;

                  // If variant borrows parent batches, stock is strictly posStock. Direct batches can contribute to stock.
                  const stock = hasDirectBatches && directBatchStock > 0 ? Math.max(directBatchStock, posStock) : posStock;
                  const inCartQty = bill.value
                    .filter((l) => l.item.id === item.id)
                    .reduce((sum, l) => sum + (l.qty || 0), 0);
                  const inCartFreeQty = bill.value
                    .filter((l) => l.item.id === item.id)
                    .reduce((sum, l) => sum + (l.free_qty || 0), 0);
                  const remainingStock = Math.max(0, stock - inCartQty);
                  const isCapReached = enforceStockLimit.value && isTracked && (stock <= 0 || remainingStock <= 0);

                  return (
                    <div
                      id={`cnb-catalog-card-${idx}`}
                      key={item.id}
                      onClick$={$(() => {
                        if (isCapReached) return;
                        addItem(item);
                      })}
                      class={[
                        "cnb-item-card",
                        isCapReached ? "is-disabled is-out" : "",
                        focusedCatalogIndex.value === idx ? "is-focused" : "",
                      ].join(" ")}
                      style={isCapReached ? { opacity: 0.42, filter: "grayscale(0.85)", cursor: "not-allowed" } : undefined}
                    >
                      {/* Low Stock / Out / Max Badge */}
                      {isTracked && (
                        <>
                          {stock <= 0 ? (
                            <span style={{ position: "absolute", top: "0.35rem", right: "0.35rem", background: "rgba(239,68,68,0.9)", color: "#fff", fontSize: "0.6rem", fontWeight: "700", borderRadius: "0.2rem", padding: "0.1rem 0.35rem", zIndex: 2, whiteSpace: "nowrap" }}>
                              OUT
                            </span>
                          ) : isCapReached ? (
                            <span style={{ position: "absolute", top: "0.35rem", right: "0.35rem", background: "rgba(239,68,68,0.9)", color: "#fff", fontSize: "0.6rem", fontWeight: "700", borderRadius: "0.2rem", padding: "0.1rem 0.35rem", zIndex: 2, whiteSpace: "nowrap" }}>
                              MAX
                            </span>
                          ) : stock <= 10 ? (
                            <span style={{ position: "absolute", top: "0.35rem", right: "0.35rem", background: "rgba(245,158,11,0.9)", color: "#fff", fontSize: "0.6rem", fontWeight: "700", borderRadius: "0.2rem", padding: "0.1rem 0.35rem", zIndex: 2, whiteSpace: "nowrap" }}>
                              {stock} left
                            </span>
                          ) : null}
                        </>
                      )}

                      {/* Info matching NewBillModal (Name, Price, MRP, Dis, Extra, Scheme, Pack) */}
                      <div class="cnb-item-info">
                        <div
                          class="cnb-item-title"
                          title={item.name}
                          style={{ ...(isTracked && (stock <= 10 || isCapReached) ? { paddingRight: "2.75rem" } : {}) }}
                        >
                          {item.name}
                        </div>

                        {/* Pricing & Discounts Display */}
                        <div style={{ marginTop: "auto", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem", flexWrap: "wrap" }}>
                            <span class="cnb-item-price-val">
                              {fmtMoney(item.price || item.unit_price || 0)}
                            </span>
                            {(item.default_mrp || 0) > (item.price || item.unit_price || 0) && (
                              <span style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", textDecoration: "line-through", whiteSpace: "nowrap" }}>
                                MRP {fmtMoney(item.default_mrp || 0)}
                              </span>
                            )}
                          </div>

                          {/* Discount badges below price: discount_pct and extra_discount */}
                          {((item.discount_pct || 0) > 0 || (item.extra_discount || 0) > 0) && (
                            <div style={{ display: "flex", gap: "0.2rem", flexWrap: "wrap", alignItems: "center" }}>
                              {(item.discount_pct || 0) > 0 && (
                                <span style={{ fontSize: "0.625rem", fontWeight: "600", padding: "0.08rem 0.3rem", background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "0.25rem", whiteSpace: "nowrap" }}>
                                  Dis: {item.discount_pct}%
                                </span>
                              )}
                              {(item.extra_discount || 0) > 0 && (
                                <span style={{ fontSize: "0.625rem", fontWeight: "600", padding: "0.08rem 0.3rem", background: "rgba(168,85,247,0.12)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.25)", borderRadius: "0.25rem", whiteSpace: "nowrap" }}>
                                  +{item.extra_discount}% Extra
                                </span>
                              )}
                            </div>
                          )}

                          {/* Trade Scheme badge */}
                          {(item.scheme_on || 0) > 0 && (item.scheme_free || 0) > 0 && (
                            <div style={{ display: "flex", gap: "0.2rem", flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ fontSize: "0.625rem", fontWeight: "700", padding: "0.08rem 0.3rem", background: "rgba(139,92,246,0.14)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.3)", borderRadius: "0.25rem", whiteSpace: "nowrap" }}>
                                Scheme: {item.scheme_on}+{item.scheme_free} Free
                              </span>
                              {inCartFreeQty > 0 && (
                                <span style={{ fontSize: "0.625rem", fontWeight: "700", padding: "0.08rem 0.3rem", background: "rgba(139,92,246,0.22)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.35)", borderRadius: "0.25rem", whiteSpace: "nowrap" }}>
                                  +{inCartFreeQty} Free
                                </span>
                              )}
                            </div>
                          )}
                          {inCartFreeQty > 0 && !(item.scheme_on && item.scheme_free) && (
                            <div style={{ display: "flex", gap: "0.2rem", flexWrap: "wrap", alignItems: "center" }}>
                              <span style={{ fontSize: "0.625rem", fontWeight: "700", padding: "0.08rem 0.3rem", background: "rgba(139,92,246,0.22)", color: "#8b5cf6", border: "1px solid rgba(139,92,246,0.35)", borderRadius: "0.25rem", whiteSpace: "nowrap" }}>
                                +{inCartFreeQty} Free
                              </span>
                            </div>
                          )}

                          {item.pack_size && (
                            <div style={{ fontSize: "0.625rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                              Pack: {item.pack_size}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* [Edit] & [i] buttons at right bottom end on hover */}
                      <div class="cnb-card-actions">
                        <button
                          type="button"
                          class="cnb-card-edit-btn"
                          onClick$={(e) => {
                            e.stopPropagation();
                            editingProduct.value = item as unknown as ModalShopItem;
                            showAddProductModal.value = true;
                          }}
                          title="Quick edit product"
                        >
                          <LuPencil style={{ width: "0.75rem", height: "0.75rem" }} />
                        </button>
                        <button
                          type="button"
                          class="cnb-card-info-btn"
                          onClick$={(e) => {
                            e.stopPropagation();
                            rateHistoryItemId.value = item.id;
                            rateHistoryItemName.value = item.name;
                            showRateHistory.value = true;
                          }}
                          title="View customer billing & price history [i]"
                        >
                          <LuInfo style={{ width: "0.8rem", height: "0.8rem" }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ════════ RIGHT PANE: 1-LINE TABLE BILLING EDITOR ════════ */}
          <div class="cnb-bill-panel">
            {/* Customer & Staff Area at top */}
            <div style={{ padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", background: "var(--surface-3)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                {pickedCustomer.value ? (
                  <div
                    onClick$={$(() => { showCustomerDetail.value = true; })}
                    style={{
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                    title="Click to view & edit customer details"
                  >
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                        <span style={{ fontWeight: "700", fontSize: "0.875rem", color: "var(--text-primary)" }}>
                          {pickedCustomer.value.name}
                        </span>
                        <span style={{ fontSize: "0.65rem", background: "rgba(59,130,246,0.15)", color: "#3b82f6", padding: "0.05rem 0.35rem", borderRadius: "0.25rem", fontWeight: "600" }}>
                          Customer
                        </span>
                      </div>
                      {(pickedCustomer.value.phone || pickedCustomer.value.email) && (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                          {[pickedCustomer.value.phone, pickedCustomer.value.email].filter(Boolean).join(" • ")}
                        </div>
                      )}
                    </div>
                    <LuChevronRight style={{ width: "1rem", height: "1rem", color: "var(--text-secondary)" }} />
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                    <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                      Direct Sale / Walk-in Customer
                    </span>
                    <button
                      type="button"
                      onClick$={$(() => {
                        (document.activeElement as HTMLElement)?.blur();
                        showCustPicker.value = true;
                        setTimeout(() => {
                          document.getElementById("cust-lookup-search-input")?.focus();
                        }, 50);
                      })}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.375rem",
                        padding: "0.3rem 0.65rem",
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        color: "var(--text-primary)",
                        cursor: "pointer",
                      }}
                    >
                      <LuUser style={{ width: "0.75rem", height: "0.75rem" }} />
                      Select Customer
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* 1-Line Table of Items (matches DemoBillGenerator) */}
            <div class="cnb-table-container">
              {bill.value.length === 0 ? (
                <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  No items in bill yet.
                  <div style={{ fontSize: "0.75rem", marginTop: "0.35rem", opacity: 0.8 }}>
                    Click products in the left catalog to add them.
                  </div>
                </div>
              ) : (
                <table class="cnb-table">
                  <thead>
                    <tr>
                      <th style={{ width: isTaxExempt.value ? "35%" : "27%", textAlign: "left" }}>Item Description</th>
                      <th style={{ width: "9.5%", textAlign: "left" }}>Batch</th>
                      <th style={{ width: "7.5%", textAlign: "left" }}>Qty</th>
                      <th style={{ width: "6.5%", textAlign: "left" }}>Free</th>
                      <th style={{ width: "9%", textAlign: "left" }}>Rate (₹)</th>
                      <th style={{ width: "5.5%", textAlign: "left" }}>Disc 1 %</th>
                      <th style={{ width: "5.5%", textAlign: "left" }}>Dis 2 %</th>
                      <th style={{ width: "8%", textAlign: "left" }}>Rate AD</th>
                      {!isTaxExempt.value && (
                        <th style={{ width: "8%", textAlign: "left" }}>Tax (₹)</th>
                      )}
                      <th style={{ width: "10.5%", textAlign: "left" }}>Net Total</th>
                      <th style={{ width: "3%", textAlign: "center" }} />
                    </tr>
                  </thead>
                  <tbody>
                    {bill.value.map((line, idx) => {
                      const cl = computedLines.value[idx];
                      const isConfirmedEdit = isEditMode.value && props.editInvoice?.value?.status !== "draft";
                      const allowsDecimal = isItemDecimal(line.item);
                      return (
                        <tr
                          key={`${line.item.id}-${idx}`}
                          style={{
                            background: line.qty === 0 ? "rgba(239,68,68,0.03)" : undefined,
                            opacity: line.qty === 0 ? 0.75 : 1,
                          }}
                        >
                          <td>
                            <div
                              style={{
                                fontWeight: "600",
                                fontSize: "0.75rem",
                                color: line.qty === 0 ? "var(--text-secondary)" : "var(--text-primary)",
                                textDecoration: line.qty === 0 ? "line-through" : "none",
                                lineHeight: "1.25",
                                wordBreak: "break-word",
                              }}
                            >
                              {line.item.name}
                            </div>
                            <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap", marginTop: "0.2rem" }}>
                              {line.item.pack_size && (
                                <span style={{ fontSize: "0.65rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                                  Pack: {line.item.pack_size}
                                </span>
                              )}
                              {(() => {
                                const u = units.value.find(un => un.id === line.item.unit_id);
                                if (u) {
                                  return (
                                    <span style={{ fontSize: "0.625rem", color: "var(--text-secondary)", background: "var(--surface-3)", padding: "0.05rem 0.25rem", borderRadius: "0.2rem", whiteSpace: "nowrap" }}>
                                      {u.symbol || u.name}
                                    </span>
                                  );
                                }
                                return null;
                              })()}
                              {cl && cl.ratePct > 0 && !isTaxExempt.value && (
                                <span
                                  style={{
                                    fontSize: "0.625rem",
                                    color: "#0284c7",
                                    fontWeight: "600",
                                    background: "rgba(2,132,199,0.1)",
                                    border: "1px solid rgba(2,132,199,0.25)",
                                    borderRadius: "0.2rem",
                                    padding: "0.05rem 0.25rem",
                                    whiteSpace: "nowrap",
                                  }}
                                >
                                  {cl.ratePct}% {cl.isInclusive ? "GST (Incl)" : "GST"}
                                </span>
                              )}
                              {line.free_qty && line.free_qty > 0 ? (
                                <span style={{ fontSize: "0.625rem", color: "#8b5cf6", fontWeight: "700", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "0.2rem", padding: "0.05rem 0.3rem", whiteSpace: "nowrap" }}>
                                  +{line.free_qty} FREE
                                </span>
                              ) : null}

                              {/* Edit & Info Action buttons on right end on hover */}
                              <div style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem", flexShrink: 0, marginLeft: "auto" }}>
                                <button
                                  type="button"
                                  class="cnb-row-edit-btn"
                                  onClick$={(e) => {
                                    e.stopPropagation();
                                    editingProduct.value = line.item as unknown as ModalShopItem;
                                    showAddProductModal.value = true;
                                  }}
                                  title="Quick edit product"
                                >
                                  <LuPencil style={{ width: "0.72rem", height: "0.72rem" }} />
                                </button>
                                <button
                                  type="button"
                                  class="cnb-row-info-btn"
                                  onClick$={(e) => {
                                    e.stopPropagation();
                                    rateHistoryItemId.value = line.item.id;
                                    rateHistoryItemName.value = line.item.name;
                                    showRateHistory.value = true;
                                  }}
                                  title="View customer billing & price history [i]"
                                >
                                  <LuInfo style={{ width: "0.75rem", height: "0.75rem" }} />
                                </button>
                              </div>
                            </div>
                            {line.qty === 0 && (
                              <span style={{ fontSize: "0.625rem", color: "#ef4444", fontWeight: "700", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem", display: "inline-block", marginTop: "0.15rem" }}>
                                RETURNED ({line.original_qty ?? 0} UNITS)
                              </span>
                            )}
                            {line.original_qty !== undefined && line.qty > 0 && line.qty < line.original_qty && (
                              <span style={{ fontSize: "0.625rem", color: "#d97706", fontWeight: "600", background: "rgba(217,119,6,0.12)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.3rem", display: "inline-block", marginTop: "0.15rem" }}>
                                ORIG: {line.original_qty} (RET: {line.original_qty - line.qty})
                              </span>
                            )}
                          </td>
                          <td>
                            {line.batch ? (
                              <button
                                type="button"
                                onClick$={$(() => openBatchPickerForLine(idx))}
                                class="cnb-table-batch-btn active"
                                title="Click to switch batch"
                                style={{ display: "inline-flex", alignItems: "center", gap: "0.2rem" }}
                              >
                                <span>{line.batch.batch_no}</span>
                                {line.batch.expiry_date && (
                                  <span style={{ opacity: 0.85, fontSize: "0.65rem" }}>
                                    ({new Date(line.batch.expiry_date * 1000).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" })})
                                  </span>
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick$={$(() => openBatchPickerForLine(idx))}
                                class="cnb-table-batch-btn"
                                title="Click to select batch"
                              >
                                + Batch
                              </button>
                            )}
                          </td>
                          <td>
                            <input
                              id={`cnb-qty-${idx}`}
                              type="number"
                              min={isConfirmedEdit ? "0" : (allowsDecimal ? "0" : "1")}
                              step={allowsDecimal ? "any" : "1"}
                              class="cnb-table-input"
                              style={{
                                color: line.qty === 0 ? "#ef4444" : undefined,
                                textDecoration: line.qty === 0 ? "line-through" : "none",
                              }}
                              value={line.qty}
                              onFocus$={$((e: Event) => {
                                (e.target as HTMLInputElement).select();
                              })}
                              onKeyDown$={$((e: KeyboardEvent) => {
                                if (!allowsDecimal && (e.key === "." || e.key === "," || e.key === "e" || e.key === "E")) {
                                  e.preventDefault();
                                  return;
                                }
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "qty");
                                  } else {
                                    focusNextTableInput(idx, "qty");
                                  }
                                } else if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "qty");
                                  } else {
                                    focusNextTableInput(idx, "qty");
                                  }
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "qty", "up");
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "qty", "down");
                                } else if (e.key === "Delete" || (e.altKey && e.key === "Backspace") || ((e.ctrlKey || e.metaKey) && e.key === "Backspace")) {
                                  e.preventDefault();
                                  removeLine(idx);
                                  setTimeout(() => {
                                    if (bill.value.length === 0) {
                                      focusSearchInput();
                                    } else {
                                      focusTableRowInput(Math.min(idx, bill.value.length - 1), "qty");
                                    }
                                  }, 40);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  focusSearchInput();
                                }
                              })}
                              onInput$={(e) => {
                                const el = e.target as HTMLInputElement;
                                const raw = parseFloat(el.value);
                                if (!allowsDecimal) {
                                  if (isNaN(raw)) {
                                    updateQty(idx, 0);
                                  } else {
                                    const rounded = Math.round(raw);
                                    if (el.value.includes(".") || el.value.includes(",") || el.value !== String(rounded)) {
                                      el.value = String(rounded);
                                    }
                                    updateQty(idx, rounded);
                                  }
                                } else {
                                  updateQty(idx, isNaN(raw) ? 0 : raw);
                                }
                              }}
                              onBlur$={(e) => {
                                const el = e.target as HTMLInputElement;
                                if (!allowsDecimal) {
                                  const val = Math.max(isConfirmedEdit ? 0 : 1, Math.round(parseFloat(el.value) || 0));
                                  el.value = String(val);
                                  updateQty(idx, val);
                                }
                              }}
                            />
                          </td>
                          <td>
                            <input
                              id={`cnb-free-${idx}`}
                              type="number"
                              min="0"
                              step={allowsDecimal ? "any" : "1"}
                              class="cnb-table-input"
                              value={line.free_qty}
                              onFocus$={$((e: Event) => {
                                (e.target as HTMLInputElement).select();
                              })}
                              onKeyDown$={$((e: KeyboardEvent) => {
                                if (!allowsDecimal && (e.key === "." || e.key === "," || e.key === "e" || e.key === "E")) {
                                  e.preventDefault();
                                  return;
                                }
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "free");
                                  } else {
                                    focusNextTableInput(idx, "free");
                                  }
                                } else if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "free");
                                  } else {
                                    focusNextTableInput(idx, "free");
                                  }
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "free", "up");
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "free", "down");
                                } else if (e.key === "Delete" || (e.altKey && e.key === "Backspace") || ((e.ctrlKey || e.metaKey) && e.key === "Backspace")) {
                                  e.preventDefault();
                                  removeLine(idx);
                                  setTimeout(() => {
                                    if (bill.value.length === 0) {
                                      focusSearchInput();
                                    } else {
                                      focusTableRowInput(Math.min(idx, bill.value.length - 1), "free");
                                    }
                                  }, 40);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  focusSearchInput();
                                }
                              })}
                              onInput$={(e) => {
                                const el = e.target as HTMLInputElement;
                                const raw = parseFloat(el.value);
                                if (!allowsDecimal) {
                                  if (isNaN(raw)) {
                                    updateFreeQty(idx, 0);
                                  } else {
                                    const rounded = Math.round(raw);
                                    if (el.value.includes(".") || el.value.includes(",") || el.value !== String(rounded)) {
                                      el.value = String(rounded);
                                    }
                                    updateFreeQty(idx, rounded);
                                  }
                                } else {
                                  updateFreeQty(idx, isNaN(raw) ? 0 : raw);
                                }
                              }}
                              onBlur$={(e) => {
                                const el = e.target as HTMLInputElement;
                                if (!allowsDecimal) {
                                  const val = Math.max(0, Math.round(parseFloat(el.value) || 0));
                                  el.value = String(val);
                                  updateFreeQty(idx, val);
                                }
                              }}
                            />
                          </td>
                          <td>
                            <input
                              id={`cnb-price-${idx}`}
                              type="number"
                              min="0"
                              step="0.01"
                              class="cnb-table-input"
                              style={{ fontWeight: "600" }}
                              value={line.unit_price}
                              onFocus$={$((e: Event) => {
                                (e.target as HTMLInputElement).select();
                              })}
                              onKeyDown$={$((e: KeyboardEvent) => {
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "price");
                                  } else {
                                    focusNextTableInput(idx, "price");
                                  }
                                } else if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "price");
                                  } else {
                                    focusNextTableInput(idx, "price");
                                  }
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "price", "up");
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "price", "down");
                                } else if (e.key === "Delete" || (e.altKey && e.key === "Backspace") || ((e.ctrlKey || e.metaKey) && e.key === "Backspace")) {
                                  e.preventDefault();
                                  removeLine(idx);
                                  setTimeout(() => {
                                    if (bill.value.length === 0) {
                                      focusSearchInput();
                                    } else {
                                      focusTableRowInput(Math.min(idx, bill.value.length - 1), "price");
                                    }
                                  }, 40);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  focusSearchInput();
                                }
                              })}
                              onInput$={(e) => updatePrice(idx, parseFloat((e.target as HTMLInputElement).value) || 0)}
                            />
                          </td>
                          <td>
                            <input
                              id={`cnb-disc-${idx}`}
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              class="cnb-table-input"
                              style={{ color: "#10b981", fontWeight: "600" }}
                              value={line.discount_pct}
                              onFocus$={$((e: Event) => {
                                (e.target as HTMLInputElement).select();
                              })}
                              onKeyDown$={$((e: KeyboardEvent) => {
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "disc");
                                  } else {
                                    focusNextTableInput(idx, "disc");
                                  }
                                } else if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "disc");
                                  } else {
                                    focusNextTableInput(idx, "disc");
                                  }
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "disc", "up");
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "disc", "down");
                                } else if (e.key === "Delete" || (e.altKey && e.key === "Backspace") || ((e.ctrlKey || e.metaKey) && e.key === "Backspace")) {
                                  e.preventDefault();
                                  removeLine(idx);
                                  setTimeout(() => {
                                    if (bill.value.length === 0) {
                                      focusSearchInput();
                                    } else {
                                      focusTableRowInput(Math.min(idx, bill.value.length - 1), "disc");
                                    }
                                  }, 40);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  focusSearchInput();
                                }
                              })}
                              onInput$={(e) => updateDiscount(idx, parseFloat((e.target as HTMLInputElement).value) || 0)}
                            />
                          </td>
                          <td>
                            <input
                              id={`cnb-extra-${idx}`}
                              type="number"
                              min="0"
                              max="100"
                              step="0.5"
                              class="cnb-table-input"
                              value={line.extra_discount}
                              onFocus$={$((e: Event) => {
                                (e.target as HTMLInputElement).select();
                              })}
                              onKeyDown$={$((e: KeyboardEvent) => {
                                if (e.key === "Tab") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "extra");
                                  } else {
                                    focusNextTableInput(idx, "extra");
                                  }
                                } else if (e.key === "Enter") {
                                  e.preventDefault();
                                  if (e.shiftKey) {
                                    focusPrevTableInput(idx, "extra");
                                  } else {
                                    // Last column: loops back to search bar!
                                    focusNextTableInput(idx, "extra");
                                  }
                                } else if (e.key === "ArrowUp") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "extra", "up");
                                } else if (e.key === "ArrowDown") {
                                  e.preventDefault();
                                  focusVerticalTableInput(idx, "extra", "down");
                                } else if (e.key === "Delete" || (e.altKey && e.key === "Backspace") || ((e.ctrlKey || e.metaKey) && e.key === "Backspace")) {
                                  e.preventDefault();
                                  removeLine(idx);
                                  setTimeout(() => {
                                    if (bill.value.length === 0) {
                                      focusSearchInput();
                                    } else {
                                      focusTableRowInput(Math.min(idx, bill.value.length - 1), "extra");
                                    }
                                  }, 40);
                                } else if (e.key === "Escape") {
                                  e.preventDefault();
                                  focusSearchInput();
                                }
                              })}
                              onInput$={(e) => updateExtraDiscount(idx, parseFloat((e.target as HTMLInputElement).value) || 0)}
                            />
                          </td>
                          <td style={{ color: line.qty === 0 ? "var(--text-secondary)" : "#3b82f6", fontWeight: "600", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", textDecoration: line.qty === 0 ? "line-through" : "none" }}>
                            ₹{cl ? cl.rateAD.toFixed(2) : "0.00"}
                          </td>
                          {!isTaxExempt.value && (
                            <td style={{ color: line.qty === 0 ? "var(--text-secondary)" : "#0284c7", fontWeight: "600", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", textDecoration: line.qty === 0 ? "line-through" : "none" }}>
                              ₹{cl ? cl.taxAmt.toFixed(2) : "0.00"}
                            </td>
                          )}
                          <td style={{ fontWeight: "700", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap", color: line.qty === 0 ? "var(--text-secondary)" : "var(--text-primary)", textDecoration: line.qty === 0 ? "line-through" : "none" }}>
                            ₹{cl ? cl.total.toFixed(2) : "0.00"}
                          </td>
                          <td style={{ textAlign: "center" }}>
                            {line.qty === 0 ? (
                              <button
                                type="button"
                                onClick$={$(() => removeLine(idx))}
                                title="Restore Line"
                                style={{
                                  background: "rgba(59,130,246,0.1)",
                                  border: "1px solid rgba(59,130,246,0.25)",
                                  borderRadius: "0.25rem",
                                  color: "#3b82f6",
                                  cursor: "pointer",
                                  padding: "0.2rem 0.4rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: "0.2rem",
                                  fontSize: "0.6875rem",
                                  fontWeight: "600",
                                }}
                              >
                                <LuRotateCcw style="width:0.75rem;height:0.75rem;" />
                                Restore
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick$={$(() => removeLine(idx))}
                                class="cnb-table-trash-btn"
                                title={isConfirmedEdit ? "Mark as returned (0 qty)" : "Remove Line"}
                              >
                                <LuTrash2 style="width:0.8rem;height:0.8rem;" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            {/* Bottom Summary & Checkout Panel */}
            <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface-3)", padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              {/* Promotional Schemes highlight banner */}
              {totalFreeUnits.value > 0 && (
                <div
                  style={{
                    padding: "0.4rem 0.65rem",
                    borderRadius: "0.375rem",
                    background: "rgba(139,92,246,0.1)",
                    border: "1px solid rgba(139,92,246,0.25)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.45rem",
                    fontSize: "0.75rem",
                    color: "#8b5cf6",
                    fontWeight: "600",
                  }}
                >
                  <span>🎁</span>
                  <span>
                    Promotional Scheme Applied: <strong>+{totalFreeUnits.value} Free Units</strong> included in this order!
                  </span>
                </div>
              )}

              {/* Extra Bill-Level Discount & Notes row */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: "0.75rem", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                    Bill Disc:
                  </span>
                  {/* Segmented Toggle for % | ₹ with high dark-mode contrast */}
                  <div class="cnb-toggle-wrap">
                    <button
                      type="button"
                      onClick$={$(() => { orderDiscountMode.value = "pct"; })}
                      class={["cnb-toggle-btn", orderDiscountMode.value === "pct" ? "active" : ""].join(" ")}
                    >
                      %
                    </button>
                    <button
                      type="button"
                      onClick$={$(() => { orderDiscountMode.value = "flat"; })}
                      class={["cnb-toggle-btn", orderDiscountMode.value === "flat" ? "active" : ""].join(" ")}
                    >
                      ₹
                    </button>
                  </div>
                  {orderDiscountMode.value === "pct" ? (
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.5"
                      placeholder="0%"
                      value={orderDiscountPct.value}
                      onInput$={(e) => { orderDiscountPct.value = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                      class="cnb-table-input"
                      style={{ width: "4rem" }}
                    />
                  ) : (
                    <input
                      type="number"
                      min="0"
                      step="1"
                      placeholder="₹0"
                      value={orderDiscountAmt.value}
                      onInput$={(e) => { orderDiscountAmt.value = parseFloat((e.target as HTMLInputElement).value) || 0; }}
                      class="cnb-table-input"
                      style={{ width: "4.5rem" }}
                    />
                  )}
                </div>

                <input
                  type="text"
                  placeholder="Order notes / po number / terms…"
                  value={billNotes.value}
                  onInput$={(e) => { billNotes.value = (e.target as HTMLInputElement).value; }}
                  class="cnb-table-input"
                  style={{ width: "100%" }}
                />
              </div>

              {/* Totals Breakdown */}
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: "0.5rem", borderTop: "1px dashed var(--border)", paddingTop: "0.5rem" }}>
                <div style={{ display: "flex", gap: "0.75rem", fontSize: "0.72rem", color: "var(--text-secondary)", flexWrap: "wrap", alignItems: "center" }}>
                  <span>Subtotal: <strong style={{ color: "var(--text-primary)" }}>{fmtMoney(summary.value.rawSubtotal)}</strong></span>
                  {summary.value.totalDiscount > 0 && (
                    <span>Discount: <strong style={{ color: "#10b981" }}>-{fmtMoney(summary.value.totalDiscount)}</strong></span>
                  )}
                  {!isTaxExempt.value && (
                    <>
                      <span>Taxable: <strong style={{ color: "var(--text-primary)" }}>{fmtMoney(summary.value.netTaxable)}</strong></span>
                      <span>GST/Tax: <strong style={{ color: "var(--text-primary)" }}>{fmtMoney(summary.value.sumTax)}</strong></span>
                    </>
                  )}
                  {summary.value.roundOff !== 0 && (
                    <span>R.Off: <strong style={{ color: "var(--text-secondary)" }}>{summary.value.roundOff > 0 ? `+${summary.value.roundOff}` : summary.value.roundOff}</strong></span>
                  )}
                  {splitPayments.value.length > 0 && (
                    <span style={{ color: "#10b981", fontWeight: "700" }}>
                      Tendered: {fmtMoney(totalSplitTendered.value)}
                    </span>
                  )}
                  {splitPayments.value.length > 0 && remainingBalanceDue.value > 0 && (
                    <span style={{ color: "#f59e0b", fontWeight: "700" }}>
                      Bal Due: {fmtMoney(remainingBalanceDue.value)}
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "baseline", gap: "0.4rem" }}>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", fontWeight: "600" }}>
                    {splitPayments.value.length > 0 && remainingBalanceDue.value > 0 ? "Balance Due:" : "Grand Total:"}
                  </span>
                  <span style={{ fontSize: "1.25rem", fontWeight: "800", color: splitPayments.value.length > 0 && remainingBalanceDue.value > 0 ? "#f59e0b" : "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {fmtMoney(splitPayments.value.length > 0 && remainingBalanceDue.value > 0 ? remainingBalanceDue.value : summary.value.roundedTotal)}
                  </span>
                </div>
              </div>

              {/* Payment Mode Selector & Checkout Buttons */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem", flexWrap: "wrap", marginTop: "0.2rem" }}>
                {/* Segmented Toggle for Cash | UPI | Bank | Credit | Cheque | Split */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span class="cnb-mode-label">Mode:</span>
                  <div class="cnb-toggle-wrap">
                    {[
                      { id: "cash", label: "Cash" },
                      { id: "upi", label: "UPI" },
                      { id: "bank", label: "Bank" },
                      { id: "credit", label: "Credit" },
                      { id: "cheque", label: "Cheque" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick$={$(() => {
                          paymentMode.value = m.id;
                        })}
                        class={["cnb-toggle-btn", paymentMode.value === m.id && splitPayments.value.length === 0 ? "active" : ""].join(" ")}
                      >
                        {m.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick$={$(() => {
                        showPartialPayModal.value = true;
                      })}
                      class={["cnb-toggle-btn", splitPayments.value.length > 0 ? "active" : ""].join(" ")}
                      style={{
                        color: splitPayments.value.length > 0 ? "#10b981" : undefined,
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                      title="Split / Partial Payment Options"
                    >
                      <span>⚡ Partial</span>
                      {splitPayments.value.length > 0 && (
                        <span style={{ fontSize: "0.625rem", background: "rgba(16,185,129,0.2)", padding: "0.05rem 0.25rem", borderRadius: "0.2rem", fontWeight: "700" }}>
                          {splitPayments.value.length}
                        </span>
                      )}
                    </button>
                  </div>
                </div>

                {/* Actions */}
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <button
                    type="button"
                    disabled={submitting.value || bill.value.length === 0}
                    onClick$={$(() => handleCheckout(false, "draft"))}
                    style={{
                      padding: "0.35rem 0.65rem",
                      borderRadius: "0.375rem",
                      border: "1px solid var(--border)",
                      background: (submitting.value || bill.value.length === 0) ? "var(--muted)" : "var(--surface-2)",
                      color: "var(--text-secondary)",
                      fontSize: "0.75rem",
                      fontWeight: "600",
                      cursor: (submitting.value || bill.value.length === 0) ? "not-allowed" : "pointer",
                      opacity: (submitting.value || bill.value.length === 0) ? 0.6 : 1,
                    }}
                  >
                    {isEditMode.value ? "Update Draft" : "Draft"}
                  </button>

                  <button
                    type="button"
                    disabled={submitting.value || bill.value.length === 0}
                    onClick$={$(() => handleCheckout(false, "unpaid"))}
                    style={{
                      padding: "0.35rem 0.75rem",
                      borderRadius: "0.375rem",
                      border: (submitting.value || bill.value.length === 0) ? "1px solid var(--border)" : "1px solid rgba(245,158,11,0.3)",
                      background: (submitting.value || bill.value.length === 0) ? "var(--muted)" : "rgba(245,158,11,0.12)",
                      color: (submitting.value || bill.value.length === 0) ? "var(--text-secondary)" : "#f59e0b",
                      fontSize: "0.75rem",
                      fontWeight: "600",
                      cursor: (submitting.value || bill.value.length === 0) ? "not-allowed" : "pointer",
                      opacity: (submitting.value || bill.value.length === 0) ? 0.6 : 1,
                    }}
                  >
                    {isEditMode.value ? "Update Unpaid" : "Unpaid / Credit"}
                  </button>

                  {splitPayments.value.length > 0 && remainingBalanceDue.value > 0 ? (
                    <button
                      type="button"
                      disabled={submitting.value || bill.value.length === 0}
                      onClick$={handleMarkPartiallyPaid}
                      style={{
                        padding: "0.35rem 0.95rem",
                        borderRadius: "0.375rem",
                        border: "none",
                        background: (submitting.value || bill.value.length === 0) ? "var(--muted)" : "#f59e0b",
                        color: (submitting.value || bill.value.length === 0) ? "var(--text-secondary)" : "#ffffff",
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        cursor: (submitting.value || bill.value.length === 0) ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      {submitting.value && (
                        <LuLoader2 style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
                      )}
                      Mark as Partially Paid
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={submitting.value || bill.value.length === 0}
                      onClick$={$(() => handleCheckout(true, "paid"))}
                      style={{
                        padding: "0.35rem 0.95rem",
                        borderRadius: "0.375rem",
                        border: "none",
                        background: (submitting.value || bill.value.length === 0) ? "var(--muted)" : "#10b981",
                        color: (submitting.value || bill.value.length === 0) ? "var(--text-secondary)" : "#ffffff",
                        fontSize: "0.75rem",
                        fontWeight: "700",
                        cursor: (submitting.value || bill.value.length === 0) ? "not-allowed" : "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.35rem",
                      }}
                    >
                      {submitting.value && (
                        <LuLoader2 style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
                      )}
                      {isEditMode.value ? "Update & Mark Paid" : "Mark as Paid"}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </SlideOver>

      {/* ════════ Slide-Overs & Dialogs ════════ */}
      {/* Customer Picker */}
      <CustomerLookupSlideOver
        open={showCustPicker}
        customers={effectiveCustomers}
        zIndex={500}
        onPicked$={$((c: CustomerBasic) => {
          pickedCustomer.value = c;
          setTimeout(() => {
            focusSearchInput();
          }, 60);
        })}
        onCreated$={$((c: CustomerBasic) => {
          effectiveCustomers.value = [c, ...effectiveCustomers.value];
          pickedCustomer.value = c;
          setTimeout(() => {
            focusSearchInput();
          }, 60);
        })}
      />

      {/* Customer Detail & Management SlideOver (opens on clicking selected customer) */}
      <CustomerDetailSlideOver
        open={showCustomerDetail}
        customer={pickedCustomer}
        zIndex={500}
        onRemoveFromCart$={$(() => {
          pickedCustomer.value = null;
        })}
        onCustomerUpdated$={$((updated: CustomerBasic) => {
          pickedCustomer.value = updated;
        })}
      />

      {/* Batch selection popover / dialog (matches NewBillModal) */}
      {batchPickerOpen.value && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(2px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick$={$(() => {
            batchPickerOpen.value = false;
            batchPickerItem.value = null;
            batchPickerTargetLineIndex.value = null;
          })}
        >
          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: "0.625rem",
              width: "100%",
              maxWidth: "460px",
              maxHeight: "80vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 20px 40px rgba(0,0,0,0.4)",
            }}
            onClick$={$((e: Event) => e.stopPropagation())}
          >
            <div
              style={{
                padding: "0.875rem 1rem",
                borderBottom: "1px solid var(--border)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <div>
                <div style={{ fontSize: "0.9375rem", fontWeight: "700", color: "var(--text-primary)" }}>
                  Select Stock Batch
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                  {batchPickerItem.value?.name || "Choose batch to bill from"}
                </div>
              </div>
              <button
                type="button"
                onClick$={$(() => {
                  batchPickerOpen.value = false;
                  batchPickerItem.value = null;
                  batchPickerTargetLineIndex.value = null;
                })}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  padding: "0.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <LuX style="width:1.125rem;height:1.125rem;" />
              </button>
            </div>

            <div style={{ overflowY: "auto", padding: "0.875rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              {batchPickerList.value.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem 0", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  No active batches found in stock for this item.
                </div>
              ) : (
                batchPickerList.value.map((batch, bIdx) => {
                  const expStr = batch.expiry_date
                    ? new Date(batch.expiry_date * 1000).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
                    : "No Expiry";
                  const isTracked = batchPickerItem.value ? (batchPickerItem.value.track_inventory === 1 || Boolean((batchPickerItem.value as any).track_inventory)) : false;
                  const batchInCart = bill.value.filter(l => l.item.id === (batchPickerItem.value?.id) && l.batch?.id === batch.id).reduce((sum, l) => sum + l.qty, 0);
                  const batchRemaining = Math.max(0, batch.qty_remaining - batchInCart);
                  const isBatchOut = enforceStockLimit.value && isTracked && (batch.qty_remaining <= 0 || batchRemaining <= 0);
                  const isSelected = batchPickerTargetLineIndex.value !== null && bill.value[batchPickerTargetLineIndex.value]?.batch?.id === batch.id;
                  const isFocusedBatch = focusedBatchIndex.value === bIdx;
                  return (
                    <div
                      id={`cnb-batch-card-${bIdx}`}
                      key={batch.id}
                      onClick$={$(() => {
                        if (isBatchOut) return;
                        selectBatchForBill(batch);
                      })}
                      class={["cnb-batch-card", isFocusedBatch ? "is-focused" : ""].join(" ")}
                      style={{
                        padding: "0.75rem",
                        background: isSelected || isFocusedBatch ? "rgba(59,130,246,0.1)" : "var(--surface-2)",
                        border: `1px solid ${isSelected || isFocusedBatch ? "var(--accent, #3b82f6)" : "var(--border)"}`,
                        borderRadius: "0.5rem",
                        cursor: isBatchOut ? "not-allowed" : "pointer",
                        opacity: isBatchOut ? 0.45 : 1,
                        filter: isBatchOut ? "grayscale(0.85)" : undefined,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "0.75rem",
                        transition: "all 120ms ease",
                      }}
                    >
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                          <span style={{ fontSize: "0.8125rem", fontWeight: "700", color: "var(--text-primary)", fontFamily: "monospace" }}>
                            Batch: {batch.batch_no}
                          </span>
                          <span style={{ fontSize: "0.6875rem", padding: "0.1rem 0.4rem", borderRadius: "0.25rem", background: "rgba(59,130,246,0.12)", color: "#3b82f6", fontWeight: "600" }}>
                            Exp: {expStr}
                          </span>
                        </div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", marginTop: "0.25rem", display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
                          <span>
                            Available:{" "}
                            <strong style={{ color: batch.qty_remaining > 0 ? "#10b981" : "#ef4444" }}>
                              {batch.qty_remaining}
                            </strong>
                            {isBatchOut && (
                              <span style={{ marginLeft: "0.35rem", color: "#ef4444", fontWeight: "700" }}>
                                (Out of stock)
                              </span>
                            )}
                          </span>
                          {batch.mrp > 0 && <span>MRP: <strong>₹{batch.mrp.toFixed(2)}</strong></span>}
                          {batch.pack_size && <span>Pack: {batch.pack_size}</span>}
                          {batch.shelf_location && <span>Shelf: {batch.shelf_location}</span>}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={isBatchOut}
                        onClick$={$(() => {
                          if (isBatchOut) return;
                          selectBatchForBill(batch);
                        })}
                        style={{
                          padding: "0.3rem 0.75rem",
                          background: isBatchOut ? "var(--surface-3)" : isSelected ? "rgba(59,130,246,0.15)" : "var(--button-primary-bg, #3b82f6)",
                          color: isBatchOut ? "var(--text-secondary)" : isSelected ? "var(--accent, #3b82f6)" : "var(--button-primary-text, #ffffff)",
                          border: isSelected ? "1px solid var(--accent, #3b82f6)" : "none",
                          borderRadius: "0.375rem",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          cursor: isBatchOut ? "not-allowed" : "pointer",
                          flexShrink: 0,
                        }}
                      >
                        {isBatchOut ? "Out of stock" : isSelected ? "Selected" : "Select"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* ════════ Split / Partial Payment Dialog ════════ */}
      {showPartialPayModal.value && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick$={$(() => {
            showPartialPayModal.value = false;
          })}
        >
          <div
            style={{
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              width: "100%",
              maxWidth: "480px",
              maxHeight: "90vh",
              display: "flex",
              flexDirection: "column",
              overflow: "hidden",
              boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)",
            }}
            onClick$={$((e: Event) => e.stopPropagation())}
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
              <div>
                <div style={{ fontSize: "1rem", fontWeight: "700", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                  <span>⚡</span> Split / Partial Payment
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                  Tender partial or multiple payment methods
                </div>
              </div>
              <button
                type="button"
                onClick$={$(() => {
                  showPartialPayModal.value = false;
                })}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-secondary)",
                  cursor: "pointer",
                  padding: "0.25rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: "0.25rem",
                }}
              >
                <LuX style={{ width: "1.125rem", height: "1.125rem" }} />
              </button>
            </div>

            {/* Content Body */}
            <div style={{ padding: "1.25rem", overflowY: "auto", display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Summary Numbers */}
              <div
                style={{
                  background: "var(--surface-2)",
                  border: "1px solid var(--border)",
                  borderRadius: "0.5rem",
                  padding: "0.75rem 1rem",
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "0.5rem",
                  textAlign: "center",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: "600", textTransform: "uppercase" }}>Bill Total</div>
                  <div style={{ fontSize: "1rem", fontWeight: "800", color: "var(--text-primary)", marginTop: "0.2rem" }}>
                    {fmtMoney(summary.value.roundedTotal)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: "600", textTransform: "uppercase" }}>Tendered</div>
                  <div style={{ fontSize: "1rem", fontWeight: "800", color: "#10b981", marginTop: "0.2rem" }}>
                    {fmtMoney(totalSplitTendered.value)}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "0.6875rem", color: "var(--text-secondary)", fontWeight: "600", textTransform: "uppercase" }}>Balance Due</div>
                  <div style={{ fontSize: "1rem", fontWeight: "800", color: remainingBalanceDue.value > 0 ? "#f59e0b" : "#10b981", marginTop: "0.2rem" }}>
                    {fmtMoney(remainingBalanceDue.value)}
                  </div>
                </div>
              </div>

              {/* Amount Input Section */}
              {remainingBalanceDue.value > 0 && (
                <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem" }}>
                  <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.35rem" }}>
                    Amount for this tender:
                  </label>
                  <input
                    type="number"
                    min="1"
                    max={remainingBalanceDue.value}
                    value={splitTenderAmt.value || remainingBalanceDue.value}
                    onInput$={$((e: any) => { splitTenderAmt.value = e.target.value; })}
                    placeholder={remainingBalanceDue.value.toString()}
                    style={{
                      width: "100%",
                      height: "2.35rem",
                      padding: "0 0.75rem",
                      borderRadius: "0.375rem",
                      border: "1.5px solid var(--accent, #3b82f6)",
                      background: "var(--surface-1)",
                      color: "var(--text-primary)",
                      fontSize: "1.05rem",
                      fontWeight: "700",
                      fontVariantNumeric: "tabular-nums",
                      boxSizing: "border-box",
                    }}
                  />

                  {/* Quick Chips */}
                  <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.45rem" }}>
                    <button
                      type="button"
                      onClick$={$(() => { splitTenderAmt.value = remainingBalanceDue.value.toString(); })}
                      style={{
                        padding: "0.2rem 0.5rem",
                        borderRadius: "0.25rem",
                        border: "1px solid var(--border)",
                        background: "var(--surface-3)",
                        color: "var(--text-secondary)",
                        fontSize: "0.72rem",
                        fontWeight: "600",
                        cursor: "pointer",
                      }}
                    >
                      Full: {fmtMoney(remainingBalanceDue.value)}
                    </button>
                    {[500, 1000, 2000, 5000, 10000]
                      .filter((n) => n < remainingBalanceDue.value)
                      .map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick$={$(() => { splitTenderAmt.value = amt.toString(); })}
                          style={{
                            padding: "0.2rem 0.5rem",
                            borderRadius: "0.25rem",
                            border: "1px solid var(--border)",
                            background: "var(--surface-3)",
                            color: "var(--text-secondary)",
                            fontSize: "0.72rem",
                            cursor: "pointer",
                          }}
                        >
                          ₹{amt}
                        </button>
                      ))}
                  </div>

                  {/* Payment Mode Selector Buttons */}
                  <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", marginTop: "0.75rem", marginBottom: "0.4rem" }}>
                    Select mode to record tender:
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.4rem" }}>
                    {[
                      { id: "cash" as const, label: "Cash", icon: "💵" },
                      { id: "upi" as const, label: "UPI", icon: "📱" },
                      { id: "bank" as const, label: "Bank", icon: "🏦" },
                      { id: "card" as const, label: "Card", icon: "💳" },
                      { id: "cheque" as const, label: "Cheque", icon: "📝" },
                    ].map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick$={$(() => addSplitPayment(m.id))}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.2rem",
                          padding: "0.5rem 0.25rem",
                          borderRadius: "0.375rem",
                          border: "1px solid var(--border)",
                          background: "var(--surface-3)",
                          color: "var(--text-primary)",
                          fontSize: "0.72rem",
                          fontWeight: "600",
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <span style={{ fontSize: "1.1rem" }}>{m.icon}</span>
                        <span>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Recorded Split Payments List */}
              {splitPayments.value.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.78rem", fontWeight: "700", color: "var(--text-primary)", marginBottom: "0.4rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span>Recorded Tenders ({splitPayments.value.length})</span>
                    <button
                      type="button"
                      onClick$={$(() => {
                        splitPayments.value = [];
                        splitTenderAmt.value = "";
                      })}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#ef4444",
                        fontSize: "0.7rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        padding: 0,
                      }}
                    >
                      Clear All
                    </button>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                    {splitPayments.value.map((sp, idx) => (
                      <div
                        key={sp.id}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          padding: "0.45rem 0.65rem",
                          borderRadius: "0.375rem",
                          background: "var(--surface-2)",
                          border: "1px solid var(--border)",
                        }}
                      >
                        <span style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)" }}>
                          {idx + 1}. {sp.label}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                          <span style={{ fontSize: "0.8125rem", fontWeight: "700", color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                            {fmtMoney(sp.amount)}
                          </span>
                          <button
                            type="button"
                            onClick$={$(() => removeSplitPayment(idx))}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#ef4444",
                              cursor: "pointer",
                              padding: "0.15rem",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              borderRadius: "0.2rem",
                            }}
                            title="Remove tender"
                          >
                            <LuTrash2 style={{ width: "0.8rem", height: "0.8rem" }} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div
              style={{
                padding: "0.875rem 1.25rem",
                borderTop: "1px solid var(--border)",
                background: "var(--surface-2)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "0.5rem",
              }}
            >
              <button
                type="button"
                onClick$={$(() => {
                  showPartialPayModal.value = false;
                })}
                style={{
                  padding: "0.4rem 0.75rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                  background: "var(--surface-3)",
                  color: "var(--text-secondary)",
                  fontSize: "0.75rem",
                  fontWeight: "600",
                  cursor: "pointer",
                }}
              >
                Done / Keep Open
              </button>

              {splitPayments.value.length > 0 && (
                <button
                  type="button"
                  disabled={submitting.value || bill.value.length === 0}
                  onClick$={handleMarkPartiallyPaid}
                  style={{
                    padding: "0.4rem 1rem",
                    borderRadius: "0.375rem",
                    border: "none",
                    background: (submitting.value || bill.value.length === 0) ? "var(--muted)" : (remainingBalanceDue.value > 0 ? "#f59e0b" : "#10b981"),
                    color: (submitting.value || bill.value.length === 0) ? "var(--text-secondary)" : "#ffffff",
                    fontSize: "0.78rem",
                    fontWeight: "700",
                    cursor: (submitting.value || bill.value.length === 0) ? "not-allowed" : "pointer",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.35rem",
                  }}
                >
                  {submitting.value && (
                    <LuLoader2 style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
                  )}
                  {remainingBalanceDue.value > 0
                    ? `Mark as Partially Paid (₹${totalSplitTendered.value} Paid)`
                    : `Complete Full Payment (${fmtMoney(summary.value.roundedTotal)})`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Customer Item Rate & Invoicing History Modal */}
      <CustomerRateHistory
        open={showRateHistory}
        itemId={rateHistoryItemId}
        itemName={rateHistoryItemName.value}
        customerId={pickedCustomer.value?.id}
        customerName={pickedCustomer.value?.name}
      />

      {/* Quick Add Product SlideOver */}
      <AddProductModal
        open={showAddProductModal}
        editingItem={editingProduct}
        categories={categories}
        collections={collections}
        units={units}
        defaultCategoryId={props.filterCategoryId || "cat_6"}
        onSaved$={handleProductSaved}
      />

      {/* Keyboard Shortcuts Cheatsheet Modal */}
      <BillShortcutsModal open={showShortcutsModal} />
    </>
  );
});


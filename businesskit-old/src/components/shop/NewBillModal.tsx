// src/components/shop/NewBillModal.tsx
//
// WHAT:  POS billing SlideOver for the Shop Billing page.
//        Wider panel (680px) — left product grid + right running bill.
//
// FLOW:
//   open.value = true → panel slides in
//   User taps a product card → added to bill (repeat = +1 qty)
//   +/- controls adjust qty; trash removes the line
//   "Charge" opens the payment step (inside same panel)
//   Confirm payment → shop_create_invoice + shop_record_payment
//   → onBilled$({ invoice, total }) fires → parent shows success toast
//
// IPC: shop_list_items, shop_create_invoice, shop_record_payment
//
// RULES: No routeLoader$, no server$, no fetch() — invoke() only.
//        Icons inline only (no icon props — Qwik serialization).

import { CustomerLookupSlideOver, type CustomerBasic } from "~/components/shop/CustomerLookupSlideOver";
import { CustomerDetailSlideOver, type CustomerAddress } from "~/components/shop/CustomerDetailSlideOver";
import { useLocation } from "@builder.io/qwik-city";
import {
  component$,
  useSignal,
  useVisibleTask$,
  useComputed$,
  useTask$,
  useStylesScoped$,
  $,
  type Signal,
  type PropFunction,
} from "@builder.io/qwik";
import {
  LuSearch,
  LuPlus,
  LuMinus,
  LuTrash2,
  LuRotateCcw,
  LuSave,
  LuLoader,
  LuChevronLeft,
  LuChevronRight,
  LuChevronDown,
  LuX,
  LuTag,
  LuCheck,
  LuSparkles,
  LuLock,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import { fmtMoney } from "~/lib/fin-format";
import { ShopStaffSelector } from "~/components/shop/ShopStaffSelector";
import type { ShopDiscountCode } from "~/routes/dashboard/shop/settings/discounts/index";
import { AddProductModal, type ShopCategory, type ShopCollection, type ShopUnit, type ShopItem as ModalShopItem } from "~/components/shop/AddProductModal";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ItemBatch {
  id: string;
  profile_id: string;
  item_id: string;
  batch_no: string;
  mfg_date?: number | null;
  expiry_date?: number | null;
  qty_received: number;
  qty_remaining: number;
  purchase_price: number;
  mrp: number;
  landing_cost: number;
  pack_size?: string | null;
  conversion_factor?: number;
  shelf_location?: string | null;
  is_active?: number;
  created_at?: number;
}

export interface TaxRate {
  id: string;
  name: string;
  rate_pct: number;
  is_default: number;
}

export interface TaxConfig {
  regime: string;
  country: string;
  currency: string;
  tax_mode: string;
  global_tax_rate?: number;
  global_tax_rate_id?: string;
  tax_inclusive?: number;
}

export interface SplitPaymentEntry {
  id: string;
  mode: "cash" | "card" | "upi" | "bank" | "cheque";
  amount: number;
  label: string;
}

export interface AppliedCoupon {
  code: string;
  discount_type: string;
  value: number;
  max_discount?: number | null;
  amount: number;
}


export interface ShopItem {
  id: string;
  name: string;
  price: number;
  price_delta?: number;
  cost_price?: number;
  compare_price?: number;
  default_mrp: number;
  unit_price?: number;
  discount_pct: number;
  extra_discount?: number;
  is_taxable?: number;
  tax_inclusive?: number;
  currency?: string;
  category_id?: string;
  shop_category_id?: string;
  unit_id?: string;
  sku?: string;
  hsn_sac_code?: string;
  media_url?: string;
  seo_og_image?: string;
  item_type?: string;
  has_variants?: number;
  pack_size?: string;
  conversion_factor?: number;
  scheme_on?: number;
  scheme_free?: number;
  tax_rate_id?: string;
  track_inventory?: number;
  stock_qty?: number;
}

export function calcItemTaxRate(
  item: ShopItem,
  taxRatesList: TaxRate[],
  config: TaxConfig | null
): { ratePct: number; label: string; isExempt: boolean } {
  // If regime is exempt/none
  const isRegimeExempt = !config || ["none", "exempt"].includes((config.regime || "").toLowerCase().trim());
  if (isRegimeExempt) {
    return { ratePct: 0, label: "Exempt", isExempt: true };
  }

  // Explicitly marked exempt
  const isExplicitExempt =
    item.tax_rate_id === "exempt" ||
    item.tax_rate_id === "nil" ||
    (item.is_taxable === 0 && (item.tax_rate_id === "exempt" || item.tax_rate_id === "nil"));
  if (isExplicitExempt) {
    return { ratePct: 0, label: "Exempt", isExempt: true };
  }

  // If in Global Flat Tax Rate mode:
  if (config?.tax_mode === "global") {
    const gRate = config.global_tax_rate ?? 0;
    if (gRate > 0) {
      const regime = config.regime && config.regime !== "None" ? config.regime : "Tax";
      return { ratePct: gRate, label: `${regime} ${gRate}%`, isExempt: false };
    }
    if (config.global_tax_rate_id) {
      const matched = taxRatesList.find((r) => r.id === config.global_tax_rate_id);
      if (matched && matched.rate_pct > 0) {
        const name = matched.name?.trim() || config.regime || "Tax";
        const label = name.includes("%") ? name : `${name} ${matched.rate_pct}%`;
        return { ratePct: matched.rate_pct, label, isExempt: false };
      }
    }
    return { ratePct: 0, label: "0%", isExempt: false };
  }

  // Item-level tax slab mode
  if (item.tax_rate_id) {
    const trId = String(item.tax_rate_id).trim();
    const matched = taxRatesList.find(
      (r) => r.id === trId || r.name.toLowerCase() === trId.toLowerCase() || String(r.rate_pct) === trId
    );
    if (matched) {
      const name = matched.name?.trim() || config?.regime || "GST";
      const label = name.includes("%") ? name : `${name} ${matched.rate_pct}%`;
      return { ratePct: matched.rate_pct, label, isExempt: matched.rate_pct === 0 };
    }

    // Direct numeric fallback (e.g. if "28" or "28%" was saved)
    const num = parseFloat(trId.replace(/[^0-9.]/g, ""));
    if (!isNaN(num) && num > 0) {
      const regime = config?.regime && config?.regime !== "None" ? config.regime : "GST";
      return { ratePct: num, label: `${regime} ${num}%`, isExempt: false };
    }
  }

  return { ratePct: 0, label: "0%", isExempt: false };
}

interface BillLine {
  item: ShopItem;
  qty: number;
  original_qty?: number; // Option B: original confirmed quantity
  free_qty?: number;   // free bonus units from scheme
  discount_pct: number;   // per-line discount %
  extra_discount: number;   // per-line extra discount %
  batch?: ItemBatch | null;
}

export interface BilledResult {
  invoiceId: string;
  docNumber: string;
  total: number;
}

export interface PrefillBillLine {
  itemId: string;
  name: string;
  qty: number;
  price?: number;
  free_qty?: number;
  discount_pct?: number;
  extra_discount?: number;
  batch?: ItemBatch | null;
  pack_size?: string | null;
  conversion_factor?: number;
  scheme_on?: number;
  scheme_free?: number;
}

export function calcFreeQty(qty: number, item: ShopItem): number {
  if (item.scheme_on && item.scheme_on > 0 && item.scheme_free && item.scheme_free > 0) {
    return Math.floor(qty / item.scheme_on) * item.scheme_free;
  }
  return 0;
}

export interface NewBillModalProps {
  open: Signal<boolean>;
  customers: Signal<CustomerBasic[]>;   // pre-loaded by billing page on mount
  onBilled$: PropFunction<(result: BilledResult) => void>;
  // Optional edit mode: pre-fills the bill from an existing invoice
  editInvoice?: Signal<import("~/components/shop/InvoiceDetailSlideOver").InvoiceDetail | null>;
  filterCategoryId?: string;
  prefillLines?: Signal<PrefillBillLine[]>;
  prefillCustomerName?: Signal<string>;
  prefillCustomerId?: Signal<string | null>;
  prefillCustomer?: Signal<CustomerBasic | null>;
  salesOrderId?: Signal<string | null>;
}

const STYLES = `
  .bill-step1-layout {
    display: flex;
    gap: 1.25rem;
    flex: 1;
    min-height: 0;
    height: 100%;
    overflow: hidden;
  }
  .bill-left-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.875rem;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }
  .bill-item-grid {
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
  .bill-item-grid::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }
  .bill-item-card {
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
    height: auto;
    flex-shrink: 0;
  }
  .bill-item-card.has-thumb {
    min-height: auto;
  }
  .bill-item-card.no-thumb {
    min-height: auto;
  }
  .bill-item-card:hover {
    border-color: var(--accent, #3b82f6);
    box-shadow: 0 0 0 0.5px var(--accent, #3b82f6);
    transform: none;
  }
  .bill-item-card.is-disabled,
  .bill-item-card.is-out {
    opacity: 0.42 !important;
    filter: grayscale(0.85) !important;
    cursor: not-allowed !important;
  }
  .bill-item-card.is-disabled:hover,
  .bill-item-card.is-out:hover {
    border-color: var(--border) !important;
    box-shadow: none !important;
    cursor: not-allowed !important;
  }
  .bill-item-thumb {
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: var(--surface-3);
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    flex-grow: 0;
  }
  .bill-item-thumb img {
    width: 100%;
    height: 100%;
    aspect-ratio: 1 / 1;
    object-fit: cover;
    display: block;
  }
  .bill-item-info {
    padding: 0.45rem 0.55rem;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    justify-content: flex-start;
    gap: 0.2rem;
  }
  .bill-item-title {
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-primary);
    line-height: 1.3;
    word-break: break-word;
  }
  .bill-item-price-val {
    font-size: 0.9375rem;
    font-weight: 700;
    color: var(--accent);
    font-variant-numeric: tabular-nums;
  }
  .bill-show-more-wrap {
    grid-column: 1 / -1;
    display: flex;
    justify-content: center;
    padding: 0.75rem 0;
  }
  .bill-right-panel {
    width: 320px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    overflow: hidden;
    height: 100%;
    min-height: 0;
  }
  .bill-cart-scroll-area {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: 0.375rem 0;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .bill-cart-scroll-area::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  @media (max-width: 640px) {
    .bill-step1-layout {
      flex-direction: column !important;
      overflow: hidden !important;
      gap: 0.5rem !important;
      height: 100% !important;
      flex: 1 !important;
      min-height: 0 !important;
    }

    /* ── 1. When Cart is Empty (0 items): 3+ rows of products, compact cart at bottom ── */
    .bill-step1-layout.cart-empty .bill-left-panel {
      flex: 1 1 0% !important;
      min-height: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
      gap: 0.5rem !important;
    }
    .bill-step1-layout.cart-empty .bill-item-grid {
      display: grid !important;
      grid-template-columns: repeat(3, 1fr) !important;
      gap: 0.45rem !important;
      overflow-y: auto !important;
      flex: 1 1 0% !important;
      min-height: 0 !important;
      max-height: none !important;
      height: auto !important;
      padding-right: 0 !important;
      padding-bottom: 0.25rem !important;
      box-sizing: border-box !important;
    }
    .bill-step1-layout.cart-empty .bill-show-more-wrap {
      grid-column: 1 / -1 !important;
      padding: 0.5rem 0 !important;
      display: flex !important;
      justify-content: center !important;
      height: auto !important;
    }
    .bill-step1-layout.cart-empty .bill-right-panel {
      width: 100% !important;
      flex: 0 0 auto !important;
      min-height: auto !important;
      height: auto !important;
      max-height: none !important;
      display: flex !important;
      flex-direction: column !important;
    }
    .bill-step1-layout.cart-empty .bill-cart-scroll-area {
      flex: 0 0 auto !important;
      min-height: auto !important;
      overflow-y: visible !important;
      padding: 0.25rem 0 !important;
    }

    /* ── 2. When Cart Has Items (1+ items): Product catalog becomes 1-row horizontal scroll strip, Cart box expands to full remaining height ── */
    .bill-step1-layout.cart-some-items .bill-left-panel,
    .bill-step1-layout.cart-many-items .bill-left-panel {
      flex: 0 0 auto !important;
      gap: 0.375rem !important;
      min-height: 0 !important;
      overflow: visible !important;
    }
    .bill-step1-layout.cart-some-items .bill-item-grid,
    .bill-step1-layout.cart-many-items .bill-item-grid {
      display: flex !important;
      flex-direction: row !important;
      overflow-x: auto !important;
      overflow-y: hidden !important;
      flex-wrap: nowrap !important;
      gap: 0.5rem !important;
      min-height: 225px !important;
      max-height: 245px !important;
      height: 235px !important;
      flex: 0 0 auto !important;
      align-items: stretch !important;
      padding-bottom: 0.35rem !important;
      padding-top: 0.1rem !important;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none !important;
      -ms-overflow-style: none !important;
    }
    .bill-step1-layout.cart-some-items .bill-show-more-wrap,
    .bill-step1-layout.cart-many-items .bill-show-more-wrap {
      grid-column: auto !important;
      padding: 0 !important;
      display: flex !important;
      align-items: center !important;
      flex-shrink: 0 !important;
      height: 100% !important;
      min-height: 225px !important;
    }
    .bill-step1-layout.cart-some-items .bill-show-more-wrap button,
    .bill-step1-layout.cart-many-items .bill-show-more-wrap button {
      height: 100% !important;
      padding: 0.5rem 0.75rem !important;
      font-size: 0.75rem !important;
      white-space: nowrap !important;
    }
    .bill-step1-layout.cart-some-items .bill-right-panel,
    .bill-step1-layout.cart-many-items .bill-right-panel {
      width: 100% !important;
      flex: 1 1 0% !important;
      min-height: 0 !important;
      height: 100% !important;
      max-height: none !important;
      display: flex !important;
      flex-direction: column !important;
      overflow: hidden !important;
    }
    .bill-step1-layout.cart-some-items .bill-cart-scroll-area,
    .bill-step1-layout.cart-many-items .bill-cart-scroll-area {
      flex: 1 1 0% !important;
      overflow-y: auto !important;
      min-height: 0 !important;
      padding: 0.25rem 0 !important;
    }

    /* Common Card Styling on Mobile */
    .bill-item-card {
      width: 100% !important;
      min-width: 0 !important;
      max-width: none !important;
      height: auto !important;
      flex-shrink: 0 !important;
      display: flex !important;
      flex-direction: column !important;
      background: var(--surface-2) !important;
      border: 0.5px solid var(--border) !important;
      border-radius: 0.5rem !important;
      overflow: hidden !important;
    }
    .bill-item-card.has-thumb {
      min-height: 175px !important;
    }
    .bill-item-card.no-thumb {
      min-height: 80px !important;
    }
    .bill-step1-layout.cart-some-items .bill-item-card,
    .bill-step1-layout.cart-many-items .bill-item-card {
      width: 116px !important;
      min-width: 116px !important;
      max-width: 116px !important;
      height: 100% !important;
      min-height: 220px !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
    }
    .bill-step1-layout.cart-some-items .bill-item-thumb,
    .bill-step1-layout.cart-many-items .bill-item-thumb {
      width: 100% !important;
      aspect-ratio: 1 / 1 !important;
      overflow: hidden !important;
      flex-shrink: 0 !important;
      flex-grow: 0 !important;
    }
    .bill-item-thumb {
      width: 100% !important;
      aspect-ratio: 1 / 1 !important;
      overflow: hidden !important;
      background: var(--surface-3) !important;
      border-bottom: 1px solid var(--border) !important;
      flex-shrink: 0 !important;
      flex-grow: 0 !important;
    }
    .bill-item-thumb img {
      width: 100% !important;
      height: 100% !important;
      aspect-ratio: 1 / 1 !important;
      object-fit: cover !important;
      display: block !important;
    }
    .bill-item-info {
      padding: 0.35rem 0.45rem !important;
      gap: 0.15rem !important;
      flex: 1 1 auto !important;
      min-height: auto !important;
      display: flex !important;
      flex-direction: column !important;
      justify-content: flex-start !important;
      overflow: visible !important;
    }
    .bill-item-title {
      font-size: 0.75rem !important;
      font-weight: 600 !important;
      color: var(--text-primary) !important;
      line-height: 1.25 !important;
      white-space: normal !important;
      display: -webkit-box !important;
      -webkit-line-clamp: 2 !important;
      -webkit-box-orient: vertical !important;
      overflow: hidden !important;
      text-overflow: ellipsis !important;
      min-width: 0 !important;
      word-break: break-word !important;
    }
    .bill-item-price-val {
      font-size: 0.8125rem !important;
      font-weight: 700 !important;
      color: var(--accent) !important;
      line-height: 1.2 !important;
    }
    .back-btn-text-full {
      display: none !important;
    }
    .back-btn-text-mobile {
      display: inline !important;
    }
    .add-cust-btn-text-full {
      display: none !important;
    }
    .add-cust-btn-text-mobile {
      display: inline !important;
    }
    .stock-limit-text-full {
      display: none !important;
    }
    .stock-limit-text-mobile {
      display: inline !important;
    }
    .pos-charge-actions {
      padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px)) !important;
    }
    .pos-charge-layout {
      padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px)) !important;
    }
  }

  .back-btn-text-full {
    display: inline;
  }
  .back-btn-text-mobile {
    display: none;
  }
  .add-cust-btn-text-full {
    display: inline;
  }
  .add-cust-btn-text-mobile {
    display: none;
  }
  .stock-limit-text-full {
    display: inline;
  }
  .stock-limit-text-mobile {
    display: none;
  }
  .stock-limit-toggle-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0 0.65rem;
    height: 2.25rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
    transition: all 0.15s ease;
    box-sizing: border-box;
  }
  @media (max-width: 640px) {
    .stock-limit-toggle-btn {
      padding: 0 0.45rem !important;
      gap: 0.25rem !important;
      font-size: 0.7125rem !important;
    }
  }

  /* POS Charge 2-Column Shopify Style Layout */
  .pos-charge-layout {
    display: grid;
    grid-template-columns: 1fr 380px;
    grid-template-rows: auto 1fr;
    gap: 1.25rem 1.5rem;
    flex: 1;
    height: 100%;
    min-height: 0;
    align-items: stretch;
    box-sizing: border-box;
  }
  .pos-charge-top {
    grid-column: 1;
    grid-row: 1;
    display: flex;
    flex-direction: column;
    gap: 1rem;
    min-width: 0;
    max-width: 100%;
    box-sizing: border-box;
  }
  .pos-charge-pay {
    grid-column: 1;
    grid-row: 2;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow-y: auto;
    padding-right: 0.5rem;
  }
  .pos-charge-actions {
    flex-shrink: 0;
    margin-top: auto;
    padding-top: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .pos-payment-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.75rem;
  }
  .pos-payment-card {
    min-height: 4rem;
    padding: 0.75rem;
    border-radius: 0.625rem;
    border: 1.5px solid var(--border);
    background: var(--surface-2);
    color: var(--text-primary);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    font-size: 0.9375rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
    user-select: none;
    text-align: center;
    box-sizing: border-box;
  }
  .pos-payment-card:hover {
    background: var(--surface-3);
    border-color: var(--accent);
  }
  .pos-payment-card.active {
    background: var(--field-fill);
    border-color: var(--accent);
    box-shadow: 0 0 0 1px var(--accent);
  }
  .pos-payment-card.card-full {
    grid-column: 1 / -1;
  }
  .pos-checkout-panel {
    grid-column: 2;
    grid-row: 1 / span 2;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
  }
  .pos-checkout-items {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    flex: 1 1 0%;
    min-height: 0;
    overflow-y: auto;
    padding-right: 0.25rem;
    padding-bottom: 0.875rem;
    margin-top: 0.5rem;
  }
  .pos-checkout-bottom {
    margin-top: auto;
    flex-shrink: 0;
    padding-top: 0.875rem;
    border-top: 1px solid var(--border);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  /* Tablet / iPad (Both Portrait & Landscape up to 1280px, and touch devices): Extra bottom padding matching SlideOver */
  @media (min-width: 641px) and (max-width: 1280px), (min-width: 641px) and (hover: none) and (pointer: coarse) {
    .pos-charge-actions {
      padding-bottom: 1.25rem !important;
    }
    .pos-charge-layout {
      padding-bottom: 1.25rem !important;
    }
  }

  @media (max-width: 960px) {
    .pos-charge-layout {
      display: flex !important;
      flex-direction: column !important;
      height: auto !important;
      min-height: 0 !important;
      gap: 1.25rem !important;
      overflow: visible !important;
      padding-bottom: 1.25rem !important;
    }
    .pos-charge-top {
      order: 1 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      flex: none !important;
    }
    .pos-checkout-panel {
      order: 2 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      flex: none !important;
    }
    .pos-checkout-items {
      max-height: none !important;
      overflow: visible !important;
      flex: none !important;
      padding-bottom: 0.875rem !important;
    }
    .pos-charge-pay {
      order: 3 !important;
      height: auto !important;
      min-height: 0 !important;
      overflow: visible !important;
      flex: none !important;
      padding-right: 0 !important;
    }
    .pos-charge-actions {
      margin-top: 1.25rem !important;
      padding-bottom: 1.25rem !important;
    }
  }
`;

// ── Component ─────────────────────────────────────────────────────────────────

export const NewBillModal = component$<NewBillModalProps>(({
  open,
  customers,
  onBilled$,
  editInvoice,
  filterCategoryId,
  prefillLines,
  prefillCustomerName,
  prefillCustomerId,
  prefillCustomer,
  salesOrderId,
}) => {
  useStylesScoped$(STYLES);

  const loc = useLocation();
  const isRestaurant = loc.url.pathname.includes("/restaurant");
  const allItems = useSignal<ShopItem[]>([]);
  const query = useSignal("");
  const bill = useSignal<BillLine[]>([]);
  const loading = useSignal(false);
  const loaded = useSignal(false);
  // item_id → qty_on_hand (for stock badge)
  const stockMap = useSignal<Record<string, number>>({});
  // In-memory cache: item_id → ItemBatch[] for instant 0ms cart additions
  const batchMap = useSignal<Record<string, ItemBatch[]>>({});
  // Toggle for enforcing strict stock limits vs allowing negative/overdraft billing in POS
  const enforceStockLimit = useSignal(true);
  // Whether customer cannot be removed or changed (e.g. converting a B2B online sales order)
  const isCustomerLocked = useComputed$(() => Boolean(salesOrderId?.value));

  // Quick Add Product Modal
  const categories = useSignal<ShopCategory[]>([]);
  const collections = useSignal<ShopCollection[]>([]);
  const units = useSignal<ShopUnit[]>([]);
  const showAddProductModal = useSignal(false);
  const editingProduct = useSignal<ModalShopItem | null>(null);

  interface OutstandingInvoiceSummary {
    document_id: string;
    doc_number: string;
    grand_total: number;
    amount_paid: number;
    amount_due: number;
    doc_date: number;
  }

  interface CustomerBillingContext {
    customer_id: string;
    customer_name: string;
    email?: string | null;
    phone?: string | null;
    credit_limit: number;
    credit_used: number;
    wallet_balance?: number;
    store_credit?: number;
    collect_taxes: number;
    accepts_email_marketing: number;
    accepts_sms_marketing: number;
    notes?: string | null;
    tags?: string | null;
    addresses?: string | null;
    gst_supply_type?: string;
    total_spent: number;
    total_orders: number;
    available_credit: number;
    is_over_limit: boolean;
    outstanding_invoices: OutstandingInvoiceSummary[];
  }

  // "pay" step toggle (inside the same panel)
  const payStep = useSignal(false);
  const payMode = useSignal<"cash" | "card" | "upi" | "bank" | "cheque" | "unpaid">("cash");
  const customerName = useSignal("");   // kept for walk-in free-text
  const pickedCustomer = useSignal<CustomerBasic | null>(null);
  const creditContext = useSignal<CustomerBillingContext | null>(null);
  const showOutstanding = useSignal(false);
  const showCustPicker = useSignal(false);
  const showCustomerDetail = useSignal(false);
  const applyStoreCredit = useSignal(false);
  const selectedShippingAddress = useSignal<CustomerAddress | null>(null);
  const serviceMode = useSignal<"dine_in" | "takeaway" | "delivery">("dine_in");
  const staffList = useSignal<Array<{ id: string; name: string; display_name?: string; role?: string }>>([]);
  const selectedStaffId = useSignal<string | null>(null);
  const processing = useSignal(false);
  const error = useSignal<string | null>(null);

  // Tax and Discount Signals
  const taxRates = useSignal<TaxRate[]>([]);
  const taxConfig = useSignal<TaxConfig | null>(null);
  const billDiscountPct = useSignal<number>(0);
  const billDiscountAmt = useSignal<number>(0);
  const billDiscountMode = useSignal<"pct" | "flat">("pct");

  // Split Payment Signals
  const isSplitMode = useSignal(false);
  const splitPayments = useSignal<SplitPaymentEntry[]>([]);
  const splitTenderAmt = useSignal<string>("");

  // Saved Discounts Signals
  const savedDiscounts = useSignal<ShopDiscountCode[]>([]);
  const appliedCoupon = useSignal<AppliedCoupon | null>(null);
  const couponCodeInput = useSignal("");
  const couponError = useSignal<string | null>(null);
  const couponValidating = useSignal(false);
  const showCouponDrawer = useSignal(false);
  const showManualDiscount = useSignal(false);

  // Batch Picker Signals
  const batchPickerOpen = useSignal(false);
  const batchPickerItem = useSignal<ShopItem | null>(null);
  const batchPickerList = useSignal<ItemBatch[]>([]);
  const batchPickerTargetLineIndex = useSignal<number | null>(null);

  // Pagination / Display limit for product catalog
  const displayLimit = useSignal(25);
  const hasPrefilled = useSignal(false);

  // Load products when panel first opens
  useTask$(({ track }) => {
    const isOpen = track(() => open.value);
    if (!isOpen) {
      // Reset on close
      bill.value = [];
      query.value = "";
      displayLimit.value = 25;
      hasPrefilled.value = false;
      payStep.value = false;
      payMode.value = "cash";
      customerName.value = "";
      pickedCustomer.value = null;
      creditContext.value = null;
      showOutstanding.value = false;
      showCustomerDetail.value = false;
      applyStoreCredit.value = false;
      selectedShippingAddress.value = null;
      serviceMode.value = "dine_in";
      error.value = null;
      batchPickerOpen.value = false;
      batchPickerItem.value = null;
      batchPickerList.value = [];
      batchPickerTargetLineIndex.value = null;
      isSplitMode.value = false;
      splitPayments.value = [];
      splitTenderAmt.value = "";
      appliedCoupon.value = null;
      couponCodeInput.value = "";
      couponError.value = null;
      couponValidating.value = false;
      showCouponDrawer.value = false;
      showManualDiscount.value = false;
    }
  });

  // Sync prefilled lines and customer name
  useTask$(({ track }) => {
    const isOpen = track(() => open.value);
    const prefill = track(() => prefillLines?.value);
    const custPrefill = track(() => prefillCustomerName?.value);
    const custIdPrefill = track(() => prefillCustomerId?.value);
    const custObjPrefill = track(() => prefillCustomer?.value);
    const items = track(() => allItems.value);
    const custList = track(() => customers.value);

    if (!isOpen) {
      hasPrefilled.value = false;
      return;
    }

    if (isOpen) {
      if (custObjPrefill) {
        pickedCustomer.value = custObjPrefill;
        customerName.value = custObjPrefill.name;
        if (custObjPrefill.id && !custObjPrefill.id.startsWith("order-cust-")) {
          invoke<CustomerBillingContext>("shop_get_customer_billing_context", { customerId: custObjPrefill.id })
            .then((ctx) => { creditContext.value = ctx; })
            .catch(() => { creditContext.value = null; });
        }
        if (custObjPrefill.billing_addr && !selectedShippingAddress.value) {
          selectedShippingAddress.value = {
            id: "order-ship",
            address1: custObjPrefill.billing_addr,
            city: custObjPrefill.city || "",
            state: custObjPrefill.state || "",
            zip: custObjPrefill.pincode || "",
            country: "India",
          };
        }
      } else if (custPrefill) {
        customerName.value = custPrefill;
        if (custIdPrefill && custList && custList.length > 0) {
          const matchedCust = custList.find((c) => c.id === custIdPrefill);
          if (matchedCust) {
            pickedCustomer.value = matchedCust;
          }
        }
      }
      if (prefill && prefill.length > 0 && !hasPrefilled.value) {
        const initialBill: BillLine[] = [];
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
              discount_pct: pl.discount_pct !== undefined ? pl.discount_pct : (matched.discount_pct || 0),
              extra_discount: pl.extra_discount !== undefined ? pl.extra_discount : (matched.extra_discount || 0),
              batch: pl.batch || null,
            });
          } else {
            initialBill.push({
              item: {
                id: pl.itemId || `temp-${Math.random()}`,
                name: pl.name,
                price: pl.price || 0,
                item_type: "physical",
                category_id: "cat_29",
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
              discount_pct: pl.discount_pct || 0,
              extra_discount: pl.extra_discount || 0,
              batch: pl.batch || null,
            });
          }
        }
        bill.value = initialBill;
        if (items.length > 0) {
          hasPrefilled.value = true;
        }
      }
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track, cleanup }) => {
    const isOpen = track(() => open.value);
    if (!isOpen || loaded.value) return;
    loading.value = true;
    try {
      const [items, variants, positions, rates, tConfig, discounts, allBatches, staff, cats, colls, uns] = await Promise.all([
        invoke<ShopItem[]>("shop_list_items", {}),
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
        invoke<Array<{ item_id: string; qty_on_hand: number }>>("shop_get_stock_position", {}).catch(() => []),
        invoke<TaxRate[]>("fin_list_tax_rates", {}).catch(() => []),
        invoke<TaxConfig | null>("fin_get_tax_config", {}).catch(() => null),
        invoke<ShopDiscountCode[]>("shop_list_discount_codes", {}).catch(() => []),
        invoke<ItemBatch[]>("shop_list_all_active_batches", {}).catch(() => []),
        invoke<any[]>("shop_list_staff", {}).catch(() => []),
        invoke<ShopCategory[]>("shop_list_categories", {}).catch(() => []),
        invoke<ShopCollection[]>("shop_list_collections", {}).catch(() => []),
        invoke<ShopUnit[]>("shop_list_units", {}).catch(() => []),
      ]);

      taxRates.value = Array.isArray(rates) ? rates : [];
      taxConfig.value = tConfig;
      savedDiscounts.value = Array.isArray(discounts) ? discounts : [];
      staffList.value = Array.isArray(staff) ? staff : [];
      categories.value = Array.isArray(cats) ? cats : [];
      collections.value = Array.isArray(colls) ? colls : [];
      units.value = Array.isArray(uns) ? uns : [];

      if (!editInvoice?.value) {
        const savedStaffId = typeof localStorage !== "undefined" ? localStorage.getItem("bk-active-staff-id") : null;
        if (savedStaffId) {
          selectedStaffId.value = savedStaffId;
        }
      }

      const handleStaffChange = (e: any) => {
        if (!editInvoice?.value) {
          selectedStaffId.value = e.detail || null;
        }
      };
      if (typeof window !== "undefined") {
        window.addEventListener("bk-staff-changed", handleStaffChange);
        cleanup(() => {
          window.removeEventListener("bk-staff-changed", handleStaffChange);
        });
      }

      const bMap: Record<string, ItemBatch[]> = {};
      if (Array.isArray(allBatches)) {
        for (const b of allBatches) {
          if (!bMap[b.item_id]) bMap[b.item_id] = [];
          bMap[b.item_id].push(b);
        }
      }

      const map: Record<string, number> = {};
      if (Array.isArray(positions)) {
        for (const p of positions) {
          const q = (p.qty_on_hand !== undefined ? p.qty_on_hand : (p as any).quantity_on_hand) ?? 0;
          map[p.item_id] = (map[p.item_id] ?? 0) + q;
        }
      }
      if (Array.isArray(variants)) {
        for (const v of variants) {
          const vStockVal = v.stock_qty !== undefined ? v.stock_qty : 0;
          map[v.id] = Math.max(map[v.id] ?? 0, vStockVal);
        }
      }
      if (Array.isArray(items)) {
        for (const it of items) {
          const itStockVal = (it as any).stock_qty !== undefined ? (it as any).stock_qty : 0;
          map[it.id] = Math.max(map[it.id] ?? 0, itStockVal);
        }
      }

      for (const [itemId, bList] of Object.entries(bMap)) {
        const bSum = bList.reduce((sum, b) => sum + Math.max(0, b.qty_remaining || 0), 0);
        if (bSum > 0) {
          map[itemId] = Math.max(map[itemId] ?? 0, bSum);
        }
      }

      const activeRawItems = (Array.isArray(items) ? items : []).filter(
        (item) => ((item as any).archived !== 1 && (item as any).archived !== true) && ((item as any).is_active === undefined || (item as any).is_active === 1 || (item as any).is_active === true)
      );
      const activeVariants = (Array.isArray(variants) ? variants : []).filter(
        (v) => (v as any).is_active === undefined || (v as any).is_active === 1 || (v as any).is_active === true
      );

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
      stockMap.value = map;
      allItems.value = expandedItems;
      loaded.value = true;
    } catch (e) {
      console.error("[NewBillModal] load failed:", e);
    } finally {
      loading.value = false;
    }
  });

  const filtered = useComputed$(() => {
    let list = allItems.value.filter(
      (i) => ((i as any).archived !== 1 && (i as any).archived !== true) && ((i as any).is_active === undefined || (i as any).is_active === 1 || (i as any).is_active === true)
    );
    if (filterCategoryId) {
      list = list.filter((i) =>
        i.category_id === filterCategoryId ||
        (filterCategoryId === "cat_6" &&
          (i.item_type === "physical" || !i.category_id || i.category_id === "cat_6") &&
          i.category_id !== "cat_28" &&
          i.category_id !== "cat_29")
      );
    }
    const q = query.value.toLowerCase().trim();
    if (!q) return list;
    return list.filter(i =>
      i.name.toLowerCase().includes(q) || (i.sku ?? "").toLowerCase().includes(q)
    );
  });

  // raw subtotal = sum of raw line prices before any discount
  const rawSubtotal = useComputed$(() =>
    bill.value.reduce((s, l) => s + l.item.price * l.qty, 0)
  );

  // item-level discounts
  const itemDiscounts = useComputed$(() =>
    bill.value.reduce((s, l) => {
      const discPct = (l.discount_pct || 0) + (l.extra_discount || 0);
      const disc = l.item.price * l.qty * (discPct / 100);
      return s + disc;
    }, 0)
  );

  // subtotal after item-level discounts
  const postItemSubtotal = useComputed$(() => Math.max(0, rawSubtotal.value - itemDiscounts.value));

  // coupon discount amount
  const couponDiscountAmt = useComputed$(() => {
    if (!appliedCoupon.value) return 0;
    const c = appliedCoupon.value;
    let disc = 0;
    if (c.discount_type === "percent") {
      disc = (postItemSubtotal.value * c.value) / 100;
      if (c.max_discount && c.max_discount > 0 && disc > c.max_discount) {
        disc = c.max_discount;
      }
    } else if (c.discount_type === "flat") {
      disc = c.value;
    }
    return Math.round(Math.min(postItemSubtotal.value, Math.max(0, disc)) * 100) / 100;
  });

  // order-level / checkout discount
  const billDiscount = useComputed$(() => {
    if (appliedCoupon.value) {
      return couponDiscountAmt.value;
    }
    if (billDiscountMode.value === "flat") {
      return Math.min(postItemSubtotal.value, Math.max(0, billDiscountAmt.value || 0));
    }
    const pct = Math.min(100, Math.max(0, billDiscountPct.value || 0));
    return (postItemSubtotal.value * pct) / 100;
  });

  // total discount = item discounts + checkout discount
  const totalDiscount = useComputed$(() => itemDiscounts.value + billDiscount.value);

  // Total free bonus units from promotional schemes
  const totalFreeUnits = useComputed$(() =>
    bill.value.reduce((s, l) => s + (l.free_qty || 0), 0)
  );

  // Live real-time tax calculation
  const liveTaxDetails = useComputed$(() => {
    let taxSum = 0;
    let taxableSum = 0;
    let inclTaxSum = 0;
    let exclTaxSum = 0;
    const ratesList = taxRates.value;
    const cfg = taxConfig.value;

    for (const line of bill.value) {
      const lineDiscPct = (line.discount_pct || 0) + (line.extra_discount || 0);
      const lineGross = line.item.price * line.qty * (1 - lineDiscPct / 100);
      const lineDiscounted = postItemSubtotal.value > 0
        ? lineGross * (1 - billDiscount.value / postItemSubtotal.value)
        : lineGross;

      const { ratePct } = calcItemTaxRate(line.item, ratesList, cfg);
      const isInclusive = cfg?.tax_mode === "global"
        ? (cfg?.tax_inclusive === 1)
        : (line.item.tax_inclusive === 1);

      if (ratePct > 0) {
        if (isInclusive) {
          const taxable = lineDiscounted / (1 + ratePct / 100);
          const taxAmt = lineDiscounted - taxable;
          taxableSum += taxable;
          taxSum += taxAmt;
          inclTaxSum += taxAmt;
        } else {
          const taxAmt = (lineDiscounted * ratePct) / 100;
          taxableSum += lineDiscounted;
          taxSum += taxAmt;
          exclTaxSum += taxAmt;
        }
      } else {
        taxableSum += lineDiscounted;
      }
    }

    return {
      taxableAmt: Math.round(taxableSum * 100) / 100,
      totalTax: Math.round(taxSum * 100) / 100,
      inclusiveTax: Math.round(inclTaxSum * 100) / 100,
      exclusiveTax: Math.round(exclTaxSum * 100) / 100,
    };
  });

  const cartTaxModeStatus = useComputed$(() => {
    const cfg = taxConfig.value;
    if (cfg?.tax_mode === "global") {
      return cfg.tax_inclusive === 1 ? "inclusive" : "exclusive";
    }
    // In item mode:
    if (liveTaxDetails.value.inclusiveTax > 0 && liveTaxDetails.value.exclusiveTax === 0) {
      return "inclusive";
    }
    if (liveTaxDetails.value.exclusiveTax > 0 && liveTaxDetails.value.inclusiveTax === 0) {
      return "exclusive";
    }
    if (liveTaxDetails.value.inclusiveTax > 0 && liveTaxDetails.value.exclusiveTax > 0) {
      return "mixed";
    }
    // Fallback if no taxable lines yet
    return cfg?.tax_inclusive === 1 ? "inclusive" : "exclusive";
  });

  // grand total after all discounts + live tax
  const total = useComputed$(() => {
    return Math.max(0, Math.round((liveTaxDetails.value.taxableAmt + liveTaxDetails.value.totalTax) * 100) / 100);
  });

  // Store credit applied amount
  const appliedCreditAmt = useComputed$(() => {
    const bal = creditContext.value?.wallet_balance ?? creditContext.value?.store_credit ?? 0;
    if (!applyStoreCredit.value || !creditContext.value || bal <= 0) return 0;
    return Math.min(total.value, bal);
  });

  // Net payable amount after store credit deduction
  const payableTotal = useComputed$(() => Math.max(0, total.value - appliedCreditAmt.value));

  // Split payment totals
  const totalSplitTendered = useComputed$(() =>
    splitPayments.value.reduce((sum, p) => sum + p.amount, 0)
  );

  const remainingBalanceDue = useComputed$(() =>
    Math.max(0, Math.round((payableTotal.value - totalSplitTendered.value) * 100) / 100)
  );

  const selectBatchForBill = $((batch: ItemBatch) => {
    if (batchPickerTargetLineIndex.value !== null) {
      const idx = batchPickerTargetLineIndex.value;
      const line = bill.value[idx];
      if (line) {
        const isTracked = line.item.track_inventory === 1 || Boolean((line.item as any).track_inventory);
        const trackInv = enforceStockLimit.value && isTracked;
        const nextQty = trackInv ? Math.min(line.qty, batch.qty_remaining) : line.qty;
        bill.value = bill.value.map((l, i) => i === idx ? { ...l, batch, qty: nextQty, free_qty: calcFreeQty(nextQty, l.item) } : l);
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
      const existing = bill.value.findIndex(l => l.item.id === item.id && l.batch?.id === batch.id);
      if (existing >= 0) {
        const currentQty = bill.value[existing].qty;
        if (trackInv && (currentQty >= effectiveLimit || totalInCart >= itemStock)) {
          batchPickerOpen.value = false;
          batchPickerItem.value = null;
          batchPickerTargetLineIndex.value = null;
          return;
        }
        const nextQty = trackInv ? Math.min(currentQty + 1, effectiveLimit) : currentQty + 1;
        bill.value = bill.value.map((l, i) => {
          if (i === existing) {
            return { ...l, qty: nextQty, free_qty: calcFreeQty(nextQty, l.item) };
          }
          return l;
        });
      } else {
        bill.value = [
          ...bill.value,
          {
            item,
            qty: 1,
            free_qty: calcFreeQty(1, item),
            discount_pct: item.discount_pct ?? 0,
            extra_discount: (item as any).extra_discount ?? 0,
            batch,
          }
        ];
      }
    }
    batchPickerOpen.value = false;
    batchPickerItem.value = null;
    batchPickerTargetLineIndex.value = null;
  });

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
      const isTracked = line.item.track_inventory === 1 || Boolean((line.item as any).track_inventory);
      const trackInv = enforceStockLimit.value && isTracked;
      if (batches && batches.length > 0) {
        if (trackInv && batches.every((b) => b.qty_remaining <= 0)) {
          return;
        }
        batchPickerItem.value = line.item;
        batchPickerList.value = batches;
        batchPickerTargetLineIndex.value = lineIdx;
        batchPickerOpen.value = true;
      }
    } catch (err) {
      console.warn("[NewBillModal] Failed to load batches for line:", err);
    }
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

        const existing = bill.value.findIndex((l) => l.item.id === item.id && l.batch?.id === singleBatch.id);
        if (existing >= 0) {
          const currentQty = bill.value[existing].qty;
          if (trackInv && (currentQty >= effectiveBatchLimit || inCartTotal >= totalStock)) return;
          const nextQty = trackInv ? Math.min(currentQty + 1, effectiveBatchLimit) : currentQty + 1;
          bill.value = bill.value.map((l, i) => i === existing ? { ...l, qty: nextQty, free_qty: calcFreeQty(nextQty, l.item) } : l);
        } else {
          bill.value = [
            ...bill.value,
            {
              item,
              qty: 1,
              free_qty: calcFreeQty(1, item),
              discount_pct: item.discount_pct ?? 0,
              extra_discount: (item as any).extra_discount ?? 0,
              batch: singleBatch,
            }
          ];
        }
        return;
      }

      // Non-batch item (or items where batches are 0 but warehouse positions are positive)
      const existing = bill.value.findIndex((l) => l.item.id === item.id && !l.batch);
      if (existing >= 0) {
        const currentQty = bill.value[existing].qty;
        if (trackInv && inCartTotal >= totalStock) return;
        const nextQty = trackInv ? Math.min(currentQty + 1, totalStock) : currentQty + 1;
        bill.value = bill.value.map((l, i) => i === existing ? { ...l, qty: nextQty, free_qty: calcFreeQty(nextQty, l.item) } : l);
      } else {
        bill.value = [
          ...bill.value,
          {
            item,
            qty: 1,
            free_qty: calcFreeQty(1, item),
            discount_pct: item.discount_pct ?? 0,
            extra_discount: (item as any).extra_discount ?? 0,
            batch: null,
          }
        ];
      }
    } catch (err) {
      console.error("[NewBillModal] addItem error:", err);
    }
  });

  const handleProductSaved = $((savedItem: ModalShopItem) => {
    const exists = allItems.value.some((i) => i.id === savedItem.id);
    if (!exists) {
      allItems.value = [savedItem as unknown as ShopItem, ...allItems.value];
    } else {
      allItems.value = allItems.value.map((i) => (i.id === savedItem.id ? (savedItem as unknown as ShopItem) : i));
    }
    addItem(savedItem as unknown as ShopItem);
    showAddProductModal.value = false;
    editingProduct.value = null;
  });

  const isEditMode = useComputed$(() => !!(editInvoice?.value));

  const changeQty = $((idx: number, delta: number) => {
    const next = [...bill.value];
    const line = next[idx];
    if (!line) return;
    const isTracked = line.item.track_inventory === 1 || Boolean((line.item as any).track_inventory);
    const trackInv = enforceStockLimit.value && isTracked;
    const stockInMap = stockMap.value[line.item.id];
    const fallbackStock = (line.item as any).stock_qty !== undefined ? (line.item as any).stock_qty : 0;
    const availableStock = line.batch ? line.batch.qty_remaining : (stockInMap !== undefined ? Math.max(stockInMap, fallbackStock) : fallbackStock);

    if (delta > 0 && trackInv && line.qty + delta > availableStock) {
      return; // Cannot exceed available stock
    }

    const isConfirmedEdit = isEditMode.value && editInvoice?.value?.status !== "draft";
    const newQty = next[idx].qty + delta;
    if (newQty <= 0) {
      if (isConfirmedEdit) {
        next[idx] = { ...next[idx], qty: 0, free_qty: 0 };
      } else {
        next.splice(idx, 1);
      }
    } else {
      const freeQty = calcFreeQty(newQty, next[idx].item);
      next[idx] = { ...next[idx], qty: newQty, free_qty: freeQty };
    }
    bill.value = next;
  });

  const removeLine = $((idx: number) => {
    const line = bill.value[idx];
    if (!line) return;
    const isConfirmedEdit = isEditMode.value && editInvoice?.value?.status !== "draft";
    if (isConfirmedEdit) {
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

  // Pre-fill from editInvoice when opened in edit mode.
  // If lines[] is empty (stub from table row), fetch full detail lazily — modal opens instantly.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const inv = track(() => editInvoice?.value);
    const isOpen = track(() => open.value);
    if (!inv || !isOpen) return;

    // Pre-fill customer properly
    if (inv.customer_name) {
      customerName.value = inv.customer_name;
      if (inv.customer_id && customers.value && customers.value.length > 0) {
        const matched = customers.value.find((c) => c.id === inv.customer_id);
        if (matched) {
          pickedCustomer.value = matched;
        } else {
          pickedCustomer.value = {
            id: inv.customer_id,
            name: inv.customer_name,
            phone: (inv as any).customer_phone || null,
            email: (inv as any).customer_email || null,
            city: (inv as any).customer_city || null,
            state: (inv as any).customer_state || null,
            gstin: (inv as any).customer_gstin || null,
          };
        }
      } else {
        pickedCustomer.value = {
          id: inv.customer_id || "temp-cust",
          name: inv.customer_name,
          phone: (inv as any).customer_phone || null,
          email: (inv as any).customer_email || null,
          city: (inv as any).customer_city || null,
          state: (inv as any).customer_state || null,
          gstin: (inv as any).customer_gstin || null,
        };
      }
      if (pickedCustomer.value?.id && !pickedCustomer.value.id.startsWith("temp-") && !pickedCustomer.value.id.startsWith("order-cust-")) {
        invoke<CustomerBillingContext>("shop_get_customer_billing_context", { customerId: pickedCustomer.value.id })
          .then((ctx) => { creditContext.value = ctx; })
          .catch(() => { creditContext.value = null; });
      }
    }
    if (inv.payment_mode) {
      payMode.value = inv.payment_mode.toLowerCase() as any;
    }
    if ((inv as any).service_mode) {
      serviceMode.value = (inv as any).service_mode;
    }
    if ((inv as any).staff_id) {
      selectedStaffId.value = (inv as any).staff_id;
    }

    invoke<any[]>("shop_list_staff", {})
      .then((res) => { staffList.value = res || []; })
      .catch(() => {});

    const parseLineDiscounts = (l: any) => {
      let d1 = l.discount_pct ?? 0;
      let d2 = 0;
      let pack: string | undefined = l.pack_size ?? undefined;
      if (l.line_meta) {
        try {
          const m = typeof l.line_meta === "string" ? JSON.parse(l.line_meta) : l.line_meta;
          d2 = Number(m.extra_discount ?? m.discount2 ?? m.dis2 ?? 0);
          if (m.discount_pct !== undefined) d1 = Number(m.discount_pct);
          else if (m.dis1 !== undefined) d1 = Number(m.dis1);
          else if (d2 > 0) d1 = Math.max(0, d1 - d2);
          if (!pack) pack = m.pack_size || m.pack || undefined;
        } catch { /* noop */ }
      }
      return { d1, d2, pack };
    };

    if (inv.lines.length > 0) {
      // Full detail already loaded (e.g. from detail slideout Edit button)
      bill.value = inv.lines.map(l => {
        const { d1, d2, pack } = parseLineDiscounts(l);
        return {
          item: {
            id: l.item_id,
            name: l.description ?? l.item_id,
            price: l.unit_price,
            item_type: "product",
            default_mrp: l.mrp ?? 0,
            discount_pct: d1,
            extra_discount: d2,
            pack_size: pack,
            conversion_factor: l.conversion_factor ?? undefined,
          },
          qty: l.qty,
          original_qty: l.qty, // Option B: remember original confirmed quantity
          discount_pct: d1,
          extra_discount: d2,
        };
      });
    } else {
      // Stub — fetch lines in background while modal is already open
      loading.value = true;
      try {
        const detail = await invoke<import("~/components/shop/InvoiceDetailSlideOver").InvoiceDetail>(
          "shop_get_invoice", { invoiceId: inv.id }
        );
        if ((detail as any).service_mode) {
          serviceMode.value = (detail as any).service_mode;
        }
        bill.value = detail.lines.map(l => {
          const { d1, d2, pack } = parseLineDiscounts(l);
          return {
            item: {
              id: l.item_id,
              name: l.description ?? l.item_id,
              price: l.unit_price,
              item_type: "product",
              default_mrp: l.mrp ?? 0,
              discount_pct: d1,
              extra_discount: d2,
              pack_size: pack,
              conversion_factor: l.conversion_factor ?? undefined,
            },
            qty: l.qty,
            original_qty: l.qty, // Option B: remember original confirmed quantity
            discount_pct: d1,
            extra_discount: d2,
          };
        });
        // Merge full detail back into editInvoice so isEditMode + status checks work
        if (editInvoice) editInvoice.value = detail;
      } catch (e) {
        console.error("[NewBillModal] lazy load lines failed:", e);
      } finally {
        loading.value = false;
      }
    }
  });

  const applyCouponByCode = $(async (codeToApply: string) => {
    const trimmed = codeToApply.trim().toUpperCase();
    if (!trimmed) {
      couponError.value = "Please enter a coupon code";
      return;
    }
    couponValidating.value = true;
    couponError.value = null;
    try {
      const res = await invoke<{
        is_valid: boolean;
        reason?: string | null;
        discount_code?: ShopDiscountCode | null;
        discount_amount: number;
      }>("shop_validate_discount_code", {
        code: trimmed,
        orderSubtotal: postItemSubtotal.value,
      });

      if (!res.is_valid) {
        couponError.value = res.reason || "Invalid coupon code";
        return;
      }

      const disc = res.discount_code;
      if (disc) {
        appliedCoupon.value = {
          code: disc.code,
          discount_type: disc.discount_type,
          value: disc.value,
          max_discount: disc.max_discount,
          amount: res.discount_amount,
        };
        // Reset manual discount
        billDiscountPct.value = 0;
        billDiscountAmt.value = 0;
        couponCodeInput.value = "";
        showCouponDrawer.value = false;
      }
    } catch (err) {
      couponError.value = String(err);
    } finally {
      couponValidating.value = false;
    }
  });

  const removeCoupon = $(() => {
    appliedCoupon.value = null;
    couponError.value = null;
  });

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
      }
    ];

    splitTenderAmt.value = "";
  });

  const removeSplitPayment = $((idx: number) => {
    const updated = [...splitPayments.value];
    updated.splice(idx, 1);
    splitPayments.value = updated;
    splitTenderAmt.value = "";
  });

  const cancelSplitMode = $(() => {
    isSplitMode.value = false;
    splitPayments.value = [];
    splitTenderAmt.value = "";
  });

  const buildBillLinesPayload = $(() =>
    bill.value.map(l => ({
      item_id: l.item.id,
      item_name: l.item.name,
      batch_id: l.batch?.id ?? null,
      qty: l.qty,
      free_qty: l.free_qty ?? 0,
      unit_price: l.item.price,
      discount_pct: l.discount_pct,
      extra_discount: l.extra_discount,
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
        expiry_date: l.batch?.expiry_date ? new Date(l.batch.expiry_date).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" }) : null,
        mrp: l.batch?.mrp || l.item.default_mrp || 0,
        extra_discount: l.extra_discount || 0,
        discount2: l.extra_discount || 0,
        dis2: l.extra_discount || 0,
        discount_pct: l.discount_pct || 0,
        dis1: l.discount_pct || 0,
        original_qty: l.original_qty !== undefined ? l.original_qty : l.qty,
        return_qty: l.original_qty !== undefined ? Math.max(0, l.original_qty - l.qty) : 0,
        billed_qty: l.qty,
      }),
    }))
  );

  const buildPaymentsPayload = $(() => {
    const pays: Array<{ amount: number; payment_mode: string; reference?: string; notes?: string }> = [];
    if (pickedCustomer.value && appliedCreditAmt.value > 0) {
      pays.push({
        amount: appliedCreditAmt.value,
        payment_mode: "store_credit",
        reference: "STORE-CREDIT-REDEEM",
        notes: `Store credit applied by ${pickedCustomer.value.name}`,
      });
    }

    if (isSplitMode.value && splitPayments.value.length > 0) {
      for (const sp of splitPayments.value) {
        if (sp.amount > 0) {
          pays.push({
            amount: sp.amount,
            payment_mode: sp.mode,
            reference: `SPLIT-${sp.mode.toUpperCase()}`,
            notes: `Split payment (${sp.label})`,
          });
        }
      }
    } else {
      const payAmount = Math.max(0, payableTotal.value);
      if (payAmount > 0.005) {
        pays.push({
          amount: payAmount,
          payment_mode: payMode.value,
        });
      }
    }
    return pays;
  });

  const handleConfirm = $(async () => {
    if (bill.value.length === 0) return;
    processing.value = true;
    error.value = null;
    try {
      const isDraftEdit = isEditMode.value && editInvoice?.value?.status === "draft";
      const payments = (!isEditMode.value || isDraftEdit) ? await buildPaymentsPayload() : undefined;

      if (isEditMode.value && editInvoice?.value) {
        // Always update the existing invoice lines and status
        const updated = await invoke<{ id: string; doc_number: string; grand_total: number; lines: unknown[] }>(
          "shop_update_invoice",
          {
            data: {
              invoice_id: editInvoice.value.id,
              lines: await buildBillLinesPayload(),
              payments,
              channel: salesOrderId?.value ? "wholesale" : "pos",
              service_mode: serviceMode.value,
              status: isDraftEdit ? "confirmed" : undefined,
              customer_id: pickedCustomer.value?.id ?? null,
              staff_id: selectedStaffId.value || undefined,
              sales_order_id: salesOrderId?.value || undefined,
              bill_discount_pct: appliedCoupon.value
                ? (appliedCoupon.value.discount_type === "percent" ? appliedCoupon.value.value : undefined)
                : (billDiscountMode.value === "pct" && billDiscountPct.value > 0 ? billDiscountPct.value : undefined),
              bill_discount_amt: billDiscount.value > 0 ? billDiscount.value : undefined,
              notes: [
                pickedCustomer.value
                  ? `${pickedCustomer.value.name}${selectedShippingAddress.value ? ` | Ship to: ${selectedShippingAddress.value.address1}, ${selectedShippingAddress.value.city}` : ""}`
                  : customerName.value.trim() || undefined,
                appliedCoupon.value ? `[Coupon: ${appliedCoupon.value.code}]` : undefined,
              ].filter(Boolean).join(" • ") || undefined,
            },
          }
        );

        // Redeem coupon usage
        if (appliedCoupon.value) {
          try {
            await invoke("shop_redeem_discount_code", { code: appliedCoupon.value.code });
          } catch (e) {
            console.warn("[NewBillModal] Failed to increment coupon usage:", e);
          }
        }

        open.value = false;
        if (salesOrderId) salesOrderId.value = null;
        await onBilled$({
          invoiceId: updated.id,
          docNumber: updated.doc_number,
          total: updated.grand_total,
        });
      } else {
        // ── New invoice + record payment ────────────────────────────────
        const inv = await invoke<{
          id: string;
          doc_number: string;
          grand_total: number;
          lines: unknown[];
        }>(
          "shop_create_invoice",
          {
            data: {
              lines: await buildBillLinesPayload(),
              payments,
              channel: salesOrderId?.value ? "wholesale" : "pos",
              service_mode: serviceMode.value,
              customer_id: pickedCustomer.value?.id ?? null,
              staff_id: selectedStaffId.value || undefined,
              sales_order_id: salesOrderId?.value || undefined,
              bill_discount_pct: appliedCoupon.value
                ? (appliedCoupon.value.discount_type === "percent" ? appliedCoupon.value.value : undefined)
                : (billDiscountMode.value === "pct" && billDiscountPct.value > 0 ? billDiscountPct.value : undefined),
              bill_discount_amt: billDiscount.value > 0 ? billDiscount.value : undefined,
              notes: [
                pickedCustomer.value
                  ? `${pickedCustomer.value.name}${selectedShippingAddress.value ? ` | Ship to: ${selectedShippingAddress.value.address1}, ${selectedShippingAddress.value.city}` : ""}`
                  : customerName.value.trim() || undefined,
                appliedCoupon.value ? `[Coupon: ${appliedCoupon.value.code}]` : undefined,
              ].filter(Boolean).join(" • ") || undefined,
            },
          }
        );

        // Redeem coupon usage
        if (appliedCoupon.value) {
          try {
            await invoke("shop_redeem_discount_code", { code: appliedCoupon.value.code });
          } catch (e) {
            console.warn("[NewBillModal] Failed to increment coupon usage:", e);
          }
        }

        open.value = false;
        if (salesOrderId) salesOrderId.value = null;
        await onBilled$({
          invoiceId: inv.id,
          docNumber: inv.doc_number,
          total: inv.grand_total,
        });
      }
    } catch (e) {
      error.value = String(e);
    } finally {
      processing.value = false;
    }
  });

  const handleMarkUnpaid = $(async () => {
    if (bill.value.length === 0) return;
    processing.value = true;
    error.value = null;
    try {
      const storeCreditPayments = (pickedCustomer.value && appliedCreditAmt.value > 0)
        ? [{
            amount: appliedCreditAmt.value,
            payment_mode: "store_credit",
            reference: "STORE-CREDIT-REDEEM",
            notes: `Store credit applied by ${pickedCustomer.value.name}`,
          }]
        : undefined;

      let invId = "";
      let invDocNumber = "";
      let invTotal = 0;

      if (isEditMode.value && editInvoice?.value) {
        const updated = await invoke<{
          id: string;
          doc_number: string;
          grand_total: number;
          lines: unknown[];
        }>(
          "shop_update_invoice",
          {
            data: {
              invoice_id: editInvoice.value.id,
              lines: await buildBillLinesPayload(),
              payments: storeCreditPayments,
              channel: salesOrderId?.value ? "wholesale" : "pos",
              service_mode: serviceMode.value,
              status: "confirmed",
              customer_id: pickedCustomer.value?.id ?? null,
              staff_id: selectedStaffId.value || undefined,
              sales_order_id: salesOrderId?.value || undefined,
              bill_discount_pct: appliedCoupon.value
                ? (appliedCoupon.value.discount_type === "percent" ? appliedCoupon.value.value : undefined)
                : (billDiscountMode.value === "pct" && billDiscountPct.value > 0 ? billDiscountPct.value : undefined),
              bill_discount_amt: billDiscount.value > 0 ? billDiscount.value : undefined,
              notes: [
                pickedCustomer.value
                  ? `${pickedCustomer.value.name}${selectedShippingAddress.value ? ` | Ship to: ${selectedShippingAddress.value.address1}, ${selectedShippingAddress.value.city}` : ""}`
                  : customerName.value.trim() || undefined,
                appliedCoupon.value ? `[Coupon: ${appliedCoupon.value.code}]` : undefined,
                "[Unpaid]",
              ].filter(Boolean).join(" • ") || undefined,
            },
          }
        );
        invId = updated.id;
        invDocNumber = updated.doc_number;
        invTotal = updated.grand_total;
      } else {
        const inv = await invoke<{
          id: string;
          doc_number: string;
          grand_total: number;
          lines: unknown[];
        }>(
          "shop_create_invoice",
          {
            data: {
              lines: await buildBillLinesPayload(),
              payments: storeCreditPayments,
              channel: salesOrderId?.value ? "wholesale" : "pos",
              service_mode: serviceMode.value,
              status: "confirmed",
              customer_id: pickedCustomer.value?.id ?? null,
              staff_id: selectedStaffId.value || undefined,
              sales_order_id: salesOrderId?.value || undefined,
              bill_discount_pct: appliedCoupon.value
                ? (appliedCoupon.value.discount_type === "percent" ? appliedCoupon.value.value : undefined)
                : (billDiscountMode.value === "pct" && billDiscountPct.value > 0 ? billDiscountPct.value : undefined),
              bill_discount_amt: billDiscount.value > 0 ? billDiscount.value : undefined,
              notes: [
                pickedCustomer.value
                  ? `${pickedCustomer.value.name}${selectedShippingAddress.value ? ` | Ship to: ${selectedShippingAddress.value.address1}, ${selectedShippingAddress.value.city}` : ""}`
                  : customerName.value.trim() || undefined,
                appliedCoupon.value ? `[Coupon: ${appliedCoupon.value.code}]` : undefined,
                "[Unpaid]",
              ].filter(Boolean).join(" • ") || undefined,
            },
          }
        );
        invId = inv.id;
        invDocNumber = inv.doc_number;
        invTotal = inv.grand_total;
      }

      // Redeem coupon usage
      if (appliedCoupon.value) {
        try {
          await invoke("shop_redeem_discount_code", { code: appliedCoupon.value.code });
        } catch (e) {
          console.warn("[NewBillModal] Failed to increment coupon usage:", e);
        }
      }

      open.value = false;
      if (salesOrderId) salesOrderId.value = null;
      await onBilled$({
        invoiceId: invId,
        docNumber: invDocNumber,
        total: invTotal,
      });
    } catch (e) {
      error.value = String(e);
    } finally {
      processing.value = false;
    }
  });

  const handleMarkPartiallyPaid = $(async () => {
    if (bill.value.length === 0 || splitPayments.value.length === 0) return;
    processing.value = true;
    error.value = null;
    try {
      const partialPayments: Array<{ amount: number; payment_mode: string; reference?: string; notes?: string }> = [];
      if (pickedCustomer.value && appliedCreditAmt.value > 0) {
        partialPayments.push({
          amount: appliedCreditAmt.value,
          payment_mode: "store_credit",
          reference: "STORE-CREDIT-REDEEM",
          notes: `Store credit applied by ${pickedCustomer.value.name}`,
        });
      }
      for (const sp of splitPayments.value) {
        if (sp.amount > 0) {
          partialPayments.push({
            amount: sp.amount,
            payment_mode: sp.mode,
            reference: `SPLIT-${sp.mode.toUpperCase()}`,
            notes: `Split payment (${sp.label})`,
          });
        }
      }

      let invId = "";
      let invDocNumber = "";
      let invTotal = 0;

      if (isEditMode.value && editInvoice?.value) {
        const updated = await invoke<{
          id: string;
          doc_number: string;
          grand_total: number;
          lines: unknown[];
        }>(
          "shop_update_invoice",
          {
            data: {
              invoice_id: editInvoice.value.id,
              lines: await buildBillLinesPayload(),
              payments: partialPayments,
              channel: salesOrderId?.value ? "wholesale" : "pos",
              service_mode: serviceMode.value,
              status: "confirmed",
              customer_id: pickedCustomer.value?.id ?? null,
              staff_id: selectedStaffId.value || undefined,
              sales_order_id: salesOrderId?.value || undefined,
              bill_discount_pct: appliedCoupon.value
                ? (appliedCoupon.value.discount_type === "percent" ? appliedCoupon.value.value : undefined)
                : (billDiscountMode.value === "pct" && billDiscountPct.value > 0 ? billDiscountPct.value : undefined),
              bill_discount_amt: billDiscount.value > 0 ? billDiscount.value : undefined,
              notes: [
                pickedCustomer.value
                  ? `${pickedCustomer.value.name}${selectedShippingAddress.value ? ` | Ship to: ${selectedShippingAddress.value.address1}, ${selectedShippingAddress.value.city}` : ""}`
                  : customerName.value.trim() || undefined,
                appliedCoupon.value ? `[Coupon: ${appliedCoupon.value.code}]` : undefined,
                "[Partially Paid]",
              ].filter(Boolean).join(" • ") || undefined,
            },
          }
        );
        invId = updated.id;
        invDocNumber = updated.doc_number;
        invTotal = updated.grand_total;
      } else {
        const inv = await invoke<{
          id: string;
          doc_number: string;
          grand_total: number;
          lines: unknown[];
        }>(
          "shop_create_invoice",
          {
            data: {
              lines: await buildBillLinesPayload(),
              payments: partialPayments,
              channel: salesOrderId?.value ? "wholesale" : "pos",
              service_mode: serviceMode.value,
              status: "confirmed",
              customer_id: pickedCustomer.value?.id ?? null,
              staff_id: selectedStaffId.value || undefined,
              sales_order_id: salesOrderId?.value || undefined,
              bill_discount_pct: appliedCoupon.value
                ? (appliedCoupon.value.discount_type === "percent" ? appliedCoupon.value.value : undefined)
                : (billDiscountMode.value === "pct" && billDiscountPct.value > 0 ? billDiscountPct.value : undefined),
              bill_discount_amt: billDiscount.value > 0 ? billDiscount.value : undefined,
              notes: [
                pickedCustomer.value
                  ? `${pickedCustomer.value.name}${selectedShippingAddress.value ? ` | Ship to: ${selectedShippingAddress.value.address1}, ${selectedShippingAddress.value.city}` : ""}`
                  : customerName.value.trim() || undefined,
                appliedCoupon.value ? `[Coupon: ${appliedCoupon.value.code}]` : undefined,
                "[Partially Paid]",
              ].filter(Boolean).join(" • ") || undefined,
            },
          }
        );
        invId = inv.id;
        invDocNumber = inv.doc_number;
        invTotal = inv.grand_total;
      }

      // Redeem coupon usage
      if (appliedCoupon.value) {
        try {
          await invoke("shop_redeem_discount_code", { code: appliedCoupon.value.code });
        } catch (e) {
          console.warn("[NewBillModal] Failed to increment coupon usage:", e);
        }
      }

      open.value = false;
      if (salesOrderId) salesOrderId.value = null;
      await onBilled$({
        invoiceId: invId,
        docNumber: invDocNumber,
        total: invTotal,
      });
    } catch (e) {
      error.value = String(e);
    } finally {
      processing.value = false;
    }
  });

  const handleSaveDraft = $(async () => {
    if (bill.value.length === 0) return;
    processing.value = true;
    error.value = null;
    try {
      let invId = "";
      let invDocNumber = "";
      let invTotal = 0;

      if (isEditMode.value && editInvoice?.value) {
        const updated = await invoke<{ id: string; doc_number: string; grand_total: number; lines: unknown[] }>(
          "shop_update_invoice",
          {
            data: {
              invoice_id: editInvoice.value.id,
              lines: await buildBillLinesPayload(),
              channel: salesOrderId?.value ? "wholesale" : "pos",
              service_mode: serviceMode.value,
              customer_id: pickedCustomer.value?.id ?? null,
              staff_id: selectedStaffId.value || undefined,
              sales_order_id: salesOrderId?.value || undefined,
              bill_discount_pct: appliedCoupon.value
                ? (appliedCoupon.value.discount_type === "percent" ? appliedCoupon.value.value : undefined)
                : (billDiscountMode.value === "pct" && billDiscountPct.value > 0 ? billDiscountPct.value : undefined),
              bill_discount_amt: billDiscount.value > 0 ? billDiscount.value : undefined,
              notes: [
                pickedCustomer.value
                  ? `${pickedCustomer.value.name}${selectedShippingAddress.value ? ` | Ship to: ${selectedShippingAddress.value.address1}, ${selectedShippingAddress.value.city}` : ""}`
                  : customerName.value.trim() || undefined,
                appliedCoupon.value ? `[Coupon: ${appliedCoupon.value.code}]` : undefined,
              ].filter(Boolean).join(" • ") || undefined,
              status: "draft",
            },
          }
        );
        invId = updated.id;
        invDocNumber = updated.doc_number;
        invTotal = updated.grand_total;
      } else {
        const inv = await invoke<{ id: string; doc_number: string; grand_total: number; lines: unknown[] }>(
          "shop_create_invoice",
          {
            data: {
              lines: await buildBillLinesPayload(),
              channel: salesOrderId?.value ? "wholesale" : "pos",
              service_mode: serviceMode.value,
              customer_id: pickedCustomer.value?.id ?? null,
              staff_id: selectedStaffId.value || undefined,
              sales_order_id: salesOrderId?.value || undefined,
              bill_discount_pct: appliedCoupon.value
                ? (appliedCoupon.value.discount_type === "percent" ? appliedCoupon.value.value : undefined)
                : (billDiscountMode.value === "pct" && billDiscountPct.value > 0 ? billDiscountPct.value : undefined),
              bill_discount_amt: billDiscount.value > 0 ? billDiscount.value : undefined,
              notes: [
                pickedCustomer.value
                  ? `${pickedCustomer.value.name}${selectedShippingAddress.value ? ` | Ship to: ${selectedShippingAddress.value.address1}, ${selectedShippingAddress.value.city}` : ""}`
                  : customerName.value.trim() || undefined,
                appliedCoupon.value ? `[Coupon: ${appliedCoupon.value.code}]` : undefined,
              ].filter(Boolean).join(" • ") || undefined,
              status: "draft",
            },
          }
        );
        invId = inv.id;
        invDocNumber = inv.doc_number;
        invTotal = inv.grand_total;
      }

      open.value = false;
      if (salesOrderId) salesOrderId.value = null;
      await onBilled$({
        invoiceId: invId,
        docNumber: invDocNumber,
        total: invTotal,
      });
    } catch (e) {
      error.value = String(e);
    } finally {
      processing.value = false;
    }
  });

  const fmt = (n: number) => fmtMoney(n);

  return (
    <>
      <SlideOver
        open={open}
        title={
          payStep.value
            ? "Take Payment"
            : isEditMode.value
              ? (editInvoice?.value?.status === "draft" ? "Edit Draft" : "Edit Invoice")
              : "New Bill"
        }
        subtitle={
          payStep.value
            ? `Total: ${fmt(total.value)}`
            : isEditMode.value
              ? `${editInvoice?.value?.doc_number ?? ""} — tap items to adjust`
              : "Tap a product to add it to the bill."
        }
        width="calc(85vw + 3rem)"
        onClose$={$(() => {
          // Block accidental close if bill has items — user must click ✕
          if (bill.value.length > 0 && !payStep.value) return;
          open.value = false;
        })}
      >
        {/* ── Top Bar Staff Selector (before close cross icon) ── */}
        <div q:slot="header-actions">
          <ShopStaffSelector selectedStaffId={selectedStaffId} />
        </div>

        {/* ── Error banner ──────────────────────────────────────────────── */}
        {error.value && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.75rem 1rem",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "0.375rem",
              color: "var(--error)",
              fontSize: "0.8125rem",
            }}
          >
            {error.value}
          </div>
        )}

        {/* ══════════════════════ STEP 1 — PRODUCT PICKER ═════════════════ */}
        {!payStep.value && (
          <div class={["bill-step1-layout", bill.value.length >= 6 ? "cart-many-items" : bill.value.length > 0 ? "cart-some-items" : "cart-empty"].join(" ")}>

            {/* Left — product grid */}
            <div class="bill-left-panel">

              {/* Search & Stock Limit Toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    background: "var(--field-fill)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.375rem",
                    padding: "0 0.75rem",
                    height: "2.25rem",
                    flex: 1,
                    minWidth: 0,
                    boxSizing: "border-box",
                  }}
                >
                  <LuSearch style="width:0.875rem;height:0.875rem;color:var(--text-secondary);flex-shrink:0;" />
                  <input
                    type="text"
                    placeholder="Search or scan barcode…"
                    value={query.value}
                    onInput$={(e) => { query.value = (e.target as HTMLInputElement).value; }}
                    onKeyDown$={$(async (e: KeyboardEvent) => {
                      if (e.key !== "Enter") return;
                      const bc = query.value.trim();
                      if (!bc) return;
                      try {
                        const found = await invoke<{ id: string; name: string; price: number; sku?: string } | null>(
                          "shop_find_item_by_barcode", { barcode: bc }
                        );
                        if (found) {
                          addItem(found as unknown as ShopItem);
                          query.value = "";
                        }
                      } catch (err) {
                        console.warn("[NewBillModal] barcode lookup failed:", err);
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
                      fontSize: "0.875rem",
                    }}
                  />
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
                    height: "2.25rem",
                    width: "2.25rem",
                    minWidth: "2.25rem",
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
                  <LuPlus style={{ width: "1rem", height: "1rem" }} />
                </button>

                {/* Stock limit toggle button */}
                <button
                  type="button"
                  class="stock-limit-toggle-btn"
                  onClick$={() => { enforceStockLimit.value = !enforceStockLimit.value; }}
                  title={enforceStockLimit.value ? "Stock Limit Active: Block adding items above available stock" : "Stock Limit Off: Allow negative / overdraft billing"}
                  style={{
                    background: enforceStockLimit.value ? "rgba(16,185,129,0.12)" : "var(--surface-3)",
                    color: enforceStockLimit.value ? "#10b981" : "var(--text-secondary)",
                  }}
                >
                  <span
                    style={{
                      width: "0.45rem",
                      height: "0.45rem",
                      borderRadius: "50%",
                      background: enforceStockLimit.value ? "#10b981" : "#94a3b8",
                      display: "inline-block",
                      flexShrink: 0,
                    }}
                  />
                  {enforceStockLimit.value ? (
                    <>
                      <span class="stock-limit-text-full">Stock Limit</span>
                      <span class="stock-limit-text-mobile">Stock</span>
                    </>
                  ) : (
                    <>
                      <span class="stock-limit-text-full">No Limit</span>
                      <span class="stock-limit-text-mobile">No Cap</span>
                    </>
                  )}
                </button>
              </div>

              {/* Grid */}
              {loading.value ? (
                <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>Loading…</div>
              ) : filtered.value.length === 0 ? (
                <div
                  style={{
                    fontSize: "0.875rem",
                    color: "var(--text-secondary)",
                    padding: "2rem 0",
                    textAlign: "center",
                  }}
                >
                  {query.value ? "No products match your search." : "No products — add some in Products first."}
                </div>
              ) : (
                <div class="bill-item-grid">
                  {filtered.value.slice(0, displayLimit.value).map(item => {
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
                    const remainingStock = Math.max(0, stock - inCartQty);
                    const isCapReached = enforceStockLimit.value && isTracked && (stock <= 0 || remainingStock <= 0);

                    const hasImage = Boolean(item.seo_og_image || item.media_url);

                    return (
                      <div
                        key={item.id}
                        onClick$={$(() => {
                          if (isCapReached) return;
                          addItem(item);
                        })}
                        class={["bill-item-card", hasImage ? "has-thumb" : "no-thumb", isCapReached ? "is-disabled is-out" : ""].join(" ")}
                        style={isCapReached ? { opacity: 0.42, filter: "grayscale(0.85)", cursor: "not-allowed" } : undefined}
                      >
                        {/* Low stock / Out of stock / Max badge */}
                        {isTracked && (
                          <>
                            {stock <= 0 ? (
                              <span style={{ position: "absolute", top: "0.35rem", right: "0.35rem", background: "rgba(239,68,68,0.9)", color: "#fff", fontSize: "0.6rem", fontWeight: "700", borderRadius: "0.2rem", padding: "0.1rem 0.35rem", zIndex: 2 }}>OUT</span>
                            ) : isCapReached ? (
                              <span style={{ position: "absolute", top: "0.35rem", right: "0.35rem", background: "rgba(239,68,68,0.9)", color: "#fff", fontSize: "0.6rem", fontWeight: "700", borderRadius: "0.2rem", padding: "0.1rem 0.35rem", zIndex: 2 }}>MAX</span>
                            ) : stock <= 10 ? (
                              <span style={{ position: "absolute", top: "0.35rem", right: "0.35rem", background: "rgba(245,158,11,0.9)", color: "#fff", fontSize: "0.6rem", fontWeight: "700", borderRadius: "0.2rem", padding: "0.1rem 0.35rem", zIndex: 2 }}>{stock} left</span>
                            ) : null}
                          </>
                        )}
                      {/* Product Thumbnail (Edge to edge, zero padding) */}
                      {(item.seo_og_image || item.media_url) && (
                        <div class="bill-item-thumb">
                          <img
                            src={item.seo_og_image || item.media_url}
                            alt={item.name}
                            width="120"
                            height="120"
                            style={{ width: "100%", height: "auto", aspectRatio: "1 / 1", objectFit: "cover", display: "block" }}
                            onError$={(e) => {
                              const target = e.target as HTMLElement;
                              const parent = target.parentElement;
                              if (parent && parent.classList.contains("bill-item-thumb")) {
                                parent.style.display = "none";
                              } else {
                                target.style.display = "none";
                              }
                            }}
                          />
                        </div>
                      )}
                      {/* Text Container with Padding */}
                      <div class="bill-item-info">
                        <div
                          class="bill-item-title"
                          title={item.name}
                          style={!(item.seo_og_image || item.media_url) && isTracked && (stock <= 10 || isCapReached) ? { paddingRight: "2.75rem" } : undefined}
                        >
                          {item.name}
                        </div>

                        {/* Pricing & Discounts Display */}
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem", width: "100%" }}>
                          <div style={{ display: "flex", alignItems: "baseline", gap: "0.35rem", flexWrap: "wrap" }}>
                            <span class="bill-item-price-val">
                              {fmt(item.price)}
                            </span>
                            {item.default_mrp > item.price && (
                              <span style={{ fontSize: "0.725rem", color: "var(--text-secondary)", textDecoration: "line-through", whiteSpace: "nowrap" }}>
                                MRP {fmt(item.default_mrp)}
                              </span>
                            )}
                          </div>

                          {/* Discount badges below price: discount_pct and extra_discount */}
                          {((item.discount_pct || 0) > 0 || (item.extra_discount || 0) > 0) && (
                            <div style={{ display: "flex", gap: "0.2rem", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
                              {(item.discount_pct || 0) > 0 && (
                                <span style={{ fontSize: "0.6rem", fontWeight: "600", padding: "0.06rem 0.25rem", background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "0.25rem", whiteSpace: "nowrap", lineHeight: "1.2", boxSizing: "border-box" as const }}>
                                  Dis: {item.discount_pct}%
                                </span>
                              )}
                              {(item.extra_discount || 0) > 0 && (
                                <span style={{ fontSize: "0.6rem", fontWeight: "600", padding: "0.06rem 0.25rem", background: "rgba(168,85,247,0.12)", color: "#a855f7", border: "1px solid rgba(168,85,247,0.25)", borderRadius: "0.25rem", whiteSpace: "nowrap", lineHeight: "1.2", boxSizing: "border-box" as const }}>
                                  +{item.extra_discount}% Extra
                                </span>
                              )}
                            </div>
                          )}

                          {/* Trade Scheme badge */}
                          {(item.scheme_on || 0) > 0 && (item.scheme_free || 0) > 0 && (
                            <div style={{ display: "flex", gap: "0.2rem", flexWrap: "wrap", alignItems: "center", width: "100%" }}>
                              <span
                                style={{
                                  fontSize: "0.6rem",
                                  fontWeight: "700",
                                  padding: "0.06rem 0.25rem",
                                  background: "rgba(139,92,246,0.14)",
                                  color: "#8b5cf6",
                                  border: "1px solid rgba(139,92,246,0.3)",
                                  borderRadius: "0.25rem",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  maxWidth: "100%",
                                  whiteSpace: "nowrap",
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  lineHeight: "1.2",
                                  boxSizing: "border-box" as const,
                                }}
                                title={`Scheme: ${item.scheme_on}+${item.scheme_free} Free`}
                              >
                                Scheme: {item.scheme_on}+{item.scheme_free} Free
                              </span>
                            </div>
                          )}

                          {item.pack_size && (
                            <div style={{ fontSize: "0.6rem", color: "var(--text-secondary)", lineHeight: "1.2" }}>
                              Pack: {item.pack_size}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                  {/* Show more button when catalog has more than 25 items */}
                  {filtered.value.length > displayLimit.value && (
                    <div class="bill-show-more-wrap">
                      <button
                        type="button"
                        onClick$={() => { displayLimit.value += 25; }}
                        style={{
                          padding: "0.45rem 1.25rem",
                          background: "var(--surface-3)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          color: "var(--text-primary)",
                          fontSize: "0.8125rem",
                          fontWeight: "600",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.375rem",
                          transition: "all 150ms ease",
                        }}
                      >
                        <span>Show more ({filtered.value.length - displayLimit.value} remaining)</span>
                        <LuChevronDown style="width:0.875rem;height:0.875rem;" />
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right — bill panel */}
            <div class="bill-right-panel">
              {/* Customer Area at top of bill panel */}
              {pickedCustomer.value ? (
                <div
                  onClick$={() => { showCustomerDetail.value = true; }}
                  style={{
                    padding: "0.625rem 0.875rem",
                    borderBottom: "1px solid var(--border)",
                    cursor: "pointer",
                    flexShrink: 0,
                    transition: "background 150ms ease",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                    <div style={{ fontWeight: "600", fontSize: "0.875rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pickedCustomer.value.name}
                    </div>
                    <LuChevronRight style={{ width: "1rem", height: "1rem", color: "var(--text-secondary)", flexShrink: 0 }} />
                  </div>
                  {pickedCustomer.value.email && (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.1rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {pickedCustomer.value.email}
                    </div>
                  )}

                  {/* Store credit row if customer has credit */}
                  {creditContext.value && (creditContext.value.wallet_balance ?? creditContext.value.store_credit ?? 0) > 0 && (
                    <div
                      style={{
                        marginTop: "0.35rem",
                        padding: "0.3rem 0.5rem",
                        background: "var(--field-fill)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.25rem",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        fontSize: "0.72rem",
                      }}
                      onClick$={(e) => e.stopPropagation()}
                    >
                      <div>
                        <span style={{ color: "var(--text-secondary)" }}>Wallet (Store credit): </span>
                        <span style={{ fontWeight: "600", color: "#10b981" }}>{fmt(creditContext.value.wallet_balance ?? creditContext.value.store_credit ?? 0)}</span>
                        <span style={{ color: "var(--text-secondary)", marginLeft: "0.2rem" }}>available</span>
                      </div>
                      <button
                        type="button"
                        onClick$={() => { applyStoreCredit.value = !applyStoreCredit.value; }}
                        style={{
                          background: applyStoreCredit.value ? "#10b981" : "transparent",
                          color: applyStoreCredit.value ? "#ffffff" : "var(--accent)",
                          border: applyStoreCredit.value ? "none" : "1px solid var(--accent)",
                          borderRadius: "0.25rem",
                          padding: "0.1rem 0.45rem",
                          fontSize: "0.68rem",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        {applyStoreCredit.value ? "Applied ✓" : "Apply"}
                      </button>
                    </div>
                  )}

                  {/* Shipping address info */}
                  <div style={{ marginTop: "0.3rem", fontSize: "0.72rem", color: selectedShippingAddress.value ? "var(--text-secondary)" : "var(--accent)" }}>
                    {selectedShippingAddress.value
                      ? `Ship to: ${selectedShippingAddress.value.city || selectedShippingAddress.value.address1}`
                      : "Add shipping address"}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderBottom: "1px solid var(--border)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)" }}>
                    Cart {bill.value.length > 0 && `(${bill.value.length})`}
                  </div>
                  {isCustomerLocked.value ? (
                    <div
                      style={{
                        padding: "0.2rem 0.5rem",
                        background: "var(--surface-3)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.375rem",
                        color: "var(--text-secondary)",
                        fontSize: "0.72rem",
                        fontWeight: "600",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                      title="Customer locked to online B2B order"
                    >
                      <LuLock style={{ width: "0.75rem", height: "0.75rem" }} />
                      <span>B2B Order</span>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick$={() => { showCustPicker.value = true; }}
                      style={{
                        padding: "0.25rem 0.6rem",
                        background: "var(--surface-2)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.375rem",
                        color: "var(--text-primary)",
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <LuPlus style={{ width: "0.75rem", height: "0.75rem", flexShrink: 0 }} />
                      <span class="add-cust-btn-text-full">Add customer</span>
                      <span class="add-cust-btn-text-mobile">Add</span>
                    </button>
                  )}
                </div>
              )}

              {/* Service Mode Switcher: Dine-in / Takeaway / Delivery (Restaurant routes only) */}
              {isRestaurant && (
                <div
                  style={{
                    padding: "0.4rem 0.75rem",
                    borderBottom: "1px solid var(--border)",
                    background: "var(--surface-1)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: "0.5rem",
                    flexShrink: 0,
                  }}
                >
                  <div style={{ fontSize: "0.72rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Service Mode
                  </div>
                  <div
                    style={{
                      display: "inline-flex",
                      background: "var(--surface-3)",
                      borderRadius: "0.375rem",
                      padding: "0.15rem",
                      gap: "0.15rem",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {(
                      [
                        { mode: "dine_in", label: "Dine-in" },
                        { mode: "takeaway", label: "Takeaway" },
                        { mode: "delivery", label: "Delivery" },
                      ] as const
                    ).map((opt) => {
                      const active = serviceMode.value === opt.mode;
                      return (
                        <button
                          key={opt.mode}
                          type="button"
                          disabled={payStep.value || processing.value}
                          onClick$={() => {
                            serviceMode.value = opt.mode;
                          }}
                          style={{
                            padding: "0.2rem 0.55rem",
                            fontSize: "0.72rem",
                            fontWeight: active ? "600" : "500",
                            borderRadius: "0.25rem",
                            border: "none",
                            cursor: payStep.value || processing.value ? "not-allowed" : "pointer",
                            background: active ? "var(--surface-1)" : "transparent",
                            color: active ? "var(--text-primary)" : "var(--text-secondary)",
                            boxShadow: active ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
                            transition: "all 120ms ease",
                          }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div class="bill-cart-scroll-area">
                {bill.value.length === 0 ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      height: "100%",
                      fontSize: "0.8125rem",
                      color: "var(--text-secondary)",
                      padding: "1rem",
                      textAlign: "center",
                      gap: "0.5rem",
                      flexDirection: "column",
                    }}
                  >
                    {isEditMode.value && loading.value ? (
                      <>
                        <LuLoader style="width:1.25rem;height:1.25rem;animation:spin 1s linear infinite;" stroke-width="1" />
                        Loading items…
                      </>
                    ) : (
                      "Tap a product to add"
                    )}
                  </div>
                ) : (
                  bill.value.map((line, idx) => (
                    <div
                      key={`${line.item.id}-${line.batch?.id || "nobatch"}-${idx}`}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.25rem",
                        padding: "0.45rem 0.75rem",
                        borderBottom: "1px solid var(--border)",
                        flexShrink: 0,
                        background: line.qty === 0 ? "rgba(239,68,68,0.03)" : undefined,
                        opacity: line.qty === 0 ? 0.75 : 1,
                      }}
                    >
                      {/* Top row: Name on left, Qty +|- and Price and Delete/Restore on right */}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.5rem" }}>
                        <div
                          style={{
                            flex: 1,
                            fontSize: "0.8125rem",
                            fontWeight: "500",
                            color: line.qty === 0 ? "var(--text-secondary)" : "var(--text-primary)",
                            textDecoration: line.qty === 0 ? "line-through" : "none",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            minWidth: 0,
                          }}
                          title={line.item.name}
                        >
                          {line.item.name}
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                          {/* Qty controls */}
                          <div style={{ display: "flex", alignItems: "center", gap: "0.2rem" }}>
                            <button
                              type="button"
                              onClick$={$(() => changeQty(idx, -1))}
                              disabled={line.qty <= 0}
                              style={{
                                width: "1.375rem", height: "1.375rem",
                                borderRadius: "50%",
                                border: "1px solid var(--border)",
                                background: "var(--surface-3)",
                                color: "var(--text-primary)",
                                cursor: line.qty <= 0 ? "not-allowed" : "pointer",
                                opacity: line.qty <= 0 ? 0.35 : 1,
                                display: "flex", alignItems: "center", justifyContent: "center",
                              }}
                            >
                              <LuMinus style="width:0.55rem;height:0.55rem;" />
                            </button>
                            <span
                              style={{
                                minWidth: "1.25rem",
                                textAlign: "center",
                                fontSize: "0.8125rem",
                                fontWeight: "600",
                                color: line.qty === 0 ? "#ef4444" : "var(--text-primary)",
                                textDecoration: line.qty === 0 ? "line-through" : "none",
                              }}
                            >
                              {line.qty}
                            </span>
                            {(() => {
                              const isTracked = enforceStockLimit.value && (line.item.track_inventory === 1 || Boolean((line.item as any).track_inventory));
                              const maxStock = line.batch ? line.batch.qty_remaining : Math.max(stockMap.value[line.item.id] ?? 0, (line.item as any).stock_qty ?? 0);
                              const isAtMax = isTracked && line.qty >= maxStock;

                              return (
                                <button
                                  type="button"
                                  onClick$={$(() => changeQty(idx, 1))}
                                  disabled={isAtMax}
                                  title={isAtMax ? "Maximum available stock reached" : "Increase quantity"}
                                  style={{
                                    width: "1.375rem", height: "1.375rem",
                                    borderRadius: "50%",
                                    border: "1px solid var(--border)",
                                    background: "var(--surface-3)",
                                    color: "var(--text-primary)",
                                    cursor: isAtMax ? "not-allowed" : "pointer",
                                    opacity: isAtMax ? 0.35 : 1,
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                  }}
                                >
                                  <LuPlus style="width:0.55rem;height:0.55rem;" />
                                </button>
                              );
                            })()}
                          </div>

                          {/* Line total Amount */}
                          {(() => {
                            const lineSubtotal = line.item.price * line.qty;
                            const lineDiscPct = (line.discount_pct || 0) + (line.extra_discount || 0);
                            const lineDiscount = lineSubtotal * (lineDiscPct / 100);
                            return (
                              <div
                                style={{
                                  fontSize: "0.825rem",
                                  fontWeight: "600",
                                  color: line.qty === 0 ? "var(--text-secondary)" : "var(--text-primary)",
                                  textDecoration: line.qty === 0 ? "line-through" : "none",
                                  minWidth: "3.5rem",
                                  textAlign: "right",
                                  fontVariantNumeric: "tabular-nums",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {fmt(lineSubtotal - lineDiscount)}
                              </div>
                            );
                          })()}

                          {line.qty === 0 ? (
                            <button
                              type="button"
                              onClick$={$(() => removeLine(idx))}
                              title="Restore line item"
                              style={{
                                background: "rgba(59,130,246,0.1)",
                                border: "1px solid rgba(59,130,246,0.25)",
                                borderRadius: "0.25rem",
                                color: "#3b82f6",
                                cursor: "pointer",
                                padding: "0.15rem 0.35rem",
                                display: "flex",
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
                              title={isEditMode.value && editInvoice?.value?.status !== "draft" ? "Mark line as returned (0 qty)" : "Remove item"}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "var(--text-secondary)",
                                cursor: "pointer",
                                padding: "0.1rem",
                                display: "flex",
                                alignItems: "center",
                                opacity: 0.7,
                              }}
                            >
                              <LuTrash2 style="width:0.8125rem;height:0.8125rem;" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Bottom row: Badges row */}
                      {(() => {
                        const lineSubtotal = line.item.price * line.qty;
                        const lineDiscPct = (line.discount_pct || 0) + (line.extra_discount || 0);
                        const lineDiscount = lineSubtotal * (lineDiscPct / 100);
                        return (
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "0.35rem",
                              width: "100%",
                              marginTop: "0.2rem",
                            }}
                          >
                            {/* Badges container */}
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.35rem",
                                flexWrap: "wrap",
                                flex: 1,
                                minWidth: 0,
                              }}
                            >
                              {line.qty === 0 && (
                                <span style={{ fontSize: "0.6875rem", color: "#ef4444", fontWeight: "700", background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.25rem", padding: "0.08rem 0.35rem", whiteSpace: "nowrap", lineHeight: "1.2", flexShrink: 0 }}>
                                  RETURNED ({line.original_qty ?? 0} UNITS)
                                </span>
                              )}
                              {line.original_qty !== undefined && line.qty > 0 && line.qty < line.original_qty && (
                                <span style={{ fontSize: "0.6875rem", color: "#d97706", fontWeight: "600", background: "rgba(217,119,6,0.12)", border: "1px solid rgba(217,119,6,0.25)", borderRadius: "0.25rem", padding: "0.08rem 0.35rem", whiteSpace: "nowrap", lineHeight: "1.2", flexShrink: 0 }}>
                                  ORIG: {line.original_qty} (RET: {line.original_qty - line.qty})
                                </span>
                              )}
                              {line.batch ? (
                                <button
                                  type="button"
                                  onClick$={() => openBatchPickerForLine(idx)}
                                  title="Click to switch batch"
                                  style={{
                                    background: "rgba(59,130,246,0.12)",
                                    border: "1px solid rgba(59,130,246,0.25)",
                                    borderRadius: "0.25rem",
                                    color: "#3b82f6",
                                    fontSize: "0.6875rem",
                                    fontWeight: "600",
                                    padding: "0.08rem 0.35rem",
                                    cursor: "pointer",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.2rem",
                                    whiteSpace: "nowrap",
                                    lineHeight: "1.2",
                                    flexShrink: 0,
                                  }}
                                >
                                  <span>{line.batch.batch_no}</span>
                                  {line.batch.expiry_date && (
                                    <span style={{ opacity: 0.85 }}>
                                      ({new Date(line.batch.expiry_date * 1000).toLocaleDateString("en-IN", { month: "2-digit", year: "2-digit" })})
                                    </span>
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick$={() => openBatchPickerForLine(idx)}
                                  style={{
                                    background: "transparent",
                                    border: "1px dashed var(--border)",
                                    borderRadius: "0.25rem",
                                    color: "var(--text-secondary)",
                                    fontSize: "0.6875rem",
                                    padding: "0.08rem 0.35rem",
                                    cursor: "pointer",
                                    whiteSpace: "nowrap",
                                    lineHeight: "1.2",
                                    flexShrink: 0,
                                  }}
                                >
                                  + Batch
                                </button>
                              )}
                              {((line.discount_pct || 0) > 0 || (line.extra_discount || 0) > 0) && (
                                <span style={{ fontSize: "0.6875rem", color: "#10b981", fontWeight: "600", background: "rgba(16,185,129,0.1)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "0.25rem", padding: "0.08rem 0.35rem", whiteSpace: "nowrap", lineHeight: "1.2", flexShrink: 0 }}>
                                  Dis: {line.discount_pct}%{line.extra_discount > 0 ? ` + ${line.extra_discount}%` : ""}
                                </span>
                              )}
                              {/* Tax Slab Badge */}
                              {(() => {
                                const isTaxExempt = !taxConfig.value || ["none", "exempt"].includes((taxConfig.value?.regime || "").toLowerCase().trim());
                                if (isTaxExempt) return null;
                                const tInfo = calcItemTaxRate(line.item, taxRates.value, taxConfig.value);
                                if (tInfo.ratePct === 0 && (tInfo.isExempt || !line.item.tax_rate_id)) return null;
                                const isInclusive = taxConfig.value?.tax_mode === "global"
                                  ? (taxConfig.value?.tax_inclusive === 1)
                                  : (line.item.tax_inclusive === 1);
                                const badgeText = !tInfo.isExempt && isInclusive ? `${tInfo.label} (Incl)` : tInfo.label;
                                return (
                                  <span
                                    style={{
                                      fontSize: "0.6875rem",
                                      color: tInfo.isExempt ? "var(--text-secondary)" : "#0284c7",
                                      fontWeight: "600",
                                      background: tInfo.isExempt ? "var(--surface-3)" : "rgba(2,132,199,0.1)",
                                      border: `1px solid ${tInfo.isExempt ? "var(--border)" : "rgba(2,132,199,0.25)"}`,
                                      borderRadius: "0.25rem",
                                      padding: "0.08rem 0.35rem",
                                      whiteSpace: "nowrap",
                                      lineHeight: "1.2",
                                      flexShrink: 0,
                                    }}
                                    title={`Tax: ${tInfo.label}${isInclusive ? " (Tax Included in Price)" : " (Tax Added on Top)"}`}
                                  >
                                    {badgeText}
                                  </span>
                                );
                              })()}
                              {line.free_qty && line.free_qty > 0 ? (
                                <span style={{ fontSize: "0.6875rem", color: "#8b5cf6", fontWeight: "700", background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.25)", borderRadius: "0.25rem", padding: "0.08rem 0.35rem", whiteSpace: "nowrap", lineHeight: "1.2", flexShrink: 0 }}>
                                  +{line.free_qty} FREE
                                </span>
                              ) : null}
                            </div>

                            {/* Struck-through original price (0.725rem) on the right end below Amount */}
                            {lineDiscount > 0 && (
                              <span
                                style={{
                                  marginLeft: "auto",
                                  fontSize: "0.725rem",
                                  color: "var(--text-secondary)",
                                  textDecoration: "line-through",
                                  fontWeight: "500",
                                  fontVariantNumeric: "tabular-nums",
                                  paddingRight: "1.35rem",
                                  flexShrink: 0,
                                }}
                              >
                                {fmt(lineSubtotal)}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  ))
                )}
              </div>

              {/* Tax Mode & Inclusive Strip — outside & above total/subtotal box */}
              {taxConfig.value && taxConfig.value.regime !== "None" && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.35rem 0.875rem",
                    background: "var(--surface-1)",
                    borderTop: "1px solid var(--border)",
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", fontWeight: "500" }}>
                    Tax Mode
                  </span>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: "600",
                      padding: "0.1rem 0.45rem",
                      borderRadius: "1rem",
                      background: taxConfig.value.tax_mode === "global" ? "rgba(99,102,241,0.12)" : "var(--surface-3)",
                      color: taxConfig.value.tax_mode === "global" ? "var(--accent)" : "var(--text-primary)",
                      border: `1px solid ${taxConfig.value.tax_mode === "global" ? "rgba(99,102,241,0.25)" : "var(--border)"}`,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                    title={`Tax Mode: ${taxConfig.value.tax_mode === "global" ? "Global Flat Rate" : "Item-Level Slabs"} · ${cartTaxModeStatus.value === "inclusive" ? "Tax Inclusive (Prices include tax)" : cartTaxModeStatus.value === "exclusive" ? "Tax Exclusive (Tax added on top)" : "Mixed Pricing"}`}
                  >
                    {taxConfig.value.tax_mode === "global" ? (
                      <span>🌐 Global {taxConfig.value.global_tax_rate ? `${taxConfig.value.global_tax_rate}%` : ""}</span>
                    ) : (
                      <span>📦 Item Slabs</span>
                    )}
                    {cartTaxModeStatus.value === "inclusive" ? (
                      <span style={{ color: "#10b981", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "0.15rem" }}>
                        <span>·</span> Tax Inclusive
                      </span>
                    ) : cartTaxModeStatus.value === "mixed" ? (
                      <span style={{ color: "#f59e0b", fontWeight: "700", display: "inline-flex", alignItems: "center", gap: "0.15rem" }}>
                        <span>·</span> Mixed
                      </span>
                    ) : (
                      <span style={{ opacity: 0.75, fontSize: "0.625rem" }}>
                        <span>·</span> Excl
                      </span>
                    )}
                  </span>
                </div>
              )}

              {/* Bill step footer */}
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderTop: "1px solid var(--border)",
                  flexShrink: 0,
                  background: "var(--surface-2)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                  <span style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)" }}>Total</span>
                  <span style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(rawSubtotal.value)}
                  </span>
                </div>
                {totalDiscount.value > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.8125rem", color: "#10b981" }}>Total Discount</span>
                    <span style={{ fontSize: "0.9375rem", color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                      −{fmt(totalDiscount.value)}
                    </span>
                  </div>
                )}
                {totalDiscount.value > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)" }}>Total After Discount</span>
                    <span style={{ fontSize: "0.9375rem", fontWeight: "600", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                      {fmt(Math.max(0, rawSubtotal.value - totalDiscount.value))}
                    </span>
                  </div>
                )}
                {liveTaxDetails.value.totalTax > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.8125rem", color: "#0284c7", display: "inline-flex", alignItems: "center", gap: "0.35rem" }}>
                      <span>Tax ({taxConfig.value?.tax_mode === "global" ? `Global ${taxConfig.value?.global_tax_rate ? `${taxConfig.value.global_tax_rate}%` : ""}` : (taxConfig.value?.regime || "GST")})</span>
                      {cartTaxModeStatus.value === "inclusive" && (
                        <span style={{ fontSize: "0.675rem", fontWeight: "700", color: "#10b981", background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", borderRadius: "0.25rem", padding: "0.05rem 0.35rem" }}>
                          Tax Inclusive
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: "0.9375rem", color: "#0284c7", fontVariantNumeric: "tabular-nums", fontWeight: "600" }}>
                      {cartTaxModeStatus.value === "inclusive" ? `(Incl) ${fmt(liveTaxDetails.value.totalTax)}` : `+${fmt(liveTaxDetails.value.totalTax)}`}
                    </span>
                  </div>
                )}
                {appliedCreditAmt.value > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.3rem" }}>
                    <span style={{ fontSize: "0.8125rem", color: "#10b981" }}>Store Credit</span>
                    <span style={{ fontSize: "0.9375rem", color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                      −{fmt(appliedCreditAmt.value)}
                    </span>
                  </div>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: "0.4rem", marginBottom: "0.625rem" }}>
                  <span style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>Grand Total / Net</span>
                  <span style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(payableTotal.value)}
                  </span>
                </div>
                {
                  /* Non-draft edit: Update Invoice directly (no payment step) */
                  isEditMode.value && editInvoice?.value?.status !== "draft" ? (
                    <button
                      type="button"
                      disabled={bill.value.length === 0 || processing.value}
                      onClick$={handleConfirm}
                      style={{
                        width: "100%",
                        height: "2.625rem",
                        background: (bill.value.length === 0 || processing.value) ? "var(--muted)" : "var(--button-primary-bg)",
                        color: (bill.value.length === 0 || processing.value) ? "var(--text-secondary)" : "var(--button-primary-text)",
                        border: "none",
                        borderRadius: "0.375rem",
                        fontSize: "0.9375rem",
                        fontWeight: "600",
                        cursor: (bill.value.length === 0 || processing.value) ? "not-allowed" : "pointer",
                        transition: "background 150ms ease",
                      }}
                    >
                      {processing.value ? "Saving…" : "Update Invoice"}
                    </button>
                  ) : (
                    /* New bill OR draft edit: Charge button → goes to payment step */
                    <button
                      type="button"
                      disabled={bill.value.length === 0}
                      onClick$={$(() => { payStep.value = true; })}
                      style={{
                        width: "100%",
                        height: "2.625rem",
                        background: bill.value.length === 0 ? "var(--muted)" : "var(--button-primary-bg)",
                        color: bill.value.length === 0 ? "var(--text-secondary)" : "var(--button-primary-text)",
                        border: "none",
                        borderRadius: "0.375rem",
                        fontSize: "0.9375rem",
                        fontWeight: "600",
                        cursor: bill.value.length === 0 ? "not-allowed" : "pointer",
                        transition: "background 150ms ease",
                      }}
                    >
                      Charge {bill.value.length > 0 ? fmt(payableTotal.value) : ""}
                    </button>
                  )
                }
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════ STEP 2 — PAYMENT ════════════════════════ */}
        {payStep.value && (
          <div class="pos-charge-layout">

            {/* ── TOP SECTION: Back to bill, Customer, Discounts & Coupons ── */}
            <div class="pos-charge-top">

              {/* Back to bill & Customer unified bar */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", minWidth: 0, maxWidth: "100%", boxSizing: "border-box" as const }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick$={$(() => { payStep.value = false; })}
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.35rem",
                      background: "transparent",
                      border: "none",
                      color: "var(--text-secondary)",
                      fontSize: "0.875rem",
                      cursor: "pointer",
                      padding: "0.25rem 0",
                      fontWeight: "500",
                      whiteSpace: "nowrap",
                      flexShrink: 0,
                    }}
                  >
                    <LuChevronLeft style="width:1.1rem;height:1.1rem;flex-shrink:0;" />
                    <span class="back-btn-text-full">Back to bill</span>
                    <span class="back-btn-text-mobile">Back</span>
                  </button>

                  {isSplitMode.value && (
                    <button
                      type="button"
                      onClick$={cancelSplitMode}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "#60a5fa",
                        fontSize: "0.8125rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        padding: "0.2rem 0.5rem",
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      Cancel split
                    </button>
                  )}
                </div>

                {/* Customer section */}
                <div style={{ flex: 1, minWidth: 0, width: "100%", maxWidth: "100%" }}>
                  {pickedCustomer.value ? (
                    /* Picked from contacts — show card with open drawer & clear */
                    <div style={{ width: "100%", minWidth: 0, maxWidth: "100%" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", width: "100%", minWidth: 0 }}>
                        <div
                          onClick$={() => { showCustomerDetail.value = true; }}
                          style={{
                            flex: 1,
                            minWidth: 0,
                            padding: "0.45rem 0.75rem",
                            background: "var(--field-fill)",
                            border: "1px solid var(--border)",
                            borderRadius: "0.375rem",
                            fontSize: "0.875rem",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            overflow: "hidden",
                          }}
                        >
                          <div style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis" }}>
                            <div style={{ fontWeight: "600", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pickedCustomer.value.name}</div>
                            {pickedCustomer.value.phone && <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pickedCustomer.value.phone}</div>}
                            {pickedCustomer.value.email && <div style={{ fontSize: "0.72rem", color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pickedCustomer.value.email}</div>}
                          </div>
                          <LuChevronRight style={{ width: "1rem", height: "1rem", color: "var(--text-secondary)", flexShrink: 0 }} />
                        </div>
                        {!isCustomerLocked.value ? (
                          <button
                            type="button"
                            onClick$={() => { pickedCustomer.value = null; creditContext.value = null; showOutstanding.value = false; applyStoreCredit.value = false; selectedShippingAddress.value = null; }}
                            style={{ background: "transparent", border: "1px solid var(--border)", borderRadius: "0.375rem", width: "2.25rem", height: "2.25rem", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                            title="Remove customer"
                          >
                            ✕
                          </button>
                        ) : (
                          <div
                            style={{ background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", width: "2.25rem", height: "2.25rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, opacity: 0.85 }}
                            title="Customer is locked for this online order"
                          >
                            <LuLock style={{ width: "0.95rem", height: "0.95rem" }} />
                          </div>
                        )}
                      </div>

                      {/* Customer credit line & prior dues (shown if credit_limit > 0) */}
                      {creditContext.value && creditContext.value.credit_limit > 0 && (
                        <div style={{ marginTop: "0.5rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0.5rem 0.65rem", fontSize: "0.78rem" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Credit Limit:</span>
                            <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>{fmt(creditContext.value.credit_limit)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Prior Dues:</span>
                            <span style={{ fontWeight: "600", color: creditContext.value.credit_used > 0 ? "var(--error, #ef4444)" : "var(--text-secondary)" }}>{fmt(creditContext.value.credit_used)}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.2rem" }}>
                            <span style={{ color: "var(--text-secondary)" }}>Available Credit:</span>
                            <span style={{ fontWeight: "700", color: creditContext.value.available_credit > 0 ? "#10b981" : "var(--error, #ef4444)" }}>{fmt(creditContext.value.available_credit)}</span>
                          </div>

                          {(creditContext.value.is_over_limit || total.value > creditContext.value.available_credit) && (
                            <div style={{ marginTop: "0.35rem", padding: "0.25rem 0.5rem", background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)", borderRadius: "0.25rem", color: "#ef4444", fontSize: "0.72rem", fontWeight: "500" }}>
                              ⚠️ This sale ({fmt(total.value)}) exceeds available credit ({fmt(creditContext.value.available_credit)})
                            </div>
                          )}

                          {creditContext.value.outstanding_invoices.length > 0 && (
                            <div style={{ marginTop: "0.35rem", borderTop: "1px solid var(--border)", paddingTop: "0.35rem" }}>
                              <button
                                type="button"
                                onClick$={() => { showOutstanding.value = !showOutstanding.value; }}
                                style={{ background: "transparent", border: "none", color: "var(--text-secondary)", fontSize: "0.72rem", cursor: "pointer", padding: 0, textDecoration: "underline" }}
                              >
                                {showOutstanding.value ? "Hide prior unpaid invoices" : `View ${creditContext.value.outstanding_invoices.length} prior unpaid invoice(s)`}
                              </button>
                              {showOutstanding.value && (
                                <div style={{ marginTop: "0.35rem", display: "flex", flexDirection: "column", gap: "0.25rem", maxHeight: "100px", overflowY: "auto" }}>
                                  {creditContext.value.outstanding_invoices.map((inv) => (
                                    <div key={inv.document_id} style={{ display: "flex", justifyContent: "space-between", fontSize: "0.72rem", color: "var(--text-secondary)" }}>
                                      <span>{inv.doc_number}</span>
                                      <span style={{ color: "var(--error, #ef4444)", fontWeight: "600" }}>Due: {fmt(inv.amount_due)}</span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    /* Walk-in or search existing */
                    <div style={{ display: "flex", gap: "0.5rem", width: "100%", minWidth: 0, maxWidth: "100%", alignItems: "center" }}>
                      <input type="text" placeholder="Walk-in name"
                        value={customerName.value}
                        onInput$={(e) => { customerName.value = (e.target as HTMLInputElement).value; }}
                        style={{ flex: 1, minWidth: 0, width: "100%", height: "2.25rem", padding: "0 0.75rem", background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", color: "var(--text-primary)", fontSize: "0.875rem", outline: "none", boxSizing: "border-box" as const }} />
                      <button type="button" onClick$={() => { showCustPicker.value = true; }}
                        style={{ flexShrink: 0, background: "var(--field-fill)", border: "1px solid var(--border)", borderRadius: "0.375rem", padding: "0 0.65rem", height: "2.25rem", fontSize: "0.8125rem", color: "var(--text-secondary)", cursor: "pointer", whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: "0.25rem", boxSizing: "border-box" as const }}>
                        <LuPlus style={{ width: "0.75rem", height: "0.75rem", flexShrink: 0 }} />
                        <span class="add-cust-btn-text-full">Add customer</span>
                        <span class="add-cust-btn-text-mobile">Add</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Discounts & Saved Coupons */}
              <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.625rem", padding: "0.875rem" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.6rem" }}>
                  <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <LuTag style="width:0.95rem;height:0.95rem;color:var(--accent);" />
                    Discounts & Coupons
                  </div>
                  {savedDiscounts.value.filter(d => d.is_active === 1).length > 0 && (
                    <button
                      type="button"
                      onClick$={$(() => { showCouponDrawer.value = true; })}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--accent)",
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        cursor: "pointer",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        gap: "0.25rem",
                      }}
                    >
                      <LuSparkles style="width:0.85rem;height:0.85rem;" />
                      Saved discounts ({savedDiscounts.value.filter(d => d.is_active === 1).length})
                    </button>
                  )}
                </div>

                {/* If coupon is applied */}
                {appliedCoupon.value ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "0.5rem 0.75rem",
                      borderRadius: "0.375rem",
                      background: "rgba(16,185,129,0.1)",
                      border: "1px solid rgba(16,185,129,0.25)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <LuCheck style="width:1rem;height:1rem;color:#10b981;" />
                      <div>
                        <span style={{ fontWeight: "700", color: "#10b981", fontSize: "0.8125rem" }}>
                          {appliedCoupon.value.code}
                        </span>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "0.4rem" }}>
                          ({appliedCoupon.value.discount_type === "percent" ? `${appliedCoupon.value.value}% off` : `₹${appliedCoupon.value.value} flat off`})
                        </span>
                        <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "#10b981", marginLeft: "0.4rem" }}>
                          −{fmt(couponDiscountAmt.value)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick$={removeCoupon}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-secondary)",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        fontWeight: "600",
                        display: "flex",
                        alignItems: "center",
                        gap: "0.2rem",
                      }}
                    >
                      <LuX style="width:0.9rem;height:0.9rem;" /> Remove
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input
                        type="text"
                        placeholder="Enter coupon code (e.g. SAVE10)"
                        value={couponCodeInput.value}
                        onInput$={$((e: any) => { couponCodeInput.value = e.target.value.toUpperCase(); })}
                        onKeyDown$={$((e: any) => { if (e.key === "Enter") applyCouponByCode(couponCodeInput.value); })}
                        style={{
                          flex: 1,
                          height: "2.25rem",
                          padding: "0 0.65rem",
                          borderRadius: "0.375rem",
                          border: "1px solid var(--border)",
                          background: "var(--field-fill)",
                          color: "var(--text-primary)",
                          fontSize: "0.8125rem",
                          fontFamily: "monospace",
                        }}
                      />
                      <button
                        type="button"
                        disabled={couponValidating.value || !couponCodeInput.value.trim()}
                        onClick$={$(() => { applyCouponByCode(couponCodeInput.value); })}
                        style={{
                          height: "2.25rem",
                          padding: "0 0.875rem",
                          borderRadius: "0.375rem",
                          border: "none",
                          background: "var(--button-primary-bg)",
                          color: "var(--button-primary-text)",
                          fontSize: "0.8125rem",
                          fontWeight: "600",
                          cursor: couponCodeInput.value.trim() ? "pointer" : "not-allowed",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {couponValidating.value ? "Checking…" : "Apply"}
                      </button>
                    </div>

                    {couponError.value && (
                      <div style={{ fontSize: "0.75rem", color: "var(--error, #ef4444)", marginTop: "0.1rem" }}>
                        ⚠️ {couponError.value}
                      </div>
                    )}

                    {/* Manual % or flat discount toggle */}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "0.25rem" }}>
                      <button
                        type="button"
                        onClick$={$(() => { showManualDiscount.value = !showManualDiscount.value; })}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--text-secondary)",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          padding: 0,
                          textDecoration: "underline",
                        }}
                      >
                        {showManualDiscount.value ? "Hide custom discount" : "Or apply manual % / ₹ discount"}
                      </button>
                      {(billDiscountPct.value > 0 || billDiscountAmt.value > 0) && (
                        <span style={{ fontSize: "0.75rem", color: "#10b981", fontWeight: "600" }}>
                          Manual: −{fmt(billDiscount.value)}
                        </span>
                      )}
                    </div>

                    {showManualDiscount.value && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", paddingTop: "0.35rem", borderTop: "1px dashed var(--border)" }}>
                        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
                          <div style={{ display: "flex", background: "var(--surface-3)", borderRadius: "0.25rem", padding: "2px", border: "1px solid var(--border)" }}>
                            <button
                              type="button"
                              onClick$={$(() => { billDiscountMode.value = "pct"; })}
                              style={{
                                background: billDiscountMode.value === "pct" ? "var(--field-fill)" : "transparent",
                                color: billDiscountMode.value === "pct" ? "var(--accent)" : "var(--text-secondary)",
                                border: "none",
                                borderRadius: "0.2rem",
                                padding: "0.15rem 0.5rem",
                                fontSize: "0.75rem",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              % Pct
                            </button>
                            <button
                              type="button"
                              onClick$={$(() => { billDiscountMode.value = "flat"; })}
                              style={{
                                background: billDiscountMode.value === "flat" ? "var(--field-fill)" : "transparent",
                                color: billDiscountMode.value === "flat" ? "var(--accent)" : "var(--text-secondary)",
                                border: "none",
                                borderRadius: "0.2rem",
                                padding: "0.15rem 0.5rem",
                                fontSize: "0.75rem",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              ₹ Flat
                            </button>
                          </div>
                          <input
                            type="number"
                            min="0"
                            max={billDiscountMode.value === "pct" ? "100" : undefined}
                            value={billDiscountMode.value === "pct" ? (billDiscountPct.value || "") : (billDiscountAmt.value || "")}
                            onInput$={$((e: any) => {
                              const val = parseFloat(e.target.value) || 0;
                              if (billDiscountMode.value === "pct") {
                                billDiscountPct.value = Math.min(100, Math.max(0, val));
                              } else {
                                billDiscountAmt.value = Math.max(0, val);
                              }
                            })}
                            placeholder={billDiscountMode.value === "pct" ? "e.g. 10%" : "e.g. ₹100"}
                            style={{
                              flex: 1,
                              height: "2.125rem",
                              padding: "0 0.6rem",
                              borderRadius: "0.375rem",
                              border: "1px solid var(--border)",
                              background: "var(--field-fill)",
                              color: "var(--text-primary)",
                              fontSize: "0.8125rem",
                            }}
                          />
                          {(billDiscountPct.value > 0 || billDiscountAmt.value > 0) && (
                            <button
                              type="button"
                              onClick$={$(() => { billDiscountPct.value = 0; billDiscountAmt.value = 0; })}
                              style={{
                                height: "2.125rem",
                                padding: "0 0.5rem",
                                borderRadius: "0.375rem",
                                border: "1px solid var(--border)",
                                background: "transparent",
                                color: "var(--text-secondary)",
                                fontSize: "0.75rem",
                                cursor: "pointer",
                              }}
                            >
                              Clear
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Promotional Schemes highlight banner */}
              {totalFreeUnits.value > 0 && (
                <div
                  style={{
                    padding: "0.5rem 0.75rem",
                    borderRadius: "0.375rem",
                    background: "rgba(139,92,246,0.1)",
                    border: "1px solid rgba(139,92,246,0.25)",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    fontSize: "0.8125rem",
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

            </div>

            {/* ── RIGHT COLUMN (Desktop) / MIDDLE (Mobile): Checkout Summary Panel ── */}
            <div class="pos-checkout-panel">
              <div style={{ fontSize: "1.125rem", fontWeight: "700", color: "var(--text-primary)", flexShrink: 0 }}>
                Checkout
              </div>

              {/* Cart line items */}
              <div class="pos-checkout-items">
                {bill.value.map((line) => {
                  const lineSubtotal = line.item.price * line.qty;
                  const lineDiscPct = (line.discount_pct || 0) + (line.extra_discount || 0);
                  const lineNet = lineSubtotal * (1 - lineDiscPct / 100);
                  return (
                    <div key={line.item.id} style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                      <div
                        style={{
                          width: "2.75rem",
                          height: "2.75rem",
                          borderRadius: "0.5rem",
                          background: "var(--surface-3)",
                          border: "1px solid var(--border)",
                          overflow: "hidden",
                          flexShrink: 0,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {line.item.media_url ? (
                          <img src={line.item.media_url} alt={line.item.name} width={44} height={44} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <span style={{ fontSize: "1.25rem" }}>🛍️</span>
                        )}
                      </div>

                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          {line.item.name}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.1rem" }}>
                          <span>
                            {line.batch?.batch_no ? `Batch ${line.batch.batch_no}` : (line.item.pack_size || "Standard")}
                            {line.qty > 1 && ` • Qty ${line.qty}`}
                            {line.free_qty && line.free_qty > 0 ? ` (+${line.free_qty} free)` : ""}
                          </span>
                          {((line.discount_pct || 0) > 0 || (line.extra_discount || 0) > 0) && (
                            <span style={{ color: "#10b981", fontWeight: "600" }}>
                              Dis: {line.discount_pct || 0}%{line.extra_discount && line.extra_discount > 0 ? ` + ${line.extra_discount}%` : ""}
                            </span>
                          )}
                        </div>
                      </div>

                      <div style={{ textAlign: "right", flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.1rem" }}>
                        {lineDiscPct > 0 ? (
                          <>
                            <span style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                              {fmt(lineNet)}
                            </span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", textDecoration: "line-through", fontVariantNumeric: "tabular-nums" }}>
                              {fmt(lineSubtotal)}
                            </span>
                          </>
                        ) : (
                          <span style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                            {fmt(lineNet)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Bottom pinned section: Financial summary & Total / Balance Due */}
              <div class="pos-checkout-bottom">
                {/* Subtotal */}
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  <span>Subtotal</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-primary)", fontWeight: "500" }}>
                    {fmt(rawSubtotal.value)}
                  </span>
                </div>

                {/* Item discounts (if any) */}
                {itemDiscounts.value > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#10b981", fontSize: "0.875rem" }}>
                    <span>Item discounts</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "600" }}>
                      −{fmt(itemDiscounts.value)}
                    </span>
                  </div>
                )}

                {/* Applied Discount Code (Separate dedicated line) */}
                {appliedCoupon.value && couponDiscountAmt.value > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#10b981", fontSize: "0.875rem" }}>
                    <span>
                      Discount Code • {appliedCoupon.value.code} {appliedCoupon.value.discount_type === "percent" ? `${appliedCoupon.value.value}%` : `Flat ${fmt(appliedCoupon.value.value)}`}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "600" }}>
                      −{fmt(couponDiscountAmt.value)}
                    </span>
                  </div>
                )}

                {/* Manual Order Discount (if applied and no coupon) */}
                {!appliedCoupon.value && billDiscount.value > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#10b981", fontSize: "0.875rem" }}>
                    <span>
                      Order discount {billDiscountMode.value === "pct" && billDiscountPct.value > 0 ? `(${billDiscountPct.value}%)` : "(Flat)"}
                    </span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "600" }}>
                      −{fmt(billDiscount.value)}
                    </span>
                  </div>
                )}

                {/* Total after discount */}
                {totalDiscount.value > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    <span>Total after discount</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-primary)", fontWeight: "500" }}>
                      {fmt(Math.max(0, rawSubtotal.value - totalDiscount.value))}
                    </span>
                  </div>
                )}

                {/* Taxes */}
                <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  <span>Taxes</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", color: "var(--text-primary)", fontWeight: "500" }}>
                    {cartTaxModeStatus.value === "inclusive" ? `(Incl.) ${fmt(liveTaxDetails.value.totalTax)}` : fmt(liveTaxDetails.value.totalTax)}
                  </span>
                </div>

                {/* Store Credit */}
                {appliedCreditAmt.value > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#10b981", fontSize: "0.875rem" }}>
                    <span>Store Credit</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: "600" }}>
                      −{fmt(appliedCreditAmt.value)}
                    </span>
                  </div>
                )}

                {/* Split Payments Tendered (in Green #10b981) */}
                {isSplitMode.value && splitPayments.value.length > 0 && (
                  <>
                    <div style={{ height: "1px", background: "var(--border)", margin: "0.15rem 0" }} />
                    {splitPayments.value.map((sp) => (
                      <div key={sp.id} style={{ display: "flex", justifyContent: "space-between", color: "#10b981", fontWeight: "600", fontSize: "0.875rem" }}>
                        <span>{sp.label}</span>
                        <span style={{ fontVariantNumeric: "tabular-nums" }}>
                          {fmt(sp.amount)}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                <div style={{ height: "1px", background: "var(--border)", margin: "0.25rem 0" }} />

                {/* Large Total or Balance Due */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <span style={{ fontSize: "1.125rem", fontWeight: "700", color: "var(--text-primary)" }}>
                    {isSplitMode.value && splitPayments.value.length > 0 ? "Balance due" : "Total"}
                  </span>
                  <span style={{ fontSize: "1.75rem", fontWeight: "800", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(isSplitMode.value && splitPayments.value.length > 0 ? remainingBalanceDue.value : payableTotal.value)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── PAYMENT AREA & ACTION BUTTONS: Column 1, Row 2 (Desktop) / Order 3 (Mobile) ── */}
            <div class="pos-charge-pay">
              {!isSplitMode.value ? (
                /* ── Initial Payment Options ── */
                <div>
                  <div style={{ fontSize: "1.25rem", fontWeight: "700", color: "var(--text-primary)", marginBottom: "0.875rem" }}>
                    Payment options
                  </div>

                  <div class="pos-payment-grid">
                    {/* Primary Mode: Cash */}
                    <div
                      class={["pos-payment-card", payMode.value === "cash" ? "active" : ""].join(" ")}
                      onClick$={$(() => { payMode.value = "cash"; })}
                    >
                      <span style={{ fontSize: "1rem" }}>💵</span>
                      <span>Cash</span>
                    </div>

                    {/* Card */}
                    <div
                      class={["pos-payment-card", payMode.value === "card" ? "active" : ""].join(" ")}
                      onClick$={$(() => { payMode.value = "card"; })}
                    >
                      <span style={{ fontSize: "1rem" }}>💳</span>
                      <span>Card</span>
                    </div>

                    {/* UPI */}
                    <div
                      class={["pos-payment-card", payMode.value === "upi" ? "active" : ""].join(" ")}
                      onClick$={$(() => { payMode.value = "upi"; })}
                    >
                      <span style={{ fontSize: "1rem" }}>📱</span>
                      <span>UPI</span>
                    </div>

                    {/* Bank */}
                    <div
                      class={["pos-payment-card", payMode.value === "bank" ? "active" : ""].join(" ")}
                      onClick$={$(() => { payMode.value = "bank"; })}
                    >
                      <span style={{ fontSize: "1rem" }}>🏦</span>
                      <span>Bank</span>
                    </div>

                    {/* Split payment option */}
                    <div
                      class="pos-payment-card"
                      onClick$={$(() => {
                        isSplitMode.value = true;
                        splitTenderAmt.value = "";
                      })}
                    >
                      <span style={{ fontSize: "1rem" }}>⚡</span>
                      <span>Split payment</span>
                    </div>

                    {/* Mark unpaid option */}
                    <div
                      class={["pos-payment-card", payMode.value === "unpaid" ? "active" : ""].join(" ")}
                      onClick$={$(() => { payMode.value = "unpaid"; })}
                    >
                      <span style={{ fontSize: "1rem" }}>🕒</span>
                      <span>Mark unpaid</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* ── Split Payment Active ── */
                <div>
                  <div style={{ marginBottom: "1rem" }}>
                    <div style={{ fontSize: "1.375rem", fontWeight: "700", color: "var(--text-primary)" }}>
                      {splitPayments.value.length === 0 ? "First payment" : splitPayments.value.length === 1 ? "Second payment" : `${splitPayments.value.length + 1}th payment`}
                    </div>
                    <div style={{ fontSize: "0.9375rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                      Balance due: <strong style={{ color: "var(--text-primary)" }}>{fmt(remainingBalanceDue.value)}</strong>
                    </div>
                  </div>

                  {/* Tender amount input */}
                  <div style={{ marginBottom: "1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.875rem" }}>
                    <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", fontWeight: "600", marginBottom: "0.4rem" }}>
                      Amount for this payment
                    </label>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <input
                        type="number"
                        min="1"
                        max={remainingBalanceDue.value}
                        value={splitTenderAmt.value || remainingBalanceDue.value}
                        onInput$={$((e: any) => { splitTenderAmt.value = e.target.value; })}
                        placeholder={remainingBalanceDue.value.toString()}
                        style={{
                          flex: 1,
                          height: "2.5rem",
                          padding: "0 0.75rem",
                          borderRadius: "0.375rem",
                          border: "1.5px solid var(--accent)",
                          background: "var(--field-fill)",
                          color: "var(--text-primary)",
                          fontSize: "1.125rem",
                          fontWeight: "700",
                          fontVariantNumeric: "tabular-nums",
                        }}
                      />
                    </div>
                    {/* Quick tender suggestions */}
                    <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap", marginTop: "0.4rem" }}>
                      <button
                        type="button"
                        onClick$={$(() => { splitTenderAmt.value = remainingBalanceDue.value.toString(); })}
                        style={{
                          padding: "0.2rem 0.5rem",
                          borderRadius: "0.25rem",
                          border: "1px solid var(--border)",
                          background: "var(--surface-3)",
                          color: "var(--text-secondary)",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          cursor: "pointer",
                        }}
                      >
                        Full: {fmt(remainingBalanceDue.value)}
                      </button>
                      {[500, 1000, 2000, 5000].filter(n => n < remainingBalanceDue.value).map(amt => (
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
                            fontSize: "0.75rem",
                            cursor: "pointer",
                          }}
                        >
                          ₹{amt}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Payment modes & Mark as partially paid */}
                  <div class="pos-payment-grid">
                    <div
                      class="pos-payment-card"
                      onClick$={$(() => { addSplitPayment("cash"); })}
                    >
                      <span style={{ fontSize: "1rem" }}>💵</span>
                      <span>Cash</span>
                    </div>

                    <div
                      class="pos-payment-card"
                      onClick$={$(() => { addSplitPayment("card"); })}
                    >
                      <span style={{ fontSize: "1rem" }}>💳</span>
                      <span>Card</span>
                    </div>

                    <div
                      class="pos-payment-card"
                      onClick$={$(() => { addSplitPayment("upi"); })}
                    >
                      <span style={{ fontSize: "1rem" }}>📱</span>
                      <span>UPI</span>
                    </div>

                    <div
                      class="pos-payment-card"
                      onClick$={$(() => { addSplitPayment("bank"); })}
                    >
                      <span style={{ fontSize: "1rem" }}>🏦</span>
                      <span>Bank</span>
                    </div>

                    {/* Mark as partially paid button */}
                    {splitPayments.value.length > 0 && (
                      <div
                        class="pos-payment-card card-full"
                        onClick$={handleMarkPartiallyPaid}
                      >
                        <span style={{ fontSize: "1rem" }}>✓</span>
                        <span>Mark as partially paid</span>
                      </div>
                    )}
                  </div>

                  {/* Tendered payments so far */}
                  {splitPayments.value.length > 0 && (
                    <div style={{ marginTop: "1rem" }}>
                      <div style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
                        Recorded Split Payments ({splitPayments.value.length})
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                        {splitPayments.value.map((sp, idx) => (
                          <div
                            key={sp.id}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              padding: "0.5rem 0.75rem",
                              borderRadius: "0.375rem",
                              background: "var(--surface-2)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            <span style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)" }}>
                              {idx + 1}. {sp.label}
                            </span>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
                              <span style={{ fontSize: "0.875rem", fontWeight: "700", color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                                {fmt(sp.amount)}
                              </span>
                              <button
                                type="button"
                                onClick$={$(() => { removeSplitPayment(idx); })}
                                title="Remove tender"
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "var(--text-secondary)",
                                  cursor: "pointer",
                                  padding: "0.2rem",
                                  display: "flex",
                                  alignItems: "center",
                                }}
                              >
                                <LuX style="width:1rem;height:1rem;" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── Action Buttons Scoped Exclusively to Payment Column ────────── */}
              <div class="pos-charge-actions">
                {error.value && (
                  <div
                    style={{
                      fontSize: "0.8125rem",
                      color: "var(--error, #ef4444)",
                      padding: "0.35rem 0.6rem",
                      background: "rgba(239,68,68,0.1)",
                      borderRadius: "0.25rem",
                      border: "1px solid rgba(239,68,68,0.2)",
                    }}
                  >
                    {error.value}
                  </div>
                )}

                {isSplitMode.value ? (
                  /* ── Split Payment Mode Actions ── */
                  <div style={{ display: "flex", gap: "0.75rem" }}>
                    {remainingBalanceDue.value <= 0.005 ? (
                      /* Split is fully settled */
                      <button
                        type="button"
                        disabled={processing.value}
                        onClick$={handleConfirm}
                        style={{
                          flex: 1,
                          height: "2.75rem",
                          background: processing.value ? "var(--muted)" : "var(--button-primary-bg)",
                          color: processing.value ? "var(--text-secondary)" : "var(--button-primary-text)",
                          border: "none",
                          borderRadius: "0.375rem",
                          fontSize: "0.9375rem",
                          fontWeight: "600",
                          cursor: processing.value ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                        }}
                      >
                        {processing.value ? (
                          <>
                            <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                            Processing…
                          </>
                        ) : (
                          <>
                            <LuCheck style="width:1rem;height:1rem;" stroke-width="2" />
                            Complete Split Payment ({fmt(payableTotal.value)})
                          </>
                        )}
                      </button>
                    ) : splitPayments.value.length > 0 ? (
                      /* Partial payments tendered, residual balance due */
                      <button
                        type="button"
                        disabled={processing.value}
                        onClick$={handleMarkPartiallyPaid}
                        style={{
                          flex: 1,
                          height: "2.75rem",
                          background: processing.value ? "var(--muted)" : "#10b981",
                          color: processing.value ? "var(--text-secondary)" : "#fff",
                          border: "none",
                          borderRadius: "0.375rem",
                          fontSize: "0.9375rem",
                          fontWeight: "600",
                          cursor: processing.value ? "not-allowed" : "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                        }}
                      >
                        {processing.value ? (
                          <>
                            <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                            Saving…
                          </>
                        ) : (
                          <>
                            <LuCheck style="width:1rem;height:1rem;" stroke-width="2" />
                            Mark as Partially Paid ({fmt(totalSplitTendered.value)} Paid)
                          </>
                        )}
                      </button>
                    ) : (
                      /* No tender entered yet */
                      <button
                        type="button"
                        disabled={true}
                        style={{
                          flex: 1,
                          height: "2.75rem",
                          background: "var(--muted)",
                          color: "var(--text-secondary)",
                          border: "none",
                          borderRadius: "0.375rem",
                          fontSize: "0.9375rem",
                          fontWeight: "600",
                          cursor: "not-allowed",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.5rem",
                        }}
                      >
                        Select mode above to tender
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={processing.value}
                      onClick$={cancelSplitMode}
                      style={{
                        height: "2.75rem",
                        padding: "0 1.25rem",
                        background: "transparent",
                        color: "var(--text-secondary)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.375rem",
                        fontSize: "0.875rem",
                        fontWeight: "500",
                        cursor: processing.value ? "not-allowed" : "pointer",
                        opacity: processing.value ? 0.6 : 1,
                        whiteSpace: "nowrap",
                      }}
                    >
                      Cancel Split
                    </button>
                  </div>
                ) : (
                  /* ── Regular Single Payment Mode Actions ── */
                  <>
                    <button
                      type="button"
                      disabled={processing.value || (isEditMode.value ? bill.value.length === 0 : payableTotal.value <= 0 && appliedCreditAmt.value <= 0)}
                      onClick$={payMode.value === "unpaid" ? handleMarkUnpaid : handleConfirm}
                      style={{
                        width: "100%",
                        height: "2.75rem",
                        background: (processing.value || (isEditMode.value ? bill.value.length === 0 : payableTotal.value <= 0 && appliedCreditAmt.value <= 0)) ? "var(--muted)" : "var(--button-primary-bg)",
                        color: (processing.value || (isEditMode.value ? bill.value.length === 0 : payableTotal.value <= 0 && appliedCreditAmt.value <= 0)) ? "var(--text-secondary)" : "var(--button-primary-text)",
                        border: "none",
                        borderRadius: "0.375rem",
                        fontSize: "0.9375rem",
                        fontWeight: "600",
                        cursor: (processing.value || (isEditMode.value ? bill.value.length === 0 : payableTotal.value <= 0 && appliedCreditAmt.value <= 0)) ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.5rem",
                      }}
                    >
                      {processing.value ? (
                        <>
                          <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                          Processing…
                        </>
                      ) : payMode.value === "unpaid" ? (
                        <>
                          <LuCheck style="width:1rem;height:1rem;" stroke-width="2" />
                          Mark Unpaid
                        </>
                      ) : isEditMode.value ? (
                        <>
                          <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                          {editInvoice?.value?.status === "draft"
                            ? `Confirm ${payMode.value.toUpperCase()} • ${fmt(payableTotal.value)}`
                            : "Update Invoice"}
                        </>
                      ) : (
                        <>
                          <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                          Confirm {payMode.value.toUpperCase()} • {fmt(payableTotal.value)}
                        </>
                      )}
                    </button>

                    {/* Save as Draft / Update as Draft */}
                    {(!isEditMode.value || editInvoice?.value?.status === "draft") && (
                      <button
                        type="button"
                        disabled={processing.value}
                        onClick$={handleSaveDraft}
                        style={{
                          width: "100%",
                          height: "2.25rem",
                          background: "transparent",
                          color: "var(--text-secondary)",
                          border: "1px solid var(--border)",
                          borderRadius: "0.375rem",
                          fontSize: "0.875rem",
                          fontWeight: "500",
                          cursor: processing.value ? "not-allowed" : "pointer",
                          opacity: processing.value ? 0.6 : 1,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.4rem",
                        }}
                      >
                        {processing.value ? (
                          <>
                            <LuLoader style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" stroke-width="1" />
                            Saving…
                          </>
                        ) : (
                          isEditMode.value && editInvoice?.value?.status === "draft"
                            ? "Update as Draft"
                            : "Save as Draft"
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>

            </div>

          </div>
        )}
      </SlideOver>

      {/* Saved Store Discount Codes SlideOver */}
      <SlideOver
        open={showCouponDrawer}
        title="Saved Store Discounts"
        subtitle="Active coupons managed under Settings > Discounts"
        width="420px"
        onClose$={$(() => { showCouponDrawer.value = false; })}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {savedDiscounts.value.filter(c => c.is_active === 1).length === 0 ? (
            <div style={{ textAlign: "center", padding: "2.5rem 1rem", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
              No active discount codes found in store settings.
            </div>
          ) : (
            savedDiscounts.value.filter(c => c.is_active === 1).map((c) => {
              const meetsMin = postItemSubtotal.value >= c.min_order_value;
              const isCurrentlyApplied = appliedCoupon.value?.code === c.code;
              return (
                <div
                  key={c.id}
                  style={{
                    padding: "0.875rem",
                    borderRadius: "0.5rem",
                    background: isCurrentlyApplied ? "rgba(16,185,129,0.08)" : "var(--surface-2)",
                    border: `1.5px solid ${isCurrentlyApplied ? "#10b981" : "var(--border)"}`,
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ fontFamily: "monospace", fontWeight: "700", fontSize: "0.9375rem", color: "var(--text-primary)" }}>
                        {c.code}
                      </span>
                      <span
                        style={{
                          padding: "0.1rem 0.4rem",
                          borderRadius: "0.25rem",
                          fontSize: "0.72rem",
                          fontWeight: "700",
                          background: "rgba(59,130,246,0.12)",
                          color: "#3b82f6",
                        }}
                      >
                        {c.discount_type === "percent" ? `${c.value}% OFF` : `₹${c.value} FLAT`}
                      </span>
                    </div>
                    {isCurrentlyApplied ? (
                      <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "#10b981" }}>
                        ✓ Applied
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={!meetsMin}
                        onClick$={$(() => { applyCouponByCode(c.code); })}
                        style={{
                          padding: "0.25rem 0.75rem",
                          borderRadius: "0.375rem",
                          border: "none",
                          background: meetsMin ? "var(--button-primary-bg)" : "var(--muted)",
                          color: meetsMin ? "var(--button-primary-text)" : "var(--text-secondary)",
                          fontSize: "0.75rem",
                          fontWeight: "600",
                          cursor: meetsMin ? "pointer" : "not-allowed",
                        }}
                      >
                        Apply
                      </button>
                    )}
                  </div>

                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                    {c.min_order_value > 0 && (
                      <span style={{ color: meetsMin ? "var(--text-secondary)" : "#ef4444" }}>
                        • Min. order value: {fmt(c.min_order_value)} {!meetsMin && `(Cart: ${fmt(postItemSubtotal.value)})`}
                      </span>
                    )}
                    {c.max_discount && c.max_discount > 0 && (
                      <span>• Max discount cap: {fmt(c.max_discount)}</span>
                    )}
                    {c.valid_until && (
                      <span>• Valid until: {new Date(c.valid_until * 1000).toLocaleDateString("en-IN")}</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SlideOver>

      {/* Customer picker — instant open from Step 1 (cart tab) or Step 2 (charge tab) */}
      <CustomerLookupSlideOver
        open={showCustPicker}
        customers={customers}
        zIndex={500}
        onPicked$={$((c: CustomerBasic) => {
          pickedCustomer.value = c;
          invoke<CustomerBillingContext>("shop_get_customer_billing_context", { customerId: c.id })
            .then((ctx) => { creditContext.value = ctx; })
            .catch(() => { creditContext.value = null; });
        })}
        onCreated$={$((c: CustomerBasic) => { customers.value = [c, ...customers.value]; })}
      />

      {/* Customer detail & management slide-over */}
      <CustomerDetailSlideOver
        open={showCustomerDetail}
        customer={pickedCustomer}
        zIndex={500}
        disableRemoveFromCart={isCustomerLocked.value}
        onRemoveFromCart$={$(() => {
          if (isCustomerLocked.value) return;
          pickedCustomer.value = null;
          creditContext.value = null;
          showOutstanding.value = false;
          applyStoreCredit.value = false;
          selectedShippingAddress.value = null;
        })}
        onCustomerUpdated$={$((updated: CustomerBasic) => {
          pickedCustomer.value = updated;
          if (creditContext.value) {
            creditContext.value = {
              ...creditContext.value,
              customer_name: updated.name,
              email: updated.email,
              phone: updated.phone,
              store_credit: updated.store_credit ?? creditContext.value.store_credit,
              collect_taxes: updated.collect_taxes ?? creditContext.value.collect_taxes,
              accepts_email_marketing: updated.accepts_email_marketing ?? creditContext.value.accepts_email_marketing,
              accepts_sms_marketing: updated.accepts_sms_marketing ?? creditContext.value.accepts_sms_marketing,
              notes: updated.notes ?? creditContext.value.notes,
              tags: updated.tags ?? creditContext.value.tags,
              addresses: updated.addresses ?? creditContext.value.addresses,
            };
          }
        })}
        onSelectShippingAddress$={$((addr: CustomerAddress) => {
          selectedShippingAddress.value = addr;
          showCustomerDetail.value = false;
        })}
      />

      {/* Batch selection popover / dialog */}
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
            zIndex: 600,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
          onClick$={() => {
            batchPickerOpen.value = false;
            batchPickerItem.value = null;
            batchPickerTargetLineIndex.value = null;
          }}
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
            onClick$={(e) => e.stopPropagation()}
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
                onClick$={() => {
                  batchPickerOpen.value = false;
                  batchPickerItem.value = null;
                  batchPickerTargetLineIndex.value = null;
                }}
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
                batchPickerList.value.map((batch) => {
                  const expStr = batch.expiry_date
                    ? new Date(batch.expiry_date * 1000).toLocaleDateString("en-IN", { month: "short", year: "numeric" })
                    : "No Expiry";
                  const isTracked = batchPickerItem.value ? (batchPickerItem.value.track_inventory === 1 || Boolean((batchPickerItem.value as any).track_inventory)) : false;
                  const batchInCart = bill.value.filter(l => l.item.id === (batchPickerItem.value?.id) && l.batch?.id === batch.id).reduce((sum, l) => sum + l.qty, 0);
                  const batchRemaining = Math.max(0, batch.qty_remaining - batchInCart);
                  const isBatchOut = enforceStockLimit.value && isTracked && (batch.qty_remaining <= 0 || batchRemaining <= 0);
                  const isSelected = batchPickerTargetLineIndex.value !== null && bill.value[batchPickerTargetLineIndex.value]?.batch?.id === batch.id;
                  return (
                    <div
                      key={batch.id}
                      onClick$={$(() => {
                        if (isBatchOut) return;
                        selectBatchForBill(batch);
                      })}
                      style={{
                        padding: "0.75rem",
                        background: isSelected ? "rgba(59,130,246,0.1)" : "var(--surface-2)",
                        border: `1px solid ${isSelected ? "var(--accent, #3b82f6)" : "var(--border)"}`,
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

      <AddProductModal
        open={showAddProductModal}
        editingItem={editingProduct}
        categories={categories}
        collections={collections}
        units={units}
        defaultCategoryId={filterCategoryId || "cat_6"}
        onSaved$={handleProductSaved}
      />
    </>
  );
});

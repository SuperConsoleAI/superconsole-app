// src/routes/dashboard/shop/products/layout.tsx
//
// Global Context Provider for the Shop / Products module.
// Pre-fetches items, categories, units, collections, stock positions, warehouses,
// low stock alerts, invoices, and analytics at layout level.
// Prevents skeleton flicker and loading delays when navigating between Products tabs
// (Products, Inventory, Billing, Reorder, Analytics).

import {
  component$,
  Slot,
  useContextProvider,
  createContextId,
  useStore,
  useVisibleTask$,
  $,
  QRL,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import type { ShopItem } from "~/components/shop/ShopProductTable";
import type { ShopCategory, ShopUnit, ShopCollection } from "~/components/shop/AddProductModal";
import type { CustomerBasic } from "~/components/shop/CustomerLookupSlideOver";

export interface StockPosition {
  item_id:        string;
  item_name:      string;
  sku:            string | null;
  warehouse_id:   string;
  warehouse_name: string;
  qty_on_hand:    number;
  reorder_min:    number | null;
  is_low:         boolean;
}

export interface LedgerEntry {
  id:             string;
  item_id:        string;
  item_name:      string;
  sku:            string | null;
  warehouse_id:   string;
  warehouse_name: string;
  movement_type:  string;
  qty_in:         number;
  qty_out:        number;
  unit_cost:      number;
  total_cost:     number;
  balance_after:  number;
  notes:          string | null;
  document_id:    string | null;
  created_at:     number;
}

export interface LowStockItem {
  item_id:        string;
  item_name:      string;
  sku:            string | null;
  warehouse_id:   string;
  warehouse_name: string;
  qty_on_hand:    number;
  min_qty:        number;
  reorder_qty:    number;
}

export interface Warehouse {
  id:         string;
  name:       string;
  is_default: number;
}

export interface InvoiceBasic {
  id:           string;
  user_id?:     string | null;
  updated_by?:  string | null;
  creator_name?: string | null;
  updater_name?: string | null;
  doc_number:   string;
  doc_date:     number;
  status:       string;
  channel?:     string;
  subtotal:     number;
  discount_amt: number;
  tax_amount:   number;
  grand_total:  number;
  amount_paid:  number;
  amount_due:   number;
  profit?:      number | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  payment_mode?:  string | null;
  staff_id?:     string | null;
  staff_name?:   string | null;
  created_at?:  number;
  updated_at?:  number;
  is_modified?: boolean | null;
  modified_at?: number | null;
  modified_by?: string | null;
}

export interface ProductsCtxState {
  items:           ShopItem[];
  categories:      ShopCategory[];
  collections:     ShopCollection[];
  units:           ShopUnit[];
  positions:       StockPosition[];
  ledger:          LedgerEntry[];
  lowStockItems:   LowStockItem[];
  warehouses:      Warehouse[];
  invoices:        InvoiceBasic[];
  salesOrders:     InvoiceBasic[];
  customers:       CustomerBasic[];
  todayProfit:     number | null;
  loading:         boolean;
  error:           string;
  loadData:        QRL<() => Promise<void>>;
  refresh:         QRL<() => Promise<void>>;
}

export const ProductsCtx = createContextId<ProductsCtxState>("products_ctx");

export default component$(() => {
  const state = useStore<ProductsCtxState>({
    items:           [],
    categories:      [],
    collections:     [],
    units:           [],
    positions:       [],
    ledger:          [],
    lowStockItems:   [],
    warehouses:      [],
    invoices:        [],
    salesOrders:     [],
    customers:       [],
    todayProfit:     null,
    loading:         true,
    error:           "",
    loadData:        $(async () => {}),
    refresh:         $(async () => {}),
  });

  const fetchData = $(async () => {
    try {
      // Step 1: Fetch primary catalog, inventory positions, warehouses, and invoices
      const [itemsRes, catsRes, unitsRes, colsRes, posRes, whsRes, invsRes, ordersRes, profitRes] = await Promise.all([
        invoke<ShopItem[]>("shop_list_items", { includeArchived: true }).catch(() => []),
        invoke<ShopCategory[]>("shop_list_categories", {}).catch(() => []),
        invoke<ShopUnit[]>("shop_list_units", {}).catch(() => []),
        invoke<ShopCollection[]>("shop_list_collections", {}).catch(() => []),
        invoke<StockPosition[]>("shop_get_stock_position", {}).catch(() => []),
        invoke<Warehouse[]>("shop_list_warehouses", {}).catch(() => []),
        invoke<InvoiceBasic[]>("shop_list_invoices", { limit: 30, offset: 0 }).catch(() => []),
        invoke<InvoiceBasic[]>("shop_list_sales_orders", { limit: 30, offset: 0 }).catch(() => []),
        invoke<number>("shop_today_profit", {}).catch(() => null),
      ]);

      state.items       = Array.isArray(itemsRes) ? itemsRes : [];
      state.categories  = Array.isArray(catsRes) ? catsRes : [];
      state.units       = Array.isArray(unitsRes) ? unitsRes : [];
      state.collections = Array.isArray(colsRes) ? colsRes : [];
      state.positions   = Array.isArray(posRes) ? posRes : [];
      state.warehouses  = Array.isArray(whsRes) ? whsRes : [];
      state.invoices    = Array.isArray(invsRes) ? invsRes : [];
      state.salesOrders = Array.isArray(ordersRes) ? ordersRes : [];
      state.todayProfit = profitRes;
      state.loading     = false;

      // Step 2: Fetch secondary background data (ledger, low stock items, customers) non-blockingly
      Promise.all([
        invoke<LedgerEntry[]>("shop_get_stock_ledger", { limit: 80, offset: 0 }).catch(() => []),
        invoke<LowStockItem[]>("shop_get_low_stock_items", {}).catch(() => []),
        invoke<CustomerBasic[]>("shop_list_customers", {}).catch(() => []),
      ]).then(([ledRes, lowRes, custRes]) => {
        state.ledger        = Array.isArray(ledRes) ? ledRes : [];
        state.lowStockItems = Array.isArray(lowRes) ? lowRes : [];
        state.customers     = Array.isArray(custRes) ? custRes : [];
      });
    } catch (e: any) {
      console.error("[ProductsContext] load failed:", e);
      state.error = e?.message || "Failed to load products data";
      state.loading = false;
    }
  });

  const refreshData = $(async () => {
    try {
      await fetchData();
    } catch (e: any) {
      console.error("[ProductsContext] sync failed:", e);
    }
  });

  state.loadData = fetchData;
  state.refresh = refreshData;

  useContextProvider(ProductsCtx, state);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData();
  });

  return <Slot />;
});

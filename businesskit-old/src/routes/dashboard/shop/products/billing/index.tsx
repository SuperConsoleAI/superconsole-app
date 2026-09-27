import {
  component$, useSignal, useContext, useVisibleTask$, useStylesScoped$, $,
} from "@builder.io/qwik";
import { useNavigate, useLocation, type DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuPlus, LuCheckCircle2, LuBarChart2, LuPrinter, LuChevronDown, LuFileText, LuSlidersHorizontal, LuRefreshCw, LuDollarSign } from "@qwikest/icons/lucide";
import { NewBillModal, type BilledResult, type PrefillBillLine } from "~/components/shop/NewBillModal";
import { CustomNewBill } from "~/components/shop/CustomNewBill";
import { ShiftRegisterModal } from "~/components/shop/ShiftRegisterModal";
import type { CustomerBasic } from "~/components/shop/CustomerLookupSlideOver";
import { InvoiceDetailSlideOver, type InvoiceBasic, type InvoiceDetail } from "~/components/shop/InvoiceDetailSlideOver";
import { BillingTable } from "~/components/shop/BillingTable";
import { InvoicePrintModal, openWhatsAppInvoice } from "~/components/shop/InvoicePrintModal";
import { OnlineOrderReviewSlideOver } from "~/components/shop/OnlineOrderReviewSlideOver";
import { ShopStaffSelector } from "~/components/shop/ShopStaffSelector";
import { fmtMoney } from "~/lib/fin-format";
import { ProductsCtx } from "../layout";

const PAGE = 30;

interface Invoice extends InvoiceBasic {
  channel?: string;
  customer_phone?: string | null;
  customer_email?: string | null;
}

const STYLES = `
  .pb-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 1.5rem;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .pb-actions {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .pb-actions-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .pb-action-col {
    display: flex;
    align-items: center;
  }
  .pb-action-col > * {
    width: 100%;
  }
  .pb-btn {
    height: 2.25rem;
    padding: 0 1rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    box-sizing: border-box;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .pb-btn-secondary {
    background: var(--surface-2);
    color: var(--text-secondary);
    border: 1px solid var(--border);
  }
  .pb-btn-secondary:hover {
    background: var(--surface-3);
  }
  .pb-btn-primary {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    border: 1px solid var(--border);
  }
  .pb-btn-primary:hover {
    opacity: 0.92;
    border-color: var(--border-hover, var(--border));
  }
  .pb-toggle-container {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    height: 32px;
    box-sizing: border-box;
  }
  .pb-tab-btn {
    padding: 0 0.875rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    height: 100%;
    box-sizing: border-box;
    transition: background 0.15s, color 0.15s, box-shadow 0.15s;
    white-space: nowrap;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
  }
  .pb-tab-btn:hover {
    color: var(--text-primary);
  }
  .pb-tab-btn.active {
    background: var(--surface-2);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .billing-table-row {
    border-bottom: 1px solid var(--border);
  }
  .billing-table-row:hover {
    background: var(--surface-2);
  }
  .billing-table-header th {
    padding: 0.625rem 0.875rem;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    text-align: left;
    white-space: nowrap;
    user-select: none;
    background: var(--surface-3);
  }
  @keyframes pb-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  .pb-refresh-btn {
    height: 32px;
    width: 32px;
    padding: 0;
    border-radius: 0.5rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
    box-sizing: border-box;
  }
  .pb-refresh-btn:hover:not(:disabled) {
    background: var(--surface-3);
    color: var(--text-primary);
    border-color: var(--border-hover, var(--border));
  }
  .pb-refresh-btn:disabled {
    opacity: 0.65;
    cursor: wait;
  }
  .pb-refresh-spinning {
    animation: pb-spin 0.75s linear infinite;
  }
  @media (max-width: 640px) {
    .pb-header {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .pb-actions {
      display: flex;
      flex-direction: column;
      gap: 0.375rem;
      width: 100%;
    }
    .pb-actions-row {
      display: flex;
      width: 100%;
      gap: 0.375rem;
      align-items: center;
    }
    .pb-action-col {
      flex: 1 1 0;
      min-width: 0;
      width: 100%;
      display: flex;
    }
    .pb-btn {
      width: 100%;
      min-width: 0;
      padding: 0 0.35rem;
      font-size: 0.75rem;
      gap: 0.25rem;
      box-sizing: border-box;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      display: inline-flex;
      align-items: center;
      justify-content: center;
    }
    .pb-btn svg {
      flex-shrink: 0;
      width: 0.875rem !important;
      height: 0.875rem !important;
    }
    .pb-btn span,
    .pb-btn select {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      min-width: 0;
    }
  }
`;

export default component$(() => {
  useStylesScoped$(STYLES);

  const store = useContext(ProductsCtx);
  const nav = useNavigate();
  const loc = useLocation();
  const isRefreshing = useSignal(false);
  const showBillModal = useSignal(false);
  const showCustomBillModal = useSignal(false);
  const editInvoiceForModal = useSignal<InvoiceDetail | null>(null);
  const prefillLinesForModal = useSignal<PrefillBillLine[]>([]);
  const prefillCustomerNameForModal = useSignal<string>("");
  const prefillCustomerIdForModal = useSignal<string | null>(null);
  const prefillCustomerForModal = useSignal<CustomerBasic | null>(null);
  const salesOrderIdForModal = useSignal<string | null>(null);
  const activeStaffId = useSignal<string | null>(null);

  const activeTab = useSignal<"invoices" | "orders">(
    loc.url.searchParams.get("tab") === "orders" ? "orders" : "invoices"
  );
  const salesOrders = useSignal<Invoice[]>((store.salesOrders || []) as Invoice[]);
  const ordersLoading = useSignal(store.loading && (!store.salesOrders || store.salesOrders.length === 0));
  const hasMoreOrders = useSignal((store.salesOrders || []).length >= PAGE);
  const loadingMoreOrders = useSignal(false);
  const pickedOrderId = useSignal<string | null>(null);
  const showOrderReview = useSignal(false);

  const invoices = useSignal<Invoice[]>(store.invoices as Invoice[]);
  const allCustomers = useSignal<CustomerBasic[]>(store.customers);
  const loading = useSignal(store.loading && store.invoices.length === 0);
  const hasMore = useSignal(store.invoices.length >= PAGE);
  const loadingMore = useSignal(false);
  const todayProfit = useSignal<number | null>(store.todayProfit);
  const tableDensity = useSignal<"relaxed" | "compact">(
    typeof localStorage !== "undefined" && localStorage.getItem("bk-billing-density") === "relaxed" ? "relaxed" : "compact"
  );

  const loadSalesOrders = $(async (force = false) => {
    if (!force && salesOrders.value.length > 0) return;
    ordersLoading.value = true;
    try {
      const orders = await invoke<Invoice[]>("shop_list_sales_orders", {
        statusFilter: null,
        limit: PAGE,
        offset: 0,
      });
      salesOrders.value = orders || [];
      store.salesOrders = salesOrders.value;
      hasMoreOrders.value = (orders || []).length === PAGE;
    } catch (err) {
      console.warn("[Billing] Failed to load sales orders:", err);
    } finally {
      ordersLoading.value = false;
    }
  });

  const loadMoreOrders = $(async () => {
    loadingMoreOrders.value = true;
    try {
      const more = await invoke<Invoice[]>("shop_list_sales_orders", {
        statusFilter: null,
        limit: PAGE,
        offset: salesOrders.value.length,
      });
      salesOrders.value = [...salesOrders.value, ...more];
      store.salesOrders = salesOrders.value;
      hasMoreOrders.value = more.length === PAGE;
    } catch (e) {
      console.error("[product/billing] loadMoreOrders:", e);
    } finally {
      loadingMoreOrders.value = false;
    }
  });

  const handleRefreshData = $(async () => {
    if (isRefreshing.value) return;
    isRefreshing.value = true;
    try {
      const [freshOrders, freshInvs, freshCusts, profit, freshShift] = await Promise.all([
        invoke<Invoice[]>("shop_list_sales_orders", {
          statusFilter: null,
          limit: PAGE,
          offset: 0,
        }).catch(err => {
          console.warn("[Billing] refresh orders failed:", err);
          return [] as Invoice[];
        }),
        invoke<Invoice[]>("shop_list_invoices", { limit: PAGE, offset: 0 }).catch(err => {
          console.warn("[Billing] refresh invoices failed:", err);
          return [] as Invoice[];
        }),
        invoke<CustomerBasic[]>("shop_list_customers", {}).catch(() => [] as CustomerBasic[]),
        invoke<number>("shop_today_profit", {}).catch(() => null),
        invoke<any | null>("shop_get_active_shift", {}).catch(() => null),
      ]);

      activeShift.value = freshShift;
      salesOrders.value = freshOrders;
      store.salesOrders = freshOrders;
      hasMoreOrders.value = freshOrders.length === PAGE;

      invoices.value = freshInvs;
      store.invoices = freshInvs;
      hasMore.value = freshInvs.length === PAGE;

      if (freshCusts.length > 0) {
        allCustomers.value = freshCusts;
        store.customers = freshCusts;
      }

      todayProfit.value = profit;
      store.todayProfit = profit;
      store.refresh();
    } catch (e) {
      console.error("[Billing] Refresh failed:", e);
    } finally {
      setTimeout(() => {
        isRefreshing.value = false;
      }, 350);
    }
  });

  // Sync with store
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    const sInvs = track(() => store.invoices);
    const sOrders = track(() => store.salesOrders);
    const sCust = track(() => store.customers);
    const sProf = track(() => store.todayProfit);
    const sLoad = track(() => store.loading);

    if (sInvs && sInvs.length > 0) {
      invoices.value = sInvs as Invoice[];
      hasMore.value = sInvs.length >= PAGE;
      loading.value = false;
    }
    if (sOrders && sOrders.length > 0) {
      salesOrders.value = sOrders as Invoice[];
      hasMoreOrders.value = sOrders.length >= PAGE;
      ordersLoading.value = false;
    }
    if (sCust && sCust.length > 0) {
      allCustomers.value = sCust;
    }
    if (sProf !== null) {
      todayProfit.value = sProf;
    }
    if (!sLoad) {
      loading.value = false;
      ordersLoading.value = false;
    }
  });

  // Invoice detail slideout
  const showDetail = useSignal(false);
  const pickedInvoice = useSignal<InvoiceBasic | null>(null);
  const pickedDetail = useSignal<InvoiceDetail | null>(null);
  const detailCache = useSignal<Record<string, InvoiceDetail>>({});
  const detailLoading = useSignal(false);
  const detailError = useSignal<string | null>(null);

  // Shift Register modal
  const showShiftModal = useSignal(false);
  const activeShift = useSignal<any | null>(null);

  // Print modal
  const showPrintModal = useSignal(false);
  const printInvoiceDetail = useSignal<InvoiceDetail | null>(null);

  const handlePrintInvoice = $(async (inv: InvoiceBasic | InvoiceDetail) => {
    try {
      if ("lines" in inv && inv.lines && inv.lines.length > 0) {
        printInvoiceDetail.value = inv as InvoiceDetail;
      } else if (detailCache.value[inv.id]) {
        printInvoiceDetail.value = detailCache.value[inv.id];
      } else {
        const detail = await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: inv.id });
        detailCache.value = { ...detailCache.value, [inv.id]: detail };
        printInvoiceDetail.value = detail;
      }
    } catch (err) {
      console.error("Failed to load invoice for print:", err);
      // Fallback detail so print preview always renders
      printInvoiceDetail.value = {
        id: inv.id,
        doc_number: inv.doc_number,
        doc_date: inv.doc_date,
        status: inv.status,
        channel: "pos",
        subtotal: inv.subtotal,
        discount_amt: inv.discount_amt,
        tax_amount: inv.tax_amount,
        grand_total: inv.grand_total,
        amount_paid: inv.amount_paid,
        amount_due: inv.amount_due,
        profit: inv.profit,
        notes: null,
        created_at: inv.doc_date,
        customer_name: inv.customer_name ?? null,
        payment_mode: inv.payment_mode ?? null,
        lines: [],
      };
    } finally {
      showPrintModal.value = true;
    }
  });

  const handleWhatsAppInvoice = $(async (inv: InvoiceBasic | InvoiceDetail) => {
    let customerPhone = (inv as any).customer_phone || "";
    if (!customerPhone) {
      try {
        const detail = detailCache.value[inv.id] || await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: inv.id });
        if (!detailCache.value[inv.id]) {
          detailCache.value = { ...detailCache.value, [inv.id]: detail };
        }
        customerPhone = detail.customer_phone || "";
      } catch { /* noop */ }
    }
    let storeName = "Our Store";
    try {
      const cfg = await invoke<any>("fin_get_tax_config").catch(() => null);
      if (cfg?.legal_name) storeName = cfg.legal_name;
    } catch { /* noop */ }

    openWhatsAppInvoice(inv, customerPhone, storeName);
  });

  // Success toast
  const lastBilled = useSignal<BilledResult | null>(null);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    invoke<any | null>("shop_get_active_shift", {})
      .then(s => { activeShift.value = s; })
      .catch(() => {});

    if (activeTab.value === "orders" || salesOrders.value.length === 0) {
      loadSalesOrders(true);
    }
    if (invoices.value.length === 0) {
      try {
        const [invs, custs, profit] = await Promise.all([
          invoke<Invoice[]>("shop_list_invoices", { limit: PAGE, offset: 0 }),
          invoke<CustomerBasic[]>("shop_list_customers", {}).catch(() => [] as CustomerBasic[]),
          invoke<number>("shop_today_profit", {}).catch(() => null),
        ]);
        invoices.value = invs;
        store.invoices = invs;
        allCustomers.value = custs;
        store.customers = custs;
        hasMore.value = invs.length === PAGE;
        todayProfit.value = profit;
        store.todayProfit = profit;
      } catch (e) {
        console.error("[product/billing] load failed:", e);
      } finally {
        loading.value = false;
      }
    }
  });

  const loadMore = $(() => {
    loadingMore.value = true;
    invoke<Invoice[]>("shop_list_invoices", { limit: PAGE, offset: invoices.value.length })
      .then(more => {
        invoices.value = [...invoices.value, ...more];
        store.invoices = invoices.value;
        hasMore.value = more.length === PAGE;
      })
      .catch(e => console.error("[product/billing] loadMore:", e))
      .finally(() => { loadingMore.value = false; });
  });

  const handleBilled = $(async (result: BilledResult) => {
    lastBilled.value = result;
    editInvoiceForModal.value = null; // clear edit mode
    prefillLinesForModal.value = [];
    prefillCustomerNameForModal.value = "";
    prefillCustomerIdForModal.value = null;
    prefillCustomerForModal.value = null;
    salesOrderIdForModal.value = null;

    if (result?.invoiceId) {
      try {
        const freshDetail = await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: result.invoiceId });
        detailCache.value = { ...detailCache.value, [result.invoiceId]: freshDetail };
        if (pickedInvoice.value?.id === result.invoiceId) {
          pickedDetail.value = freshDetail;
        }
      } catch { /* ignore */ }
    }

    // Refresh first page + profit + sales orders
    try {
      const [fresh, profit] = await Promise.all([
        invoke<Invoice[]>("shop_list_invoices", { limit: PAGE, offset: 0 }),
        invoke<number>("shop_today_profit", {}).catch(() => null),
      ]);
      invoices.value = fresh;
      store.invoices = fresh;
      hasMore.value = fresh.length === PAGE;
      todayProfit.value = profit;
      store.todayProfit = profit;
      store.refresh();
      await loadSalesOrders(true);
    } catch { /* ignore — list refresh is best-effort */ }
    setTimeout(() => { lastBilled.value = null; }, 5000);
  });

  // ── Global Keyboard Shortcuts on Billing Page ──────────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const handleGlobalBillingKeys = (e: KeyboardEvent) => {
      const tag = (document.activeElement?.tagName || "").toUpperCase();
      const isInput = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || (document.activeElement as HTMLElement)?.isContentEditable;

      const isAnyModalOpen =
        showBillModal.value ||
        showCustomBillModal.value ||
        showDetail.value ||
        showShiftModal.value ||
        showOrderReview.value;

      if (isAnyModalOpen) return;

      // F2 or Ctrl+B / Cmd+B or Alt+C / Option+C: Open Custom Bill
      if (
        e.key === "F2" ||
        ((e.ctrlKey || e.metaKey) && (e.key === "b" || e.key === "B")) ||
        (e.altKey && (e.key === "c" || e.key === "C")) ||
        (!isInput && (e.key === "c" || e.key === "C"))
      ) {
        e.preventDefault();
        editInvoiceForModal.value = null;
        prefillLinesForModal.value = [];
        prefillCustomerNameForModal.value = "";
        prefillCustomerIdForModal.value = null;
        prefillCustomerForModal.value = null;
        salesOrderIdForModal.value = null;
        showCustomBillModal.value = true;
        return;
      }

      // F1 or Ctrl+N / Cmd+N or Alt+N / Option+N: Open POS New Bill
      if (
        e.key === "F1" ||
        ((e.ctrlKey || e.metaKey) && (e.key === "n" || e.key === "N")) ||
        (e.altKey && (e.key === "n" || e.key === "N"))
      ) {
        e.preventDefault();
        editInvoiceForModal.value = null;
        prefillLinesForModal.value = [];
        prefillCustomerNameForModal.value = "";
        prefillCustomerIdForModal.value = null;
        prefillCustomerForModal.value = null;
        salesOrderIdForModal.value = null;
        showBillModal.value = true;
        return;
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleGlobalBillingKeys);
      cleanup(() => {
        window.removeEventListener("keydown", handleGlobalBillingKeys);
      });
    }
  });

  const fmt = (n: number) => fmtMoney(n);

  // Today's stats
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime() / 1000;

  const todayInvoices = () => invoices.value.filter(i => i.doc_date >= todayTs);
  const todayTotal = () => todayInvoices().reduce((s, i) => s + i.grand_total, 0);
  const todayPaid = () => todayInvoices().reduce((s, i) => s + i.amount_paid, 0);
  const todayDue = () => todayInvoices().reduce((s, i) => s + i.amount_due, 0);
  const pendingOrdersCount = () => salesOrders.value.filter(o => o.status === "pending_approval" || o.status === "pending").length;

  return (
    <>
      <NewBillModal
        open={showBillModal}
        customers={allCustomers}
        onBilled$={handleBilled}
        editInvoice={editInvoiceForModal}
        filterCategoryId="cat_6"
        prefillLines={prefillLinesForModal}
        prefillCustomerName={prefillCustomerNameForModal}
        prefillCustomerId={prefillCustomerIdForModal}
        prefillCustomer={prefillCustomerForModal}
        salesOrderId={salesOrderIdForModal}
      />

      <CustomNewBill
        open={showCustomBillModal}
        customers={allCustomers}
        filterCategoryId="cat_6"
        onBilled$={handleBilled}
        editInvoice={editInvoiceForModal}
        prefillLines={prefillLinesForModal}
        prefillCustomer={prefillCustomerForModal}
        prefillCustomerName={prefillCustomerNameForModal}
        prefillCustomerId={prefillCustomerIdForModal}
        salesOrderId={salesOrderIdForModal}
      />

      <InvoiceDetailSlideOver
        open={showDetail}
        invoice={pickedInvoice}
        detail={pickedDetail}
        loading={detailLoading}
        error={detailError}
        onEdit$={$((detail: InvoiceDetail) => {
          showDetail.value = false;
          editInvoiceForModal.value = detail;
          prefillCustomerNameForModal.value = detail.customer_name || "";
          prefillCustomerIdForModal.value = detail.customer_id || null;
          showCustomBillModal.value = true;
        })}
        onEditInPos$={$((detail: InvoiceDetail) => {
          showDetail.value = false;
          editInvoiceForModal.value = detail;
          prefillCustomerNameForModal.value = detail.customer_name || "";
          prefillCustomerIdForModal.value = detail.customer_id || null;
          showBillModal.value = true;
        })}
        onEditInCustom$={$((detail: InvoiceDetail) => {
          showDetail.value = false;
          editInvoiceForModal.value = detail;
          prefillCustomerNameForModal.value = detail.customer_name || "";
          prefillCustomerIdForModal.value = detail.customer_id || null;
          showCustomBillModal.value = true;
        })}
        onPrint$={handlePrintInvoice}
        onDownload$={handlePrintInvoice}
        onWhatsApp$={handleWhatsAppInvoice}
        onPaymentRecorded$={$(async () => {
          if (pickedInvoice.value) {
            try {
              const refreshed = await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: pickedInvoice.value.id });
              pickedDetail.value = refreshed;
              detailCache.value = { ...detailCache.value, [pickedInvoice.value.id]: refreshed };
            } catch { /* noop */ }
          }
          try {
            const [fresh, profit] = await Promise.all([
              invoke<Invoice[]>("shop_list_invoices", { limit: PAGE, offset: 0 }),
              invoke<number>("shop_today_profit", {}).catch(() => null),
            ]);
            invoices.value = fresh;
            hasMore.value = fresh.length === PAGE;
            todayProfit.value = profit;
          } catch { /* ignore */ }
        })}
      />

      {showPrintModal.value && (
        <InvoicePrintModal
          open={showPrintModal}
          invoice={printInvoiceDetail}
        />
      )}

      <ShiftRegisterModal
        open={showShiftModal}
        onShiftChanged$={handleRefreshData}
      />

      <OnlineOrderReviewSlideOver
        open={showOrderReview}
        orderId={pickedOrderId}
        customers={allCustomers}
        onOrderProcessed$={$(async () => {
          await loadSalesOrders(true);
          try {
            const fresh = await invoke<InvoiceBasic[]>("shop_list_invoices", { limit: PAGE, offset: 0 });
            invoices.value = fresh as Invoice[];
            store.invoices = fresh;
          } catch { /* ignore */ }
        })}
        onInvoiceCreated$={$((newInv: InvoiceDetail) => {
          printInvoiceDetail.value = newInv;
          showPrintModal.value = true;
        })}
        onAcceptForBilling$={$((payload, mode) => {
          const targetMode = mode || payload.mode || "pos";

          // 1. Set sales order ID and prefill customer info
          salesOrderIdForModal.value = payload.order.id;
          editInvoiceForModal.value = null;

          // Match customer by ID, phone digits, or email against directory
          const oPhone = (payload.order.customer_phone || "").replace(/\D/g, "");
          const oEmail = (payload.order.customer_email || "").trim().toLowerCase();
          const existingCust = (payload.order.customer_id && allCustomers.value.find((c) => c.id === payload.order.customer_id))
            || (oPhone.length >= 7 && allCustomers.value.find((c) => {
                if (!c.phone) return false;
                const cDig = c.phone.replace(/\D/g, "");
                return cDig === oPhone || (oPhone.length >= 10 && cDig.endsWith(oPhone.slice(-10))) || (cDig.length >= 10 && oPhone.endsWith(cDig.slice(-10)));
              }))
            || (oEmail && allCustomers.value.find((c) => c.email && c.email.trim().toLowerCase() === oEmail))
            || null;

          prefillCustomerNameForModal.value = existingCust?.name || payload.order.customer_name || "";
          prefillCustomerIdForModal.value = existingCust?.id || payload.order.customer_id || null;

          const orderCust: CustomerBasic = existingCust || {
            id: payload.order.customer_id || `order-cust-${payload.order.id}`,
            name: payload.order.customer_name || "Direct Retail Buyer",
            phone: payload.order.customer_phone || null,
            email: payload.order.customer_email || null,
            gstin: payload.order.customer_gstin || null,
            pan: payload.order.customer_pan || null,
            dl_no: payload.order.customer_dl_no || null,
            billing_addr: payload.order.customer_address || null,
            city: payload.order.customer_city || null,
            state: payload.order.customer_state || null,
          };

          if (!existingCust && payload.order.customer_id && !allCustomers.value.some((c) => c.id === payload.order.customer_id)) {
            allCustomers.value = [orderCust, ...allCustomers.value];
          }

          prefillCustomerForModal.value = orderCust;

          // 2. Map order lines with selected batches into prefillLinesForModal
          prefillLinesForModal.value = payload.lines.map((l) => {
            const assignedBatch = payload.selectedBatches[l.item_id] || null;
            return {
              itemId: l.item_id,
              name: l.description || "Product",
              qty: l.qty,
              price: l.unit_price,
              free_qty: l.free_qty || 0,
              discount_pct: l.discount_pct || 0,
              extra_discount: 0,
              batch: assignedBatch,
              pack_size: l.pack_size || null,
              conversion_factor: l.conversion_factor || 1,
              scheme_on: l.scheme_on || 0,
              scheme_free: l.scheme_free || 0,
            };
          });

          // 3. Close review slideout and open chosen bill modal
          showOrderReview.value = false;
          if (targetMode === "custom") {
            showBillModal.value = false;
            showCustomBillModal.value = true;
          } else {
            showCustomBillModal.value = false;
            showBillModal.value = true;
          }
        })}
      />

      {/* Success toast */}
      {lastBilled.value && (
        <div style={{ position: "fixed", top: "1rem", right: "1rem", zIndex: 600, display: "flex", alignItems: "center", gap: "0.75rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "0.75rem 1.25rem", boxShadow: "0 4px 24px rgba(0,0,0,0.18)" }}>
          <LuCheckCircle2 style="width:1.25rem;height:1.25rem;color:#10b981;flex-shrink:0;" />
          <div>
            <div style={{ fontSize: "0.875rem", fontWeight: "600", color: "var(--text-primary)" }}>Payment recorded</div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>{lastBilled.value.docNumber} · {fmt(lastBilled.value.total)}</div>
          </div>
          <button
            type="button"
            onClick$={$(() => {
              if (lastBilled.value?.invoiceId) {
                handlePrintInvoice({ id: lastBilled.value.invoiceId } as any);
              }
            })}
            style={{ padding: "0.25rem 0.6rem", background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.375rem", fontSize: "0.75rem", fontWeight: "600", color: "var(--text-primary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: "0.25rem" }}
          >
            <LuPrinter style="width:0.875rem;height:0.875rem;" />
            Print
          </button>
          <button type="button" onClick$={$(() => { lastBilled.value = null; })}
            style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", fontSize: "1.25rem", lineHeight: 1, marginLeft: "0.25rem" }}>×</button>
        </div>
      )}

      {/* Page header */}
      <div class="pb-header">
        <h1 style={{ fontSize: "1.125rem", fontWeight: "600", color: "var(--text-primary)", margin: 0 }}>Product Billing & Wholesale</h1>
        <div class="pb-actions">
          <div class="pb-actions-row pb-actions-row-top">
            <div class="pb-action-col">
              <ShopStaffSelector selectedStaffId={activeStaffId} variant="button" />
            </div>
            <div class="pb-action-col">
              <button
                type="button"
                onClick$={$(() => { showShiftModal.value = true; })}
                class="pb-btn pb-btn-secondary"
                style={activeShift.value ? { borderColor: "rgba(16, 185, 129, 0.4)", color: "var(--text-primary)" } : undefined}
                title={activeShift.value ? `Active Shift #${activeShift.value.id.slice(-8)} (Opened by ${activeShift.value.opened_by_name || activeShift.value.opened_by})` : "POS Register Drawer & Daily Shift Reconciliation (Z-Report)"}
              >
                <LuDollarSign style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0, color: "#10b981" }} />
                <span>{activeShift.value ? "Close Shift" : "Register Shift"}</span>
              </button>
            </div>
            <div class="pb-action-col">
              <button type="button" onClick$={$(() => nav("/dashboard/shop/products/billing/analytics/"))} class="pb-btn pb-btn-secondary">
                <LuBarChart2 style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0 }} />
                <span>Analytics</span>
              </button>
            </div>
          </div>
          <div class="pb-actions-row pb-actions-row-bottom">
            <div class="pb-action-col">
              <button type="button" onClick$={$(() => {
                editInvoiceForModal.value = null;
                prefillLinesForModal.value = [];
                prefillCustomerNameForModal.value = "";
                prefillCustomerIdForModal.value = null;
                prefillCustomerForModal.value = null;
                salesOrderIdForModal.value = null;
                showCustomBillModal.value = true;
              })} class="pb-btn pb-btn-secondary" title="Create bill with live inline discount and price editing (Hotkey: F2 or Alt+C)">
                <LuSlidersHorizontal style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0 }} />
                <span>Custom Bill</span>
                <span style={{ fontSize: "0.6875rem", opacity: 0.65, background: "var(--surface-3)", border: "1px solid var(--border)", borderRadius: "0.2rem", padding: "0.05rem 0.3rem", fontWeight: "600", marginLeft: "0.15rem" }}>F2</span>
              </button>
            </div>
            <div class="pb-action-col">
              <button type="button" onClick$={$(() => {
                editInvoiceForModal.value = null;  // always start fresh for New Bill
                prefillLinesForModal.value = [];
                prefillCustomerNameForModal.value = "";
                prefillCustomerIdForModal.value = null;
                prefillCustomerForModal.value = null;
                salesOrderIdForModal.value = null;
                showBillModal.value = true;
              })} class="pb-btn pb-btn-primary" title="Fast POS Cash Counter Billing (Hotkey: F1 or Alt+N)">
                <LuPlus style={{ width: "0.875rem", height: "0.875rem", flexShrink: 0 }} />
                <span>New Bill</span>
                <span style={{ fontSize: "0.6875rem", opacity: 0.85, background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: "0.2rem", padding: "0.05rem 0.3rem", fontWeight: "600", marginLeft: "0.15rem" }}>F1</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Today stats — 4 cards (responsive grid) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
        {[
          { label: "Today's Sales", value: todayTotal(), color: "var(--text-primary)", sub: `${todayInvoices().length} invoice${todayInvoices().length !== 1 ? "s" : ""}` },
          { label: "Collected", value: todayPaid(), color: "#10b981", sub: null },
          { label: "Outstanding", value: todayDue(), color: todayDue() > 0 ? "#ef4444" : "var(--text-secondary)", sub: null },
          {
            label: "Today's Profit",
            value: todayProfit.value ?? 0,
            color: (todayProfit.value ?? 0) > 0 ? "#10b981" : "var(--text-secondary)",
            sub: todayProfit.value !== null && todayProfit.value > 0 && todayTotal() > 0
              ? `${((todayProfit.value / todayTotal()) * 100).toFixed(1)}% margin`
              : todayProfit.value === null ? "no cost data" : null,
          },
        ].map(card => (
          <div key={card.label} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", padding: "1rem 1.25rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.35rem" }}>{card.label}</div>
            <div style={{ fontSize: "1.5rem", fontWeight: "700", color: card.color, fontVariantNumeric: "tabular-nums" }}>
              {loading.value ? "—" : card.label === "Today's Profit" && todayProfit.value === null ? "—" : fmt(card.value)}
            </div>
            {card.sub && (
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                {loading.value ? "" : card.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Tabs: POS Invoices vs Online B2B Orders (Toggle matching ProductTabs) */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "1rem" }}>
        <div class="pb-toggle-container">
          <button
            type="button"
            class={["pb-tab-btn", activeTab.value === "invoices" ? "active" : ""].join(" ")}
            onClick$={() => { activeTab.value = "invoices"; }}
          >
            <span>POS Invoices</span>
            <span
              style={{
                fontSize: "0.6875rem",
                fontWeight: "600",
                background: activeTab.value === "invoices" ? "var(--surface-3)" : "rgba(128,128,128,0.15)",
                color: activeTab.value === "invoices" ? "var(--text-primary)" : "var(--text-secondary)",
                padding: "0.05rem 0.4rem",
                borderRadius: "1rem",
              }}
              title="Today's total invoices"
            >
              {todayInvoices().length}
            </span>
          </button>

          <button
            type="button"
            class={["pb-tab-btn", activeTab.value === "orders" ? "active" : ""].join(" ")}
            onClick$={$(() => {
              activeTab.value = "orders";
              if (salesOrders.value.length === 0) {
                loadSalesOrders();
              }
            })}
          >
            <span>Online B2B Orders</span>
            {pendingOrdersCount() > 0 ? (
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: "700",
                  background: "var(--button-primary-bg)",
                  color: "var(--button-primary-text)",
                  padding: "0.05rem 0.45rem",
                  borderRadius: "1rem",
                }}
                title={`${pendingOrdersCount()} order${pendingOrdersCount() !== 1 ? "s" : ""} pending approval`}
              >
                {pendingOrdersCount()}
              </span>
            ) : (
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: "600",
                  background: activeTab.value === "orders" ? "var(--surface-3)" : "rgba(128,128,128,0.15)",
                  color: activeTab.value === "orders" ? "var(--text-primary)" : "var(--text-secondary)",
                  padding: "0.05rem 0.4rem",
                  borderRadius: "1rem",
                }}
                title="No orders pending approval"
              >
                0
              </span>
            )}
          </button>
        </div>

        {/* Pull fresh data icon button next to POS | B2B Orders toggle */}
        <button
          type="button"
          onClick$={handleRefreshData}
          disabled={isRefreshing.value}
          class="pb-refresh-btn"
          title="Pull fresh data (POS invoices & incoming B2B orders)"
          aria-label="Refresh orders and invoices"
        >
          <LuRefreshCw
            style="width: 0.9375rem; height: 0.9375rem;"
            class={isRefreshing.value ? "pb-refresh-spinning" : ""}
          />
        </button>

        {/* Table Density Toggle: Relaxed | Compact at right end */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.35rem" }}>
          <div class="pb-toggle-container">
            <button
              type="button"
              class={["pb-tab-btn", tableDensity.value === "relaxed" ? "active" : ""].join(" ")}
              onClick$={() => {
                tableDensity.value = "relaxed";
                if (typeof localStorage !== "undefined") {
                  localStorage.setItem("bk-billing-density", "relaxed");
                }
              }}
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem" }}
              title="Show all columns including Profit and %"
            >
              Relaxed
            </button>
            <button
              type="button"
              class={["pb-tab-btn", tableDensity.value === "compact" ? "active" : ""].join(" ")}
              onClick$={() => {
                tableDensity.value = "compact";
                if (typeof localStorage !== "undefined") {
                  localStorage.setItem("bk-billing-density", "compact");
                }
              }}
              style={{ fontSize: "0.75rem", padding: "0.25rem 0.65rem" }}
              title="Compact view (hide Profit and % columns)"
            >
              Compact
            </button>
          </div>
        </div>
      </div>

      {activeTab.value === "orders" ? (
        /* B2B Sales Orders Table matching BillingTable design */
        ordersLoading.value ? (
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
        ) : salesOrders.value.length === 0 ? (
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
              No Online B2B Orders Yet
            </div>
            <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Retailer orders placed on your public web storefront will appear here for review and invoice generation.
            </div>
          </div>
        ) : (
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
                    Retailer / Customer
                  </th>
                  <th style={{ textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    Channel
                  </th>
                  <th style={{ textAlign: "left", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    Status
                  </th>
                  <th style={{ textAlign: "right", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    Total Amount
                  </th>
                  <th style={{ textAlign: "right", fontSize: "0.75rem", padding: "0.5rem 0.875rem", borderBottom: "1px solid var(--border)", whiteSpace: "nowrap" }}>
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {salesOrders.value.map((order) => {
                  const dateStr = order.doc_date
                    ? new Date(order.doc_date * 1000).toLocaleDateString("en-IN", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })
                    : "—";
                  return (
                    <tr
                      key={order.id}
                      class="billing-table-row"
                      onClick$={() => {
                        pickedOrderId.value = order.id;
                        showOrderReview.value = true;
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                        {order.doc_number}
                      </td>
                      <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                        {dateStr}
                      </td>
                      <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", color: "var(--text-primary)", maxWidth: "14rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        <div style={{ fontWeight: 600 }}>{order.customer_name || "Direct Retail Buyer"}</div>
                        {order.customer_phone && (
                          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{order.customer_phone}</div>
                        )}
                      </td>
                      <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.8125rem", color: "var(--text-secondary)", textTransform: "capitalize", whiteSpace: "nowrap" }}>
                        {order.channel || "online"}
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
                            background: order.status === "invoiced"
                              ? "rgba(16,185,129,0.12)"
                              : order.status === "rejected"
                                ? "rgba(239,68,68,0.12)"
                                : "rgba(59,130,246,0.12)",
                            color: order.status === "invoiced"
                              ? "#10b981"
                              : order.status === "rejected"
                                ? "#ef4444"
                                : "#3b82f6",
                            border: `1px solid ${order.status === "invoiced"
                                ? "rgba(16,185,129,0.3)"
                                : order.status === "rejected"
                                  ? "rgba(239,68,68,0.3)"
                                  : "rgba(59,130,246,0.3)"
                              }`,
                          }}
                        >
                          {order.status.replace("_", " ")}
                        </span>
                      </td>
                      <td style={{ padding: "0.6875rem 0.875rem", fontSize: "0.875rem", fontWeight: 700, color: "var(--text-primary)", textAlign: "right", fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
                        {fmt(order.grand_total)}
                      </td>
                      <td style={{ padding: "0.6875rem 0.875rem", textAlign: "right", whiteSpace: "nowrap" }}>
                        <button
                          type="button"
                          onClick$={(e) => {
                            e.stopPropagation();
                            pickedOrderId.value = order.id;
                            showOrderReview.value = true;
                          }}
                          style={{
                            padding: "0.3rem 0.75rem",
                            borderRadius: "0.375rem",
                            border: "1px solid var(--border)",
                            background: "var(--surface-3)",
                            fontSize: "0.75rem",
                            fontWeight: "600",
                            color: "var(--text-primary)",
                            cursor: "pointer",
                          }}
                        >
                          {order.status === "invoiced" ? "View Order" : "Review & Invoice"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {/* Footer: count + load more matching BillingTable */}
            <div style={{ padding: "0.75rem 0.875rem", borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                {salesOrders.value.length} order{salesOrders.value.length !== 1 ? "s" : ""} · newest first
              </span>
              {hasMoreOrders.value && (
                <button
                  type="button"
                  disabled={loadingMoreOrders.value}
                  onClick$={loadMoreOrders}
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
                    cursor: loadingMoreOrders.value ? "not-allowed" : "pointer",
                    fontWeight: "500",
                  }}
                >
                  {loadingMoreOrders.value ? (
                    <>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style={{ animation: "spin 1s linear infinite" }}>
                        <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                      </svg>
                      Loading…
                    </>
                  ) : (
                    <>
                      <LuChevronDown style={{ width: "0.875rem", height: "0.875rem" }} />
                      Load {PAGE} more
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )
      ) : (
        /* Regular Invoices Table */
        <BillingTable
          invoices={invoices.value}
          loading={loading.value}
          hasMore={hasMore.value}
          loadingMore={loadingMore.value}
          showProfitColumns={tableDensity.value === "relaxed"}
          pageSize={PAGE}
          onLoadMore$={loadMore}
          onSelectInvoice$={$((inv) => {
            pickedInvoice.value = inv;
            showDetail.value = true;
            detailError.value = null;

            const cached = detailCache.value[inv.id];
            if (cached) {
              pickedDetail.value = cached;
              detailLoading.value = false;
            } else {
              pickedDetail.value = null;
              detailLoading.value = true;
              invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: inv.id })
                .then((d) => {
                  pickedDetail.value = d;
                  detailCache.value = { ...detailCache.value, [inv.id]: d };
                })
                .catch((e) => { detailError.value = String(e); })
                .finally(() => { detailLoading.value = false; });
            }
          })}
          onEditInvoice$={$((inv) => {
            editInvoiceForModal.value = {
              id: inv.id,
              doc_number: inv.doc_number,
              doc_date: inv.doc_date,
              status: inv.status,
              channel: "pos",
              subtotal: inv.subtotal,
              discount_amt: inv.discount_amt,
              tax_amount: inv.tax_amount,
              grand_total: inv.grand_total,
              amount_paid: inv.amount_paid,
              amount_due: inv.amount_due,
              profit: inv.profit,
              notes: null,
              created_at: inv.doc_date,
              customer_name: inv.customer_name ?? null,
              payment_mode: inv.payment_mode ?? null,
              lines: [],
            };
            showBillModal.value = true;
          })}
          onDeleteInvoice$={$(async (inv) => {
            if (!confirm(`Delete draft ${inv.doc_number}? This cannot be undone.`)) return;
            try {
              await invoke("shop_delete_invoice", { invoiceId: inv.id });
              const fresh = await invoke<InvoiceBasic[]>("shop_list_invoices", { limit: PAGE, offset: 0 });
              invoices.value = fresh;
              hasMore.value = fresh.length === PAGE;
            } catch (err) {
              alert(String(err));
            }
          })}
          onPrintInvoice$={handlePrintInvoice}
          onDownloadInvoice$={handlePrintInvoice}
          onWhatsAppInvoice$={handleWhatsAppInvoice}
        />
      )}
    </>
  );
});

export const head: DocumentHead = { title: "Product Billing — Shop" };

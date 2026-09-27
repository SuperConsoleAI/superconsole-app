// src/routes/dashboard/shop/restaurant/orders/index.tsx
//
// WHAT: Restaurant Orders & Billing page with:
//       1. 4 Ongoing Today's stats cards (Revenue, Active Dine-in Tabs, Settled Bills, Kitchen Live Queue)
//       2. Top Controls in one row: Segmented pill toggle on Left, + New Bill (POS) on Right (both 2rem height)
//       3. Active Dining Tables (Live Tabs with running totals and items breakdown)
//       4. Settled Invoices via unified <BillingTable /> with InvoiceDetailSlideOver

import { component$, useSignal, useStylesScoped$, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import {
  LuReceipt,
  LuPlus,
  LuArmchair,
  LuUtensils,
  LuFlame,
  LuCheckCircle2,
  LuDollarSign,
} from "@qwikest/icons/lucide";
import { fmtMoney } from "~/lib/fin-format";
import { NewBillModal } from "~/components/shop/NewBillModal";
import { TableOrderSlideOver } from "~/components/shop/restaurant/TableOrderSlideOver";
import { SendKOTSlideOver } from "~/components/shop/restaurant/SendKOTSlideOver";
import { BillingTable } from "~/components/shop/BillingTable";
import { InvoicePrintModal, openWhatsAppInvoice } from "~/components/shop/InvoicePrintModal";
import {
  InvoiceDetailSlideOver,
  type InvoiceBasic,
  type InvoiceDetail,
} from "~/components/shop/InvoiceDetailSlideOver";
import type { ShopTable } from "~/components/shop/restaurant/TableLayoutGrid";
import { RestaurantContext } from "~/routes/dashboard/shop/restaurant/layout";

const RESPONSIVE_STYLES = `
  .orders-controls-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .orders-toggle-wrap {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-3);
    padding: 3px;
    border-radius: 0.5rem;
    height: 2.25rem;
    box-sizing: border-box;
    align-items: center;
    border: 1px solid var(--border);
  }
  .orders-new-bill-btn {
    height: 2.25rem;
    padding: 0 1.125rem;
    border-radius: 0.375rem;
    border: none;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 0.4rem;
    white-space: nowrap;
    box-sizing: border-box;
  }
  @media (max-width: 640px) {
    .orders-controls-bar {
      flex-direction: column;
      align-items: stretch;
    }
    .orders-toggle-wrap {
      width: 100%;
      height: 2.5rem;
    }
    .orders-toggle-wrap button {
      flex: 1;
      justify-content: center;
      padding: 0 0.5rem !important;
      font-size: 0.8125rem !important;
    }
    .orders-new-bill-btn {
      width: 100%;
      height: 2.5rem;
      justify-content: center;
    }
  }
`;

export default component$(() => {
  useStylesScoped$(RESPONSIVE_STYLES);
  const ctx = useContext(RestaurantContext);
  const activeTab = useSignal<"active_tables" | "settled_invoices">("active_tables");

  // Modals & SlideOvers
  const showBillModal = useSignal(false);
  const showTableOrderModal = useSignal(false);
  const showSendKOTModal = useSignal(false);
  const selectedTable = useSignal<ShopTable | null>(null);
  const selectedKOTTableId = useSignal("");
  const prefillBillLines = useSignal<import("~/components/shop/NewBillModal").PrefillBillLine[]>([]);
  const prefillCustomerName = useSignal("");
  const customersSignal = useSignal(ctx.customers);
  customersSignal.value = ctx.customers;

  // Invoice detail slideout
  const showDetail = useSignal(false);
  const pickedInvoice = useSignal<InvoiceBasic | null>(null);
  const pickedDetail = useSignal<InvoiceDetail | null>(null);
  const detailCache = useSignal<Record<string, InvoiceDetail>>({});
  const detailLoading = useSignal(false);
  const detailError = useSignal<string | null>(null);

  // Print modal
  const showPrintModal = useSignal(false);
  const printInvoiceDetail = useSignal<InvoiceDetail | null>(null);

  const handlePrintInvoice = $(async (inv: InvoiceBasic | InvoiceDetail) => {
    try {
      if ("lines" in inv && inv.lines && inv.lines.length > 0) {
        printInvoiceDetail.value = inv as InvoiceDetail;
      } else {
        const detail = await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: inv.id });
        printInvoiceDetail.value = detail;
      }
    } catch (err) {
      console.error("Failed to load invoice for print:", err);
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
        const detail = await invoke<InvoiceDetail>("shop_get_invoice", { invoiceId: inv.id });
        customerPhone = detail.customer_phone || "";
      } catch { /* noop */ }
    }
    let storeName = "Restaurant";
    try {
      const cfg = await invoke<any>("fin_get_tax_config").catch(() => null);
      if (cfg?.legal_name) storeName = cfg.legal_name;
    } catch { /* noop */ }

    openWhatsAppInvoice(inv, customerPhone, storeName);
  });

  const menuPrices = (() => {
    const priceMap: Record<string, number> = {};
    for (const item of ctx.menuItems) {
      priceMap[item.id] = Number(item.price) || 0;
      if (item.name) priceMap[item.name.toLowerCase()] = Number(item.price) || 0;
    }
    return priceMap;
  })();

  const fmt = (n: number) => fmtMoney(n);

  // Compute active table running summaries
  const occupiedTables = ctx.tables.filter((t: any) => t.status === "occupied");

  const getTableRunningTotal = (tableId: string, tableName: string) => {
    const tableKots = ctx.kots.filter(
      (k: any) => k.location_id === tableId || (k.location_name && k.location_name.toLowerCase() === tableName.toLowerCase())
    );

    let total = 0;
    let itemCount = 0;
    for (const kot of tableKots) {
      if (kot.status === "cancelled") continue;
      for (const line of kot.lines) {
        const price =
          (line.unit_price && line.unit_price > 0 ? line.unit_price : 0) ||
          menuPrices[line.item_id] ||
          (line.item_name ? menuPrices[line.item_name.toLowerCase()] : 0) ||
          0;
        total += price * line.qty;
        itemCount += line.qty;
      }
    }
    return { total, itemCount, kotCount: tableKots.filter((k: any) => k.status !== "cancelled").length };
  };

  // Today's stats calculations
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTs = todayStart.getTime() / 1000;

  const todayInvoices = ctx.invoices.filter((i: any) => i.doc_date >= todayTs);
  const todaySales = todayInvoices.reduce((s: number, i: any) => s + i.grand_total, 0);
  const todayPaid = todayInvoices.reduce((s: number, i: any) => s + i.amount_paid, 0);

  const activeTabsTotal = occupiedTables.reduce((sum: number, tbl: any) => {
    return sum + getTableRunningTotal(tbl.id, tbl.name).total;
  }, 0);

  const activeKitchenKots = ctx.kots.filter((k: any) => k.status === "pending" || k.status === "cooking");
  const itemsInKitchen = activeKitchenKots.reduce((sum: number, k: any) => sum + k.lines.reduce((s: number, l: any) => s + l.qty, 0), 0);

  const statsCards = [
    {
      label: "Today's Sales",
      value: fmt(todaySales),
      sub: `${todayInvoices.length} bill${todayInvoices.length !== 1 ? "s" : ""} settled (${fmt(todayPaid)} paid)`,
      color: "var(--text-primary)",
      icon: LuDollarSign,
      iconBg: "var(--brand-primary-soft, rgba(99,102,241,0.12))",
      iconColor: "var(--brand-primary, #6366f1)",
    },
    {
      label: "Active Dine-In Tabs",
      value: fmt(activeTabsTotal),
      sub: `${occupiedTables.length} occupied table${occupiedTables.length !== 1 ? "s" : ""} currently dining`,
      color: "var(--warning, #f59e0b)",
      icon: LuArmchair,
      iconBg: "var(--warning-soft, rgba(245,158,11,0.12))",
      iconColor: "var(--warning, #f59e0b)",
    },
    {
      label: "Settled Bills Today",
      value: `${todayInvoices.length}`,
      sub: todayInvoices.length > 0 ? `Avg ${fmt(todaySales / todayInvoices.length)} per ticket` : "No bills settled yet",
      color: "var(--success, #10b981)",
      icon: LuCheckCircle2,
      iconBg: "var(--success-soft, rgba(16,185,129,0.12))",
      iconColor: "var(--success, #10b981)",
    },
    {
      label: "Kitchen Live Queue",
      value: `${activeKitchenKots.length} KOTs`,
      sub: `${itemsInKitchen} dish${itemsInKitchen !== 1 ? "es" : ""} currently in preparation`,
      color: "#ec4899",
      icon: LuFlame,
      iconBg: "rgba(236,72,153,0.12)",
      iconColor: "#ec4899",
    },
  ];

  return (
    <div>
      {/* 4 Ongoing Today Stats Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        {statsCards.map((card) => {
          const IconComp = card.icon;
          return (
            <div
              key={card.label}
              style={{
                background: "var(--surface-2)",
                border: "1px solid var(--border)",
                borderRadius: "0.5rem",
                padding: "1rem 1.25rem",
                display: "flex",
                flexDirection: "column",
                gap: "0.25rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.04em",
                  }}
                >
                  {card.label}
                </span>
                <div
                  style={{
                    padding: "0.35rem",
                    borderRadius: "0.375rem",
                    background: card.iconBg,
                    color: card.iconColor,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <IconComp style={{ width: "1rem", height: "1rem" }} />
                </div>
              </div>

              <div
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  color: card.color,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {ctx.loading ? "—" : card.value}
              </div>

              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                {ctx.loading ? "" : card.sub}
              </div>
            </div>
          );
        })}
      </div>

      {/* Top Controls Row: Pill Toggle on Left, + New Bill (POS) on Right — responsive */}
      <div class="orders-controls-bar">
        {/* Segmented Pill Toggle matching RestaurantTabs.tsx */}
        <div class="orders-toggle-wrap">
          <button
            type="button"
            onClick$={() => (activeTab.value = "active_tables")}
            style={{
              padding: "0 0.95rem",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: activeTab.value === "active_tables" ? 600 : 500,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              height: "100%",
              boxSizing: "border-box",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
              background: activeTab.value === "active_tables" ? "var(--surface-1)" : "transparent",
              color: activeTab.value === "active_tables" ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: activeTab.value === "active_tables" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
            }}
          >
            <LuArmchair style={{ width: "0.9375rem", height: "0.9375rem", color: activeTab.value === "active_tables" ? "var(--brand-primary)" : "inherit" }} />
            Active Dining Tables ({occupiedTables.length})
          </button>

          <button
            type="button"
            onClick$={() => (activeTab.value = "settled_invoices")}
            style={{
              padding: "0 0.95rem",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: activeTab.value === "settled_invoices" ? 600 : 500,
              border: "none",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              height: "100%",
              boxSizing: "border-box",
              transition: "all 0.15s ease",
              whiteSpace: "nowrap",
              background: activeTab.value === "settled_invoices" ? "var(--surface-1)" : "transparent",
              color: activeTab.value === "settled_invoices" ? "var(--text-primary)" : "var(--text-secondary)",
              boxShadow: activeTab.value === "settled_invoices" ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
            }}
          >
            <LuReceipt style={{ width: "0.9375rem", height: "0.9375rem", color: activeTab.value === "settled_invoices" ? "var(--brand-primary)" : "inherit" }} />
            Settled Invoices ({ctx.invoices.length})
          </button>
        </div>

        {/* Right Action Button */}
        <button
          type="button"
          class="orders-new-bill-btn"
          onClick$={() => {
            prefillBillLines.value = [];
            prefillCustomerName.value = "";
            showBillModal.value = true;
          }}
        >
          <LuPlus style={{ width: "1rem", height: "1rem" }} />
          New Bill (POS)
        </button>
      </div>

      {/* Tab 1: Active Dining Tables */}
      {activeTab.value === "active_tables" && (
        <div>
          {ctx.loading ? (
            <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
              Loading active tables...
            </div>
          ) : occupiedTables.length === 0 ? (
            <div style={{ padding: "4rem 2rem", textAlign: "center", background: "var(--surface-2)", borderRadius: "0.75rem", border: "1px dashed var(--border)" }}>
              <LuArmchair style={{ width: "3rem", height: "3rem", color: "var(--text-secondary)", marginBottom: "1rem" }} />
              <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)" }}>
                No Active Dining Tables
              </h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
                Seat guests on the Overview Floor Plan and send KOTs to view running tabs here.
              </p>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
                gap: "1rem",
              }}
            >
              {occupiedTables.map((tbl: any) => {
                const summary = getTableRunningTotal(tbl.id, tbl.name);
                return (
                  <div
                    key={tbl.id}
                    style={{
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.75rem",
                      padding: "1.25rem",
                      display: "flex",
                      flexDirection: "column",
                      gap: "0.75rem",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                      <div>
                        <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "var(--text-primary)" }}>
                          {tbl.name}
                        </div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                          {tbl.floor || "Main Floor"} • Capacity: {tbl.capacity} Seats
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: "0.6875rem",
                          fontWeight: 700,
                          padding: "0.2rem 0.55rem",
                          borderRadius: "0.25rem",
                          background: "var(--warning-soft, rgba(245,158,11,0.12))",
                          color: "var(--warning, #f59e0b)",
                          border: "1px solid rgba(245,158,11,0.3)",
                        }}
                      >
                        Occupied
                      </span>
                    </div>

                    {/* Summary row */}
                    <div
                      style={{
                        background: "var(--surface-3)",
                        padding: "0.75rem",
                        borderRadius: "0.5rem",
                        border: "1px solid var(--border)",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                      }}
                    >
                      <div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                          {summary.kotCount} KOT Tickets • {summary.itemCount} Dishes
                        </div>
                        <div style={{ fontWeight: 700, fontSize: "1.25rem", color: "var(--text-primary)", marginTop: "0.15rem" }}>
                          ₹{summary.total.toLocaleString("en-IN")}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick$={() => {
                          selectedTable.value = tbl;
                          showTableOrderModal.value = true;
                        }}
                        style={{
                          padding: "0.45rem 0.85rem",
                          borderRadius: "0.375rem",
                          border: "1px solid var(--border)",
                          background: "var(--button-primary-bg)",
                          color: "var(--button-primary-text)",
                          fontSize: "0.8125rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <LuUtensils style={{ width: "0.875rem", height: "0.875rem" }} />
                        View / Settle
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Settled Invoices using reusable BillingTable */}
      {activeTab.value === "settled_invoices" && (
        <BillingTable
          invoices={ctx.invoices}
          loading={ctx.loading}
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
          onDeleteInvoice$={$(async (inv) => {
            if (!confirm(`Delete draft ${inv.doc_number}? This cannot be undone.`)) return;
            try {
              await invoke("shop_delete_invoice", { invoiceId: inv.id });
              await ctx.loadData();
            } catch (err) {
              alert(String(err));
            }
          })}
          onPrintInvoice$={handlePrintInvoice}
          onDownloadInvoice$={handlePrintInvoice}
          onWhatsAppInvoice$={handleWhatsAppInvoice}
        />
      )}

      {/* Invoice Detail SlideOver for Settled Bills */}
      <InvoiceDetailSlideOver
        open={showDetail}
        invoice={pickedInvoice}
        detail={pickedDetail}
        loading={detailLoading}
        error={detailError}
        onEdit$={$(() => {
          showDetail.value = false;
          showBillModal.value = true;
        })}
        onEditInPos$={$(() => {
          showDetail.value = false;
          showBillModal.value = true;
        })}
        onEditInCustom$={$(() => {
          showDetail.value = false;
          showBillModal.value = true;
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
          await ctx.loadData();
        })}
      />

      {showPrintModal.value && (
        <InvoicePrintModal
          open={showPrintModal}
          invoice={printInvoiceDetail}
        />
      )}

      {/* Table Order Breakdown SlideOver */}
      <TableOrderSlideOver
        open={showTableOrderModal}
        table={selectedTable.value}
        allKots={ctx.kots}
        onOpenSendKOT$={$((tableId, waiterName) => {
          selectedKOTTableId.value = tableId;
          const existingKot = ctx.kots.find(
            (k: any) => k.status !== "cancelled" && (k.location_id === tableId || (k.location_name && selectedTable.value?.name && k.location_name.toLowerCase() === selectedTable.value.name.toLowerCase()))
          );
          prefillCustomerName.value = waiterName || existingKot?.waiter_name || "";
          showSendKOTModal.value = true;
        })}
        onOpenPOSBill$={$((tbl, lines) => {
          prefillBillLines.value = lines.map((l) => ({
            itemId: l.itemId,
            name: l.name,
            qty: l.qty,
            price: l.price,
          }));
          prefillCustomerName.value = `Table: ${tbl.name}`;
          showBillModal.value = true;
        })}
        onClearTable$={$(async (tableId) => {
          await invoke("shop_update_table_status", { tableId, status: "available" });
          await ctx.loadData();
        })}
        onKOTsChanged$={ctx.loadData}
      />

      {/* Send More KOT SlideOver */}
      <SendKOTSlideOver
        open={showSendKOTModal}
        prefillTableId={selectedKOTTableId.value}
        prefillWaiterName={prefillCustomerName.value}
        onSent$={$(async (newKot) => {
          ctx.kots = [newKot, ...ctx.kots];
          await ctx.loadData();
        })}
      />

      {/* Restaurant POS Billing Modal */}
      <NewBillModal
        open={showBillModal}
        customers={customersSignal}
        filterCategoryId="cat_29"
        prefillLines={prefillBillLines}
        prefillCustomerName={prefillCustomerName}
        onBilled$={$(async () => {
          if (selectedTable.value) {
            await invoke("shop_update_table_status", { tableId: selectedTable.value.id, status: "available" });
          }
          showBillModal.value = false;
          await ctx.loadData();
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Restaurant Orders & Billing | BusinessKit",
};

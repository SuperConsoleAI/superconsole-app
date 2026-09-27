// src/routes/dashboard/shop/restaurant/index.tsx
//
// Restaurant / Café / Cloud Kitchen — Overview Page
// Path: /dashboard/shop/restaurant

import { component$, useSignal, useStylesScoped$, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import {
  LuSquare,
  LuFlame,
  LuUsers,
  LuPlus,
  LuUtensils,
  LuCalendarDays,
} from "@qwikest/icons/lucide";
import { TableLayoutGrid } from "~/components/shop/restaurant/TableLayoutGrid";
import { AddTableSlideOver } from "~/components/shop/restaurant/AddTableSlideOver";
import { SendKOTSlideOver } from "~/components/shop/restaurant/SendKOTSlideOver";
import { TableOrderSlideOver } from "~/components/shop/restaurant/TableOrderSlideOver";
import { NewBillModal } from "~/components/shop/NewBillModal";
import { NewReservationSlideOver } from "~/components/shop/stays/NewReservationSlideOver";
import type { ShopTable } from "~/components/shop/restaurant/TableLayoutGrid";
import { RestaurantContext } from "~/routes/dashboard/shop/restaurant/layout";

const STYLES = `
  .overview-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.25rem;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .overview-actions-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }
  .overview-btn {
    height: 2.25rem;
    padding: 0 1rem;
    border-radius: 0.5rem;
    font-weight: 600;
    font-size: 0.875rem;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    box-sizing: border-box;
    white-space: nowrap;
    transition: all 0.15s ease;
  }
  .overview-btn-secondary {
    background: var(--surface-2);
    border: 1px solid var(--border);
    color: var(--text-primary);
  }
  .overview-btn-secondary:hover {
    background: var(--surface-3);
  }
  .overview-btn-primary {
    background: var(--button-primary-bg);
    border: 1px solid transparent;
    color: var(--button-primary-text);
  }
  .overview-btn-primary:hover {
    opacity: 0.92;
  }
  @media (max-width: 640px) {
    .overview-header-row {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .overview-actions-row {
      width: 100%;
      display: flex;
    }
    .overview-btn {
      flex: 1;
      width: 100%;
    }
  }
`;

export default component$(() => {
  useStylesScoped$(STYLES);

  const ctx = useContext(RestaurantContext);

  const showAddTableModal = useSignal(false);
  const showSendKOTModal = useSignal(false);
  const showTableOrderModal = useSignal(false);
  const showBillModal = useSignal(false);
  const showNewResModal = useSignal(false);
  const selectedTable = useSignal<ShopTable | null>(null);
  const selectedKOTTableId = useSignal("");
  const selectedKOTWaiterName = useSignal("");
  const prefillBillLines = useSignal<import("~/components/shop/NewBillModal").PrefillBillLine[]>([]);
  const prefillCustomerName = useSignal("");
  const customersSignal = useSignal(ctx.customers);
  customersSignal.value = ctx.customers;

  const handleStatusChange = $(async (tableId: string, newStatus: string) => {
    try {
      await invoke("shop_update_table_status", { tableId, status: newStatus });
      ctx.tables = ctx.tables.map((t) =>
        t.id === tableId ? { ...t, status: newStatus } : t
      );
    } catch (e) {
      console.error("[restaurant/overview] update table status failed:", e);
    }
  });

  const occupiedCount = ctx.tables.filter((t) => t.status === "occupied").length;
  const reservedCount = ctx.tables.filter((t) => t.status === "reserved").length;
  const pendingKotCount = ctx.kots.filter((k) => k.status === "pending" || k.status === "cooking").length;

  return (
    <div>
      {/* KPI Cards */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Total Tables</span>
            <LuSquare style="width:1.25rem;height:1.25rem;color:var(--brand-primary);" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem" }}>
            {ctx.tables.length}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            {ctx.tables.length - occupiedCount - reservedCount} Available now
          </div>
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Occupied Tables</span>
            <LuUsers style="width:1.25rem;height:1.25rem;color:#D97757;" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem" }}>
            {occupiedCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Active dining guests
          </div>
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Kitchen Queue (KOT)</span>
            <LuFlame style="width:1.25rem;height:1.25rem;color:#ef4444;" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem" }}>
            {pendingKotCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Pending & Cooking orders
          </div>
        </div>

        <div
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.75rem",
            padding: "1.25rem",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", color: "var(--text-secondary)" }}>
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Reserved Tables</span>
            <LuUtensils style="width:1.25rem;height:1.25rem;color:#10b981;" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem" }}>
            {reservedCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Upcoming reservations
          </div>
        </div>
      </div>

      {/* Floor Plan Section */}
      <div style={{ background: "var(--surface-1)", borderRadius: "0.75rem", border: "1px solid var(--border)", padding: "1.5rem", marginBottom: "1.5rem" }}>
        <div class="overview-header-row">
          <div>
            <h3 style={{ margin: 0, fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)" }}>
              Dining Floor Layout
            </h3>
            <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              Manage active dining tables, view running order bills, and send KOT tickets.
            </p>
          </div>
          <div class="overview-actions-row">
            <button
              type="button"
              class="overview-btn overview-btn-secondary"
              onClick$={() => (showNewResModal.value = true)}
            >
              <LuCalendarDays style="width:1rem;height:1rem;color:#3B82F6;" />
              Book Table
            </button>
            <button
              type="button"
              class="overview-btn overview-btn-secondary"
              onClick$={() => {
                selectedKOTTableId.value = "";
                selectedKOTWaiterName.value = "";
                showSendKOTModal.value = true;
              }}
            >
              <LuFlame style="width:1rem;height:1rem;color:var(--warning,#D97757);" />
              Send KOT
            </button>
            <button
              type="button"
              class="overview-btn overview-btn-primary"
              onClick$={() => (showAddTableModal.value = true)}
            >
              <LuPlus style="width:1rem;height:1rem;" />
              Add Table
            </button>
          </div>
        </div>

        {ctx.loading ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
            Loading tables...
          </div>
        ) : (
          <TableLayoutGrid
            tables={ctx.tables}
            onStatusChange$={handleStatusChange}
            onSendKOT$={$((tbl) => {
              selectedKOTTableId.value = tbl.id;
              const existingKot = ctx.kots.find(
                (k) => k.status !== "cancelled" && (k.location_id === tbl.id || (k.location_name && k.location_name.toLowerCase() === tbl.name.toLowerCase()))
              );
              selectedKOTWaiterName.value = existingKot?.waiter_name || "";
              showSendKOTModal.value = true;
            })}
            onViewOrder$={$((tbl) => {
              selectedTable.value = tbl;
              showTableOrderModal.value = true;
            })}
          />
        )}
      </div>

      {/* SlideOvers */}
      <AddTableSlideOver
        open={showAddTableModal}
        onSaved$={$(async (saved) => {
          ctx.tables = [...ctx.tables, saved];
          await ctx.loadData();
        })}
      />

      <NewReservationSlideOver
        open={showNewResModal}
        rooms={ctx.tables.map((t) => ({
          id: t.id,
          profile_id: t.profile_id,
          location_type: t.location_type || "table",
          name: t.name,
          number: t.number,
          floor: t.floor,
          capacity: t.capacity,
          base_rate: t.base_rate,
          amenities: t.amenities,
          status: t.status,
          is_active: t.is_active,
          sort_order: t.sort_order,
        }))}
        customers={ctx.customers}
        itemTypeLabel="Table"
        defaultBookingType="hourly"
        filterLocationType="table"
        onSaved$={$(async (newRes) => {
          if (newRes.location_id) {
            await handleStatusChange(newRes.location_id, "reserved");
          }
          await ctx.loadData();
        })}
      />

      <SendKOTSlideOver
        open={showSendKOTModal}
        prefillTableId={selectedKOTTableId.value}
        prefillWaiterName={selectedKOTWaiterName.value}
        onSent$={$(async (newKot) => {
          ctx.kots = [newKot, ...ctx.kots];
          await ctx.loadData();
        })}
      />

      <TableOrderSlideOver
        open={showTableOrderModal}
        table={selectedTable.value}
        allKots={ctx.kots}
        onOpenSendKOT$={$((tableId, waiterName) => {
          selectedKOTTableId.value = tableId;
          selectedKOTWaiterName.value = waiterName || "";
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
          await handleStatusChange(tableId, "available");
        })}
        onKOTsChanged$={ctx.loadData}
      />

      <NewBillModal
        open={showBillModal}
        customers={customersSignal}
        filterCategoryId="cat_29"
        prefillLines={prefillBillLines}
        prefillCustomerName={prefillCustomerName}
        onBilled$={$(async () => {
          if (selectedTable.value) {
            await handleStatusChange(selectedTable.value.id, "available");
          }
          showBillModal.value = false;
          await ctx.loadData();
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Restaurant Overview | BusinessKit",
  meta: [
    {
      name: "description",
      content: "Restaurant tables, kitchen tickets, and daily overview.",
    },
  ],
};

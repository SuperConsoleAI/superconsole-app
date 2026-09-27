// src/routes/dashboard/shop/restaurant/tables/index.tsx
//
// Restaurant Tables Floor Plan Page — Path: /dashboard/shop/restaurant/tables

import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuPlus } from "@qwikest/icons/lucide";
import { TableLayoutGrid } from "~/components/shop/restaurant/TableLayoutGrid";
import { AddTableSlideOver } from "~/components/shop/restaurant/AddTableSlideOver";
import { RestaurantContext } from "~/routes/dashboard/shop/restaurant/layout";

export default component$(() => {
  const ctx = useContext(RestaurantContext);
  const filter  = useSignal("all");
  const showModal = useSignal(false);

  const handleStatusChange = $(async (tableId: string, newStatus: string) => {
    try {
      await invoke("shop_update_table_status", { tableId, status: newStatus });
      ctx.tables = ctx.tables.map((t) =>
        t.id === tableId ? { ...t, status: newStatus } : t
      );
    } catch (e) {
      console.error("[restaurant/tables] update status failed:", e);
    }
  });

  const filteredTables = ctx.tables.filter((t) => {
    if (filter.value === "all") return true;
    return t.status === filter.value;
  });

  return (
    <div>
      {/* Filter Tabs & Add Table */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          {["all", "available", "occupied", "reserved"].map((st) => (
            <button
            key={st}
            onClick$={() => (filter.value = st)}
            style={{
              padding: "0.4rem 0.85rem",
              borderRadius: "0.375rem",
              fontSize: "0.8125rem",
              fontWeight: 500,
              textTransform: "capitalize",
              border: "1px solid var(--border)",
              background: filter.value === st ? "var(--brand-primary, #2563eb)" : "var(--surface-1)",
              color: filter.value === st ? "#fff" : "var(--text-primary)",
              cursor: "pointer",
            }}
          >
            {st} ({st === "all" ? ctx.tables.length : ctx.tables.filter((t) => t.status === st).length})
          </button>
        ))}
        </div>
        <button
          onClick$={() => (showModal.value = true)}
          style={{
            padding: "0.5rem 1rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-text)",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <LuPlus style="width:1rem;height:1rem;" />
          Add Table
        </button>
      </div>

      {/* Grid */}
      {ctx.loading ? (
        <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
          Loading dining tables...
        </div>
      ) : (
        <TableLayoutGrid
          tables={filteredTables}
          onStatusChange$={handleStatusChange}
        />
      )}

      {/* Add SlideOver */}
      <AddTableSlideOver
        open={showModal}
        onSaved$={$(async (saved) => {
          ctx.tables = [...ctx.tables, saved];
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Restaurant Tables | BusinessKit",
};

// src/routes/dashboard/shop/restaurant/reservations/index.tsx
//
// Restaurant Table Reservations List Page — Path: /dashboard/shop/restaurant/reservations

import { component$, useSignal, useContext, $ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import {
  LuPlus,
  LuClock,
  LuUsers,
  LuUtensils,
  LuCalendarDays,
  LuCheckCircle2,
} from "@qwikest/icons/lucide";
import { RestaurantContext } from "~/routes/dashboard/shop/restaurant/layout";
import { NewReservationSlideOver } from "~/components/shop/stays/NewReservationSlideOver";

export default component$(() => {
  const ctx = useContext(RestaurantContext);
  const filterStatus = useSignal("all");
  const showNewResModal = useSignal(false);

  const todayStr = new Date().toISOString().split("T")[0];

  const tableLocationIds = new Set(ctx.tables.map((t) => t.id));
  const restaurantReservations = ctx.reservations.filter((r) => {
    if (r.item_type === "room" || r.item_type === "stay") return false;
    const locId = r.location_id || "";
    if (locId && !tableLocationIds.has(locId)) return false;
    return r.item_type === "table" || (!!locId && tableLocationIds.has(locId)) || !r.item_type;
  });

  const todayReservations = restaurantReservations.filter((r) => {
    const d = new Date(r.slot_start * 1000).toISOString().split("T")[0];
    return d === todayStr && r.status !== "cancelled";
  });

  const todayBookingsCount = todayReservations.length;
  const inHouseSeatedCount = restaurantReservations.filter((r) => r.status === "checked_in").length;
  const totalActiveBookings = restaurantReservations.filter((r) => r.status !== "cancelled").length;
  const totalReservedTables = ctx.tables.filter((t) => t.status === "reserved" || t.status === "occupied").length;

  const filteredReservations = restaurantReservations.filter((r) => {
    if (filterStatus.value === "all") return true;
    return r.status === filterStatus.value;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return { bg: "#3B82F61A", color: "#3B82F6", label: "Confirmed" };
      case "checked_in":
        return { bg: "#D977571A", color: "#D97757", label: "Seated / Active" };
      case "checked_out":
        return { bg: "#10B9811A", color: "#10B981", label: "Completed" };
      case "cancelled":
        return { bg: "rgba(239,68,68,0.1)", color: "#ef4444", label: "Cancelled" };
      default:
        return { bg: "var(--surface-3)", color: "var(--text-secondary)", label: status };
    }
  };

  return (
    <div>
      {/* Today's Table Reservations KPI Stats */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.25rem",
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
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Today's Table Bookings</span>
            <LuCalendarDays style="width:1.25rem;height:1.25rem;color:#3B82F6;" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {todayBookingsCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Scheduled reservations today
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
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Seated / In-House Diners</span>
            <LuUtensils style="width:1.25rem;height:1.25rem;color:#D97757;" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {inHouseSeatedCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Currently seated guests
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
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Reserved / Occupied Tables</span>
            <LuCheckCircle2 style="width:1.25rem;height:1.25rem;color:#10B981;" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {totalReservedTables}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Active dining table count
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
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Total Table Reservations</span>
            <LuUsers style="width:1.25rem;height:1.25rem;color:var(--brand-primary);" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {totalActiveBookings}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            All-time active reservations
          </div>
        </div>
      </div>

      {/* Control Row: Container background surface-3 with active button background surface-2 */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "0.25rem",
            overflowX: "auto",
            maxWidth: "100%",
          }}
        >
          {["all", "confirmed", "checked_in", "checked_out", "cancelled"].map((st) => {
            const active = filterStatus.value === st;
            return (
              <button
                key={st}
                type="button"
                onClick$={() => (filterStatus.value = st)}
                style={{
                  padding: "0.35rem 0.75rem",
                  borderRadius: "0.375rem",
                  fontSize: "0.8125rem",
                  fontWeight: 600,
                  border: "none",
                  background: active ? "var(--button-primary-bg)" : "transparent",
                  color: active ? "var(--button-primary-text)" : "var(--text-secondary)",
                  cursor: "pointer",
                  textTransform: "capitalize",
                  whiteSpace: "nowrap",
                  transition: "background 150ms ease, color 150ms ease",
                  boxShadow: active ? "0 1px 2px rgba(0,0,0,0.06)" : "none",
                }}
                onMouseOver$={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "var(--surface-1)";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
                  }
                }}
                onMouseOut$={(e) => {
                  if (!active) {
                    (e.currentTarget as HTMLElement).style.background = "transparent";
                    (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
                  }
                }}
              >
                {st === "all" ? "All Reservations" : st === "checked_in" ? "Seated" : st.replace("_", " ")}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick$={() => (showNewResModal.value = true)}
          style={{
            height: "2.25rem",
            padding: "0 1rem",
            borderRadius: "0.5rem",
            background: "var(--button-primary-bg)",
            border: "none",
            color: "var(--button-primary-text)",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            boxSizing: "border-box",
            whiteSpace: "nowrap",
          }}
        >
          <LuPlus style="width:1rem;height:1rem;" />
          Book Table
        </button>
      </div>

      {/* Table Reservations Data Table */}
      <div
        style={{
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "0.75rem",
          overflow: "hidden",
        }}
      >
        {filteredReservations.length === 0 ? (
          <div style={{ padding: "4rem 2rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <LuCalendarDays style="width:3rem;height:3rem;margin-bottom:1rem;opacity:0.4;" />
            <h3 style={{ margin: "0 0 0.5rem 0", color: "var(--text-primary)", fontSize: "1.125rem" }}>
              No Table Reservations Found
            </h3>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>
              Click "+ Book Table" to schedule a new restaurant table reservation.
            </p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: "0.875rem" }}>
            <thead>
              <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Table Name</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Guest Name</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Party Size</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Date & Time Slot</th>
                <th style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredReservations.map((r) => {
                const badge = getStatusBadge(r.status);
                const startDate = new Date(r.slot_start * 1000);
                const endDate = new Date(r.slot_end * 1000);
                const isSameDay = startDate.toDateString() === endDate.toDateString();
                const timeSlot = isSameDay
                  ? `${startDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })} • ${startDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${endDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                  : `${startDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })} - ${endDate.toLocaleDateString("en-IN", { month: "short", day: "numeric" })}`;

                const tableName = r.room_name || ctx.tables.find((t) => t.id === r.location_id)?.name || "Table";

                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid var(--border)" }}>
                    <td style={{ padding: "0.875rem 1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {tableName}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", color: "var(--text-primary)" }}>
                      {r.customer_name || "Guest"}
                    </td>
                    <td style={{ padding: "0.875rem 1rem", color: "var(--text-secondary)" }}>
                      {r.party_size} Guests
                    </td>
                    <td style={{ padding: "0.875rem 1rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                        <LuClock style="width:0.875rem;height:0.875rem;" />
                        {timeSlot}
                      </div>
                    </td>
                    <td style={{ padding: "0.875rem 1rem" }}>
                      <span
                        style={{
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          padding: "0.25rem 0.6rem",
                          borderRadius: "1rem",
                          background: badge.bg,
                          color: badge.color,
                        }}
                      >
                        {badge.label}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

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
        filterLocationType="table"
        defaultBookingType="hourly"
        onSaved$={$(async () => {
          await ctx.loadData();
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Table Reservations | BusinessKit",
};

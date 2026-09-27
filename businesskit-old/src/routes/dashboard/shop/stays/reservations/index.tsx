// src/routes/dashboard/shop/stays/reservations/index.tsx
//
// All Reservations List Page — Path: /dashboard/shop/stays/reservations

import { component$, useSignal, useContext, $ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import {
  LuPlus,
  LuLogIn,
  LuLogOut,
  LuBedDouble,
  LuCalendarDays,
} from "@qwikest/icons/lucide";
import { StaysContext } from "~/routes/dashboard/shop/stays/layout";
import { NewReservationSlideOver } from "~/components/shop/stays/NewReservationSlideOver";

export default component$(() => {
  const ctx = useContext(StaysContext);
  const filterStatus = useSignal("all");
  const showNewResModal = useSignal(false);

  const todayStr = new Date().toISOString().split("T")[0];

  const roomLocationIds = new Set(ctx.rooms.map((r) => r.id));
  const roomReservations = ctx.reservations.filter((r) => {
    if (r.item_type === "table") return false;
    const locId = r.location_id || "";
    if (locId && !roomLocationIds.has(locId)) return false;
    return r.item_type === "room" || r.item_type === "stay" || (!!locId && roomLocationIds.has(locId)) || !r.item_type;
  });

  const todayCheckIns = roomReservations.filter((r) => {
    const d = new Date(r.slot_start * 1000).toISOString().split("T")[0];
    return d === todayStr && r.status !== "cancelled";
  }).length;

  const todayCheckOuts = roomReservations.filter((r) => {
    const d = new Date(r.slot_end * 1000).toISOString().split("T")[0];
    return d === todayStr && r.status !== "cancelled";
  }).length;

  const inHouseCount = roomReservations.filter((r) => r.status === "checked_in").length;

  const totalBookingsCount = roomReservations.filter((r) => r.status !== "cancelled").length;

  const filteredReservations = roomReservations.filter((r) => {
    if (filterStatus.value === "all") return true;
    return r.status === filterStatus.value;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return { bg: "#3B82F61A", color: "#3B82F6", label: "Confirmed" };
      case "checked_in":
        return { bg: "#D977571A", color: "#D97757", label: "Checked-In" };
      case "checked_out":
        return { bg: "#10B9811A", color: "#10B981", label: "Checked-Out" };
      case "cancelled":
        return { bg: "rgba(239,68,68,0.1)", color: "#ef4444", label: "Cancelled" };
      default:
        return { bg: "var(--surface-3)", color: "var(--text-secondary)", label: status };
    }
  };

  return (
    <div>
      {/* Today's KPI Stats Cards (4 Cards Grid) */}
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
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Today's Check-ins</span>
            <LuLogIn style="width:1.25rem;height:1.25rem;color:#3B82F6;" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {todayCheckIns}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Arrivals scheduled today
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
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Today's Check-outs</span>
            <LuLogOut style="width:1.25rem;height:1.25rem;color:#D97757;" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {todayCheckOuts}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Departures due today
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
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>In-House Guests</span>
            <LuBedDouble style="width:1.25rem;height:1.25rem;color:#10B981;" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {inHouseCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Currently checked in
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
            <span style={{ fontSize: "0.8125rem", fontWeight: 500 }}>Total Active Bookings</span>
            <LuCalendarDays style="width:1.25rem;height:1.25rem;color:var(--brand-primary);" />
          </div>
          <div style={{ fontSize: "1.75rem", fontWeight: 700, marginTop: "0.5rem", color: "var(--text-primary)" }}>
            {totalBookingsCount}
          </div>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
            Confirmed & active stays
          </div>
        </div>
      </div>

      {/* Control Row: Border & BG Container for Left End Filter Buttons ONLY + Standalone Right [+ New] Button */}
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
        {/* Border & BG ONLY for Left End Filter Button Group */}
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
                {st === "all" ? "All Bookings" : st.replace("_", " ")}
              </button>
            );
          })}
        </div>

        {/* Standalone Right [+ New Reservation] Button (Excluded from Left Border & BG Box) */}
        <button
          type="button"
          onClick$={() => (showNewResModal.value = true)}
          style={{
            height: "2.25rem",
            padding: "0 1rem",
            borderRadius: "0.5rem",
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-text)",
            border: "none",
            fontWeight: 600,
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            whiteSpace: "nowrap",
          }}
        >
          <LuPlus style="width:1rem;height:1rem;" />
          New Reservation
        </button>
      </div>

      {/* Table List */}
      <div style={{ background: "var(--surface-2)", borderRadius: "0.75rem", border: "1px solid var(--border)", overflow: "hidden" }}>
        {filteredReservations.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", color: "var(--text-secondary)" }}>
            No reservations found for this filter.
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--surface-3)", borderBottom: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "0.875rem 1rem" }}>Guest Name</th>
                <th style={{ padding: "0.875rem 1rem" }}>Room</th>
                <th style={{ padding: "0.875rem 1rem" }}>Dates</th>
                <th style={{ padding: "0.875rem 1rem" }}>Party</th>
                <th style={{ padding: "0.875rem 1rem" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {filteredReservations.map((res) => {
                const badge = getStatusBadge(res.status);
                const startDate = new Date(res.slot_start * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                const endDate = new Date(res.slot_end * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

                return (
                  <tr key={res.id} style={{ borderBottom: "1px solid var(--border)", fontSize: "0.875rem" }}>
                    <td style={{ padding: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {res.customer_name || "Walk-in Guest"}
                    </td>
                    <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                      {res.room_name || "Room Assigned"}
                    </td>
                    <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                      {startDate} → {endDate}
                    </td>
                    <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                      {res.party_size} Guest(s)
                    </td>
                    <td style={{ padding: "1rem" }}>
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
        rooms={ctx.rooms}
        customers={ctx.customers}
        itemTypeLabel="Room"
        filterLocationType="room"
        defaultBookingType="nightly"
        onSaved$={$(async () => {
          await ctx.loadData();
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Stay Reservations | BusinessKit",
};

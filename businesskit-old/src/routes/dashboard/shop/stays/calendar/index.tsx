// src/routes/dashboard/shop/stays/calendar/index.tsx
//
// Master Occupancy Calendar — Path: /dashboard/shop/stays/calendar

import { component$, useSignal, useContext, $ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LuChevronLeft, LuChevronRight } from "@qwikest/icons/lucide";
import { StaysContext } from "~/routes/dashboard/shop/stays/layout";

export default component$(() => {
  const ctx = useContext(StaysContext);
  const startDate = useSignal(new Date());

  // Generate 7-day range for matrix
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(startDate.value);
    d.setDate(d.getDate() + i);
    return d;
  });

  const shiftDays = $((delta: number) => {
    const d = new Date(startDate.value);
    d.setDate(d.getDate() + delta);
    startDate.value = d;
  });

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Master Occupancy Calendar
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Visual matrix view of all room bookings across dates.
          </p>
        </div>

        {/* Date Navigator Box Div Container */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.25rem",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            padding: "0.25rem",
          }}
        >
          <button
            type="button"
            onClick$={() => shiftDays(-7)}
            style={{
              height: "2rem",
              width: "2rem",
              borderRadius: "0.375rem",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 150ms ease",
            }}
            onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-3)"; }}
            onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-1)"; }}
            aria-label="Previous week"
          >
            <LuChevronLeft style="width:1rem;height:1rem;" />
          </button>

          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--text-primary)", padding: "0 0.625rem" }}>
            {days[0].toLocaleDateString("en-IN", { day: "numeric", month: "short" })} -{" "}
            {days[6].toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </span>

          <button
            type="button"
            onClick$={() => shiftDays(7)}
            style={{
              height: "2rem",
              width: "2rem",
              borderRadius: "0.375rem",
              background: "var(--surface-1)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transition: "background 150ms ease",
            }}
            onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-3)"; }}
            onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--surface-1)"; }}
            aria-label="Next week"
          >
            <LuChevronRight style="width:1rem;height:1rem;" />
          </button>
        </div>
      </div>

      {/* Grid Matrix */}
      <div style={{ background: "var(--surface-1)", borderRadius: "0.75rem", border: "1px solid var(--border)", overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "center", minWidth: "700px" }}>
          <thead>
            <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
              <th style={{ padding: "1rem", textAlign: "left", width: "180px", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                Room / Villa
              </th>
              {days.map((day, idx) => (
                <th key={idx} style={{ padding: "1rem", color: "var(--text-primary)", fontSize: "0.8125rem" }}>
                  <div>{day.toLocaleDateString("en-IN", { weekday: "short" })}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                    {day.getDate()} {day.toLocaleDateString("en-IN", { month: "short" })}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ctx.rooms.map((room) => (
              <tr key={room.id} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "1rem", textAlign: "left", fontWeight: 600, color: "var(--text-primary)", fontSize: "0.875rem" }}>
                  {room.name}
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 400 }}>
                    ₹{room.base_rate}/night
                  </div>
                </td>
                {days.map((day, idx) => {
                  const dayTs = Math.floor(new Date(day.getFullYear(), day.getMonth(), day.getDate(), 15, 0, 0).getTime() / 1000);
                  const matchingRes = ctx.reservations.find(
                    (r) => r.location_id === String(room.id) && r.slot_start <= dayTs && r.slot_end >= dayTs && r.status !== "cancelled"
                  );

                  return (
                    <td key={idx} style={{ padding: "0.5rem" }}>
                      {matchingRes ? (
                        <div
                          style={{
                            background: matchingRes.status === "checked_in" ? "#D977571A" : "#3B82F61A",
                            border: matchingRes.status === "checked_in" ? "1px solid #D97757" : "1px solid #3B82F6",
                            color: matchingRes.status === "checked_in" ? "#D97757" : "#3B82F6",
                            borderRadius: "0.375rem",
                            padding: "0.5rem 0.25rem",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                          }}
                        >
                          {matchingRes.customer_name ? matchingRes.customer_name : "Walk-in Guest"}
                        </div>
                      ) : (
                        <div
                          style={{
                            background: "var(--surface-2)",
                            borderRadius: "0.375rem",
                            padding: "0.5rem 0.25rem",
                            fontSize: "0.75rem",
                            color: "var(--text-secondary)",
                          }}
                        >
                          Free
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Stay Occupancy Calendar | BusinessKit",
};

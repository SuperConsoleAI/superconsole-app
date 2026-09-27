// src/routes/dashboard/shop/stays/checkin/index.tsx
//
// Today's Arrivals & Front Desk Check-in View — Path: /dashboard/shop/stays/checkin

import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LuLogIn } from "@qwikest/icons/lucide";
import { StaysContext } from "~/routes/dashboard/shop/stays/layout";
import { CheckInSlideOver } from "~/components/shop/stays/CheckInSlideOver";
import type { StayReservation } from "~/components/shop/stays/RoomLayoutGrid";

export default component$(() => {
  const ctx = useContext(StaysContext);
  const showCheckInModal = useSignal(false);
  const selectedRes = useSignal<StayReservation | null>(null);

  // Today arrivals = confirmed reservations
  const arrivals = ctx.reservations.filter((r) => r.status === "confirmed");

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Today's Arrivals & Check-In Desk
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Front desk portal to collect guest ID proofs and check in arriving guests.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--surface-1)", borderRadius: "0.75rem", border: "1px solid var(--border)", overflow: "hidden" }}>
        {arrivals.length === 0 ? (
          <div style={{ padding: "3.5rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <LuLogIn style="width:2.5rem;height:2.5rem;margin-bottom:0.75rem;opacity:0.5;" />
            <h4 style={{ margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>No Pending Arrivals</h4>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>All expected guests for today have been checked in.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "0.875rem 1rem" }}>Guest Name</th>
                <th style={{ padding: "0.875rem 1rem" }}>Room</th>
                <th style={{ padding: "0.875rem 1rem" }}>Check-in Date</th>
                <th style={{ padding: "0.875rem 1rem" }}>Party</th>
                <th style={{ padding: "0.875rem 1rem", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {arrivals.map((res) => {
                const startDate = new Date(res.slot_start * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

                return (
                  <tr key={res.id} style={{ borderBottom: "1px solid var(--border)", fontSize: "0.875rem" }}>
                    <td style={{ padding: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                      {res.customer_name || "Guest"}
                    </td>
                    <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                      {res.room_name || "Room Assigned"}
                    </td>
                    <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                      {startDate}
                    </td>
                    <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                      {res.party_size} Guest(s)
                    </td>
                    <td style={{ padding: "1rem", textAlign: "right" }}>
                      <button
                        type="button"
                        onClick$={() => {
                          selectedRes.value = res;
                          showCheckInModal.value = true;
                        }}
                        style={{
                          height: "2rem",
                          padding: "0 0.875rem",
                          borderRadius: "0.375rem",
                          background: "var(--button-primary-bg)",
                          color: "var(--button-primary-text)",
                          border: "none",
                          fontWeight: 600,
                          fontSize: "0.8125rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <LuLogIn style="width:0.875rem;height:0.875rem;" />
                        Check-In Guest
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <CheckInSlideOver
        open={showCheckInModal}
        reservation={selectedRes.value}
        onCheckedIn$={$(async () => {
          await ctx.loadData();
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Check-In Desk | BusinessKit",
};

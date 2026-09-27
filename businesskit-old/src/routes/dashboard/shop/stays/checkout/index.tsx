// src/routes/dashboard/shop/stays/checkout/index.tsx
//
// Today's Departures & Folio Settlement View — Path: /dashboard/shop/stays/checkout

import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LuLogOut } from "@qwikest/icons/lucide";
import { StaysContext } from "~/routes/dashboard/shop/stays/layout";
import { CheckOutSlideOver } from "~/components/shop/stays/CheckOutSlideOver";
import type { StayFolio } from "~/components/shop/stays/FolioDetailSlideOver";

export default component$(() => {
  const ctx = useContext(StaysContext);
  const showCheckOutModal = useSignal(false);
  const selectedFolio = useSignal<StayFolio | null>(null);

  // In-house stays with open folios
  const openFolios = ctx.folios.filter((f) => f.status === "open");

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Departures & Folio Settlement Desk
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Review itemized charges, record final payment, and check out departing guests.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--surface-1)", borderRadius: "0.75rem", border: "1px solid var(--border)", overflow: "hidden" }}>
        {openFolios.length === 0 ? (
          <div style={{ padding: "3.5rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <LuLogOut style="width:2.5rem;height:2.5rem;margin-bottom:0.75rem;opacity:0.5;" />
            <h4 style={{ margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>No Active In-House Stays</h4>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>All guest folios are currently settled.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "0.875rem 1rem" }}>Guest Name</th>
                <th style={{ padding: "0.875rem 1rem" }}>Room</th>
                <th style={{ padding: "0.875rem 1rem" }}>Items</th>
                <th style={{ padding: "0.875rem 1rem" }}>Total Balance</th>
                <th style={{ padding: "0.875rem 1rem", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {openFolios.map((fol) => (
                <tr key={fol.id} style={{ borderBottom: "1px solid var(--border)", fontSize: "0.875rem" }}>
                  <td style={{ padding: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {fol.guest_name || "In-House Guest"}
                  </td>
                  <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                    {fol.room_name || "Room Assigned"}
                  </td>
                  <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                    {fol.folio_lines.length} Line Item(s)
                  </td>
                  <td style={{ padding: "1rem", fontWeight: 700, color: "var(--brand-primary)" }}>
                    ₹{fol.total_charges.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "1rem", textAlign: "right" }}>
                    <button
                      type="button"
                      onClick$={() => {
                        selectedFolio.value = fol;
                        showCheckOutModal.value = true;
                      }}
                      style={{
                        height: "2rem",
                        padding: "0 0.875rem",
                        borderRadius: "0.375rem",
                        background: "#D97757",
                        color: "#fff",
                        border: "none",
                        fontWeight: 600,
                        fontSize: "0.8125rem",
                        cursor: "pointer",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "0.3rem",
                      }}
                    >
                      <LuLogOut style="width:0.875rem;height:0.875rem;" />
                      Settle & Check-Out
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <CheckOutSlideOver
        open={showCheckOutModal}
        folio={selectedFolio.value}
        onCheckedOut$={$(async () => {
          await ctx.loadData();
        })}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Check-Out Desk | BusinessKit",
};

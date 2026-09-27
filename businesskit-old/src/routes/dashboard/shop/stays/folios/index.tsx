// src/routes/dashboard/shop/stays/folios/index.tsx
//
// Guest Folios (Running Tabs) View — Path: /dashboard/shop/stays/folios

import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LuReceipt, LuLogOut } from "@qwikest/icons/lucide";
import { StaysContext } from "~/routes/dashboard/shop/stays/layout";
import { FolioDetailSlideOver } from "~/components/shop/stays/FolioDetailSlideOver";
import { CheckOutSlideOver } from "~/components/shop/stays/CheckOutSlideOver";
import type { StayFolio } from "~/components/shop/stays/FolioDetailSlideOver";

export default component$(() => {
  const ctx = useContext(StaysContext);
  const showFolioModal = useSignal(false);
  const showCheckOutModal = useSignal(false);
  const selectedFolio = useSignal<StayFolio | null>(null);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Guest Folios (Running Tabs)
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Track room charges, room service orders, and incidental expenses during stays.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--surface-1)", borderRadius: "0.75rem", border: "1px solid var(--border)", overflow: "hidden" }}>
        {ctx.folios.length === 0 ? (
          <div style={{ padding: "3.5rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <LuReceipt style="width:2.5rem;height:2.5rem;margin-bottom:0.75rem;opacity:0.5;" />
            <h4 style={{ margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>No Open Folios</h4>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>Check in a guest to open a new running folio tab.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "0.875rem 1rem" }}>Room</th>
                <th style={{ padding: "0.875rem 1rem" }}>Guest Name</th>
                <th style={{ padding: "0.875rem 1rem" }}>Charges</th>
                <th style={{ padding: "0.875rem 1rem" }}>Total Balance</th>
                <th style={{ padding: "0.875rem 1rem" }}>Status</th>
                <th style={{ padding: "0.875rem 1rem", textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {ctx.folios.map((fol) => (
                <tr key={fol.id} style={{ borderBottom: "1px solid var(--border)", fontSize: "0.875rem" }}>
                  <td style={{ padding: "1rem", fontWeight: 700, color: "var(--text-primary)" }}>
                    {fol.room_name || "Room"}
                  </td>
                  <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                    {fol.guest_name || "Guest"}
                  </td>
                  <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                    {fol.folio_lines.length} Line Item(s)
                  </td>
                  <td style={{ padding: "1rem", fontWeight: 700, color: "var(--brand-primary)" }}>
                    ₹{fol.total_charges.toLocaleString("en-IN")}
                  </td>
                  <td style={{ padding: "1rem" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        padding: "0.2rem 0.6rem",
                        borderRadius: "1rem",
                        background: fol.status === "open" ? "#D977571A" : "var(--surface-3)",
                        color: fol.status === "open" ? "#D97757" : "var(--text-secondary)",
                      }}
                    >
                      {fol.status === "open" ? "Open Tab" : "Settled"}
                    </span>
                  </td>
                  <td style={{ padding: "1rem", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: "0.5rem", justifyContent: "flex-end" }}>
                      <button
                        type="button"
                        onClick$={() => {
                          selectedFolio.value = fol;
                          showFolioModal.value = true;
                        }}
                        style={{
                          height: "2rem",
                          padding: "0 0.75rem",
                          borderRadius: "0.375rem",
                          background: "var(--surface-3)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border)",
                          fontWeight: 600,
                          fontSize: "0.8125rem",
                          cursor: "pointer",
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <LuReceipt style="width:0.875rem;height:0.875rem;" />
                        View / Add Charge
                      </button>
                      {fol.status === "open" && (
                        <button
                          type="button"
                          onClick$={() => {
                            selectedFolio.value = fol;
                            showCheckOutModal.value = true;
                          }}
                          style={{
                            height: "2rem",
                            padding: "0 0.75rem",
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
                          Check-Out
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <FolioDetailSlideOver
        open={showFolioModal}
        folio={selectedFolio.value}
        onFolioUpdated$={$(async () => {
          await ctx.loadData();
        })}
      />

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
  title: "Guest Folios | BusinessKit",
};

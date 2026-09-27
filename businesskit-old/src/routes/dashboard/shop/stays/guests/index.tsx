// src/routes/dashboard/shop/stays/guests/index.tsx
//
// Guest Directory & ID Proof CRM View — Path: /dashboard/shop/stays/guests

import { component$, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LuUsers } from "@qwikest/icons/lucide";
import { StaysContext } from "~/routes/dashboard/shop/stays/layout";

export default component$(() => {
  const ctx = useContext(StaysContext);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.25rem", fontWeight: 700, color: "var(--text-primary)" }}>
            Guest Directory & ID Proof Records
          </h2>
          <p style={{ margin: "0.25rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
            Compliance guest directory with stored ID proofs and stay contact information.
          </p>
        </div>
      </div>

      <div style={{ background: "var(--surface-1)", borderRadius: "0.75rem", border: "1px solid var(--border)", overflow: "hidden" }}>
        {ctx.guests.length === 0 ? (
          <div style={{ padding: "3.5rem", textAlign: "center", color: "var(--text-secondary)" }}>
            <LuUsers style="width:2.5rem;height:2.5rem;margin-bottom:0.75rem;opacity:0.5;" />
            <h4 style={{ margin: "0 0 0.25rem 0", color: "var(--text-primary)" }}>No Guests Registered</h4>
            <p style={{ margin: 0, fontSize: "0.875rem" }}>Guest ID proof records will appear here as guests check in.</p>
          </div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left" }}>
            <thead>
              <tr style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)", fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                <th style={{ padding: "0.875rem 1rem" }}>Guest Name</th>
                <th style={{ padding: "0.875rem 1rem" }}>ID Type</th>
                <th style={{ padding: "0.875rem 1rem" }}>ID Document Number</th>
                <th style={{ padding: "0.875rem 1rem" }}>Nationality</th>
                <th style={{ padding: "0.875rem 1rem" }}>Contact Details</th>
              </tr>
            </thead>
            <tbody>
              {ctx.guests.map((gst) => (
                <tr key={gst.id} style={{ borderBottom: "1px solid var(--border)", fontSize: "0.875rem" }}>
                  <td style={{ padding: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {gst.name}
                    {gst.is_primary === 1 && (
                      <span style={{ marginLeft: "0.5rem", fontSize: "0.7rem", background: "var(--brand-primary)", color: "#fff", padding: "0.1rem 0.4rem", borderRadius: "0.2rem" }}>
                        Primary
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "1rem", color: "var(--text-secondary)", textTransform: "capitalize" }}>
                    {gst.id_type || "Aadhaar"}
                  </td>
                  <td style={{ padding: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>
                    {gst.id_number || "—"}
                  </td>
                  <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                    {gst.nationality || "Indian"}
                  </td>
                  <td style={{ padding: "1rem", color: "var(--text-secondary)" }}>
                    {gst.phone || gst.email ? (
                      <div style={{ fontSize: "0.8125rem" }}>
                        {gst.phone && <div>{gst.phone}</div>}
                        {gst.email && <div style={{ color: "var(--text-secondary)" }}>{gst.email}</div>}
                      </div>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Guest Directory | BusinessKit",
};

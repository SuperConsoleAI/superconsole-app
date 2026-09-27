import { component$, useSignal, type PropFunction } from "@builder.io/qwik";
import { LuUsers, LuArmchair, LuUtensils, LuCheckCircle2, LuClock, LuFlame, LuAlertTriangle } from "@qwikest/icons/lucide";

export interface ShopTable {
  id: string;
  profile_id: string;
  location_type: string;
  name: string;
  number?: string;
  floor?: string;
  capacity: number;
  base_rate: number;
  amenities: string;
  status: string; // 'available' | 'occupied' | 'reserved' | 'maintenance'
  is_active: number;
  sort_order: number;
}

interface Props {
  tables: ShopTable[];
  onStatusChange$: PropFunction<(tableId: string, newStatus: string) => void>;
  onSendKOT$?: PropFunction<(table: ShopTable) => void>;
  onViewOrder$?: PropFunction<(table: ShopTable) => void>;
}

const statusBadge = (status: string) => {
  switch (status) {
    case "occupied":
      return { label: "Occupied", bg: "rgba(217,119,87,0.15)", color: "#D97757", border: "rgba(217,119,87,0.3)" };
    case "reserved":
      return { label: "Reserved", bg: "var(--surface-3)", color: "var(--text-secondary)", border: "var(--border)" };
    case "maintenance":
      return { label: "Cleaning / Off", bg: "var(--surface-3)", color: "var(--text-muted)", border: "var(--border)" };
    case "available":
    default:
      return { label: "Available", bg: "var(--success-soft, rgba(16,185,129,0.12))", color: "var(--success, #10b981)", border: "rgba(16,185,129,0.3)" };
  }
};

export const TableLayoutGrid = component$<Props>(({ tables, onStatusChange$, onSendKOT$, onViewOrder$ }) => {
  const confirmClearTable = useSignal<{ id: string; name: string } | null>(null);
  if (tables.length === 0) {
    return (
      <div
        style={{
          padding: "4rem 2rem",
          textAlign: "center",
          background: "var(--surface-2)",
          borderRadius: "0.75rem",
          border: "1px dashed var(--border)",
        }}
      >
        <LuArmchair style="width:3rem;height:3rem;color:var(--text-secondary);margin-bottom:1rem;" />
        <h3 style={{ margin: "0 0 0.5rem 0", fontSize: "1.125rem", fontWeight: 600, color: "var(--text-primary)" }}>
          No Dining Tables Setup
        </h3>
        <p style={{ color: "var(--text-secondary)", fontSize: "0.875rem", margin: 0 }}>
          Click "Add Table" to build your restaurant floor layout.
        </p>
      </div>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
        gap: "1rem",
      }}
    >
      {tables.map((tbl) => {
        const badge = statusBadge(tbl.status);
        return (
          <div
            key={tbl.id}
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              padding: "1.125rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.75rem",
              boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.04))",
              transition: "border-color 150ms ease, box-shadow 150ms ease",
              position: "relative",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <LuArmchair style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />
                <div>
                  <h4 style={{ margin: 0, fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)" }}>{tbl.name}</h4>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.15rem" }}>
                    {tbl.floor || "Main Floor"} {tbl.number ? `(${tbl.number})` : ""}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: "0.6875rem",
                  fontWeight: 600,
                  padding: "0.2rem 0.5rem",
                  borderRadius: "0.25rem",
                  background: badge.bg,
                  color: badge.color,
                  border: `1px solid ${badge.border}`,
                  letterSpacing: "0.02em",
                }}
              >
                {badge.label}
              </span>
            </div>

            {/* Meta */}
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
              <span style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <LuUsers style="width:0.875rem;height:0.875rem;" />
                {tbl.capacity} seats
              </span>
              {tbl.base_rate > 0 && <span>Min ₹{tbl.base_rate}</span>}
            </div>

            {/* Quick Actions */}
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "auto", paddingTop: "0.25rem" }}>
              {tbl.status === "available" && (
                <div style={{ display: "flex", gap: "0.4rem" }}>
                  <button
                    onClick$={() => onStatusChange$(tbl.id, "occupied")}
                    style={{
                      flex: 1,
                      height: "2.125rem",
                      borderRadius: "0.375rem",
                      border: "none",
                      background: "var(--button-primary-bg, #2563eb)",
                      color: "var(--button-primary-text, #fff)",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "0.3rem",
                    }}
                  >
                    <LuUtensils style="width:0.875rem;height:0.875rem;" />
                    Seat Guest
                  </button>
                  <button
                    onClick$={() => onStatusChange$(tbl.id, "reserved")}
                    title="Mark Reserved"
                    style={{
                      width: "2.125rem",
                      height: "2.125rem",
                      borderRadius: "0.375rem",
                      border: "1px solid var(--border)",
                      background: "var(--surface-1)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <LuClock style="width:0.875rem;height:0.875rem;" />
                  </button>
                </div>
              )}

              {tbl.status === "occupied" && (
                <>
                  {onViewOrder$ && (
                    <button
                      onClick$={() => onViewOrder$(tbl)}
                      style={{
                        width: "100%",
                        height: "2.125rem",
                        borderRadius: "0.375rem",
                        border: "1px solid var(--border)",
                        background: "var(--surface-3)",
                        color: "var(--text-primary)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.3rem",
                      }}
                    >
                      <LuUtensils style="width:0.875rem;height:0.875rem;" />
                      View Order & Bill
                    </button>
                  )}
                  <div style={{ display: "flex", gap: "0.4rem" }}>
                    {onSendKOT$ && (
                      <button
                        onClick$={() => onSendKOT$(tbl)}
                        style={{
                          flex: 1,
                          height: "2rem",
                          borderRadius: "0.375rem",
                          border: "none",
                          background: "#D97757",
                          color: "#ffffff",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "0.3rem",
                        }}
                      >
                        <LuFlame style="width:0.875rem;height:0.875rem;" />
                        + KOT
                      </button>
                    )}
                    <button
                      type="button"
                      onClick$={() => {
                        confirmClearTable.value = { id: tbl.id, name: tbl.name };
                      }}
                      style={{
                        flex: 1,
                        height: "2rem",
                        borderRadius: "0.375rem",
                        border: "1px solid var(--border)",
                        background: "var(--surface-1)",
                        color: "var(--text-secondary)",
                        fontSize: "0.75rem",
                        fontWeight: 600,
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "0.3rem",
                      }}
                    >
                      <LuCheckCircle2 style={{ width: "0.875rem", height: "0.875rem" }} />
                      Clear
                    </button>
                  </div>
                </>
              )}

              {tbl.status === "reserved" && (
                <button
                  type="button"
                  onClick$={() => onStatusChange$(tbl.id, "occupied")}
                  style={{
                    flex: 1,
                    height: "2.125rem",
                    borderRadius: "0.375rem",
                    border: "none",
                    background: "#D97757",
                    color: "#ffffff",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  Check In Guest
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* In-App Confirmation Modal */}
      {confirmClearTable.value && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "1rem",
          }}
        >
          <div
            style={{
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              borderRadius: "0.75rem",
              padding: "1.5rem",
              maxWidth: "420px",
              width: "100%",
              boxShadow: "var(--shadow-xl, 0 20px 25px -5px rgba(0,0,0,0.5))",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", gap: "0.875rem", marginBottom: "1rem" }}>
              <div
                style={{
                  padding: "0.6rem",
                  borderRadius: "0.5rem",
                  background: "var(--warning-soft, rgba(245,158,11,0.15))",
                  color: "var(--warning, #f59e0b)",
                  flexShrink: 0,
                }}
              >
                <LuAlertTriangle style={{ width: "1.5rem", height: "1.5rem" }} />
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ margin: 0, fontSize: "1.0625rem", fontWeight: 700, color: "var(--text-primary)" }}>
                  Clear {confirmClearTable.value.name}?
                </h3>
                <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.8125rem", color: "var(--text-secondary)", lineHeight: 1.4 }}>
                  Are you sure you want to vacate and reset this table? Make sure the bill has been generated and settled before clearing.
                </p>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "1.5rem" }}>
              <button
                type="button"
                onClick$={() => (confirmClearTable.value = null)}
                style={{
                  padding: "0.5rem 1rem",
                  borderRadius: "0.375rem",
                  border: "1px solid var(--border)",
                  background: "var(--surface-1)",
                  color: "var(--text-primary)",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                Cancel
              </button>

              <button
                type="button"
                onClick$={async () => {
                  const target = confirmClearTable.value;
                  confirmClearTable.value = null;
                  if (target) {
                    await onStatusChange$(target.id, "available");
                  }
                }}
                style={{
                  padding: "0.5rem 1.125rem",
                  borderRadius: "0.375rem",
                  border: "none",
                  background: "var(--error, #ef4444)",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "0.8125rem",
                  cursor: "pointer",
                }}
              >
                Yes, Clear Table
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

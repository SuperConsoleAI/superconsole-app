// src/components/shop/restaurant/KOTQueueCard.tsx
//
// WHAT: Kitchen Display Screen (KDS) card component for live KOT tickets.
//       Uses BusinessKit design system tokens (--surface-1/2/3, --border, --text-primary/secondary)
//       for seamless appearance in dark and light modes.

import { component$, type PropFunction } from "@builder.io/qwik";
import { LuFlame, LuCheck, LuClock, LuUtensils } from "@qwikest/icons/lucide";

export interface KOTLine {
  id: string;
  item_id: string;
  item_name: string;
  qty: number;
  unit_price?: number;
  notes?: string;
}

export interface ShopKOT {
  id: string;
  profile_id: string;
  doc_number: string;
  location_id?: string;
  location_name?: string;
  waiter_name?: string;
  status: string; // 'pending' | 'cooking' | 'ready' | 'served' | 'cancelled'
  lines: KOTLine[];
  notes?: string;
  created_at: number;
}

interface Props {
  kot: ShopKOT;
  onUpdateStatus$: PropFunction<(kotId: string, newStatus: string) => void>;
}

const statusBadge = (status: string) => {
  switch (status) {
    case "cooking":
      return {
        bg: "var(--warning-soft, rgba(245,158,11,0.12))",
        border: "rgba(245,158,11,0.3)",
        text: "var(--warning, #f59e0b)",
        label: "Cooking",
      };
    case "ready":
      return {
        bg: "var(--success-soft, rgba(16,185,129,0.12))",
        border: "rgba(16,185,129,0.3)",
        text: "var(--success, #10b981)",
        label: "Ready to Serve",
      };
    case "served":
      return {
        bg: "var(--surface-3)",
        border: "var(--border)",
        text: "var(--text-secondary)",
        label: "Served",
      };
    case "pending":
    default:
      return {
        bg: "var(--error-soft, rgba(239,68,68,0.12))",
        border: "rgba(239,68,68,0.3)",
        text: "var(--error, #ef4444)",
        label: "Pending",
      };
  }
};

export const KOTQueueCard = component$<Props>(({ kot, onUpdateStatus$ }) => {
  const badge = statusBadge(kot.status);
  const timeFormatted = new Date(kot.created_at * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--border)",
        borderRadius: "0.75rem",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        boxShadow: "var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.1))",
        transition: "border-color 150ms ease",
      }}
    >
      {/* Ticket Header */}
      <div
        style={{
          background: "var(--surface-3)",
          padding: "0.875rem 1.125rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <LuFlame style={{ width: "1.25rem", height: "1.25rem", color: badge.text, flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: "1.125rem", color: "var(--text-primary)", lineHeight: 1.2 }}>
              {kot.location_name || "Takeaway / Delivery"}
            </div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
              {kot.doc_number}
              {kot.waiter_name ? ` • Waiter: ${kot.waiter_name}` : ""}
            </div>
          </div>
        </div>

        <div style={{ textAlign: "right" }}>
          <span
            style={{
              fontSize: "0.6875rem",
              fontWeight: 700,
              padding: "0.2rem 0.55rem",
              borderRadius: "0.25rem",
              background: badge.bg,
              color: badge.text,
              border: `1px solid ${badge.border}`,
              display: "inline-block",
              letterSpacing: "0.02em",
            }}
          >
            {badge.label}
          </span>
          <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: "0.25rem" }}>
            <LuClock style={{ width: "0.75rem", height: "0.75rem" }} />
            {timeFormatted}
          </div>
        </div>
      </div>

      {/* Items List */}
      <div style={{ padding: "1.125rem", flex: 1, display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {kot.lines.map((item, idx) => (
          <div
            key={idx}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontSize: "0.875rem",
              paddingBottom: "0.5rem",
              borderBottom: idx < kot.lines.length - 1 ? "1px dashed var(--border)" : "none",
            }}
          >
            <div style={{ flex: 1, minWidth: 0, paddingRight: "0.5rem" }}>
              <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {item.item_name}
              </div>
              {item.notes && (
                <div style={{ fontSize: "0.75rem", color: "var(--warning, #f59e0b)", marginTop: "0.15rem" }}>
                  Note: {item.notes}
                </div>
              )}
            </div>
            <span
              style={{
                fontWeight: 700,
                background: "var(--surface-3)",
                color: "var(--text-primary)",
                border: "1px solid var(--border)",
                padding: "0.2rem 0.55rem",
                borderRadius: "0.25rem",
                fontSize: "0.8125rem",
              }}
            >
              x{item.qty}
            </span>
          </div>
        ))}

        {kot.notes && (
          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--warning, #f59e0b)",
              marginTop: "0.5rem",
              background: "var(--surface-3)",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.375rem",
              border: "1px dashed var(--border)",
            }}
          >
            Special Note: {kot.notes}
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div
        style={{
          padding: "0.875rem 1.125rem",
          borderTop: "1px solid var(--border)",
          background: "var(--surface-2)",
          display: "flex",
          gap: "0.5rem",
        }}
      >
        {kot.status === "pending" && (
          <button
            type="button"
            onClick$={() => onUpdateStatus$(kot.id, "cooking")}
            style={{
              flex: 1,
              height: "2.375rem",
              borderRadius: "0.375rem",
              border: "none",
              background: "var(--warning, #f59e0b)",
              color: "#14161a",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
            }}
          >
            <LuFlame style={{ width: "1rem", height: "1rem" }} />
            Start Cooking
          </button>
        )}

        {kot.status === "cooking" && (
          <button
            type="button"
            onClick$={() => onUpdateStatus$(kot.id, "ready")}
            style={{
              flex: 1,
              height: "2.375rem",
              borderRadius: "0.375rem",
              border: "none",
              background: "var(--success, #10b981)",
              color: "#ffffff",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
            }}
          >
            <LuCheck style={{ width: "1rem", height: "1rem" }} />
            Mark Ready
          </button>
        )}

        {kot.status === "ready" && (
          <button
            type="button"
            onClick$={() => onUpdateStatus$(kot.id, "served")}
            style={{
              flex: 1,
              height: "2.375rem",
              borderRadius: "0.375rem",
              border: "1px solid var(--border)",
              background: "var(--surface-2)",
              color: "var(--text-primary)",
              fontWeight: 600,
              fontSize: "0.8125rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.4rem",
            }}
          >
            <LuUtensils style={{ width: "1rem", height: "1rem" }} />
            Clear / Served
          </button>
        )}
      </div>
    </div>
  );
});

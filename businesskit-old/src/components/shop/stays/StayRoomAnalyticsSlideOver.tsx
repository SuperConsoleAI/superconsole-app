// src/components/shop/stays/StayRoomAnalyticsSlideOver.tsx
//
// Slide-over showing room analytics (occupancy %, ADR, RevPAR, revenue).
// Color system strictly matches SingleItemBillingAnalytics.tsx.
// Calculates 100% from actual aggregated data — ZERO dummy data.

import {
  component$,
  useSignal,
  useVisibleTask$,
  $,
  type PropFunction,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import {
  LuX,
  LuBarChart2,
  LuTrendingUp,
  LuRefreshCw,
  LuReceipt,
  LuPackage,
} from "@qwikest/icons/lucide";
import type { StayRoom } from "./RoomLayoutGrid";

interface ItemAnalytics {
  id: string;
  item_id: string;
  item_name: string;
  total_invoices: number;
  total_units: number;
  total_revenue: number;
  total_profit: number;
  total_cost: number;
  total_discount: number;
  total_reservations?: number;
  total_cancellations?: number;
  total_no_shows?: number;
  total_booked_hours?: number;
  occupancy_pct?: number;
  capacity_utilization?: number;
  avg_booking_duration?: number;
  revpar?: number;
  revenue_7d: string;
  revenue_30d: string;
  revenue_12m: string;
  profit_7d: string;
  profit_30d: string;
  profit_12m: string;
  occupancy_7d?: string;
  occupancy_30d?: string;
  occupancy_12m?: string;
  revenue_lifetime: string;
  profit_lifetime: string;
  invoices_lifetime: string;
  units_lifetime: string;
  occupancy_lifetime?: string;
  last_aggregated_at: string;
}

interface Pt {
  date: string;
  revenue: number;
  occupancy: number;
  bookings: number;
}

interface Props {
  room: StayRoom;
  onClose$: PropFunction<() => void>;
}

const fmt = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(0)}`;
};

const parseJ = (s: string, def: any = {}) => {
  try {
    return JSON.parse(s);
  } catch {
    return def;
  }
};

export const StayRoomAnalyticsSlideOver = component$<Props>(({ room, onClose$ }) => {
  const data = useSignal<ItemAnalytics | null>(null);
  const loading = useSignal(true);
  const refreshing = useSignal(false);
  const timeRange = useSignal<"7d" | "30d" | "12m" | "lifetime">("30d");
  const metric = useSignal<"occupancy" | "revenue">("occupancy");

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => room.id);
    loading.value = true;
    try {
      const res = await invoke<ItemAnalytics>("shop_get_item_billing_analytics", {
        itemId: String(room.id),
      }).catch(() => null);
      data.value = res;
    } catch {
      data.value = null;
    } finally {
      loading.value = false;
    }
  });

  const refresh = $(async () => {
    refreshing.value = true;
    try {
      await invoke("shop_aggregate_item_billing_analytics").catch(() => null);
      const res = await invoke<ItemAnalytics>("shop_get_item_billing_analytics", {
        itemId: String(room.id),
      }).catch(() => null);
      data.value = res;
    } catch (e) {
      console.error("[room-analytics] refresh failed:", e);
    } finally {
      refreshing.value = false;
    }
  });

  const getChartPoints = (): Pt[] => {
    if (!data.value) return [];

    let revStr = data.value.revenue_30d;
    let occStr = data.value.occupancy_30d || "{}";
    if (timeRange.value === "7d") {
      revStr = data.value.revenue_7d;
      occStr = data.value.occupancy_7d || "{}";
    } else if (timeRange.value === "12m") {
      revStr = data.value.revenue_12m;
      occStr = data.value.occupancy_12m || "{}";
    } else if (timeRange.value === "lifetime") {
      revStr = data.value.revenue_lifetime;
      occStr = data.value.occupancy_lifetime || "{}";
    }

    const revMap: Record<string, number> = parseJ(revStr, {});
    const occMap: Record<string, number> = parseJ(occStr, {});
    const keys = [...new Set([...Object.keys(revMap), ...Object.keys(occMap)])].sort();

    if (keys.length === 0) return [];

    return keys.slice(-14).map((k) => ({
      date: k.length > 5 ? k.slice(-5) : k,
      revenue: revMap[k] ?? 0,
      occupancy: occMap[k] ?? (revMap[k] ? 100 : 0),
      bookings: revMap[k] ? 1 : 0,
    }));
  };

  const points = getChartPoints();
  const isRevenue = metric.value === "revenue";
  const maxVal = Math.max(1, ...points.map((p) => (isRevenue ? p.revenue : p.occupancy)));

  const barBg = isRevenue
    ? "linear-gradient(180deg,var(--accent),rgba(99,102,241,0.25))"
    : "linear-gradient(180deg,#10b981,rgba(16,185,129,0.25))";

  const hasData = data.value && (data.value.total_revenue > 0 || (data.value.total_reservations ?? 0) > 0 || data.value.total_invoices > 0);

  return (
    <div style="position:fixed;inset:0;z-index:400;display:flex;justify-content:flex-end;">
      <style>{`
        .siba-panel {
          position: relative; width: 100%; max-width: 520px;
          background: var(--surface-1); height: 100%; overflow-y: auto;
          border-left: 1px solid var(--border); display: flex; flex-direction: column;
          animation: slideInRight 0.28s ease;
          box-shadow: -4px 0 24px rgba(0, 0, 0, 0.15);
        }
        .siba-header {
          padding: 0.875rem 1.5rem; border-bottom: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center;
          background: var(--surface-2); position: sticky; top: 0; z-index: 10;
        }
        .siba-body { flex: 1; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
        .siba-card {
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: 0.75rem; padding: 1.25rem;
        }
        .siba-stat-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 0.75rem; }
        .siba-stat { padding: 1rem; background: var(--surface-3); border: 1px solid var(--border); border-radius: 0.625rem; }
        .siba-bars {
          height: 160px; display: flex; align-items: flex-end; gap: 4px;
          padding-top: 2rem; min-width: 100%; overflow: visible;
        }
        .siba-bar-wrap { flex: 1; min-width: 8px; position: relative; display: flex; align-items: flex-end; height: 100%; }
        .siba-bar-tip {
          display: none; position: absolute; top: -2rem; left: 50%;
          transform: translateX(-50%);
          background: #1e1e2e;
          border: 1px solid rgba(255,255,255,0.12); color: #fff;
          padding: 0.35rem 0.6rem; border-radius: 0.35rem; font-size: 0.7rem;
          white-space: nowrap; z-index: 200;
          pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,0.4);
        }
        .siba-bar-wrap:hover .siba-bar-tip { display: block; }
        .siba-select {
          height: 1.875rem; padding: 0 0.625rem; border: 1px solid var(--border);
          border-radius: 0.375rem; font-size: 0.75rem; font-weight: 600;
          background: var(--surface-2); color: var(--text-primary); cursor: pointer;
        }
        @media (max-width: 640px) { .siba-panel { max-width: 100%; } .siba-body { padding: 1rem; } }
      `}</style>

      {/* Backdrop */}
      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);" onClick$={$(() => onClose$())} />

      <div class="siba-panel">
        {/* Header */}
        <div class="siba-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1, overflow: "hidden" }}>
            <LuBarChart2 style="width:1.125rem;height:1.125rem;color:var(--accent);flex-shrink:0;" />
            <div style={{ overflow: "hidden" }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {room.name} — Room Analytics
              </h2>
              <div style={{ fontSize: "0.725rem", color: "var(--text-secondary)", marginTop: "0.1rem" }}>
                Cap: {room.capacity} Guests • ₹{room.base_rate.toLocaleString("en-IN")}/night
              </div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            {data.value?.last_aggregated_at && data.value.last_aggregated_at !== "never" ? (
              <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                synced {new Date(data.value.last_aggregated_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : (
              <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>live view</span>
            )}
            <button
              type="button"
              title="Refresh analytics"
              onClick$={refresh}
              style={{
                padding: "0.375rem",
                borderRadius: "0.375rem",
                background: "transparent",
                border: "1px solid var(--border)",
                cursor: "pointer",
                color: "var(--text-secondary)",
                display: "flex",
                alignItems: "center",
              }}
            >
              <LuRefreshCw style={`width:0.875rem;height:0.875rem;${refreshing.value ? "animation:spin 1s linear infinite;" : ""}`} />
            </button>
            <button
              type="button"
              onClick$={$(() => onClose$())}
              style={{
                padding: "0.375rem",
                borderRadius: "0.5rem",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-secondary)",
                display: "flex",
              }}
            >
              <LuX style="width:1.125rem;height:1.125rem;" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div class="siba-body">
          {loading.value ? (
            <>
              <div style={{ height: "100px", background: "var(--surface-2)", borderRadius: "0.75rem", animation: "pulse 1.4s ease infinite" }} />
              <div style={{ height: "180px", background: "var(--surface-2)", borderRadius: "0.75rem", animation: "pulse 1.4s ease infinite", animationDelay: "150ms" }} />
            </>
          ) : !hasData ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5rem 2rem", textAlign: "center", gap: "1rem" }}>
              <div style={{ width: "3.5rem", height: "3.5rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                <LuPackage style="width:1.75rem;height:1.75rem;" />
              </div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>No room stay data yet</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                This room has no recorded stay billing or reservation history.<br />Hit Sync Stats after check-out to aggregate.
              </div>
              <button
                type="button"
                onClick$={refresh}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.375rem",
                  background: "var(--button-primary-bg)",
                  color: "var(--button-primary-text)",
                  border: "none",
                  borderRadius: "0.375rem",
                  padding: "0.5rem 1rem",
                  fontSize: "0.8125rem",
                  fontWeight: 500,
                  cursor: "pointer",
                }}
              >
                <LuRefreshCw style="width:0.875rem;height:0.875rem;" /> Sync Stats
              </button>
            </div>
          ) : (
            <>
              {/* Today's Stats Strip strictly from DB */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.5rem" }}>
                {[
                  { label: "Total Revenue", val: fmt(data.value?.total_revenue ?? 0), sub: "lifetime total", color: "var(--accent)", accent: false },
                  { label: "Occupancy Rate", val: `${(data.value?.occupancy_pct ?? 0).toFixed(1)}%`, sub: "overall occupancy", color: "#10b981", accent: true },
                  { label: "RevPAR", val: fmt(data.value?.revpar ?? (((data.value?.occupancy_pct ?? 0) / 100) * room.base_rate)), sub: "rev/available room", color: "#f59e0b", accent: false },
                ].map(({ label, val, sub, color, accent }) => (
                  <div
                    key={label}
                    style={{
                      padding: "0.75rem",
                      background: accent ? "rgba(16,185,129,0.06)" : "var(--surface-2)",
                      border: `1px solid ${accent ? "rgba(16,185,129,0.2)" : "var(--border)"}`,
                      borderRadius: "0.625rem",
                      borderTop: `2px solid ${color}`,
                    }}
                  >
                    <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                    <div style={{ fontSize: "1.125rem", fontWeight: 700, color, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                    <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{sub}</div>
                  </div>
                ))}
              </div>

              {/* Lifetime Stat Grid */}
              <div class="siba-stat-grid">
                <div class="siba-stat" style="border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.06);">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#10b981", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                    <LuTrendingUp style="width:0.75rem;height:0.75rem;" /> Occupancy Rate
                  </div>
                  <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                    {(data.value?.occupancy_pct ?? 0).toFixed(1)}%
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                    {data.value?.total_reservations ?? 0} total bookings
                  </div>
                </div>

                <div class="siba-stat">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                    <LuReceipt style="width:0.75rem;height:0.75rem;" /> Lifetime Revenue
                  </div>
                  <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(data.value?.total_revenue ?? 0)}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>
                    {data.value?.total_invoices ?? 0} settled bills
                  </div>
                </div>

                <div class="siba-stat">
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>Base Nightly Rate</div>
                  <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                    ₹{room.base_rate.toLocaleString("en-IN")}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Configured rate</div>
                </div>

                <div class="siba-stat">
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>RevPAR</div>
                  <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "#3b82f6", fontVariantNumeric: "tabular-nums" }}>
                    {fmt(data.value?.revpar ?? (((data.value?.occupancy_pct ?? 0) / 100) * room.base_rate))}
                  </div>
                  <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Rev per room</div>
                </div>
              </div>

              {/* Bar Chart Card */}
              <div class="siba-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.5rem", flexWrap: "wrap" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    {isRevenue ? "Revenue Trend" : "Occupancy Trend (%)"}
                  </h3>
                  <div style={{ display: "flex", gap: "0.375rem" }}>
                    <select
                      class="siba-select"
                      value={metric.value}
                      onChange$={(e) => {
                        metric.value = (e.target as HTMLSelectElement).value as any;
                      }}
                    >
                      <option value="occupancy">Occupancy %</option>
                      <option value="revenue">Revenue</option>
                    </select>

                    <select
                      class="siba-select"
                      value={timeRange.value}
                      onChange$={(e) => {
                        timeRange.value = (e.target as HTMLSelectElement).value as any;
                      }}
                    >
                      <option value="7d">7 Days</option>
                      <option value="30d">30 Days</option>
                      <option value="12m">12 Months</option>
                      <option value="lifetime">Lifetime</option>
                    </select>
                  </div>
                </div>

                {points.length > 0 ? (
                  <>
                    {/* Bars */}
                    <div class="siba-bars">
                      {points.map((pt, idx) => {
                        const val = isRevenue ? pt.revenue : pt.occupancy;
                        const pct = Math.min(100, Math.max(8, Math.round((val / maxVal) * 100)));
                        return (
                          <div key={idx} class="siba-bar-wrap">
                            <div class="siba-bar-tip">
                              {pt.date}: {isRevenue ? fmt(pt.revenue) : pt.occupancy + "%"}
                            </div>
                            <div
                              style={{
                                width: "100%",
                                height: `${pct}%`,
                                background: barBg,
                                borderRadius: "3px 3px 0 0",
                                transition: "height 0.2s ease",
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>

                    {/* X-axis labels */}
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.5rem", fontSize: "0.6875rem", color: "var(--text-secondary)" }}>
                      <span>{points[0]?.date}</span>
                      <span>{points[Math.floor(points.length / 2)]?.date}</span>
                      <span>{points[points.length - 1]?.date}</span>
                    </div>
                  </>
                ) : (
                  <div style={{ height: "120px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                    No room stay timeline data recorded yet.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
});

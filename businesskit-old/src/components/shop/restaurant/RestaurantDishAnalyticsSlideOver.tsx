// src/components/shop/restaurant/RestaurantDishAnalyticsSlideOver.tsx
//
// Slide-over showing per-dish restaurant analytics, portion sales, food profit, KOT frequencies,
// dining channels (Dine-in vs Takeaway), and interactive 7d/30d/12m/lifetime charts.

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
  LuTrendingUp,
  LuRefreshCw,
  LuReceipt,
  LuUtensils,
  LuArmchair,
  LuShoppingBag,
} from "@qwikest/icons/lucide";
import type { ShopKOT } from "~/components/shop/restaurant/KOTQueueCard";

// ── Types ─────────────────────────────────────────────────────────────────────

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
  city_breakdown: string;
  state_breakdown: string;
  country_breakdown: string;
  revenue_lifetime: string;
  profit_lifetime: string;
  invoices_lifetime: string;
  units_lifetime: string;
  occupancy_lifetime?: string;
  last_aggregated_at: string;
}

interface Pt {
  date: string;
  revenue?: number;
  profit?: number;
  units?: number;
  invoices?: number;
  occupancy?: number;
}

type Props = {
  itemId: string;
  itemName: string;
  onClose$: PropFunction<() => void>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(0)}`;
};

const fmtU = (n: number) => (n % 1 === 0 ? String(n) : n.toFixed(1));
const parseJ = (s: string, def: any = []) => {
  try {
    return JSON.parse(s);
  } catch {
    return def;
  }
};

const lifetimeArr = (rStr: string, pStr: string, iStr = "{}", uStr = "{}", occStr = "{}"): Pt[] => {
  const r: Record<string, number> = parseJ(rStr, {});
  const p: Record<string, number> = parseJ(pStr, {});
  const inv: Record<string, number> = parseJ(iStr, {});
  const u: Record<string, number> = parseJ(uStr, {});
  const occ: Record<string, number> = parseJ(occStr, {});
  const yrs = [...new Set([...Object.keys(r), ...Object.keys(p), ...Object.keys(occ)])].sort();
  return yrs.map((y) => ({
    date: y,
    revenue: r[y] ?? 0,
    profit: p[y] ?? 0,
    invoices: inv[y] ?? 0,
    units: u[y] ?? 0,
    occupancy: occ[y] ?? 0,
  }));
};

const topGeo = (s: string, limit = 5): { name: string; val: number }[] => {
  const obj: Record<string, number> = parseJ(s, {});
  return Object.entries(obj)
    .map(([name, val]) => ({ name, val: val as number }))
    .sort((a, b) => b.val - a.val)
    .slice(0, limit);
};

// ── Component ─────────────────────────────────────────────────────────────────

export const RestaurantDishAnalyticsSlideOver = component$<Props>(({ itemId, itemName, onClose$ }) => {
  const data = useSignal<ItemAnalytics | null>(null);
  const kots = useSignal<ShopKOT[]>([]);
  const loading = useSignal(true);
  const refreshing = useSignal(false);
  const timeRange = useSignal<"7d" | "30d" | "12m" | "lifetime">("30d");
  const metric = useSignal<"revenue" | "profit" | "units" | "invoices" | "occupancy">("revenue");

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => itemId);
    loading.value = true;
    try {
      const [analyticsRes, kotRes] = await Promise.all([
        invoke<ItemAnalytics>("shop_get_item_billing_analytics", { itemId }).catch(() => null),
        invoke<ShopKOT[]>("shop_list_kots", {}).catch(() => [] as ShopKOT[]),
      ]);
      data.value = analyticsRes;
      kots.value = kotRes;
    } catch (e) {
      console.error("[dish-analytics] load failed:", e);
    } finally {
      loading.value = false;
    }
  });

  const refresh = $(async () => {
    refreshing.value = true;
    try {
      await invoke("shop_aggregate_item_billing_analytics");
      const [freshAnalytics, freshKots] = await Promise.all([
        invoke<ItemAnalytics>("shop_get_item_billing_analytics", { itemId }),
        invoke<ShopKOT[]>("shop_list_kots", {}).catch(() => [] as ShopKOT[]),
      ]);
      data.value = freshAnalytics;
      kots.value = freshKots;
    } catch (e) {
      console.error("[dish-analytics] refresh failed:", e);
    } finally {
      refreshing.value = false;
    }
  });

  // Calculate table preferences & dining channel from KOTs
  const dishKots = kots.value.filter((k) =>
    k.lines.some((l) => l.item_id === itemId || (l.item_name && l.item_name.toLowerCase() === itemName.toLowerCase()))
  );

  const tableCountMap: Record<string, number> = {};
  let dineInPortions = 0;
  let takeawayPortions = 0;

  for (const kot of dishKots) {
    const isTakeaway = (kot.location_name || "").toLowerCase().includes("takeaway") || (kot.location_name || "").toLowerCase().includes("delivery");
    for (const line of kot.lines) {
      if (line.item_id === itemId || (line.item_name && line.item_name.toLowerCase() === itemName.toLowerCase())) {
        if (isTakeaway) takeawayPortions += line.qty;
        else dineInPortions += line.qty;
      }
    }

    const loc = kot.location_name || "Dine-In";
    tableCountMap[loc] = (tableCountMap[loc] || 0) + 1;
  }

  const topTables = Object.entries(tableCountMap)
    .map(([tbl, count]) => ({ tbl, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 4);
  const maxTableCount = topTables[0]?.count || 1;

  return (
    <div style="position:fixed;inset:0;z-index:400;display:flex;justify-content:flex-end;">
      <style>{`
        .rdsa-panel {
          position: relative; width: 100%; max-width: 540px;
          background: var(--surface-1); height: 100%; overflow-y: auto;
          border-left: 1px solid var(--border); display: flex; flex-direction: column;
          animation: slideInRight 0.28s ease;
        }
        .rdsa-header {
          padding: 0.875rem 1.5rem; border-bottom: 1px solid var(--border);
          display: flex; justify-content: space-between; align-items: center;
          background: var(--surface-2); position: sticky; top: 0; z-index: 10;
        }
        .rdsa-body { flex: 1; padding: 1.5rem; display: flex; flex-direction: column; gap: 1.25rem; }
        .rdsa-card {
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: 0.75rem; padding: 1.25rem;
        }
        .rdsa-stat-grid { display: grid; grid-template-columns: repeat(2,1fr); gap: 0.75rem; }
        .rdsa-stat { padding: 1rem; background: var(--surface-3); border: 1px solid var(--border); border-radius: 0.625rem; }
        .rdsa-bars-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .rdsa-bars {
          height: 160px; display: flex; align-items: flex-end; gap: 3px;
          padding-top: 2.75rem; min-width: 100%; overflow: visible;
        }
        .rdsa-bar-wrap { flex: 1; min-width: 6px; position: relative; display: flex; align-items: flex-end; height: 100%; }
        .rdsa-bar-tip {
          display: none; position: absolute; top: 4px; left: 50%;
          transform: translateX(-50%);
          background: #1e1e2e;
          border: 1px solid rgba(255,255,255,0.15); color: #fff;
          padding: 0.35rem 0.6rem; border-radius: 0.35rem; font-size: 0.7rem;
          white-space: nowrap; z-index: 200;
          pointer-events: none; box-shadow: 0 4px 16px rgba(0,0,0,0.5);
        }
        .rdsa-bar-wrap:hover .rdsa-bar-tip { display: block; }
        .rdsa-select {
          height: 1.875rem; padding: 0 0.625rem; border: 1px solid var(--border);
          border-radius: 0.375rem; font-size: 0.75rem;
          background: var(--surface-2); color: var(--text-primary); cursor: pointer;
        }
        .rdsa-row { display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0; }
        .rdsa-bar-bg { height: 4px; background: var(--border); border-radius: 2px; margin-top: 0.2rem; overflow: hidden; }
        @media (max-width: 640px) { .rdsa-panel { max-width: 100%; } .rdsa-body { padding: 1rem; } }
      `}</style>

      {/* Backdrop */}
      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.5);" onClick$={$(() => onClose$())} />

      <div class="rdsa-panel">
        {/* Header */}
        <div class="rdsa-header">
          {/* Left: icon + name */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", minWidth: 0, flex: 1, overflow: "hidden" }}>
            <div style={{ padding: "0.4rem", borderRadius: "0.375rem", background: "var(--brand-primary-soft, rgba(99,102,241,0.12))", color: "var(--brand-primary)" }}>
              <LuUtensils style="width:1.125rem;height:1.125rem;flex-shrink:0;" />
            </div>
            <div style={{ minWidth: 0 }}>
              <h2 style={{ fontSize: "1rem", fontWeight: 700, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {itemName || "Dish Analytics"}
              </h2>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)" }}>
                Restaurant Menu Performance
              </div>
            </div>
          </div>

          {/* Right: synced time + refresh + close */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            {data.value?.last_aggregated_at && data.value.last_aggregated_at !== "never" ? (
              <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>
                synced {new Date(data.value.last_aggregated_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : (
              <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", whiteSpace: "nowrap" }}>never synced</span>
            )}
            <button
              type="button"
              title="Refresh analytics"
              onClick$={refresh}
              style={{ padding: "0.375rem", borderRadius: "0.375rem", background: "transparent", border: "1px solid var(--border)", cursor: "pointer", color: "var(--text-secondary)", display: "flex", alignItems: "center" }}
            >
              <LuRefreshCw style={`width:0.875rem;height:0.875rem;${refreshing.value ? "animation:spin 1s linear infinite;" : ""}`} />
            </button>
            <button type="button" onClick$={$(() => onClose$())} style={{ padding: "0.375rem", borderRadius: "0.5rem", background: "transparent", border: "none", cursor: "pointer", color: "var(--text-secondary)", display: "flex" }}>
              <LuX style="width:1.125rem;height:1.125rem;" />
            </button>
          </div>
        </div>

        <div class="rdsa-body">
          {loading.value ? (
            <>
              <div style={{ height: "100px", background: "var(--surface-2)", borderRadius: "0.75rem", animation: "pulse 1.4s ease infinite" }} />
              <div style={{ height: "200px", background: "var(--surface-2)", borderRadius: "0.75rem", animation: "pulse 1.4s ease infinite", animationDelay: "150ms" }} />
              <div style={{ height: "180px", background: "var(--surface-2)", borderRadius: "0.75rem", animation: "pulse 1.4s ease infinite", animationDelay: "300ms" }} />
            </>
          ) : !data.value || (data.value.total_invoices === 0 && data.value.total_revenue === 0 && dishKots.length === 0) ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5rem 2rem", textAlign: "center", gap: "1rem" }}>
              <div style={{ width: "3.5rem", height: "3.5rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                <LuUtensils style="width:1.75rem;height:1.75rem;" />
              </div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>No order history yet</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                This dish hasn't appeared in any settled bills or KOT orders yet.<br />Hit Refresh after taking orders to sync.
              </div>
              <button
                type="button"
                onClick$={refresh}
                style={{ display: "flex", alignItems: "center", gap: "0.375rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", padding: "0.5rem 1rem", fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}
              >
                <LuRefreshCw style="width:0.875rem;height:0.875rem;" /> Refresh Analytics
              </button>
            </div>
          ) : (() => {
            const d = data.value || {
              total_revenue: 0,
              total_profit: 0,
              total_units: 0,
              total_invoices: 0,
              revenue_7d: "[]",
              revenue_30d: "[]",
              revenue_12m: "[]",
              profit_7d: "[]",
              profit_30d: "[]",
              profit_12m: "[]",
              city_breakdown: "{}",
              state_breakdown: "{}",
              country_breakdown: "{}",
              revenue_lifetime: "{}",
              profit_lifetime: "{}",
              invoices_lifetime: "{}",
              units_lifetime: "{}",
              last_aggregated_at: "never",
            } as ItemAnalytics;

            const margin = d.total_revenue > 0 ? (d.total_profit / d.total_revenue) * 100 : 0;

            // Today's data from 7d array (or 30d fallback)
            const todayKey = new Date().toISOString().slice(0, 10);
            const todayPt = (() => {
              const arr7: Pt[] = parseJ(d.revenue_7d, []);
              const t = arr7.find((p: Pt) => p.date === todayKey);
              if (t) return t;
              const arr30: Pt[] = parseJ(d.revenue_30d, []);
              return arr30.find((p: Pt) => p.date === todayKey) ?? null;
            })();

            // Chart points
            const pts: Pt[] = (() => {
              if (timeRange.value === "lifetime")
                return lifetimeArr(d.revenue_lifetime, d.profit_lifetime, d.invoices_lifetime, d.units_lifetime, d.occupancy_lifetime || "{}");
              const rArr: Pt[] = parseJ(timeRange.value === "7d" ? d.revenue_7d : timeRange.value === "30d" ? d.revenue_30d : d.revenue_12m, []);
              const occArr: Pt[] = parseJ(timeRange.value === "7d" ? (d.occupancy_7d || "[]") : timeRange.value === "30d" ? (d.occupancy_30d || "[]") : (d.occupancy_12m || "[]"), []);
              const occMap: Record<string, number> = {};
              for (const o of occArr) occMap[o.date] = o.occupancy ?? 0;

              return rArr.map((pt: Pt) => ({
                date: pt.date,
                revenue: pt.revenue ?? 0,
                profit: pt.profit ?? 0,
                units: pt.units ?? 0,
                invoices: pt.invoices ?? 0,
                occupancy: pt.occupancy ?? occMap[pt.date] ?? 0,
              }));
            })();

            const isOccupancy = metric.value === "occupancy";
            const isInvoices = metric.value === "invoices";
            const isUnits = metric.value === "units";
            const isRevenue = metric.value === "revenue";
            const getVal = (pt: Pt) => (isOccupancy ? pt.occupancy ?? 0 : isInvoices ? pt.invoices ?? 0 : isUnits ? pt.units ?? 0 : isRevenue ? pt.revenue ?? 0 : pt.profit ?? 0);
            const maxVal = Math.max(...pts.map(getVal), 1);

            const barColor = isOccupancy ? "#D97757" : isInvoices ? "#f59e0b" : isUnits ? "#ec4899" : isRevenue ? "var(--brand-primary, #6366f1)" : "#10b981";
            const barBg = isOccupancy
              ? "linear-gradient(180deg,#D97757,rgba(217,119,87,0.25))"
              : isInvoices
              ? "linear-gradient(180deg,#f59e0b,rgba(245,158,11,0.25))"
              : isUnits
              ? "linear-gradient(180deg,#ec4899,rgba(236,72,153,0.25))"
              : isRevenue
              ? "linear-gradient(180deg,var(--brand-primary,#6366f1),rgba(99,102,241,0.25))"
              : "linear-gradient(180deg,#10b981,rgba(16,185,129,0.25))";

            const cities = topGeo(d.city_breakdown);

            return (
              <>
                {/* Today's stats strip */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.5rem" }}>
                  {[
                    { label: "Today Sales", val: todayPt ? fmt(todayPt.revenue ?? 0) : "—", sub: "revenue today", color: "var(--brand-primary)", accent: false },
                    { label: "Food Profit", val: todayPt && (todayPt.profit ?? 0) > 0 ? fmt(todayPt.profit ?? 0) : "—", sub: "profit today", color: "#10b981", accent: true },
                    { label: "Portions Sold", val: todayPt ? `${fmtU(todayPt.units ?? 0)} orders` : "0 orders", sub: "today", color: "#f59e0b", accent: false },
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
                      <div style={{ fontSize: "1.125rem", fontWeight: 700, color: val === "—" || val === "0 orders" ? "var(--text-secondary)" : color, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Lifetime Stat grid */}
                <div class="rdsa-stat-grid">
                  <div class="rdsa-stat">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                      <LuReceipt style="width:0.75rem;height:0.75rem;" /> Lifetime Sales
                    </div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.total_revenue)}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{d.total_invoices} settled bills</div>
                  </div>

                  <div class="rdsa-stat" style="border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.06);">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#10b981", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                      <LuTrendingUp style="width:0.75rem;height:0.75rem;" /> Food Profit
                    </div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: d.total_profit > 0 ? "#10b981" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{d.total_profit > 0 ? fmt(d.total_profit) : "—"}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{margin > 0 ? `${margin.toFixed(1)}% margin` : "raw cost tracked"}</div>
                  </div>

                  <div class="rdsa-stat">
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>Portions Served</div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)" }}>{fmtU(d.total_units || dishKots.length)}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{dishKots.length} KOT tickets</div>
                  </div>

                  <div class="rdsa-stat">
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>Avg Spend / Bill</div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {d.total_invoices > 0 ? fmt(d.total_revenue / d.total_invoices) : "—"}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>per order appearance</div>
                  </div>
                </div>

                {/* Occupancy & Bookings Card */}
                <div class="rdsa-card" style={{ padding: "1rem" }}>
                  <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                    <LuArmchair style="width:0.875rem;height:0.875rem;color:#D97757;" />
                    Occupancy & Book-Time Performance
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: "0.5rem" }}>
                    <div style={{ background: "var(--surface-1)", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>Occupancy Rate</div>
                      <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#D97757", marginTop: "0.15rem" }}>
                        {(d.occupancy_pct ?? 0) > 0 ? `${d.occupancy_pct}%` : "—"}
                      </div>
                    </div>
                    <div style={{ background: "var(--surface-1)", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>Booked Hours</div>
                      <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "var(--text-primary)", marginTop: "0.15rem" }}>
                        {(d.total_booked_hours ?? 0) > 0 ? `${d.total_booked_hours} hrs` : "—"}
                      </div>
                    </div>
                    <div style={{ background: "var(--surface-1)", padding: "0.6rem", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)" }}>Reservations / RevPAR</div>
                      <div style={{ fontSize: "1.125rem", fontWeight: 700, color: "#10b981", marginTop: "0.15rem" }}>
                        {(d.total_reservations ?? 0) > 0 ? `${d.total_reservations} res` : (d.revpar ?? 0) > 0 ? `₹${d.revpar}` : "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bar chart */}
                <div class="rdsa-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.5rem", flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                      {isOccupancy ? "Occupancy Rate %" : isInvoices ? "Bills Count" : isUnits ? "Portions Sold" : isRevenue ? "Dish Revenue" : "Food Profit"} Trend
                    </h3>
                    <div style={{ display: "flex", gap: "0.375rem" }}>
                      <select class="rdsa-select" value={metric.value} onChange$={(e) => { metric.value = (e.target as HTMLSelectElement).value as any; }}>
                        <option value="revenue">Revenue</option>
                        <option value="profit">Profit</option>
                        <option value="units">Portions</option>
                        <option value="invoices"># Bills</option>
                        <option value="occupancy">Occupancy %</option>
                      </select>
                      <select class="rdsa-select" value={timeRange.value} onChange$={(e) => { timeRange.value = (e.target as HTMLSelectElement).value as any; }}>
                        <option value="7d">7 Days</option>
                        <option value="30d">30 Days</option>
                        <option value="12m">12 Months</option>
                        <option value="lifetime">Lifetime</option>
                      </select>
                    </div>
                  </div>

                  {pts.length > 0 ? (
                    <>
                      <div class="rdsa-bars-scroll">
                        <div class="rdsa-bars">
                          {pts.map((pt: Pt, i: number) => {
                            const val = getVal(pt);
                            const h = maxVal > 0 ? Math.max((val / maxVal) * 130, val > 0 ? 3 : 0) : 0;
                            return (
                              <div key={i} class="rdsa-bar-wrap">
                                <div class="rdsa-bar-tip">
                                  <div style={{ fontWeight: 600, marginBottom: "0.15rem", fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>{pt.date}</div>
                                  <div style={{ fontWeight: 700 }}>
                                    {isOccupancy
                                      ? `${val}% occupancy`
                                      : isInvoices
                                      ? `${val} bill${val !== 1 ? "s" : ""}`
                                      : isUnits
                                      ? `${fmtU(val)} portions`
                                      : `₹${(val as number).toFixed(0)}`}
                                  </div>
                                  <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.5)", marginTop: "0.1rem" }}>
                                    {isOccupancy ? "occupancy rate" : isInvoices ? "bills" : isUnits ? "portions sold" : isRevenue ? "revenue" : "profit"}
                                  </div>
                                </div>
                                <div style={{ width: "100%", height: `${h}px`, borderRadius: "0.2rem 0.2rem 0 0", background: barBg, border: `1px solid ${barColor}`, opacity: 0.9 }} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Date labels */}
                      {pts.length > 1 && (
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.7rem", color: "var(--text-secondary)", paddingTop: "0.5rem", borderTop: "1px solid var(--border)" }}>
                          <span>{pts[0].date}</span>
                          <span>{pts[pts.length - 1].date}</span>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ height: "160px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                      No data for this range — click refresh
                    </div>
                  )}
                </div>

                {/* Restaurant Specific Breakdown: Dining Channels & Top Tables */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  {/* Dining Channels */}
                  <div class="rdsa-card" style={{ padding: "1rem" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <LuShoppingBag style="width:0.875rem;height:0.875rem;color:var(--brand-primary);" />
                      Order Channels
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                      <div>
                        <div class="rdsa-row">
                          <span style={{ fontSize: "0.75rem", color: "var(--text-primary)" }}>🍽️ Dine-In</span>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{dineInPortions} portions</span>
                        </div>
                        <div class="rdsa-bar-bg">
                          <div style={{ height: "100%", width: `${(dineInPortions + takeawayPortions > 0 ? (dineInPortions / (dineInPortions + takeawayPortions)) * 100 : 0).toFixed(1)}%`, background: "var(--brand-primary)", borderRadius: "2px" }} />
                        </div>
                      </div>
                      <div>
                        <div class="rdsa-row">
                          <span style={{ fontSize: "0.75rem", color: "var(--text-primary)" }}>🥡 Takeaway / Delivery</span>
                          <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>{takeawayPortions} portions</span>
                        </div>
                        <div class="rdsa-bar-bg">
                          <div style={{ height: "100%", width: `${(dineInPortions + takeawayPortions > 0 ? (takeawayPortions / (dineInPortions + takeawayPortions)) * 100 : 0).toFixed(1)}%`, background: "#f59e0b", borderRadius: "2px" }} />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Top Tables */}
                  <div class="rdsa-card" style={{ padding: "1rem" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                      <LuArmchair style="width:0.875rem;height:0.875rem;color:#10b981;" />
                      Top Tables Served
                    </div>
                    {topTables.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                        {topTables.map((t, i) => (
                          <div key={i}>
                            <div class="rdsa-row">
                              <span style={{ fontSize: "0.75rem", color: "var(--text-primary)", fontWeight: 500 }}>{t.tbl}</span>
                              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)" }}>{t.count} orders</span>
                            </div>
                            <div class="rdsa-bar-bg">
                              <div style={{ height: "100%", width: `${((t.count / maxTableCount) * 100).toFixed(1)}%`, background: "#10b981", borderRadius: "2px" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>No table logs yet</div>
                    )}
                  </div>
                </div>

                {/* Cities if available */}
                {cities.length > 0 && (
                  <div class="rdsa-card" style={{ padding: "1rem" }}>
                    <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.75rem" }}>
                      Top Customer Locations
                    </div>
                    {cities.map((g, i) => {
                      const max = cities[0]?.val ?? 1;
                      return (
                        <div key={i} style={{ marginBottom: "0.5rem" }}>
                          <div class="rdsa-row">
                            <span style={{ fontSize: "0.75rem", color: "var(--text-primary)" }}>{g.name}</span>
                            <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)" }}>{fmt(g.val)}</span>
                          </div>
                          <div class="rdsa-bar-bg">
                            <div style={{ height: "100%", width: `${((g.val / max) * 100).toFixed(1)}%`, background: "var(--accent)", borderRadius: "2px" }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
});

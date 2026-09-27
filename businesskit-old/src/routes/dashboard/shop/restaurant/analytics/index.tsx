// src/routes/dashboard/shop/restaurant/analytics/index.tsx
//
// Restaurant Analytics Page with:
// - Lifetime Sales, Profit, Average Table Spend, and Active Table Utilization
// - Interactive Bar Chart (7d / 30d / 12m / Lifetime) with Metric Type toggle (Revenue, Profit, Invoices, KOTs)
// - Restaurant Breakdown Cards: Top Selling Dishes, Dine-in vs Takeaway, Peak Dining Hours, Payment Modes, Table Performance

import { component$, useSignal, useStylesScoped$, $, useContext } from "@builder.io/qwik";
import { useNavigate, type DocumentHead } from "@builder.io/qwik-city";
import {
  LuArrowLeft,
  LuTrendingUp,
  LuReceipt,
  LuUtensils,
  LuArmchair,
  LuClock,
  LuDollarSign,
  LuCreditCard,
  LuRefreshCw,
} from "@qwikest/icons/lucide";
import { RestaurantContext } from "~/routes/dashboard/shop/restaurant/layout";

const STYLES = `
  .ra-wrap { max-width: 980px; margin: 0 auto; }
  .ra-stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 860px) { .ra-stat-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 480px) { .ra-stat-grid { grid-template-columns: 1fr; } }
  .ra-stat-card {
    padding: 1.25rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .ra-chart-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .ra-bars-scroll {
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
  }
  .ra-bars {
    height: 180px;
    display: flex;
    align-items: flex-end;
    gap: 3px;
    padding-top: 2.75rem;
    min-width: 100%;
    overflow: visible;
  }
  .ra-bar-wrap {
    flex: 1;
    min-width: 8px;
    position: relative;
    display: flex;
    align-items: flex-end;
    height: 100%;
    cursor: default;
  }
  .ra-bar-tip {
    display: none;
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e1e2e;
    border: 1px solid rgba(255,255,255,0.15);
    color: #fff;
    padding: 0.35rem 0.6rem;
    border-radius: 0.35rem;
    font-size: 0.7rem;
    white-space: nowrap;
    z-index: 200;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0,0,0,0.5);
  }
  .ra-bar-wrap:hover .ra-bar-tip { display: block; }
  .ra-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 640px) { .ra-grid-2 { grid-template-columns: 1fr; } }
  .ra-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 768px) { .ra-grid-3 { grid-template-columns: 1fr; } }
  .ra-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .ra-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0;
  }
  .ra-bar-bg {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    margin-top: 0.25rem;
    overflow: hidden;
  }
  .ra-select {
    height: 2rem;
    padding: 0 0.75rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    background: var(--surface-2);
    color: var(--text-primary);
    cursor: pointer;
  }
  .skeleton {
    background: var(--surface-2);
    border-radius: 0.75rem;
    animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
  }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
`;

interface Point {
  date: string;
  revenue: number;
  profit: number;
  invoices: number;
  kots: number;
  occupancy: number;
}

const fmt = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(0)}`;
};

export default component$(() => {
  useStylesScoped$(STYLES);
  const nav = useNavigate();
  const ctx = useContext(RestaurantContext);

  const refreshing = useSignal(false);

  // Time range & metric selector
  const timeRange = useSignal<"7d" | "30d" | "12m" | "lifetime">("30d");
  const metricType = useSignal<"revenue" | "profit" | "invoices" | "kots" | "occupancy">("revenue");

  const refreshData = $(async () => {
    refreshing.value = true;
    try {
      await ctx.refresh();
    } catch (e) {
      console.error("[restaurant/analytics] sync failed:", e);
    } finally {
      refreshing.value = false;
    }
  });

  // Totals calculations
  const totalRevenue = ctx.invoices.reduce((s: number, i: any) => s + (i.grand_total || 0), 0);
  const totalProfit = ctx.invoices.reduce((s: number, i: any) => s + (i.profit || 0), 0);
  const totalInvoices = ctx.invoices.length;
  const avgMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
  const avgTicket = totalInvoices > 0 ? totalRevenue / totalInvoices : 0;

  const totalSeats = ctx.tables.reduce((s: number, t: any) => s + (t.capacity || 0), 0);
  const occupiedSeats = ctx.tables.filter((t: any) => t.status === "occupied").reduce((s: number, t: any) => s + (t.capacity || 0), 0);
  const seatUtilPct = totalSeats > 0 ? (occupiedSeats / totalSeats) * 100 : 0;

  // Compute daily / monthly timeline points
  const points: Point[] = (() => {
    const map: Record<string, Point> = {};

    // Group invoices
    for (const inv of ctx.invoices) {
      const d = new Date(inv.doc_date * 1000);
      let key = "";
      if (timeRange.value === "7d" || timeRange.value === "30d") {
        key = d.toISOString().slice(5, 10); // MM-DD
      } else if (timeRange.value === "12m") {
        key = d.toISOString().slice(0, 7); // YYYY-MM
      } else {
        key = d.getFullYear().toString(); // YYYY
      }

      if (!map[key]) {
        map[key] = { date: key, revenue: 0, profit: 0, invoices: 0, kots: 0, occupancy: 0 };
      }
      map[key].revenue += inv.grand_total;
      map[key].profit += inv.profit || 0;
      map[key].invoices += 1;
    }

    // Group KOTs
    for (const kot of ctx.kots) {
      const d = new Date(kot.created_at * 1000);
      let key = "";
      if (timeRange.value === "7d" || timeRange.value === "30d") {
        key = d.toISOString().slice(5, 10);
      } else if (timeRange.value === "12m") {
        key = d.toISOString().slice(0, 7);
      } else {
        key = d.getFullYear().toString();
      }

      if (!map[key]) {
        map[key] = { date: key, revenue: 0, profit: 0, invoices: 0, kots: 0, occupancy: 0 };
      }
      map[key].kots += 1;
      map[key].occupancy = Math.min(100, Math.round((map[key].kots * 100) / Math.max(1, ctx.tables.length * 4)));
    }

    const sorted = Object.values(map).sort((a, b) => a.date.localeCompare(b.date));

    if (timeRange.value === "7d") return sorted.slice(-7);
    if (timeRange.value === "30d") return sorted.slice(-30);
    if (timeRange.value === "12m") return sorted.slice(-12);
    return sorted;
  })();

  const maxVal = Math.max(
    ...points.map((p) => {
      if (metricType.value === "revenue") return p.revenue;
      if (metricType.value === "profit") return p.profit;
      if (metricType.value === "invoices") return p.invoices;
      if (metricType.value === "occupancy") return p.occupancy;
      return p.kots;
    }),
    1
  );

  const len = points.length;
  const labels =
    len > 0
      ? ([points[0].date, len >= 7 ? points[Math.floor(len / 2)].date : null, len > 1 ? points[len - 1].date : null].filter(
          Boolean
        ) as string[])
      : [];

  // Top Dishes calculation from all KOT lines
  const dishSalesMap: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const kot of ctx.kots) {
    for (const line of kot.lines) {
      const key = line.item_name || line.item_id;
      if (!dishSalesMap[key]) {
        const itemObj = ctx.menuItems.find((i: any) => i.id === line.item_id || i.name === line.item_name);
        const price = itemObj ? Number(itemObj.price) || 0 : 0;
        dishSalesMap[key] = { name: line.item_name || "Dish", qty: 0, revenue: 0 };
        dishSalesMap[key].revenue += line.qty * price;
      } else {
        const itemObj = ctx.menuItems.find((i: any) => i.id === line.item_id || i.name === line.item_name);
        const price = itemObj ? Number(itemObj.price) || 0 : 0;
        dishSalesMap[key].revenue += line.qty * price;
      }
      dishSalesMap[key].qty += line.qty;
    }
  }

  const topDishes = Object.values(dishSalesMap)
    .sort((a: any, b: any) => b.qty - a.qty)
    .slice(0, 5);
  const maxDishQty = topDishes[0]?.qty || 1;

  // Service Mode Breakdown (Petpooja-style: Dine-In, Delivery, Takeaway, Drive-Thru)
  const serviceModeMap: Record<string, { label: string; icon: string; count: number; revenue: number; color: string }> = {
    dine_in: { label: "Dine-In", icon: "🍽️", count: 0, revenue: 0, color: "#6366f1" },
    delivery: { label: "Delivery", icon: "🛵", count: 0, revenue: 0, color: "#f59e0b" },
    takeaway: { label: "Takeaway", icon: "🛍️", count: 0, revenue: 0, color: "#10b981" },
    drive_thru: { label: "Drive-Thru", icon: "🚗", count: 0, revenue: 0, color: "#ec4899" },
  };

  let totalServiceOrders = 0;
  for (const inv of ctx.invoices) {
    const mode = ((inv as any).service_mode || "dine_in").toLowerCase();
    if (serviceModeMap[mode]) {
      serviceModeMap[mode].count += 1;
      serviceModeMap[mode].revenue += inv.grand_total;
    } else {
      serviceModeMap.dine_in.count += 1;
      serviceModeMap.dine_in.revenue += inv.grand_total;
    }
    totalServiceOrders += 1;
  }
  const dineInOrders = serviceModeMap.dine_in.count;
  const deliveryOrders = serviceModeMap.delivery.count;
  const takeawayOrders = serviceModeMap.takeaway.count;

  // Payment Modes
  const payModeMap: Record<string, number> = { cash: 0, upi: 0, card: 0 };
  for (const inv of ctx.invoices) {
    const mode = (inv.payment_mode || "cash").toLowerCase();
    if (mode in payModeMap) payModeMap[mode] += inv.grand_total;
    else payModeMap.cash += inv.grand_total;
  }
  const maxPay = Math.max(...Object.values(payModeMap), 1);

  // Peak Dining Hours
  const hourBuckets = [
    { label: "Morning Breakfast (7 AM - 11 AM)", count: 0 },
    { label: "Lunch Rush (12 PM - 3 PM)", count: 0 },
    { label: "Afternoon Tea & Snacks (4 PM - 6 PM)", count: 0 },
    { label: "Dinner Rush (7 PM - 11 PM)", count: 0 },
  ];
  for (const kot of ctx.kots) {
    const hr = new Date(kot.created_at * 1000).getHours();
    if (hr >= 7 && hr < 11) hourBuckets[0].count += 1;
    else if (hr >= 12 && hr < 16) hourBuckets[1].count += 1;
    else if (hr >= 16 && hr < 19) hourBuckets[2].count += 1;
    else if (hr >= 19 && hr <= 23) hourBuckets[3].count += 1;
  }
  const maxHourCount = Math.max(...hourBuckets.map((h) => h.count), 1);

  // Table Performance
  const tableStats = ctx.tables.map((tbl: any) => {
    const tblKots = ctx.kots.filter((k: any) => k.location_id === tbl.id || k.location_name === tbl.name);
    return {
      name: tbl.name,
      capacity: tbl.capacity,
      kotCount: tblKots.length,
      floor: tbl.floor || "Main Floor",
    };
  }).sort((a: any, b: any) => b.kotCount - a.kotCount).slice(0, 5);
  const maxTableKots = tableStats[0]?.kotCount || 1;

  return (
    <div style={{ padding: "1.5rem" }}>
      <div class="ra-wrap">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              onClick$={$(() => nav("/dashboard/shop/restaurant/"))}
              style={{
                background: "transparent",
                border: "none",
                color: "var(--text-secondary)",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.875rem",
                padding: "0.25rem",
              }}
            >
              <LuArrowLeft style="width:1rem;height:1rem;" />
              Restaurant
            </button>
            <span style={{ color: "var(--border)" }}>/</span>
            <h1 style={{ fontSize: "1.125rem", fontWeight: "600", color: "var(--text-primary)", margin: 0 }}>
              Restaurant Analytics & Sales
            </h1>
          </div>

          <button
            type="button"
            title="Refresh and aggregate analytics"
            onClick$={refreshData}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "0.375rem",
              background: "var(--surface-2)",
              border: "1px solid var(--border)",
              color: "var(--text-primary)",
              fontSize: "0.8125rem",
              fontWeight: 500,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            <LuRefreshCw style={`width:0.875rem;height:0.875rem;${refreshing.value ? "animation:spin 1s linear infinite;" : ""}`} />
            Sync Stats
          </button>
        </div>

        {/* Skeleton */}
        {ctx.loading ? (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: "1rem", marginBottom: "1rem" }}>
              <div class="skeleton" style={{ height: "100px" }} />
              <div class="skeleton" style={{ height: "100px", animationDelay: "150ms" }} />
              <div class="skeleton" style={{ height: "100px", animationDelay: "300ms" }} />
              <div class="skeleton" style={{ height: "100px", animationDelay: "450ms" }} />
            </div>
            <div class="skeleton" style={{ height: "320px", marginBottom: "1rem", animationDelay: "600ms" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem" }}>
              <div class="skeleton" style={{ height: "200px", animationDelay: "750ms" }} />
              <div class="skeleton" style={{ height: "200px", animationDelay: "900ms" }} />
              <div class="skeleton" style={{ height: "200px", animationDelay: "1050ms" }} />
            </div>
          </div>
        ) : (
          <>
            {/* 4 Core Stat Cards */}
            <div class="ra-stat-grid">
              <div class="ra-stat-card" style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3));">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  <LuReceipt style="width:0.875rem;height:0.875rem;" /> Lifetime Sales
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(totalRevenue)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {totalInvoices} settled bill{totalInvoices !== 1 ? "s" : ""}
                </div>
              </div>

              <div
                class="ra-stat-card"
                style="background: linear-gradient(145deg, rgba(16,185,129,0.12), rgba(16,185,129,0.06)); border-color: rgba(16,185,129,0.25);"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#10b981", fontSize: "0.8125rem" }}>
                  <LuTrendingUp style="width:0.875rem;height:0.875rem;" /> Lifetime Profit
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: "700", color: totalProfit > 0 ? "#10b981" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(totalProfit)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {totalProfit > 0 ? `${avgMargin.toFixed(1)}% food margin` : "raw cost tracked"}
                </div>
              </div>

              <div class="ra-stat-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  <LuDollarSign style="width:0.875rem;height:0.875rem;" /> Avg Ticket Value
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--text-primary)" }}>
                  {fmt(avgTicket)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Per guest invoice
                </div>
              </div>

              <div class="ra-stat-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  <LuArmchair style="width:0.875rem;height:0.875rem;" /> Table Capacity In Use
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--warning, #f59e0b)" }}>
                  {occupiedSeats} / {totalSeats}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {seatUtilPct.toFixed(0)}% live occupancy
                </div>
              </div>
            </div>

            {/* Interactive Bar Chart */}
            <div class="ra-chart-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: "600", margin: 0, color: "var(--text-primary)" }}>
                  {metricType.value === "revenue"
                    ? "Restaurant Revenue"
                    : metricType.value === "profit"
                    ? "Food Profit"
                    : metricType.value === "invoices"
                    ? "Settled Bills"
                    : metricType.value === "occupancy"
                    ? "Table Occupancy Rate"
                    : "KOT Orders"}{" "}
                  Trend
                </h3>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <select
                    class="ra-select"
                    value={metricType.value}
                    onChange$={(e) => {
                      metricType.value = (e.target as HTMLSelectElement).value as any;
                    }}
                  >
                    <option value="revenue">Revenue (₹)</option>
                    <option value="profit">Profit (₹)</option>
                    <option value="invoices"># Settled Bills</option>
                    <option value="kots"># KOT Tickets</option>
                    <option value="occupancy">Occupancy Rate (%)</option>
                  </select>
                  <select
                    class="ra-select"
                    value={timeRange.value}
                    onChange$={(e) => {
                      timeRange.value = (e.target as HTMLSelectElement).value as any;
                    }}
                  >
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="12m">Last 12 Months</option>
                    <option value="lifetime">Lifetime (Yearly)</option>
                  </select>
                </div>
              </div>

              {points.length > 0 ? (
                <>
                  <div class="ra-bars-scroll">
                    <div class="ra-bars">
                      {points.map((pt, i) => {
                        const val =
                          metricType.value === "revenue"
                            ? pt.revenue
                            : metricType.value === "profit"
                            ? pt.profit
                            : metricType.value === "invoices"
                            ? pt.invoices
                            : metricType.value === "occupancy"
                            ? pt.occupancy
                            : pt.kots;
                        const h = maxVal > 0 ? Math.max((val / maxVal) * 160, val > 0 ? 4 : 0) : 0;
                        const bg =
                          metricType.value === "invoices"
                            ? "linear-gradient(180deg,#f59e0b 0%,rgba(245,158,11,0.3) 100%)"
                            : metricType.value === "kots"
                            ? "linear-gradient(180deg,#ec4899 0%,rgba(236,72,153,0.3) 100%)"
                            : metricType.value === "occupancy"
                            ? "linear-gradient(180deg,#8b5cf6 0%,rgba(139,92,246,0.3) 100%)"
                            : metricType.value === "revenue"
                            ? "linear-gradient(180deg,var(--brand-primary,#6366f1) 0%,rgba(99,102,241,0.3) 100%)"
                            : "linear-gradient(180deg,#10b981 0%,rgba(16,185,129,0.3) 100%)";
                        const borderCol =
                          metricType.value === "invoices"
                            ? "#f59e0b"
                            : metricType.value === "kots"
                            ? "#ec4899"
                            : metricType.value === "occupancy"
                            ? "#8b5cf6"
                            : metricType.value === "revenue"
                            ? "var(--brand-primary,#6366f1)"
                            : "#10b981";

                        return (
                          <div key={i} class="ra-bar-wrap">
                            <div class="ra-bar-tip">
                              <div style={{ fontWeight: 600, marginBottom: "0.2rem", fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>
                                {pt.date}
                              </div>
                              <div style={{ fontWeight: 700 }}>
                                {metricType.value === "revenue" || metricType.value === "profit"
                                  ? `₹${val.toFixed(0)}`
                                  : metricType.value === "occupancy"
                                  ? `${val}% Occupancy`
                                  : `${val} ${metricType.value}`}
                              </div>
                              <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.5)", marginTop: "0.1rem" }}>
                                {metricType.value}
                              </div>
                            </div>
                            <div
                              style={{
                                width: "100%",
                                height: `${h}px`,
                                borderRadius: "0.25rem 0.25rem 0 0",
                                opacity: 0.9,
                                background: bg,
                                border: `1px solid ${borderCol}`,
                              }}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: "0.75rem",
                      color: "var(--text-secondary)",
                      paddingTop: "0.625rem",
                      borderTop: "1px solid var(--border)",
                    }}
                  >
                    {labels[0] && <span style={{ flex: 1, textAlign: "left" }}>{labels[0]}</span>}
                    {labels.length === 3 && <span style={{ flex: 1, textAlign: "center" }}>{labels[1]}</span>}
                    {labels.length >= 2 && <span style={{ flex: 1, textAlign: "right" }}>{labels[labels.length - 1]}</span>}
                  </div>
                </>
              ) : (
                <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  No order activity recorded for this date range yet.
                </div>
              )}
            </div>

            {/* Breakdown Row 1: Service Mode Breakdown (Petpooja-style) & Top Dishes */}
            <div class="ra-grid-2" style={{ marginBottom: "1.5rem" }}>
              {/* Service Mode Breakdown (Petpooja-style) */}
              <div class="ra-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <LuUtensils style="width:1rem;height:1rem;color:var(--brand-primary);" />
                    <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                      Service Mode Breakdown
                    </h3>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 500 }}>
                    {totalServiceOrders} total orders
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem" }}>
                  {Object.entries(serviceModeMap).map(([key, item]) => {
                    const pct = totalServiceOrders > 0 ? ((item.count / totalServiceOrders) * 100).toFixed(1) : "0.0";
                    return (
                      <div key={key}>
                        <div class="ra-row" style={{ marginBottom: "0.25rem" }}>
                          <span style={{ color: "var(--text-primary)", fontSize: "0.8125rem", fontWeight: 500 }}>
                            {item.icon} {item.label}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            {item.count} orders ({pct}%) • {fmt(item.revenue)}
                          </span>
                        </div>
                        <div class="ra-bar-bg" style={{ height: "6px" }}>
                          <div
                            style={{
                              height: "100%",
                              width: `${pct}%`,
                              background: item.color,
                              borderRadius: "3px",
                              transition: "width 0.3s ease",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Dishes */}
              <div class="ra-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "1rem" }}>
                  <LuReceipt style="width:1rem;height:1rem;color:var(--brand-primary);" />
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    Top Selling Dishes
                  </h3>
                </div>
                {topDishes.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {topDishes.map((dish, i) => (
                      <div key={i}>
                        <div class="ra-row">
                          <span style={{ color: "var(--text-primary)", fontSize: "0.8125rem", fontWeight: 500 }}>
                            {dish.name}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            {dish.qty} sold ({fmt(dish.revenue)})
                          </span>
                        </div>
                        <div class="ra-bar-bg">
                          <div
                            style={{
                              height: "100%",
                              width: `${((dish.qty / maxDishQty) * 100).toFixed(1)}%`,
                              background: "var(--brand-primary, #6366f1)",
                              borderRadius: "2px",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No dishes ordered yet</p>
                )}
              </div>

              {/* Peak Dining Hours */}
              <div class="ra-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "1rem" }}>
                  <LuClock style="width:1rem;height:1rem;color:#f59e0b;" />
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    Peak Dining Rush Hours
                  </h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {hourBuckets.map((bucket, i) => (
                    <div key={i}>
                      <div class="ra-row">
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>{bucket.label}</span>
                        <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{bucket.count} KOTs</span>
                      </div>
                      <div class="ra-bar-bg">
                        <div
                          style={{
                            height: "100%",
                            width: `${((bucket.count / maxHourCount) * 100).toFixed(1)}%`,
                            background: "#f59e0b",
                            borderRadius: "2px",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Payment Breakdown */}
              <div class="ra-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "1rem" }}>
                  <LuCreditCard style="width:1rem;height:1rem;color:#10b981;" />
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    Payment Mode Volume
                  </h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                  {[
                    { label: "💵 Cash Payments", val: payModeMap.cash, color: "#10b981" },
                    { label: "📱 UPI / QR Code", val: payModeMap.upi, color: "#6366f1" },
                    { label: "💳 Card / POS", val: payModeMap.card, color: "#ec4899" },
                  ].map((p, i) => (
                    <div key={i}>
                      <div class="ra-row">
                        <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>{p.label}</span>
                        <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{fmt(p.val)}</span>
                      </div>
                      <div class="ra-bar-bg">
                        <div
                          style={{
                            height: "100%",
                            width: `${((p.val / maxPay) * 100).toFixed(1)}%`,
                            background: p.color,
                            borderRadius: "2px",
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Breakdown Row 2: Table Turnaround, Dining Mode & Year-by-Year */}
            <div class="ra-grid-2">
              {/* Busiest Tables & Dining Mode */}
              <div class="ra-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <LuArmchair style="width:1rem;height:1rem;color:var(--brand-primary);" />
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                      Busiest Dining Tables
                    </h3>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {dineInOrders} Dine-In • {takeawayOrders} Takeaway • {deliveryOrders} Delivery
                  </span>
                </div>
                {tableStats.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                    {tableStats.map((t, i) => (
                      <div key={i}>
                        <div class="ra-row">
                          <div>
                            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{t.name}</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "0.4rem" }}>
                              ({t.floor} • {t.capacity} seats)
                            </span>
                          </div>
                          <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{t.kotCount} KOT tickets</span>
                        </div>
                        <div class="ra-bar-bg">
                          <div
                            style={{
                              height: "100%",
                              width: `${((t.kotCount / maxTableKots) * 100).toFixed(1)}%`,
                              background: "var(--brand-primary)",
                              borderRadius: "2px",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No table data yet</p>
                )}
              </div>

              {/* Yearly Restaurant Performance Table */}
              <div class="ra-card">
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: "0 0 0.875rem 0", color: "var(--text-primary)" }}>
                  Year-by-Year Performance
                </h3>
                {points.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {["Period", "Sales", "Profit", "Orders"].map((h) => (
                          <th
                            key={h}
                            style={{
                              textAlign: h === "Period" ? "left" : "right",
                              padding: "0.4rem 0.5rem",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                              color: "var(--text-secondary)",
                              textTransform: "uppercase",
                            }}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...points].reverse().slice(0, 5).map((pt, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.5rem", fontWeight: 600 }}>{pt.date}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            {fmt(pt.revenue)}
                          </td>
                          <td
                            style={{
                              padding: "0.5rem",
                              textAlign: "right",
                              color: pt.profit > 0 ? "#10b981" : "var(--text-secondary)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {pt.profit > 0 ? fmt(pt.profit) : "—"}
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--text-secondary)" }}>
                            {pt.invoices} bills
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No historical data yet</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Restaurant Analytics & Sales | BusinessKit",
};

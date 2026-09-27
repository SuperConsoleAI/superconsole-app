// src/routes/dashboard/shop/stays/analytics/index.tsx
//
// Hotel / Stays Analytics Dashboard with:
// - Real Lifetime Sales, Occupancy %, Average Daily Rate (ADR), and RevPAR from DB
// - Interactive Bar Chart (7d / 30d / 12m / Lifetime) with Metric Type toggle (Revenue, Occupancy, Bookings, Folios)
// - Hotel Breakdown Cards: Top Performing Rooms, Booking Status, Folio Charge Breakdown, Occupancy by Floor, Yearly Performance
// - ZERO dummy / hardcoded mock data

import { component$, useSignal, useStylesScoped$, $, useContext } from "@builder.io/qwik";
import { useNavigate, type DocumentHead } from "@builder.io/qwik-city";
import {
  LuArrowLeft,
  LuTrendingUp,
  LuReceipt,
  LuBedDouble,
  LuPercent,
  LuDollarSign,
  LuRefreshCw,
  LuCalendarDays,
} from "@qwikest/icons/lucide";
import { StaysContext } from "~/routes/dashboard/shop/stays/layout";

const STYLES = `
  .sa-wrap { max-width: 980px; margin: 0 auto; }
  .sa-stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 860px) { .sa-stat-grid { grid-template-columns: 1fr 1fr; } }
  @media (max-width: 480px) { .sa-stat-grid { grid-template-columns: 1fr; } }
  .sa-stat-card {
    padding: 1.25rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .sa-chart-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .sa-bars-scroll {
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
  }
  .sa-bars {
    height: 180px;
    display: flex;
    align-items: flex-end;
    gap: 3px;
    padding-top: 2.75rem;
    min-width: 100%;
    overflow: visible;
  }
  .sa-bar-wrap {
    flex: 1;
    min-width: 8px;
    position: relative;
    display: flex;
    align-items: flex-end;
    height: 100%;
    cursor: default;
  }
  .sa-bar-tip {
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
  .sa-bar-wrap:hover .sa-bar-tip { display: block; }
  .sa-grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 640px) { .sa-grid-2 { grid-template-columns: 1fr; } }
  .sa-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 768px) { .sa-grid-3 { grid-template-columns: 1fr; } }
  .sa-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .sa-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0;
  }
  .sa-bar-bg {
    height: 4px;
    background: var(--border);
    border-radius: 2px;
    margin-top: 0.25rem;
    overflow: hidden;
  }
  .sa-select {
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
  occupancy: number;
  reservations: number;
  folios: number;
}

const fmt = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(0)}`;
};

export default component$(() => {
  useStylesScoped$(STYLES);
  const nav = useNavigate();
  const ctx = useContext(StaysContext);

  const refreshing = useSignal(false);

  // Time range & metric selector
  const timeRange = useSignal<"7d" | "30d" | "12m" | "lifetime">("30d");
  const metricType = useSignal<"revenue" | "occupancy" | "reservations" | "folios">("revenue");

  const refreshData = $(async () => {
    refreshing.value = true;
    try {
      await ctx.refresh();
    } catch (e) {
      console.error("[stays/analytics] sync failed:", e);
    } finally {
      refreshing.value = false;
    }
  });

  // Core metrics calculations strictly from real DB state / analytics IPC
  const totalRooms = ctx.analytics?.total_rooms ?? ctx.rooms.length;
  const occupiedCount = ctx.analytics?.occupied_rooms ?? ctx.rooms.filter((r) => r.status === "occupied").length;
  const occupancyPct = ctx.analytics?.occupancy_rate ?? (totalRooms > 0 ? (occupiedCount / totalRooms) * 100 : 0);

  const totalFolioCharges = ctx.analytics?.total_folio_charges ?? ctx.folios.reduce((s, f) => s + (f.total_charges || 0), 0);
  const avgDailyRate = ctx.analytics?.avg_daily_rate ?? (occupiedCount > 0 ? totalFolioCharges / occupiedCount : 0);
  const revPar = ctx.analytics?.revpar ?? (totalRooms > 0 ? (occupancyPct / 100) * avgDailyRate : 0);

  // Timeline points calculation strictly from real reservations and folios
  const points: Point[] = (() => {
    const map: Record<string, Point> = {};

    // Group reservations by date
    for (const res of ctx.reservations) {
      if (!res.created_at) continue;
      const d = new Date(res.created_at * 1000);
      let key = "";
      if (timeRange.value === "7d" || timeRange.value === "30d") {
        key = d.toISOString().slice(5, 10); // MM-DD
      } else if (timeRange.value === "12m") {
        key = d.toISOString().slice(0, 7); // YYYY-MM
      } else {
        key = d.getFullYear().toString(); // YYYY
      }

      if (!map[key]) {
        map[key] = { date: key, revenue: 0, occupancy: 0, reservations: 0, folios: 0 };
      }
      map[key].reservations += 1;
      map[key].occupancy = Math.min(100, Math.round((map[key].reservations * 100) / Math.max(1, totalRooms)));
    }

    // Group folios by date
    for (const fol of ctx.folios) {
      if (!fol.created_at) continue;
      const d = new Date(fol.created_at * 1000);
      let key = "";
      if (timeRange.value === "7d" || timeRange.value === "30d") {
        key = d.toISOString().slice(5, 10);
      } else if (timeRange.value === "12m") {
        key = d.toISOString().slice(0, 7);
      } else {
        key = d.getFullYear().toString();
      }

      if (!map[key]) {
        map[key] = { date: key, revenue: 0, occupancy: 0, reservations: 0, folios: 0 };
      }
      map[key].folios += 1;
      map[key].revenue += fol.total_charges || 0;
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
      if (metricType.value === "occupancy") return p.occupancy;
      if (metricType.value === "reservations") return p.reservations;
      return p.folios;
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

  // Top Performing Rooms strictly from real booking records
  const roomStats = ctx.rooms
    .map((room) => {
      const roomRes = ctx.reservations.filter((r) => r.location_id === String(room.id) || r.room_name === room.name);
      return {
        name: room.name,
        floor: room.floor || "Main Floor",
        rate: room.base_rate,
        capacity: room.capacity,
        bookingsCount: roomRes.length,
        estimatedRev: roomRes.length * room.base_rate,
      };
    })
    .filter((r) => r.bookingsCount > 0)
    .sort((a, b) => b.bookingsCount - a.bookingsCount)
    .slice(0, 5);
  const maxRoomBookings = roomStats[0]?.bookingsCount || 1;

  // Booking Status Breakdown strictly from real reservation records
  const statusCounts = {
    confirmed: ctx.reservations.filter((r) => r.status === "confirmed" || r.status === "reserved").length,
    checked_in: ctx.reservations.filter((r) => r.status === "checked_in").length,
    checked_out: ctx.reservations.filter((r) => r.status === "checked_out").length,
    cancelled: ctx.reservations.filter((r) => r.status === "cancelled" || r.status === "no_show").length,
  };
  const maxStatusCount = Math.max(...Object.values(statusCounts), 1);

  // Folio Charges Breakdown strictly from real folio line items
  let roomChargeSum = 0;
  let serviceChargeSum = 0;
  let laundryChargeSum = 0;
  let otherChargeSum = 0;

  for (const fol of ctx.folios) {
    for (const line of fol.folio_lines || []) {
      if (line.category === "room_rate") roomChargeSum += line.amount;
      else if (line.category === "room_service" || line.category === "minibar") serviceChargeSum += line.amount;
      else if (line.category === "laundry") laundryChargeSum += line.amount;
      else otherChargeSum += line.amount;
    }
  }
  const maxFolioCharge = Math.max(roomChargeSum, serviceChargeSum, laundryChargeSum, otherChargeSum, 1);

  // Occupancy by Floor strictly from real room status
  const floorMap: Record<string, { roomsCount: number; occupiedCount: number }> = {};
  for (const rm of ctx.rooms) {
    const fl = rm.floor || "Ground Floor";
    if (!floorMap[fl]) floorMap[fl] = { roomsCount: 0, occupiedCount: 0 };
    floorMap[fl].roomsCount += 1;
    if (rm.status === "occupied") floorMap[fl].occupiedCount += 1;
  }
  const floorList = Object.entries(floorMap).map(([floor, s]) => ({
    floor,
    roomsCount: s.roomsCount,
    occupiedCount: s.occupiedCount,
    pct: s.roomsCount > 0 ? Math.round((s.occupiedCount / s.roomsCount) * 100) : 0,
  }));

  return (
    <div style={{ padding: "1.5rem" }}>
      <div class="sa-wrap">
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button
              type="button"
              onClick$={$(() => nav("/dashboard/shop/stays/"))}
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
              Stays
            </button>
            <span style={{ color: "var(--border)" }}>/</span>
            <h1 style={{ fontSize: "1.125rem", fontWeight: "600", color: "var(--text-primary)", margin: 0 }}>
              Hospitality Performance & RevPAR Analytics
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
            <div class="sa-stat-grid">
              <div class="sa-stat-card" style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3));">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  <LuReceipt style="width:0.875rem;height:0.875rem;" /> Unsettled Folio Charges
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>
                  {fmt(totalFolioCharges)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Across {ctx.analytics?.open_folios_count ?? ctx.folios.filter((f) => f.status === "open").length} open guest folios
                </div>
              </div>

              <div
                class="sa-stat-card"
                style="background: linear-gradient(145deg, rgba(16,185,129,0.12), rgba(16,185,129,0.06)); border-color: rgba(16,185,129,0.25);"
              >
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#10b981", fontSize: "0.8125rem" }}>
                  <LuTrendingUp style="width:0.875rem;height:0.875rem;" /> Occupancy Rate
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "#10b981", fontVariantNumeric: "tabular-nums" }}>
                  {occupancyPct.toFixed(1)}%
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  {occupiedCount} of {totalRooms} rooms occupied
                </div>
              </div>

              <div class="sa-stat-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  <LuDollarSign style="width:0.875rem;height:0.875rem;" /> Avg Daily Rate (ADR)
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--text-primary)" }}>
                  {fmt(avgDailyRate)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Avg revenue / occupied room
                </div>
              </div>

              <div class="sa-stat-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
                  <LuBedDouble style="width:0.875rem;height:0.875rem;" /> RevPAR
                </div>
                <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "#3B82F6" }}>
                  {fmt(revPar)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                  Revenue / available room
                </div>
              </div>
            </div>

            {/* Interactive Bar Chart */}
            <div class="sa-chart-card">
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
                <h3 style={{ fontSize: "1rem", fontWeight: "600", margin: 0, color: "var(--text-primary)" }}>
                  {metricType.value === "revenue"
                    ? "Room Revenue"
                    : metricType.value === "occupancy"
                    ? "Occupancy Rate (%)"
                    : metricType.value === "reservations"
                    ? "Booked Nights"
                    : "Unsettled Folios"}{" "}
                  Trend
                </h3>
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <select
                    class="sa-select"
                    value={metricType.value}
                    onChange$={(e) => {
                      metricType.value = (e.target as HTMLSelectElement).value as any;
                    }}
                  >
                    <option value="revenue">Revenue (₹)</option>
                    <option value="occupancy">Occupancy Rate (%)</option>
                    <option value="reservations"># Bookings</option>
                    <option value="folios"># Guest Folios</option>
                  </select>
                  <select
                    class="sa-select"
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
                  <div class="sa-bars-scroll">
                    <div class="sa-bars">
                      {points.map((pt, i) => {
                        const val =
                          metricType.value === "revenue"
                            ? pt.revenue
                            : metricType.value === "occupancy"
                            ? pt.occupancy
                            : metricType.value === "reservations"
                            ? pt.reservations
                            : pt.folios;
                        const h = maxVal > 0 ? Math.max((val / maxVal) * 160, val > 0 ? 4 : 0) : 0;
                        const bg =
                          metricType.value === "reservations"
                            ? "linear-gradient(180deg,#f59e0b 0%,rgba(245,158,11,0.3) 100%)"
                            : metricType.value === "folios"
                            ? "linear-gradient(180deg,#ec4899 0%,rgba(236,72,153,0.3) 100%)"
                            : metricType.value === "occupancy"
                            ? "linear-gradient(180deg,#10b981 0%,rgba(16,185,129,0.3) 100%)"
                            : "linear-gradient(180deg,var(--brand-primary,#6366f1) 0%,rgba(99,102,241,0.3) 100%)";
                        const borderCol =
                          metricType.value === "reservations"
                            ? "#f59e0b"
                            : metricType.value === "folios"
                            ? "#ec4899"
                            : metricType.value === "occupancy"
                            ? "#10b981"
                            : "var(--brand-primary,#6366f1)";

                        return (
                          <div key={i} class="sa-bar-wrap">
                            <div class="sa-bar-tip">
                              <div style={{ fontWeight: 600, marginBottom: "0.2rem", fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>
                                {pt.date}
                              </div>
                              <div style={{ fontWeight: 700 }}>
                                {metricType.value === "revenue"
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
                <div style={{ height: "180px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                  No room stay activity recorded for this date range yet.
                </div>
              )}
            </div>

            {/* Breakdown Row 1: Top Performing Rooms, Booking Status, Folio Breakdown */}
            <div class="sa-grid-3">
              {/* Top Performing Rooms */}
              <div class="sa-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "1rem" }}>
                  <LuBedDouble style="width:1rem;height:1rem;color:var(--brand-primary);" />
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    Top Performing Rooms
                  </h3>
                </div>
                {roomStats.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {roomStats.map((room, i) => (
                      <div key={i}>
                        <div class="sa-row">
                          <span style={{ color: "var(--text-primary)", fontSize: "0.8125rem", fontWeight: 500 }}>
                            {room.name}
                          </span>
                          <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                            {room.bookingsCount} stays ({fmt(room.estimatedRev)})
                          </span>
                        </div>
                        <div class="sa-bar-bg">
                          <div
                            style={{
                              height: "100%",
                              width: `${((room.bookingsCount / maxRoomBookings) * 100).toFixed(1)}%`,
                              background: "var(--brand-primary, #6366f1)",
                              borderRadius: "2px",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No room stay data recorded yet</p>
                )}
              </div>

              {/* Booking Status Breakdown */}
              <div class="sa-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "1rem" }}>
                  <LuCalendarDays style="width:1rem;height:1rem;color:#f59e0b;" />
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    Booking Status Breakdown
                  </h3>
                </div>
                {ctx.reservations.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {[
                      { label: "Checked-In (Active)", val: statusCounts.checked_in, color: "#10b981" },
                      { label: "Confirmed / Reserved", val: statusCounts.confirmed, color: "#3b82f6" },
                      { label: "Checked-Out (Completed)", val: statusCounts.checked_out, color: "#8b5cf6" },
                      { label: "Cancelled / No-Show", val: statusCounts.cancelled, color: "#ef4444" },
                    ].map((st, i) => (
                      <div key={i}>
                        <div class="sa-row">
                          <span style={{ color: "var(--text-secondary)", fontSize: "0.75rem" }}>{st.label}</span>
                          <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{st.val} bookings</span>
                        </div>
                        <div class="sa-bar-bg">
                          <div
                            style={{
                              height: "100%",
                              width: `${((st.val / maxStatusCount) * 100).toFixed(1)}%`,
                              background: st.color,
                              borderRadius: "2px",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No reservations created yet</p>
                )}
              </div>

              {/* Folio Charges Breakdown */}
              <div class="sa-card">
                <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "1rem" }}>
                  <LuReceipt style="width:1rem;height:1rem;color:#10b981;" />
                  <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                    Folio Revenue Breakdown
                  </h3>
                </div>
                {ctx.folios.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                    {[
                      { label: "🛏️ Base Room Rate", val: roomChargeSum, color: "var(--brand-primary, #6366f1)" },
                      { label: "🍽️ Room Service & Food", val: serviceChargeSum, color: "#10b981" },
                      { label: "🧺 Laundry & Amenities", val: laundryChargeSum, color: "#3b82f6" },
                      { label: "🧾 Taxes & Other Services", val: otherChargeSum, color: "#f59e0b" },
                    ].map((p, i) => (
                      <div key={i}>
                        <div class="sa-row">
                          <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>{p.label}</span>
                          <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{fmt(p.val)}</span>
                        </div>
                        <div class="sa-bar-bg">
                          <div
                            style={{
                              height: "100%",
                              width: `${((p.val / maxFolioCharge) * 100).toFixed(1)}%`,
                              background: p.color,
                              borderRadius: "2px",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No active or settled folios yet</p>
                )}
              </div>
            </div>

            {/* Breakdown Row 2: Occupancy by Floor & Year-by-Year Performance */}
            <div class="sa-grid-2">
              {/* Occupancy by Floor */}
              <div class="sa-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <LuPercent style="width:1rem;height:1rem;color:var(--brand-primary);" />
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                      Occupancy by Floor / Section
                    </h3>
                  </div>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {occupiedCount} Occupied • {totalRooms - occupiedCount} Available
                  </span>
                </div>
                {floorList.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                    {floorList.map((fl, i) => (
                      <div key={i}>
                        <div class="sa-row">
                          <div>
                            <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{fl.floor}</span>
                            <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginLeft: "0.4rem" }}>
                              ({fl.occupiedCount} of {fl.roomsCount} rooms occupied)
                            </span>
                          </div>
                          <span style={{ fontWeight: 600, fontSize: "0.8125rem", color: fl.pct > 70 ? "#10b981" : "var(--text-primary)" }}>
                            {fl.pct}%
                          </span>
                        </div>
                        <div class="sa-bar-bg">
                          <div
                            style={{
                              height: "100%",
                              width: `${Math.min(100, Math.max(0, fl.pct))}%`,
                              background: fl.pct > 70 ? "#10b981" : "var(--brand-primary)",
                              borderRadius: "2px",
                            }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No rooms configured yet</p>
                )}
              </div>

              {/* Yearly Hospitality Performance Table */}
              <div class="sa-card">
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: "0 0 0.875rem 0", color: "var(--text-primary)" }}>
                  Year-by-Year Performance
                </h3>
                {points.length > 0 ? (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                        {["Period", "Revenue", "Occupancy", "Bookings"].map((h) => (
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
                              color: pt.occupancy >= 70 ? "#10b981" : "var(--text-primary)",
                              fontVariantNumeric: "tabular-nums",
                            }}
                          >
                            {pt.occupancy}%
                          </td>
                          <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--text-secondary)" }}>
                            {pt.reservations} stays
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No historical data recorded yet</p>
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
  title: "Stays Analytics & RevPAR | BusinessKit",
};

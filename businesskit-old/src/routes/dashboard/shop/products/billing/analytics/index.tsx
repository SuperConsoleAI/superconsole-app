// src/routes/dashboard/shop/products/billing/analytics/index.tsx
// Reads from BillingCtx — data loaded by parent layout.tsx.
// Bar chart with 7d / 30d / 12m / lifetime selector (like LinksAnalytics).
// City / state / country breakdown cards below.

import { component$, useContext, useStylesScoped$, useSignal, $ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { BillingCtx } from "../layout";
import { LuArrowLeft, LuTrendingUp, LuReceipt, LuPercent } from "@qwikest/icons/lucide";

const STYLES = `
  .ba-wrap { max-width: 980px; margin: 0 auto; }
  .ba-stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 640px) { .ba-stat-grid { grid-template-columns: 1fr 1fr; } }
  .ba-stat-card {
    padding: 1.25rem;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
  }
  .ba-chart-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.5rem;
    margin-bottom: 1.5rem;
  }
  .ba-bars-scroll {
    overflow-x: auto;
    overflow-y: visible;
    -webkit-overflow-scrolling: touch;
  }
  .ba-bars {
    height: 180px;
    display: flex;
    align-items: flex-end;
    gap: 3px;
    padding-top: 2.75rem;
    min-width: 100%;
    overflow: visible;
  }
  .ba-bar-wrap {
    flex: 1;
    min-width: 8px;
    position: relative;
    display: flex;
    align-items: flex-end;
    height: 100%;
    cursor: default;
  }
  .ba-bar-tip {
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
  .ba-bar-wrap:hover .ba-bar-tip { display: block; }
  .ba-breakdown {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 640px) { .ba-breakdown { grid-template-columns: 1fr; } }
  .ba-breakdown-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .ba-geo-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 768px) { .ba-geo-grid { grid-template-columns: 1fr; } }
  .ba-geo-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }
  .ba-geo-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.375rem 0;
  }
  .ba-geo-bar-bg {
    height: 3px;
    background: var(--border);
    border-radius: 2px;
    margin-top: 0.2rem;
  }
  .ba-select {
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

interface Pt { date: string; revenue?: number; profit?: number; invoices?: number; }

const fmt = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(0)}`;
};
const parseJson = (s: string, def: any = []) => { try { return JSON.parse(s); } catch { return def; } };
const lifetimeArr = (rStr: string, pStr: string, iStr = "{}"): Pt[] => {
  const r: Record<string, number> = parseJson(rStr, {});
  const p: Record<string, number> = parseJson(pStr, {});
  const inv: Record<string, number> = parseJson(iStr, {});
  const yrs = [...new Set([...Object.keys(r), ...Object.keys(p)])].sort();
  return yrs.map(y => ({ date: y, revenue: r[y] ?? 0, profit: p[y] ?? 0, invoices: inv[y] ?? 0 }));
};
const topGeo = (jsonStr: string, limit = 7): { name: string; val: number }[] => {
  const obj: Record<string, number> = parseJson(jsonStr, {});
  return Object.entries(obj)
    .map(([name, val]) => ({ name, val: val as number }))
    .sort((a, b) => b.val - a.val)
    .slice(0, limit);
};

export default component$(() => {
  useStylesScoped$(STYLES);
  const nav   = useNavigate();
  const store = useContext(BillingCtx);

  // Reactive signals — like LinksAnalytics
  const timeRange  = useSignal<"7d"|"30d"|"12m"|"lifetime">("30d");
  const metricType = useSignal<"revenue"|"profit"|"invoices">("revenue");

  return (
    <div style={{ padding: "1.5rem" }}>
      <div class="ba-wrap">

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", marginBottom: "1.5rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <button type="button" onClick$={$(() => nav("/dashboard/shop/products/billing/"))}
              style={{ background: "transparent", border: "none", color: "var(--text-secondary)", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.35rem", fontSize: "0.875rem", padding: "0.25rem" }}>
              <LuArrowLeft style="width:1rem;height:1rem;" />
              Billing
            </button>
            <span style={{ color: "var(--border)" }}>/</span>
            <h1 style={{ fontSize: "1.125rem", fontWeight: "600", color: "var(--text-primary)", margin: 0 }}>Analytics</h1>
          </div>
        </div>

        {/* Error */}
        {store.error && !store.loading && (
          <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)", borderRadius: "0.5rem", padding: "1rem", color: "#ef4444", fontSize: "0.875rem", marginBottom: "1rem" }}>
            {store.error}
          </div>
        )}

        {/* Skeleton */}
        {store.loading ? (
          <div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem", marginBottom: "1rem" }}>
              <div class="skeleton" style={{ height: "100px" }} />
              <div class="skeleton" style={{ height: "100px", animationDelay: "150ms" }} />
              <div class="skeleton" style={{ height: "100px", animationDelay: "300ms" }} />
            </div>
            <div class="skeleton" style={{ height: "320px", marginBottom: "1rem", animationDelay: "450ms" }} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "1rem" }}>
              <div class="skeleton" style={{ height: "200px", animationDelay: "600ms" }} />
              <div class="skeleton" style={{ height: "200px", animationDelay: "750ms" }} />
              <div class="skeleton" style={{ height: "200px", animationDelay: "900ms" }} />
            </div>
          </div>
        ) : store.analytics ? (() => {
          const d      = store.analytics!;
          const margin = d.total_revenue > 0 ? (d.total_profit / d.total_revenue) * 100 : 0;

          // Compute chart data from selected range + metric
          const pts = (() => {
            if (timeRange.value === "lifetime") return lifetimeArr(d.revenue_lifetime, d.profit_lifetime, d.invoices_lifetime);
            const rStr = timeRange.value === "7d" ? d.revenue_7d : timeRange.value === "30d" ? d.revenue_30d : d.revenue_12m;
            const pStr = timeRange.value === "7d" ? d.profit_7d  : timeRange.value === "30d" ? d.profit_30d  : d.profit_12m;
            const rArr: Pt[] = parseJson(rStr, []);
            const pArr: Pt[] = parseJson(pStr, []);
            return rArr.map((pt: Pt, i: number) => ({ date: pt.date, revenue: pt.revenue ?? 0, profit: pArr[i]?.profit ?? 0, invoices: pt.invoices ?? 0 }));
          })();

          const isRevenue  = metricType.value === "revenue";
          const isInvoices = metricType.value === "invoices";
          const maxVal = Math.max(...pts.map((p: Pt) =>
            isInvoices ? (p.invoices ?? 0) : isRevenue ? (p.revenue ?? 0) : (p.profit ?? 0)
          ), 1);
          const len       = pts.length;
          const labels    = len > 0 ? [pts[0].date, len >= 7 ? pts[Math.floor(len/2)].date : null, len > 1 ? pts[len-1].date : null].filter(Boolean) as string[] : [];

          // Geo data — fields are optional (only present after geo-enrichment)
          const cities    = topGeo(d.city_breakdown    ?? "");
          const states    = topGeo(d.state_breakdown   ?? "");
          const countries = topGeo(d.country_breakdown ?? "");
          const maxCity    = cities[0]?.val    ?? 1;
          const maxState   = states[0]?.val   ?? 1;
          const maxCountry = countries[0]?.val ?? 1;

          return (
            <>
              {/* Stat Cards */}
              <div class="ba-stat-grid">
                <div class="ba-stat-card" style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3));">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
                    <LuReceipt style="width:0.875rem;height:0.875rem;" /> Lifetime Revenue
                  </div>
                  <div style={{ fontSize: "1.75rem", fontWeight: "700", color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.total_revenue)}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>{d.total_invoices} invoices total</div>
                </div>

                <div class="ba-stat-card" style="background: linear-gradient(145deg, rgba(16,185,129,0.12), rgba(16,185,129,0.06)); border-color: rgba(16,185,129,0.25);">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "#10b981", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
                    <LuTrendingUp style="width:0.875rem;height:0.875rem;" /> Lifetime Profit
                  </div>
                  <div style={{ fontSize: "1.75rem", fontWeight: "700", color: d.total_profit > 0 ? "#10b981" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.total_profit)}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>{d.total_profit > 0 ? `${margin.toFixed(1)}% avg margin` : "no cost data yet"}</div>
                </div>

                <div class="ba-stat-card">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", color: "var(--text-secondary)", fontSize: "0.8125rem", marginBottom: "0.5rem" }}>
                    <LuPercent style="width:0.875rem;height:0.875rem;" /> Avg Margin
                  </div>
                  <div style={{ fontSize: "1.75rem", fontWeight: "700", color: margin > 0 ? "var(--text-primary)" : "var(--text-secondary)" }}>{margin > 0 ? `${margin.toFixed(1)}%` : "—"}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                    {d.last_aggregated_at
                      ? `synced ${new Date(d.last_aggregated_at).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`
                      : "never synced"}
                  </div>
                </div>
              </div>

              {/* Bar Chart — reactive to range + metric */}
              <div class="ba-chart-card">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.5rem" }}>
                  <h3 style={{ fontSize: "1rem", fontWeight: "600", margin: 0, color: "var(--text-primary)" }}>
                    {isInvoices ? "Invoice Count" : isRevenue ? "Revenue" : "Profit"} Trend
                  </h3>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <select
                      class="ba-select"
                      value={metricType.value}
                      onChange$={(e) => { metricType.value = (e.target as HTMLSelectElement).value as any; }}
                    >
                      <option value="revenue">Revenue</option>
                      <option value="profit">Profit</option>
                      <option value="invoices"># Invoices</option>
                    </select>
                    <select
                      class="ba-select"
                      value={timeRange.value}
                      onChange$={(e) => { timeRange.value = (e.target as HTMLSelectElement).value as any; }}
                    >
                      <option value="7d">Last 7 Days</option>
                      <option value="30d">Last 30 Days</option>
                      <option value="12m">Last 12 Months</option>
                      <option value="lifetime">Lifetime (Yearly)</option>
                    </select>
                  </div>
                </div>

                {pts.length > 0 ? (
                  <>
                    <div class="ba-bars-scroll">
                      <div class="ba-bars">
                        {pts.map((pt: Pt, i: number) => {
                          const val = isInvoices ? (pt.invoices ?? 0) : isRevenue ? (pt.revenue ?? 0) : (pt.profit ?? 0);
                          const h   = maxVal > 0 ? Math.max((val / maxVal) * 160, val > 0 ? 4 : 0) : 0;
                          const bg  = isInvoices
                            ? "linear-gradient(180deg,#f59e0b 0%,rgba(245,158,11,0.3) 100%)"
                            : isRevenue
                            ? "linear-gradient(180deg,var(--accent) 0%,rgba(99,102,241,0.3) 100%)"
                            : "linear-gradient(180deg,#10b981 0%,rgba(16,185,129,0.3) 100%)";
                          const borderCol = isInvoices ? "#f59e0b" : isRevenue ? "var(--accent)" : "#10b981";
                          return (
                            <div key={i} class="ba-bar-wrap">
                              <div class="ba-bar-tip">
                                <div style={{ fontWeight: 600, marginBottom: "0.2rem", fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>{pt.date}</div>
                                {isInvoices
                                  ? <div style={{ fontWeight: 700 }}>{val} invoice{val !== 1 ? "s" : ""}</div>
                                  : isRevenue
                                  ? <div style={{ fontWeight: 700 }}>₹{(val as number).toFixed(0)}</div>
                                  : <div style={{ fontWeight: 700 }}>₹{(val as number).toFixed(0)}</div>
                                }
                                <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.5)", marginTop: "0.1rem" }}>
                                  {isInvoices ? "invoices" : isRevenue ? "revenue" : "profit"}
                                </div>
                              </div>
                              <div style={{ width: "100%", height: `${h}px`, borderRadius: "0.25rem 0.25rem 0 0", opacity: 0.9, background: bg, border: `1px solid ${borderCol}` }} />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "var(--text-secondary)", paddingTop: "0.625rem", borderTop: "1px solid var(--border)" }}>
                      {labels[0] && <span style={{ flex: 1, textAlign: "left" }}>{labels[0]}</span>}
                      {labels.length === 3 && <span style={{ flex: 1, textAlign: "center" }}>{labels[1]}</span>}
                      {labels.length >= 2 && <span style={{ flex: 1, textAlign: "right" }}>{labels[labels.length-1]}</span>}
                    </div>
                  </>
                ) : (
                  <div style={{ height: "200px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)", fontSize: "0.875rem" }}>
                    No data for this range — click refresh to aggregate
                  </div>
                )}
              </div>

              {/* Geo Breakdown — City / State / Country — always show */}
              <div class="ba-geo-grid">
                  {/* City */}
                  <div class="ba-geo-card">
                    <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 1rem 0", color: "var(--text-primary)" }}>Top Cities</h3>
                    {cities.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                        {cities.map((item, i) => (
                          <div key={i}>
                            <div class="ba-geo-row">
                              <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>{item.name}</span>
                              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{fmt(item.val)}</span>
                            </div>
                            <div class="ba-geo-bar-bg">
                              <div style={{ height: "100%", width: `${(item.val/maxCity*100).toFixed(1)}%`, background: "var(--accent)", borderRadius: "2px" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No city data yet</p>}
                  </div>

                  {/* State */}
                  <div class="ba-geo-card">
                    <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 1rem 0", color: "var(--text-primary)" }}>Top States</h3>
                    {states.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                        {states.map((item, i) => (
                          <div key={i}>
                            <div class="ba-geo-row">
                              <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>{item.name}</span>
                              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{fmt(item.val)}</span>
                            </div>
                            <div class="ba-geo-bar-bg">
                              <div style={{ height: "100%", width: `${(item.val/maxState*100).toFixed(1)}%`, background: "#8b5cf6", borderRadius: "2px" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No state data yet</p>}
                  </div>

                  {/* Country */}
                  <div class="ba-geo-card">
                    <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 1rem 0", color: "var(--text-primary)" }}>Top Countries</h3>
                    {countries.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                        {countries.map((item, i) => (
                          <div key={i}>
                            <div class="ba-geo-row">
                              <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>{item.name}</span>
                              <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{fmt(item.val)}</span>
                            </div>
                            <div class="ba-geo-bar-bg">
                              <div style={{ height: "100%", width: `${(item.val/maxCountry*100).toFixed(1)}%`, background: "#10b981", borderRadius: "2px" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No country data yet</p>}
                  </div>
                </div>

              {/* Best days breakdown */}
              <div class="ba-breakdown">
                <div class="ba-breakdown-card">
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: "0 0 0.875rem 0", color: "var(--text-primary)" }}>Best Revenue Days (30d)</h3>
                  {(() => {
                    const arr: Pt[] = parseJson(d.revenue_30d, []);
                    const top = [...arr].sort((a,b) => (b.revenue??0)-(a.revenue??0)).slice(0,5);
                    const mx  = top[0]?.revenue ?? 1;
                    return top.length > 0 ? (
                      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
                        {top.map((pt: Pt, i: number) => (
                          <div key={i}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.8125rem", marginBottom: "0.25rem" }}>
                              <span style={{ color: "var(--text-secondary)" }}>{pt.date}</span>
                              <span style={{ fontWeight: 600 }}>{fmt(pt.revenue??0)}</span>
                            </div>
                            <div style={{ height: "4px", background: "var(--border)", borderRadius: "2px" }}>
                              <div style={{ height: "100%", width: `${((pt.revenue??0)/mx*100).toFixed(1)}%`, background: "var(--accent)", borderRadius: "2px" }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No invoices in last 30 days</p>;
                  })()}
                </div>

                <div class="ba-breakdown-card">
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: "0 0 0.875rem 0", color: "var(--text-primary)" }}>Year-by-Year</h3>
                  {(() => {
                    const yearly = lifetimeArr(d.revenue_lifetime, d.profit_lifetime, d.invoices_lifetime);
                    if (yearly.length === 0) return <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>No yearly data yet</p>;
                    return (
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                        <thead>
                          <tr style={{ borderBottom: "1px solid var(--border)" }}>
                            {["Year","Revenue","Profit","Margin"].map(h => (
                              <th key={h} style={{ textAlign: h === "Year" ? "left" : "right", padding: "0.4rem 0.5rem", fontSize: "0.75rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase" }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {[...yearly].reverse().map((pt: Pt, i: number) => {
                            const rev = pt.revenue ?? 0;
                            const prf = pt.profit  ?? 0;
                            return (
                              <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                                <td style={{ padding: "0.5rem", fontWeight: 600 }}>{pt.date}</td>
                                <td style={{ padding: "0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(rev)}</td>
                                <td style={{ padding: "0.5rem", textAlign: "right", color: prf > 0 ? "#10b981" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{prf > 0 ? fmt(prf) : "—"}</td>
                                <td style={{ padding: "0.5rem", textAlign: "right", color: "var(--text-secondary)" }}>{rev > 0 ? `${(prf/rev*100).toFixed(1)}%` : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
              </div>
            </>
          );
        })() : (
          <div style={{ textAlign: "center", padding: "4rem", color: "var(--text-secondary)" }}>
            No analytics data yet — click refresh to aggregate
          </div>
        )}
      </div>
    </div>
  );
});

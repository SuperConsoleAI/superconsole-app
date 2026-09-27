// src/components/shop/SingleItemBillingAnalytics.tsx
//
// Slide-over showing per-item billing analytics.
// Pattern mirrors SingleLinksAnalytics.tsx.
// Data source: shop_item_billing_analytics (aggregated via shop_aggregate_item_billing_analytics).

import {
  component$, useSignal, useVisibleTask$, $,
  type PropFunction,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import {
  LuX, LuBarChart2, LuTrendingUp, LuRefreshCw,
  LuReceipt, LuPackage,
} from "@qwikest/icons/lucide";

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
  revenue_7d: string;
  revenue_30d: string;
  revenue_12m: string;
  profit_7d: string;
  profit_30d: string;
  profit_12m: string;
  city_breakdown: string;
  state_breakdown: string;
  country_breakdown: string;
  revenue_lifetime: string;
  profit_lifetime: string;
  invoices_lifetime: string;
  units_lifetime: string;
  last_aggregated_at: string;
}

interface Pt { date: string; revenue?: number; profit?: number; units?: number; invoices?: number; }

type Props = {
  itemId: string;
  itemName: string;
  onClose$: PropFunction<() => void>;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) => {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000)   return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n.toFixed(0)}`;
};
const fmtU = (n: number) => n % 1 === 0 ? String(n) : n.toFixed(1);
const parseJ = (s: string, def: any = []) => { try { return JSON.parse(s); } catch { return def; } };

const lifetimeArr = (rStr: string, pStr: string, iStr = "{}", uStr = "{}"): Pt[] => {
  const r: Record<string, number> = parseJ(rStr, {});
  const p: Record<string, number> = parseJ(pStr, {});
  const inv: Record<string, number> = parseJ(iStr, {});
  const u: Record<string, number> = parseJ(uStr, {});
  const yrs = [...new Set([...Object.keys(r), ...Object.keys(p)])].sort();
  return yrs.map(y => ({ date: y, revenue: r[y] ?? 0, profit: p[y] ?? 0, invoices: inv[y] ?? 0, units: u[y] ?? 0 }));
};

const topGeo = (s: string, limit = 5): { name: string; val: number }[] => {
  const obj: Record<string, number> = parseJ(s, {});
  return Object.entries(obj)
    .map(([name, val]) => ({ name, val: val as number }))
    .sort((a, b) => b.val - a.val)
    .slice(0, limit);
};

// ── Component ─────────────────────────────────────────────────────────────────

export const SingleItemBillingAnalytics = component$<Props>(({ itemId, itemName, onClose$ }) => {
  const data       = useSignal<ItemAnalytics | null>(null);
  const loading    = useSignal(true);
  const refreshing = useSignal(false);
  const timeRange  = useSignal<"7d"|"30d"|"12m"|"lifetime">("30d");
  const metric     = useSignal<"revenue"|"profit"|"units"|"invoices">("revenue");

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => itemId);
    loading.value = true;
    try {
      data.value = await invoke<ItemAnalytics>("shop_get_item_billing_analytics", { itemId });
    } catch (e) {
      console.error("[item-analytics] load failed:", e);
    } finally {
      loading.value = false;
    }
  });

  const refresh = $(async () => {
    refreshing.value = true;
    try {
      await invoke("shop_aggregate_item_billing_analytics");
      data.value = await invoke<ItemAnalytics>("shop_get_item_billing_analytics", { itemId });
    } catch (e) {
      console.error("[item-analytics] refresh failed:", e);
    } finally {
      refreshing.value = false;
    }
  });

  return (
    <div style="position:fixed;inset:0;z-index:400;display:flex;justify-content:flex-end;">
      <style>{`
        .siba-panel {
          position: relative; width: 100%; max-width: 520px;
          background: var(--surface-1); height: 100%; overflow-y: auto;
          border-left: 1px solid var(--border); display: flex; flex-direction: column;
          animation: slideInRight 0.28s ease;
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
        .siba-bars-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .siba-bars {
          height: 160px; display: flex; align-items: flex-end; gap: 3px;
          padding-top: 2.5rem; min-width: 100%; overflow: visible;
        }
        .siba-bar-wrap { flex: 1; min-width: 6px; position: relative; display: flex; align-items: flex-end; height: 100%; }
        .siba-bar-tip {
          display: none; position: absolute; top: 4px; left: 50%;
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
          border-radius: 0.375rem; font-size: 0.75rem;
          background: var(--surface-2); color: var(--text-primary); cursor: pointer;
        }
        .siba-geo-row { display: flex; justify-content: space-between; align-items: center; padding: 0.3rem 0; }
        .siba-geo-bar { height: 3px; background: var(--border); border-radius: 2px; margin-top: 0.15rem; }
        @media (max-width: 640px) { .siba-panel { max-width: 100%; } .siba-body { padding: 1rem; } }
      `}</style>

      {/* Backdrop */}
      <div style="position:absolute;inset:0;background:rgba(0,0,0,0.45);" onClick$={$(() => onClose$())} />

      <div class="siba-panel">
        {/* Header */}
        <div class="siba-header">
          {/* Left: icon + name */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: 0, flex: 1, overflow: "hidden" }}>
            <LuBarChart2 style="width:1.125rem;height:1.125rem;color:var(--accent);flex-shrink:0;" />
            <h2 style={{ fontSize: "1rem", fontWeight: 600, color: "var(--text-primary)", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {itemName || "Item Analytics"}
            </h2>
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

        <div class="siba-body">
          {loading.value ? (
            <>
              <div style={{ height: "120px", background: "var(--surface-2)", borderRadius: "0.75rem", animation: "pulse 1.4s ease infinite" }} />
              <div style={{ height: "220px", background: "var(--surface-2)", borderRadius: "0.75rem", animation: "pulse 1.4s ease infinite", animationDelay: "150ms" }} />
            </>
          ) : !data.value || (data.value.total_invoices === 0 && data.value.total_revenue === 0) ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "5rem 2rem", textAlign: "center", gap: "1rem" }}>
              <div style={{ width: "3.5rem", height: "3.5rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-secondary)" }}>
                <LuPackage style="width:1.75rem;height:1.75rem;" />
              </div>
              <div style={{ fontSize: "0.9375rem", fontWeight: 600, color: "var(--text-primary)" }}>No billing data yet</div>
              <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)" }}>
                This item hasn't appeared in any confirmed invoices.<br />Hit Refresh after billing to aggregate.
              </div>
              <button type="button" onClick$={refresh}
                style={{ display: "flex", alignItems: "center", gap: "0.375rem", background: "var(--button-primary-bg)", color: "var(--button-primary-text)", border: "none", borderRadius: "0.375rem", padding: "0.5rem 1rem", fontSize: "0.8125rem", fontWeight: 500, cursor: "pointer" }}>
                <LuRefreshCw style="width:0.875rem;height:0.875rem;" /> Refresh
              </button>
            </div>
          ) : (() => {
            const d = data.value!;
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
                return lifetimeArr(d.revenue_lifetime, d.profit_lifetime, d.invoices_lifetime, d.units_lifetime);
              const rArr: Pt[] = parseJ(timeRange.value === "7d" ? d.revenue_7d : timeRange.value === "30d" ? d.revenue_30d : d.revenue_12m, []);
              return rArr.map((pt: Pt) => ({ date: pt.date, revenue: pt.revenue ?? 0, profit: pt.profit ?? 0, units: pt.units ?? 0, invoices: pt.invoices ?? 0 }));
            })();

            const isInvoices = metric.value === "invoices";
            const isUnits    = metric.value === "units";
            const isRevenue  = metric.value === "revenue";
            const getVal     = (pt: Pt) => isInvoices ? (pt.invoices ?? 0) : isUnits ? (pt.units ?? 0) : isRevenue ? (pt.revenue ?? 0) : (pt.profit ?? 0);
            const maxVal = Math.max(...pts.map(getVal), 1);

            const barColor = isInvoices ? "#f59e0b" : isUnits ? "#8b5cf6" : isRevenue ? "var(--accent)" : "#10b981";
            const barBg = isInvoices
              ? "linear-gradient(180deg,#f59e0b,rgba(245,158,11,0.25))"
              : isUnits
              ? "linear-gradient(180deg,#8b5cf6,rgba(139,92,246,0.25))"
              : isRevenue
              ? "linear-gradient(180deg,var(--accent),rgba(99,102,241,0.25))"
              : "linear-gradient(180deg,#10b981,rgba(16,185,129,0.25))";

            const cities    = topGeo(d.city_breakdown);
            const states    = topGeo(d.state_breakdown);
            const countries = topGeo(d.country_breakdown);

            return (
              <>
                {/* Today's stats strip */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.5rem" }}>
                  {[
                    { label: "Today Revenue", val: todayPt ? fmt(todayPt.revenue ?? 0) : "—", sub: "today", color: "var(--accent)", accent: false },
                    { label: "Today Profit",  val: todayPt && (todayPt.profit ?? 0) > 0 ? fmt(todayPt.profit ?? 0) : "—", sub: "today", color: "#10b981", accent: true },
                    { label: "Today Invoices", val: todayPt ? String(todayPt.invoices ?? 0) : "0", sub: "bills today", color: "#f59e0b", accent: false },
                  ].map(({ label, val, sub, color, accent }) => (
                    <div key={label} style={{
                      padding: "0.75rem",
                      background: accent ? "rgba(16,185,129,0.06)" : "var(--surface-2)",
                      border: `1px solid ${accent ? "rgba(16,185,129,0.2)" : "var(--border)"}`,
                      borderRadius: "0.625rem",
                      borderTop: `2px solid ${color}`,
                    }}>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginBottom: "0.35rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
                      <div style={{ fontSize: "1.125rem", fontWeight: 700, color: val === "—" || val === "0" ? "var(--text-secondary)" : color, fontVariantNumeric: "tabular-nums" }}>{val}</div>
                      <div style={{ fontSize: "0.65rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{sub}</div>
                    </div>
                  ))}
                </div>

                {/* Lifetime Stat grid */}
                <div class="siba-stat-grid">
                  <div class="siba-stat">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "var(--text-secondary)", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                      <LuReceipt style="width:0.75rem;height:0.75rem;" /> Revenue
                    </div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)", fontVariantNumeric: "tabular-nums" }}>{fmt(d.total_revenue)}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{d.total_invoices} invoices</div>
                  </div>
                  <div class="siba-stat" style="border-color:rgba(16,185,129,0.3);background:rgba(16,185,129,0.06);">
                    <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", color: "#10b981", fontSize: "0.75rem", marginBottom: "0.4rem" }}>
                      <LuTrendingUp style="width:0.75rem;height:0.75rem;" /> Profit
                    </div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: d.total_profit > 0 ? "#10b981" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>{d.total_profit > 0 ? fmt(d.total_profit) : "—"}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>{margin > 0 ? `${margin.toFixed(1)}% margin` : "no cost set"}</div>
                  </div>
                  <div class="siba-stat">
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>Units Sold</div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)" }}>{fmtU(d.total_units)}</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>lifetime total</div>
                  </div>
                  <div class="siba-stat">
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.4rem" }}>Avg/Invoice</div>
                    <div style={{ fontSize: "1.375rem", fontWeight: 700, color: "var(--text-primary)" }}>
                      {d.total_invoices > 0 ? fmt(d.total_revenue / d.total_invoices) : "—"}
                    </div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>avg revenue/bill</div>
                  </div>
                </div>

                {/* Bar chart */}
                <div class="siba-card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem", gap: "0.5rem", flexWrap: "wrap" }}>
                    <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0, color: "var(--text-primary)" }}>
                      {isInvoices ? "Invoice Count" : isUnits ? "Units Sold" : isRevenue ? "Revenue" : "Profit"} Trend
                    </h3>
                    <div style={{ display: "flex", gap: "0.375rem" }}>
                      <select class="siba-select" value={metric.value} onChange$={(e) => { metric.value = (e.target as HTMLSelectElement).value as any; }}>
                        <option value="revenue">Revenue</option>
                        <option value="profit">Profit</option>
                        <option value="units">Units</option>
                        <option value="invoices"># Invoices</option>
                      </select>
                      <select class="siba-select" value={timeRange.value} onChange$={(e) => { timeRange.value = (e.target as HTMLSelectElement).value as any; }}>
                        <option value="7d">7 Days</option>
                        <option value="30d">30 Days</option>
                        <option value="12m">12 Months</option>
                        <option value="lifetime">Lifetime</option>
                      </select>
                    </div>
                  </div>

                  {pts.length > 0 ? (
                    <>
                      <div class="siba-bars-scroll">
                        <div class="siba-bars">
                          {pts.map((pt: Pt, i: number) => {
                            const val = getVal(pt);
                            const h = maxVal > 0 ? Math.max((val / maxVal) * 130, val > 0 ? 3 : 0) : 0;
                            return (
                              <div key={i} class="siba-bar-wrap">
                                <div class="siba-bar-tip">
                                  <div style={{ fontWeight: 600, marginBottom: "0.15rem", fontSize: "0.7rem", color: "rgba(255,255,255,0.6)" }}>{pt.date}</div>
                                  <div style={{ fontWeight: 700 }}>
                                    {isInvoices
                                      ? `${val} invoice${val !== 1 ? "s" : ""}`
                                      : isUnits
                                      ? `${fmtU(val)} units`
                                      : `₹${(val as number).toFixed(0)}`}
                                  </div>
                                  <div style={{ fontSize: "0.65rem", color: "rgba(255,255,255,0.5)", marginTop: "0.1rem" }}>
                                    {isInvoices ? "invoices" : isUnits ? "units sold" : isRevenue ? "revenue" : "profit"}
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

                {/* Geo breakdown — 3 always-visible cards */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: "0.75rem" }}>
                  {([
                    { label: "Top Cities",    items: cities,    color: "var(--accent)" },
                    { label: "Top States",    items: states,    color: "#8b5cf6" },
                    { label: "Top Countries", items: countries, color: "#10b981" },
                  ] as { label: string; items: { name: string; val: number }[]; color: string }[]).map(({ label, items: geoItems, color }) => (
                    <div key={label} class="siba-card" style={{ padding: "1rem" }}>
                      <div style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.375rem" }}>
                        <div style={{ width: "0.5rem", height: "0.5rem", borderRadius: "50%", background: color, flexShrink: 0 }} />
                        {label}
                      </div>
                      {geoItems.length > 0 ? geoItems.map((g, i) => {
                        const max = geoItems[0]?.val ?? 1;
                        return (
                          <div key={i} style={{ marginBottom: "0.625rem" }}>
                            <div class="siba-geo-row">
                              <span style={{ fontSize: "0.75rem", color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "65%" }}>{g.name}</span>
                              <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "var(--text-secondary)" }}>{fmt(g.val)}</span>
                            </div>
                            <div class="siba-geo-bar">
                              <div style={{ height: "100%", width: `${(g.val / max * 100).toFixed(1)}%`, background: color, borderRadius: "2px" }} />
                            </div>
                          </div>
                        );
                      }) : (
                        <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", padding: "0.5rem 0" }}>
                          No data yet
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
});

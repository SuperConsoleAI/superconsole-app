// src/routes/dashboard/shop/accounts/reports/index.tsx
// Financial reports — P&L, Balance Sheet, Trial Balance with period selector.

import { component$, useSignal, useVisibleTask$, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { fmtMoney as fmt } from "~/lib/fin-format";

const PERIODS = [
  { label: "This Month",    key: "month" },
  { label: "Last 3 Months", key: "q3" },
  { label: "This Year",     key: "year" },
  { label: "All Time",      key: "all" },
];

function periodTs(key: string): [number, number] {
  const now = Math.floor(Date.now() / 1000);
  const d = new Date();
  if (key === "month") {
    const start = new Date(d.getFullYear(), d.getMonth(), 1);
    return [Math.floor(start.getTime() / 1000), now];
  }
  if (key === "q3") return [now - 90 * 86400, now];
  if (key === "year") {
    const start = new Date(d.getFullYear(), 0, 1);
    return [Math.floor(start.getTime() / 1000), now];
  }
  return [0, now];
}

type Tab = "pl" | "bs" | "tb";

export default component$(() => {
  const activeTab   = useSignal<Tab>("pl");
  const activePeriod = useSignal("month");
  const plData      = useSignal<any | null>(null);
  const bsData      = useSignal<any | null>(null);
  const tbData      = useSignal<any | null>(null);
  const loading     = useSignal(false);

  const loadReport = $(async (tab: Tab, period: string) => {
    loading.value = true;
    const [from, to] = periodTs(period);
    try {
      if (tab === "pl") {
        plData.value = await invoke("fin_get_profit_and_loss", { fromTs: from, toTs: to });
      } else if (tab === "bs") {
        bsData.value = await invoke("fin_get_balance_sheet", { asOfTs: to });
      } else {
        tbData.value = await invoke("fin_get_trial_balance", { asOfTs: to });
      }
    } catch (e) {
      console.error(e);
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await loadReport("pl", "month");
  });

  const handleTab = $(async (tab: Tab) => {
    activeTab.value = tab;
    await loadReport(tab, activePeriod.value);
  });

  const handlePeriod = $(async (period: string) => {
    activePeriod.value = period;
    await loadReport(activeTab.value, period);
  });

  const tabs: { key: Tab; label: string }[] = [
    { key: "pl", label: "Profit & Loss" },
    { key: "bs", label: "Balance Sheet" },
    { key: "tb", label: "Trial Balance" },
  ];

  return (
    <div>
      <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 1.25rem 0" }}>Financial Reports</h1>

      {/* Tab + Period row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", background: "var(--surface-2)", borderRadius: "0.5rem", padding: "3px", gap: "3px", border: "1px solid var(--border)" }}>
          {tabs.map(t => (
            <button key={t.key} type="button" onClick$={() => handleTab(t.key)}
              style={{
                padding: "0.375rem 0.875rem", border: "none", borderRadius: "0.375rem",
                background: activeTab.value === t.key ? "var(--text-primary)" : "transparent",
                color: activeTab.value === t.key ? "var(--surface-1)" : "var(--text-secondary)",
                fontWeight: activeTab.value === t.key ? 700 : 400,
                cursor: "pointer", fontSize: "0.875rem", transition: "all 150ms",
              }}>
              {t.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: "0.375rem" }}>
          {PERIODS.map(p => (
            <button key={p.key} type="button" onClick$={() => handlePeriod(p.key)}
              style={{
                padding: "0.375rem 0.75rem", border: "1px solid",
                borderColor: activePeriod.value === p.key ? "var(--accent)" : "var(--border)",
                borderRadius: "999px",
                background: activePeriod.value === p.key ? "rgba(99,102,241,0.1)" : "var(--surface-2)",
                color: activePeriod.value === p.key ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer", fontSize: "0.8125rem",
              }}>
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {loading.value ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {[...Array(4)].map((_, i) => <div key={i} style={{ height: "60px", background: "var(--surface-2)", borderRadius: "0.5rem", animation: "pulse 2s infinite" }} />)}
        </div>
      ) : (
        <>
          {/* P&L Report */}
          {activeTab.value === "pl" && plData.value && (() => {
            const pl = plData.value;
            return (
              <div>
                {/* KPI bar */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
                  {[
                    { label: "Revenue", value: pl.total_revenue, color: "#10b981" },
                    { label: "Expenses", value: pl.total_expenses, color: "#ef4444" },
                    { label: "Net Profit", value: pl.net_profit, color: pl.net_profit >= 0 ? "#10b981" : "#ef4444" },
                  ].map(k => (
                    <div key={k.label} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem" }}>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.5rem", textTransform: "uppercase" }}>{k.label}</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 800, color: k.color, fontVariantNumeric: "tabular-nums" }}>{fmt(k.value)}</div>
                    </div>
                  ))}
                </div>

                {/* Revenue section */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#10b981", margin: "0 0 0.5rem 0" }}>Revenue</h3>
                  {pl.revenue.length > 0 ? pl.revenue.map((a: any) => (
                    <div key={a.account_id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)22" }}>
                      <span style={{ fontSize: "0.875rem" }}>{a.account_name}</span>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#10b981", fontVariantNumeric: "tabular-nums" }}>{fmt(a.balance)}</span>
                    </div>
                  )) : <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", padding: "0.5rem 0.75rem" }}>No revenue recorded yet</div>}
                </div>

                {/* Expense section */}
                <div>
                  <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#ef4444", margin: "0 0 0.5rem 0" }}>Expenses</h3>
                  {pl.expenses.length > 0 ? pl.expenses.map((a: any) => (
                    <div key={a.account_id} style={{ display: "flex", justifyContent: "space-between", padding: "0.5rem 0.75rem", borderBottom: "1px solid var(--border)22" }}>
                      <span style={{ fontSize: "0.875rem" }}>{a.account_name}</span>
                      <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>{fmt(Math.abs(a.balance))}</span>
                    </div>
                  )) : <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", padding: "0.5rem 0.75rem" }}>No expenses recorded yet</div>}
                </div>
              </div>
            );
          })()}

          {/* Balance Sheet */}
          {activeTab.value === "bs" && bsData.value && (() => {
            const bs = bsData.value;
            const sections = [
              { label: "Assets",      data: bs.assets,      total: bs.total_assets,      color: "#3b82f6" },
              { label: "Liabilities", data: bs.liabilities, total: bs.total_liabilities, color: "#ef4444" },
              { label: "Equity",      data: bs.equity,      total: bs.total_equity,      color: "#8b5cf6" },
            ];
            return (
              <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
                {sections.map(s => (
                  <div key={s.label}>
                    <div style={{ display: "flex", justifyContent: "space-between", paddingBottom: "0.375rem", borderBottom: `2px solid ${s.color}`, marginBottom: "0.5rem" }}>
                      <h3 style={{ fontSize: "0.875rem", fontWeight: 700, color: s.color, margin: 0 }}>{s.label}</h3>
                      <span style={{ fontSize: "0.875rem", fontWeight: 700, color: s.color, fontVariantNumeric: "tabular-nums" }}>{fmt(s.total)}</span>
                    </div>
                    {s.data.length > 0 ? s.data.map((a: any) => (
                      <div key={a.account_id} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0.75rem" }}>
                        <span style={{ fontSize: "0.875rem", color: "var(--text-secondary)" }}>{a.account_name}</span>
                        <span style={{ fontSize: "0.875rem", fontVariantNumeric: "tabular-nums" }}>{fmt(a.balance)}</span>
                      </div>
                    )) : <div style={{ fontSize: "0.875rem", color: "var(--text-secondary)", padding: "0.375rem 0.75rem" }}>—</div>}
                  </div>
                ))}
                <div style={{ borderTop: "2px solid var(--border)", paddingTop: "0.75rem", display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                  <span>Total Assets = Liabilities + Equity</span>
                  <span style={{ color: (Math.abs(bs.total_assets - (bs.total_liabilities + bs.total_equity)) < 1) ? "#10b981" : "#ef4444" }}>
                    {(Math.abs(bs.total_assets - (bs.total_liabilities + bs.total_equity)) < 1) ? "✓ Balanced" : "⚠ Unbalanced"}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Trial Balance */}
          {activeTab.value === "tb" && tbData.value && (() => {
            const tb = tbData.value;
            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
                  <span style={{ fontWeight: 700, fontSize: "0.875rem" }}>Balance Check:</span>
                  <span style={{ fontSize: "0.875rem", fontWeight: 700, color: tb.is_balanced ? "#10b981" : "#ef4444" }}>
                    {tb.is_balanced ? "✓ Balanced" : "⚠ Unbalanced — check journal entries"}
                  </span>
                </div>
                <div style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", overflow: "hidden" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                    <thead style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                      <tr>
                        {["Code", "Account", "Debit", "Credit", "Net"].map(h => (
                          <th key={h} style={{ padding: "0.625rem 0.75rem", textAlign: h === "Code" || h === "Account" ? "left" : "right", fontWeight: 600, fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tb.rows.map((r: any) => (
                        <tr key={r.account_id} style={{ borderBottom: "1px solid var(--border)44" }}>
                          <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace", fontSize: "0.75rem", color: "var(--text-secondary)" }}>{r.account_code ?? "—"}</td>
                          <td style={{ padding: "0.5rem 0.75rem" }}>{r.account_name}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.total_debit > 0 ? fmt(r.total_debit) : "—"}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", color: "#10b981", fontVariantNumeric: "tabular-nums" }}>{r.total_credit > 0 ? fmt(r.total_credit) : "—"}</td>
                          <td style={{ padding: "0.5rem 0.75rem", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: r.net_balance > 0 ? "var(--text-primary)" : "#ef4444" }}>
                            {fmt(r.net_balance)}
                          </td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700, background: "var(--surface-2)" }}>
                        <td colSpan={2} style={{ padding: "0.625rem 0.75rem", fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>Total</td>
                        <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(tb.total_debit)}</td>
                        <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", color: "#10b981", fontVariantNumeric: "tabular-nums" }}>{fmt(tb.total_credit)}</td>
                        <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
});

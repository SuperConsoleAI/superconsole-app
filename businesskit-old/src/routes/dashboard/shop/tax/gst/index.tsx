// src/routes/dashboard/shop/tax/gst/index.tsx
// GST return tracking — monthly summary, invoice list, CSV export, mark as filed, portal instructions.

import { component$, useSignal, useContext, useVisibleTask$, useComputed$, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { LuDownload, LuInfo, LuFileSpreadsheet, LuCheckCircle2 } from "@qwikest/icons/lucide";
import { fmtMoney as fmt, downloadFile } from "~/lib/fin-format";
import { TaxCtx } from "../layout";

function getLast6Periods(): string[] {
  const d = new Date();
  const periods: string[] = [];
  for (let i = 0; i < 6; i++) {
    const m = d.getMonth() - i;
    const correctedMonth = m >= 0 ? m + 1 : 12 + m + 1;
    const correctedYear  = m >= 0 ? d.getFullYear() : d.getFullYear() - 1;
    periods.push(`${String(correctedMonth).padStart(2, "0")}-${correctedYear}`);
  }
  return periods;
}

export default component$(() => {
  const store        = useContext(TaxCtx);
  const periods      = getLast6Periods();
  const selectedPeriod = useSignal(periods[1]); // default = last month
  const summary      = useSignal<any | null>(null);
  const loading      = useSignal(false);
  const filing       = useSignal(false);
  const returnType   = useSignal("GSTR-3B");
  const arn          = useSignal("");
  const downloadSuccess = useSignal<string | null>(null);

  const loadSummary = $(async (period: string, rtype: string) => {
    loading.value = true;
    try {
      summary.value = await invoke("fin_get_gst_return_summary", { period, returnType: rtype });
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await loadSummary(selectedPeriod.value, returnType.value);
  });

  const handleMarkFiled = $(async () => {
    filing.value = true;
    try {
      await invoke("fin_mark_return_filed", {
        args: {
          period:      selectedPeriod.value,
          return_type: returnType.value,
          arn:         arn.value || null,
          filed_at:    null,
        },
      });
      await loadSummary(selectedPeriod.value, returnType.value);
      store.refresh();
    } finally {
      filing.value = false;
    }
  });

  // Filter invoices for selected period (MM-YYYY)
  const periodInvoices = useComputed$(() => {
    const [selM, selY] = selectedPeriod.value.split("-").map(Number);
    return store.invoices.filter((doc: any) => {
      if (!doc.doc_date) return false;
      const d = new Date(doc.doc_date * 1000);
      return (d.getMonth() + 1) === selM && d.getFullYear() === selY;
    });
  });

  const handleExportCSV = $(() => {
    if (!summary.value) return;
    const s = summary.value;
    let csv = `GST Return Report - ${returnType.value} (${selectedPeriod.value})\r\n`;
    csv += `Period,Return Type,Status,ARN,Taxable Sales,Total Tax,CGST Collected,SGST Collected,IGST Collected,ITC Claimed,Net Liability\r\n`;
    csv += `"${s.period}","${s.return_type}","${s.status}","${s.arn || ""}","${s.total_sales}","${s.total_tax}","${s.cgst_collected}","${s.sgst_collected}","${s.igst_collected}","${s.itc_claimed}","${s.net_liability}"\r\n\r\n`;
    
    csv += `Invoices for Period ${selectedPeriod.value}\r\n`;
    csv += `Doc Number,Date,Customer Name,Taxable Amount,Tax Amount,Grand Total,Status\r\n`;
    for (const inv of periodInvoices.value) {
      const dStr = inv.doc_date ? new Date(inv.doc_date * 1000).toISOString().split("T")[0] : "";
      csv += `"${inv.doc_number || inv.id}","${dStr}","${(inv.customer_name || "").replace(/"/g, '""')}","${inv.taxable_amt || 0}","${inv.tax_amount || 0}","${inv.grand_total || 0}","${inv.status || ""}"\r\n`;
    }

    const filename = `GST_Report_${returnType.value}_${selectedPeriod.value}.csv`;
    downloadFile(filename, csv, "text/csv;charset=utf-8;");
    downloadSuccess.value = `✓ Saved ${filename} to Downloads`;
    setTimeout(() => { downloadSuccess.value = null; }, 3500);
  });

  const handleExportJSON = $(() => {
    if (!summary.value) return;
    const s = summary.value;
    const exportData = {
      period: selectedPeriod.value,
      return_type: returnType.value,
      summary: s,
      invoices: periodInvoices.value.map((inv: any) => ({
        doc_number: inv.doc_number || inv.id,
        doc_date: inv.doc_date ? new Date(inv.doc_date * 1000).toISOString().split("T")[0] : null,
        customer_name: inv.customer_name || "Walk-in",
        taxable_amount: inv.taxable_amt || 0,
        tax_amount: inv.tax_amount || 0,
        grand_total: inv.grand_total || 0,
        status: inv.status || "confirmed",
      })),
      exported_at: new Date().toISOString(),
    };

    const filename = `GST_Report_${returnType.value}_${selectedPeriod.value}.json`;
    downloadFile(filename, JSON.stringify(exportData, null, 2), "application/json;charset=utf-8;");
    downloadSuccess.value = `✓ Saved ${filename} to Downloads`;
    setTimeout(() => { downloadSuccess.value = null; }, 3500);
  });

  const isCsvExported = downloadSuccess.value?.includes(".csv");
  const isJsonExported = downloadSuccess.value?.includes(".json");

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>GST Returns</h1>
          <select value={returnType.value}
            onChange$={$(async (e) => {
              returnType.value = (e.target as HTMLSelectElement).value;
              await loadSummary(selectedPeriod.value, returnType.value);
            })}
            style={{ padding: "0.375rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-2)", color: "var(--text-primary)", fontSize: "0.875rem", fontWeight: 600 }}>
            {["GSTR-1", "GSTR-3B"].map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>

        {summary.value && (
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button
              type="button"
              onClick$={handleExportCSV}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.45rem 0.875rem",
                background: isCsvExported ? "#10b981" : "var(--surface-2)",
                color: isCsvExported ? "#ffffff" : "var(--text-primary)",
                border: `1px solid ${isCsvExported ? "#10b981" : "var(--border)"}`,
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 200ms ease",
              }}
            >
              {isCsvExported ? (
                <>
                  <LuCheckCircle2 style={{ width: "0.875rem", height: "0.875rem" }} />
                  Exported CSV!
                </>
              ) : (
                <>
                  <LuDownload style={{ width: "0.875rem", height: "0.875rem" }} />
                  Export CSV
                </>
              )}
            </button>
            <button
              type="button"
              onClick$={handleExportJSON}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.375rem",
                padding: "0.45rem 0.875rem",
                background: isJsonExported ? "#10b981" : "var(--surface-2)",
                color: isJsonExported ? "#ffffff" : "var(--text-primary)",
                border: `1px solid ${isJsonExported ? "#10b981" : "var(--border)"}`,
                borderRadius: "0.375rem",
                fontSize: "0.8125rem",
                fontWeight: "600",
                cursor: "pointer",
                transition: "all 200ms ease",
              }}
            >
              {isJsonExported ? (
                <>
                  <LuCheckCircle2 style={{ width: "0.875rem", height: "0.875rem" }} />
                  Exported JSON!
                </>
              ) : (
                <>
                  <LuDownload style={{ width: "0.875rem", height: "0.875rem" }} />
                  Export JSON
                </>
              )}
            </button>
          </div>
        )}
      </div>

      {/* Floating Animated Toast Notification */}
      {downloadSuccess.value && (
        <div
          style={{
            position: "fixed",
            bottom: "2rem",
            right: "2rem",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            padding: "0.875rem 1.25rem",
            background: "#10b981",
            color: "#ffffff",
            borderRadius: "0.5rem",
            boxShadow: "0 10px 25px -5px rgba(16, 185, 129, 0.4), 0 8px 10px -6px rgba(16, 185, 129, 0.2)",
            fontSize: "0.875rem",
            fontWeight: "600",
            animation: "slideInUp 0.3s cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "1.5rem", height: "1.5rem", borderRadius: "50%", background: "rgba(255,255,255,0.2)" }}>
            <LuCheckCircle2 style={{ width: "1rem", height: "1rem" }} />
          </div>
          <span>{downloadSuccess.value}</span>
        </div>
      )}

      {/* Period selector */}
      <div style={{ display: "flex", gap: "0.375rem", marginBottom: "1.5rem", flexWrap: "wrap" }}>
        {periods.map(p => (
          <button key={p} type="button"
            onClick$={$(async () => {
              selectedPeriod.value = p;
              await loadSummary(p, returnType.value);
            })}
            style={{
              padding: "0.375rem 0.875rem", border: "1px solid",
              borderColor: selectedPeriod.value === p ? "var(--accent)" : "var(--border)",
              borderRadius: "999px",
              background: selectedPeriod.value === p ? "rgba(99,102,241,0.1)" : "var(--surface-2)",
              color: selectedPeriod.value === p ? "var(--accent)" : "var(--text-secondary)",
              cursor: "pointer", fontSize: "0.8125rem", fontWeight: selectedPeriod.value === p ? 600 : 500,
            }}>
            {p}
          </button>
        ))}
      </div>

      {loading.value ? (
        <div style={{ height: "200px", background: "var(--surface-2)", borderRadius: "0.75rem", animation: "pulse 2s infinite" }} />
      ) : summary.value ? (() => {
        const s = summary.value;
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
            {/* Top Summary Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem" }}>
              {[
                { label: "Taxable Sales", value: s.total_sales, color: "var(--text-primary)" },
                { label: "Total Tax",     value: s.total_tax,   color: "#ef4444" },
                { label: "Net Liability", value: s.net_liability, color: "#ef4444" },
              ].map(k => (
                <div key={k.label} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem" }}>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.375rem", textTransform: "uppercase" }}>{k.label}</div>
                  <div style={{ fontSize: "1.375rem", fontWeight: 800, color: k.color, fontVariantNumeric: "tabular-nums" }}>{fmt(k.value)}</div>
                </div>
              ))}
            </div>

            {/* GST breakdown */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem" }}>
              <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: "0 0 1rem 0" }}>Tax Breakdown ({selectedPeriod.value})</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "1rem" }}>
                {[
                  { label: "CGST", value: s.cgst_collected },
                  { label: "SGST", value: s.sgst_collected },
                  { label: "IGST", value: s.igst_collected },
                ].map(t => (
                  <div key={t.label} style={{ textAlign: "center", background: "var(--surface-3)", padding: "0.75rem", borderRadius: "0.5rem" }}>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, marginBottom: "0.25rem" }}>{t.label}</div>
                    <div style={{ fontSize: "1.125rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(t.value)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Status + Filing Bar */}
            <div style={{ background: s.status === "filed" ? "rgba(16,185,129,0.06)" : "rgba(251,191,36,0.06)", border: `1px solid ${s.status === "filed" ? "rgba(16,185,129,0.25)" : "rgba(251,191,36,0.25)"}`, borderRadius: "0.75rem", padding: "1.25rem" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontWeight: 700, color: s.status === "filed" ? "#10b981" : "#f59e0b", marginBottom: "0.25rem" }}>
                    {s.status === "filed" ? "✓ Filed on GST Portal" : "⏳ Pending Filing"}
                  </div>
                  {s.arn ? (
                    <div style={{ fontSize: "0.8125rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>ARN: {s.arn}</div>
                  ) : (
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                      File {returnType.value} on the GST Portal and enter your ARN below.
                    </div>
                  )}
                </div>
                {s.status !== "filed" && (
                  <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                    <input value={arn.value}
                      onInput$={(e) => { arn.value = (e.target as HTMLInputElement).value; }}
                      placeholder="Enter ARN (e.g. AA2707240001234)"
                      style={{ padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", width: "240px" }}
                    />
                    <button type="button" onClick$={handleMarkFiled} disabled={filing.value}
                      style={{ padding: "0.5rem 1.25rem", background: "#10b981", border: "none", borderRadius: "0.375rem", color: "#fff", fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
                      {filing.value ? "Marking…" : "Mark as Filed"}
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Invoices List Table for this period */}
            <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.875rem" }}>
                <h3 style={{ fontSize: "0.875rem", fontWeight: 600, margin: 0, display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <LuFileSpreadsheet style={{ width: "1rem", height: "1rem", color: "var(--accent)" }} />
                  Invoices Included in {selectedPeriod.value} ({periodInvoices.value.length})
                </h3>
              </div>

              {periodInvoices.value.length === 0 ? (
                <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.8125rem", border: "1px dashed var(--border)", borderRadius: "0.5rem" }}>
                  No confirmed invoices recorded for {selectedPeriod.value}.
                </div>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem", textAlign: "left" }}>
                    <thead>
                      <tr style={{ borderBottom: "1px solid var(--border)", color: "var(--text-secondary)" }}>
                        <th style={{ padding: "0.5rem" }}>Doc #</th>
                        <th style={{ padding: "0.5rem" }}>Date</th>
                        <th style={{ padding: "0.5rem" }}>Customer</th>
                        <th style={{ padding: "0.5rem", textAlign: "right" }}>Taxable</th>
                        <th style={{ padding: "0.5rem", textAlign: "right" }}>Tax Amount</th>
                        <th style={{ padding: "0.5rem", textAlign: "right" }}>Grand Total</th>
                        <th style={{ padding: "0.5rem", textAlign: "center" }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {periodInvoices.value.map((inv: any) => (
                        <tr key={inv.id} style={{ borderBottom: "1px solid var(--border)" }}>
                          <td style={{ padding: "0.625rem 0.5rem", fontWeight: 600 }}>{inv.doc_number || inv.id}</td>
                          <td style={{ padding: "0.625rem 0.5rem", color: "var(--text-secondary)" }}>
                            {inv.doc_date ? new Date(inv.doc_date * 1000).toLocaleDateString("en-IN") : "—"}
                          </td>
                          <td style={{ padding: "0.625rem 0.5rem" }}>{inv.customer_name || "Walk-in"}</td>
                          <td style={{ padding: "0.625rem 0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                            ₹{(inv.taxable_amt ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "0.625rem 0.5rem", textAlign: "right", color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>
                            ₹{(inv.tax_amount ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "0.625rem 0.5rem", textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                            ₹{(inv.grand_total ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: "0.625rem 0.5rem", textAlign: "center" }}>
                            <span style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem", borderRadius: "0.25rem", background: "rgba(16,185,129,0.1)", color: "#10b981", fontWeight: 600 }}>
                              {inv.status || "confirmed"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Instruction Box — Styled matching ConnectionsModal */}
            <div style={{ padding: "1rem 1.25rem", borderRadius: "0.5rem", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", color: "var(--text-primary)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.5rem", color: "#3b82f6" }}>
                <LuInfo style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                <span>How to File {returnType.value} on the Official GST Portal</span>
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.5rem", lineHeight: "1.4" }}>
                Follow these simple steps to complete your monthly filing:
              </div>
              <ol style={{ margin: "0 0 0.75rem 1.25rem", padding: 0, fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.6" }}>
                <li>Login to the official <a href="https://services.gst.gov.in/services/login" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #3b82f6)", textDecoration: "underline", fontWeight: 600 }}>GST Portal (services.gst.gov.in)</a>.</li>
                <li>Navigate to <strong>Services → Returns → Returns Dashboard</strong> and pick Financial Year & Period (<strong>{selectedPeriod.value}</strong>).</li>
                {returnType.value === "GSTR-1" ? (
                  <li>Click <strong>GSTR-1 (Details of outward supplies)</strong>. Enter B2B invoices and B2C sales from the summary above or import the exported CSV. File by the <strong>11th</strong>.</li>
                ) : (
                  <li>Click <strong>GSTR-3B (Monthly Summary)</strong>. Verify Outward Taxable Supplies (Table 3.1) and Eligible ITC (Table 4). Pay net liability and submit by the <strong>20th</strong>.</li>
                )}
                <li>After filing, copy the generated <strong>ARN (Application Reference Number)</strong>, paste it above, and click <strong>Mark as Filed</strong> to update your local records.</li>
              </ol>
              <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", background: "var(--surface-3)", padding: "0.375rem 0.5rem", borderRadius: "0.25rem" }}>
                💡 <em>Note: Aggregate figures are computed on-the-fly from confirmed documents in <code>shop_documents</code>. Filing confirmation is tracked in <code>fin_tax_returns</code>.</em>
              </div>
            </div>
          </div>
        );
      })() : <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-secondary)" }}>No data for this period.</div>}
    </div>
  );
});

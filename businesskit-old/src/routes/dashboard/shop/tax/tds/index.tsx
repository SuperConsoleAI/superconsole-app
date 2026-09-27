import { component$, useSignal, useStylesScoped$, useContext, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { fmtMoney as fmt, fmtDate } from "~/lib/fin-format";
import { TaxCtx } from "../layout";

const TDS_SECTIONS = [
  { code: "194A",  label: "194A — Interest" },
  { code: "194C",  label: "194C — Contractor" },
  { code: "194D",  label: "194D — Insurance" },
  { code: "194H",  label: "194H — Commission" },
  { code: "194I",  label: "194I — Rent" },
  { code: "194J",  label: "194J — Professional Fees" },
  { code: "194Q",  label: "194Q — Purchase of Goods" },
];
const TCS_SECTIONS = [
  { code: "206C(1)",  label: "206C(1) — Scrap" },
  { code: "206C(1H)", label: "206C(1H) — Sale of Goods >₹50L" },
];

const TOGGLE_STYLES = `
  .tds-toggle-btn {
    padding: 0.375rem 1.25rem;
    border: 1px solid var(--border);
    border-radius: 0.375rem;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    font-weight: 500;
    font-size: 0.875rem;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .tds-toggle-btn.active {
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    border-color: var(--button-primary-bg);
    font-weight: 700;
  }
`;

const inputStyle = "width:100%;padding:0.5rem 0.75rem;border:1px solid var(--border);border-radius:0.375rem;background:var(--field-fill,var(--surface-3));color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;";

export default component$(() => {
  useStylesScoped$(TOGGLE_STYLES);

  const store        = useContext(TaxCtx);
  const saving       = useSignal(false);
  const showForm     = useSignal(false);
  const activeType   = useSignal<"TDS" | "TCS">("TDS");
  const err          = useSignal<string | null>(null);
  const searchQuery  = useSignal("");
  const visibleLimit = useSignal(30);

  const form = useSignal({
    section_code: "194J",
    base_amount:  "",
    rate_pct:     "10",
    challan_no:   "",
    period:       "",
  });

  const handleSave = $(async () => {
    const base = parseFloat(form.value.base_amount);
    if (isNaN(base) || base <= 0) { err.value = "Enter a valid base amount."; return; }
    saving.value = true;
    err.value = null;
    try {
      const cmd = activeType.value === "TDS" ? "fin_log_tds_entry" : "fin_log_tcs_entry";
      await invoke(cmd, {
        args: {
          entry_type:   activeType.value,
          section_code: form.value.section_code,
          party_id:     null,
          base_amount:  base,
          rate_pct:     parseFloat(form.value.rate_pct) || 10,
          challan_no:   form.value.challan_no || null,
          period:       form.value.period || null,
        },
      });
      form.value = { section_code: "194J", base_amount: "", rate_pct: "10", challan_no: "", period: "" };
      showForm.value = false;
      await store.refresh();
    } catch (e: any) {
      err.value = e?.message ?? String(e);
    } finally {
      saving.value = false;
    }
  });

  if (store.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {[...Array(4)].map((_, i) => <div key={i} style={{ height: "72px", background: "var(--surface-2)", borderRadius: "0.625rem", animation: "pulse 2s infinite" }} />)}
      </div>
    );
  }

  const tdsEntries = store.tdsEntries.filter((e: any) => e.entry_type === "TDS");
  const tcsEntries = store.tdsEntries.filter((e: any) => e.entry_type === "TCS");
  const tdsTotal   = tdsEntries.reduce((s: number, e: any) => s + (e.tds_tcs_amount ?? 0), 0);
  const tcsTotal   = tcsEntries.reduce((s: number, e: any) => s + (e.tds_tcs_amount ?? 0), 0);

  const q = searchQuery.value.trim().toLowerCase();
  const filteredEntries = store.tdsEntries.filter((e: any) => {
    if (!q) return true;
    return (
      (e.section_code && e.section_code.toLowerCase().includes(q)) ||
      (e.entry_type && e.entry_type.toLowerCase().includes(q)) ||
      (e.challan_no && e.challan_no.toLowerCase().includes(q)) ||
      (e.party_id && e.party_id.toLowerCase().includes(q))
    );
  });

  const displayedEntries = filteredEntries.slice(0, visibleLimit.value);

  return (
    <div>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>TDS / TCS</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.8125rem" }}>
            Tax Deducted at Source (TDS) and Tax Collected at Source (TCS) entries. Showing {displayedEntries.length} of {filteredEntries.length} entries.
          </p>
        </div>
        <button type="button"
          class="btn btn-secondary"
          onClick$={() => { showForm.value = !showForm.value; err.value = null; }}>
          {showForm.value ? "✕ Cancel" : "+ Log Entry"}
        </button>
      </div>

      {/* Summary cards */}
      {store.tdsEntries.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
          <div style={{ background: "rgba(59,130,246,0.06)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: "0.75rem", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#3b82f6", marginBottom: "0.375rem" }}>TDS DEDUCTED</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(tdsTotal)}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{tdsEntries.length} entries</div>
          </div>
          <div style={{ background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)", borderRadius: "0.75rem", padding: "1.25rem" }}>
            <div style={{ fontSize: "0.75rem", fontWeight: 600, color: "#10b981", marginBottom: "0.375rem" }}>TCS COLLECTED</div>
            <div style={{ fontSize: "1.5rem", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmt(tcsTotal)}</div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{tcsEntries.length} entries</div>
          </div>
        </div>
      )}

      {/* Search Input Bar */}
      <div style={{ marginBottom: "1.25rem" }}>
        <input
          type="text"
          value={searchQuery.value}
          onInput$={(e) => {
            searchQuery.value = (e.target as HTMLInputElement).value;
            visibleLimit.value = 30;
          }}
          placeholder="🔍 Search TDS / TCS entries by section code, type, challan..."
          style={{
            width: "100%",
            padding: "0.625rem 0.875rem",
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            borderRadius: "0.5rem",
            color: "var(--text-primary)",
            fontSize: "0.875rem",
            boxSizing: "border-box",
          }}
        />
      </div>

      {/* Log form */}
      {showForm.value && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" }}>

          {/* TDS / TCS toggle */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
            {(["TDS", "TCS"] as const).map(t => (
              <button key={t} type="button"
                class={`tds-toggle-btn${activeType.value === t ? " active" : ""}`}
                onClick$={() => {
                  activeType.value = t;
                  form.value = { ...form.value, section_code: t === "TDS" ? "194J" : "206C(1H)" };
                }}>
                {t}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Section</label>
              <select value={form.value.section_code}
                onChange$={(e) => { form.value = { ...form.value, section_code: (e.target as HTMLSelectElement).value }; }}
                style={inputStyle + "height:38px;"}>
                {(activeType.value === "TDS" ? TDS_SECTIONS : TCS_SECTIONS).map(s => (
                  <option key={s.code} value={s.code}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Base Amount *</label>
              <input type="number" value={form.value.base_amount}
                onInput$={(e) => { form.value = { ...form.value, base_amount: (e.target as HTMLInputElement).value }; }}
                placeholder="100000"
                style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Rate (%)</label>
              <input type="number" value={form.value.rate_pct}
                onInput$={(e) => { form.value = { ...form.value, rate_pct: (e.target as HTMLInputElement).value }; }}
                style={inputStyle} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Challan No.</label>
              <input value={form.value.challan_no}
                onInput$={(e) => { form.value = { ...form.value, challan_no: (e.target as HTMLInputElement).value }; }}
                placeholder="Optional"
                style={inputStyle} />
            </div>
          </div>

          {form.value.base_amount && !isNaN(parseFloat(form.value.base_amount)) && (
            <div style={{ marginBottom: "0.75rem", fontSize: "0.875rem", color: "var(--text-secondary)" }}>
              {activeType.value} = {fmt(parseFloat(form.value.base_amount) * parseFloat(form.value.rate_pct || "0") / 100)}
            </div>
          )}

          {err.value && <div style={{ color: "#ef4444", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>{err.value}</div>}

          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button type="button" class="btn btn-primary" onClick$={handleSave} disabled={saving.value}>
              {saving.value ? "Saving…" : "Log"}
            </button>
            <button type="button" class="btn btn-secondary" onClick$={() => { showForm.value = false; err.value = null; }}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {filteredEntries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
          {searchQuery.value
            ? `No entries matching "${searchQuery.value}".`
            : "No entries yet. Log a TDS deduction or TCS collection above."}
        </div>
      ) : (
        <div style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
            <thead style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
              <tr>
                {["Type", "Section", "Base Amount", "Rate", "Amount", "Challan", "Date"].map(h => (
                  <th key={h} style={{ padding: "0.625rem 0.75rem", textAlign: "left", fontWeight: 600, fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {displayedEntries.map((e: any) => (
                <tr key={e.id} style={{ borderBottom: "1px solid var(--border)" }}>
                  <td style={{ padding: "0.5rem 0.75rem" }}>
                    <span style={{ fontWeight: 600, fontSize: "0.75rem", padding: "0.15rem 0.5rem", borderRadius: "999px",
                      background: e.entry_type === "TDS" ? "rgba(59,130,246,0.1)" : "rgba(16,185,129,0.1)",
                      color: e.entry_type === "TDS" ? "#3b82f6" : "#10b981" }}>
                      {e.entry_type}
                    </span>
                  </td>
                  <td style={{ padding: "0.5rem 0.75rem", fontFamily: "monospace" }}>{e.section_code}</td>
                  <td style={{ padding: "0.5rem 0.75rem", fontVariantNumeric: "tabular-nums" }}>{fmt(e.base_amount)}</td>
                  <td style={{ padding: "0.5rem 0.75rem" }}>{e.rate_pct}%</td>
                  <td style={{ padding: "0.5rem 0.75rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(e.tds_tcs_amount)}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)" }}>{e.challan_no ?? "—"}</td>
                  <td style={{ padding: "0.5rem 0.75rem", color: "var(--text-secondary)" }}>{fmtDate(e.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {filteredEntries.length > visibleLimit.value && (
            <div style={{ textAlign: "center", padding: "0.75rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
              <button
                type="button"
                class="btn btn-secondary btn-sm"
                onClick$={() => { visibleLimit.value += 30; }}
              >
                + Load More (Showing {displayedEntries.length} of {filteredEntries.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

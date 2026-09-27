import { component$, useSignal, useContext, $ } from "@builder.io/qwik";
import { fmtMoney as fmt, fmtDate } from "~/lib/fin-format";
import { AccountsCtx } from "../layout";

export default component$(() => {
  const store        = useContext(AccountsCtx);
  const expanded     = useSignal<string | null>(null);
  const searchQuery  = useSignal("");
  const visibleLimit = useSignal(30);

  if (store.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: "64px", background: "var(--surface-2)", borderRadius: "0.625rem", animation: "pulse 2s infinite" }} />
        ))}
      </div>
    );
  }

  const q = searchQuery.value.trim().toLowerCase();
  const filteredEntries = store.journalEntries.filter((e: any) => {
    if (!q) return true;
    return (
      (e.narration && e.narration.toLowerCase().includes(q)) ||
      (e.document_id && e.document_id.toLowerCase().includes(q)) ||
      (e.entry_type && e.entry_type.toLowerCase().includes(q)) ||
      (e.id && e.id.toLowerCase().includes(q))
    );
  });

  const displayedEntries = filteredEntries.slice(0, visibleLimit.value);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>Journal Entries</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: 0 }}>
            Auto-posted by the system on every invoice, payment, and expense. Showing {displayedEntries.length} of {filteredEntries.length} entries.
          </p>
        </div>
      </div>

      {/* Search Input Bar */}
      <div style={{ marginBottom: "1.25rem" }}>
        <input
          type="text"
          value={searchQuery.value}
          onInput$={(e) => {
            searchQuery.value = (e.target as HTMLInputElement).value;
            visibleLimit.value = 30; // reset visible count on search
          }}
          placeholder="🔍 Search journal entries by narration, document ID, entry type..."
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

      {filteredEntries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
          {searchQuery.value
            ? `No journal entries matching "${searchQuery.value}".`
            : "No journal entries yet. Create an invoice or log an expense to see auto-posted entries here."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {displayedEntries.map((e: any) => {
            const isOpen = expanded.value === e.id;
            return (
              <div key={e.id} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.625rem", overflow: "hidden" }}>
                <button type="button"
                  onClick$={$(() => { expanded.value = isOpen ? null : e.id; })}
                  style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.875rem 1rem", background: "transparent", border: "none", cursor: "pointer", textAlign: "left", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flex: 1 }}>
                    <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: e.is_reconciled ? "#10b981" : "var(--accent)", flexShrink: 0 }} />
                    <div>
                      <div style={{ fontWeight: 500, fontSize: "0.875rem", color: "var(--text-primary)" }}>{e.narration}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {fmtDate(e.entry_date)}
                        {e.document_id && ` · ${e.document_id}`}
                        {e.is_reconciled ? " · ✓ Reconciled" : ""}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: "0.875rem", fontVariantNumeric: "tabular-nums" }}>{fmt(e.total_debit)}</div>
                    <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{e.entry_type}</div>
                  </div>
                  <span style={{ color: "var(--text-secondary)", fontSize: "0.875rem" }}>{isOpen ? "▲" : "▼"}</span>
                </button>

                {isOpen && e.lines?.length > 0 && (
                  <div style={{ borderTop: "1px solid var(--border)", padding: "0.75rem 1rem" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                      <thead>
                        <tr style={{ borderBottom: "1px solid var(--border)" }}>
                          {["Account", "Description", "Debit", "Credit"].map(h => (
                            <th key={h} style={{ padding: "0.375rem 0.5rem", textAlign: h === "Debit" || h === "Credit" ? "right" : "left", color: "var(--text-secondary)", fontWeight: 600, fontSize: "0.75rem", textTransform: "uppercase" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {e.lines.map((l: any) => (
                          <tr key={l.id} style={{ borderBottom: "1px solid var(--border)" }}>
                            <td style={{ padding: "0.375rem 0.5rem", fontWeight: 500 }}>{l.account_name ?? l.account_id}</td>
                            <td style={{ padding: "0.375rem 0.5rem", color: "var(--text-secondary)" }}>{l.description ?? "—"}</td>
                            <td style={{ padding: "0.375rem 0.5rem", textAlign: "right", color: l.debit > 0 ? "var(--text-primary)" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                              {l.debit > 0 ? fmt(l.debit) : "—"}
                            </td>
                            <td style={{ padding: "0.375rem 0.5rem", textAlign: "right", color: l.credit > 0 ? "#10b981" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                              {l.credit > 0 ? fmt(l.credit) : "—"}
                            </td>
                          </tr>
                        ))}
                        <tr style={{ borderTop: "2px solid var(--border)", fontWeight: 700 }}>
                          <td colSpan={2} style={{ padding: "0.5rem", color: "var(--text-secondary)", fontSize: "0.75rem", textTransform: "uppercase" }}>Total</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(e.total_debit)}</td>
                          <td style={{ padding: "0.5rem", textAlign: "right", color: "#10b981", fontVariantNumeric: "tabular-nums" }}>{fmt(e.total_credit)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {filteredEntries.length > visibleLimit.value && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <button
                type="button"
                class="btn btn-secondary"
                onClick$={() => { visibleLimit.value += 30; }}
                style={{ padding: "0.5rem 1.5rem", fontSize: "0.8125rem", fontWeight: 600 }}
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

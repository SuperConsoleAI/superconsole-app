// src/routes/dashboard/accounts/bank/index.tsx
// Bank reconciliation — list bank accounts, import CSV, match transactions.

import { component$, useSignal, useVisibleTask$, useContext, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { fmtMoney, fmtDate } from "~/lib/fin-format";
import { AccountsCtx } from "../layout";

const fmt = (n: number) => fmtMoney(n);

export default component$(() => {
  const store         = useContext(AccountsCtx);
  const transactions  = useSignal<any[]>([]);
  const selectedBank  = useSignal<string | null>(null);
  const importing     = useSignal(false);
  const showNewBank   = useSignal(false);
  const unmatchOnly   = useSignal(false);
  const importMsg     = useSignal<string | null>(null);
  const searchQuery   = useSignal("");
  const visibleLimit  = useSignal(30);

  // New bank account form
  const bankName   = useSignal("");
  const bankNumber = useSignal("");
  const bankIfsc   = useSignal("");

  const loadTransactions = $(async (bankId: string) => {
    try {
      const data = await invoke("fin_list_bank_transactions", {
        bankAccountId: bankId,
        unmatchedOnly: unmatchOnly.value,
      }) as any[];
      transactions.value = Array.isArray(data) ? data : [];
    } catch {
      transactions.value = [];
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => store.bankAccounts.length);
    if (store.bankAccounts.length > 0 && !selectedBank.value) {
      selectedBank.value = store.bankAccounts[0].id;
      await loadTransactions(store.bankAccounts[0].id);
    }
  });

  const handleImportCSV = $(async () => {
    if (!selectedBank.value) return;
    const { open } = await import("@tauri-apps/plugin-dialog");
    const path = await open({ filters: [{ name: "CSV", extensions: ["csv"] }] });
    if (!path) return;

    importing.value = true;
    importMsg.value = null;
    try {
      const count = await invoke("fin_import_bank_statement_from_path", {
        bankAccountId: selectedBank.value,
        filePath: path as string,
      }) as number;
      importMsg.value = `✓ Imported ${count} transactions`;
      await loadTransactions(selectedBank.value);
      await store.refresh();
    } catch (e: any) {
      importMsg.value = `Error: ${e?.message ?? String(e)}`;
    } finally {
      importing.value = false;
    }
  });

  const handleAddBank = $(async () => {
    if (!bankName.value.trim()) return;
    await invoke("fin_create_bank_account", {
      args: {
        bank_name:      bankName.value,
        account_number: bankNumber.value || null,
        ifsc_code:      bankIfsc.value || null,
      },
    });
    bankName.value = "";
    bankNumber.value = "";
    bankIfsc.value = "";
    showNewBank.value = false;
    await store.refresh();
  });

  if (store.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: "64px", background: "var(--surface-2)", borderRadius: "0.625rem", animation: "pulse 2s infinite" }} />
        ))}
      </div>
    );
  }

  const q = searchQuery.value.trim().toLowerCase();
  const filteredTransactions = transactions.value.filter((t: any) => {
    if (!q) return true;
    return (
      (t.description && t.description.toLowerCase().includes(q)) ||
      (t.reference_no && t.reference_no.toLowerCase().includes(q)) ||
      (t.id && t.id.toLowerCase().includes(q))
    );
  });

  const displayedTransactions = filteredTransactions.slice(0, visibleLimit.value);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>Bank & Cash</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.8125rem" }}>
            Reconcile bank accounts, import statements, match transactions to journal entries.
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" class="btn btn-secondary"
            onClick$={() => { showNewBank.value = !showNewBank.value; }}>
            {showNewBank.value ? "✕ Cancel" : "+ Add Bank Account"}
          </button>
          {store.bankAccounts.length > 0 && (
            <button type="button" class="btn btn-primary" onClick$={handleImportCSV} disabled={importing.value}>
              {importing.value ? "Importing…" : "⬆ Import CSV Statement"}
            </button>
          )}
        </div>
      </div>

      {showNewBank.value && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 1rem 0" }}>New Bank Account</h3>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Bank Name *</label>
              <input value={bankName.value}
                onInput$={(e) => { bankName.value = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. HDFC Current Account"
                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Account Number</label>
              <input value={bankNumber.value}
                onInput$={(e) => { bankNumber.value = (e.target as HTMLInputElement).value; }}
                placeholder="XXXXXXXX1234"
                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>IFSC / Code</label>
              <input value={bankIfsc.value}
                onInput$={(e) => { bankIfsc.value = (e.target as HTMLInputElement).value; }}
                placeholder="HDFC0001234"
                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }} />
            </div>
          </div>
          <button type="button" class="btn btn-primary" onClick$={handleAddBank}>Save Bank Account</button>
        </div>
      )}

      {store.bankAccounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "4rem 2rem", color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
          No bank accounts added yet. Click <strong>+ Add Bank Account</strong> to add your business bank or cash register.
        </div>
      ) : (
        <>
          {/* Bank selector pills */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {store.bankAccounts.map((ba: any) => (
              <button key={ba.id} type="button"
                onClick$={$(async () => { selectedBank.value = ba.id; await loadTransactions(ba.id); })}
                style={{
                  padding: "0.5rem 1rem", borderRadius: "0.5rem", border: "1px solid var(--border)",
                  background: selectedBank.value === ba.id ? "var(--text-primary)" : "var(--surface-2)",
                  color: selectedBank.value === ba.id ? "var(--surface-1)" : "var(--text-primary)",
                  cursor: "pointer", fontSize: "0.875rem",
                  fontWeight: selectedBank.value === ba.id ? 600 : 400,
                }}>
                🏦 {ba.bank_name}
                {ba.account_number && <span style={{ opacity: 0.6, fontSize: "0.75rem" }}> ···{ba.account_number.slice(-4)}</span>}
              </button>
            ))}
          </div>

          {importMsg.value && (
            <div style={{ padding: "0.75rem 1rem", borderRadius: "0.5rem", marginBottom: "1rem",
              background: importMsg.value.startsWith("✓") ? "rgba(16,185,129,0.08)" : "rgba(239,68,68,0.08)",
              border: `1px solid ${importMsg.value.startsWith("✓") ? "rgba(16,185,129,0.25)" : "rgba(239,68,68,0.25)"}`,
              color: importMsg.value.startsWith("✓") ? "#10b981" : "#ef4444",
              fontSize: "0.875rem" }}>
              {importMsg.value}
            </div>
          )}

          {/* Search Input Bar */}
          <div style={{ marginBottom: "1rem" }}>
            <input
              type="text"
              value={searchQuery.value}
              onInput$={(e) => {
                searchQuery.value = (e.target as HTMLInputElement).value;
                visibleLimit.value = 30;
              }}
              placeholder="🔍 Search bank transactions by description, reference..."
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

          {/* Transactions list controls */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", cursor: "pointer" }}>
              <input type="checkbox" checked={unmatchOnly.value}
                onChange$={$(async (e) => {
                  unmatchOnly.value = (e.target as HTMLInputElement).checked;
                  if (selectedBank.value) await loadTransactions(selectedBank.value);
                })} />
              Unmatched only
            </label>
            <span style={{ color: "var(--text-secondary)", fontSize: "0.8125rem" }}>
              Showing {displayedTransactions.length} of {filteredTransactions.length} rows
            </span>
          </div>

          {displayedTransactions.length > 0 ? (
            <div style={{ border: "1px solid var(--border)", borderRadius: "0.75rem", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8125rem" }}>
                <thead style={{ background: "var(--surface-2)", borderBottom: "1px solid var(--border)" }}>
                  <tr>
                    {["Date", "Description", "Debit", "Credit", "Balance", "Status"].map(h => (
                      <th key={h} style={{ padding: "0.625rem 0.75rem", textAlign: h === "Debit" || h === "Credit" || h === "Balance" ? "right" : "left", fontWeight: 600, fontSize: "0.75rem", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displayedTransactions.map((t: any) => (
                    <tr key={t.id} style={{ borderBottom: "1px solid var(--border)" }}>
                      <td style={{ padding: "0.625rem 0.75rem", whiteSpace: "nowrap" }}>{fmtDate(t.txn_date)}</td>
                      <td style={{ padding: "0.625rem 0.75rem", maxWidth: "250px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description ?? "—"}</td>
                      <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", color: t.debit > 0 ? "#ef4444" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                        {t.debit > 0 ? fmt(t.debit) : "—"}
                      </td>
                      <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", color: t.credit > 0 ? "#10b981" : "var(--text-secondary)", fontVariantNumeric: "tabular-nums" }}>
                        {t.credit > 0 ? fmt(t.credit) : "—"}
                      </td>
                      <td style={{ padding: "0.625rem 0.75rem", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmt(t.balance)}</td>
                      <td style={{ padding: "0.625rem 0.75rem" }}>
                        <span style={{
                          fontSize: "0.7rem", fontWeight: 600, padding: "0.2rem 0.5rem", borderRadius: "999px",
                          background: t.is_reconciled ? "rgba(16,185,129,0.1)" : "rgba(251,191,36,0.1)",
                          color: t.is_reconciled ? "#10b981" : "#f59e0b",
                        }}>
                          {t.is_reconciled ? "Matched" : "Unmatched"}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredTransactions.length > visibleLimit.value && (
                <div style={{ textAlign: "center", padding: "0.75rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    onClick$={() => { visibleLimit.value += 30; }}
                  >
                    + Load More (Showing {displayedTransactions.length} of {filteredTransactions.length})
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
              {searchQuery.value ? `No transactions matching "${searchQuery.value}".` : "No transactions yet. Import a bank statement CSV to get started."}
            </div>
          )}
        </>
      )}
    </div>
  );
});

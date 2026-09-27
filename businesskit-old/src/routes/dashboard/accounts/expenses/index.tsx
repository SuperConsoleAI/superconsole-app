import { component$, useSignal, useContext, useComputed$, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { fmtMoney as fmt, fmtDate } from "~/lib/fin-format";
import { AccountsCtx } from "../layout";

const PAYMENT_MODES = [
  { id: "cash",   label: "💵 Cash" },
  { id: "bank",   label: "🏦 Bank" },
  { id: "card",   label: "💳 Card" },
  { id: "upi",    label: "📱 UPI" },
  { id: "cheque", label: "📄 Cheque" },
];

function getCatColor(cat: string): string {
  const c = (cat || "").toLowerCase();
  if (c.includes("rent")) return "#3b82f6";
  if (c.includes("sal") || c.includes("wage")) return "#8b5cf6";
  if (c.includes("util") || c.includes("electric") || c.includes("power")) return "#f59e0b";
  if (c.includes("mktg") || c.includes("market") || c.includes("ad") || c.includes("promo")) return "#ec4899";
  if (c.includes("travel") || c.includes("transport") || c.includes("fuel")) return "#06b6d4";
  if (c.includes("cogs") || c.includes("cost of goods")) return "#ef4444";
  if (c.includes("round") || c.includes("adjust")) return "#10b981";
  return "#6b7280";
}

export default component$(() => {
  const store        = useContext(AccountsCtx);
  const saving       = useSignal(false);
  const showForm     = useSignal(false);
  const err          = useSignal<string | null>(null);
  const searchQuery  = useSignal("");
  const visibleLimit = useSignal(30);

  const expenseAccounts = useComputed$(() => {
    const list = store.accounts.filter(
      (a: any) => a.account_type === "expense" && a.is_active !== 0
    );
    if (list.length > 0) return list;
    return [
      { id: "5100", account_code: "5100", name: "Rent Expense" },
      { id: "5200", account_code: "5200", name: "Salary & Wages" },
      { id: "5300", account_code: "5300", name: "Utilities" },
      { id: "5400", account_code: "5400", name: "Marketing & Ads" },
      { id: "5500", account_code: "5500", name: "Travel & Transport" },
      { id: "5001", account_code: "5001", name: "Cost of Goods Sold" },
      { id: "5950", account_code: "5950", name: "Round Off / Adjustment" },
      { id: "5900", account_code: "5900", name: "Miscellaneous Expense" },
    ];
  });

  const form = useSignal({
    account_id:  "",
    category:    "Miscellaneous Expense",
    amount:      "",
    tax_amount:  "",
    payment_mode:"cash",
    description: "",
  });

  const handleSave = $(async () => {
    const amount = parseFloat(form.value.amount);
    if (isNaN(amount) || amount <= 0) { err.value = "Enter a valid amount."; return; }
    saving.value = true;
    err.value = null;
    try {
      await invoke("fin_create_expense", {
        args: {
          category:     form.value.category,
          account_id:   form.value.account_id || null,
          amount,
          tax_amount:   parseFloat(form.value.tax_amount) || null,
          payment_mode: form.value.payment_mode,
          description:  form.value.description || null,
        },
      });
      form.value = { account_id: "", category: "Miscellaneous Expense", amount: "", tax_amount: "", payment_mode: "cash", description: "" };
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
        {[...Array(4)].map((_, i) => (
          <div key={i} style={{ height: "64px", background: "var(--surface-2)", borderRadius: "0.625rem", animation: "pulse 2s infinite" }} />
        ))}
      </div>
    );
  }

  const q = searchQuery.value.trim().toLowerCase();
  const filteredExpenses = store.expenses.filter((e: any) => {
    if (!q) return true;
    return (
      (e.description && e.description.toLowerCase().includes(q)) ||
      (e.category && e.category.toLowerCase().includes(q)) ||
      (e.payment_mode && e.payment_mode.toLowerCase().includes(q)) ||
      (e.id && e.id.toLowerCase().includes(q))
    );
  });

  const displayedExpenses = filteredExpenses.slice(0, visibleLimit.value);
  const totalExpenses = store.expenses.reduce((sum: number, e: any) => sum + (e.total_amount ?? e.amount ?? 0), 0);
  
  const categoryTotals = store.expenses.reduce((acc: Record<string, number>, e: any) => {
    const cat = e.category || "Other";
    acc[cat] = (acc[cat] || 0) + (e.total_amount ?? e.amount ?? 0);
    return acc;
  }, {});

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: "0 0 0.25rem 0" }}>Expenses</h1>
          <p style={{ color: "var(--text-secondary)", margin: 0, fontSize: "0.8125rem" }}>
            Log direct expenses — auto-posts to General Ledger. Showing {displayedExpenses.length} of {filteredExpenses.length} expenses.
          </p>
        </div>
        <button type="button" class="btn btn-secondary"
          onClick$={() => { showForm.value = !showForm.value; err.value = null; }}>
          {showForm.value ? "✕ Cancel" : "+ Log Expense"}
        </button>
      </div>

      <div style={{ marginBottom: "1.25rem" }}>
        <input
          type="text"
          value={searchQuery.value}
          onInput$={(e) => {
            searchQuery.value = (e.target as HTMLInputElement).value;
            visibleLimit.value = 30;
          }}
          placeholder="🔍 Search expenses by description, category, payment mode..."
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

      {showForm.value && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem" }}>
          <h3 style={{ fontSize: "0.9rem", fontWeight: 600, margin: "0 0 1rem 0" }}>Log an Expense</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1.5fr 1fr 1fr 1fr", gap: "0.75rem", marginBottom: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Expense Account *</label>
              <select
                value={form.value.account_id || form.value.category}
                onChange$={(e) => {
                  const selVal = (e.target as HTMLSelectElement).value;
                  const matched = expenseAccounts.value.find((a: any) => a.id === selVal || a.account_code === selVal || a.name === selVal);
                  if (matched) {
                    form.value = { ...form.value, account_id: matched.id, category: matched.name };
                  } else {
                    form.value = { ...form.value, account_id: "", category: selVal };
                  }
                }}
                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", height: "38px" }}>
                {expenseAccounts.value.map((acc: any) => (
                  <option key={acc.id || acc.name} value={acc.id || acc.name}>
                    {acc.account_code ? `${acc.account_code} — ${acc.name}` : acc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Amount (₹) *</label>
              <input type="number" step="0.01" value={form.value.amount}
                onInput$={(e) => { form.value = { ...form.value, amount: (e.target as HTMLInputElement).value }; }}
                placeholder="0.00"
                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>GST / Tax (₹)</label>
              <input type="number" step="0.01" value={form.value.tax_amount}
                onInput$={(e) => { form.value = { ...form.value, tax_amount: (e.target as HTMLInputElement).value }; }}
                placeholder="0.00"
                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }} />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Paid via *</label>
              <select value={form.value.payment_mode}
                onChange$={(e) => { form.value = { ...form.value, payment_mode: (e.target as HTMLSelectElement).value }; }}
                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", height: "38px" }}>
                {PAYMENT_MODES.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: "0.75rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Description</label>
              <input value={form.value.description}
                onInput$={(e) => { form.value = { ...form.value, description: (e.target as HTMLInputElement).value }; }}
                placeholder="e.g. Office rent for July"
                style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--surface-1)", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }} />
            </div>
          </div>
          {err.value && <div style={{ color: "#ef4444", fontSize: "0.8125rem", marginBottom: "0.75rem" }}>{err.value}</div>}
          <button type="button" class="btn btn-primary" onClick$={handleSave} disabled={saving.value}>
            {saving.value ? "Saving…" : "Log Expense"}
          </button>
        </div>
      )}

      {store.expenses.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "0.75rem", marginBottom: "1.5rem" }}>
          <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.25rem", fontWeight: 600 }}>TOTAL</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "#ef4444", fontVariantNumeric: "tabular-nums" }}>{fmt(totalExpenses)}</div>
          </div>
          {Object.entries(categoryTotals).map(([cat, total]) => (
            <div key={cat} style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.375rem", marginBottom: "0.25rem" }}>
                <div style={{ width: "6px", height: "6px", borderRadius: "50%", background: getCatColor(cat) }} />
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{cat.toUpperCase()}</div>
              </div>
              <div style={{ fontSize: "1rem", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "var(--text-primary)" }}>{fmt(total as number)}</div>
            </div>
          ))}
        </div>
      )}

      {filteredExpenses.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem", color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
          {searchQuery.value
            ? `No expenses matching "${searchQuery.value}".`
            : "No expenses yet. Log your first expense above."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
          {displayedExpenses.map((e: any) => (
            <div key={e.id}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.625rem", gap: "1rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                <div style={{ width: "8px", height: "8px", borderRadius: "50%", background: getCatColor(e.category), flexShrink: 0 }} />
                <div>
                  <div style={{ fontWeight: 500, fontSize: "0.875rem" }}>{e.description ?? e.category}</div>
                  <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                    {e.category} · {fmtDate(e.expense_date)} · {e.payment_mode}
                    {e.journal_entry_id ? " · ✓ Journal" : ""}
                  </div>
                </div>
              </div>
              <div style={{ fontWeight: 700, fontSize: "0.9375rem", color: "#ef4444", fontVariantNumeric: "tabular-nums", flexShrink: 0 }}>
                {fmt(e.total_amount)}
              </div>
            </div>
          ))}

          {filteredExpenses.length > visibleLimit.value && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <button
                type="button"
                class="btn btn-secondary"
                onClick$={() => { visibleLimit.value += 30; }}
                style={{ padding: "0.5rem 1.5rem", fontSize: "0.8125rem", fontWeight: 600 }}
              >
                + Load More (Showing {displayedExpenses.length} of {filteredExpenses.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

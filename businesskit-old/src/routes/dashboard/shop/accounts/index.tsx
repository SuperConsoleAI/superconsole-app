import { component$, useContext, useSignal, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { AccountsCtx } from "./layout";

const TYPE_ORDER = ["asset","liability","equity","income","expense"];
const TYPE_LABELS: Record<string, string> = {
  asset: "Assets", liability: "Liabilities", equity: "Equity", income: "Income", expense: "Expenses",
};
const TYPE_COLORS: Record<string, string> = {
  asset: "#3b82f6", liability: "#ef4444", equity: "#8b5cf6", income: "#10b981", expense: "#f59e0b",
};

export default component$(() => {
  const store        = useContext(AccountsCtx);
  const seeding      = useSignal(false);
  const showNewForm  = useSignal(false);
  const newName      = useSignal("");
  const newType      = useSignal("expense");
  const searchQuery  = useSignal("");
  const visibleLimit = useSignal(30);

  const handleSeed = $(async () => {
    seeding.value = true;
    try {
      await invoke("fin_seed_default_accounts");
      await store.refresh();
    } finally {
      seeding.value = false;
    }
  });

  const handleAdd = $(async () => {
    if (!newName.value.trim()) return;
    await invoke("fin_create_account", { args: { name: newName.value, account_type: newType.value } });
    await store.refresh();
    newName.value = "";
    showNewForm.value = false;
  });

  if (store.loading) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {[...Array(5)].map((_, i) => (
          <div key={i} style={{ height: "60px", background: "var(--surface-2)", borderRadius: "0.5rem", animation: "pulse 2s infinite" }} />
        ))}
      </div>
    );
  }

  if (store.accounts.length === 0) {
    return (
      <div style={{ textAlign: "center", padding: "4rem 2rem" }}>
        <div style={{ fontSize: "3rem", marginBottom: "1rem" }}>📒</div>
        <h2 style={{ fontSize: "1.25rem", fontWeight: 700, marginBottom: "0.75rem" }}>Chart of Accounts</h2>
        <p style={{ color: "var(--text-secondary)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
          No accounts yet. Seed the standard 18 accounts to get started.
        </p>
        <button class="btn btn-primary" type="button" onClick$={handleSeed} disabled={seeding.value}>
          {seeding.value ? "Seeding…" : "Seed Default Accounts"}
        </button>
      </div>
    );
  }

  const q = searchQuery.value.trim().toLowerCase();
  const filteredAccounts = store.accounts.filter((a: any) => {
    if (!q) return true;
    return (
      (a.name && a.name.toLowerCase().includes(q)) ||
      (a.account_code && a.account_code.toLowerCase().includes(q)) ||
      (a.account_type && a.account_type.toLowerCase().includes(q)) ||
      (a.account_subtype && a.account_subtype.toLowerCase().includes(q))
    );
  });

  const displayedAccounts = filteredAccounts.slice(0, visibleLimit.value);

  const grouped = TYPE_ORDER.reduce((acc, type) => {
    acc[type] = displayedAccounts.filter((a: any) => a.account_type === type);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.25rem", flexWrap: "wrap", gap: "0.75rem" }}>
        <div>
          <h1 style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>Chart of Accounts</h1>
          <p style={{ color: "var(--text-secondary)", fontSize: "0.8125rem", margin: "0.25rem 0 0 0" }}>
            Showing {displayedAccounts.length} of {filteredAccounts.length} accounts
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button class="btn btn-secondary" type="button"
            onClick$={() => { showNewForm.value = !showNewForm.value; }}>
            {showNewForm.value ? "✕ Cancel" : "+ Add Account"}
          </button>
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
          placeholder="🔍 Search accounts by name, code, or category..."
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

      {showNewForm.value && (
        <div style={{ background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.75rem", padding: "1.25rem", marginBottom: "1.5rem", display: "grid", gridTemplateColumns: "1fr auto auto", gap: "0.75rem", alignItems: "end" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Account Name</label>
            <input value={newName.value}
              onInput$={(e) => { newName.value = (e.target as HTMLInputElement).value; }}
              placeholder="e.g. Office Supplies"
              style={{ width: "100%", padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--field-fill, var(--surface-3))", color: "var(--text-primary)", fontSize: "0.875rem", boxSizing: "border-box" }} />
          </div>
          <div>
            <label style={{ display: "block", fontSize: "0.8125rem", color: "var(--text-secondary)", marginBottom: "0.25rem" }}>Type</label>
            <select value={newType.value}
              onChange$={(e) => { newType.value = (e.target as HTMLSelectElement).value; }}
              style={{ padding: "0.5rem 0.75rem", border: "1px solid var(--border)", borderRadius: "0.375rem", background: "var(--field-fill, var(--surface-3))", color: "var(--text-primary)", fontSize: "0.875rem", height: "38px" }}>
              {TYPE_ORDER.map(t => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <button class="btn btn-primary btn-sm" type="button" onClick$={handleAdd}>Add</button>
        </div>
      )}

      {filteredAccounts.length === 0 ? (
        <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)", border: "1px dashed var(--border)", borderRadius: "0.75rem" }}>
          No accounts matching "{searchQuery.value}".
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {TYPE_ORDER.map(type => {
            const items = grouped[type] || [];
            if (items.length === 0) return null;
            const color = TYPE_COLORS[type];
            return (
              <div key={type}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.625rem", paddingBottom: "0.5rem", borderBottom: `2px solid ${color}22` }}>
                  <div style={{ width: "4px", height: "1.25rem", background: color, borderRadius: "2px" }} />
                  <h2 style={{ fontSize: "0.9375rem", fontWeight: 700, margin: 0, color }}>{TYPE_LABELS[type]}</h2>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>{items.length} accounts</span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                  {items.map((acc: any) => (
                    <div key={acc.id}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.625rem 0.75rem", background: "var(--surface-2)", borderRadius: "0.5rem", border: "1px solid var(--border)" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                        {acc.account_code && (
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace", minWidth: "3rem" }}>
                            {acc.account_code}
                          </span>
                        )}
                        <div>
                          <div style={{ fontWeight: 500, fontSize: "0.875rem", color: "var(--text-primary)" }}>{acc.name}</div>
                          {acc.account_subtype && (
                            <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                              {acc.account_subtype.replace("_", " ")}
                            </div>
                          )}
                        </div>
                      </div>
                      {acc.is_system ? (
                        <span style={{ fontSize: "0.7rem", color: "var(--text-secondary)", background: "var(--surface-3)", padding: "0.15rem 0.5rem", borderRadius: "999px", border: "1px solid var(--border)" }}>
                          system
                        </span>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {filteredAccounts.length > visibleLimit.value && (
            <div style={{ textAlign: "center", marginTop: "1rem" }}>
              <button
                type="button"
                class="btn btn-secondary"
                onClick$={() => { visibleLimit.value += 30; }}
                style={{ padding: "0.5rem 1.5rem", fontSize: "0.8125rem", fontWeight: 600 }}
              >
                + Load More (Showing {displayedAccounts.length} of {filteredAccounts.length})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

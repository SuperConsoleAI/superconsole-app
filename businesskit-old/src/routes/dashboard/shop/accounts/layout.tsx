// src/routes/dashboard/shop/accounts/layout.tsx
// Global Context Provider for the Financial Accounts module.
// Pre-fetches accounts, journal entries, expenses, bank accounts, and transactions.
// Prevents skeleton flicker and loading delays when navigating between Accounts tabs.

import {
  component$,
  useContextProvider,
  createContextId,
  useStore,
  useVisibleTask$,
  Slot,
  $,
  QRL,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { AccountTabs } from "~/components/account/AccountTabs";

export interface AccountsCtxState {
  accounts: any[];
  journalEntries: any[];
  expenses: any[];
  bankAccounts: any[];
  bankTxns: any[];
  loading: boolean;
  error: string | null;
  loadData: QRL<() => Promise<void>>;
  refresh: QRL<() => Promise<void>>;
}

export const AccountsCtx = createContextId<AccountsCtxState>("accounts-ctx");

export default component$(() => {
  const store = useStore<AccountsCtxState>({
    accounts: [],
    journalEntries: [],
    expenses: [],
    bankAccounts: [],
    bankTxns: [],
    loading: true,
    error: null,
    loadData: $(async () => {}),
    refresh: $(async () => {}),
  });

  const fetchData = $(async () => {
    try {
      // Step 1: Fetch primary Accounts and Recent Journal entries immediately
      const [accs, journals, exps, banks] = await Promise.all([
        invoke<any[]>("fin_list_accounts").catch(() => []),
        invoke<any[]>("fin_list_journal_entries", { fromTs: null, toTs: null, limit: 150 }).catch(() => []),
        invoke<any[]>("fin_list_expenses", { fromTs: null, toTs: null, category: null }).catch(() => []),
        invoke<any[]>("fin_list_bank_accounts").catch(() => []),
      ]);

      store.accounts = Array.isArray(accs) ? accs : [];
      store.journalEntries = Array.isArray(journals) ? journals : [];
      store.expenses = Array.isArray(exps) ? exps : [];
      store.bankAccounts = Array.isArray(banks) ? banks : [];
      store.loading = false;

      // Step 2: Fetch bank transactions if any bank accounts exist
      if (store.bankAccounts.length > 0) {
        invoke<any[]>("fin_list_bank_transactions", {
          bankAccountId: store.bankAccounts[0].id,
          unmatchedOnly: false,
        }).then((txns) => {
          store.bankTxns = Array.isArray(txns) ? txns : [];
        }).catch(() => {});
      }
    } catch (e: any) {
      console.error("[AccountsContext] load failed:", e);
      store.error = e?.message ?? "Failed to load accounts data";
      store.loading = false;
    }
  });

  const refreshData = $(async () => {
    try {
      await fetchData();
    } catch (e: any) {
      console.error("[AccountsContext] sync failed:", e);
    }
  });

  store.loadData = fetchData;
  store.refresh = refreshData;

  useContextProvider(AccountsCtx, store);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData();
  });

  return (
    <div style={{ minHeight: "100%", background: "var(--bg)" }}>
      {/* Tab bar — same topbar pattern as Product / Billing pages */}
      <div style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-1)",
        padding: "0 1.5rem",
        display: "flex",
        alignItems: "center",
        height: "48px",
        gap: "1rem",
      }}>
        <AccountTabs />
      </div>

      <div style={{ width: "100%", boxSizing: "border-box" }}>
        <Slot />
      </div>
    </div>
  );
});

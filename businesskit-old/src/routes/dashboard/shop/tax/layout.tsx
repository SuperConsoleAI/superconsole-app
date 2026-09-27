// src/routes/dashboard/shop/tax/layout.tsx
// Global Context Provider for the Tax & Compliance module.
// Pre-fetches tax config, tax rates, confirmed invoices, e-invoices, e-way bills, and TDS entries.
// Prevents skeleton flicker and loading delays when navigating between Tax tabs.

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
import { setGlobalCurrency } from "~/lib/fin-format";
import { TaxTabs } from "~/components/account/TaxTabs";

export interface TaxCtxState {
  config: any | null;
  rates: any[];
  invoices: any[];
  einvoices: Record<string, any>;
  ewayBills: any[];
  tdsEntries: any[];
  loading: boolean;
  error: string | null;
  loadData: QRL<() => Promise<void>>;
  refresh: QRL<() => Promise<void>>;
}

export const TaxCtx = createContextId<TaxCtxState>("tax-ctx");

export default component$(() => {
  const store = useStore<TaxCtxState>({
    config: null,
    rates: [],
    invoices: [],
    einvoices: {},
    ewayBills: [],
    tdsEntries: [],
    loading: true,
    error: null,
    loadData: $(async () => {}),
    refresh: $(async () => {}),
  });

  const fetchData = $(async () => {
    try {
      const [config, rates, invs, eway, tds, einvList] = await Promise.all([
        invoke("fin_get_tax_config").catch(() => null),
        invoke<any[]>("fin_list_tax_rates").catch(() => []),
        invoke<any[]>("shop_list_invoices", { filters: { limit: 100 } }).catch(() => []),
        invoke<any[]>("fin_list_eway_bills", { limit: 100 }).catch(() => []),
        invoke<any[]>("fin_list_tds_entries", { fromTs: null, toTs: null, entryType: null }).catch(() => []),
        invoke<any[]>("fin_list_einvoices", { limit: 200 }).catch(() => []),
      ]);

      store.config = config;
      store.rates = Array.isArray(rates) ? rates : [];
      store.invoices = Array.isArray(invs) ? invs : [];
      store.ewayBills = Array.isArray(eway) ? eway : [];
      store.tdsEntries = Array.isArray(tds) ? tds : [];

      const einvMap: Record<string, any> = {};
      if (Array.isArray(einvList)) {
        for (const ei of einvList) {
          if (ei.document_id) {
            einvMap[ei.document_id] = ei;
          }
          if (ei.id) {
            einvMap[ei.id] = ei;
          }
        }
      }
      store.einvoices = einvMap;

      if (store.config?.currency) {
        setGlobalCurrency(store.config.currency);
      }

      store.loading = false;
    } catch (e: any) {
      console.error("[TaxContext] load failed:", e);
      store.error = e?.message ?? "Failed to load tax data";
      store.loading = false;
    }
  });

  const refreshData = $(async () => {
    try {
      await fetchData();
    } catch (e: any) {
      console.error("[TaxContext] sync failed:", e);
    }
  });

  store.loadData = fetchData;
  store.refresh = refreshData;

  useContextProvider(TaxCtx, store);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData();
  });

  return (
    <div style={{ minHeight: "100%", background: "var(--bg)" }}>
      {/* Tab bar */}
      <div style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface-1)",
        padding: "0 1.5rem",
        display: "flex",
        alignItems: "center",
        height: "48px",
        gap: "1rem",
      }}>
        <TaxTabs />

        {/* Regime badge */}
        {store.config?.regime && (
          <span style={{
            marginLeft: "auto",
            fontSize: "0.7rem",
            fontWeight: 700,
            padding: "0.2rem 0.625rem",
            borderRadius: "999px",
            background: "var(--surface-3)",
            color: "var(--text-secondary)",
            border: "1px solid var(--border)",
            letterSpacing: "0.04em",
          }}>
            {store.config.regime} · {store.config.currency}
          </span>
        )}
      </div>

      <div style={{ width: "100%", boxSizing: "border-box" }}>
        <Slot />
      </div>
    </div>
  );
});

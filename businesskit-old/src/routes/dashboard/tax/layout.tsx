// src/routes/dashboard/tax/layout.tsx
// Tax module layout — /dashboard/tax/*
// Global Context Provider for the Tax & Compliance module.

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
    <Slot />
  );
});

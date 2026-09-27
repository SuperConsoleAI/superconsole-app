// src/routes/dashboard/shop/products/billing/layout.tsx
//
// WHAT: Context provider for Product Billing & Analytics.
// Child routes (index, analytics) use useContext(BillingCtx) — zero duplicate invoke.

import { component$, Slot, useContextProvider, createContextId, useStore, useVisibleTask$ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";

export interface BillingAnalyticsData {
  id: string;
  total_invoices:     number;
  total_revenue:      number;
  total_profit:       number;
  revenue_7d:         string;
  revenue_30d:        string;
  revenue_12m:        string;
  profit_7d:          string;
  profit_30d:         string;
  profit_12m:         string;
  revenue_lifetime:   string;
  profit_lifetime:    string;
  invoices_lifetime:  string;
  last_aggregated_at: string;
  city_breakdown?:    string;
  state_breakdown?:   string;
  country_breakdown?: string;
}

export interface BillingState {
  analytics:  BillingAnalyticsData | null;
  loading:    boolean;
  error:      string;
}

export const BillingCtx = createContextId<BillingState>("billing_ctx");

export default component$(() => {
  const state = useStore<BillingState>({
    analytics: null,
    loading:   true,
    error:     "",
  });

  useContextProvider(BillingCtx, state);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    state.loading = true;
    state.error   = "";
    try {
      const data: any = await invoke("shop_get_billing_analytics", {});
      state.analytics = data ?? null;
    } catch (e) {
      console.error("[BillingLayout] get failed:", e);
      state.error = String(e);
    } finally {
      state.loading = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const handler = async () => {
      try {
        const data: any = await invoke("shop_get_billing_analytics", {});
        state.analytics = data ?? null;
      } catch (e) {
        console.error("[BillingLayout] refresh get failed:", e);
      }
    };
    window.addEventListener("analytics-refresh", handler);
    return () => window.removeEventListener("analytics-refresh", handler);
  });

  return <Slot />;
});

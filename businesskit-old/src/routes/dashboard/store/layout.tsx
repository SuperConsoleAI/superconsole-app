import { component$, Slot, useContextProvider, createContextId, useStore, useVisibleTask$, $, QRL } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { getProducts, getProfile, getCmsCategoryAnalytics } from "~/lib/ipc";
import type { ProductRow, ProductAnalyticsRow, PurchaseRow } from "~/lib/types";

export interface StoreState {
  products: ProductRow[];
  analyticsData: ProductAnalyticsRow[];
  salesData: PurchaseRow[];
  stats: any;
  profile: {
    slug: string;
    id: string;
    user_id: string;
  };
  loading: boolean;
  error: string;
  refresh: QRL<() => Promise<void>>;
}

export const StoreContext = createContextId<StoreState>("store_context");

export default component$(() => {
  const state = useStore<StoreState>({
    products: [],
    analyticsData: [],
    salesData: [],
    stats: null,
    profile: { slug: "", id: "", user_id: "" },
    loading: true,
    error: "",
    refresh: $(async () => {}), // placeholder until initialized
  });

  const fetchData = $(async () => {
    state.loading = true;
    try {
      invoke("aggregate_analytics", { forceRefresh: false }).catch(e => console.error("Aggregation failed:", e));

      const [profileRes, productsRes, analyticsRowsRes, statsRes, salesRes] = await Promise.all([
        getProfile(),
        getProducts(), // fetch all store products
        invoke<ProductAnalyticsRow[]>("get_product_analytics").catch(() => []),
        getCmsCategoryAnalytics("downloads").catch(() => null), // pass 'downloads' for now to satisfy stats requirement for digital-download tab
        invoke<PurchaseRow[]>("get_product_purchases", {}).catch(() => []), // fetch all purchases
      ]);

      state.profile = {
        slug: profileRes.slug || "",
        id: profileRes.id,
        user_id: profileRes.user_id,
      };
      
      state.products = productsRes || [];
      state.stats = statsRes;
      state.salesData = salesRes || [];
      
      // Store all analytics and sales natively. We can filter in the UI components if needed.
      state.analyticsData = analyticsRowsRes || [];
      
    } catch (e: any) {
      console.error("Failed to load digital download data:", e);
      state.error = e.message || "An error occurred";
    } finally {
      state.loading = false;
    }
  });

  state.refresh = fetchData;

  useContextProvider(StoreContext, state);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData();
  });

  return (
    <>
      <Slot />
    </>
  );
});

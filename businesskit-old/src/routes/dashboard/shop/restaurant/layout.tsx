// src/routes/dashboard/shop/restaurant/layout.tsx
//
// Global Context Provider for the Restaurant module.
// Fetches tables, KOTs, customers, menu items, recipes & invoices ONCE at layout level.
// Prevents skeleton flicker and loading delays when navigating between Restaurant tabs.

import {
  component$,
  Slot,
  useContextProvider,
  createContextId,
  useStore,
  useVisibleTask$,
  $,
  QRL,
} from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import type { ShopTable } from "~/components/shop/restaurant/TableLayoutGrid";
import type { ShopKOT } from "~/components/shop/restaurant/KOTQueueCard";
import type { CustomerBasic } from "~/components/shop/CustomerLookupSlideOver";
import type { StayReservation } from "~/components/shop/stays/RoomLayoutGrid";

export interface RestaurantState {
  tables: ShopTable[];
  kots: ShopKOT[];
  reservations: StayReservation[];
  customers: CustomerBasic[];
  menuItems: any[];
  recipes: any[];
  invoices: any[];
  loading: boolean;
  error: string;
  loadData: QRL<() => Promise<void>>;
  refresh: QRL<() => Promise<void>>;
}

export const RestaurantContext =
  createContextId<RestaurantState>("restaurant_context");

export default component$(() => {
  const state = useStore<RestaurantState>({
    tables: [],
    kots: [],
    reservations: [],
    customers: [],
    menuItems: [],
    recipes: [],
    invoices: [],
    loading: true,
    error: "",
    loadData: $(async () => {}),
    refresh: $(async () => {}),
  });

  const fetchData = $(async () => {
    try {
      const [tblRes, kotRes, resRes, custRes, itemRes, recRes, invRes] = await Promise.all([
        invoke<ShopTable[]>("shop_list_restaurant_tables", {}).catch(() => []),
        invoke<ShopKOT[]>("shop_list_kots", {}).catch(() => []),
        invoke<StayReservation[]>("shop_list_stay_reservations", {}).catch(() => []),
        invoke<CustomerBasic[]>("shop_list_customers", {}).catch(() => []),
        invoke<any[]>("shop_list_items", {}).catch(() => []),
        invoke<any[]>("shop_list_recipes", {}).catch(() => []),
        invoke<any[]>("shop_list_invoices", {}).catch(() => []),
      ]);
      state.tables = tblRes;
      state.kots = kotRes;
      state.reservations = resRes;
      state.customers = custRes;
      state.menuItems = itemRes;
      state.recipes = recRes;
      state.invoices = invRes;
    } catch (e: any) {
      console.error("[RestaurantContext] load failed:", e);
      state.error = e.message || "Failed to load restaurant data";
    } finally {
      state.loading = false;
    }
  });

  const refreshData = $(async () => {
    try {
      await Promise.all([
        invoke("shop_aggregate_billing_analytics").catch(() => {}),
        invoke("shop_aggregate_item_billing_analytics").catch(() => {}),
      ]);
      await fetchData();
    } catch (e: any) {
      console.error("[RestaurantContext] sync failed:", e);
    }
  });

  state.loadData = fetchData;
  state.refresh = refreshData;

  useContextProvider(RestaurantContext, state);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData();
  });

  return <Slot />;
});

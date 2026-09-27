// src/routes/dashboard/shop/stays/layout.tsx
//
// Global Context Provider for the Hotel / Stays module.
// Fetches rooms, reservations, open folios, guests, & analytics ONCE at layout level.
// Prevents skeleton flicker and loading delays when navigating between Stays tabs.

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
import type { StayRoom, StayReservation } from "~/components/shop/stays/RoomLayoutGrid";
import type { StayFolio } from "~/components/shop/stays/FolioDetailSlideOver";
import type { CustomerBasic } from "~/components/shop/CustomerLookupSlideOver";

export interface StaysState {
  rooms: StayRoom[];
  reservations: StayReservation[];
  folios: StayFolio[];
  guests: any[];
  customers: CustomerBasic[];
  analytics: any;
  loading: boolean;
  error: string;
  loadData: QRL<() => Promise<void>>;
  refresh: QRL<() => Promise<void>>;
}

export const StaysContext = createContextId<StaysState>("stays_context");

export default component$(() => {
  const state = useStore<StaysState>({
    rooms: [],
    reservations: [],
    folios: [],
    guests: [],
    customers: [],
    analytics: null,
    loading: true,
    error: "",
    loadData: $(async () => {}),
    refresh: $(async () => {}),
  });

  const fetchData = $(async () => {
    try {
      // Step 1: Fetch primary Room Grid & Active Reservations immediately for instant UI display
      const [rmRes, resRes, folRes] = await Promise.all([
        invoke<StayRoom[]>("shop_list_stay_rooms", {}).catch(() => []),
        invoke<StayReservation[]>("shop_list_stay_reservations", {}).catch(() => []),
        invoke<StayFolio[]>("shop_list_open_folios", {}).catch(() => []),
      ]);

      state.rooms = rmRes;
      state.reservations = resRes;
      state.folios = folRes;
      state.loading = false;

      // Step 2: Fetch secondary background data (guests, customers, analytics) non-blockingly
      Promise.all([
        invoke<any[]>("shop_list_all_stay_guests", {}).catch(() => []),
        invoke<CustomerBasic[]>("shop_list_customers", {}).catch(() => []),
        invoke<any>("shop_get_stay_analytics", {}).catch(() => null),
      ]).then(([gstRes, custRes, anaRes]) => {
        state.guests = gstRes;
        state.customers = custRes;
        if (anaRes) state.analytics = anaRes;
      });
    } catch (e: any) {
      console.error("[StaysContext] load failed:", e);
      state.error = e.message || "Failed to load stays data";
      state.loading = false;
    }
  });

  const refreshData = $(async () => {
    try {
      await fetchData();
    } catch (e: any) {
      console.error("[StaysContext] sync failed:", e);
    }
  });

  state.loadData = fetchData;
  state.refresh = refreshData;

  useContextProvider(StaysContext, state);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData();
  });

  return <Slot />;
});

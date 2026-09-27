import { component$, Slot, useContextProvider, createContextId, useStore, useVisibleTask$, $, QRL } from "@builder.io/qwik";
import type { CmsRow, ContentRow } from "~/lib/types";

export interface ContentState {
  hubs: CmsRow[];
  contentItems: ContentRow[];
  collections: any[];
  analyticsData: import("~/lib/types").ContentAnalyticsRow[];
  cmsAnalyticsData: import("~/lib/types").CmsAnalyticsRow[];
  loading: boolean;
  error: string;
  trace: string;
  refresh: QRL<() => Promise<void>>;
}

export const ContentContext = createContextId<ContentState>("content_context");

export default component$(() => {
  const state = useStore<ContentState>({
    hubs: [],
    contentItems: [],
    collections: [],
    analyticsData: [],
    cmsAnalyticsData: [],
    loading: true,
    error: "",
    trace: "INIT",
    refresh: $(async () => {}),
  });

  const fetchData = $(async () => {
    state.loading = true;
    state.trace = "STARTED";
    try {
      state.trace = "AWAITING_IPC";
      const { listCms, listContent, listCollections, getContentAnalytics, getAllCmsAnalytics } = await import("~/lib/ipc");
      const { invoke } = await import("@tauri-apps/api/core");

      // Trigger background aggregation without blocking
      invoke("aggregate_content_analytics", { forceRefresh: false }).catch(e => console.error("Content aggregation failed:", e));

      // 1. Fetch core UI content data in parallel
      const [hubsRes, contentRes, collectionsRes] = await Promise.all([
        listCms().catch(e => { console.warn("listCms failed:", e); return []; }),
        listContent().catch(e => { console.warn("listContent failed:", e); return []; }),
        listCollections().catch(e => { console.warn("listCollections failed:", e); return []; }),
      ]);

      state.trace = "IPC_SUCCESS";
      state.hubs = hubsRes || [];
      state.contentItems = contentRes || [];
      state.collections = collectionsRes || [];
      state.loading = false; // UNBLOCK UI IMMEDIATELY

      // 2. Fetch analytics asynchronously in the background
      Promise.all([
        getContentAnalytics().catch(e => { console.warn("getContentAnalytics failed:", e); return []; }),
        getAllCmsAnalytics().catch(e => { console.warn("getAllCmsAnalytics failed:", e); return []; }),
      ]).then(([contentAnalytics, cmsAnalytics]) => {
        state.analyticsData = contentAnalytics || [];
        state.cmsAnalyticsData = cmsAnalytics || [];
      });

    } catch (e: any) {
      console.error("Failed to load content context:", e);
      state.error = String(e);
      state.trace = "IPC_ERROR";
    } finally {
      state.loading = false;
    }
  });

  state.refresh = fetchData;

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    await fetchData();
  }, { strategy: "document-ready" });

  useContextProvider(ContentContext, state);

  return <Slot />;
});

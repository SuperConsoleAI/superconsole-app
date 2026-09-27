import { component$, useSignal, useVisibleTask$ } from "@builder.io/qwik";
import { LinksAnalytics } from "~/components/LinksAnalytics";
import { invoke } from "@tauri-apps/api/core";

export default component$(() => {
  const loading = useSignal(true);
  const analyticsData = useSignal<any>(null);


  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    loading.value = true;
    try {
      // Fetch global profile analytics
      const data: any = await invoke("get_profile_analytics");
      
      if (data) {
        analyticsData.value = {
          total_clicks: data.total_link_clicks || 0,
          total_views: data.total_product_views || 0,
          total_visits: data.total_visits || 0,
          clicks_7d: data.clicks_7d,
          clicks_30d: data.clicks_30d,
          clicks_12m: data.clicks_12m,
          views_7d: data.views_7d,
          views_30d: data.views_30d,
          views_12m: data.views_12m,
          visits_7d: data.visits_7d,
          visits_30d: data.visits_30d,
          visits_12m: data.visits_12m,
          visits_device_breakdown: data.device_breakdown,
          device_clicks: data.device_clicks,
          os_clicks: data.os_clicks,
          browser_clicks: data.browser_clicks,
          country_clicks: data.country_clicks,
          city_clicks: data.city_clicks,
          referrer_clicks: data.referrer_clicks,
        };
      } else {
        analyticsData.value = { total_views: 0, total_clicks: 0, total_visits: 0 };
      }
    } catch (e) {
      console.error("Failed to load global analytics:", e);
      analyticsData.value = { total_views: 0, total_clicks: 0, total_visits: 0 };
    } finally {
      loading.value = false;
    }
  });


  return (
    <div style="max-width: 1200px; margin: 0 auto; box-sizing: border-box; width: 100%; padding-bottom: 2rem;">
          {loading.value ? (
            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 2rem;">
              <div style="height: 100px; background: var(--surface-2); border-radius: 0.75rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;" />
              <div style="height: 100px; background: var(--surface-2); border-radius: 0.75rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 150ms;" />
              <div style="height: 100px; background: var(--surface-2); border-radius: 0.75rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 300ms;" />
              <div style="grid-column: 1 / -1; height: 300px; background: var(--surface-2); border-radius: 0.75rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 450ms; margin-top: 1rem;" />
            </div>
          ) : (
            <LinksAnalytics data={analyticsData.value} />
          )}
    </div>
  );
});

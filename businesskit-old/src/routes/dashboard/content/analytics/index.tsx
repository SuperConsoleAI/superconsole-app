import { component$, useContext, useComputed$ } from "@builder.io/qwik";
import { ContentAnalytics } from "~/components/ContentAnalytics";
import { ContentContext } from "../layout";

export default component$(() => {
  const state = useContext(ContentContext);

  const allAnalyticsRows = useComputed$(() => {
    return state.analyticsData || [];
  });

  const allContentItems = useComputed$(() => {
    return state.contentItems || [];
  });

  return (
    <div class="flex flex-col gap-6 p-4 sm:p-6 lg:p-8" style="background:var(--surface-1);flex:1;">
      {state.loading ? (
        <div class="stats-grid" style="margin-bottom:var(--space-lg);display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} class="stat-card" style="padding:1.25rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.75rem;">
              <div class="skeleton" style="height:14px;width:80px;margin-bottom:12px;border-radius:4px;" />
              <div class="skeleton" style="height:32px;width:60px;border-radius:4px;" />
            </div>
          ))}
        </div>
      ) : (
        <ContentAnalytics
          analyticsRows={allAnalyticsRows.value}
          contents={allContentItems.value}
        />
      )}
    </div>
  );
});

import { component$, useContext } from "@builder.io/qwik";
import { JobAnalytics } from "~/components/JobAnalytics";
import { JobsContext } from "../layout";

export default component$(() => {
  const store = useContext(JobsContext);

  return (
    <div class="flex flex-col gap-6 p-4 sm:p-6 lg:p-8">
      {store.loading ? (
        <div class="stats-grid flex gap-4" style="margin-bottom:var(--space-lg)">
          {[1, 2, 3].map((i) => (
            <div key={i} class="stat-card" style="flex:1; padding: 1.25rem; background: var(--surface-2); border-radius: 0.75rem;">
              <div class="skeleton" style="height:14px;width:80px;margin-bottom:12px;background:var(--surface-3);border-radius:4px" />
              <div class="skeleton" style="height:32px;width:60px;background:var(--surface-3);border-radius:4px" />
            </div>
          ))}
        </div>
      ) : store.analyticsData.length === 0 ? (
        <section class="flex flex-col items-center justify-center py-20 px-4 text-center bg-surface-2 rounded-2xl border border-divider">
          <h2 class="text-2xl font-semibold text-primary mb-3">No Analytics Data Yet</h2>
          <p class="text-secondary max-w-md">Your job listings need views and applications to generate analytics.</p>
        </section>
      ) : (
        <JobAnalytics 
          analyticsRows={store.analyticsData} 
          jobs={store.jobs} 
        />
      )}
    </div>
  );
});

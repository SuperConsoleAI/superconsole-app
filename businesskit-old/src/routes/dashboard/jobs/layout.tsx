import { component$, Slot, useContextProvider, createContextId, useStore, useVisibleTask$, $, QRL } from "@builder.io/qwik";
import { getJobListingsIPC, getJobApplicationsIPC, getJobAnalyticsIPC, aggregateJobAnalyticsIPC, getCmsCategoryAnalytics } from "~/lib/ipc";
import type { JobListingRow, JobApplicationRow, JobAnalyticsRow } from "~/lib/types";

export interface JobsState {
  jobs: JobListingRow[];
  applications: JobApplicationRow[];
  analyticsData: JobAnalyticsRow[];
  stats: any;
  loading: boolean;
  error: string;
  refresh: QRL<() => Promise<void>>;
}

export const JobsContext = createContextId<JobsState>("jobs_context");

export default component$(() => {
  const state = useStore<JobsState>({
    jobs: [],
    applications: [],
    analyticsData: [],
    stats: null,
    loading: true,
    error: "",
    refresh: $(async () => {}),
  });

  const fetchData = $(async () => {
    state.loading = true;
    try {
      aggregateJobAnalyticsIPC(false).catch(e => console.error("Aggregation failed:", e));

      const [jobsRes, appsRes, analyticsRes, statsRes] = await Promise.all([
        getJobListingsIPC(),
        getJobApplicationsIPC().catch(() => []),
        getJobAnalyticsIPC().catch(() => []),
        getCmsCategoryAnalytics("jobs").catch(() => null),
      ]);

      state.jobs = jobsRes || [];
      state.applications = appsRes || [];
      state.analyticsData = analyticsRes || [];
      state.stats = statsRes;
      
    } catch (e: any) {
      console.error("Failed to load jobs data:", e);
      state.error = e.message || "An error occurred";
    } finally {
      state.loading = false;
    }
  });

  state.refresh = fetchData;

  useContextProvider(JobsContext, state);

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

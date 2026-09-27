import { component$, useSignal, useVisibleTask$, $ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { getAgentAnalytics } from "~/lib/ipc";
import type { AgentAnalytics } from "~/lib/types";
import { AgentAnalyticsView } from "~/components/AgentAnalyticsView";
import { getCachedAgentAnalytics, setCachedAgentAnalytics } from "~/lib/agent-config";

export default component$(() => {
  const cached = getCachedAgentAnalytics();
  const analyticsData = useSignal<AgentAnalytics | null>(cached || null);
  const isLoading = useSignal(!cached);

  const fetchAnalytics = $(async () => {
    if (!analyticsData.value) {
      isLoading.value = true;
    }
    try {
      const data = await getAgentAnalytics();
      analyticsData.value = data;
      setCachedAgentAnalytics(data);
    } catch (e) {
      console.error("Failed to load agent analytics:", e);
    } finally {
      isLoading.value = false;
    }
  });

  // Automatically trigger live aggregation and 90-day pruning on page visit
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    fetchAnalytics();
  });

  return (
    <AgentAnalyticsView
      data={analyticsData.value}
      onRefresh$={fetchAnalytics}
      isLoading={isLoading.value}
    />
  );
});

export const head: DocumentHead = {
  title: "Agent Analytics & Token Spend — BusinessKit",
  meta: [
    {
      name: "description",
      content: "Detailed insights into AI agent spend, token consumption, and staff operations.",
    },
  ],
};

// src/routes/dashboard/agents/tools/index.tsx
//
// Tools Catalog Page for AI Agents.
// Displays all available agent tools, schema parameters, domain tags, and token footprints.

import {
  component$,
  useSignal,
  useVisibleTask$,
} from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import {
  AgentToolsPicker,
  DEFAULT_CATALOG_TOOLS,
  type ToolCatalogItem,
} from "~/components/agents";
import { listAgentTools } from "~/lib/ipc";
import {
  getCachedToolsList,
  setCachedToolsList,
} from "~/lib/agent-config";

export default component$(() => {
  const cached = getCachedToolsList();
  const tools = useSignal<ToolCatalogItem[]>(cached || DEFAULT_CATALOG_TOOLS);
  const loading = useSignal(!cached || cached.length === 0);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const liveTools = await listAgentTools();
      if (liveTools && Array.isArray(liveTools) && liveTools.length > 0) {
        const mapped = liveTools.map((lt) => {
          const fallback = DEFAULT_CATALOG_TOOLS.find((t) => t.name === lt.name);
          return {
            name: lt.name,
            label: fallback?.label || lt.name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
            domain: (lt.domain as any) || "shop",
            description: lt.description || fallback?.description || "",
            tokens: lt.tokenEstimate || fallback?.tokens || 100,
          };
        });
        tools.value = mapped;
        setCachedToolsList(mapped);
      }
    } catch (err) {
      console.error("[tools] Failed to load agent tools from backend:", err);
    } finally {
      loading.value = false;
    }
  });

  return (
    <div
      style={{
        width: "100%",
        maxWidth: "100%",
        minWidth: 0,
        overflowX: "hidden",
        boxSizing: "border-box",
      }}
    >
      {loading.value ? (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                height: "4rem",
                background: "var(--surface-2)",
                borderRadius: "0.5rem",
                animation: "pulse 2s infinite",
                animationDelay: `${(i - 1) * 150}ms`,
              }}
            />
          ))}
        </div>
      ) : (
        <AgentToolsPicker tools={tools.value} mode="viewer" />
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Agent Tools & Capabilities — BusinessKit",
  meta: [
    {
      name: "description",
      content: "Explore all available AI agent tools, function schemas, and token weights.",
    },
  ],
};

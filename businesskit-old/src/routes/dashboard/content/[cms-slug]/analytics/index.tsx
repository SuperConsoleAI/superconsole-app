import { component$, useContext, useComputed$ } from "@builder.io/qwik";
import { useLocation, type StaticGenerateHandler } from "@builder.io/qwik-city";
import { ContentAnalytics } from "~/components/ContentAnalytics";
import { ContentContext } from "../../layout";

export const onStaticGenerate: StaticGenerateHandler = () => ({
  params: [
    "blog", "n", "notes", "docs", "directory", "articles", "guides",
    "skills", "prompt", "compare", "alternative", "posts", "tools",
    "links", "listing", "booking", "services", "courses", "sponsorship",
    "downloads", "events", "meetings", "webinars", "community", "page",
    "videos", "podcast", "membership", "subscription", "ai-tools",
    "store", "forms", "jobs",
  ].map((s) => ({ "cms-slug": s })),
});

export default component$(() => {
  const state = useContext(ContentContext);
  const loc = useLocation();
  const slug = loc.params["cms-slug"];

  const cmsHub = useComputed$(() => {
    return state.hubs.find((h) => h.slug === slug);
  });

  const filteredAnalyticsRows = useComputed$(() => {
    if (!cmsHub.value) return [];
    return state.analyticsData.filter((a: any) => {
      const content = state.contentItems.find((p: any) => p.id === a.content_id);
      return content && content.cms_id === cmsHub.value?.id;
    });
  });

  const filteredContentItems = useComputed$(() => {
    if (!cmsHub.value) return [];
    return state.contentItems.filter((p: any) => p.cms_id === cmsHub.value?.id);
  });

  return (
    <div class="flex flex-col gap-6 p-4 sm:p-6 lg:p-8" style="background:var(--surface-1);flex:1;">
      {/* 
        Header is handled by the global AppTopbar and the ContentTabs
        which are injected at the top. We only render the page content here.
      */}
      {state.loading ? (
        <div class="stats-grid" style="margin-bottom:var(--space-lg);display:grid;grid-template-columns:repeat(4,1fr);gap:1rem;">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} class="stat-card" style="padding:1.25rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.75rem;">
              <div class="skeleton" style="height:14px;width:80px;margin-bottom:12px;border-radius:4px;" />
              <div class="skeleton" style="height:32px;width:60px;border-radius:4px;" />
            </div>
          ))}
        </div>
      ) : cmsHub.value ? (
        <ContentAnalytics 
          analyticsRows={filteredAnalyticsRows.value} 
          contents={filteredContentItems.value} 
        />
      ) : (
        <div style="padding: 2rem; color: var(--text-2);">
          CMS Hub not found for {slug}
        </div>
      )}
    </div>
  );
});

import { component$, useSignal, useTask$, type PropFunction } from "@builder.io/qwik";
import { LuX, LuBarChart2 } from "@qwikest/icons/lucide";
import { getContentAnalytics } from "~/lib/ipc";
import { ContentAnalytics } from "~/components/ContentAnalytics";

type SingleContentAnalyticsProps = {
  contentId: string;
  contentTitle: string;
  onClose$: PropFunction<() => void>;
};

export const SingleContentAnalytics = component$<SingleContentAnalyticsProps>(({ contentId, contentTitle, onClose$ }) => {
  const analyticsData = useSignal<any[]>([]);
  const isAnalyticsLoading = useSignal(true);

  useTask$(async ({ track }) => {
    track(() => contentId);
    isAnalyticsLoading.value = true;
    try {
      const allAnalytics = await getContentAnalytics();
      const contentRow = allAnalytics.find((r: any) => r.content_id === contentId);
      analyticsData.value = contentRow ? [contentRow] : [];
    } catch (e) {
      console.error("Failed to load content analytics:", e);
    } finally {
      isAnalyticsLoading.value = false;
    }
  });

  return (
    <div style="position: fixed; inset: 0; z-index: 400; display: flex; justify-content: flex-end;">
      <style>{`
        .analytics-slideout-panel {
          position: relative;
          width: 100%;
          max-width: 50%;
          background: var(--surface-1);
          height: 100%;
          overflow-y: auto;
          border-left: 1px solid var(--border);
          display: flex;
          flex-direction: column;
          animation: slideInRight 0.3s ease;
        }
        .analytics-slideout-header {
          padding: 0.5rem 2rem;
          border-bottom: 1px solid var(--border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          background: var(--surface-2);
          position: sticky;
          top: 0;
          z-index: 10;
        }
        .analytics-slideout-body {
          flex: 1;
          position: relative;
          padding: 2rem;
        }
        @media (max-width: 1024px) {
          .analytics-slideout-panel { max-width: 100%; }
          .analytics-slideout-header { padding: 1rem; }
          .analytics-slideout-body { padding: 1rem; }
        }
      `}</style>
      <div style="position: absolute; inset: 0; background: rgba(0,0,0,0.5);" onClick$={onClose$} />
      <div class="analytics-slideout-panel">
        <div class="analytics-slideout-header">
          <h2 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 1rem;">
            {contentTitle || "Content Analytics"}
          </h2>
          <button type="button" onClick$={onClose$} style="padding: 0.5rem; border-radius: 0.5rem; background: transparent; border: none; cursor: pointer; color: var(--text-secondary); display: flex; transition: color 0.2s;">
            <LuX style="width: 1.25rem; height: 1.25rem;" />
          </button>
        </div>
        <div class="analytics-slideout-body">
          {isAnalyticsLoading.value ? (
            <div style="padding: 4rem 2rem; text-align: center; color: var(--text-secondary);">Loading analytics...</div>
          ) : analyticsData.value.length > 0 ? (
            <ContentAnalytics
              analyticsRows={analyticsData.value}
              contents={[{ id: contentId, title: contentTitle }]}
            />
          ) : (
            <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 6rem 2rem; text-align: center; height: 100%;">
              <div style="width: 4rem; height: 4rem; background: var(--surface-3); border-radius: 50%; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); margin-bottom: 1.5rem;">
                <LuBarChart2 style="width: 2rem; height: 2rem;" />
              </div>
              <h3 style="font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin: 0 0 0.5rem 0;">No Analytics Yet</h3>
              <p style="color: var(--text-secondary); max-width: 300px; margin: 0; line-height: 1.5;">This content hasn't generated any views or reactions yet. Analytics will appear here once traffic starts flowing!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

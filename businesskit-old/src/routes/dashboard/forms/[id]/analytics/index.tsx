import { component$, useStylesScoped$, useSignal, useVisibleTask$, useContext } from "@builder.io/qwik";
import { useLocation, type StaticGenerateHandler } from "@builder.io/qwik-city";

export const onStaticGenerate: StaticGenerateHandler = () => ({
  params: ["default", "new"].map((id) => ({ id })),
});
import { LuEye, LuPlay, LuCheck, LuPercent, LuClock } from "@qwikest/icons/lucide";
import { listFormsIPC, listSubmissionsIPC, getFormAnalyticsIPC } from "~/lib/ipc";
import type { SubmissionRow } from "~/lib/types";
import { FormsBuilderCtx } from "~/lib/forms-builder-context";

const ANALYTICS_STYLES = `
  .analytics-content {
    flex: 1;
    overflow: auto;
  }
  @media (max-width: 768px) {
    .analytics-content {
    }
  }
  .filters-row {
    display: flex;
    gap: 0.75rem;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 1024px) {
    .stat-grid {
      grid-template-columns: repeat(3, 1fr);
    }
  }
  @media (max-width: 768px) {
    .stat-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  @media (max-width: 480px) {
    .stat-grid {
      grid-template-columns: 1fr;
    }
  }
  .stat-card {
    padding: 1.25rem;
    border-radius: 0.75rem;
  }
  @media (max-width: 768px) {
    .stat-card {
      padding: 1rem;
    }
    .stat-card .stat-value {
      font-size: 1.5rem !important;
    }
  }

  .chart-card {
    background: var(--surface-2);
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    padding: 1.5rem;
  }
  @media (max-width: 768px) {
    .chart-card {
      padding: 1rem;
    }
  }
  .chart-bars {
    height: 200px;
    display: flex;
    align-items: flex-end;
    gap: 0.5rem;
    padding: 2.5rem 0 0 0;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .chart-bar-wrap {
    flex: 1;
    position: relative;
    display: flex;
    align-items: flex-end;
    height: 100%;
    cursor: default;
  }
  .chart-bar-tooltip {
    display: none;
    position: absolute;
    bottom: 100%;
    left: 50%;
    transform: translateX(-50%);
    background: var(--accent);
    color: var(--button-primary-text, #fff);
    padding: 0.375rem 0.625rem;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    white-space: nowrap;
    z-index: 50;
    margin-bottom: 0.375rem;
    pointer-events: none;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }
  .chart-bar-wrap:hover .chart-bar-tooltip {
    display: block;
  }
  @media (max-width: 768px) {
    .chart-bars {
      height: 150px;
      gap: 0.25rem;
    }
    .chart-bar-wrap {
      min-width: 12px;
    }
  }
  .breakdown-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  @media (max-width: 768px) {
    .breakdown-grid {
      grid-template-columns: 1fr;
    }
  }
  .breakdown-card {
    background: var(--surface-2);
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    padding: 1.5rem;
  }
  @media (max-width: 768px) {
    .breakdown-card {
      padding: 1rem;
    }
  }
`;

export default component$(() => {
  useStylesScoped$(ANALYTICS_STYLES);
  const loc = useLocation();
  const formId = typeof window !== "undefined"
    ? (() => {
        const stored = window.sessionStorage.getItem("__bk_edit_form_id");
        if (stored) { window.sessionStorage.removeItem("__bk_edit_form_id"); return stored; }
        return new URLSearchParams(window.location.search).get("id")
          || loc.url.searchParams.get("id")
          || (!(["default", "new"].includes(loc.params.id)) ? loc.params.id : "")
          || "";
      })()
    : (loc.params.id || "");

  const formTitle   = useSignal("Form");
  const timeRange   = useSignal("30d");
  const loading     = useSignal(true);
  const rootBuilder = useContext(FormsBuilderCtx);

  const analyticsData = useSignal<any>(null);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const [forms, formAnalyticsRow, subsRaw] = await Promise.all([
        listFormsIPC(),
        getFormAnalyticsIPC(formId),
        listSubmissionsIPC(formId, 1000),
      ]);
      
      const form = forms.find((f) => f.id === formId);
      if (form) {
        formTitle.value = form.title;
        rootBuilder.formTitle.value = form.title;
      }

      const submissions = (subsRaw || []).map(s => ({
        ...s,
        answers: typeof s.answers === "string" ? (() => { try { return JSON.parse(s.answers); } catch { return {}; } })() : (s.answers || {}),
      }));

      // Parse JSON fields from the analytics row
      const a = formAnalyticsRow ? {
        ...formAnalyticsRow,
        trends_7d: (() => { try { return JSON.parse(formAnalyticsRow.trends_7d as string); } catch { return [0,0,0,0,0,0,0]; } })(),
        trends_30d: (() => { try { return JSON.parse(formAnalyticsRow.trends_30d as string); } catch { return []; } })(),
        trends_12m: (() => { try { return JSON.parse(formAnalyticsRow.trends_12m as string); } catch { return [0,0,0,0,0,0,0,0,0,0,0,0]; } })(),
        lifetime: (() => { try { return JSON.parse((formAnalyticsRow as any).lifetime as string); } catch { return {}; } })(),
      } : null;

      // Dynamically compute breakdowns based on raw submissions
      const calcBreakdown = (field: keyof SubmissionRow) => {
        const counts: Record<string, number> = {};
        submissions.forEach((s) => {
          const val = s[field] as string | undefined;
          if (val) {
            counts[val] = (counts[val] || 0) + 1;
          }
        });
        return counts;
      };

      const finalAnalytics = a ? {
        ...a,
        device: calcBreakdown('device'),
        os: calcBreakdown('os'),
        browser: calcBreakdown('browser'),
        referrer: calcBreakdown('referrer'),
        country: calcBreakdown('country'),
        city: calcBreakdown('city'),
        utm_source: calcBreakdown('utm_source'),
        utm_medium: calcBreakdown('utm_medium'),
        utm_campaign: calcBreakdown('utm_campaign'),
      } : null;

      const submittedCount = submissions.filter(s => s.status === 'submitted').length;
      const completionRate = finalAnalytics?.starts && finalAnalytics.starts > 0 ? Math.round((submittedCount / finalAnalytics.starts) * 100) : 0;
      
      const completedSubs = submissions.filter(s => s.duration_ms);
      const avgTime = completedSubs.length > 0
        ? Math.round(completedSubs.reduce((sum, s) => sum + (s.duration_ms || 0), 0) / completedSubs.length / 1000)
        : 0;

      analyticsData.value = {
        analytics: finalAnalytics,
        completionRate,
        avgTime,
        submissions
      };
    } catch (e) {
      console.error("Failed to load analytics:", e);
    } finally {
      loading.value = false;
    }
  });

  if (loading.value) {
    return (
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">
        Loading analytics…
      </div>
    );
  }

  if (!analyticsData.value) {
    return (
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">
        No data found.
      </div>
    );
  }

  const { analytics, completionRate, avgTime } = analyticsData.value;

  const views = analytics?.views || 0;
  const starts = analytics?.starts || 0;
  const submissions = analytics?.submissions || 0;

  const statCards = [
    { label: 'Views', value: views, icon: LuEye, color: '#fef3c7', textColor: '#92400e' },
    { label: 'Starts', value: starts, icon: LuPlay, color: '#dbeafe', textColor: '#1e40af' },
    { label: 'Submissions', value: submissions, icon: LuCheck, color: '#dcfce7', textColor: '#166534' },
    { label: 'Completion Rate', value: `${completionRate}%`, icon: LuPercent, color: '#fce7f3', textColor: '#9d174d' },
    { label: 'Completion Time', value: `${avgTime}s`, icon: LuClock, color: '#f3e8ff', textColor: '#6b21a8' },
  ];

  return (
    <div style="flex:1;display:flex;flex-direction:column;background:var(--surface-1);">
      <div class="analytics-content">
        <div class="stat-grid">
          {statCards.map((stat, idx) => (
            <div key={idx} class="stat-card" style={`background: ${stat.color};`}>
              <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                <stat.icon style={`width: 1rem; height: 1rem; color: ${stat.textColor};`} />
                <span style={`font-size: 0.8125rem; font-weight: 500; color: ${stat.textColor};`}>{stat.label}</span>
              </div>
              <div class="stat-value" style={`font-size: 2rem; font-weight: 700; color: ${stat.textColor};`}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div class="chart-card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem;">
            <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0;">Submissions Trend</h3>
            <select
              value={timeRange.value}
              onChange$={(e) => timeRange.value = (e.target as HTMLSelectElement).value}
              style="padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; background: var(--surface-2); color: var(--text-primary); cursor: pointer;"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="12m">Last 12 Months</option>
              <option value="lifetime">Lifetime</option>
            </select>
          </div>
          
          <div class="chart-bars">
            {(() => {
              const getTrendData = (): {val: number, label: string}[] => {
                const today = new Date();
                const generateDates = (days: number) => Array.from({length: days}, (_, i) => {
                  const d = new Date(today);
                  d.setDate(d.getDate() - (days - 1 - i));
                  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                });
                const generateMonths = (months: number) => Array.from({length: months}, (_, i) => {
                  const d = new Date(today);
                  d.setMonth(d.getMonth() - (months - 1 - i));
                  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
                });

                switch (timeRange.value) {
                  case '7d': {
                    const arr = Array.isArray(analytics?.trends_7d) ? analytics.trends_7d : Array(7).fill(0);
                    const labels = generateDates(arr.length);
                    return arr.map((val: any, i: number) => ({ val: val as number, label: labels[i] }));
                  }
                  case '12m': {
                    const arr = Array.isArray(analytics?.trends_12m) ? analytics.trends_12m : Array(12).fill(0);
                    const labels = generateMonths(arr.length);
                    return arr.map((val: any, i: number) => ({ val: val as number, label: labels[i] }));
                  }
                  case 'lifetime': {
                    const obj = analytics?.lifetime || {};
                    const entries = Object.entries(obj);
                    if (!entries.length) return [{ val: 0, label: 'Lifetime' }];
                    return entries.map(([label, val]) => ({ val: val as number, label }));
                  }
                  case '30d':
                  default: {
                    const arr = Array.isArray(analytics?.trends_30d) ? analytics.trends_30d : Array(30).fill(0);
                    const labels = generateDates(arr.length);
                    return arr.map((val: any, i: number) => ({ val: val as number, label: labels[i] }));
                  }
                }
              };
              const activeData = getTrendData();
              const maxVal = Math.max(...activeData.map(d => d.val), 1);

              return activeData.map(({val, label}, i: number) => {
                const height = maxVal > 0 ? ((val / maxVal) * 120 + 20) : 20;
                return (
                  <div 
                    key={`${timeRange.value}-idx-${i}`}
                    class="chart-bar-wrap"
                  >
                    <div class="chart-bar-tooltip">
                      {label}: {val}
                    </div>
                    <div
                      style={`width: 100%; height: ${height}px; background: linear-gradient(180deg, #e9d5ff 0%, #f3e8ff 100%); border-radius: 0.25rem 0.25rem 0 0;`}
                    />
                  </div>
                );
              });
            })()}
          </div>
          <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); padding-top: 0.5rem; border-top: 1px solid var(--border);">
            <span>Older</span>
            <span>Recent</span>
          </div>
        </div>

        <div class="breakdown-grid">
          {(() => {
            const renderBreakdown = (title: string, dataObj: any, type: 'bar' | 'list') => {
              const entries = Object.entries(dataObj || {}).map(([k,v]) => ({label: k || 'Unknown', count: Number(v)})).filter(x => x.count > 0).sort((a,b) => b.count - a.count);
              const total = entries.reduce((s, x) => s + x.count, 0);
              
              if (total === 0) {
                return (
                  <div class="breakdown-card">
                    <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 1rem;">{title}</h3>
                    <p style="font-size: 0.8125rem; color: var(--text-secondary); text-align: center; padding: 1rem;">No data yet</p>
                  </div>
                );
              }

              const displayData = entries.slice(0, 5).map(x => ({label: x.label, pct: Math.round((x.count / total) * 100)}));

              return (
                <div class="breakdown-card">
                  <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 1rem;">{title}</h3>
                  {displayData.map((item) => {
                    if (type === 'bar') {
                      return (
                        <div key={item.label} style="margin-bottom: 0.75rem;">
                          <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                            <span style="font-size: 0.875rem; color: var(--text-primary);">{item.label}</span>
                            <span style="font-size: 0.75rem; color: var(--text-secondary);">{item.pct}%</span>
                          </div>
                          <div style="height: 0.375rem; background: var(--surface-3); border-radius: 0.25rem; overflow: hidden;">
                            <div style={`height: 100%; width: ${item.pct}%; background: #8b5cf6; border-radius: 0.25rem;`} />
                          </div>
                        </div>
                      );
                    } else {
                      return (
                        <div key={item.label} style="display: flex; justify-content: space-between; padding: 0.5rem 0; border-bottom: 1px solid var(--border);">
                          <span style="font-size: 0.875rem; color: var(--text-primary);">{item.label}</span>
                          <span style="font-size: 0.75rem; color: var(--text-secondary);">{item.pct}%</span>
                        </div>
                      );
                    }
                  })}
                </div>
              );
            };

            return (
              <>
                {renderBreakdown('Device Breakdown', analytics?.device, 'bar')}
                {renderBreakdown('Operating Systems', analytics?.os, 'bar')}
                {renderBreakdown('Browsers', analytics?.browser, 'bar')}
                {renderBreakdown('Top Referrers', analytics?.referrer, 'list')}
                {renderBreakdown('Top Countries', analytics?.country, 'list')}
                {renderBreakdown('Top Cities', analytics?.city, 'list')}
                {renderBreakdown('UTM Source', analytics?.utm_source, 'list')}
                {renderBreakdown('UTM Medium', analytics?.utm_medium, 'list')}
                {renderBreakdown('UTM Campaign', analytics?.utm_campaign, 'list')}
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
});

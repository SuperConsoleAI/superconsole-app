import { component$, useSignal, $, useTask$ } from "@builder.io/qwik";

import { LuRefreshCw } from "@qwikest/icons/lucide";

export interface CommunityAnalyticsProps {
  communityId: string;
  community: any;
  analytics: any;
  refreshAction?: any;
}

export const CommunityAnalytics = component$<CommunityAnalyticsProps>(({ communityId, community: c, analytics: initialAnalytics, refreshAction }) => {
  const timeRange = useSignal("7d");
  const analyticsData = useSignal(initialAnalytics);
  const isRefreshing = useSignal(false);

  useTask$(({ track }) => {
    track(() => refreshAction?.value);
    if (refreshAction?.value && !refreshAction.isRunning) {
      analyticsData.value = refreshAction.value.analytics;
      isRefreshing.value = false;
    }
  });

  const handleRefresh = $(() => {
    if (!refreshAction) return;
    isRefreshing.value = true;
    refreshAction.submit({ communityId });
  });

  const a = analyticsData.value;

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

    let rawArr: number[] = [];
    let labels: string[] = [];

    switch (timeRange.value) {
      case '7d': {
        try { rawArr = JSON.parse(a?.members7d || "[]"); } catch { rawArr = []; }
        if (!Array.isArray(rawArr) || rawArr.length === 0) rawArr = Array(7).fill(0);
        labels = generateDates(rawArr.length);
        break;
      }
      case '12m': {
        try { rawArr = JSON.parse(a?.members12m || "[]"); } catch { rawArr = []; }
        if (!Array.isArray(rawArr) || rawArr.length === 0) rawArr = Array(12).fill(0);
        labels = generateMonths(rawArr.length);
        break;
      }
      case 'lifetime': {
        let obj: Record<string, number> = {};
        try { obj = JSON.parse(a?.membersLifetime || "{}"); } catch { /* ignore */ }
        const entries = Object.entries(obj).sort((x, y) => Number(x[0]) - Number(y[0]));
        if (!entries.length) return [{ val: 0, label: 'Lifetime' }];
        return entries.map(([label, val]) => ({ val: Number(val), label }));
      }
      case '30d':
      default: {
        try { rawArr = JSON.parse(a?.members30d || "[]"); } catch { rawArr = []; }
        if (!Array.isArray(rawArr) || rawArr.length === 0) rawArr = Array(30).fill(0);
        labels = generateDates(rawArr.length);
        break;
      }
    }
    return rawArr.map((val: any, i: number) => ({ val: Number(val) || 0, label: labels[i] }));
  };

  const activeData = getTrendData();
  const maxVal = Math.max(...activeData.map(d => d.val), 1);

  return (
    <>
      <style>{`
        .stats-grid {
          display: grid; grid-template-columns: repeat(7, 1fr);
          gap: 0.75rem; margin-bottom: 1.5rem;
        }
        @media (max-width: 1100px) {
          .stats-grid { grid-template-columns: repeat(4, 1fr); }
        }
        @media (max-width: 900px) {
          .stats-grid { grid-template-columns: repeat(3, 1fr); }
        }
        @media (max-width: 600px) {
          .stats-grid { grid-template-columns: repeat(2, 1fr); }
        }
        .stat-card {
          background: var(--surface-2); border: 1px solid var(--border);
          border-radius: 0.75rem; padding: 1rem;
        }
        .stat-value { font-size: 1.6rem; font-weight: 700; color: var(--text-primary); }
        .stat-label { font-size: 0.72rem; color: var(--text-secondary); margin-top: 0.2rem;
          text-transform: uppercase; letter-spacing: 0.05em; }

        .breakdown-grid {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 1.5rem; margin-top: 1.5rem;
        }
        @media (max-width: 800px) { .breakdown-grid { grid-template-columns: 1fr; } }
        .breakdown-card {
          background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem;
        }
        .breakdown-row {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.75rem;
        }
        .bd-label { font-size: 0.85rem; color: var(--text-primary); flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 1rem; text-transform: capitalize; }
        .bd-bar { flex: 2; height: 6px; background: var(--surface); border-radius: 3px; overflow: hidden; margin-right: 1rem; }
        .bd-fill { height: 100%; background: var(--accent); border-radius: 3px; }
        .bd-pct { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); width: 32px; text-align: right; }
      `}</style>
      
      {/* Stats */}
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-value">{((a?.totalMembers ?? c?.memberCount) || 0).toLocaleString()}</div>
          <div class="stat-label">Members</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{((a?.totalPosts ?? c?.postCount) || 0).toLocaleString()}</div>
          <div class="stat-label">Posts</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{((a?.totalComments ?? c?.commentCount) || 0).toLocaleString()}</div>
          <div class="stat-label">Comments</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{a ? (a.totalRevenueCents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" }) : "$0"}</div>
          <div class="stat-label">Revenue</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{(a?.activeMembers7d ?? 0)}</div>
          <div class="stat-label">Active 7d</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">{a?.paidMembers ?? 0}</div>
          <div class="stat-label">Paid</div>
        </div>
        <div class="stat-card" style="border-color: rgba(34,197,94,0.35);">
          <div class="stat-value" style="display:flex;align-items:center;gap:0.35rem;">
            {(a?.onlineCount ?? 0) > 0 && (
              <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,0.25);flex-shrink:0;" />
            )}
            {a?.onlineCount ?? 0}
          </div>
          <div class="stat-label">Online Now</div>
        </div>
      </div>

      <div style="background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.75rem; padding: 1.5rem; margin-top: 1.5rem;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem;">
          <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0; display: flex; align-items: center; gap: 0.75rem;">
            Community Growth Trend
            {a?.updatedAt && (
              <span style="font-size: 0.75rem; font-weight: 400; color: var(--text-secondary); opacity: 0.8;">
                Last updated: {new Date(a.updatedAt * 1000).toLocaleString(undefined, {
                  month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
                })}
              </span>
            )}
          </h3>
          
          <div style="display: flex; align-items: center; gap: 0.5rem;">
            {refreshAction && (
              <button 
                type="button" 
                title="Refresh Analytics"
                onClick$={handleRefresh}
                disabled={isRefreshing.value || refreshAction.isRunning}
                style={`padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.375rem; display: flex; align-items: center; justify-content: center; color: var(--text-secondary); cursor: pointer; transition: all 0.15s ease; ${isRefreshing.value || refreshAction.isRunning ? 'opacity: 0.5' : ''}`}
                onMouseEnter$={(e, el) => { el.style.borderColor = "var(--accent)"; el.style.color = "var(--accent)"; }}
                onMouseLeave$={(e, el) => { el.style.borderColor = "var(--border)"; el.style.color = "var(--text-secondary)"; }}
              >
                <LuRefreshCw class={`w-4 h-4 ${isRefreshing.value || refreshAction.isRunning ? 'animate-spin' : ''}`} />
              </button>
            )}

            <select
              value={timeRange.value}
              onChange$={(e) => timeRange.value = (e.target as HTMLSelectElement).value}
              style="padding: 0.4rem 0.8rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; background: var(--surface); color: var(--text-primary); cursor: pointer;"
            >
              <option value="7d" selected={timeRange.value === '7d'}>Last 7 Days</option>
              <option value="30d" selected={timeRange.value === '30d'}>Last 30 Days</option>
              <option value="12m" selected={timeRange.value === '12m'}>Last 12 Months</option>
              <option value="lifetime" selected={timeRange.value === 'lifetime'}>Lifetime</option>
            </select>
          </div>
        </div>
        
        <div style="height: 200px; display: flex; align-items: flex-end; gap: 0.5rem; padding: 2.5rem 0 0 0; overflow-x: auto; -webkit-overflow-scrolling: touch;">
          {activeData.map(({val, label}, i: number) => {
            const height = maxVal > 0 ? ((val / maxVal) * 120 + 20) : 20;
            return (
              <div 
                key={`${timeRange.value}-idx-${i}`}
                style="flex: 1; position: relative; display: flex; align-items: flex-end; height: 100%; cursor: default; min-width: 12px;"
              >
                <div
                  style={`width: 100%; height: ${height}px; background: linear-gradient(180deg, var(--accent) 0%, transparent 150%); opacity: 0.8; border-radius: 0.25rem 0.25rem 0 0;`}
                  title={`${label}: ${val} new members`}
                />
              </div>
            );
          })}
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); padding-top: 0.5rem; border-top: 1px solid var(--border); margin-top: 0.5rem;">
          <span>{activeData[0]?.label || "Older"}</span>
          <span>{activeData[activeData.length - 1]?.label || "Today"}</span>
        </div>
      </div>

      <div class="breakdown-grid">
        {(() => {
          const renderBreakdown = (title: string, rawDataStr: string | undefined) => {
            let dataObj: Record<string, number> = {};
            try { dataObj = JSON.parse(rawDataStr || "{}"); } catch { /* ignore */ }
            
            const entries = Object.entries(dataObj).map(([k,v]) => ({label: k || 'Unknown', count: Number(v)})).filter(x => x.count > 0).sort((a,b) => b.count - a.count);
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
                {displayData.map((item, idx) => (
                  <div class="breakdown-row" key={`${title}-row-${idx}`}>
                    <div class="bd-label" title={item.label}>{item.label}</div>
                    <div class="bd-bar">
                      <div class="bd-fill" style={`width: ${item.pct}%`} />
                    </div>
                    <div class="bd-pct">{item.pct}%</div>
                  </div>
                ))}
              </div>
            );
          };

          return (
            <>
              {renderBreakdown("Device Breakdown", a?.deviceBreakdown)}
              {renderBreakdown("Top Referrers", a?.referrerBreakdown)}
              {renderBreakdown("Country Breakdown", a?.countryBreakdown)}
              {renderBreakdown("UTM Source", a?.utmSourceBreakdown)}
            </>
          );
        })()}
      </div>
    </>
  );
});

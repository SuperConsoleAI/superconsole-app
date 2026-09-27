import { component$, useSignal, useStylesScoped$ } from "@builder.io/qwik";
import { LuMousePointerClick, LuEye, LuPercent } from "@qwikest/icons/lucide";

const ANALYTICS_STYLES = `
  .analytics-content {
    flex: 1;
  }
  .filters-row {
    display: flex;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 1024px) {
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .stat-grid { grid-template-columns: 1fr; }
  }
  .stat-card {
    padding: 1.25rem;
    border-radius: 0.75rem;
  }
  @media (max-width: 768px) {
    .stat-card { padding: 1rem; }
    .stat-card .stat-value { font-size: 1.5rem !important; }
  }
  .chart-card {
    background: var(--surface-2);
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    padding: 1.5rem;
  }
  @media (max-width: 768px) {
    .chart-card { padding: 1rem; }
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
    .chart-bar-wrap { min-width: 12px; }
  }
  .breakdown-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-top: 1.5rem;
  }
  @media (max-width: 768px) {
    .breakdown-grid { grid-template-columns: 1fr; }
  }
  .breakdown-card {
    background: var(--surface-2);
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    padding: 1.5rem;
  }
  @media (max-width: 768px) {
    .breakdown-card { padding: 1rem; }
  }
`;

interface LinksAnalyticsProps {
  data: any; // Will be LinkAnalyticsRow or CategoryAnalyticsRow
}

export const LinksAnalytics = component$<LinksAnalyticsProps>(({ data }) => {
  useStylesScoped$(ANALYTICS_STYLES);
  const timeRange = useSignal('30d');
  const metricType = useSignal('clicks');
  
  const totalClicks = data?.total_clicks || 0;
  const totalViews = data?.total_views || 0; // Only present on category
  const hasViews = typeof data?.total_views !== 'undefined';
  const clickThroughRate = (hasViews && totalViews > 0) ? ((totalClicks / totalViews) * 100).toFixed(1) : "0.0";

  const parseJsonStr = (str?: string, defaultVal: any = {}) => {
    if (!str) return defaultVal;
    try { return JSON.parse(str); } catch { return defaultVal; }
  };

  const getChartData = () => {
    const range = timeRange.value;
    const clicksStr = range === '7d' ? data?.clicks_7d : range === '30d' ? data?.clicks_30d : range === '12m' ? data?.clicks_12m : data?.clicks_lifetime;
    const viewsStr = range === '7d' ? data?.views_7d : range === '30d' ? data?.views_30d : range === '12m' ? data?.views_12m : data?.views_lifetime;
    const visitsStr = range === '7d' ? data?.visits_7d : range === '30d' ? data?.visits_30d : range === '12m' ? data?.visits_12m : data?.visits_lifetime;
    
    const parsedClicks = parseJsonStr(clicksStr, []);
    const parsedViews = parseJsonStr(viewsStr, []);
    const parsedVisits = parseJsonStr(visitsStr, []);
    
    return parsedClicks.map((pt: any, i: number) => ({
      date: pt.date || pt.month || pt.year || '',
      clicks: pt.clicks || 0,
      views: parsedViews[i]?.views || 0,
      visits: parsedVisits[i]?.visits || 0
    }));
  };

  const chartData = getChartData();
  const maxVal = Math.max(...chartData.map((d: any) => d[metricType.value]), 1);

  const len = chartData.length;
  const xAxisLabels: string[] = [];
  if (len > 0) {
    xAxisLabels.push(chartData[0].date); // Start date
    if (len >= 7) {
      xAxisLabels.push(chartData[Math.floor(len/2)].date); // Middle date
    }
    if (len > 1) {
      xAxisLabels.push(chartData[len-1].date); // End date
    }
  }

  const getTopItems = (field: string, limit = 5) => {
    const obj = parseJsonStr(data?.[field], {});
    return Object.entries(obj)
      .map(([name, count]) => ({ name, count: count as number }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  };

  return (
    <div class="analytics-content">

      <div class="stat-grid" style={hasViews ? "grid-template-columns: repeat(3, 1fr);" : "grid-template-columns: repeat(1, 1fr);"}>
        {hasViews && (
          <div class="stat-card" style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3)); border: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-size: 0.875rem;">
              <LuEye style="width: 1rem; height: 1rem;" /> Total Page Views
            </div>
            <div class="stat-value" style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">
              {totalViews.toLocaleString()}
            </div>
          </div>
        )}

        <div class="stat-card" style="background: linear-gradient(145deg, var(--accent), var(--accent-hover)); color: var(--surface-1);">
          <div style="display: flex; align-items: center; gap: 0.5rem; opacity: 0.9; margin-bottom: 0.5rem; font-size: 0.875rem;">
            <LuMousePointerClick style="width: 1rem; height: 1rem;" /> Total Clicks
          </div>
          <div class="stat-value" style="font-size: 2rem; font-weight: 700; color: var(--surface-1);">
            {totalClicks.toLocaleString()}
          </div>
        </div>

        {hasViews && (
          <div class="stat-card" style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3)); border: 1px solid var(--border);">
            <div style="display: flex; align-items: center; gap: 0.5rem; color: var(--text-secondary); margin-bottom: 0.5rem; font-size: 0.875rem;">
              <LuPercent style="width: 1rem; height: 1rem;" /> Click-Through Rate
            </div>
            <div class="stat-value" style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">
              {clickThroughRate}%
            </div>
          </div>
        )}
      </div>

      <div class="chart-card">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem;">
          <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0;">Performance Over Time</h3>
          <div style="display: flex; gap: 0.5rem;">
            {hasViews && (
              <select
                value={metricType.value}
                onChange$={(e) => metricType.value = (e.target as HTMLSelectElement).value}
                style="height: 2rem; padding: 0 1rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; background: var(--surface-2); color: var(--text-primary); cursor: pointer;"
              >
                <option value="clicks">Clicks</option>
                <option value="views">Views</option>
                <option value="visits">Visits</option>
              </select>
            )}
            <select
              value={timeRange.value}
              onChange$={(e) => timeRange.value = (e.target as HTMLSelectElement).value}
              style="height: 2rem; padding: 0 1rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; background: var(--surface-2); color: var(--text-primary); cursor: pointer;"
            >
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="12m">Last 12 Months</option>
              <option value="lifetime">Lifetime (Yearly)</option>
            </select>
          </div>
        </div>
        
        {chartData.length > 0 ? (
          <>
            <div class="chart-bars">
              {chartData.map((d: any, i: number) => {
                const val = d[metricType.value] || 0;
                const height = maxVal > 0 ? ((val / maxVal) * 120 + 20) : 20;
                const isClicks = metricType.value === 'clicks';
                const isViews = metricType.value === 'views';
                
                const bgStyle = isClicks 
                  ? "background: linear-gradient(180deg, var(--accent) 0%, transparent 200%); border: 1px solid var(--accent); opacity: 0.9;"
                  : isViews
                  ? "background: linear-gradient(180deg, var(--text-secondary) 0%, transparent 200%); border: 1px solid var(--text-secondary); opacity: 0.6;"
                  : "background: linear-gradient(180deg, var(--text-primary) 0%, transparent 200%); border: 1px solid var(--text-primary); opacity: 0.8;";

                return (
                  <div key={i} class="chart-bar-wrap">
                    <div class="chart-bar-tooltip">
                      <div style="font-weight: 600; margin-bottom: 0.25rem;">{d.date}</div>
                      <div>{metricType.value.charAt(0).toUpperCase() + metricType.value.slice(1)}: {val}</div>
                    </div>
                    <div style={`width: 100%; height: ${height}px; border-radius: 0.25rem 0.25rem 0 0; ${bgStyle}`} />
                  </div>
                );
              })}
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); padding-top: 0.75rem; border-top: 1px solid var(--border);">
              {xAxisLabels.length > 0 ? (
                <>
                  <span style="flex: 1; text-align: left;">{xAxisLabels[0]}</span>
                  {xAxisLabels.length === 3 && (
                    <span style="flex: 1; text-align: center;">{xAxisLabels[1]}</span>
                  )}
                  {xAxisLabels.length >= 2 && (
                    <span style="flex: 1; text-align: right;">{xAxisLabels[xAxisLabels.length - 1]}</span>
                  )}
                </>
              ) : (
                <>
                  <span>Older</span>
                  <span>Recent</span>
                </>
              )}
            </div>
          </>
        ) : (
          <div style="height: 200px; display: flex; align-items: center; justify-content: center; color: var(--text-secondary);">
            No data available for this range
          </div>
        )}
      </div>

      <div class="breakdown-grid">
        <div class="breakdown-card">
          <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary);">Top Referrers</h3>
          {getTopItems('referrer_clicks').length > 0 ? (
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              {getTopItems('referrer_clicks').map((item, i) => (
                <div key={i} style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 0.875rem;">{item.name}</span>
                  <span style="font-weight: 500; font-size: 0.875rem;">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">No referrer data.</p>
          )}
        </div>

        <div class="breakdown-card">
          <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary);">Top Countries</h3>
          {getTopItems('country_clicks').length > 0 ? (
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              {getTopItems('country_clicks').map((item, i) => (
                <div key={i} style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 0.875rem;">{item.name}</span>
                  <span style="font-weight: 500; font-size: 0.875rem;">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">No country data.</p>
          )}
        </div>
        
        <div class="breakdown-card">
          <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary);">Devices</h3>
          {getTopItems('device_clicks').length > 0 ? (
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              {getTopItems('device_clicks').map((item, i) => (
                <div key={i} style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 0.875rem; text-transform: capitalize;">{item.name}</span>
                  <span style="font-weight: 500; font-size: 0.875rem;">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">No device data.</p>
          )}
        </div>
        
        <div class="breakdown-card">
          <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary);">Browsers</h3>
          {getTopItems('browser_clicks').length > 0 ? (
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              {getTopItems('browser_clicks').map((item, i) => (
                <div key={i} style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 0.875rem;">{item.name}</span>
                  <span style="font-weight: 500; font-size: 0.875rem;">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">No browser data.</p>
          )}
        </div>

        <div class="breakdown-card">
          <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary);">Top Cities</h3>
          {getTopItems('city_clicks').length > 0 ? (
            <div style="display: flex; flex-direction: column; gap: 0.75rem;">
              {getTopItems('city_clicks').map((item, i) => (
                <div key={i} style="display: flex; justify-content: space-between; align-items: center;">
                  <span style="color: var(--text-secondary); font-size: 0.875rem;">{item.name}</span>
                  <span style="font-weight: 500; font-size: 0.875rem;">{item.count}</span>
                </div>
              ))}
            </div>
          ) : (
            <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">No city data.</p>
          )}
        </div>

        {hasViews && (
          <div class="breakdown-card">
            <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary);">Top Links</h3>
            {getTopItems('link_clicks').length > 0 ? (
              <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                {getTopItems('link_clicks').map((item, i) => (
                  <div key={i} style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: var(--text-secondary); font-size: 0.875rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">{item.name}</span>
                    <span style="font-weight: 500; font-size: 0.875rem;">{item.count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">No link data.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

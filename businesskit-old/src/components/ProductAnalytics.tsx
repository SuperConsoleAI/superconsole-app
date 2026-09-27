import { component$, useSignal, useStylesScoped$ } from "@builder.io/qwik";
import { LuEye, LuDollarSign, LuShoppingCart, LuPercent } from "@qwikest/icons/lucide";
import type { ProductAnalyticsRow } from "~/lib/types";

const ANALYTICS_STYLES = `
  .analytics-content {
    flex: 1;
    padding-bottom: 2rem;
  }
  @media (max-width: 768px) {
    .analytics-content {
      padding: 1rem;
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
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 1024px) {
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

interface ProductAnalyticsProps {
  analyticsRows: ProductAnalyticsRow[];
  products: any[];
}

export const ProductAnalytics = component$<ProductAnalyticsProps>(({ analyticsRows, products }) => {
  useStylesScoped$(ANALYTICS_STYLES);
  const timeRange = useSignal('30d');
  const metricType = useSignal('sales'); // 'views' or 'sales'

  // Compute lifetime aggregates
  const totalViews = analyticsRows.reduce((sum, row) => sum + (row.total_views || 0), 0);
  const totalSales = analyticsRows.reduce((sum, row) => sum + (row.total_sales || 0), 0);
  const totalRevenue = analyticsRows.reduce((sum, row) => sum + (row.total_revenue || 0), 0);
  const conversionRate = totalViews > 0 ? ((totalSales / totalViews) * 100).toFixed(1) : "0.0";

  // Helpers to aggregate breakdown JSON
  const parseJsonStr = (str?: string, defaultVal: any = {}) => {
    if (!str) return defaultVal;
    try { return JSON.parse(str); } catch { return defaultVal; }
  };

  const aggregateBreakdown = (field: keyof ProductAnalyticsRow) => {
    const combined: Record<string, number> = {};
    analyticsRows.forEach(row => {
      const parsed = parseJsonStr(row[field] as string, {});
      for (const [k, v] of Object.entries(parsed)) {
        combined[k] = (combined[k] || 0) + Number(v);
      }
    });
    return combined;
  };

  const aggregateTrend = (field: keyof ProductAnalyticsRow, length: number) => {
    const combined = Array(length).fill(0);
    analyticsRows.forEach(row => {
      const parsed = parseJsonStr(row[field] as string, []);
      for (let i = 0; i < length; i++) {
        combined[i] += Number(parsed[i] || 0);
      }
    });
    return combined;
  };

  // Pre-calculate top downloads by mapping product_id to product title
  const topDownloadsObj: Record<string, number> = {};
  analyticsRows.forEach(row => {
    const product = products.find(p => p.id === row.product_id);
    const title = product ? product.title : 'Unknown Product';
    topDownloadsObj[title] = (topDownloadsObj[title] || 0) + (row.total_sales || 0);
  });

  const statCards = [
    { label: 'Total Views', value: totalViews, icon: LuEye, color: '#fef3c7', textColor: '#92400e' },
    { label: 'Total Sales', value: totalSales, icon: LuShoppingCart, color: '#dcfce7', textColor: '#166534' },
    { label: 'Conversion Rate', value: `${conversionRate}%`, icon: LuPercent, color: '#fce7f3', textColor: '#9d174d' },
    { label: 'Gross Revenue', value: `$${(totalRevenue / 100).toFixed(2)}`, icon: LuDollarSign, color: '#dbeafe', textColor: '#1e40af' },
  ];

  return (
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
          <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0;">Trend</h3>
          <div style="display: flex; gap: 0.5rem;">
            <select
              value={metricType.value}
              onChange$={(e) => metricType.value = (e.target as HTMLSelectElement).value}
              style="padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; background: var(--surface-2); color: var(--text-primary); cursor: pointer;"
            >
              <option value="sales">Sales</option>
              <option value="revenue">Revenue</option>
              <option value="views">Views</option>
              <option value="visits">Visits</option>
            </select>
            <select
              value={timeRange.value}
              onChange$={(e) => timeRange.value = (e.target as HTMLSelectElement).value}
              style="padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; background: var(--surface-2); color: var(--text-primary); cursor: pointer;"
            >
              <option value="7d" selected={timeRange.value === '7d'}>Last 7 Days</option>
              <option value="30d" selected={timeRange.value === '30d'}>Last 30 Days</option>
              <option value="12m" selected={timeRange.value === '12m'}>Last 12 Months</option>
            </select>
          </div>
        </div>
        
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

            const prefix = metricType.value; // 'sales', 'revenue', 'views', or 'visits'
            switch (timeRange.value) {
              case '7d': {
                const arr = aggregateTrend(`${prefix}_7d` as keyof ProductAnalyticsRow, 7);
                const labels = generateDates(arr.length);
                return arr.map((val: any, i: number) => ({ val: val as number, label: labels[i] }));
              }
              case '12m': {
                const arr = aggregateTrend(`${prefix}_12m` as keyof ProductAnalyticsRow, 12);
                const labels = generateMonths(arr.length);
                return arr.map((val: any, i: number) => ({ val: val as number, label: labels[i] }));
              }
              case '30d':
              default: {
                const arr = aggregateTrend(`${prefix}_30d` as keyof ProductAnalyticsRow, 30);
                const labels = generateDates(arr.length);
                return arr.map((val: any, i: number) => ({ val: val as number, label: labels[i] }));
              }
            }
          };
          const activeData = getTrendData();
          const maxVal = Math.max(...activeData.map(d => d.val), 1);
          
          const len = activeData.length;
          const xAxisLabels = [];
          if (len > 0) {
            xAxisLabels.push(activeData[0].label); // Start date
            if (len >= 7) {
              xAxisLabels.push(activeData[Math.floor(len/2)].label); // Middle date
            }
            if (len > 1) {
              xAxisLabels.push(activeData[len-1].label); // End date
            }
          }

          return (
            <>
              <div class="chart-bars">
                {activeData.map(({val, label}, i: number) => {
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
                        style={`width: 100%; height: ${height}px; background: linear-gradient(180deg, #dcfce7 0%, #f0fdf4 100%); border-radius: 0.25rem 0.25rem 0 0; border: 1px solid #bbf7d0;`}
                      />
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
          );
        })()}
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
                          <div style={`height: 100%; width: ${item.pct}%; background: #22c55e; border-radius: 0.25rem;`} />
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
              {renderBreakdown('Device Breakdown', aggregateBreakdown('device_breakdown'), 'bar')}
              {renderBreakdown('Operating Systems', aggregateBreakdown('os_breakdown'), 'bar')}
              {renderBreakdown('Top Referrers', aggregateBreakdown('views_referrer_breakdown'), 'list')}
              {renderBreakdown('Top Countries', aggregateBreakdown('views_country_breakdown'), 'list')}
              {renderBreakdown('Top Cities', aggregateBreakdown('views_city_breakdown'), 'list')}
              {renderBreakdown('Top Downloads', topDownloadsObj, 'list')}
            </>
          );
        })()}
      </div>
    </div>
  );
});

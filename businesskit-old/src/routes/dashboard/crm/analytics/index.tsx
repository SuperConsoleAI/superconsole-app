import { component$, useSignal, useStylesScoped$, useVisibleTask$, $ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";

import { LuUsers, LuTarget, LuKanban, LuPercent, LuDollarSign } from "@qwikest/icons/lucide";

const ANALYTICS_STYLES = `
  .analytics-page {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
    background: var(--background);
    width: 100%;
  }
  .analytics-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    box-sizing: border-box;
  }
  @media (max-width: 768px) {
    .analytics-main {
    }
  }
  .header-actions {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    flex-wrap: wrap;
    gap: 1rem;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 1024px) {
    .stat-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (max-width: 768px) {
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
    gap: 1.5rem;
    margin-top: 1.5rem;
  }
  @media (max-width: 1024px) {
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

export const BreakdownCard = component$(({ title, data, color }: { title: string, data: Record<string, number>, color: string }) => {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const total = sorted.reduce((sum, [, val]) => sum + val, 0) || 1;
  return (
    <div style="background: var(--surface-2); border-radius: 0.75rem; border: 1px solid var(--border); padding: 1.5rem;" class="breakdown-card">
      <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 1rem;">{title}</h3>
      {sorted.length === 0 ? (
        <div style="font-size: 0.875rem; color: var(--text-secondary); text-align: center; padding: 1.5rem 0;">No data</div>
      ) : (
        sorted.map(([key, val]) => {
          const pct = Math.round((val / total) * 100);
          return (
            <div key={key} style="margin-bottom: 0.75rem;">
              <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                <span style="font-size: 0.875rem; color: var(--text-primary); text-transform: capitalize;">{key || 'Unknown'}</span>
                <span style="font-size: 0.75rem; color: var(--text-secondary);">{pct}%</span>
              </div>
              <div style="height: 0.375rem; background: var(--surface-3); border-radius: 0.25rem; overflow: hidden;">
                <div style={`height: 100%; width: ${pct}%; background: ${color}; border-radius: 0.25rem;`} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
});

export default component$(() => {
  useStylesScoped$(ANALYTICS_STYLES);
  
  const loading = useSignal(true);
  const timeRange = useSignal('30d');
  
  const analyticsData = useSignal<any>(null);

  const fetchAnalytics = $(async (force: boolean) => {
    try {
      if (force) {
        await invoke('aggregate_crm_analytics', { forceRefresh: true });
      } else {
        await invoke('aggregate_crm_analytics', { forceRefresh: false });
      }
      const data = await invoke('get_crm_analytics');
      analyticsData.value = data;
    } catch (e) {
      console.error("Failed to load analytics:", e);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    loading.value = true;
    await fetchAnalytics(false);
    loading.value = false;
  });



  const formatCurrency = (cents: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format((cents || 0) / 100);
  };

  const parseJSON = (str: any, def: any) => {
    try {
      return typeof str === 'string' ? JSON.parse(str) : (str || def);
    } catch {
      return def;
    }
  };

  if (loading.value) {
    return (
      <div class="analytics-page">
      <div style="display:flex;align-items:center;justify-content:center;flex:1;">
          Loading...
        </div>
      </div>
    );
  }

  const a = analyticsData.value || {
    total_contacts: 0,
    total_leads: 0,
    open_deals: 0,
    reply_rate_pct: 0,
    won_deal_value_cents: 0,
    total_prospects: 0,
    total_customers: 0,
    lost_deals: 0,
    won_deals: 0,
  };

  // Extract proper arrays from DB string outputs
  const contacts_7d = parseJSON((a as any).contacts_7d, Array(7).fill(0));
  const contacts_30d = parseJSON((a as any).contacts_30d, Array(30).fill(0));
  const contacts_12m = parseJSON((a as any).contacts_12m, Array(12).fill(0));
  const contacts_lifetime = parseJSON((a as any).contacts_lifetime, {});

  const getTrendData = () => {
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
        const arr = Array.isArray(contacts_7d) ? contacts_7d : Array(7).fill(0);
        const labels = generateDates(arr.length);
        return arr.map((val, i) => ({ val, label: labels[i] }));
      }
      case '12m': {
        const arr = Array.isArray(contacts_12m) ? contacts_12m : Array(12).fill(0);
        const labels = generateMonths(arr.length);
        return arr.map((val, i) => ({ val, label: labels[i] }));
      }
      case 'lifetime': {
        const obj = contacts_lifetime || {};
        const entries = Object.entries(obj);
        if (!entries.length) return [{ val: 0, label: 'Lifetime' }];
        return entries.map(([label, val]) => ({ val: val as number, label }));
      }
      case '30d':
      default: {
        const arr = Array.isArray(contacts_30d) ? contacts_30d : Array(30).fill(0);
        const labels = generateDates(arr.length);
        return arr.map((val, i) => ({ val, label: labels[i] }));
      }
    }
  };

  const activeTrendData = getTrendData();
  const maxContacts = Math.max(...activeTrendData.map(d => d.val), 1);

  // Safely extract breakdown JSON
  const devices = parseJSON((a as any).device_breakdown, {});
  const os = parseJSON((a as any).os_breakdown, {});
  const browser = parseJSON((a as any).browser_breakdown, {});
  const countries = parseJSON((a as any).country_breakdown, {});
  const cities = parseJSON((a as any).city_breakdown, {});
  const utmSources = parseJSON((a as any).utm_source_breakdown, {});

  const statCards = [
    { label: 'Total Contacts', value: a.total_contacts || 0, icon: LuUsers, iconColor: 'var(--accent)' },
    { label: 'New Leads', value: a.total_leads || 0, icon: LuTarget, iconColor: 'var(--accent)' },
    { label: 'Open Deals', value: a.open_deals || 0, icon: LuKanban, iconColor: 'var(--accent)' },
    { label: 'Reply Rate', value: `${a.reply_rate_pct || 0}%`, icon: LuPercent, iconColor: 'var(--accent)' },
    { label: 'Won Value', value: formatCurrency(a.won_deal_value_cents || 0), icon: LuDollarSign, iconColor: 'var(--accent)' },
  ];

  const aiStatCards = [
    { label: 'Agent Actions', value: (a as any).total_agent_actions || 0, icon: LuTarget, iconColor: 'var(--accent)' },
    { label: 'Pending Approvals', value: (a as any).total_pending_approvals || 0, icon: LuKanban, iconColor: 'var(--text-secondary)' },
    { label: 'Total Approved', value: (a as any).total_approved || 0, icon: LuKanban, iconColor: 'var(--success, #10b981)' },
    { label: 'Total Rejected', value: (a as any).total_rejected || 0, icon: LuTarget, iconColor: 'var(--error, #ef4444)' },
    { label: 'Avg Lead Score', value: (a as any).avg_lead_score || 0, icon: LuPercent, iconColor: 'var(--accent)' },
  ];

  const maxFunnel = Math.max(a.total_contacts || 1, a.total_leads || 1);
  const funnelStages = [
    { label: 'Contacts', count: a.total_contacts || 0 },
    { label: 'Leads', count: a.total_leads || 0 },
    { label: 'Prospects', count: a.total_prospects || 0 },
    { label: 'Customers', count: a.total_customers || 0 },
  ];

  return (
    <div class="analytics-page">
      <div class="analytics-main">
        <div class="analytics-content">
          <div class="stat-grid">
            {statCards.map((stat, idx) => (
              <div key={idx} class="stat-card" style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3)); border: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <stat.icon style={`width: 1rem; height: 1rem; color: ${stat.iconColor};`} />
                  <span style="font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary);">{stat.label}</span>
                </div>
                <div class="stat-value" style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">{stat.value}</div>
              </div>
            ))}
          </div>

          <h3 style="font-size: 1.125rem; font-weight: 600; color: var(--text-primary); margin: 0 0 1rem;">AI Agent Operations</h3>
          <div class="stat-grid">
            {aiStatCards.map((stat, idx) => (
              <div key={idx} class="stat-card" style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3)); border: 1px solid var(--border);">
                <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.5rem;">
                  <stat.icon style={`width: 1rem; height: 1rem; color: ${stat.iconColor};`} />
                  <span style="font-size: 0.8125rem; font-weight: 500; color: var(--text-secondary);">{stat.label}</span>
                </div>
                <div class="stat-value" style="font-size: 2rem; font-weight: 700; color: var(--text-primary);">{stat.value}</div>
              </div>
            ))}
          </div>

          <div class="chart-card" style="margin-bottom: 1.5rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.5rem;">
              <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0;">Contacts Trend</h3>
              <select
                value={timeRange.value}
                onChange$={(e) => timeRange.value = (e.target as HTMLSelectElement).value}
                style="padding: 0.5rem 1rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; background: var(--surface-2); color: var(--text-primary); cursor: pointer;"
              >
                <option value="7d" selected={timeRange.value === '7d'}>Last 7 Days</option>
                <option value="30d" selected={timeRange.value === '30d'}>Last 30 Days</option>
                <option value="12m" selected={timeRange.value === '12m'}>Last 12 Months</option>
                <option value="lifetime" selected={timeRange.value === 'lifetime'}>Lifetime</option>
              </select>
            </div>

            <div class="chart-bars">
              {activeTrendData.map(({val, label}, i: number) => {
                const height = maxContacts > 0 ? ((val / maxContacts) * 120 + 20) : 20;
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
              })}
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); padding-top: 0.5rem; border-top: 1px solid var(--border);">
              <span>Older</span>
              <span>Recent</span>
            </div>
          </div>

          <div class="breakdown-grid">
            <div class="chart-card">
              <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 1rem;">Contact Funnel</h3>
              {funnelStages.every(s => s.count === 0) ? (
                <div style="padding: 2rem 1rem; text-align: center; color: var(--text-secondary);">Not enough data.</div>
              ) : (
                <div>
                  {funnelStages.map(stage => {
                    const pct = Math.max(0, Math.round((stage.count / maxFunnel) * 100));
                    return (
                      <div style="margin-bottom: 0.75rem;" key={stage.label}>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                          <span style="font-size: 0.875rem; color: var(--text-primary);">{stage.label}</span>
                          <span style="font-size: 0.75rem; color: var(--text-secondary);">{stage.count}</span>
                        </div>
                        <div style="height: 0.375rem; background: var(--surface-3); border-radius: 0.25rem; overflow: hidden;">
                          <div style={`height: 100%; background: var(--accent); border-radius: 0.25rem; transition: width 0.3s ease; width: ${stage.count > 0 ? Math.max(4, pct) : 0}%`}></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div class="chart-card">
              <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0 0 1rem;">Deals Outcome</h3>
              {(!a.won_deals && !a.lost_deals && !a.open_deals) ? (
                <div style="padding: 2rem 1rem; text-align: center; color: var(--text-secondary);">No deal data available yet.</div>
              ) : (
                <div>
                  <div style="margin-bottom: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                      <span style="font-size: 0.875rem; color: var(--text-primary);">Won ({a.won_deals || 0})</span>
                      <span style="font-size: 0.75rem; color: var(--text-secondary);">{Math.round(((a.won_deals || 0) / Math.max(1, a.won_deals + a.lost_deals + a.open_deals)) * 100)}%</span>
                    </div>
                    <div style="height: 0.375rem; background: var(--surface-3); border-radius: 0.25rem; overflow: hidden;">
                      <div style={`background:#16a34a;height: 100%; border-radius: 0.25rem; width: ${Math.max(4, ((a.won_deals || 0) / Math.max(1, a.won_deals + a.lost_deals + a.open_deals)) * 100)}%`}></div>
                    </div>
                  </div>
                  <div style="margin-bottom: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                      <span style="font-size: 0.875rem; color: var(--text-primary);">Open ({a.open_deals || 0})</span>
                      <span style="font-size: 0.75rem; color: var(--text-secondary);">{Math.round(((a.open_deals || 0) / Math.max(1, a.won_deals + a.lost_deals + a.open_deals)) * 100)}%</span>
                    </div>
                    <div style="height: 0.375rem; background: var(--surface-3); border-radius: 0.25rem; overflow: hidden;">
                      <div style={`background:#3b82f6;height: 100%; border-radius: 0.25rem; width: ${Math.max(4, ((a.open_deals || 0) / Math.max(1, a.won_deals + a.lost_deals + a.open_deals)) * 100)}%`}></div>
                    </div>
                  </div>
                  <div style="margin-bottom: 0.75rem;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 0.25rem;">
                      <span style="font-size: 0.875rem; color: var(--text-primary);">Lost ({a.lost_deals || 0})</span>
                      <span style="font-size: 0.75rem; color: var(--text-secondary);">{Math.round(((a.lost_deals || 0) / Math.max(1, a.won_deals + a.lost_deals + a.open_deals)) * 100)}%</span>
                    </div>
                    <div style="height: 0.375rem; background: var(--surface-3); border-radius: 0.25rem; overflow: hidden;">
                      <div style={`background:#dc2626;height: 100%; border-radius: 0.25rem; width: ${Math.max(4, ((a.lost_deals || 0) / Math.max(1, a.won_deals + a.lost_deals + a.open_deals)) * 100)}%`}></div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <BreakdownCard title="Device Breakdown" data={devices} color="#8b5cf6" />
            <BreakdownCard title="OS Breakdown" data={os} color="#ec4899" />
            <BreakdownCard title="Browser Breakdown" data={browser} color="#06b6d4" />
            <BreakdownCard title="Top Countries" data={countries} color="#3b82f6" />
            <BreakdownCard title="Top Cities" data={cities} color="#f59e0b" />
            <BreakdownCard title="UTM Sources" data={utmSources} color="#10b981" />
          </div>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "CRM Analytics",
};

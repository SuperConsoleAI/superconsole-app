import { component$, useSignal, useStylesScoped$, useVisibleTask$, type PropFunction } from "@builder.io/qwik";
import {
  LuCpu,
  LuDollarSign,
  LuLayers,
  LuMessageSquare,
  LuZap,
  LuUsers,
  LuWrench,
  LuRefreshCw,
} from "@qwikest/icons/lucide";
import { invoke } from "@tauri-apps/api/core";
import type { AgentAnalytics } from "~/lib/types";
import { useAppContext } from "~/lib/app-context";
import {
  getCachedStaffLookup,
  setCachedStaffLookup,
  getModelDisplayName,
  findProviderForModel,
  AGENT_PROVIDER_OPTIONS,
} from "~/lib/agent-config";
import { ProviderIcon } from "~/components/common/ProviderIcon";

const getProviderDisplayName = (key: string) => {
  const found = AGENT_PROVIDER_OPTIONS.find((p) => p.id === key || p.id === key.toLowerCase());
  if (found) return found.name;
  if (key === "cli_claude" || key === "cli:claude") return "Claude Code (CLI)";
  if (key === "cli_antigravity" || key === "cli:antigravity") return "Antigravity (CLI)";
  if (key === "cli_codex" || key === "cli:codex") return "Codex (CLI)";
  return key.charAt(0).toUpperCase() + key.slice(1);
};

const getProviderBadgeLabel = (provKey: string) => {
  if (provKey === "cli_claude" || provKey === "cli:claude") return "Claude CLI";
  if (provKey === "cli_antigravity" || provKey === "cli:antigravity") return "Antigravity CLI";
  if (provKey === "cli_codex" || provKey === "cli:codex") return "Codex CLI";
  if (provKey.startsWith("cli")) return "CLI";
  const found = AGENT_PROVIDER_OPTIONS.find((p) => p.id === provKey);
  return found?.name || (provKey.charAt(0).toUpperCase() + provKey.slice(1));
};

const ANALYTICS_STYLES = `
  .agent-analytics-container {
    flex: 1;
    width: 100%;
    max-width: 1200px;
    margin: 0 auto;
    container-type: inline-size;
  }
  .stat-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 1rem;
    margin-bottom: 1.5rem;
  }
  @media (max-width: 1024px) {
    .stat-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (max-width: 480px) {
    .stat-grid { grid-template-columns: 1fr; }
  }

  /* When AgentChatSidebar is open, top 4 cards become a 2*2 grid */
  .stat-grid.agent-sidebar-open,
  :global(.app-layout.agent-open) .stat-grid,
  :global(.app-main.agent-open) .stat-grid {
    grid-template-columns: repeat(2, 1fr) !important;
  }

  /* Responsive container queries when sidebar expands or viewport shrinks */
  @container (max-width: 960px) {
    .stat-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
    .breakdown-grid {
      grid-template-columns: 1fr !important;
    }
  }
  @container (max-width: 480px) {
    .stat-grid {
      grid-template-columns: 1fr !important;
    }
  }

  @media (max-width: 520px) {
    .stat-grid.agent-sidebar-open,
    :global(.app-layout.agent-open) .stat-grid,
    :global(.app-main.agent-open) .stat-grid {
      grid-template-columns: 1fr !important;
    }
  }
  .stat-card {
    padding: 1.25rem;
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
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
  .chart-bars-scroll {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .chart-bars {
    height: 160px;
    display: flex;
    align-items: flex-end;
    gap: 4px;
    padding-top: 2.5rem;
    min-width: 100%;
    overflow: visible;
  }
  .chart-bar-wrap {
    flex: 1;
    min-width: 6px;
    position: relative;
    display: flex;
    align-items: flex-end;
    height: 100%;
    cursor: default;
  }
  .chart-bar-tooltip {
    display: none;
    position: absolute;
    top: 4px;
    left: 50%;
    transform: translateX(-50%);
    background: #1e1e2e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: #fff;
    padding: 0.35rem 0.6rem;
    border-radius: 0.35rem;
    font-size: 0.7rem;
    white-space: nowrap;
    z-index: 200;
    pointer-events: none;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }
  .chart-bar-wrap:hover .chart-bar-tooltip {
    display: block;
  }
  @media (max-width: 768px) {
    .chart-bars {
      height: 150px;
      gap: 3px;
      padding-top: 2.5rem;
    }
    .chart-bar-wrap { min-width: 5px; }
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
  .progress-bar-bg {
    width: 100%;
    height: 6px;
    background: var(--surface-3);
    border-radius: 9999px;
    overflow: hidden;
    margin-top: 0.375rem;
  }
  .progress-bar-fill {
    height: 100%;
    background: var(--accent);
    border-radius: 9999px;
    transition: width 0.3s ease;
  }
  .table-card {
    background: var(--surface-2);
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    overflow: hidden;
  }
  .analytics-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.875rem;
  }
  .analytics-table th {
    text-align: left;
    padding: 0.75rem 1rem;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border);
    background: var(--surface-3);
  }
  .analytics-table td {
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--border);
    color: var(--text-primary);
  }
  .analytics-table tr:last-child td {
    border-bottom: none;
  }
  .analytics-table tr:hover td {
    background: var(--surface-3);
  }
  .badge-metric {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.125rem 0.5rem;
    border-radius: 9999px;
    font-size: 0.75rem;
    font-weight: 500;
    background: var(--surface-3);
    color: var(--text-secondary);
  }
  .grid-2 {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1.5rem;
    margin-top: 1.5rem;
  }
  @media (max-width: 1024px) {
    .grid-2 { grid-template-columns: 1fr; }
  }
`;

export interface AgentAnalyticsViewProps {
  data: AgentAnalytics | null;
  onRefresh$?: PropFunction<() => void>;
  isLoading?: boolean;
}

export const AgentAnalyticsView = component$<AgentAnalyticsViewProps>(
  ({ data, onRefresh$, isLoading = false }) => {
    useStylesScoped$(ANALYTICS_STYLES);
    const appCtx = useAppContext();
    const isAgentSidebarOpen = appCtx?.agentChatOpen?.value ?? false;
    const timeRange = useSignal<"7d" | "30d" | "12m" | "lifetime">("30d");
    const metricType = useSignal<"cost" | "tokens" | "sessions" | "messages">("cost");
    const staffLookup = useSignal<Record<string, string>>(getCachedStaffLookup() || {});

    // Fetch shop_staff to resolve names for any legacy or raw ID keys
    // eslint-disable-next-line qwik/no-use-visible-task
    useVisibleTask$(async () => {
      try {
        const staffList = await invoke<any[]>("shop_list_staff", {});
        if (Array.isArray(staffList)) {
          const map: Record<string, string> = {};
          for (const s of staffList) {
            const fullName = [s.first_name, s.last_name].filter(Boolean).join(" ").trim() || s.display_name || s.name;
            if (s.id && fullName) {
              map[s.id] = fullName;
            }
            if (s.user_id && fullName) {
              map[s.user_id] = fullName;
            }
          }
          staffLookup.value = map;
          setCachedStaffLookup(map);
        }
      } catch (err) {
        console.debug("Failed to load staff list for analytics lookup:", err);
      }
    });

    const getStaffDisplayName = (raw: string) => {
      if (!raw || raw === "owner" || raw === "unknown") return "Primary User (Owner)";
      if (staffLookup.value[raw]) return staffLookup.value[raw];
      return raw;
    };

    const totalSessions = data?.totalSessions || 0;
    const totalCost = data?.totalCost || 0.0;
    const totalTokens = data?.totalTokens || 0;
    const totalMessages = data?.totalMessages || 0;
    const totalToolCalls = data?.totalToolCalls || 0;

    const parseJson = (val: any, defaultVal: any = []) => {
      if (!val) return defaultVal;
      if (typeof val === "string") {
        try {
          return JSON.parse(val);
        } catch {
          return defaultVal;
        }
      }
      return val;
    };

    const getChartData = () => {
      const range = timeRange.value;
      const raw =
        range === "7d"
          ? data?.sessions7d
          : range === "30d"
          ? data?.sessions30d
          : range === "12m"
          ? data?.sessions12m
          : data?.sessionsLifetime;

      const parsed = parseJson(raw, []);
      if (Array.isArray(parsed)) {
        return parsed.map((pt: any) => ({
          date: pt.date || "",
          sessions: Number(pt.sessions || 0),
          messages: Number(pt.messages || 0),
          tokens: Number(pt.tokens || 0),
          cost: Number(pt.cost || 0.0),
        }));
      }

      // If lifetime is key-value object { "2026": count }
      if (typeof parsed === "object" && parsed !== null) {
        return Object.entries(parsed).map(([date, sessions]) => ({
          date,
          sessions: Number(sessions || 0),
          messages: 0,
          tokens: 0,
          cost: 0.0,
        }));
      }

      return [];
    };

    const chartData = getChartData();
    const maxVal = Math.max(
      ...chartData.map((d: any) => d[metricType.value] || 0),
      0.0001
    );

    const len = chartData.length;
    const xAxisLabels: string[] = [];
    if (len > 0) {
      xAxisLabels.push(chartData[0].date);
      if (len >= 7) {
        xAxisLabels.push(chartData[Math.floor(len / 2)].date);
      }
      if (len > 1) {
        xAxisLabels.push(chartData[len - 1].date);
      }
    }

    const formatTokens = (num: number) => {
      if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
      if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
      return num.toLocaleString();
    };

    const formatCost = (num: number) => {
      if (num === 0) return "$0.00";
      if (num < 0.01) return `$${num.toFixed(4)}`;
      return `$${num.toFixed(2)}`;
    };

    const models = Object.entries(parseJson(data?.modelBreakdown, {})).map(
      ([name, details]: [string, any]) => ({
        name,
        provider: details?.provider || findProviderForModel(name),
        sessions: Number(details?.sessions || 0),
        tokens: Number(details?.tokens || 0),
        cost: Number(details?.cost || 0.0),
      })
    );

    const providers = Object.entries(parseJson(data?.providerBreakdown, {})).map(
      ([name, details]: [string, any]) => ({
        name,
        sessions: Number(details?.sessions || 0),
        tokens: Number(details?.tokens || 0),
        cost: Number(details?.cost || 0.0),
      })
    );

    const staff = Object.entries(parseJson(data?.staffBreakdown, {})).map(
      ([name, details]: [string, any]) => ({
        name,
        sessions: Number(details?.sessions || 0),
        messages: Number(details?.messages || 0),
        tokens: Number(details?.tokens || 0),
        cost: Number(details?.cost || 0.0),
      })
    );

    const tools = Object.entries(parseJson(data?.toolBreakdown, {})).map(
      ([name, count]: [string, any]) => ({
        name,
        count: Number(count || 0),
      })
    );

    return (
      <div class="agent-analytics-container">
        {/* Metric Cards Top Row */}
        <div class={["stat-grid", isAgentSidebarOpen ? "agent-sidebar-open" : ""]}>
          {/* Total Cost */}
          <div
            class="stat-card"
            style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3)); border: 1px solid var(--border);"
          >
            <div style="display: flex; align-items: center; justify-content: space-between; color: var(--text-secondary); font-size: 0.875rem;">
              <span style="display: flex; align-items: center; gap: 0.5rem;">
                <LuDollarSign style="width: 1.125rem; height: 1.125rem; color: #10b981;" /> Total Spend
              </span>
              <span style="font-size: 0.75rem; background: rgba(16,185,129,0.1); color: #10b981; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                USD
              </span>
            </div>
            <div
              class="stat-value"
              style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-top: 0.5rem;"
            >
              {formatCost(totalCost)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
              Auto-tracked per session & model
            </div>
          </div>

          {/* Total Tokens */}
          <div
            class="stat-card"
            style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3)); border: 1px solid var(--border);"
          >
            <div style="display: flex; align-items: center; justify-content: space-between; color: var(--text-secondary); font-size: 0.875rem;">
              <span style="display: flex; align-items: center; gap: 0.5rem;">
                <LuCpu style="width: 1.125rem; height: 1.125rem; color: #6366f1;" /> Total Tokens
              </span>
              <span style="font-size: 0.75rem; background: rgba(99,102,241,0.1); color: #6366f1; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                {totalSessions} sess
              </span>
            </div>
            <div
              class="stat-value"
              style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-top: 0.5rem;"
            >
              {formatTokens(totalTokens)}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
              Prompt: {formatTokens(data?.totalPromptTokens || 0)} · Compl: {formatTokens(data?.totalCompletionTokens || 0)}
            </div>
          </div>

          {/* Total Sessions & Messages */}
          <div
            class="stat-card"
            style="background: linear-gradient(145deg, var(--accent), var(--accent-hover)); color: var(--surface-1);"
          >
            <div style="display: flex; align-items: center; justify-content: space-between; opacity: 0.9; font-size: 0.875rem;">
              <span style="display: flex; align-items: center; gap: 0.5rem;">
                <LuMessageSquare style="width: 1.125rem; height: 1.125rem;" /> Active Sessions
              </span>
              <span style="font-size: 0.75rem; background: rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                90d retained
              </span>
            </div>
            <div
              class="stat-value"
              style="font-size: 2rem; font-weight: 700; color: var(--surface-1); margin-top: 0.5rem;"
            >
              {totalSessions.toLocaleString()}
            </div>
            <div style="font-size: 0.75rem; opacity: 0.85; margin-top: 0.25rem;">
              {totalMessages.toLocaleString()} messages ({data?.totalUserMessages || 0} user, {data?.totalAssistantMessages || 0} AI)
            </div>
          </div>

          {/* Autonomous Tool Calls */}
          <div
            class="stat-card"
            style="background: linear-gradient(145deg, var(--surface-2), var(--surface-3)); border: 1px solid var(--border);"
          >
            <div style="display: flex; align-items: center; justify-content: space-between; color: var(--text-secondary); font-size: 0.875rem;">
              <span style="display: flex; align-items: center; gap: 0.5rem;">
                <LuZap style="width: 1.125rem; height: 1.125rem; color: #f59e0b;" /> Tool Actions
              </span>
              <span style="font-size: 0.75rem; background: rgba(245,158,11,0.1); color: #f59e0b; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                Live
              </span>
            </div>
            <div
              class="stat-value"
              style="font-size: 2rem; font-weight: 700; color: var(--text-primary); margin-top: 0.5rem;"
            >
              {totalToolCalls.toLocaleString()}
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); margin-top: 0.25rem;">
              Autonomous inventory, billing & CRM operations
            </div>
          </div>
        </div>

        {/* Performance Over Time Chart Card */}
        <div class="chart-card">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; flex-wrap: wrap; gap: 0.75rem;">
            <div>
              <h3 style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin: 0;">
                Agent Usage & Spend Over Time
              </h3>
              <p style="font-size: 0.8125rem; color: var(--text-secondary); margin: 0.25rem 0 0 0;">
                Aggregated daily and monthly across sessions
              </p>
            </div>
            <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
              {onRefresh$ && (
                <button
                  onClick$={onRefresh$}
                  disabled={isLoading}
                  class="btn btn-secondary"
                  style="height: 2rem; padding: 0 0.75rem; font-size: 0.8125rem; display: flex; align-items: center; gap: 0.375rem;"
                >
                  <LuRefreshCw style={`width: 0.875rem; height: 0.875rem; ${isLoading ? "animation: spin 1s linear infinite;" : ""}`} />
                  Refresh
                </button>
              )}
              <select
                value={metricType.value}
                onChange$={(e) => (metricType.value = (e.target as HTMLSelectElement).value as any)}
                style="height: 2rem; padding: 0 0.875rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; background: var(--surface-2); color: var(--text-primary); cursor: pointer;"
              >
                <option value="cost">Spend ($ USD)</option>
                <option value="tokens">Tokens</option>
                <option value="sessions">Sessions</option>
                <option value="messages">Messages</option>
              </select>
              <select
                value={timeRange.value}
                onChange$={(e) => (timeRange.value = (e.target as HTMLSelectElement).value as any)}
                style="height: 2rem; padding: 0 0.875rem; border: 1px solid var(--border); border-radius: 0.375rem; font-size: 0.8125rem; background: var(--surface-2); color: var(--text-primary); cursor: pointer;"
              >
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
                <option value="12m">Last 12 Months</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </div>
          </div>

          {chartData.length > 0 ? (
            <>
              <div class="chart-bars-scroll">
                <div class="chart-bars">
                  {chartData.map((d: any, i: number) => {
                    const val = d[metricType.value] || 0;
                    const height = maxVal > 0 ? Math.max((val / maxVal) * 120, val > 0 ? 3 : 0) : 0;

                    const isCost = metricType.value === "cost";
                    const isTokens = metricType.value === "tokens";

                    const bgStyle = isCost
                      ? "background: linear-gradient(180deg, #10b981, rgba(16,185,129,0.25)); border: 1px solid #10b981;"
                      : isTokens
                      ? "background: linear-gradient(180deg, #6366f1, rgba(99,102,241,0.25)); border: 1px solid #6366f1;"
                      : "background: linear-gradient(180deg, var(--accent), rgba(99,102,241,0.25)); border: 1px solid var(--accent);";

                    const tooltipValue = isCost
                      ? formatCost(val)
                      : isTokens
                      ? formatTokens(val)
                      : val.toLocaleString();

                    return (
                      <div key={i} class="chart-bar-wrap">
                        <div class="chart-bar-tooltip">
                          <div style="font-weight: 600; margin-bottom: 0.15rem; font-size: 0.7rem; color: rgba(255,255,255,0.6);">
                            {d.date}
                          </div>
                          <div style="font-weight: 700; font-size: 0.75rem; color: #fff;">
                            {tooltipValue}
                          </div>
                          <div style="font-size: 0.65rem; color: rgba(255,255,255,0.5); margin-top: 0.1rem; text-transform: capitalize;">
                            {metricType.value}
                          </div>
                        </div>
                        <div
                          style={`width: 100%; height: ${height}px; border-radius: 0.2rem 0.2rem 0 0; ${bgStyle}`}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style="display: flex; justify-content: space-between; font-size: 0.75rem; color: var(--text-secondary); padding-top: 0.75rem; border-top: 1px solid var(--border);">
                {xAxisLabels.length > 0 ? (
                  <>
                    <span style="flex: 1; text-align: left;">{xAxisLabels[0]}</span>
                    {xAxisLabels.length === 3 && (
                      <span style="flex: 1; text-align: center;">{xAxisLabels[1]}</span>
                    )}
                    {xAxisLabels.length >= 2 && (
                      <span style="flex: 1; text-align: right;">
                        {xAxisLabels[xAxisLabels.length - 1]}
                      </span>
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
              No session data available for this range
            </div>
          )}
        </div>

        {/* Breakdowns Grid */}
        <div class="breakdown-grid">
          {/* Model Breakdown */}
          <div class="breakdown-card">
            <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
              <LuCpu style="width: 1.125rem; height: 1.125rem; color: #6366f1;" /> Model Usage
            </h3>
            {models.length > 0 ? (
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                {models.map((item, i) => {
                  const pct = totalTokens > 0 ? ((item.tokens / totalTokens) * 100).toFixed(0) : "0";
                  const prov = item.provider || findProviderForModel(item.name);
                  const isCli = item.name.startsWith("cli") || prov?.startsWith("cli");
                  const displayName = getModelDisplayName(item.name);
                  const badgeLabel = getProviderBadgeLabel(prov);
                  return (
                    <div key={i}>
                      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.875rem; margin-bottom: 0.375rem; gap: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0; flex: 1;">
                          <ProviderIcon model={item.name} provider={prov} size="1.125rem" />
                          <span
                            style="font-weight: 500; color: var(--text-secondary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                            title={item.name}
                          >
                            {displayName}
                          </span>
                          <span
                            style="display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.625rem; font-weight: 500; padding: 1px 5px; border-radius: 0.25rem; background: transparent; border: 1px solid var(--border); color: var(--text-secondary); opacity: 0.7; flex-shrink: 0; white-space: nowrap;"
                            title={isCli ? `Local CLI (${prov})` : `Provider: ${badgeLabel}`}
                          >
                            <ProviderIcon provider={prov} size="0.6875rem" />
                            <span>{badgeLabel}</span>
                          </span>
                        </div>
                        <span style="color: var(--text-secondary); font-size: 0.8125rem; flex-shrink: 0;">
                          {item.sessions} sess · {formatTokens(item.tokens)} · {formatCost(item.cost)}
                        </span>
                      </div>
                      <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style={`width: ${pct}%;`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">No model data available yet.</p>
            )}
          </div>

          {/* Provider Breakdown */}
          <div class="breakdown-card">
            <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
              <LuLayers style="width: 1.125rem; height: 1.125rem; color: #10b981;" /> Provider Breakdown
            </h3>
            {providers.length > 0 ? (
              <div style="display: flex; flex-direction: column; gap: 1rem;">
                {providers.map((item, i) => {
                  const pct = totalSessions > 0 ? ((item.sessions / totalSessions) * 100).toFixed(0) : "0";
                  const isCliProvider = item.name.startsWith("cli") || AGENT_PROVIDER_OPTIONS.find((p) => p.id === item.name)?.isCli;
                  const providerDisplayName = getProviderDisplayName(item.name);
                  return (
                    <div key={i}>
                      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.875rem; margin-bottom: 0.375rem; gap: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem; min-width: 0; flex: 1;">
                          <ProviderIcon provider={item.name} size="1.125rem" />
                          <span style="font-weight: 500; color: var(--text-primary); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                            {providerDisplayName}
                          </span>
                          {isCliProvider && (
                            <span style="font-size: 0.625rem; font-weight: 500; padding: 1px 5px; border-radius: 0.25rem; background: transparent; border: 1px solid var(--border); color: var(--text-secondary); opacity: 0.7; flex-shrink: 0;">
                              CLI
                            </span>
                          )}
                        </div>
                        <span style="color: var(--text-secondary); font-size: 0.8125rem; flex-shrink: 0;">
                          {item.sessions} sessions ({pct}%)
                        </span>
                      </div>
                      <div class="progress-bar-bg">
                        <div class="progress-bar-fill" style={`width: ${pct}%; background: #10b981;`} />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">No provider data available.</p>
            )}
          </div>

          {/* Team / Staff Activity */}
          <div class="breakdown-card">
            <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
              <LuUsers style="width: 1.125rem; height: 1.125rem; color: #f59e0b;" /> Team & Staff Interactions
            </h3>
            {staff.length > 0 ? (
              <div style="display: flex; flex-direction: column; gap: 0.875rem;">
                {staff.map((item, i) => (
                  <div key={i} style="display: flex; justify-content: space-between; align-items: center; padding-bottom: 0.5rem; border-bottom: 1px solid var(--border);">
                    <div>
                      <div style="font-weight: 500; color: var(--text-primary); font-size: 0.875rem;">
                        {getStaffDisplayName(item.name)}
                      </div>
                      <div style="font-size: 0.75rem; color: var(--text-secondary);">
                        {item.messages} messages · {formatTokens(item.tokens)} tokens
                      </div>
                    </div>
                    <span style="font-weight: 600; font-size: 0.875rem; color: #10b981;">
                      {formatCost(item.cost)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">No staff interactions recorded yet.</p>
            )}
          </div>

          {/* Autonomous Tool Breakdown */}
          <div class="breakdown-card">
            <h3 style="font-size: 1rem; font-weight: 600; margin: 0 0 1rem 0; color: var(--text-primary); display: flex; align-items: center; gap: 0.5rem;">
              <LuWrench style="width: 1.125rem; height: 1.125rem; color: #ec4899;" /> Autonomous Tools Executed
            </h3>
            {tools.length > 0 ? (
              <div style="display: flex; flex-direction: column; gap: 0.75rem;">
                {tools.map((item, i) => (
                  <div key={i} style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-family: monospace; font-size: 0.8125rem; color: var(--text-secondary);">
                      {item.name}
                    </span>
                    <span style="font-weight: 600; font-size: 0.875rem; background: var(--surface-3); padding: 2px 8px; border-radius: 4px;">
                      {item.count}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p style="color: var(--text-secondary); font-size: 0.875rem; margin: 0;">
                All autonomous tools executed via chat will appear here.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }
);

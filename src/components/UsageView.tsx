import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, Download, Loader2 } from "lucide-react";
import {
  api,
  type UsageBreakdown,
  type UsageLevel,
  type UsageRow,
  type Workspace,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

type Period = "month" | "year" | "all";

// Provider color channels for charts (a deliberate data-viz exception to the
// token-only color rule, like the xterm theme).
const PROVIDER_COLOR: Record<string, string> = {
  anthropic: "#a06cd5",
  openai: "#10a37f",
  google: "#4285f4",
  gemini: "#4285f4",
  openrouter: "#f59e0b",
  local: "#9ca3af",
};

function providerColor(p?: string): string {
  return PROVIDER_COLOR[(p ?? "").toLowerCase()] ?? "#a06cd5";
}

function fmtUsd(n: number): string {
  if (!n) return "$0.00";
  return n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${n}`;
}

function fmtDay(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString([], { month: "short", day: "numeric" });
}

// 365 day keys ending today, oldest first.
function lastYearDays(): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 364; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(now.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

interface PeriodTotals {
  cost: number;
  sessions: number;
  tokens: number;
  prompt: number;
  cached: number;
  completion: number;
  reasoning: number;
  cacheHits: number;
}

function periodTotals(row: UsageRow, period: Period, year: string): PeriodTotals {
  if (period === "all") {
    return {
      cost: row.cost_lifetime_usd,
      sessions: row.sessions_lifetime,
      tokens:
        row.tokens_prompt_lifetime +
        row.tokens_prompt_cached_lifetime +
        row.tokens_completion_lifetime +
        row.tokens_reasoning_lifetime,
      prompt: row.tokens_prompt_lifetime,
      cached: row.tokens_prompt_cached_lifetime,
      completion: row.tokens_completion_lifetime,
      reasoning: row.tokens_reasoning_lifetime,
      cacheHits: row.cache_hits_lifetime,
    };
  }
  if (period === "year") {
    const y = row.analytics_lifetime[year];
    return {
      cost: y?.cost_usd ?? 0,
      sessions: y?.sessions ?? 0,
      tokens: (y?.tokens_prompt ?? 0) + (y?.tokens_completion ?? 0),
      prompt: y?.tokens_prompt ?? 0,
      cached: 0,
      completion: y?.tokens_completion ?? 0,
      reasoning: 0,
      cacheHits: y?.cache_hits ?? 0,
    };
  }
  // month: derive from heatmap entries in the current calendar month.
  const prefix = new Date().toISOString().slice(0, 7);
  let cost = 0;
  let sessions = 0;
  let tokens = 0;
  for (const [day, v] of Object.entries(row.heatmap_365d)) {
    if (day.startsWith(prefix)) {
      cost += v.cost_usd;
      sessions += v.sessions;
      tokens += v.tokens;
    }
  }
  return { cost, sessions, tokens, prompt: 0, cached: 0, completion: 0, reasoning: 0, cacheHits: 0 };
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className="mt-1 font-display text-xl font-semibold tabular-nums">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// One breakdown table (by_model / by_provider / by_cli / by_project / by_org).
function Breakdown({
  title,
  entries,
  splitKey,
}: {
  title: string;
  entries: [string, UsageBreakdown][];
  splitKey?: boolean;
}) {
  const max = Math.max(1, ...entries.map(([, v]) => v.cost_usd ?? 0));
  if (entries.length === 0) return null;
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        {title}
      </p>
      <div className="flex flex-col gap-2.5">
        {entries.map(([key, v]) => {
          const [model, provider] = splitKey ? key.split(":") : [key, v.provider];
          const color = providerColor(provider);
          const tokens = v.tokens ?? (v.tokens_prompt ?? 0) + (v.tokens_completion ?? 0);
          return (
            <div key={key} className="flex items-center gap-3">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: color }}
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-[13px] font-medium">{model}</span>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                    {v.sessions ?? 0} sess · {fmtTokens(tokens)} · {fmtUsd(v.cost_usd ?? 0)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${Math.round(((v.cost_usd ?? 0) / max) * 100)}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Heatmap({ row, mode }: { row: UsageRow; mode: "tokens" | "cost" }) {
  const days = useMemo(() => lastYearDays(), []);
  const values = days.map((d) => {
    const v = row.heatmap_365d[d];
    return mode === "tokens" ? (v?.tokens ?? 0) : (v?.cost_usd ?? 0);
  });
  const max = Math.max(1, ...values);
  const intensity = (v: number) => {
    if (v <= 0) return 0;
    const r = v / max;
    if (r < 0.25) return 1;
    if (r < 0.5) return 2;
    if (r < 0.75) return 3;
    return 4;
  };
  // Group into weeks (columns of 7).
  const weeks: { day: string; v: number; lvl: number }[][] = [];
  days.forEach((day, i) => {
    if (i % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({ day, v: values[i], lvl: intensity(values[i]) });
  });
  const cellColor = (lvl: number) =>
    ["bg-muted", "bg-primary/25", "bg-primary/45", "bg-primary/70", "bg-primary"][lvl];

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Activity (365 days)
        </p>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span key={l} className={cn("h-2.5 w-2.5 rounded-sm", cellColor(l))} />
          ))}
          <span>More</span>
        </div>
      </div>
      <div className="flex gap-[3px] overflow-x-auto">
        {weeks.map((week, i) => (
          <div key={i} className="flex flex-col gap-[3px]">
            {week.map((c) => (
              <span
                key={c.day}
                title={`${fmtDay(c.day)} — ${mode === "tokens" ? fmtTokens(c.v) + " tokens" : fmtUsd(c.v)}`}
                className={cn("h-2.5 w-2.5 rounded-sm", cellColor(c.lvl))}
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function buildReport(
  label: string,
  level: UsageLevel,
  row: UsageRow,
  t: PeriodTotals,
  periodLabel: string,
): string {
  const cacheRate =
    t.prompt + t.cached > 0 ? Math.round((t.cached / (t.prompt + t.cached)) * 100) : 0;
  const models = Object.entries(row.by_model)
    .sort((a, b) => (b[1].cost_usd ?? 0) - (a[1].cost_usd ?? 0))
    .map(([k, v]) => {
      const [m, p] = k.split(":");
      const tk = v.tokens ?? (v.tokens_prompt ?? 0) + (v.tokens_completion ?? 0);
      return `| ${m} | ${p ?? v.provider ?? ""} | ${v.sessions ?? 0} | ${fmtTokens(tk)} | ${fmtUsd(v.cost_usd ?? 0)} |`;
    })
    .join("\n");
  return `# AI Usage Report — ${label}
Level: ${level}
Period: ${periodLabel}
Generated: ${new Date().toISOString().slice(0, 10)}

## Summary
Total tokens: ${t.tokens.toLocaleString()}
Estimated cost: ${fmtUsd(t.cost)}
Sessions: ${t.sessions}
Cache hit rate: ${cacheRate}%

## By Model
| Model | Provider | Sessions | Tokens | Cost |
|-------|----------|----------|--------|------|
${models || "| — | — | — | — | — |"}

Note: Costs are estimates based on published pricing. Actual charges may vary.
Check your provider dashboard for exact billing.
`;
}

export function UsageView({ workspaces }: { workspaces: Workspace[] }) {
  const { auth, activeCloudOrg } = useAuth();
  const [level, setLevel] = useState<UsageLevel>("project");
  const [period, setPeriod] = useState<Period>("all");
  const [heatMode, setHeatMode] = useState<"tokens" | "cost">("tokens");
  const [row, setRow] = useState<UsageRow | null>(null);
  const [loading, setLoading] = useState(false);

  const cloudWorkspaces = useMemo(
    () => workspaces.filter((w) => w.project_id),
    [workspaces],
  );
  const [projectId, setProjectId] = useState<string | null>(
    cloudWorkspaces[0]?.project_id ?? null,
  );
  // Org viewed for analytics; independent of the active cloud org so users can
  // inspect any org's usage without switching their working context.
  const orgs = auth?.orgs ?? [];
  const [orgId, setOrgId] = useState<string | null>(null);
  const viewedOrgId = orgId ?? activeCloudOrg?.id ?? null;

  const selectedId =
    level === "project"
      ? projectId
      : level === "org"
        ? viewedOrgId
        : auth?.user.id ?? null;

  const label =
    level === "project"
      ? cloudWorkspaces.find((w) => w.project_id === projectId)?.name ?? "Project"
      : level === "org"
        ? orgs.find((o) => o.id === viewedOrgId)?.name ?? "Organization"
        : auth?.user.email ?? "Account";

  const years = useMemo(() => {
    const ks = row ? Object.keys(row.analytics_lifetime) : [];
    const cur = new Date().getFullYear().toString();
    return Array.from(new Set([cur, ...ks])).sort().reverse();
  }, [row]);
  const [year, setYear] = useState(new Date().getFullYear().toString());

  const load = useCallback(() => {
    if (!selectedId) {
      setRow(null);
      return;
    }
    setLoading(true);
    api
      .getUsage(level, selectedId)
      .then(setRow)
      .catch(() => setRow(null))
      .finally(() => setLoading(false));
  }, [level, selectedId]);

  useEffect(() => {
    load();
  }, [load]);

  const totals = row ? periodTotals(row, period, year) : null;
  const cacheRate =
    totals && totals.prompt + totals.cached > 0
      ? Math.round((totals.cached / (totals.prompt + totals.cached)) * 100)
      : 0;
  const periodLabel =
    period === "all" ? "All time" : period === "year" ? year : "This month";

  const exportReport = () => {
    if (!row || !totals) return;
    const md = buildReport(label, level, row, totals, periodLabel);
    const blob = new Blob([md], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage-${label.replace(/\s+/g, "-").toLowerCase()}-${periodLabel.replace(/\s+/g, "-").toLowerCase()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const seg = (active: boolean) =>
    cn(
      "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
      active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
    );

  const breakdowns = row
    ? (() => {
        const sort = (m: Record<string, UsageBreakdown>) =>
          Object.entries(m).sort((a, b) => (b[1].cost_usd ?? 0) - (a[1].cost_usd ?? 0));
        const out: { title: string; entries: [string, UsageBreakdown][]; split?: boolean }[] = [
          { title: "By model", entries: sort(row.by_model), split: true },
          { title: "By provider", entries: sort(row.by_provider) },
        ];
        if (level === "project") out.push({ title: "By CLI", entries: sort(row.by_cli) });
        if (level === "project") out.push({ title: "By member", entries: sort(row.by_member) });
        if (level === "org") out.push({ title: "By project", entries: sort(row.by_project) });
        if (level === "account") out.push({ title: "By org", entries: sort(row.by_org) });
        return out;
      })()
    : [];

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b px-5 py-3">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-primary" />
          <h1 className="font-display text-base font-semibold">Usage</h1>
        </div>

        <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
          {(["project", "org", "account"] as UsageLevel[]).map((l) => (
            <button key={l} className={seg(level === l)} onClick={() => setLevel(l)}>
              {l[0].toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>

        {level === "project" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                {label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {cloudWorkspaces.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => setProjectId(w.project_id as string)}
                >
                  {w.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {level === "org" && orgs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs">
                {label}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {orgs.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => setOrgId(o.id)}>
                  {o.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
            {(["month", "year", "all"] as Period[]).map((p) => (
              <button key={p} className={seg(period === p)} onClick={() => setPeriod(p)}>
                {p === "month" ? "This month" : p === "year" ? "This year" : "All time"}
              </button>
            ))}
          </div>
          {period === "year" && years.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-7 px-2.5 text-xs tabular-nums">
                  {year}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {years.map((y) => (
                  <DropdownMenuItem key={y} onClick={() => setYear(y)}>
                    {y}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2.5 text-xs"
            onClick={exportReport}
            disabled={!row}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
        </div>
      </header>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-4 p-5">
          {loading && (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          )}

          {!loading && !selectedId && (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {level === "project"
                ? "No cloud-linked projects yet. Open a workspace to create one."
                : "Sign in to view cloud usage."}
            </p>
          )}

          {!loading && selectedId && totals && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Metric label="Spend" value={fmtUsd(totals.cost)} />
                <Metric label="Sessions" value={totals.sessions.toLocaleString()} />
                <Metric label="Tokens" value={fmtTokens(totals.tokens)} />
                <Metric label="Cache hit" value={`${cacheRate}%`} />
              </div>

              {period === "all" && (
                <div className="rounded-xl border bg-card p-4">
                  <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Token breakdown
                  </p>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
                    <KeyVal k="Prompt (uncached)" v={fmtTokens(totals.prompt)} />
                    <KeyVal k="Completion" v={fmtTokens(totals.completion)} />
                    <KeyVal k="Reasoning" v={fmtTokens(totals.reasoning)} />
                    <KeyVal k="Prompt (cached)" v={fmtTokens(totals.cached)} />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-0.5">
                <div className="flex items-center gap-0.5 rounded-lg bg-muted p-0.5">
                  {(["tokens", "cost"] as const).map((m) => (
                    <button key={m} className={seg(heatMode === m)} onClick={() => setHeatMode(m)}>
                      {m === "tokens" ? "Tokens" : "Cost"}
                    </button>
                  ))}
                </div>
              </div>
              <Heatmap row={row!} mode={heatMode} />

              <div className="grid gap-4 md:grid-cols-2">
                {breakdowns.map((b) => (
                  <Breakdown key={b.title} title={b.title} entries={b.entries} splitKey={b.split} />
                ))}
              </div>
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

function KeyVal({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] text-muted-foreground">{k}</span>
      <span className="font-medium tabular-nums">{v}</span>
    </div>
  );
}

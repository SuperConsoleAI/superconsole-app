/**
 * TasksView Component — Background job, task runner, and execution history dashboard
 * Supports filtering tasks by workspace, manual run triggers, and run logs inspection.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  History,
  Loader2,
  MessageSquare,
  Pencil,
  Play,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import {
  api,
  type Job,
  type Organization,
  type SessionFeedItem,
  type Workspace,
} from "@/lib/api";
import { TaskFormContent } from "@/components/TaskFormContent";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PresetIcon } from "@/components/PresetIcon";
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn, getActiveWorkspaceFilter } from "@/lib/utils";

// ─── helpers ────────────────────────────────────────────────────────────────

function parseUtc(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d;
}

function fmtRelative(s: string | null): string {
  const d = parseUtc(s);
  if (!d) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

function parseNextRun(s: string | null): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(" ", "T") + "Z");
  return isNaN(d.getTime()) ? null : d;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtNextRun(s: string | null): string {
  if (!s) return "";
  const d = new Date(s.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return s;
  const now = new Date();
  const diff = d.getTime() - now.getTime();
  const min = Math.round(diff / 60000);
  if (min < 1)  return "now";
  if (min < 60) return `in ${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24)  return `in ${hr}h`;
  const day = Math.round(hr / 24);
  if (day === 1) return "tomorrow";
  if (day < 30)  return `in ${day}d`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

const WEEKDAY_SHORT2 = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
function fmtCronHuman(cron: string): string {
  if (!cron || cron === "manual") return "Manual";
  const p = cron.trim().split(/\s+/);
  if (p.length !== 5) return cron;
  const [m, h, dom, , dow] = p;
  if (dom !== "*") return cron;
  const hh = parseInt(h, 10);
  const mm = parseInt(m, 10);
  const pad = (n: number) => String(n).padStart(2, "0");
  const time = isNaN(hh) ? "" : ` at ${pad(hh)}:${pad(mm)}`;
  if (h === "*") return "Every hour";
  if (dow === "*") return `Daily${time}`;
  if (dow === "1-5") return `Weekdays${time}`;
  const d = parseInt(dow, 10);
  return `${WEEKDAY_SHORT2[d] ?? dow}s${time}`;
}

// ─── Activity session row (same design as SessionsView) ───────────────────────

function ActivityRow({
  item,
  onResume,
}: {
  item: SessionFeedItem;
  onResume: (workspaceId: number, cli: string, sessionId: string) => void;
}) {
  const isCli = item.session_type === "cli";
  return (
    <div className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent/50">
      <div className="flex min-w-0 flex-1 items-center gap-2.5 px-2 py-2.5">
        {isCli ? (
          <PresetIcon preset={item.cli} className="h-4 w-4 shrink-0" />
        ) : (
          <ProviderIcon provider={item.provider} className="h-4 w-4 shrink-0 opacity-80" />
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {item.last_message_preview || item.cli}
        </span>
        {item.tokens_total > 0 && (
          <span className="hidden shrink-0 gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
            ~${item.cost_usd.toFixed(2)} · {Math.round(item.tokens_total / 1000)}K tok
          </span>
        )}
        <span className="hidden max-w-[26%] shrink-0 truncate text-xs text-muted-foreground sm:inline">
          {item.workspace_name}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {fmtRelative(item.updated_at)}
        </span>
      </div>
      <button
        className="shrink-0 rounded px-2 py-1 text-xs font-medium text-primary opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
        onClick={() => onResume(item.workspace_id, item.cli, item.resume_id)}
      >
        View →
      </button>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function TasksView({
  initialWorkspaceId,
  workspaces,
  organizations,
  activeOrgId,
  onResume,
}: {
  initialWorkspaceId?: number;
  workspaces: Workspace[];
  organizations: Organization[];
  activeOrgId: number;
  onResume: (workspaceId: number, cli: string, sessionId: string) => void;
}) {
  const activeWsId = getActiveWorkspaceFilter(initialWorkspaceId);
  const targetWs = activeWsId ? workspaces.find((w) => w.id === activeWsId) : null;
  const [tab, setTab] = useState<"tasks" | "activity">("tasks");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [running, setRunning] = useState<number | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [orgFilter, setOrgFilter] = useState<number | "all">(targetWs?.organization_id ?? "all");
  const [projFilter, setProjFilter] = useState<number | "all">(targetWs?.id ?? "all");
  const [expandedJob, setExpandedJob] = useState<number | null>(null);
  const [jobSessions, setJobSessions] = useState<Record<number, SessionFeedItem[] | "loading">>({});
  const [activityItems, setActivityItems] = useState<SessionFeedItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [showAddTask, setShowAddTask] = useState(false);

  useEffect(() => {
    if (activeWsId && projFilter === "all" && workspaces.length > 0) {
      const ws = workspaces.find((w) => w.id === activeWsId);
      if (ws) {
        setProjFilter(ws.id);
        if (ws.organization_id) setOrgFilter(ws.organization_id);
      }
    }
  }, [activeWsId, projFilter, workspaces]);
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const refresh = useCallback(() => {
    Promise.all(workspaces.map((w) => api.listJobs(w.id).catch(() => [] as Job[])))
      .then((lists) => setJobs(lists.flat()))
      .catch(console.error);
  }, [workspaces]);

  const loadActivity = useCallback(() => {
    setActivityLoading(true);
    // Sessions where job_id IS NOT NULL AND agent_id IS NULL (task-triggered runs)
    api.listAllJobSessions()
      .then(setActivityItems)
      .catch(console.error)
      .finally(() => setActivityLoading(false));
  }, []);

  useEffect(() => {
    refresh();
    api.listOrganizations().then(setOrgs).catch(() => { });
  }, [refresh]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("tasks-tab-sync", { detail: tab }));
  }, [tab]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("tasks-org-sync", { detail: orgFilter }));
  }, [orgFilter]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("tasks-proj-sync", { detail: projFilter }));
  }, [projFilter]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("tasks-view-sync", { detail: view }));
  }, [view]);

  useEffect(() => {
    const onTab = (e: any) => setTab(e.detail);
    const onOrg = (e: any) => { setOrgFilter(e.detail); setProjFilter("all"); };
    const onProj = (e: any) => setProjFilter(e.detail);
    const onView = (e: any) => setView(e.detail);
    const onAdd = () => setShowAddTask(true);
    const onNavMounted = () => {
      window.dispatchEvent(new CustomEvent("tasks-tab-sync", { detail: tab }));
      window.dispatchEvent(new CustomEvent("tasks-org-sync", { detail: orgFilter }));
      window.dispatchEvent(new CustomEvent("tasks-proj-sync", { detail: projFilter }));
      window.dispatchEvent(new CustomEvent("tasks-view-sync", { detail: view }));
    };

    window.addEventListener("tasks-tab-change", onTab);
    window.addEventListener("tasks-org-change", onOrg);
    window.addEventListener("tasks-proj-change", onProj);
    window.addEventListener("tasks-view-change", onView);
    window.addEventListener("tasks-add-open", onAdd);
    window.addEventListener("tasks-nav-mounted", onNavMounted);

    return () => {
      window.removeEventListener("tasks-tab-change", onTab);
      window.removeEventListener("tasks-org-change", onOrg);
      window.removeEventListener("tasks-proj-change", onProj);
      window.removeEventListener("tasks-view-change", onView);
      window.removeEventListener("tasks-add-open", onAdd);
      window.removeEventListener("tasks-nav-mounted", onNavMounted);
    };
  }, [tab, orgFilter, projFilter, view]);

  useEffect(() => {
    if (tab === "activity") loadActivity();
  }, [tab, loadActivity]);

  const wsById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces]);
  const wsName = (id: number) => wsById.get(id)?.name ?? "unknown";

  const orgWorkspaces = useMemo(
    () => orgFilter === "all" ? workspaces : workspaces.filter((w) => w.organization_id === orgFilter),
    [workspaces, orgFilter],
  );

  const filteredJobs = useMemo(() => {
    const allowedWs = new Set(orgWorkspaces.map((w) => w.id));
    return jobs.filter(
      (j) => allowedWs.has(j.workspace_id) && (projFilter === "all" || j.workspace_id === projFilter),
    );
  }, [jobs, orgWorkspaces, projFilter]);

  // Activity filter by org/project
  const filteredActivity = useMemo(() => {
    const allowedWs = new Set(orgWorkspaces.map((w) => w.id));
    return activityItems.filter(
      (s) => allowedWs.has(s.workspace_id) && (projFilter === "all" || s.workspace_id === projFilter),
    );
  }, [activityItems, orgWorkspaces, projFilter]);

  const runNow = async (id: number) => {
    setRunning(id);
    try {
      await api.runJobNow(id);
      refresh();
    } finally {
      setRunning(null);
    }
  };

  const toggleJobExpand = (jobId: number) => {
    if (expandedJob === jobId) { setExpandedJob(null); return; }
    setExpandedJob(jobId);
    if (jobSessions[jobId] === undefined) {
      setJobSessions((p) => ({ ...p, [jobId]: "loading" }));
      api.listJobSessions(jobId)
        .then((list) => setJobSessions((p) => ({ ...p, [jobId]: list })))
        .catch(() => setJobSessions((p) => ({ ...p, [jobId]: [] })));
    }
  };

  // Calendar cells
  const cells = useMemo(() => {
    const year = month.getFullYear();
    const m = month.getMonth();
    const first = new Date(year, m, 1);
    const daysInMonth = new Date(year, m + 1, 0).getDate();
    const lead = first.getDay();
    const byDay = new Map<number, Job[]>();
    for (const j of filteredJobs) {
      const d = parseNextRun(j.next_run);
      if (d && d.getFullYear() === year && d.getMonth() === m) {
        const day = d.getDate();
        byDay.set(day, [...(byDay.get(day) ?? []), j]);
      }
    }
    const out: { day: number | null; jobs: Job[] }[] = [];
    for (let i = 0; i < lead; i++) out.push({ day: null, jobs: [] });
    for (let d = 1; d <= daysInMonth; d++) out.push({ day: d, jobs: byDay.get(d) ?? [] });
    return out;
  }, [month, filteredJobs]);

  const today = new Date();
  const isToday = (day: number) =>
    today.getFullYear() === month.getFullYear() &&
    today.getMonth() === month.getMonth() &&
    today.getDate() === day;

  // All orgs for the dropdown (use passed organizations + loaded orgs)
  const allOrgs = useMemo(() => {
    const map = new Map<number, Organization>();
    for (const o of organizations) map.set(o.id, o);
    for (const o of orgs) map.set(o.id, o);
    return [...map.values()];
  }, [organizations, orgs]);

  return (
    <div className="flex h-full flex-col">

      {/* Add Task Dialog */}
      <Dialog open={showAddTask && tab === "tasks"} onOpenChange={(o) => !o && setShowAddTask(false)}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" strokeWidth={1} />
              New task
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto no-scrollbar">
            <TaskFormContent
              workspaces={workspaces}
              organizations={allOrgs}
              defaultOrgId={activeOrgId}
              onSaved={() => { refresh(); setShowAddTask(false); }}
              onCancel={() => setShowAddTask(false)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Task Dialog */}
      <Dialog open={!!editJob} onOpenChange={(o) => { if (!o) { setEditJob(null); refresh(); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" strokeWidth={1} />
              Edit: {editJob?.name ?? "Task"}
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-y-auto no-scrollbar">
            {editJob && (
              <TaskFormContent
                workspaces={workspaces}
                organizations={allOrgs}
                defaultWsId={editJob.workspace_id}
                initialJob={editJob}
                onSaved={() => { setEditJob(null); refresh(); }}
                onCancel={() => setEditJob(null)}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>

      <ScrollArea className="min-h-0 flex-1">
        {/* ── TASKS TAB ── */}
        {tab === "tasks" && view === "list" && (
          <div className="flex flex-col gap-2 px-5 py-4">
            {filteredJobs.length === 0 && (
              <div className="rounded-xl border border-dashed py-16 text-center">
                <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
                <p className="mt-3 text-sm text-muted-foreground">
                  No tasks yet. Click <strong>+ Add task</strong> to schedule a recurring command.
                </p>
              </div>
            )}
            {filteredJobs.map((job) => {
              const rc = (() => { try { return JSON.parse(job.run_config); } catch { return {}; } })();
              const isChat = job.run_mode === "chat";
              const presetId = rc.cli || "claude";
              const providerId = rc.provider || "anthropic";
              const modelId = rc.model || "";
              return (
              <div key={job.id} className="flex flex-col rounded-lg border bg-card">
                <div className="flex items-center gap-2 px-3.5 py-2.5">
                  {/* Toggle */}
                  <button
                    className={cn("h-4 w-7 shrink-0 rounded-full transition-colors", job.enabled ? "bg-primary" : "bg-muted")}
                    title={job.enabled ? "Disable" : "Enable"}
                    onClick={() => api.setJobEnabled(job.id, !job.enabled).then(refresh).catch(console.error)}
                  >
                    <span className={cn("block h-3 w-3 rounded-full bg-background transition-transform", job.enabled ? "translate-x-3.5" : "translate-x-0.5")} />
                  </button>

                  {/* CLI/Chat mode icon */}
                  {isChat ? (
                    <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  ) : (
                    <TerminalSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                  )}

                  {/* Provider / CLI icon */}
                  {isChat ? (
                    <ProviderIcon provider={providerId} className="h-4 w-4 shrink-0" />
                  ) : (
                    <PresetIcon preset={presetId} className="h-4 w-4 shrink-0" />
                  )}

                  {/* Name + project + schedule */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{job.name}</span>
                      <Badge variant="secondary" className="shrink-0 font-normal text-[10px]">{wsName(job.workspace_id)}</Badge>
                      <Badge variant="outline" className="text-[10px]">
                        {fmtCronHuman(job.schedule)}
                      </Badge>
                    </div>
                  </div>

                  {/* Right chips — model only */}
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    {modelId && (
                      <span className="hidden items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-flex">
                        <ProviderIcon model={modelId} className="h-2.5 w-2.5 opacity-50" />
                        <span className="font-mono">{modelId.split("/").pop()}</span>
                      </span>
                    )}
                    {job.last_run_cost_usd > 0 && (
                      <span className="hidden shrink-0 gap-1 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-flex">
                        ~${job.last_run_cost_usd.toFixed(2)}
                      </span>
                    )}
                  </div>

                  {/* Action icons — tighter gap, schedule chip first */}
                  <div className="flex shrink-0 items-center gap-0.5">
                    {/* Schedule / next-run chip */}
                    {job.next_run && (
                      <span className="mr-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                        {fmtNextRun(job.next_run)}
                      </span>
                    )}

                    {/* Run now */}
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={running === job.id} onClick={() => runNow(job.id)} title="Run now">
                      <Play className={cn("h-3.5 w-3.5", running === job.id && "animate-pulse")} strokeWidth={1} />
                    </Button>

                    {/* Pencil — edit this task */}
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Edit task" onClick={() => setEditJob(job)}>
                      <Pencil className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
                    </Button>

                    {/* Delete */}
                    <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={() => api.deleteJob(job.id).then(refresh).catch(console.error)} title="Delete">
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
                    </Button>

                    {/* Expand sessions */}
                    <button
                      className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent"
                      title="View sessions"
                      onClick={() => toggleJobExpand(job.id)}
                    >
                      <ChevronRight
                        className={cn("h-3.5 w-3.5 transition-transform", expandedJob === job.id && "rotate-90")}
                        strokeWidth={1.5}
                      />
                    </button>
                  </div>
                </div>

                {expandedJob === job.id && (
                  <div className="border-t px-2 py-1">
                    {jobSessions[job.id] === "loading" || jobSessions[job.id] === undefined ? (
                      <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading sessions…
                      </div>
                    ) : (jobSessions[job.id] as SessionFeedItem[]).length === 0 ? (
                      <p className="py-2 text-xs text-muted-foreground">No sessions recorded yet.</p>
                    ) : (
                      <div className="divide-y divide-border">
                        {(jobSessions[job.id] as SessionFeedItem[]).map((s) => (
                          <ActivityRow key={s.id} item={s} onResume={onResume} />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
            })}
          </div>
        )}

        {/* Calendar view */}
        {tab === "tasks" && view === "calendar" && (
          <div className="mx-auto max-w-4xl px-5 py-4">
            <div className="mb-3 flex items-center justify-center gap-3">
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>
                <ChevronLeft className="h-4 w-4" strokeWidth={1} />
              </Button>
              <span className="w-44 text-center text-sm font-medium">{MONTHS[month.getMonth()]} {month.getFullYear()}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>
                <ChevronRight className="h-4 w-4" strokeWidth={1} />
              </Button>
            </div>
            <div className="grid grid-cols-7 gap-1">
              {DOW.map((d) => (
                <div key={d} className="pb-1 text-center text-[11px] font-medium text-muted-foreground">{d}</div>
              ))}
              {cells.map((cell, i) => (
                <div key={i} className={cn("min-h-20 rounded-md border p-1", cell.day === null ? "border-transparent" : "bg-card")}>
                  {cell.day !== null && (
                    <>
                      <div className={cn("mb-0.5 text-right text-[11px]", isToday(cell.day) ? "font-semibold text-primary" : "text-muted-foreground")}>
                        {cell.day}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {cell.jobs.map((j) => (
                          <div
                            key={j.id}
                            className="truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary"
                            title={`${j.name} — ${wsName(j.workspace_id)} (${j.next_run})`}
                          >
                            {parseNextRun(j.next_run)?.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}{" "}
                            {j.name}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">Showing each task's next scheduled run.</p>
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {tab === "activity" && (
          <div className="flex flex-col px-5 py-3">
            {activityLoading ? (
              <div className="flex items-center justify-center py-16 text-xs text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading activity…
              </div>
            ) : filteredActivity.length === 0 ? (
              <div className="rounded-xl border border-dashed py-16 text-center">
                <History className="mx-auto h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
                <p className="mt-3 text-sm text-muted-foreground">No job sessions recorded yet.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredActivity.map((item) => (
                  <ActivityRow key={item.id} item={item} onResume={onResume} />
                ))}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

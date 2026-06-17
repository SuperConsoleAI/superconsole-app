import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  List,
  ListTodo,
  Play,
  Trash2,
} from "lucide-react";
import { api, type Job, type Organization, type Workspace } from "@/lib/api";
import { JobRunBadges } from "@/components/JobsDialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

// Backend next_run is "YYYY-MM-DD HH:MM:SS" in UTC.
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

export function TasksView({ workspaces }: { workspaces: Workspace[] }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [running, setRunning] = useState<number | null>(null);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [orgFilter, setOrgFilter] = useState<number | "all">("all");
  const [projFilter, setProjFilter] = useState<number | "all">("all");
  const [month, setMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });

  const refresh = useCallback(() => {
    Promise.all(workspaces.map((w) => api.listJobs(w.id).catch(() => [] as Job[])))
      .then((lists) => setJobs(lists.flat()))
      .catch(console.error);
  }, [workspaces]);

  useEffect(() => {
    refresh();
    api.listOrganizations().then(setOrgs).catch(() => {});
  }, [refresh]);

  const wsById = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w])),
    [workspaces],
  );
  const wsName = (id: number) => wsById.get(id)?.name ?? "unknown";
  const orgName = (id: number) => orgs.find((o) => o.id === id)?.name ?? "Org";

  // Workspaces available under the current org filter (drive the project list).
  const orgWorkspaces = useMemo(
    () =>
      orgFilter === "all"
        ? workspaces
        : workspaces.filter((w) => w.organization_id === orgFilter),
    [workspaces, orgFilter],
  );

  const filteredJobs = useMemo(() => {
    const allowedWs = new Set(orgWorkspaces.map((w) => w.id));
    return jobs.filter(
      (j) =>
        allowedWs.has(j.workspace_id) &&
        (projFilter === "all" || j.workspace_id === projFilter),
    );
  }, [jobs, orgWorkspaces, projFilter]);

  const runNow = async (id: number) => {
    setRunning(id);
    try {
      await api.runJobNow(id);
      refresh();
    } finally {
      setRunning(null);
    }
  };

  const setOrg = (id: number | "all") => {
    setOrgFilter(id);
    setProjFilter("all");
  };

  // Calendar: place each filtered job on its next_run day within the month.
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

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b bg-card/60 px-5">
        <ListTodo className="h-4 w-4 text-primary" strokeWidth={1} />
        <h1 className="font-display text-base font-semibold">Tasks</h1>
        <span className="text-xs text-muted-foreground">Scheduled jobs across your organizations</span>

        <div className="ml-auto flex items-center gap-2">
          {/* Org filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                {orgFilter === "all" ? "All orgs" : orgName(orgFilter)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setOrg("all")}>All orgs</DropdownMenuItem>
              {orgs.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => setOrg(o.id)}>
                  {o.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Project (workspace) filter */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                {projFilter === "all" ? "All projects" : wsName(projFilter)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setProjFilter("all")}>All projects</DropdownMenuItem>
              {orgWorkspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => setProjFilter(w.id)}>
                  {w.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* View toggle */}
          <div className="flex gap-0.5 rounded-lg border bg-background p-0.5">
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={() => setView("list")}
              title="List"
            >
              <List className="h-3.5 w-3.5" strokeWidth={1} />
            </Button>
            <Button
              variant={view === "calendar" ? "secondary" : "ghost"}
              size="icon"
              className="h-6 w-6"
              onClick={() => setView("calendar")}
              title="Calendar"
            >
              <CalendarDays className="h-3.5 w-3.5" strokeWidth={1} />
            </Button>
          </div>
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        {view === "list" ? (
          <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 py-4">
            {filteredJobs.length === 0 && (
              <div className="rounded-xl border border-dashed py-16 text-center">
                <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
                <p className="mt-3 text-sm text-muted-foreground">
                  No scheduled tasks. Open a workspace and use the clock icon to schedule recurring commands.
                </p>
              </div>
            )}
            {filteredJobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-2.5"
              >
                <button
                  className={cn(
                    "h-4 w-7 shrink-0 rounded-full transition-colors",
                    job.enabled ? "bg-primary" : "bg-muted",
                  )}
                  title={job.enabled ? "Disable" : "Enable"}
                  onClick={() =>
                    api.setJobEnabled(job.id, !job.enabled).then(refresh).catch(console.error)
                  }
                >
                  <span
                    className={cn(
                      "block h-3 w-3 rounded-full bg-background transition-transform",
                      job.enabled ? "translate-x-3.5" : "translate-x-0.5",
                    )}
                  />
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium">{job.name}</span>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {job.schedule}
                    </Badge>
                  </div>
                  <p className="truncate font-mono text-xs text-muted-foreground">{job.command}</p>
                  <JobRunBadges job={job} />
                </div>
                <Badge variant="secondary" className="shrink-0 font-normal">
                  {wsName(job.workspace_id)}
                </Badge>
                {job.next_run && (
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    next: {job.next_run}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  disabled={running === job.id}
                  onClick={() => runNow(job.id)}
                  title="Run now"
                >
                  <Play className={cn("h-3.5 w-3.5", running === job.id && "animate-pulse")} strokeWidth={1} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => api.deleteJob(job.id).then(refresh).catch(console.error)}
                  title="Delete"
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="mx-auto max-w-4xl px-5 py-4">
            <div className="mb-3 flex items-center justify-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1} />
              </Button>
              <span className="w-44 text-center text-sm font-medium">
                {MONTHS[month.getMonth()]} {month.getFullYear()}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
              >
                <ChevronRight className="h-4 w-4" strokeWidth={1} />
              </Button>
            </div>

            <div className="grid grid-cols-7 gap-1">
              {DOW.map((d) => (
                <div key={d} className="pb-1 text-center text-[11px] font-medium text-muted-foreground">
                  {d}
                </div>
              ))}
              {cells.map((cell, i) => (
                <div
                  key={i}
                  className={cn(
                    "min-h-20 rounded-md border p-1",
                    cell.day === null ? "border-transparent" : "bg-card",
                  )}
                >
                  {cell.day !== null && (
                    <>
                      <div
                        className={cn(
                          "mb-0.5 text-right text-[11px]",
                          isToday(cell.day)
                            ? "font-semibold text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        {cell.day}
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {cell.jobs.map((j) => (
                          <div
                            key={j.id}
                            className="truncate rounded bg-primary/10 px-1 py-0.5 text-[10px] text-primary"
                            title={`${j.name} — ${wsName(j.workspace_id)} (${j.next_run})`}
                          >
                            {parseNextRun(j.next_run)?.toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}{" "}
                            {j.name}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
            <p className="mt-3 text-center text-[11px] text-muted-foreground">
              Showing each job's next scheduled run.
            </p>
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

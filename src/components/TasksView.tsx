import { useCallback, useEffect, useState } from "react";
import { CalendarClock, ListTodo, Play, Trash2 } from "lucide-react";
import { api, type Job, type Workspace } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function TasksView({ workspaces }: { workspaces: Workspace[] }) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [running, setRunning] = useState<number | null>(null);

  const refresh = useCallback(() => {
    Promise.all(workspaces.map((w) => api.listJobs(w.id).catch(() => [] as Job[])))
      .then((lists) => setJobs(lists.flat()))
      .catch(console.error);
  }, [workspaces]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const wsName = (id: number) => workspaces.find((w) => w.id === id)?.name ?? "unknown";

  const runNow = async (id: number) => {
    setRunning(id);
    try {
      await api.runJobNow(id);
      refresh();
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center gap-3 border-b bg-card/60 px-5">
        <ListTodo className="h-4 w-4 text-primary" />
        <h1 className="font-display text-base font-semibold">Tasks</h1>
        <span className="text-xs text-muted-foreground">
          Scheduled jobs across this organization
        </span>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto flex max-w-3xl flex-col gap-2 px-5 py-4">
          {jobs.length === 0 && (
            <div className="rounded-xl border border-dashed py-16 text-center">
              <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="mt-3 text-sm text-muted-foreground">
                No scheduled tasks. Open a workspace and use the clock icon to
                schedule recurring commands.
              </p>
            </div>
          )}
          {jobs.map((job) => (
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
                <Play className={cn("h-3.5 w-3.5", running === job.id && "animate-pulse")} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => api.deleteJob(job.id).then(refresh).catch(console.error)}
                title="Delete"
              >
                <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
              </Button>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, History, Play, Plus, Trash2 } from "lucide-react";
import { api, type Job, type SessionLog } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const SCHEDULE_PRESETS = [
  { label: "Every Monday 9am", cron: "0 9 * * 1" },
  { label: "Daily at 9am", cron: "0 9 * * *" },
  { label: "Daily at 11am", cron: "0 11 * * *" },
  { label: "Every Friday 3pm", cron: "0 15 * * 5" },
  { label: "Every hour", cron: "0 * * * *" },
];

interface JobsDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function JobsDialog({ workspaceId, open, onOpenChange }: JobsDialogProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [history, setHistory] = useState<SessionLog[]>([]);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [schedule, setSchedule] = useState("0 9 * * 1");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<number | null>(null);

  const refresh = useCallback(() => {
    api.listJobs(workspaceId).then(setJobs).catch(console.error);
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      refresh();
      api.listSessionHistory(workspaceId).then(setHistory).catch(() => {});
    }
  }, [open, refresh, workspaceId]);

  const addJob = async () => {
    if (!name.trim() || !command.trim() || !schedule.trim()) {
      setError("Name, command, and schedule are required.");
      return;
    }
    setError(null);
    try {
      await api.addJob(workspaceId, name.trim(), command.trim(), schedule.trim());
      setName("");
      setCommand("");
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const runNow = async (id: number) => {
    setRunning(id);
    try {
      await api.runJobNow(id);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(null);
    }
  };

  const presetLabel =
    SCHEDULE_PRESETS.find((p) => p.cron === schedule)?.label ?? `Custom: ${schedule}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" />
            Scheduled jobs
          </DialogTitle>
          <DialogDescription>
            Recurring commands run in this workspace. Results land in the Inbox.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3">
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Job name (CEO brief)"
              className="h-8 text-sm"
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 justify-start font-normal">
                  {presetLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {SCHEDULE_PRESETS.map((p) => (
                  <DropdownMenuItem key={p.cron} onClick={() => setSchedule(p.cron)}>
                    {p.label}
                    <span className="ml-auto font-mono text-xs text-muted-foreground">
                      {p.cron}
                    </span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Input
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="/ceo or any prompt"
              className="col-span-2 h-8 font-mono text-sm"
            />
            <Input
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
              placeholder="cron: 0 9 * * 1"
              className="h-8 font-mono text-sm"
            />
            <Button size="sm" className="h-8" onClick={addJob}>
              <Plus className="h-3.5 w-3.5" />
              Add job
            </Button>
          </div>
          {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
        </div>

        <ScrollArea className="max-h-64">
          <div className="flex flex-col gap-1.5">
            {jobs.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No jobs scheduled yet.
              </p>
            )}
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
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
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {job.command}
                  </p>
                </div>
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

        {history.length > 0 && (
          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <History className="h-3.5 w-3.5" />
              Recent sessions
            </div>
            <ScrollArea className="max-h-28">
              <div className="flex flex-col gap-1">
                {history.map((s) => (
                  <div
                    key={s.id}
                    className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1 text-xs"
                  >
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {s.cli}
                    </Badge>
                    <span className="text-muted-foreground">{s.started_at}</span>
                    <span className="ml-auto text-muted-foreground">
                      {s.ended_at ? `ended ${s.ended_at}` : "running"}
                    </span>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

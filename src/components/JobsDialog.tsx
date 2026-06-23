/**
 * JobsDialog — project-page "Scheduled jobs" dialog.
 *
 * The form itself is now fully provided by TaskFormContent.
 * This file only owns: the dialog shell, the job list, and session history.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CalendarClock,
  History,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";
import {
  api,
  type Job,
  type Organization,
  type SessionLog,
  type Workspace,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { TaskFormContent } from "@/components/TaskFormContent";
import { PresetIcon } from "@/components/PresetIcon";
import { ProviderIcon } from "@/components/ProviderIcon";

// ─── Props ────────────────────────────────────────────────────────────────────

interface JobsDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set the dialog opens directly in edit mode for this job */
  initialJob?: Job;
  /** Passed through to TaskFormContent for the org/project picker */
  workspaces?: Workspace[];
  organizations?: Organization[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseJson<T>(s: string | undefined | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

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
  const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  return `${DAYS[d] ?? dow}s${time}`;
}

// ─── Job row (list item inside dialog) ────────────────────────────────────────

export function JobRunBadges({ job }: { job: Job }) {
  const rc = parseJson<{ cli?: string; provider?: string; agent?: string }>(job.run_config, {});
  if (job.run_mode === "agent") {
    return (
      <span className="text-[11px] text-muted-foreground">
        Agent · {rc.agent ?? "?"} · {job.trigger_type}
      </span>
    );
  }
  return (
    <span className="text-[11px] text-muted-foreground">
      {job.run_mode === "chat" ? "Chat" : "CLI"} · {job.trigger_type}
    </span>
  );
}

function JobRow({
  job, running, onToggle, onRun, onEdit, onDelete,
}: {
  job: Job;
  running: boolean;
  onToggle: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const rc = parseJson<{ cli?: string; provider?: string; model?: string }>(job.run_config, {});
  const isChat = job.run_mode === "chat";
  const presetId = rc.cli ?? "claude";
  const providerId = rc.provider ?? "anthropic";

  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2">
      {/* Toggle */}
      <button
        className={cn("h-4 w-7 shrink-0 rounded-full transition-colors", job.enabled ? "bg-primary" : "bg-muted")}
        title={job.enabled ? "Disable" : "Enable"}
        onClick={onToggle}
      >
        <span className={cn("block h-3 w-3 rounded-full bg-background transition-transform", job.enabled ? "translate-x-3.5" : "translate-x-0.5")} />
      </button>

      {/* Icon */}
      {isChat
        ? <ProviderIcon provider={providerId} className="h-4 w-4 shrink-0" />
        : <PresetIcon preset={presetId} className="h-4 w-4 shrink-0" />}

      {/* Name + schedule */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium">{job.name}</span>
          <Badge variant="outline" className="text-[10px]">{fmtCronHuman(job.schedule)}</Badge>
        </div>
        <JobRunBadges job={job} />
      </div>

      {/* Actions */}
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onEdit} title="Edit">
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={running} onClick={onRun} title="Run now">
        <Play className={cn("h-3.5 w-3.5", running && "animate-pulse")} strokeWidth={1} />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" onClick={onDelete} title="Delete">
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
      </Button>
    </div>
  );
}

// ─── JobsDialog ───────────────────────────────────────────────────────────────

export function JobsDialog({
  workspaceId,
  open,
  onOpenChange,
  initialJob,
  workspaces = [],
  organizations = [],
}: JobsDialogProps) {
  const [jobs, setJobs]       = useState<Job[]>([]);
  const [history, setHistory] = useState<SessionLog[]>([]);
  const [running, setRunning] = useState<number | null>(null);
  const [editJob, setEditJob] = useState<Job | null>(null);

  const refresh = useCallback(() => {
    api.listJobs(workspaceId).then(setJobs).catch(console.error);
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      refresh();
      api.listSessionHistory(workspaceId).then(setHistory).catch(() => {});
    }
  }, [open, refresh, workspaceId]);

  // Open directly to edit when initialJob is provided
  useEffect(() => {
    if (open && initialJob) setEditJob(initialJob);
  }, [open, initialJob]);

  const runNow = async (id: number) => {
    setRunning(id);
    try { await api.runJobNow(id); refresh(); }
    catch { /* ignore */ }
    finally { setRunning(null); }
  };

  // ── The workspace object for this dialog's workspace ──────────────────────
  const thisWorkspace = workspaces.find((w) => w.id === workspaceId);
  const ws = thisWorkspace ?? ({ id: workspaceId, name: "Project", organization_id: 0, created_at: "" } as Workspace);
  const wsArr: Workspace[] = workspaces.length > 0 ? workspaces : [ws];
  const orgArr: Organization[] = organizations.length > 0 ? organizations : [{ id: 0, name: "Org", created_at: "" } as Organization];

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setEditJob(null); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" strokeWidth={1} />
            {editJob ? `Edit: ${editJob.name}` : "Scheduled jobs"}
          </DialogTitle>
          <DialogDescription>
            {editJob
              ? "Update this task's settings."
              : "Recurring tasks that run in this workspace. Results land in the Inbox."}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[70vh] [&_[data-slot=scroll-area-viewport]>div]:!block">
          <div className="space-y-4 pr-1">
            {/* ── Form (add or edit) ── */}
            <TaskFormContent
              workspaces={wsArr}
              organizations={orgArr}
              defaultWsId={workspaceId}
              initialJob={editJob}
              onSaved={() => { setEditJob(null); refresh(); }}
              onCancel={() => setEditJob(null)}
            />

            {/* ── Job list ── */}
            {!editJob && (
              <div className="flex flex-col gap-1.5">
                {jobs.length === 0 && (
                  <p className="py-6 text-center text-sm text-muted-foreground">No tasks scheduled yet.</p>
                )}
                {jobs.map((job) => (
                  <JobRow
                    key={job.id}
                    job={job}
                    running={running === job.id}
                    onToggle={() => api.setJobEnabled(job.id, !job.enabled).then(refresh).catch(console.error)}
                    onRun={() => runNow(job.id)}
                    onEdit={() => setEditJob(job)}
                    onDelete={() => api.deleteJob(job.id).then(refresh).catch(console.error)}
                  />
                ))}
              </div>
            )}

            {/* ── Session history ── */}
            {!editJob && history.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <History className="h-3.5 w-3.5" strokeWidth={1} />
                  Recent sessions
                </div>
                <div className="flex flex-col gap-1">
                  {history.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 rounded-md bg-muted/40 px-2.5 py-1 text-xs">
                      <Badge variant="outline" className="font-mono text-[10px]">{s.cli}</Badge>
                      <span className="text-muted-foreground">{s.started_at}</span>
                      <span className="ml-auto text-muted-foreground">
                        {s.ended_at ? `ended ${s.ended_at}` : "running"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  History,
  Maximize2,
  Minimize2,
  Pencil,
  Play,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  api,
  CHAT_PROVIDERS,
  CLI_PRESETS,
  type Job,
  type SessionLog,
  type WorkspaceConnector,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

type Freq = "hourly" | "daily" | "weekdays" | "weekly" | "custom";

const FREQUENCIES: { id: Freq; label: string }[] = [
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
  { id: "custom", label: "Custom" },
];

const WEEKDAYS = [
  { v: 1, label: "Monday" },
  { v: 2, label: "Tuesday" },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" },
  { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" },
  { v: 0, label: "Sunday" },
];

const GH_EVENTS = ["push", "pull_request", "release", "workflow_run"];

const pad = (n: number) => String(n).padStart(2, "0");

// Compose a 5-field cron from the friendly schedule controls.
function buildCron(freq: Freq, time: string, weekday: number, custom: string): string {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10) || 0);
  switch (freq) {
    case "hourly":
      return "0 * * * *";
    case "daily":
      return `${m} ${h} * * *`;
    case "weekdays":
      return `${m} ${h} * * 1-5`;
    case "weekly":
      return `${m} ${h} * * ${weekday}`;
    default:
      return custom.trim();
  }
}

// Best-effort reverse: detect which friendly preset a cron matches.
function parseCron(cron: string): { freq: Freq; time: string; weekday: number } {
  const fallback = { freq: "custom" as Freq, time: "09:00", weekday: 1 };
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return fallback;
  const [m, h, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*") return fallback;
  const numeric = (s: string) => /^\d+$/.test(s);
  if (m === "0" && h === "*" && dow === "*") return { freq: "hourly", time: "09:00", weekday: 1 };
  if (numeric(m) && numeric(h)) {
    const time = `${pad(parseInt(h, 10))}:${pad(parseInt(m, 10))}`;
    if (dow === "*") return { freq: "daily", time, weekday: 1 };
    if (dow === "1-5") return { freq: "weekdays", time, weekday: 1 };
    if (/^[0-6]$/.test(dow)) return { freq: "weekly", time, weekday: parseInt(dow, 10) };
  }
  return fallback;
}

function scheduleSummary(freq: Freq, time: string, weekday: number, cron: string): string {
  const wd = WEEKDAYS.find((w) => w.v === weekday)?.label ?? "Monday";
  switch (freq) {
    case "hourly":
      return "Every hour";
    case "daily":
      return `Every day at ${time}`;
    case "weekdays":
      return `Weekdays (Mon-Fri) at ${time}`;
    case "weekly":
      return `Every ${wd} at ${time}`;
    default:
      return `cron: ${cron || "—"}`;
  }
}

interface JobsDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function parseJson<T>(s: string | undefined, fallback: T): T {
  if (!s) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

function Segment({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

export function JobsDialog({ workspaceId, open, onOpenChange }: JobsDialogProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [history, setHistory] = useState<SessionLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<number | null>(null);

  // Form state.
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [freq, setFreq] = useState<Freq>("weekly");
  const [timeOfDay, setTimeOfDay] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [customCron, setCustomCron] = useState("0 9 * * 1");
  const [runMode, setRunMode] = useState<"cli" | "chat">("cli");
  const [cli, setCli] = useState("claude");
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("");
  const [triggerType, setTriggerType] = useState<"cron" | "api" | "github">("cron");
  const [ghRepo, setGhRepo] = useState("");
  const [ghEvent, setGhEvent] = useState("push");
  const [ghBranch, setGhBranch] = useState("main");
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [connectors, setConnectors] = useState<WorkspaceConnector[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [settings, setSettings] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    api.listJobs(workspaceId).then(setJobs).catch(console.error);
  }, [workspaceId]);

  useEffect(() => {
    if (open) {
      refresh();
      api.listSessionHistory(workspaceId).then(setHistory).catch(() => {});
      api.listWorkspaceConnectors(workspaceId).then(setConnectors).catch(() => {});
      api.getSettings().then(setSettings).catch(() => {});
    }
  }, [open, refresh, workspaceId]);

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setCommand("");
    setFreq("weekly");
    setTimeOfDay("09:00");
    setWeekday(1);
    setCustomCron("0 9 * * 1");
    setPromptExpanded(false);
    setRunMode("cli");
    setCli("claude");
    setProvider("anthropic");
    setModel("");
    setTriggerType("cron");
    setGhRepo("");
    setGhEvent("push");
    setGhBranch("main");
    setChecked({});
    setError(null);
  };

  const schedule = useMemo(
    () => buildCron(freq, timeOfDay, weekday, customCron),
    [freq, timeOfDay, weekday, customCron],
  );

  // allowed_connectors: [] when everything is checked (unrestricted), else the
  // checked service ids only.
  const allowedConnectors = useMemo(() => {
    const ids = Array.from(new Set(connectors.map((c) => c.service)));
    const on = ids.filter((id) => checked[id] !== false);
    return on.length === ids.length ? [] : on;
  }, [connectors, checked]);

  const loadForEdit = (job: Job) => {
    const rc = parseJson<{ cli?: string; provider?: string; model?: string }>(job.run_config, {});
    const tc = parseJson<{ cron?: string; repo?: string; event?: string; branch?: string }>(
      job.trigger_config,
      {},
    );
    const allow = parseJson<string[]>(job.allowed_connectors, []);
    const cron = tc.cron ?? job.schedule;
    const parsed = parseCron(cron);
    setEditingId(job.id);
    setName(job.name);
    setCommand(job.command);
    setFreq(parsed.freq);
    setTimeOfDay(parsed.time);
    setWeekday(parsed.weekday);
    setCustomCron(cron);
    setRunMode(job.run_mode);
    setCli(rc.cli ?? "claude");
    setProvider(rc.provider ?? "anthropic");
    setModel(rc.model ?? "");
    setTriggerType(job.trigger_type);
    setGhRepo(tc.repo ?? "");
    setGhEvent(tc.event ?? "push");
    setGhBranch(tc.branch ?? "main");
    if (allow.length > 0) {
      const map: Record<string, boolean> = {};
      for (const c of connectors) map[c.service] = allow.includes(c.service);
      setChecked(map);
      setConnectorsOpen(true);
    } else {
      setChecked({});
    }
  };

  const submit = async () => {
    if (!name.trim() || !command.trim()) {
      setError("Name and command are required.");
      return;
    }
    if (triggerType === "cron" && !schedule.trim()) {
      setError("Schedule is required for cron triggers.");
      return;
    }
    const runConfig =
      runMode === "cli" ? { cli, model: model || undefined } : { provider, model: model || undefined };
    const triggerConfig =
      triggerType === "cron"
        ? { cron: schedule.trim() }
        : triggerType === "github"
          ? { repo: ghRepo.trim(), event: ghEvent, branch: ghBranch.trim() }
          : {};
    setError(null);
    try {
      if (editingId !== null) {
        await api.updateJob(
          editingId,
          name.trim(),
          command.trim(),
          schedule.trim(),
          runMode,
          JSON.stringify(runConfig),
          triggerType,
          JSON.stringify(triggerConfig),
          JSON.stringify(allowedConnectors),
        );
      } else {
        await api.addJob(workspaceId, name.trim(), command.trim(), schedule.trim(), {
          runMode,
          runConfig: JSON.stringify(runConfig),
          triggerType,
          triggerConfig: JSON.stringify(triggerConfig),
          allowedConnectors: JSON.stringify(allowedConnectors),
        });
      }
      resetForm();
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

  const httpPort = settings.http_port || "8765";
  const apiToken = settings.api_token || "<token>";
  const triggerCurl = `curl -X POST http://127.0.0.1:${httpPort}/trigger \\\n  -H "x-superconsole-token: ${apiToken}" \\\n  -d '{"workspace":"<name>","command":"${command || "<cmd>"}"}'`;

  const groups: { scope: "project" | "org" | "account"; label: string }[] = [
    { scope: "project", label: "Project" },
    { scope: "org", label: "Org" },
    { scope: "account", label: "Account" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-primary" strokeWidth={1} />
            Scheduled jobs
          </DialogTitle>
          <DialogDescription>
            Recurring commands run in this workspace. Results land in the Inbox.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pr-2">
            <div className="space-y-3 rounded-lg border bg-muted/40 p-3">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Job name (CEO brief)"
                className="h-8 text-sm"
              />

              {/* Run via */}
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Run via</div>
                <div className="flex items-center gap-2">
                  <div className="flex gap-1 rounded-lg border bg-background p-0.5">
                    <Segment active={runMode === "cli"} onClick={() => setRunMode("cli")}>
                      CLI
                    </Segment>
                    <Segment active={runMode === "chat"} onClick={() => setRunMode("chat")}>
                      Chat
                    </Segment>
                  </div>
                  {runMode === "cli" ? (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 font-normal">
                          {CLI_PRESETS.find((c) => c.id === cli)?.label ?? cli}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {CLI_PRESETS.map((c) => (
                          <DropdownMenuItem key={c.id} onClick={() => setCli(c.id)}>
                            {c.label}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onClick={() => setCli("shell")}>Shell</DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm" className="h-8 font-normal">
                          {CHAT_PROVIDERS.find((p) => p.id === provider)?.label ?? provider}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start">
                        {CHAT_PROVIDERS.map((p) => (
                          <DropdownMenuItem key={p.id} onClick={() => setProvider(p.id)}>
                            {p.label}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={runMode === "cli" ? "claude-sonnet-4-5" : "model id"}
                    className="h-8 flex-1 font-mono text-xs"
                  />
                </div>
              </div>

              {/* Trigger */}
              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Trigger</div>
                <div className="flex gap-1 rounded-lg border bg-background p-0.5 w-fit">
                  <Segment active={triggerType === "cron"} onClick={() => setTriggerType("cron")}>
                    Schedule
                  </Segment>
                  <Segment active={triggerType === "api"} onClick={() => setTriggerType("api")}>
                    API
                  </Segment>
                  <Segment
                    active={triggerType === "github"}
                    onClick={() => setTriggerType("github")}
                  >
                    GitHub
                  </Segment>
                </div>

                {triggerType === "cron" && (
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-0.5">
                        {FREQUENCIES.map((fr) => (
                          <Segment key={fr.id} active={freq === fr.id} onClick={() => setFreq(fr.id)}>
                            {fr.label}
                          </Segment>
                        ))}
                      </div>
                      {(freq === "daily" || freq === "weekdays" || freq === "weekly") && (
                        <Input
                          type="time"
                          value={timeOfDay}
                          onChange={(e) => setTimeOfDay(e.target.value)}
                          className="h-8 w-28 text-sm"
                        />
                      )}
                      {freq === "weekly" && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm" className="h-8 font-normal">
                              {WEEKDAYS.find((w) => w.v === weekday)?.label ?? "Monday"}
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="start">
                            {WEEKDAYS.map((w) => (
                              <DropdownMenuItem key={w.v} onClick={() => setWeekday(w.v)}>
                                {w.label}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                    {freq === "custom" ? (
                      <Input
                        value={customCron}
                        onChange={(e) => setCustomCron(e.target.value)}
                        placeholder="cron: min hour day-of-month month day-of-week (e.g. 0 6 * * 1)"
                        className="h-8 font-mono text-sm"
                      />
                    ) : (
                      <p className="text-[11px] text-muted-foreground">
                        {scheduleSummary(freq, timeOfDay, weekday, schedule)}
                        <span className="ml-1.5 font-mono opacity-60">({schedule})</span>
                      </p>
                    )}
                  </div>
                )}

                {triggerType === "api" && (
                  <div className="space-y-1.5 rounded-md border bg-background p-2.5">
                    <p className="text-xs text-muted-foreground">Trigger this job via HTTP POST:</p>
                    <div className="flex items-start gap-2">
                      <pre className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                        {triggerCurl}
                      </pre>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Copy"
                        onClick={() => navigator.clipboard.writeText(triggerCurl)}
                      >
                        <Copy className="h-3.5 w-3.5" strokeWidth={1} />
                      </Button>
                    </div>
                  </div>
                )}

                {triggerType === "github" && (
                  <div className="space-y-2 rounded-md border bg-background p-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <Input
                        value={ghRepo}
                        onChange={(e) => setGhRepo(e.target.value)}
                        placeholder="owner/repo"
                        className="h-8 font-mono text-sm"
                      />
                      <Input
                        value={ghBranch}
                        onChange={(e) => setGhBranch(e.target.value)}
                        placeholder="main"
                        className="h-8 font-mono text-sm"
                      />
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="h-8 font-normal">
                            {ghEvent}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start">
                          {GH_EVENTS.map((ev) => (
                            <DropdownMenuItem key={ev} onClick={() => setGhEvent(ev)}>
                              {ev}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Badge
                      variant="outline"
                      className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400"
                    >
                      Webhook not yet active — config saved for future use
                    </Badge>
                  </div>
                )}
              </div>

              {/* Connectors */}
              <div className="space-y-1.5">
                <button
                  type="button"
                  className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => setConnectorsOpen((v) => !v)}
                >
                  {connectorsOpen ? (
                    <ChevronDown className="h-3.5 w-3.5" strokeWidth={1} />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5" strokeWidth={1} />
                  )}
                  Restrict connectors
                </button>
                {connectorsOpen && (
                  <div className="space-y-2 rounded-md border bg-background p-2.5">
                    {connectors.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No connectors connected for this project.
                      </p>
                    ) : (
                      <>
                        {groups.map((g) => {
                          const rows = connectors.filter((c) => c.scope === g.scope);
                          if (rows.length === 0) return null;
                          return (
                            <div key={g.scope} className="space-y-1">
                              <div className="text-[10px] font-semibold uppercase text-muted-foreground">
                                {g.label}
                              </div>
                              {rows.map((c) => {
                                const on = checked[c.service] !== false;
                                return (
                                  <button
                                    key={`${g.scope}:${c.service}`}
                                    type="button"
                                    className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-muted"
                                    onClick={() =>
                                      setChecked((m) => ({ ...m, [c.service]: !on }))
                                    }
                                  >
                                    <span
                                      className={cn(
                                        "flex h-4 w-4 items-center justify-center rounded border",
                                        on
                                          ? "border-primary bg-primary text-primary-foreground"
                                          : "border-muted-foreground/40",
                                      )}
                                    >
                                      {on && <Check className="h-3 w-3" strokeWidth={2} />}
                                    </span>
                                    {c.label}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                        <p className="text-[11px] text-muted-foreground">
                          Leave all checked to allow access to all connected services.
                        </p>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Prompt / command */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">Prompt</div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setPromptExpanded((v) => !v)}
                  >
                    {promptExpanded ? (
                      <Minimize2 className="h-3 w-3" strokeWidth={1} />
                    ) : (
                      <Maximize2 className="h-3 w-3" strokeWidth={1} />
                    )}
                    {promptExpanded ? "Collapse" : "Expand"}
                  </button>
                </div>
                <Textarea
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  placeholder="/ceo or any prompt — can be as long as you need"
                  className={cn(
                    "resize-none font-mono text-sm",
                    promptExpanded ? "min-h-64" : "min-h-20",
                  )}
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex items-center justify-end gap-2">
                {editingId !== null && (
                  <Button variant="ghost" size="sm" className="h-8" onClick={resetForm}>
                    <X className="h-3.5 w-3.5" strokeWidth={1} />
                    Cancel
                  </Button>
                )}
                <Button size="sm" className="h-8" onClick={submit}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={1} />
                  {editingId !== null ? "Save job" : "Add job"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {jobs.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">
                  No jobs scheduled yet.
                </p>
              )}
              {jobs.map((job) => (
                <JobRow
                  key={job.id}
                  job={job}
                  running={running === job.id}
                  onToggle={() =>
                    api.setJobEnabled(job.id, !job.enabled).then(refresh).catch(console.error)
                  }
                  onRun={() => runNow(job.id)}
                  onEdit={() => loadForEdit(job)}
                  onDelete={() => api.deleteJob(job.id).then(refresh).catch(console.error)}
                />
              ))}
            </div>

            {history.length > 0 && (
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <History className="h-3.5 w-3.5" strokeWidth={1} />
                  Recent sessions
                </div>
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
              </div>
            )}
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

export function JobRunBadges({ job }: { job: Job }) {
  const rc = parseJson<{ cli?: string; provider?: string }>(job.run_config, {});
  const detail = job.run_mode === "chat" ? rc.provider ?? "anthropic" : rc.cli ?? "cli";
  return (
    <span className="text-[11px] text-muted-foreground">
      {job.run_mode === "chat" ? "Chat" : "CLI"} • {detail} · {job.trigger_type}
    </span>
  );
}

function JobRow({
  job,
  running,
  onToggle,
  onRun,
  onEdit,
  onDelete,
}: {
  job: Job;
  running: boolean;
  onToggle: () => void;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2">
      <button
        className={cn(
          "h-4 w-7 shrink-0 rounded-full transition-colors",
          job.enabled ? "bg-primary" : "bg-muted",
        )}
        title={job.enabled ? "Disable" : "Enable"}
        onClick={onToggle}
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
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onEdit}
        title="Edit"
      >
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        disabled={running}
        onClick={onRun}
        title="Run now"
      >
        <Play className={cn("h-3.5 w-3.5", running && "animate-pulse")} strokeWidth={1} />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0"
        onClick={onDelete}
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
      </Button>
    </div>
  );
}

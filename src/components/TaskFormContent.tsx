/**
 * TaskFormContent — unified task creation / editing form.
 *
 * Used by:
 *   - TasksView  (Add task dialog + pencil-edit dialog)
 *   - JobsDialog (project-page scheduled jobs dialog)
 *
 * Props
 * ─────
 *   workspaces       – all workspaces the user can see
 *   organizations    – all orgs (for the org/project picker)
 *   defaultOrgId     – which org is pre-selected on mount
 *   defaultWsId      – if set, locks workspace (used when editing)
 *   initialJob       – pre-fills every field for edit mode
 *   onSaved          – called after a successful add or update
 *   onCancel         – called when the user hits "Cancel"
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterSlashItems,
  groupSlashItems,
  loadSlashItems,
  type SlashItem,
} from "@/lib/slash-items";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Maximize2,
  Minimize2,
  Plus,
  X,
} from "lucide-react";
import {
  api,
  CHAT_PROVIDERS,
  CLI_PRESETS,
  type Agent,
  type ContextFile,
  type Job,
  type Organization,
  type Skill,
  type Workspace,
  type WorkspaceConnector,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { PresetIcon } from "@/components/PresetIcon";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type Freq = "hourly" | "daily" | "weekdays" | "weekly" | "custom" | "manual";

const FREQUENCIES: { id: Freq; label: string }[] = [
  { id: "hourly",   label: "Hourly" },
  { id: "daily",    label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly",   label: "Weekly" },
  { id: "custom",   label: "Custom cron" },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");

function buildCron(freq: Freq, time: string, weekday: number, custom: string): string {
  if (freq === "manual") return "manual";
  const [h, m] = time.split(":").map((x) => parseInt(x, 10) || 0);
  switch (freq) {
    case "hourly":   return "0 * * * *";
    case "daily":    return `${m} ${h} * * *`;
    case "weekdays": return `${m} ${h} * * 1-5`;
    case "weekly":   return `${m} ${h} * * ${weekday}`;
    default:         return custom.trim();
  }
}

function parseCron(cron: string): { freq: Freq; time: string; weekday: number } {
  if (!cron || cron === "manual") return { freq: "manual", time: "09:00", weekday: 1 };
  const fallback = { freq: "custom" as Freq, time: "09:00", weekday: 1 };
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return fallback;
  const [m, h, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*") return fallback;
  const numeric = (s: string) => /^\d+$/.test(s);
  if (m === "0" && h === "*" && dow === "*") return { freq: "hourly", time: "09:00", weekday: 1 };
  if (numeric(m) && numeric(h)) {
    const time = `${pad(parseInt(h, 10))}:${pad(parseInt(m, 10))}`;
    if (dow === "*")   return { freq: "daily",    time, weekday: 1 };
    if (dow === "1-5") return { freq: "weekdays", time, weekday: 1 };
    if (/^[0-6]$/.test(dow)) return { freq: "weekly", time, weekday: parseInt(dow, 10) };
  }
  return fallback;
}

function scheduleSummary(freq: Freq, time: string, weekday: number, cron: string): string {
  const wd = WEEKDAYS.find((w) => w.v === weekday)?.label ?? "Monday";
  switch (freq) {
    case "manual":   return "Run manually (play button)";
    case "hourly":   return "Every hour";
    case "daily":    return `Every day at ${time}`;
    case "weekdays": return `Weekdays (Mon–Fri) at ${time}`;
    case "weekly":   return `Every ${wd} at ${time}`;
    default:         return `cron: ${cron || "—"}`;
  }
}

function parseJson<T>(s: string | undefined | null, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// ─── Segment pill ─────────────────────────────────────────────────────────────

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
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

// ─── OR Model Picker ──────────────────────────────────────────────────────────

type ORModel = { id: string; name: string; created: number };

const ALLOWED_V = ["anthropic", "openai", "openrouter", "google"];
const FLAGSHIP_IDS = ["claude-opus-4","claude-sonnet-4","gpt-5","openai/o3","gemini-2.5-pro","gemini-2.5-flash"];
const V_LABEL: Record<string, string> = { anthropic: "Anthropic", openai: "OpenAI", openrouter: "OpenRouter", google: "Gemini" };

function shortModelName(n: string) {
  return n.includes(": ") ? n.split(": ").slice(1).join(": ") : n;
}

function ModelPicker({
  model, setModel, setProvider,
}: {
  model: string;
  setModel: (m: string) => void;
  setProvider: (p: string) => void;
}) {
  const [orModels, setOrModels] = useState<ORModel[]>([]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [vendor, setVendor] = useState("");
  const [custom, setCustom] = useState(false);

  useEffect(() => {
    api.listOpenrouterModels().then(setOrModels).catch(() => {});
  }, []);

  const vendorGroups = useMemo(() => {
    const cutoff = Date.now() / 1000 - 365 * 86400;
    const byV = new Map<string, ORModel[]>();
    for (const m of orModels) {
      const v = m.id.includes("/") ? m.id.split("/")[0] : "other";
      if (m.created && m.created < cutoff) continue;
      if (!byV.has(v)) byV.set(v, []);
      byV.get(v)!.push(m);
    }
    const flagship = orModels
      .filter((m) => FLAGSHIP_IDS.some((p) => m.id.toLowerCase().includes(p)))
      .sort((a, b) => b.created - a.created);
    const out: [string, ORModel[]][] = [];
    for (const v of ALLOWED_V) {
      if (v === "openrouter") { if (flagship.length) out.push(["openrouter", flagship]); }
      else if (byV.has(v)) out.push([v, byV.get(v)!.sort((a, b) => b.created - a.created)]);
    }
    return out;
  }, [orModels]);

  const activeVendor = vendor || (vendorGroups[0]?.[0] ?? "");
  const baseList = vendorGroups.find(([v]) => v === activeVendor)?.[1] ?? vendorGroups[0]?.[1] ?? [];
  const mq = query.toLowerCase();
  const list = mq ? baseList.filter((m) => m.id.toLowerCase().includes(mq) || m.name.toLowerCase().includes(mq)) : baseList;
  const orModel = orModels.find((m) => m.id === model);
  const label = orModel ? shortModelName(orModel.name) : model || "select model";

  const pick = (id: string) => {
    const v = id.includes("/") ? id.split("/")[0] : "other";
    const pm: Record<string, string> = { anthropic: "anthropic", openai: "openai", google: "gemini" };
    setProvider(activeVendor === "openrouter" ? "openrouter" : (pm[v] ?? "openrouter"));
    setModel(id);
    setOpen(false);
    setCustom(false);
  };

  if (custom) {
    return (
      <input
        autoFocus
        value={model}
        onChange={(e) => setModel(e.target.value)}
        onBlur={() => setCustom(false)}
        onKeyDown={(e) => e.key === "Enter" && setCustom(false)}
        placeholder="model id (e.g. anthropic/claude-opus-4)"
        className="h-8 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs"
      />
    );
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) { setQuery(""); setVendor(vendorGroups[0]?.[0] ?? ""); }
      }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 flex-1 justify-start gap-1.5 font-normal">
          <ProviderIcon model={model} className="h-3.5 w-3.5 shrink-0 opacity-60" />
          <span className="truncate text-xs">{label}</span>
          <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-50" strokeWidth={1} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[32rem] p-0">
        <div className="border-b p-1.5">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder={orModels.length ? `Search ${V_LABEL[activeVendor] ?? activeVendor} models…` : "Loading models…"}
            className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none"
          />
        </div>
        {orModels.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">Loading models…</div>
        ) : (
          <div className="flex h-64">
            {/* Vendor sidebar */}
            <div className="w-36 shrink-0 overflow-y-auto border-r p-1">
              {vendorGroups.map(([v, vlist]) => (
                <button
                  key={v}
                  onMouseEnter={() => setVendor(v)}
                  onClick={() => setVendor(v)}
                  className={cn(
                    "flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs",
                    v === activeVendor ? "bg-accent" : "hover:bg-accent/50",
                  )}
                >
                  <ProviderIcon model={`${v}/x`} className="h-4 w-4 opacity-80" />
                  <span className="truncate">{V_LABEL[v] ?? v}</span>
                  <span className="ml-auto text-[10px] text-muted-foreground">{vlist.length}</span>
                </button>
              ))}
            </div>
            {/* Model list */}
            <div className="flex-1 overflow-y-auto p-1">
              {list.length === 0
                ? <div className="p-2 text-xs text-muted-foreground">No matches</div>
                : list.map((m) => (
                  <DropdownMenuItem
                    key={m.id}
                    onClick={() => pick(m.id)}
                    className={cn("flex flex-col items-start gap-0.5", m.id === model && "bg-accent")}
                  >
                    <span className="flex w-full items-center gap-1.5">
                      <ProviderIcon model={m.id} className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="truncate text-xs">{shortModelName(m.name)}</span>
                      {m.id === model && <Check className="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" />}
                    </span>
                  </DropdownMenuItem>
                ))}
            </div>
          </div>
        )}
        <div className="border-t p-1">
          <DropdownMenuItem onClick={() => { setCustom(true); setModel(""); }}>
            Custom model id…
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ─── TaskFormContent ──────────────────────────────────────────────────────────

export interface TaskFormContentProps {
  workspaces: Workspace[];
  organizations: Organization[];
  defaultOrgId?: number;
  /** When set the workspace picker is hidden and the form always saves to this ws */
  defaultWsId?: number;
  /** Pre-populate all fields for edit mode */
  initialJob?: Job | null;
  onSaved: () => void;
  onCancel: () => void;
}

export function TaskFormContent({
  workspaces,
  organizations,
  defaultOrgId,
  defaultWsId,
  initialJob,
  onSaved,
  onCancel,
}: TaskFormContentProps) {
  // ── Workspace / org picker (only shown when defaultWsId is NOT set) ──────────
  const firstOrgId = defaultOrgId ?? organizations[0]?.id ?? 0;
  const [selectedOrgId, setSelectedOrgId] = useState<number>(firstOrgId);
  const orgWorkspaces = useMemo(
    () => workspaces.filter((w) => w.organization_id === selectedOrgId),
    [workspaces, selectedOrgId],
  );
  const [selectedWsId, setSelectedWsId] = useState<number | null>(null);
  const selectedWs = useMemo(
    () =>
      defaultWsId
        ? workspaces.find((w) => w.id === defaultWsId) ?? null
        : workspaces.find((w) => w.id === selectedWsId) ?? orgWorkspaces[0] ?? null,
    [workspaces, defaultWsId, selectedWsId, orgWorkspaces],
  );

  // ── Lazy-loaded workspace data ───────────────────────────────────────────────
  const [agents, setAgents]             = useState<Agent[]>([]);
  const [connectors, setConnectors]     = useState<WorkspaceConnector[]>([]);
  const [skills, setSkills]             = useState<Skill[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [settings, setSettings]         = useState<Record<string, string>>({});

  useEffect(() => {
    if (!selectedWs) return;
    // Reset slash cache when workspace changes so items reload for the new ws.
    slashLoadedRef.current = false;
    setSlashItems([]);
    // Load agents from ALL workspaces in the org so agent picker is always full
    Promise.all(orgWorkspaces.map((w) => api.listAgents(w.id).catch(() => [] as Agent[])))
      .then((lists) => setAgents(lists.flat()))
      .catch(() => {});
    api.listWorkspaceConnectors(selectedWs.id).then(setConnectors).catch(() => {});
    api.listSkills(selectedWs.id).then(setSkills).catch(() => {});
    api.listContextFiles(selectedWs.id).then(setContextFiles).catch(() => {});
    api.getSettings().then(setSettings).catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWs, orgWorkspaces]);

  // ── Core form state ──────────────────────────────────────────────────────────
  const [name, setName]       = useState("");
  const [command, setCommand] = useState("");

  // Run via
  const [runMode, setRunMode]   = useState<"cli" | "chat" | "agent">("cli");
  const [cli, setCli]           = useState("claude");
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel]       = useState("");
  // Agent sub-options
  const [agentName, setAgentName] = useState("");
  const [agentMode, setAgentMode] = useState<"cli" | "chat">("cli");
  const [agentCli, setAgentCli]   = useState("claude");

  // Schedule / trigger
  const [triggerType, setTriggerType] = useState<"cron" | "manual" | "api" | "github">("cron");
  const [freq, setFreq]               = useState<Freq>("weekly");
  const [timeOfDay, setTimeOfDay]     = useState("09:00");
  const [weekday, setWeekday]         = useState(1);
  const [customCron, setCustomCron]   = useState("0 9 * * 1");
  const [ghRepo, setGhRepo]           = useState("");
  const [ghEvent, setGhEvent]         = useState("push");
  const [ghBranch, setGhBranch]       = useState("main");

  // UI state
  const [promptExpanded, setPromptExpanded] = useState(false);
  const [connectorsOpen, setConnectorsOpen] = useState(false);
  const [checked, setChecked]               = useState<Record<string, boolean>>({});
  const [error, setError]                   = useState<string | null>(null);
  const [saving, setSaving]                 = useState(false);

  // Slash autocomplete
  const [slashItems, setSlashItems]   = useState<SlashItem[]>([]);
  const [slashOpen, setSlashOpen]     = useState(false);
  const [slashSelected, setSlashSelected] = useState(0);
  const [slashToken, setSlashToken]   = useState("");
  const slashLoadedRef                = useRef(false);
  const promptRef                     = useRef<HTMLTextAreaElement>(null);

  const ensureSlashItems = () => {
    if (slashLoadedRef.current || !selectedWs) return;
    slashLoadedRef.current = true;
    loadSlashItems(selectedWs.id)
      .then(setSlashItems)
      .catch(() => setSlashItems([]));
  };

  const schedule = useMemo(
    () => (triggerType === "manual" ? "manual" : buildCron(freq, timeOfDay, weekday, customCron)),
    [triggerType, freq, timeOfDay, weekday, customCron],
  );

  const allowedConnectors = useMemo(() => {
    const ids = Array.from(new Set(connectors.map((c) => c.service)));
    const on = ids.filter((id) => checked[id] !== false);
    return on.length === ids.length ? [] : on;
  }, [connectors, checked]);

  // ── Pre-populate for edit mode ───────────────────────────────────────────────
  useEffect(() => {
    if (!initialJob) return;
    const rc = parseJson<{ cli?: string; provider?: string; model?: string; agent?: string; mode?: "cli" | "chat" }>(
      initialJob.run_config, {},
    );
    const tc = parseJson<{ cron?: string; repo?: string; event?: string; branch?: string }>(
      initialJob.trigger_config, {},
    );
    const allow = parseJson<string[]>(initialJob.allowed_connectors, []);
    const cron = tc.cron ?? initialJob.schedule;
    const parsed = parseCron(cron);

    setName(initialJob.name);
    setCommand(initialJob.command);
    setRunMode(initialJob.run_mode as "cli" | "chat" | "agent");
    setCli(rc.cli ?? "claude");
    setProvider(rc.provider ?? "anthropic");
    setModel(rc.model ?? "");
    setAgentName(rc.agent ?? "");
    setAgentMode(rc.mode ?? "cli");
    setAgentCli(rc.cli ?? "claude");
    setTriggerType(
      (initialJob.trigger_type as string) === "manual" ? "manual" :
      (initialJob.trigger_type as string) === "github" ? "github" :
      (initialJob.trigger_type as string) === "api"    ? "api"    : "cron"
    );
    setFreq(parsed.freq);
    setTimeOfDay(parsed.time);
    setWeekday(parsed.weekday);
    setCustomCron(cron);
    setGhRepo(tc.repo ?? "");
    setGhEvent(tc.event ?? "push");
    setGhBranch(tc.branch ?? "main");

    if (allow.length > 0) {
      api.listWorkspaceConnectors(initialJob.workspace_id).then((cons) => {
        const map: Record<string, boolean> = {};
        for (const c of cons) map[c.service] = allow.includes(c.service);
        setChecked(map);
        setConnectorsOpen(true);
      }).catch(() => {});
    } else {
      setChecked({});
    }
  }, [initialJob]);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const submit = async () => {
    if (!name.trim()) { setError("Name is required."); return; }
    if (runMode === "agent" && !agentName) { setError("Pick an agent."); return; }
    if (runMode !== "agent" && !command.trim()) { setError("A command / prompt is required."); return; }
    if (!selectedWs && !defaultWsId) { setError("Pick a project first."); return; }

    const wsId = selectedWs!.id;

    const runConfig =
      runMode === "agent"
        ? { agent: agentName, mode: agentMode, ...(agentMode === "cli" ? { cli: agentCli } : { provider }), model: model || undefined }
        : runMode === "cli"
          ? { cli, model: model || undefined }
          : { provider, model: model || undefined };

    const triggerConfig =
      triggerType === "cron"   ? { cron: schedule.trim() } :
      triggerType === "github" ? { repo: ghRepo.trim(), event: ghEvent, branch: ghBranch.trim() } :
      {};

    const finalSchedule = triggerType === "manual" ? "manual" : schedule.trim();

    setError(null);
    setSaving(true);
    try {
      if (initialJob) {
        await api.updateJob(
          initialJob.id,
          name.trim(),
          command.trim(),
          finalSchedule,
          runMode,
          JSON.stringify(runConfig),
          triggerType,
          JSON.stringify(triggerConfig),
          JSON.stringify(allowedConnectors),
        );
      } else {
        await api.addJob(wsId, name.trim(), command.trim(), finalSchedule, {
          runMode,
          runConfig: JSON.stringify(runConfig),
          triggerType,
          triggerConfig: JSON.stringify(triggerConfig),
          allowedConnectors: JSON.stringify(allowedConnectors),
        });
      }
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const insert = (snippet: string) =>
    setCommand((c) => (c.trim() ? `${c.replace(/\s+$/, "")} ${snippet} ` : `${snippet} `));

  const httpPort = settings.http_port || "8765";
  const apiToken = settings.api_token || "<token>";
  const triggerCurl = `curl -X POST http://127.0.0.1:${httpPort}/trigger \\\n  -H "x-superconsole-token: ${apiToken}" \\\n  -d '{"workspace":"<name>","command":"${command || "<cmd>"}"}'`;

  const wsName = (id: number) => workspaces.find((w) => w.id === id)?.name ?? "—";
  const orgName = (id: number) => organizations.find((o) => o.id === id)?.name ?? "—";

  const groups: { scope: "project" | "org" | "account"; label: string }[] = [
    { scope: "project", label: "Project" },
    { scope: "org",     label: "Org" },
    { scope: "account", label: "Account" },
  ];

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* Org + Project picker (hidden in edit mode or when workspace is locked) */}
      {!defaultWsId && (
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">In</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                {orgName(selectedOrgId)}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {organizations.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => { setSelectedOrgId(o.id); setSelectedWsId(null); }}>
                  {o.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <span className="text-xs text-muted-foreground">/</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal">
                {selectedWs?.name ?? "Pick project"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {orgWorkspaces.length === 0 ? (
                <DropdownMenuItem disabled>No projects in this org</DropdownMenuItem>
              ) : (
                orgWorkspaces.map((w) => (
                  <DropdownMenuItem key={w.id} onClick={() => setSelectedWsId(w.id)}>
                    {w.name}
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {selectedWs && (
            <Badge variant="secondary" className="font-normal">{wsName(selectedWs.id)}</Badge>
          )}
        </div>
      )}

      {/* Name */}
      <Input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Task name (e.g. Daily CEO brief)"
        className="h-8 text-sm"
        autoFocus
      />

      {/* Run via */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Run via</div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-lg border bg-background p-0.5">
            <Seg active={runMode === "cli"}   onClick={() => setRunMode("cli")}>CLI</Seg>
            <Seg active={runMode === "chat"}  onClick={() => setRunMode("chat")}>Chat</Seg>
            <Seg active={runMode === "agent"} onClick={() => setRunMode("agent")}>Agent</Seg>
          </div>

          {runMode === "cli" && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal">
                    <PresetIcon preset={cli} className="h-3.5 w-3.5" />
                    {CLI_PRESETS.find((c) => c.id === cli)?.label ?? cli}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {CLI_PRESETS.map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => setCli(c.id)}>
                      <PresetIcon preset={c.id} className="h-3.5 w-3.5" />
                      {c.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <ModelPicker model={model} setModel={setModel} setProvider={setProvider} />
            </>
          )}

          {runMode === "chat" && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal">
                    <ProviderIcon provider={provider} className="h-3.5 w-3.5" />
                    {CHAT_PROVIDERS.find((p) => p.id === provider)?.label ?? provider}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {CHAT_PROVIDERS.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => setProvider(p.id)}>
                      <ProviderIcon provider={p.id} className="h-3.5 w-3.5" />
                      {p.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <ModelPicker model={model} setModel={setModel} setProvider={setProvider} />
            </>
          )}

          {runMode === "agent" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 flex-1 justify-start font-normal">
                  {agentName || (agents.length ? "Select agent…" : "No agents")}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                {agents.length === 0 ? (
                  <DropdownMenuItem disabled>No agents found</DropdownMenuItem>
                ) : (
                  agents.map((a) => (
                    <DropdownMenuItem key={a.name} onClick={() => setAgentName(a.name)}>
                      {a.name}
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* Agent sub-options: CLI/Chat harness + model */}
        {runMode === "agent" && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
            <span className="text-[11px] text-muted-foreground">Run harness:</span>
            <div className="flex gap-1 rounded-lg border bg-background p-0.5">
              <Seg active={agentMode === "cli"}  onClick={() => setAgentMode("cli")}>CLI</Seg>
              <Seg active={agentMode === "chat"} onClick={() => setAgentMode("chat")}>Chat</Seg>
            </div>
            {agentMode === "cli" ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal">
                    <PresetIcon preset={agentCli} className="h-3.5 w-3.5" />
                    {CLI_PRESETS.find((c) => c.id === agentCli)?.label ?? agentCli}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {CLI_PRESETS.map((c) => (
                    <DropdownMenuItem key={c.id} onClick={() => setAgentCli(c.id)}>
                      <PresetIcon preset={c.id} className="h-3.5 w-3.5" />
                      {c.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal">
                    <ProviderIcon provider={provider} className="h-3.5 w-3.5" />
                    {CHAT_PROVIDERS.find((p) => p.id === provider)?.label ?? provider}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {CHAT_PROVIDERS.map((p) => (
                    <DropdownMenuItem key={p.id} onClick={() => setProvider(p.id)}>
                      <ProviderIcon provider={p.id} className="h-3.5 w-3.5" />
                      {p.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
            <ModelPicker model={model} setModel={setModel} setProvider={setProvider} />
          </div>
        )}
      </div>

      {/* Trigger */}
      <div className="space-y-2">
        <div className="text-xs font-medium text-muted-foreground">Trigger</div>
        <div className="flex gap-1 rounded-lg border bg-background p-0.5 w-fit">
          <Seg active={triggerType === "cron"}   onClick={() => setTriggerType("cron")}>Schedule</Seg>
          <Seg active={triggerType === "manual"} onClick={() => setTriggerType("manual")}>Manual</Seg>
          <Seg active={triggerType === "api"}    onClick={() => setTriggerType("api")}>API</Seg>
          <Seg active={triggerType === "github"} onClick={() => setTriggerType("github")}>GitHub</Seg>
        </div>

        {triggerType === "manual" && (
          <p className="text-[11px] text-muted-foreground">
            Runs only when you click the play button — no automatic schedule.
          </p>
        )}

        {triggerType === "cron" && (
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-0.5">
                {FREQUENCIES.filter((f) => f.id !== "manual").map((fr) => (
                  <Seg key={fr.id} active={freq === fr.id} onClick={() => setFreq(fr.id)}>
                    {fr.label}
                  </Seg>
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
                      <DropdownMenuItem key={w.v} onClick={() => setWeekday(w.v)}>{w.label}</DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>
            {freq === "custom" ? (
              <Input
                value={customCron}
                onChange={(e) => setCustomCron(e.target.value)}
                placeholder="min hour dom month dow  (e.g. 0 6 * * 1)"
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
            <p className="text-xs text-muted-foreground">Trigger via HTTP POST:</p>
            <div className="flex items-start gap-2">
              <pre className="flex-1 overflow-x-auto rounded bg-muted px-2 py-1.5 font-mono text-[11px] leading-relaxed">
                {triggerCurl}
              </pre>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" title="Copy"
                onClick={() => navigator.clipboard.writeText(triggerCurl)}>
                <Copy className="h-3.5 w-3.5" strokeWidth={1} />
              </Button>
            </div>
          </div>
        )}

        {triggerType === "github" && (
          <div className="space-y-2 rounded-md border bg-background p-2.5">
            <div className="grid grid-cols-2 gap-2">
              <Input value={ghRepo}   onChange={(e) => setGhRepo(e.target.value)}   placeholder="owner/repo" className="h-8 font-mono text-sm" />
              <Input value={ghBranch} onChange={(e) => setGhBranch(e.target.value)} placeholder="main"       className="h-8 font-mono text-sm" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 font-normal">{ghEvent}</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  {GH_EVENTS.map((ev) => (
                    <DropdownMenuItem key={ev} onClick={() => setGhEvent(ev)}>{ev}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-600 dark:text-amber-400">
              Webhook not yet active — config saved for future use
            </Badge>
          </div>
        )}
      </div>

      {/* Connector restrictions */}
      <div className="space-y-1.5">
        <button
          type="button"
          className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          onClick={() => setConnectorsOpen((v) => !v)}
        >
          {connectorsOpen
            ? <ChevronDown className="h-3.5 w-3.5" strokeWidth={1} />
            : <ChevronRight className="h-3.5 w-3.5" strokeWidth={1} />}
          Restrict connectors
        </button>
        {connectorsOpen && (
          <div className="space-y-2 rounded-md border bg-background p-2.5">
            {connectors.length === 0 ? (
              <p className="text-xs text-muted-foreground">No connectors in this project.</p>
            ) : (
              <>
                {groups.map((g) => {
                  const rows = connectors.filter((c) => c.scope === g.scope);
                  if (rows.length === 0) return null;
                  return (
                    <div key={g.scope} className="space-y-1">
                      <div className="text-[10px] font-semibold uppercase text-muted-foreground">{g.label}</div>
                      {rows.map((c) => {
                        const on = checked[c.service] !== false;
                        return (
                          <button
                            key={`${g.scope}:${c.service}`}
                            type="button"
                            className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-sm hover:bg-muted"
                            onClick={() => setChecked((m) => ({ ...m, [c.service]: !on }))}
                          >
                            <span className={cn(
                              "flex h-4 w-4 items-center justify-center rounded border",
                              on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                            )}>
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
                  Leave all checked to allow access to all services.
                </p>
              </>
            )}
          </div>
        )}
      </div>

      {/* Prompt / command (not shown for agent mode) */}
      {runMode !== "agent" && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <div className="text-xs font-medium text-muted-foreground">Prompt</div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-5 w-5" title="Insert skill / connector / context">
                    <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Skills</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                      {skills.length === 0
                        ? <DropdownMenuItem disabled>No skills</DropdownMenuItem>
                        : skills.map((s) => (
                          <DropdownMenuItem key={s.name} onClick={() => insert(`/skill:${s.name}`)}>
                            {s.name}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Connectors</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                      {connectors.length === 0
                        ? <DropdownMenuItem disabled>No connectors</DropdownMenuItem>
                        : connectors.map((c) => (
                          <DropdownMenuItem key={`${c.scope}-${c.service}`} onClick={() => insert(`/connector:${c.service}`)}>
                            {c.label}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Agents</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                      {agents.length === 0
                        ? <DropdownMenuItem disabled>No agents</DropdownMenuItem>
                        : agents.map((a) => (
                          <DropdownMenuItem key={a.name} onClick={() => insert(`/agent:${a.name}`)}>
                            {a.name}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Context</DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                      {contextFiles.length === 0
                        ? <DropdownMenuItem disabled>No context files</DropdownMenuItem>
                        : contextFiles.map((c) => (
                          <DropdownMenuItem key={c.slug} onClick={() => insert(`/context:${c.slug}`)}>
                            {c.slug}
                          </DropdownMenuItem>
                        ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <button
              type="button"
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={() => setPromptExpanded((v) => !v)}
            >
              {promptExpanded
                ? <Minimize2 className="h-3 w-3" strokeWidth={1} />
                : <Maximize2 className="h-3 w-3" strokeWidth={1} />}
              {promptExpanded ? "Collapse" : "Expand"}
            </button>
          </div>
          {/* Slash autocomplete dropdown — floats above the textarea */}
          {slashOpen && (() => {
            const filtered = filterSlashItems(slashItems, slashToken).slice(0, 32);
            const grouped = groupSlashItems(filtered);
            if (filtered.length === 0) return null;

            const applyToken = (item: SlashItem) => {
              const pos = promptRef.current?.selectionStart ?? command.length;
              const before = command.slice(0, pos);
              const tokenStart = before.lastIndexOf(slashToken);
              const after = command.slice(pos);
              const next =
                tokenStart >= 0
                  ? command.slice(0, tokenStart) + item.value + " " + after.trimStart()
                  : command + item.value + " ";
              setCommand(next);
              setSlashOpen(false);
              setSlashToken("");
              setSlashSelected(0);
              setTimeout(() => promptRef.current?.focus(), 0);
            };

            return (
              <div className="relative">
                <div className="absolute bottom-0 left-0 right-0 z-50 max-h-60 overflow-y-auto rounded-md border bg-popover shadow-lg">
                  {grouped.map(([group, items]) => {
                    const groupStartIdx = filtered.indexOf(items[0]);
                    return (
                      <div key={group}>
                        <div className="border-b border-border/50 bg-muted/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {group}
                        </div>
                        {items.map((item, li) => {
                          const gi = groupStartIdx + li;
                          return (
                            <button
                              key={item.value}
                              className={cn(
                                "flex w-full items-baseline gap-2 px-3 py-1.5 text-left",
                                gi === slashSelected
                                  ? "bg-accent text-accent-foreground"
                                  : "text-popover-foreground hover:bg-accent/50",
                              )}
                              onMouseEnter={() => setSlashSelected(gi)}
                              onMouseDown={(e) => { e.preventDefault(); applyToken(item); }}
                            >
                              <span className="shrink-0 font-mono text-sm">{item.label}</span>
                              {item.description && (
                                <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                                  {item.description}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          <textarea
            ref={promptRef}
            value={command}
            onChange={(e) => {
              const next = e.target.value;
              setCommand(next);
              const pos = e.target.selectionStart ?? next.length;
              const before = next.slice(0, pos);
              const match = before.match(/(?:^|\s)(\/.*)$/);
              if (match) {
                setSlashToken(match[1]);
                setSlashOpen(true);
                setSlashSelected(0);
                ensureSlashItems();
              } else {
                setSlashOpen(false);
                setSlashToken("");
              }
            }}
            onKeyDown={(e) => {
              if (slashOpen) {
                const filtered = filterSlashItems(slashItems, slashToken).slice(0, 32);
                if (filtered.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSlashSelected((s) => (s + 1) % filtered.length);
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSlashSelected((s) => (s - 1 + filtered.length) % filtered.length);
                    return;
                  }
                  if (e.key === "Tab" || e.key === "Enter") {
                    e.preventDefault();
                    const item = filtered[slashSelected];
                    const pos = promptRef.current?.selectionStart ?? command.length;
                    const before = command.slice(0, pos);
                    const tokenStart = before.lastIndexOf(slashToken);
                    const after = command.slice(pos);
                    const next =
                      tokenStart >= 0
                        ? command.slice(0, tokenStart) + item.value + " " + after.trimStart()
                        : command + item.value + " ";
                    setCommand(next);
                    setSlashOpen(false);
                    setSlashToken("");
                    setSlashSelected(0);
                    return;
                  }
                  if (e.key === "Escape") {
                    e.preventDefault();
                    setSlashOpen(false);
                    setSlashToken("");
                    return;
                  }
                }
              }
            }}
            placeholder="Prompt or shell command… (type / for skills, context, wiki, agents)"
            spellCheck={false}
            className={cn(
              "w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 font-mono text-sm shadow-xs outline-none transition-[color,box-shadow] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
              promptExpanded ? "min-h-64" : "min-h-20",
            )}
          />
        </div>
      )}

      {/* Error */}
      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-8" onClick={onCancel}>
          <X className="h-3.5 w-3.5" strokeWidth={1} />
          Cancel
        </Button>
        <Button size="sm" className="h-8" onClick={submit} disabled={saving}>
          <Plus className="h-3.5 w-3.5" strokeWidth={1} />
          {saving ? "Saving…" : initialJob ? "Save task" : "Add task"}
        </Button>
      </div>
    </div>
  );
}

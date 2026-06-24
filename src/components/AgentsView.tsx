import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  ChevronDown,
  FolderPlus,
  GitBranch,
  History,
  Info,
  ListTodo,
  Loader2,
  MessageSquare,
  Pencil,
  Play,
  Plug,
  Plus,
  ScrollText,
  Search,
  SquareSlash,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  api,
  CHAT_PROVIDERS,
  CLI_PRESETS,
  CONNECTOR_REGISTRY,
  type Agent,
  type AgentRow,
  type CatalogAgent,
  type CatalogAgentInput,
  type OpenrouterModel,
  type Organization,
  type SessionFeedItem,
  type Skill,
  type Workspace,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { connectorDomain, connectorLogo, faviconFallback } from "@/lib/logos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PresetIcon } from "@/components/PresetIcon";
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";

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

// ─── Top-level tab toggle (same as TasksView) ────────────────────────────────

type AgentTab = "agents" | "activity" | "library";

function TabBtn({
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
      <span className="flex items-center gap-1.5">{children}</span>
    </button>
  );
}

// ─── Activity row (exact same design as TasksView.ActivityRow) ────────────────

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

// ─── Agent row (session-page style) ──────────────────────────────────────────

// ─── Segment control (same as JobsDialog) ─────────────────────────────────────────

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

// ─── Human-readable schedule ────────────────────────────────────────────────
const WEEKDAY_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
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
  return `${WEEKDAY_SHORT[d] ?? dow}s${time}`;
}

// ─── Agent list row ────────────────────────────────────────────────────────

function AgentListRow({
  row,
  projectName,
  onRun,
  onEdit,
  onToggle,
  onDelete,
  running,
}: {
  row: AgentRow;
  projectName: string;
  onRun: () => void;
  onEdit: () => void;
  onToggle: () => void;
  onDelete: () => void;
  running: boolean;
}) {
  const skills = row.skills ? row.skills.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const connectors = row.connectors ? row.connectors.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const isChat = row.defaultRunMode === "chat";

  return (
    <div className="group flex items-center gap-1 rounded-md pr-1 transition-colors hover:bg-accent/50">
      {/* ── LEFT: toggle + mode icon + provider icon + name + project ── */}
      <div className="ml-2 flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          className={cn(
            "h-4 w-7 shrink-0 rounded-full transition-colors",
            row.isActive ? "bg-primary" : "bg-muted",
          )}
          title={row.isActive ? "Pause agent" : "Activate agent"}
          onClick={onToggle}
        >
          <span
            className={cn(
              "block h-3 w-3 rounded-full bg-background transition-transform",
              row.isActive ? "translate-x-3.5" : "translate-x-0.5",
            )}
          />
        </button>
        {isChat ? (
          <MessageSquare className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        ) : (
          <SquareSlash className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
        )}
      </div>

      {/* Name + project chip take available space */}
      <div className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2.5">
        {isChat ? (
          <ProviderIcon provider={row.defaultProvider} className="h-4 w-4 shrink-0" />
        ) : row.defaultCli ? (
          <PresetIcon preset={row.defaultCli} className="h-4 w-4 shrink-0" />
        ) : (
          <Bot className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1} />
        )}
        <span className="min-w-0 truncate text-sm font-medium">{row.name}</span>
        {projectName && (
          <span className="shrink-0 rounded bg-muted/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {projectName}
          </span>
        )}

        {/* ── RIGHT chips (ml-auto pushes to right edge) ── */}
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {row.defaultModel && (
            <span className="hidden items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground sm:inline-flex">
              <ProviderIcon model={row.defaultModel} className="h-2.5 w-2.5 opacity-50" />
              <span className="font-mono">{row.defaultModel.split("/").pop()}</span>
            </span>
          )}
          {skills.length > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <ScrollText className="h-3 w-3 opacity-70" strokeWidth={1.5} />
              {skills.length}
            </span>
          )}
          {connectors.length > 0 && (
            <span className="inline-flex items-center gap-0.5 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
              <Plug className="h-3 w-3 opacity-70" strokeWidth={1.5} />
              {connectors.length}
            </span>
          )}
          {row.schedule && (
            <Badge variant="outline" className="text-[10px]">
              {fmtCronHuman(row.schedule)}
            </Badge>
          )}
          {row.lastRun && (
            <span className="text-xs text-muted-foreground">{fmtRelative(row.lastRun)}</span>
          )}
        </div>
      </div>

      {/* Run now */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        disabled={running}
        onClick={onRun}
        title="Run now"
      >
        <Play className={cn("h-3.5 w-3.5", running && "animate-pulse")} strokeWidth={1} />
      </Button>

      {/* Edit */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onEdit}
        title="Edit"
      >
        <Pencil className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
      </Button>

      {/* Delete */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={onDelete}
        title="Delete"
      >
        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
      </Button>
    </div>
  );
}

// ─── Connector chip (library card) ───────────────────────────────────────────

function ConnectorChip({ service }: { service: string }) {
  const domain = connectorDomain(service);
  const [stage, setStage] = useState(0);
  const src =
    domain && stage === 0
      ? connectorLogo(service)
      : domain && stage === 1
        ? faviconFallback(domain)
        : null;
  return (
    <span className="flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">
      {src ? (
        <img src={src} alt="" className="h-3 w-3 rounded-sm" onError={() => setStage((s) => s + 1)} />
      ) : (
        <Plug className="h-3 w-3" strokeWidth={1} />
      )}
      {service}
    </span>
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="py-16 text-center">
      <div className="mx-auto flex h-8 w-8 items-center justify-center text-muted-foreground/40 [&_svg]:h-8 [&_svg]:w-8">
        {icon}
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{text}</p>
    </div>
  );
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface AgentsViewProps {
  workspaces: Workspace[];
  organizations: Organization[];
  activeOrgId: number;
  onUseInProject: (id: string, workspaceId: number) => void;
  onUseInNewProject: (id: string) => void;
  onCreateInProject: (agent: Agent, skills: string[], workspaceId: number) => void;
  onCreateInNewProject: (agent: Agent, skills: string[]) => void;
  onImportRepoNewProject: (repo: string, gitRef: string) => void;
  onAddSkill: () => void;
  onAddConnector: (scope: "project" | "org" | "account") => void;
  onResume?: (workspaceId: number, cli: string, sessionId: string) => void;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentsView({
  workspaces,
  organizations,
  activeOrgId,
  onUseInProject,
  onUseInNewProject,
  onCreateInProject,
  onCreateInNewProject,
  onImportRepoNewProject,
  onAddSkill,
  onAddConnector,
  onResume,
}: AgentsViewProps) {
  const [tab, setTab] = useState<AgentTab>("agents");

  // ── Org / project filters (same as TasksView) ──
  const [orgFilter, setOrgFilter] = useState<number | "all">(activeOrgId);
  const [projFilter, setProjFilter] = useState<number | "all">("all");

  const orgWorkspaces = useMemo(
    () => orgFilter === "all" ? workspaces : workspaces.filter((w) => w.organization_id === orgFilter),
    [workspaces, orgFilter],
  );

  const setOrg = (id: number | "all") => { setOrgFilter(id); setProjFilter("all"); };

  const orgName = (id: number) => organizations.find((o) => o.id === id)?.name ?? "Org";
  const wsName = (id: number) => workspaces.find((w) => w.id === id)?.name ?? "unknown";

  // Filtered workspaces for Agents/Activity (respects both filters)


  const filteredWs = useMemo(
    () => orgWorkspaces.filter((w) => projFilter === "all" || w.id === projFilter),
    [orgWorkspaces, projFilter],
  );
  // Primary workspace for single-workspace operations
  const selectedWs = filteredWs[0] ?? null;

  // ── Agents tab state ──
  const [agentRows, setAgentRows] = useState<AgentRow[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [agentsLoading, setAgentsLoading] = useState(false);
  const [editTarget, setEditTarget] = useState<AgentRow | null>(null);

  // ── Activity tab state ──
  const [activity, setActivity] = useState<SessionFeedItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  // ── Library tab state ──
  const [catalogAgents, setCatalogAgents] = useState<CatalogAgent[]>([]);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [libLoading, setLibLoading] = useState(false);
  const [libError, setLibError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [infoAgent, setInfoAgent] = useState<CatalogAgent | null>(null);
  const [adminInitial, setAdminInitial] = useState<CatalogAgentInput | null>(null);

  // loadAgents: merges DB rows + filesystem agents so agents from ANY creation
  // path (AgentsDialog, CreateAgentDialog, CLI) appear in the list.
  const loadAgents = useCallback(() => {
    const targets = filteredWs.length > 0 ? filteredWs : (selectedWs ? [selectedWs] : []);
    if (targets.length === 0) return;
    setAgentsLoading(true);
    Promise.all(
      targets.map((ws) =>
        Promise.all([
          api.listWorkspaceAgents(ws.id).catch(() => [] as AgentRow[]),
          api.listAgents(ws.id).catch(() => [] as Agent[]),
        ]).then(([rows, fsAgents]) => {
          // Merge: filesystem agents without a DB row get a synthetic entry
          const names = new Set(rows.map((r) => r.name));
          const synthetic: AgentRow[] = fsAgents
            .filter((a) => !names.has(a.name))
            .map((a) => ({
              id: "",
              workspaceId: ws.id,
              name: a.name,
              description: a.description,
              schedule: "",
              defaultRunMode: "cli",
              defaultCli: "",
              defaultProvider: "",
              defaultModel: "",
              skills: a.skills.join(","),
              connectors: a.connectors.join(","),
              isActive: true,
              agentId: null,
              lastRun: null,
              nextRun: null,
              createdAt: "",
              updatedAt: "",
            }));
          return [...rows, ...synthetic];
        }),
      ),
    )
      .then((lists) => setAgentRows(lists.flat()))
      .catch(console.error)
      .finally(() => setAgentsLoading(false));
  }, [filteredWs, selectedWs]);

  const loadActivity = useCallback(() => {
    const targets = filteredWs.length > 0 ? filteredWs : (selectedWs ? [selectedWs] : []);
    if (targets.length === 0) return;
    setActivityLoading(true);
    Promise.all(
      targets.map((ws) => api.listAgentSessions(ws.id, "").catch(() => [] as SessionFeedItem[])),
    )
      .then((lists) => {
        const flat = lists.flat();
        flat.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
        setActivity(flat);
      })
      .catch(console.error)
      .finally(() => setActivityLoading(false));
  }, [filteredWs, selectedWs]);

  const loadLibrary = () => {
    setLibLoading(true);
    setLibError(null);
    api
      .listCatalogAgents()
      .then(setCatalogAgents)
      .catch((e) => setLibError(String(e)))
      .finally(() => setLibLoading(false));
  };

  useEffect(() => {
    if (tab === "agents") loadAgents();
    else if (tab === "activity") loadActivity();
    else loadLibrary();
  }, [tab, loadAgents, loadActivity]);

  // ── Agents tab actions (use row.workspaceId so they work across multi-ws views) ──
  const runNow = async (row: AgentRow) => {
    setRunning(`${row.workspaceId}:${row.name}`);
    try {
      await api.runAgentNow(row.workspaceId, row.name);
      loadAgents();
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(null);
    }
  };

  const toggleActive = async (row: AgentRow) => {
    await api.setAgentActive(row.workspaceId, row.name, !row.isActive).catch(console.error);
    loadAgents();
  };

  const deleteAgent = async (row: AgentRow) => {
    await Promise.all([
      api.deleteAgent(row.workspaceId, row.name),
      api.deleteAgentMetadata(row.workspaceId, row.name),
    ]).catch(console.error);
    loadAgents();
  };

  // ── Library facets ──
  const facets = useMemo(() => {
    const set = new Set<string>();
    for (const a of catalogAgents) {
      if (a.category) set.add(a.category);
      a.connectors.forEach((c) => set.add(c));
    }
    return Array.from(set).sort().slice(0, 40);
  }, [catalogAgents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalogAgents.filter((a) => {
      if (activeFilter && a.category !== activeFilter && !a.connectors.includes(activeFilter)) return false;
      if (!q) return true;
      return (
        a.name.toLowerCase().includes(q) ||
        a.description.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q) ||
        a.skills.some((s) => s.toLowerCase().includes(q)) ||
        a.connectors.some((c) => c.toLowerCase().includes(q)) ||
        a.tags.some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [catalogAgents, query, activeFilter]);

  return (
    <div className="flex h-full flex-col">
      {/* ── Header bar (TasksView pattern) ─────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card/60 px-5">
        {/* Left: tab toggle */}
        <div className="flex gap-0.5 rounded-lg border bg-background p-0.5">
          <TabBtn active={tab === "agents"} onClick={() => setTab("agents")}>
            <Bot className="h-3.5 w-3.5" strokeWidth={1} />
            Agents
          </TabBtn>
          <TabBtn active={tab === "activity"} onClick={() => setTab("activity")}>
            <History className="h-3.5 w-3.5" strokeWidth={1} />
            Activity
          </TabBtn>
          <TabBtn active={tab === "library"} onClick={() => setTab("library")}>
            <ListTodo className="h-3.5 w-3.5" strokeWidth={1} />
            Library
          </TabBtn>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">

          {/* ── Org + Project filters (Agents & Activity tabs only) ── */}
          {tab !== "library" && (
            <>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 font-normal">
                    {orgFilter === "all" ? "All orgs" : orgName(orgFilter)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setOrg("all")}>All orgs</DropdownMenuItem>
                  {organizations.map((o) => (
                    <DropdownMenuItem key={o.id} onClick={() => setOrg(o.id)}>{o.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 font-normal">
                    {projFilter === "all" ? "All projects" : wsName(projFilter)}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setProjFilter("all")}>All projects</DropdownMenuItem>
                  {orgWorkspaces.map((w) => (
                    <DropdownMenuItem key={w.id} onClick={() => setProjFilter(w.id)}>{w.name}</DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}

          {/* ── Agents tab: [+ Agent] [Import] ── */}
          {tab === "agents" && (
            <>
              <Button size="sm" className="h-7" onClick={() => setCreateOpen(true)}>
                <Plus className="h-3.5 w-3.5" strokeWidth={1} />
                Agent
              </Button>
              <Button variant="outline" size="sm" className="h-7" onClick={() => setImportOpen(true)} title="Import from GitHub repo">
                <GitBranch className="h-3.5 w-3.5" strokeWidth={1} />
                Import
              </Button>
            </>
          )}

          {/* ── Library tab: Add to catalog only ── */}
          {tab === "library" && (
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => { setAdminInitial(null); setAdminOpen(true); }}
              title="Add an agent to the shared catalog"
            >
              <Wrench className="h-3.5 w-3.5" strokeWidth={1} />
              Add to catalog
            </Button>
          )}
        </div>
      </div>

      {/* ── Tab bodies ─────────────────────────────────────────────────── */}
      <ScrollArea className="min-h-0 flex-1">

        {/* ── AGENTS TAB ── */}
        {tab === "agents" && (
          <div className="flex flex-col px-5 py-3">
            {agentsLoading && agentRows.length === 0 && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading agents…
              </div>
            )}
            {!agentsLoading && agentRows.length === 0 && (
              <Empty icon={<Bot />} text="No agents yet. Create one via the project workspace." />
            )}
            {agentRows.length > 0 && (
              <div className="divide-y divide-border">
                {agentRows.map((row) => (
                  <AgentListRow
                    key={`${row.workspaceId}:${row.name}`}
                    row={row}
                    projectName={wsName(row.workspaceId)}
                    running={running === `${row.workspaceId}:${row.name}`}
                    onRun={() => runNow(row)}
                    onEdit={() => setEditTarget(row)}
                    onToggle={() => toggleActive(row)}
                    onDelete={() => deleteAgent(row)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY TAB ── */}
        {tab === "activity" && (
          <div className="flex flex-col px-5 py-3">
            {activityLoading && activity.length === 0 && (
              <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading activity…
              </div>
            )}
            {!activityLoading && activity.length === 0 && (
              <Empty icon={<History />} text="No agent-triggered sessions recorded yet." />
            )}
            {activity.length > 0 && (
              <div className="divide-y divide-border">
                {activity.map((item) => (
                  <ActivityRow
                    key={item.id}
                    item={item}
                    onResume={onResume ?? (() => {})}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LIBRARY TAB ── */}
        {tab === "library" && (
          <>
            <div className="space-y-2 border-b px-5 py-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, connector, skill, or tag"
                  className="h-8 pl-8 text-sm"
                />
              </div>
              {facets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {facets.map((f) => (
                    <button
                      key={f}
                      onClick={() => setActiveFilter((cur) => (cur === f ? null : f))}
                      className={cn(
                        "flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]",
                        activeFilter === f
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-muted-foreground/30 text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {libError && <p className="px-5 py-3 text-xs text-destructive">{libError}</p>}
            {!libError && filtered.length === 0 && (
              <p className="px-5 py-10 text-center text-sm text-muted-foreground">
                {libLoading ? "Loading…" : "No agents match."}
              </p>
            )}
            <div className="grid grid-cols-1 gap-3 p-5 md:grid-cols-2 lg:grid-cols-3">
              {filtered.map((agent) => (
                <div key={agent.id} className="flex flex-col rounded-xl border bg-card p-4 shadow-sm">
                  <div className="flex items-start gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-primary/15">
                      {agent.imageUrl ? (
                        <img src={agent.imageUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <Bot className="h-4 w-4 text-primary" strokeWidth={1} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <h2 className="truncate font-mono text-sm font-medium">{agent.name}</h2>
                        {agent.category && (
                          <span className="shrink-0 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                            {agent.category}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">{agent.description}</p>
                    </div>
                    {(agent.skills.length > 0 || agent.tags.length > 0) && (
                      <button
                        onClick={() => setInfoAgent(agent)}
                        className="shrink-0 rounded-md p-1 text-muted-foreground hover:bg-muted"
                        title="Details"
                      >
                        <Info className="h-3.5 w-3.5" strokeWidth={1} />
                      </button>
                    )}
                  </div>

                  {agent.connectors.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {agent.connectors.slice(0, 6).map((c) => (
                        <ConnectorChip key={`c-${c}`} service={c} />
                      ))}
                    </div>
                  )}

                  <div className="mt-auto pt-4">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="sm" className="h-8 w-full">
                          <FolderPlus className="h-3.5 w-3.5" strokeWidth={1} />
                          Use this agent
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuItem onClick={() => onUseInNewProject(agent.id)}>
                          Create new project…
                        </DropdownMenuItem>
                        {workspaces.length > 0 && <DropdownMenuSeparator />}
                        {workspaces.map((w) => (
                          <DropdownMenuItem key={w.id} onClick={() => onUseInProject(agent.id, w.id)}>
                            Add to {w.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </ScrollArea>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <AgentInfoDialog
        agent={infoAgent}
        onClose={() => setInfoAgent(null)}
        onDeleted={async (id) => {
          await api.deleteCatalogAgent(id).catch(() => {});
          setInfoAgent(null);
          loadLibrary();
        }}
      />
      <CreateAgentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        workspaces={workspaces}
        onCreateInProject={onCreateInProject}
        onCreateInNewProject={onCreateInNewProject}
        onAddSkill={onAddSkill}
        onAddConnector={onAddConnector}
      />
      <AdminCatalogDialog
        open={adminOpen}
        onOpenChange={setAdminOpen}
        onDone={loadLibrary}
        initial={adminInitial}
      />
      <ImportToProjectDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImport={(repo, gitRef) => {
          setImportOpen(false);
          onImportRepoNewProject(repo, gitRef);
        }}
      />

      {/* Edit agent metadata dialog — use row.workspaceId, NOT selectedWs */}
      {editTarget && (
        <EditAgentDialog
          row={editTarget}
          workspaceId={editTarget.workspaceId}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); loadAgents(); }}
        />
      )}
    </div>
  );
}

// ─── Edit agent metadata dialog ───────────────────────────────────────────────

// ─── Edit agent dialog (JobsDialog-style) ───────────────────────────────────────

type AgentFreq = "manual" | "hourly" | "daily" | "weekdays" | "weekly" | "custom";

const AGENT_FREQS: { id: AgentFreq; label: string }[] = [
  { id: "manual", label: "Manual" },
  { id: "hourly", label: "Hourly" },
  { id: "daily", label: "Daily" },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly", label: "Weekly" },
  { id: "custom", label: "Custom" },
];

const WEEKDAYS_AGENT = [
  { v: 1, label: "Monday" }, { v: 2, label: "Tuesday" }, { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday" }, { v: 5, label: "Friday" },
  { v: 6, label: "Saturday" }, { v: 0, label: "Sunday" },
];

const padN = (n: number) => String(n).padStart(2, "0");

function buildAgentCron(freq: AgentFreq, time: string, weekday: number, custom: string): string {
  if (freq === "manual") return "manual";
  const [h, m] = time.split(":").map((x) => parseInt(x, 10) || 0);
  switch (freq) {
    case "hourly": return "0 * * * *";
    case "daily": return `${m} ${h} * * *`;
    case "weekdays": return `${m} ${h} * * 1-5`;
    case "weekly": return `${m} ${h} * * ${weekday}`;
    default: return custom.trim();
  }
}

function parseAgentCron(cron: string): { freq: AgentFreq; time: string; weekday: number } {
  if (!cron.trim() || cron === "manual") return { freq: "manual", time: "09:00", weekday: 1 };
  const fallback = { freq: "custom" as AgentFreq, time: "09:00", weekday: 1 };
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return fallback;
  const [m, h, dom, mon, dow] = parts;
  if (dom !== "*" || mon !== "*") return fallback;
  const numeric = (s: string) => /^\d+$/.test(s);
  if (m === "0" && h === "*" && dow === "*") return { freq: "hourly", time: "09:00", weekday: 1 };
  if (numeric(m) && numeric(h)) {
    const time = `${padN(parseInt(h, 10))}:${padN(parseInt(m, 10))}`;
    if (dow === "*") return { freq: "daily", time, weekday: 1 };
    if (dow === "1-5") return { freq: "weekdays", time, weekday: 1 };
    if (/^[0-6]$/.test(dow)) return { freq: "weekly", time, weekday: parseInt(dow, 10) };
  }
  return fallback;
}

function EditAgentDialog({
  row,
  workspaceId,
  onClose,
  onSaved,
}: {
  row: AgentRow;
  workspaceId: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const parsed = parseAgentCron(row.schedule);
  const [description, setDescription] = useState(row.description);
  const [runMode, setRunMode] = useState<"cli" | "chat">(row.defaultRunMode === "chat" ? "chat" : "cli");
  const [cli, setCli] = useState(row.defaultCli || "claude");
  const [provider, setProvider] = useState(row.defaultProvider || "anthropic");
  const [model, setModel] = useState(row.defaultModel);
  const [freq, setFreq] = useState<AgentFreq>(parsed.freq);
  const [timeOfDay, setTimeOfDay] = useState(parsed.time);
  const [weekday, setWeekday] = useState(parsed.weekday);
  const [customCron, setCustomCron] = useState(row.schedule || "0 9 * * 1");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Model picker (OpenRouter-backed, same as ChatComposer)
  const [orModels, setOrModels] = useState<OpenrouterModel[]>([]);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [modelQuery, setModelQuery] = useState("");
  const [activeVendor, setActiveVendor] = useState("");
  const [customModelInput, setCustomModelInput] = useState(false);

  useEffect(() => {
    api.listOpenrouterModels().then(setOrModels).catch(() => setOrModels([]));
  }, []);

  const ALLOWED_VENDORS_LOCAL = ["anthropic", "openai", "openrouter", "google"];
  const vendorGroups = useMemo(() => {
    const cutoff = Date.now() / 1000 - 365 * 86400;
    const byVendor = new Map<string, OpenrouterModel[]>();
    for (const m of orModels) {
      const v = m.id.includes("/") ? m.id.split("/")[0] : "other";
      if (m.created && m.created < cutoff) continue;
      if (!byVendor.has(v)) byVendor.set(v, []);
      byVendor.get(v)!.push(m);
    }
    const FLAGSHIP = ["claude-opus-4","claude-sonnet-4","gpt-5","openai/o3","gemini-2.5-pro","gemini-2.5-flash","x-ai/grok"];
    const flagship = orModels.filter((m) => FLAGSHIP.some((p) => m.id.toLowerCase().includes(p))).sort((a, b) => b.created - a.created);
    const out: [string, OpenrouterModel[]][] = [];
    for (const v of ALLOWED_VENDORS_LOCAL) {
      if (v === "openrouter") { if (flagship.length) out.push(["openrouter", flagship]); }
      else if (byVendor.has(v)) out.push([v, byVendor.get(v)!.sort((a, b) => b.created - a.created)]);
    }
    return out;
  }, [orModels]);

  const baseList = vendorGroups.find(([v]) => v === activeVendor)?.[1] ?? vendorGroups[0]?.[1] ?? [];
  const q = modelQuery.toLowerCase();
  const activeList = q ? baseList.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : baseList;
  const orModel = orModels.find((m) => m.id === model);
  const shortName = (name: string) => name.includes(": ") ? name.split(": ").slice(1).join(": ") : name;
  const vendorLabel = (v: string) => ({ anthropic: "Anthropic", openai: "OpenAI", openrouter: "OpenRouter", google: "Gemini" }[v] ?? v);
  const modelLabel = orModel ? shortName(orModel.name) : model || "select model";

  const selectModel = (id: string) => {
    const v = id.includes("/") ? id.split("/")[0] : "other";
    const provMap: Record<string, string> = { anthropic: "anthropic", openai: "openai", google: "gemini" };
    setProvider(activeVendor === "openrouter" ? "openrouter" : (provMap[v] ?? "openrouter"));
    setModel(id);
    setModelMenuOpen(false);
    setCustomModelInput(false);
  };

  const schedule = useMemo(
    () => buildAgentCron(freq, timeOfDay, weekday, customCron),
    [freq, timeOfDay, weekday, customCron],
  );

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.upsertAgentMetadata(
        workspaceId,
        row.name,
        description.trim(),
        schedule.trim(),
        runMode,
        runMode === "cli" ? cli : "",
        runMode === "chat" ? provider : "",
        model.trim(),
        row.skills,
        row.connectors,
        row.isActive,
      );
      onSaved();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const cliLabel = CLI_PRESETS.find((c) => c.id === cli)?.label ?? cli;
  const providerLabel = CHAT_PROVIDERS.find((p) => p.id === provider)?.label ?? provider;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">{row.name}</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh] [&_[data-slot=scroll-area-viewport]>div]:!block">
          <div className="min-w-0 space-y-4 pr-2">

            {/* Description */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Description</div>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What this agent does"
                className="h-8 text-sm"
              />
            </div>

            {/* Run via */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Run via</div>
              <div className="flex items-center gap-2">
                <div className="flex gap-1 rounded-lg border bg-background p-0.5">
                  <Segment active={runMode === "cli"} onClick={() => setRunMode("cli")}>CLI</Segment>
                  <Segment active={runMode === "chat"} onClick={() => setRunMode("chat")}>Chat</Segment>
                </div>
                {/* CLI picker */}
                {runMode === "cli" ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal">
                        <PresetIcon preset={cli} className="h-3.5 w-3.5" />
                        {cliLabel}
                        <ChevronDown className="h-3 w-3 opacity-50" strokeWidth={1} />
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
                ) : (
                  /* Chat provider picker */
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 gap-1.5 font-normal">
                        <ProviderIcon provider={provider} className="h-3.5 w-3.5" />
                        {providerLabel}
                        <ChevronDown className="h-3 w-3 opacity-50" strokeWidth={1} />
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
                {/* Model — OpenRouter-backed picker like ChatComposer */}
                {customModelInput ? (
                  <input
                    autoFocus
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    onBlur={() => setCustomModelInput(false)}
                    onKeyDown={(e) => e.key === "Enter" && setCustomModelInput(false)}
                    placeholder="model id"
                    className="h-8 flex-1 rounded-md border border-input bg-background px-2 font-mono text-xs"
                  />
                ) : (
                  <DropdownMenu
                    open={modelMenuOpen}
                    onOpenChange={(o) => {
                      setModelMenuOpen(o);
                      if (o) {
                        setModelQuery("");
                        setActiveVendor(vendorGroups[0]?.[0] ?? "");
                      }
                    }}
                  >
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 flex-1 justify-start gap-1.5 font-normal">
                        <ProviderIcon model={model} className="h-3.5 w-3.5 shrink-0 opacity-60" />
                        <span className="truncate text-xs">{modelLabel}</span>
                        <ChevronDown className="ml-auto h-3 w-3 shrink-0 opacity-50" strokeWidth={1} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[32rem] p-0">
                      <div className="border-b p-1.5">
                        <input
                          autoFocus
                          value={modelQuery}
                          onChange={(e) => setModelQuery(e.target.value)}
                          onKeyDown={(e) => e.stopPropagation()}
                          placeholder={orModels.length ? `Search ${vendorLabel(activeVendor)} models…` : "Loading models…"}
                          className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none"
                        />
                      </div>
                      {orModels.length === 0 ? (
                        <div className="flex h-64 items-center justify-center text-xs text-muted-foreground">Loading models…</div>
                      ) : (
                        <div className="flex h-64">
                          <div className="w-36 shrink-0 overflow-y-auto border-r p-1">
                            {vendorGroups.map(([vendor, list]) => (
                              <button
                                key={vendor}
                                onMouseEnter={() => setActiveVendor(vendor)}
                                onClick={() => setActiveVendor(vendor)}
                                className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs ${
                                  vendor === activeVendor ? "bg-accent" : "hover:bg-accent/50"
                                }`}
                              >
                                <ProviderIcon model={`${vendor}/x`} className="h-4 w-4 opacity-80" />
                                <span className="truncate">{vendorLabel(vendor)}</span>
                                <span className="ml-auto text-[10px] text-muted-foreground">{list.length}</span>
                              </button>
                            ))}
                          </div>
                          <div className="flex-1 overflow-y-auto p-1">
                            {activeList.length === 0 ? (
                              <div className="p-2 text-xs text-muted-foreground">No matches</div>
                            ) : (
                              activeList.map((m) => (
                                <DropdownMenuItem
                                  key={m.id}
                                  onClick={() => selectModel(m.id)}
                                  className={`flex flex-col items-start gap-0.5 ${m.id === model ? "bg-accent" : ""}`}
                                >
                                  <span className="flex w-full items-center gap-1.5">
                                    <ProviderIcon model={m.id} className="h-3.5 w-3.5 shrink-0 opacity-60" />
                                    <span className="truncate text-xs">{shortName(m.name)}</span>
                                    {m.id === model && <Check className="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" />}
                                  </span>
                                </DropdownMenuItem>
                              ))
                            )}
                          </div>
                        </div>
                      )}
                      <div className="border-t p-1">
                        <DropdownMenuItem onClick={() => { setCustomModelInput(true); setModel(""); }}>
                          Custom model id…
                        </DropdownMenuItem>
                      </div>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>
            </div>

            {/* Schedule */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Schedule</div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-0.5">
                  {AGENT_FREQS.map((fr) => (
                    <Segment key={fr.id} active={freq === fr.id} onClick={() => setFreq(fr.id)}>
                      {fr.label}
                    </Segment>
                  ))}
                </div>
                {(freq === "daily" || freq === "weekdays" || freq === "weekly") && (
                  <input
                    type="time"
                    value={timeOfDay}
                    onChange={(e) => setTimeOfDay(e.target.value)}
                    className="h-8 rounded-md border bg-background px-2 text-sm"
                  />
                )}
                {freq === "weekly" && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-8 font-normal">
                        {WEEKDAYS_AGENT.find((w) => w.v === weekday)?.label ?? "Monday"}
                        <ChevronDown className="h-3 w-3 opacity-50" strokeWidth={1} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      {WEEKDAYS_AGENT.map((w) => (
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
                  placeholder="0 9 * * 1"
                  className="h-8 font-mono text-sm"
                />
              ) : freq !== "hourly" && (
                <p className="text-[11px] text-muted-foreground font-mono">{schedule}</p>
              )}
            </div>

            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Agent info dialog (library) ─────────────────────────────────────────────

function AgentInfoDialog({
  agent,
  onClose,
  onDeleted,
}: {
  agent: CatalogAgent | null;
  onClose: () => void;
  onDeleted: (id: string) => void;
}) {
  const SKILL_CAP = 10;
  const [confirm, setConfirm] = useState(false);
  useEffect(() => {
    if (agent) setConfirm(false);
  }, [agent]);
  return (
    <Dialog open={!!agent} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono">{agent?.name}</DialogTitle>
        </DialogHeader>
        {agent && (
          <div className="space-y-3">
            {agent.description && (
              <p className="text-xs text-muted-foreground">{agent.description}</p>
            )}
            {agent.category && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Category</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{agent.category}</div>
              </div>
            )}
            {agent.connectors.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Connectors</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{agent.connectors.join(", ")}</div>
              </div>
            )}
            {agent.tags.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">Tags</div>
                <div className="mt-1 text-[11px] text-muted-foreground">{agent.tags.join(", ")}</div>
              </div>
            )}
            {agent.skills.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Skills ({agent.skills.length})
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {agent.skills.slice(0, SKILL_CAP).map((s) => (
                    <span key={s} className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">{s}</span>
                  ))}
                  {agent.skills.length > SKILL_CAP && (
                    <span className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">
                      +{agent.skills.length - SKILL_CAP} more
                    </span>
                  )}
                  {!confirm ? (
                    <button
                      onClick={() => setConfirm(true)}
                      title="Delete from library"
                      className="rounded-md p-0.5 text-transparent hover:text-muted-foreground"
                    >
                      <Trash2 className="h-3.5 w-3.5" strokeWidth={1} />
                    </button>
                  ) : (
                    <button
                      onClick={() => onDeleted(agent.id)}
                      className="flex items-center gap-1 rounded-md border border-destructive px-2 py-0.5 text-[11px] text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={1} />
                      Confirm delete
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Import to project dialog ─────────────────────────────────────────────────

function ImportToProjectDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (repo: string, gitRef: string) => void;
}) {
  const [repo, setRepo] = useState("");
  const [gitRef, setGitRef] = useState("main");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setRepo(""); setGitRef("main"); setError(null); }
  }, [open]);

  const submit = () => {
    if (!repo.trim()) { setError("Enter a repo as owner/name or a GitHub URL."); return; }
    onImport(repo.trim(), gitRef.trim() || "main");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import a repo as a new project</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            We'll create a new project and install this agent into it. Any public repo works — we
            use a <span className="font-mono">.superconsole-plugin</span> (or{" "}
            <span className="font-mono">.claude-plugin</span>) manifest if present, otherwise we
            build it from the repo's AGENTS.md / CLAUDE.md / README.md and any{" "}
            <span className="font-mono">skills/</span> files.
          </p>
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">Repository</div>
            <Input value={repo} onChange={(e) => setRepo(e.target.value)} placeholder="owner/name or https://github.com/owner/name" className="h-8 font-mono text-sm" />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">Branch / tag / commit</div>
            <Input value={gitRef} onChange={(e) => setGitRef(e.target.value)} placeholder="main" className="h-8 font-mono text-sm" />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" className="h-8" onClick={submit}>Create project</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Chip helpers for CreateAgentDialog ──────────────────────────────────────

function SelChip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-0.5 text-[11px]",
        on ? "border-primary bg-primary/10 text-primary" : "border-muted-foreground/30 text-muted-foreground hover:bg-muted",
      )}
    >
      {label}
    </button>
  );
}

function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-dashed border-primary/60 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"
    >
      <Plus className="h-3 w-3" strokeWidth={1} />
      {label}
    </button>
  );
}

// ─── Create agent dialog (from library tab) ───────────────────────────────────

function CreateAgentDialog({
  open,
  onOpenChange,
  workspaces,
  onCreateInProject,
  onCreateInNewProject,
  onAddSkill,
  onAddConnector,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  workspaces: Workspace[];
  onCreateInProject: (agent: Agent, skills: string[], workspaceId: number) => void;
  onCreateInNewProject: (agent: Agent, skills: string[]) => void;
  onAddSkill: () => void;
  onAddConnector: (scope: "project" | "org" | "account") => void;
}) {
  const { auth, activeCloudOrg } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [skills, setSkills] = useState<Skill[]>([]);
  const [selSkills, setSelSkills] = useState<Record<string, boolean>>({});
  const [selConnectors, setSelConnectors] = useState<Record<string, boolean>>({});
  const [connectors, setConnectors] = useState<{ service: string; scope: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(""); setDescription(""); setInstructions("");
      setSelSkills({}); setSelConnectors({}); setError(null);
      api.listGlobalSkills().then(setSkills).catch(() => {});
      (async () => {
        const out: { service: string; scope: string }[] = [];
        if (activeCloudOrg) {
          const orgs = await api.listConnectors("org", activeCloudOrg.id).catch(() => []);
          orgs.forEach((c) => out.push({ service: c.service, scope: "org" }));
        }
        if (auth?.user.id) {
          const accs = await api.listConnectors("account", auth.user.id).catch(() => []);
          accs.forEach((c) => out.push({ service: c.service, scope: "account" }));
        }
        setConnectors(out);
      })();
    }
  }, [open, auth?.user.id, activeCloudOrg]);

  const connectorLabel = (service: string) =>
    CONNECTOR_REGISTRY.find((d) => d.id === service)?.label ?? service;

  const selectedSkills = Object.keys(selSkills).filter((k) => selSkills[k]);
  const selectedConnectors = Object.keys(selConnectors).filter((k) => selConnectors[k]);

  const build = (): Agent | null => {
    if (!name.trim()) { setError("Agent name is required."); return null; }
    if (!instructions.trim()) { setError("Instructions (agent.md) are required."); return null; }
    return {
      name: name.trim(), description: description.trim(),
      skills: selectedSkills, connectors: selectedConnectors,
      context: [], instructions: instructions.trim(),
      folderPath: "", readme: null,
    };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create agent</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pr-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="agent-name" className="h-8 font-mono text-sm" />
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What it does" className="h-8 text-sm" />
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <SelChip key={s.name} label={s.name} on={!!selSkills[s.name]} onClick={() => setSelSkills((m) => ({ ...m, [s.name]: !m[s.name] }))} />
                ))}
                <AddChip label="add skill" onClick={onAddSkill} />
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Connectors</div>
              {(["project", "org", "account"] as const).map((scope) => {
                const inScope = connectors.filter((c) => c.scope === scope);
                return (
                  <div key={scope} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {scope.charAt(0).toUpperCase() + scope.slice(1)} Scope
                      </span>
                      <AddChip label="add connector" onClick={() => onAddConnector(scope)} />
                    </div>
                    {inScope.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {inScope.map((c) => (
                          <SelChip
                            key={`${scope}-${c.service}`}
                            label={connectorLabel(c.service)}
                            on={!!selConnectors[c.service]}
                            onClick={() => setSelConnectors((m) => ({ ...m, [c.service]: !m[c.service] }))}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Instructions (agent.md)</div>
              <Textarea value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="System prompt / instructions for this agent." className="min-h-32 resize-none font-mono text-sm" />
            </div>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </ScrollArea>
        <DialogFooter>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" className="h-8">
                <FolderPlus className="h-3.5 w-3.5" strokeWidth={1} />
                Save to…
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => { const a = build(); if (!a) return; onCreateInNewProject(a, selectedSkills); onOpenChange(false); }}>
                Create new project…
              </DropdownMenuItem>
              {workspaces.length > 0 && <DropdownMenuSeparator />}
              {workspaces.map((w) => (
                <DropdownMenuItem key={w.id} onClick={() => { const a = build(); if (!a) return; onCreateInProject(a, selectedSkills, w.id); onOpenChange(false); }}>
                  Add to {w.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Admin catalog dialog ─────────────────────────────────────────────────────

function AdminCatalogDialog({
  open,
  onOpenChange,
  onDone,
  initial,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
  initial?: CatalogAgentInput | null;
}) {
  const blank = {
    name: "", description: "", category: "", imageUrl: "",
    skills: "", connectors: "", tags: "",
    repo: "SuperConsoleAI/agent-catalog", gitRef: "main",
    basePath: "", files: "agent.md",
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const detectFromRepo = async () => {
    if (!f.repo.trim()) { setError("Enter a repo to import from."); return; }
    setDetecting(true); setError(null);
    try {
      const detected = await api.detectRepoAgents(f.repo.trim(), f.gitRef.trim() || "main");
      const a = detected[0];
      if (!a) { setError("No agent could be detected in that repo."); return; }
      setF({
        name: a.name, description: a.description, category: a.category, imageUrl: a.imageUrl,
        skills: a.skills.join(", "), connectors: a.connectors.join(", "), tags: a.tags.join(", "),
        repo: a.repo, gitRef: a.gitRef, basePath: a.basePath, files: a.files.join(", "),
      });
    } catch (e) { setError(String(e)); } finally { setDetecting(false); }
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setF({
        name: initial.name, description: initial.description, category: initial.category, imageUrl: initial.imageUrl,
        skills: initial.skills.join(", "), connectors: initial.connectors.join(", "), tags: initial.tags.join(", "),
        repo: initial.repo, gitRef: initial.gitRef, basePath: initial.basePath, files: initial.files.join(", "),
      });
    } else { setF(blank); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((cur) => ({ ...cur, [k]: e.target.value }));
  const list = (v: string) => v.split(",").map((s) => s.trim()).filter(Boolean);

  const submit = async () => {
    if (!f.name.trim()) { setError("Name is required."); return; }
    setSaving(true); setError(null);
    try {
      await api.upsertCatalogAgent({
        name: f.name.trim(), description: f.description.trim(), category: f.category.trim(),
        imageUrl: f.imageUrl.trim(), skills: list(f.skills), connectors: list(f.connectors),
        tags: list(f.tags), repo: f.repo.trim(), gitRef: f.gitRef.trim(),
        basePath: f.basePath.trim(), files: list(f.files),
      });
      onOpenChange(false); onDone();
    } catch (e) { setError(String(e)); } finally { setSaving(false); }
  };

  const field = (label: string, k: keyof typeof f, placeholder?: string) => (
    <div className="space-y-1">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <Input value={f[k]} onChange={set(k)} placeholder={placeholder} className="h-8 text-sm" />
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add agent to catalog (temp)</DialogTitle>
        </DialogHeader>
        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-3 pr-3">
            <div className="flex items-end gap-2 rounded-lg border bg-muted/40 p-2.5">
              <div className="flex-1 space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">Import from repo</div>
                <Input value={f.repo} onChange={set("repo")} placeholder="owner/name or https://github.com/owner/name" className="h-8 font-mono text-sm" />
              </div>
              <Button size="sm" variant="outline" className="h-8" onClick={detectFromRepo} disabled={detecting}>
                <GitBranch className="h-3.5 w-3.5" strokeWidth={1} />
                {detecting ? "Detecting…" : "Import"}
              </Button>
            </div>
            {field("Name", "name", "create-blog-post")}
            {field("Description", "description", "Draft and publish a blog post")}
            {field("Category", "category", "content")}
            {field("Image URL", "imageUrl")}
            {field("Skills (comma-separated)", "skills", "wordpress")}
            {field("Connectors (comma-separated)", "connectors", "wordpress")}
            {field("Tags (comma-separated)", "tags", "blogging")}
            {field("Repo", "repo", "SuperConsoleAI/agent-catalog")}
            {field("Git ref", "gitRef", "main")}
            {field("Base path", "basePath", "agents/create-blog-post")}
            {field("Files (comma-separated)", "files", "agent.md, skills/wordpress.md")}
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
        </ScrollArea>
        <DialogFooter>
          <Button size="sm" className="h-8" onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Save to catalog"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Download,
  FolderPlus,
  Info,
  Plug,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Wrench,
} from "lucide-react";
import {
  api,
  CONNECTOR_REGISTRY,
  type Agent,
  type CatalogAgent,
  type CatalogAgentInput,
  type Skill,
  type Workspace,
} from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { connectorDomain, connectorLogo, faviconFallback } from "@/lib/logos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { cn } from "@/lib/utils";

interface AgentsViewProps {
  workspaces: Workspace[];
  onUseInProject: (id: string, workspaceId: number) => void;
  onUseInNewProject: (id: string) => void;
  onCreateInProject: (agent: Agent, skills: string[], workspaceId: number) => void;
  onCreateInNewProject: (agent: Agent, skills: string[]) => void;
  onImportRepoNewProject: (repo: string, gitRef: string) => void;
  onAddSkill: () => void;
  onAddConnector: (scope: "project" | "org" | "account") => void;
}

function ConnectorChip({ service }: { service: string }) {
  const domain = connectorDomain(service);
  // 0 = brandfetch, 1 = google favicon fallback, 2 = plain icon.
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

export function AgentsView({
  workspaces,
  onUseInProject,
  onUseInNewProject,
  onCreateInProject,
  onCreateInNewProject,
  onImportRepoNewProject,
  onAddSkill,
  onAddConnector,
}: AgentsViewProps) {
  const [agents, setAgents] = useState<CatalogAgent[]>([]);
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [infoAgent, setInfoAgent] = useState<CatalogAgent | null>(null);
  const [adminInitial, setAdminInitial] = useState<CatalogAgentInput | null>(null);

  const refresh = () => {
    setLoading(true);
    setError(null);
    api
      .listCatalogAgents()
      .then(setAgents)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refresh();
  }, []);

  // Filter by category + connectors (tags are info-only for now).
  const facets = useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      if (a.category) set.add(a.category);
      a.connectors.forEach((c) => set.add(c));
    }
    return Array.from(set).sort().slice(0, 40);
  }, [agents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return agents.filter((a) => {
      if (activeFilter && a.category !== activeFilter && !a.connectors.includes(activeFilter)) {
        return false;
      }
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
  }, [agents, query, activeFilter]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b px-5 py-3">
        <Bot className="h-4 w-4 text-primary" strokeWidth={1} />
        <h1 className="text-sm font-semibold">Agent Library</h1>
        <span className="text-xs text-muted-foreground">
          Add one to a project to start using it.
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Button size="sm" className="h-7" onClick={() => setCreateOpen(true)}>
            <Plus className="h-3.5 w-3.5" strokeWidth={1} />
            Create agent
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => setImportOpen(true)}
            title="Import any GitHub repo as a catalog agent"
          >
            <Download className="h-3.5 w-3.5" strokeWidth={1} />
            Import from repo
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7"
            onClick={() => {
              setAdminInitial(null);
              setAdminOpen(true);
            }}
            title="Temporary: add an agent to the shared catalog"
          >
            <Wrench className="h-3.5 w-3.5" strokeWidth={1} />
            Add to catalog
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} title="Refresh">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} strokeWidth={1} />
          </Button>
        </div>
      </div>

      <div className="space-y-2 border-b px-5 py-3">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, connector (e.g. wordpress), skill, or tag"
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

      <ScrollArea className="min-h-0 flex-1">
        {error && <p className="px-5 py-3 text-xs text-destructive">{error}</p>}
        {!error && filtered.length === 0 && (
          <p className="px-5 py-10 text-center text-sm text-muted-foreground">
            {loading ? "Loading…" : "No agents match."}
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

              {/* On the card we only surface connectors. */}
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
      </ScrollArea>

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
        onDone={refresh}
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
      <AgentInfoDialog
        agent={infoAgent}
        onClose={() => setInfoAgent(null)}
        onDeleted={async (id) => {
          await api.deleteCatalogAgent(id).catch(() => {});
          setInfoAgent(null);
          refresh();
        }}
      />
    </div>
  );
}

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
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Category
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">{agent.category}</div>
              </div>
            )}
            {agent.connectors.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Connectors
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {agent.connectors.join(", ")}
                </div>
              </div>
            )}
            {agent.tags.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Tags
                </div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {agent.tags.join(", ")}
                </div>
              </div>
            )}
            {agent.skills.length > 0 && (
              <div>
                <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                  Skills ({agent.skills.length})
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {agent.skills.slice(0, SKILL_CAP).map((s) => (
                    <span
                      key={s}
                      className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground"
                    >
                      {s}
                    </span>
                  ))}
                  {agent.skills.length > SKILL_CAP && (
                    <span className="rounded-md border px-2 py-0.5 text-[11px] text-muted-foreground">
                      +{agent.skills.length - SKILL_CAP} more
                    </span>
                  )}
                  {/* Low-key delete, tucked at the end of the chips. */}
                  {!confirm ? (
                    <button
                      onClick={() => setConfirm(true)}
                      title="Delete from library"
                      className="rounded-md p-0.5 text-transparent"
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
    if (open) {
      setRepo("");
      setGitRef("main");
      setError(null);
    }
  }, [open]);

  const submit = () => {
    if (!repo.trim()) {
      setError("Enter a repo as owner/name or a GitHub URL.");
      return;
    }
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
            <Input
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/name or https://github.com/owner/name"
              className="h-8 font-mono text-sm"
            />
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-medium text-muted-foreground">Branch / tag / commit</div>
            <Input
              value={gitRef}
              onChange={(e) => setGitRef(e.target.value)}
              placeholder="main"
              className="h-8 font-mono text-sm"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button size="sm" className="h-8" onClick={submit}>
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SelChip({
  label,
  on,
  onClick,
}: {
  label: string;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-0.5 text-[11px]",
        on
          ? "border-primary bg-primary/10 text-primary"
          : "border-muted-foreground/30 text-muted-foreground hover:bg-muted",
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
  // Only the connectors the user actually has, grouped by where they live.
  const [connectors, setConnectors] = useState<{ service: string; scope: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName("");
      setDescription("");
      setInstructions("");
      setSelSkills({});
      setSelConnectors({});
      setError(null);
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
    if (!name.trim()) {
      setError("Agent name is required.");
      return null;
    }
    if (!instructions.trim()) {
      setError("Instructions (agent.md) are required.");
      return null;
    }
    return {
      name: name.trim(),
      description: description.trim(),
      skills: selectedSkills,
      connectors: selectedConnectors,
      context: [],
      instructions: instructions.trim(),
      folderPath: "",
      readme: null,
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
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="agent-name"
              className="h-8 font-mono text-sm"
            />
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="What it does"
              className="h-8 text-sm"
            />

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {skills.map((s) => (
                  <SelChip
                    key={s.name}
                    label={s.name}
                    on={!!selSkills[s.name]}
                    onClick={() => setSelSkills((m) => ({ ...m, [s.name]: !m[s.name] }))}
                  />
                ))}
                <AddChip label="add skill" onClick={onAddSkill} />
              </div>
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Connectors</div>
              {(
                [
                  { scope: "project", label: "Project Scope" },
                  { scope: "org", label: "Org Scope" },
                  { scope: "account", label: "Account Scope" },
                ] as const
              ).map(({ scope, label }) => {
                const inScope = connectors.filter((c) => c.scope === scope);
                return (
                  <div key={scope} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                        {label}
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
                            onClick={() =>
                              setSelConnectors((m) => ({ ...m, [c.service]: !m[c.service] }))
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Context</div>
              <p className="text-[11px] text-muted-foreground">
                You can add context files after the agent is created.
              </p>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Instructions (agent.md)</div>
              <Textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="System prompt / instructions for this agent."
                className="min-h-32 resize-none font-mono text-sm"
              />
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
              <DropdownMenuItem
                onClick={() => {
                  const a = build();
                  if (!a) return;
                  onCreateInNewProject(a, selectedSkills);
                  onOpenChange(false);
                }}
              >
                Create new project…
              </DropdownMenuItem>
              {workspaces.length > 0 && <DropdownMenuSeparator />}
              {workspaces.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => {
                    const a = build();
                    if (!a) return;
                    onCreateInProject(a, selectedSkills, w.id);
                    onOpenChange(false);
                  }}
                >
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
    name: "",
    description: "",
    category: "",
    imageUrl: "",
    skills: "",
    connectors: "",
    tags: "",
    repo: "SuperConsoleAI/agent-catalog",
    gitRef: "main",
    basePath: "",
    files: "agent.md",
  };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [detecting, setDetecting] = useState(false);

  const detectFromRepo = async () => {
    if (!f.repo.trim()) {
      setError("Enter a repo to import from.");
      return;
    }
    setDetecting(true);
    setError(null);
    try {
      const detected = await api.detectRepoAgents(f.repo.trim(), f.gitRef.trim() || "main");
      const a = detected[0];
      if (!a) {
        setError("No agent could be detected in that repo.");
        return;
      }
      setF({
        name: a.name,
        description: a.description,
        category: a.category,
        imageUrl: a.imageUrl,
        skills: a.skills.join(", "),
        connectors: a.connectors.join(", "),
        tags: a.tags.join(", "),
        repo: a.repo,
        gitRef: a.gitRef,
        basePath: a.basePath,
        files: a.files.join(", "),
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setDetecting(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setError(null);
    if (initial) {
      setF({
        name: initial.name,
        description: initial.description,
        category: initial.category,
        imageUrl: initial.imageUrl,
        skills: initial.skills.join(", "),
        connectors: initial.connectors.join(", "),
        tags: initial.tags.join(", "),
        repo: initial.repo,
        gitRef: initial.gitRef,
        basePath: initial.basePath,
        files: initial.files.join(", "),
      });
    } else {
      setF(blank);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((cur) => ({ ...cur, [k]: e.target.value }));

  const list = (v: string) =>
    v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  const submit = async () => {
    if (!f.name.trim()) {
      setError("Name is required.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await api.upsertCatalogAgent({
        name: f.name.trim(),
        description: f.description.trim(),
        category: f.category.trim(),
        imageUrl: f.imageUrl.trim(),
        skills: list(f.skills),
        connectors: list(f.connectors),
        tags: list(f.tags),
        repo: f.repo.trim(),
        gitRef: f.gitRef.trim(),
        basePath: f.basePath.trim(),
        files: list(f.files),
      });
      onOpenChange(false);
      onDone();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
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
            {/* Import from a repo to prefill the fields below, then Save adds it
                to the library. */}
            <div className="flex items-end gap-2 rounded-lg border bg-muted/40 p-2.5">
              <div className="flex-1 space-y-1">
                <div className="text-[11px] font-medium text-muted-foreground">
                  Import from repo
                </div>
                <Input
                  value={f.repo}
                  onChange={set("repo")}
                  placeholder="owner/name or https://github.com/owner/name"
                  className="h-8 font-mono text-sm"
                />
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={detectFromRepo}
                disabled={detecting}
              >
                <Download className="h-3.5 w-3.5" strokeWidth={1} />
                {detecting ? "Detecting…" : "Import"}
              </Button>
            </div>
            {field("Name", "name", "create-blog-post")}
            {field("Description", "description", "Draft and publish a blog post")}
            {field("Category", "category", "content")}
            {field("Image URL", "imageUrl", "https://cdn.brandfetch.io/wordpress.com?c=…")}
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

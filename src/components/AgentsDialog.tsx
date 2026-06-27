import { useCallback, useEffect, useState } from "react";
import { Bot, Check, Maximize2, Minimize2, Pencil, Play, Plus, Trash2, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  api,
  type Agent,
  type ContextFile,
  type Skill,
  type WorkspaceConnector,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface AgentsDialogProps {
  workspaceId: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function Chip({
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
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px]",
        on
          ? "border-primary bg-primary/10 text-primary"
          : "border-muted-foreground/30 text-muted-foreground hover:bg-muted",
      )}
    >
      {on && <Check className="h-3 w-3" strokeWidth={2} />}
      {label}
    </button>
  );
}

function AddChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 rounded-md border border-dashed border-primary/60 px-2 py-0.5 text-[11px] text-primary hover:bg-primary/10"
    >
      <Plus className="h-3 w-3" strokeWidth={1} />
      {label}
    </button>
  );
}

const SCOPE_LABELS: Record<WorkspaceConnector["scope"], string> = {
  project: "Project",
  org: "Organisation",
  account: "Account",
};
const SCOPE_ORDER: WorkspaceConnector["scope"][] = ["project", "org", "account"];

export function AgentsDialog({ workspaceId, open, onOpenChange }: AgentsDialogProps) {
  const navigate = useNavigate();
  const goToSettings = (
    section: string,
    tab: "account" | "org" | "project" = "account",
  ) => navigate({ to: "/settings", search: { tab, section } });
  const [agents, setAgents] = useState<Agent[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [globalSkills, setGlobalSkills] = useState<Skill[]>([]);
  const [connectors, setConnectors] = useState<WorkspaceConnector[]>([]);
  const [contextFiles, setContextFiles] = useState<ContextFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [origName, setOrigName] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selSkills, setSelSkills] = useState<Record<string, boolean>>({});
  const [selConnectors, setSelConnectors] = useState<Record<string, boolean>>({});
  const [selContext, setSelContext] = useState<Record<string, boolean>>({});
  const [instructions, setInstructions] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [defaultRunMode, setDefaultRunMode] = useState<"cli" | "chat" | "auto">("cli");

  const refresh = useCallback(() => {
    api.listAgents(workspaceId).then(setAgents).catch(console.error);
    api.listSkills(workspaceId).then(setSkills).catch(() => {});
    api.listGlobalSkills().then(setGlobalSkills).catch(() => {});
    api.listWorkspaceConnectors(workspaceId).then(setConnectors).catch(() => {});
    api.listContextFiles(workspaceId).then(setContextFiles).catch(() => {});
  }, [workspaceId]);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  const resetForm = () => {
    setEditing(false);
    setOrigName(null);
    setName("");
    setDescription("");
    setSelSkills({});
    setSelConnectors({});
    setSelContext({});
    setInstructions("");
    setExpanded(false);
    setDefaultRunMode("cli");
    setError(null);
  };

  const loadForEdit = async (a: Agent) => {
    setEditing(true);
    setOrigName(a.name);
    setName(a.name);
    setDescription(a.description);
    setSelSkills(Object.fromEntries(a.skills.map((s) => [s, true])));
    setSelConnectors(Object.fromEntries(a.connectors.map((c) => [c, true])));
    setSelContext(Object.fromEntries(a.context.map((c) => [c, true])));
    setInstructions(a.instructions);
    setExpanded(true);
    // Load saved run mode from metadata (best-effort).
    try {
      const rows = await api.listWorkspaceAgents(workspaceId);
      const row = rows.find((r) => r.name === a.name);
      if (row?.defaultRunMode) {
        setDefaultRunMode(row.defaultRunMode as "cli" | "chat" | "auto");
      } else {
        setDefaultRunMode("cli");
      }
    } catch {
      setDefaultRunMode("cli");
    }
  };

  const keysOf = (m: Record<string, boolean>) =>
    Object.entries(m)
      .filter(([, v]) => v)
      .map(([k]) => k);

  const submit = async () => {
    if (!name.trim()) {
      setError("Agent name is required.");
      return;
    }
    if (!instructions.trim()) {
      setError("Instructions are required.");
      return;
    }
    const agent: Agent = {
      name: name.trim(),
      description: description.trim(),
      skills: keysOf(selSkills),
      connectors: keysOf(selConnectors),
      context: keysOf(selContext),
      instructions: instructions.trim(),
      folderPath: "",
      readme: null,
    };
    setError(null);
    try {
      if (editing && origName && origName !== agent.name) {
        await api.deleteAgent(workspaceId, origName);
        // Also remove the old metadata row (the new name creates a fresh row).
        await api.deleteAgentMetadata(workspaceId, origName).catch(() => {});
      }
      // Write any selected account-library skills into the project files so the
      // agent's referenced skills travel with the project.
      const projectNames = new Set(skills.map((s) => s.name));
      for (const sName of agent.skills) {
        if (!projectNames.has(sName)) {
          await api.materializeSkillToWorkspace(workspaceId, sName).catch(() => {});
        }
      }
      await api.saveAgent(workspaceId, agent);
      // Persist metadata (schedule defaults, skills, connectors) to local DB + Turso.
      await api.upsertAgentMetadata(
        workspaceId,
        agent.name,
        agent.description,
        "",              // schedule — empty until set via Scheduled jobs
        defaultRunMode,  // default_run_mode
        "",              // default_cli  — inherits workspace default
        "",              // default_provider
        "",              // default_model
        agent.skills.join(","),
        agent.connectors.join(","),
        true,            // is_active
      ).catch(() => {}); // metadata sync is best-effort
      resetForm();
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const runNow = async (a: Agent) => {
    setRunning(a.name);
    try {
      await api.runAgentNow(workspaceId, a.name);
      refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(null);
    }
  };

  const mergedSkills = (() => {
    const seen = new Set<string>();
    const out: Skill[] = [];
    for (const s of [...skills, ...globalSkills]) {
      if (seen.has(s.name)) continue;
      seen.add(s.name);
      out.push(s);
    }
    return out;
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-primary" strokeWidth={1} />
            Agents
          </DialogTitle>
          <DialogDescription>
            Reusable workers in <span className="font-mono">.superconsole/agents</span>. Pick the
            skills, connectors, and context they use. The harness and model are chosen when you
            schedule or run one in Scheduled jobs (clock icon).
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[62vh] [&_[data-slot=scroll-area-viewport]>div]:!block">
          <div className="min-w-0 space-y-3 pr-2">
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
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
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Skills</div>
                <div className="flex flex-wrap gap-1.5">
                  {mergedSkills.map((s) => (
                    <Chip
                      key={s.name}
                      label={s.name}
                      on={!!selSkills[s.name]}
                      onClick={() => setSelSkills((m) => ({ ...m, [s.name]: !m[s.name] }))}
                    />
                  ))}
                  <AddChip label="add skill" onClick={() => goToSettings("Skills")} />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Connectors</div>
                {SCOPE_ORDER.map((scope) => {
                  const inScope = connectors.filter((c) => c.scope === scope);
                  return (
                    <div key={scope} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                          {SCOPE_LABELS[scope]}
                        </span>
                        <AddChip
                          label="add connector"
                          onClick={() => goToSettings("Connectors", scope)}
                        />
                      </div>
                      {inScope.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {inScope.map((c) => (
                            <Chip
                              key={`${scope}-${c.service}`}
                              label={c.label}
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
                {contextFiles.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground">No context files.</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {contextFiles.map((c) => (
                      <Chip
                        key={c.slug}
                        label={c.slug}
                        on={!!selContext[c.slug]}
                        onClick={() => setSelContext((m) => ({ ...m, [c.slug]: !m[c.slug] }))}
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="text-xs font-medium text-muted-foreground">Default run mode</div>
                <div className="flex gap-1 rounded-lg border bg-background p-0.5 w-fit">
                  {(["cli", "chat", "auto"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setDefaultRunMode(m)}
                      className={cn(
                        "rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                        defaultRunMode === m
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted",
                      )}
                    >
                      {m === "cli" ? "CLI" : m === "chat" ? "Chat" : "Auto"}
                    </button>
                  ))}
                </div>
                {defaultRunMode === "auto" && (
                  <p className="text-[11px] text-muted-foreground">
                    Router picks the best approach each run from project memory.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-medium text-muted-foreground">Instructions</div>
                  <button
                    type="button"
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                    onClick={() => setExpanded((v) => !v)}
                  >
                    {expanded ? (
                      <Minimize2 className="h-3 w-3" strokeWidth={1} />
                    ) : (
                      <Maximize2 className="h-3 w-3" strokeWidth={1} />
                    )}
                    {expanded ? "Collapse" : "Expand"}
                  </button>
                </div>
                <Textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  placeholder="System prompt / instructions for this agent."
                  className={cn("resize-none font-mono text-sm", expanded ? "min-h-64" : "min-h-24")}
                />
              </div>

              {error && <p className="text-xs text-destructive">{error}</p>}

              <div className="flex items-center justify-end gap-2">
                {editing && (
                  <Button variant="ghost" size="sm" className="h-8" onClick={resetForm}>
                    <X className="h-3.5 w-3.5" strokeWidth={1} />
                    Cancel
                  </Button>
                )}
                <Button size="sm" className="h-8" onClick={submit}>
                  <Plus className="h-3.5 w-3.5" strokeWidth={1} />
                  {editing ? "Save agent" : "Add agent"}
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              {agents.length === 0 && (
                <p className="py-6 text-center text-sm text-muted-foreground">No agents yet.</p>
              )}
              {agents.map((a) => (
                <div
                  key={a.name}
                  className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{a.name}</div>
                    {a.description && (
                      <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                        {a.description}
                      </p>
                    )}
                    {(a.skills.length > 0 || a.connectors.length > 0 || a.context.length > 0) && (
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {[
                          a.skills.length && `${a.skills.length} skills`,
                          a.connectors.length && `${a.connectors.length} connectors`,
                          a.context.length && `${a.context.length} context`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() => loadForEdit(a)}
                    title="Edit"
                  >
                    <Pencil className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    disabled={running === a.name}
                    onClick={() => runNow(a)}
                    title="Run now (workspace default CLI)"
                  >
                    <Play
                      className={cn("h-3.5 w-3.5", running === a.name && "animate-pulse")}
                      strokeWidth={1}
                    />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0"
                    onClick={() =>
                      api.deleteAgent(workspaceId, a.name).then(refresh).catch(console.error)
                    }
                    title="Delete"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1} />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

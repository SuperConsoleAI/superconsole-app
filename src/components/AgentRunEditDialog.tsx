/**
 * AgentRunEditDialog — standalone dialog for editing an agent's run settings.
 *
 * Run modes: CLI / Chat / Auto
 *   CLI  → choose preset (claude / droid / etc.) + optional model
 *   Chat → choose provider + optional model
 *   Auto → router agent picks best approach from project memory (no extra pickers)
 *
 * Extracted from AgentsView.tsx so AgentsDialog can also use it.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import {
  api,
  CHAT_PROVIDERS,
  CLI_PRESETS,
  type AgentRow,
  type OpenrouterModel,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PresetIcon } from "@/components/PresetIcon";
import { ProviderIcon } from "@/components/ProviderIcon";
import { cn } from "@/lib/utils";

// ─── Local helpers ────────────────────────────────────────────────────────────

type AgentFreq = "manual" | "hourly" | "daily" | "weekdays" | "weekly" | "custom";

const AGENT_FREQS: { id: AgentFreq; label: string }[] = [
  { id: "manual",   label: "Manual"   },
  { id: "hourly",   label: "Hourly"   },
  { id: "daily",    label: "Daily"    },
  { id: "weekdays", label: "Weekdays" },
  { id: "weekly",   label: "Weekly"   },
  { id: "custom",   label: "Custom"   },
];

const WEEKDAYS_AGENT = [
  { v: 1, label: "Monday"    },
  { v: 2, label: "Tuesday"   },
  { v: 3, label: "Wednesday" },
  { v: 4, label: "Thursday"  },
  { v: 5, label: "Friday"    },
  { v: 6, label: "Saturday"  },
  { v: 0, label: "Sunday"    },
];

function buildAgentCron(freq: AgentFreq, time: string, weekday: number, custom: string): string {
  const [h, m] = time.split(":").map(Number);
  if (freq === "manual")   return "";
  if (freq === "hourly")   return "0 * * * *";
  if (freq === "daily")    return `${m ?? 0} ${h ?? 9} * * *`;
  if (freq === "weekdays") return `${m ?? 0} ${h ?? 9} * * 1-5`;
  if (freq === "weekly")   return `${m ?? 0} ${h ?? 9} * * ${weekday}`;
  return custom;
}

function parseAgentCron(cron: string): { freq: AgentFreq; time: string; weekday: number } {
  if (!cron) return { freq: "manual", time: "09:00", weekday: 1 };
  const parts = cron.split(" ");
  if (parts.length !== 5) return { freq: "custom", time: "09:00", weekday: 1 };
  const [min, hr, , , dow] = parts;
  const time = `${String(hr).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  if (dow === "*") return min === "0" && hr === "*" ? { freq: "hourly", time, weekday: 1 } : { freq: "daily", time, weekday: 1 };
  if (dow === "1-5") return { freq: "weekdays", time, weekday: 1 };
  const wd = parseInt(dow, 10);
  if (!isNaN(wd)) return { freq: "weekly", time, weekday: wd };
  return { freq: "custom", time: "09:00", weekday: 1 };
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-0.5 text-[11px] font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export interface AgentRunEditDialogProps {
  row: AgentRow;
  workspaceId: number;
  onClose: () => void;
  onSaved: () => void;
}

export function AgentRunEditDialog({
  row,
  workspaceId,
  onClose,
  onSaved,
}: AgentRunEditDialogProps) {
  const parsed = parseAgentCron(row.schedule);

  const [description, setDescription] = useState(row.description);
  const [runMode, setRunMode] = useState<"cli" | "chat" | "auto">(
    row.defaultRunMode === "auto" ? "auto"
    : row.defaultRunMode === "chat" ? "chat"
    : "cli"
  );
  const [cli, setCli]           = useState(row.defaultCli || "claude");
  const [provider, setProvider] = useState(row.defaultProvider || "anthropic");
  const [model, setModel]       = useState(row.defaultModel);
  const [freq, setFreq]         = useState<AgentFreq>(parsed.freq);
  const [timeOfDay, setTimeOfDay] = useState(parsed.time);
  const [weekday, setWeekday]   = useState(parsed.weekday);
  const [customCron, setCustomCron] = useState(row.schedule || "0 9 * * 1");
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  // Model picker (OpenRouter-backed)
  const [orModels, setOrModels]               = useState<OpenrouterModel[]>([]);
  const [modelMenuOpen, setModelMenuOpen]     = useState(false);
  const [modelQuery, setModelQuery]           = useState("");
  const [activeVendor, setActiveVendor]       = useState("");
  const [customModelInput, setCustomModelInput] = useState(false);

  useEffect(() => {
    api.listOpenrouterModels().then(setOrModels).catch(() => setOrModels([]));
  }, []);

  const ALLOWED_VENDORS = ["anthropic", "openai", "openrouter", "google"];
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
    const flagship = orModels
      .filter((m) => FLAGSHIP.some((p) => m.id.toLowerCase().includes(p)))
      .sort((a, b) => b.created - a.created);
    const out: [string, OpenrouterModel[]][] = [];
    for (const v of ALLOWED_VENDORS) {
      if (v === "openrouter") { if (flagship.length) out.push(["openrouter", flagship]); }
      else if (byVendor.has(v)) out.push([v, byVendor.get(v)!.sort((a, b) => b.created - a.created)]);
    }
    return out;
  }, [orModels]);

  const baseList   = vendorGroups.find(([v]) => v === activeVendor)?.[1] ?? vendorGroups[0]?.[1] ?? [];
  const q          = modelQuery.toLowerCase();
  const activeList = q ? baseList.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q)) : baseList;
  const orModel    = orModels.find((m) => m.id === model);
  const shortName  = (name: string) => name.includes(": ") ? name.split(": ").slice(1).join(": ") : name;
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
        runMode === "cli"  ? cli      : "",
        runMode === "chat" ? provider : "",
        runMode === "auto" ? "" : model.trim(),
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

  const cliLabel      = CLI_PRESETS.find((c) => c.id === cli)?.label ?? cli;
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

            {/* Run via: CLI / Chat / Auto */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Run via</div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex gap-1 rounded-lg border bg-background p-0.5">
                  <Seg active={runMode === "cli"}  onClick={() => setRunMode("cli")}>CLI</Seg>
                  <Seg active={runMode === "chat"} onClick={() => setRunMode("chat")}>Chat</Seg>
                  <Seg active={runMode === "auto"} onClick={() => setRunMode("auto")}>Auto</Seg>
                </div>

                {/* CLI preset picker */}
                {runMode === "cli" && (
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
                )}

                {/* Chat provider picker */}
                {runMode === "chat" && (
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

                {/* Model picker — hidden when Auto */}
                {runMode !== "auto" && (
                  <>
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
                  </>
                )}
              </div>

              {/* Auto hint */}
              {runMode === "auto" && (
                <p className="text-[11px] text-muted-foreground rounded-md border bg-muted/30 px-3 py-2 leading-relaxed">
                  Router reads project memory and available agents to pick the best approach each run.
                  Requires <span className="font-mono">.superconsole/agents/router/agent.md</span>
                  {" "}(created automatically when you add a workspace).
                </p>
              )}
            </div>

            {/* Schedule */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">Schedule</div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex flex-wrap gap-1 rounded-lg border bg-background p-0.5">
                  {AGENT_FREQS.map((fr) => (
                    <Seg key={fr.id} active={freq === fr.id} onClick={() => setFreq(fr.id)}>
                      {fr.label}
                    </Seg>
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

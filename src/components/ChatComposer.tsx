import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowUp,
  Brain,
  ChevronDown,
  Globe,
  Paperclip,
  Plug,
  Plus,
  ScrollText,
  Square,
  TerminalSquare,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import { api, type OpenrouterModel, type Skill, type SlashCommand } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Attachment {
  name: string;
  content: string;
}

const TEXT_EXTS = ["md", "txt", "csv", "json", "yaml", "yml", "ts", "tsx", "js", "py", "rs"];

const THINKING_LEVELS = [
  { id: "off", label: "Thinking off" },
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High / Max" },
] as const;

const AGENT_MODES = [
  { id: "auto", label: "Auto", hint: "Tools run without approval" },
  { id: "semi", label: "Semi-Auto", hint: "Approve risky tools" },
  { id: "manual", label: "Manual", hint: "Approve every tool" },
] as const;

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// OpenAI reasoning support is curated; OpenRouter is detected live from the
// model's supported_parameters.
function openaiSupportsThinking(model: string): boolean {
  return /gpt-5|^o1|^o3/.test(model.toLowerCase());
}

function fmtCtx(n: number): string {
  if (!n) return "";
  return n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
}

function fmtPrice(p: number): string {
  return `$${(p * 1e6).toFixed(2)}`;
}

// Provider tabs surfaced in the model selector, in this order.
const ALLOWED_VENDORS = ["anthropic", "openai", "openrouter", "google"];

// Hide stale models from the per-provider tabs (OpenRouter tab is exempt).
const MAX_MODEL_AGE_DAYS = 365;

// The "OpenRouter" tab is a curated cross-vendor flagship shortlist (incl. Grok,
// Kimi, GLM) rather than the raw openrouter/* utility models.
const FLAGSHIP_PATTERNS = [
  "claude-opus-4",
  "claude-sonnet-4",
  "gpt-5",
  "openai/o3",
  "gemini-2.5-pro",
  "gemini-2.5-flash",
  "x-ai/grok",
  "moonshotai/kimi",
  "z-ai/glm",
];

const VENDOR_LABELS: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  openrouter: "OpenRouter",
  google: "Gemini",
};

function vendorOf(id: string): string {
  return id.includes("/") ? id.split("/")[0] : "other";
}

function vendorLabel(v: string): string {
  return VENDOR_LABELS[v] ?? v.charAt(0).toUpperCase() + v.slice(1);
}

// OR model names are "Vendor: Model" — drop the redundant vendor prefix.
function shortName(name: string): string {
  return name.includes(": ") ? name.split(": ").slice(1).join(": ") : name;
}

interface ChatComposerProps {
  workspaceId: number;
  projectId: string | null;
  input: string;
  setInput: (v: string) => void;
  onSend: () => void;
  sending: boolean;
  onStop: () => void;
  provider: string;
  setProvider: (p: string) => void;
  model: string;
  setModel: (m: string) => void;
  attachments: Attachment[];
  setAttachments: (a: Attachment[]) => void;
  toolMode: "auto" | "direct";
  setToolMode: (m: "auto" | "direct") => void;
  reasoning: string;
  setReasoning: (r: string) => void;
  agentMode: "auto" | "semi" | "manual";
  setAgentMode: (m: "auto" | "semi" | "manual") => void;
}

export function ChatComposer({
  workspaceId,
  projectId,
  input,
  setInput,
  onSend,
  sending,
  onStop,
  provider,
  setProvider,
  model,
  setModel,
  attachments,
  setAttachments,
  toolMode,
  setToolMode,
  reasoning,
  setReasoning,
  agentMode,
  setAgentMode,
}: ChatComposerProps) {
  const router = useRouter();
  const [skills, setSkills] = useState<Skill[]>([]);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [connectors, setConnectors] = useState<string[]>([]);
  const [customModel, setCustomModel] = useState(false);
  const [orModels, setOrModels] = useState<OpenrouterModel[]>([]);
  const [modelQuery, setModelQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeVendor, setActiveVendor] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api
      .listSkills(workspaceId)
      .then((s) => setSkills(s.filter((x) => x.active)))
      .catch(() => setSkills([]));
    api.listCommands(workspaceId).then(setCommands).catch(() => setCommands([]));
  }, [workspaceId]);

  useEffect(() => {
    if (projectId) {
      api
        .listConnectors("project", projectId)
        .then((c) => setConnectors(c.map((x) => x.service)))
        .catch(() => setConnectors([]));
    }
  }, [projectId]);

  useEffect(() => {
    api.listOpenrouterModels().then(setOrModels).catch(() => setOrModels([]));
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        taRef.current?.focus();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    // Line height 20px + 24px padding → grow from 4 up to 12 lines, then scroll.
    const min = 4 * 20 + 24;
    const max = 12 * 20 + 24;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(Math.max(ta.scrollHeight, min), max)}px`;
  }, [input]);

  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const text = e.clipboardData.getData("text");
    // Large pastes become a document attachment instead of flooding the box.
    if (text && (text.length > 1500 || text.split("\n").length > 20)) {
      e.preventDefault();
      const n = attachments.filter((a) => a.name.startsWith("Pasted text")).length + 1;
      setAttachments([...attachments, { name: `Pasted text ${n}.txt`, content: text }]);
    }
  };

  const isOr = provider === "openrouter";
  const orModel = orModels.find((m) => m.id === model);
  const vendorGroups = useMemo(() => {
    const cutoff = Date.now() / 1000 - MAX_MODEL_AGE_DAYS * 86400;
    const byCreatedDesc = (a: OpenrouterModel, b: OpenrouterModel) => b.created - a.created;
    const byVendor = new Map<string, OpenrouterModel[]>();
    for (const m of orModels) {
      const v = vendorOf(m.id);
      if (m.created && m.created < cutoff) continue;
      if (!byVendor.has(v)) byVendor.set(v, []);
      byVendor.get(v)!.push(m);
    }
    const flagship = orModels
      .filter((m) => FLAGSHIP_PATTERNS.some((p) => m.id.toLowerCase().includes(p)))
      .sort(byCreatedDesc);
    const out: [string, OpenrouterModel[]][] = [];
    for (const v of ALLOWED_VENDORS) {
      if (v === "openrouter") {
        if (flagship.length) out.push(["openrouter", flagship]);
      } else if (byVendor.has(v)) {
        out.push([v, byVendor.get(v)!.sort(byCreatedDesc)]);
      }
    }
    return out;
  }, [orModels]);

  const modelLabel = orModel ? shortName(orModel.name) : model || "select model";
  const baseList =
    vendorGroups.find(([v]) => v === activeVendor)?.[1] ?? vendorGroups[0]?.[1] ?? [];
  // Search is scoped to the currently selected provider.
  const q = modelQuery.toLowerCase();
  const activeList = q
    ? baseList.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
    : baseList;
  const goSettings = () => router.navigate({ to: "/settings" });
  const selectModel = (id: string) => {
    setProvider("openrouter");
    setModel(id);
    setCustomModel(false);
    setMenuOpen(false);
  };

  const pickFiles = async () => {
    try {
      const picked = await open({
        multiple: true,
        filters: [{ name: "Text files", extensions: TEXT_EXTS }],
      });
      if (!picked) return;
      const paths = Array.isArray(picked) ? picked : [picked];
      const next: Attachment[] = [...attachments];
      for (const p of paths) {
        try {
          next.push({ name: basename(p), content: await api.readAttachment(p) });
        } catch {
          /* skip unreadable */
        }
      }
      setAttachments(next);
    } catch {
      /* cancelled */
    }
  };

  const insert = (snippet: string) => {
    const sep = input && !input.endsWith(" ") ? " " : "";
    setInput(input + sep + snippet + " ");
    taRef.current?.focus();
  };

  const canThink = isOr ? !!orModel?.supports_reasoning : openaiSupportsThinking(model);
  const thinkingLabel =
    THINKING_LEVELS.find((l) => l.id === reasoning)?.label ?? "Low";
  const agentLabel = AGENT_MODES.find((m) => m.id === agentMode)?.label ?? "Auto";
  const canSend = input.trim().length > 0 || attachments.length > 0;

  return (
    <div className="px-3 pb-0">
      <div className="flex w-full flex-col rounded-xl border border-input bg-background focus-within:ring-1 focus-within:ring-ring">
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2.5">
            {attachments.map((a, i) => (
              <span
                key={`${a.name}-${i}`}
                className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs"
              >
                <Paperclip className="h-3 w-3 opacity-60" />
                <span className="max-w-40 truncate">{a.name}</span>
                <button
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => setAttachments(attachments.filter((_, j) => j !== i))}
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          onPaste={onPaste}
          rows={4}
          placeholder="Ask anything, @mention skills, or / for a command…"
          style={{ lineHeight: "20px" }}
          className="resize-none overflow-y-auto bg-transparent px-3.5 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
          spellCheck={false}
        />

        {/* Bottom control bar */}
        <div className="flex items-center gap-1 px-2 pb-2">
          {/* + menu */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" title="Add context">
                <Plus className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-60">
              <DropdownMenuItem onClick={pickFiles}>
                <Paperclip className="h-4 w-4" />
                Add files
                <DropdownMenuShortcut>⌘U</DropdownMenuShortcut>
              </DropdownMenuItem>

              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <ScrollText className="h-4 w-4" />
                  Skills
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                  {skills.length === 0 ? (
                    <DropdownMenuItem disabled>No active skills</DropdownMenuItem>
                  ) : (
                    skills.map((s) => (
                      <DropdownMenuItem key={s.name} onClick={() => insert(`@skill:${s.name}`)}>
                        {s.name}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={goSettings}>Manage skills…</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Plug className="h-4 w-4" />
                  Connectors
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                  {connectors.length === 0 ? (
                    <DropdownMenuItem disabled>None connected</DropdownMenuItem>
                  ) : (
                    connectors.map((c) => (
                      <DropdownMenuItem key={c} disabled className="opacity-100">
                        {c}
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={goSettings}>Manage connectors…</DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <TerminalSquare className="h-4 w-4" />
                  Commands
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
                  {commands.length === 0 ? (
                    <DropdownMenuItem disabled>No commands</DropdownMenuItem>
                  ) : (
                    commands.map((c) => (
                      <DropdownMenuItem
                        key={c.file_path}
                        onClick={() => insert(c.slash)}
                        className="font-mono text-xs"
                      >
                        {c.slash}
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuItem
                onClick={connectors.includes("web_search") ? undefined : goSettings}
              >
                <Globe className="h-4 w-4" />
                Web search
                <DropdownMenuShortcut>
                  {connectors.includes("web_search") ? "connected" : "connect"}
                </DropdownMenuShortcut>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuLabel className="flex items-center gap-2 text-xs text-muted-foreground">
                <Wrench className="h-3.5 w-3.5" />
                Tool access
              </DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={toolMode}
                onValueChange={(v) => setToolMode(v as "auto" | "direct")}
              >
                <DropdownMenuRadioItem value="auto">Load tools when needed</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="direct">Tools already loaded</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Unified provider → model selector (OpenRouter-backed) */}
          {customModel ? (
            <input
              autoFocus
              value={model}
              onChange={(e) => setModel(e.target.value)}
              onBlur={() => setCustomModel(false)}
              onKeyDown={(e) => e.key === "Enter" && setCustomModel(false)}
              placeholder="model id"
              className="h-7 w-44 rounded-md border border-input bg-background px-2 font-mono text-xs"
            />
          ) : (
            <DropdownMenu
              open={menuOpen}
              onOpenChange={(o) => {
                setMenuOpen(o);
                if (o) {
                  setModelQuery("");
                  setActiveVendor(vendorOf(model) || vendorGroups[0]?.[0] || "");
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <button className="flex h-7 max-w-56 items-center gap-1.5 rounded-md px-1.5 text-xs hover:bg-accent">
                  <ProviderIcon model={model} className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  <span className="truncate">{modelLabel}</span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-50" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-[34rem] p-0">
                <div className="border-b p-1.5">
                  <input
                    autoFocus
                    value={modelQuery}
                    onChange={(e) => setModelQuery(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    placeholder={
                      orModels.length
                        ? `Search ${vendorLabel(activeVendor)} models…`
                        : "Loading models…"
                    }
                    className="h-8 w-full rounded-md border border-input bg-background px-2 text-xs focus-visible:outline-none"
                  />
                </div>
                {orModels.length === 0 ? (
                  <div className="flex h-80 items-start p-3 text-xs text-muted-foreground">
                    Loading models…
                  </div>
                ) : (
                  <div className="flex h-80">
                    {/* Left column — providers */}
                    <div className="w-44 shrink-0 overflow-y-auto border-r p-1">
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
                          <span className="ml-auto text-[10px] text-muted-foreground">
                            {list.length}
                          </span>
                        </button>
                      ))}
                    </div>
                    {/* Right column — models for active provider */}
                    <div className="flex-1 overflow-y-auto p-1">
                      {activeList.length === 0 ? (
                        <div className="p-2 text-xs text-muted-foreground">No matches</div>
                      ) : (
                        activeList.map((m) => (
                          <ModelRow key={m.id} m={m} onPick={() => selectModel(m.id)} />
                        ))
                      )}
                    </div>
                  </div>
                )}
                <div className="border-t p-1">
                  <DropdownMenuItem
                    onClick={() => {
                      setProvider("openrouter");
                      setCustomModel(true);
                      setModel("");
                    }}
                  >
                    Custom model id…
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          {/* Thinking — only for models that support it */}
          {canThink && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-7 items-center gap-1 rounded-md px-1.5 text-xs hover:bg-accent"
                  title="Thinking effort"
                >
                  <Brain className="h-3.5 w-3.5 opacity-70" />
                  <span className="text-muted-foreground">{thinkingLabel}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-40">
                <DropdownMenuRadioGroup value={reasoning} onValueChange={setReasoning}>
                  {THINKING_LEVELS.map((l) => (
                    <DropdownMenuRadioItem key={l.id} value={l.id}>
                      {l.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <div className="ml-auto flex items-center gap-2">
            {/* Agent mode */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex h-7 items-center gap-1 rounded-md border px-2 text-xs hover:bg-accent"
                  title="Agent mode"
                >
                  <Zap className="h-3.5 w-3.5 opacity-70" />
                  {agentLabel}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-52">
                <DropdownMenuRadioGroup
                  value={agentMode}
                  onValueChange={(v) => setAgentMode(v as "auto" | "semi" | "manual")}
                >
                  {AGENT_MODES.map((m) => (
                    <DropdownMenuRadioItem key={m.id} value={m.id}>
                      <span className="flex flex-col">
                        <span>{m.label}</span>
                        <span className="text-[10px] text-muted-foreground">{m.hint}</span>
                      </span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Send / Stop */}
            {sending ? (
              <Button
                size="icon"
                className="h-7 w-7 rounded"
                variant="secondary"
                onClick={onStop}
                title="Stop generating"
              >
                <Square className="h-3 w-3" />
              </Button>
            ) : (
              <Button
                size="icon"
                className="h-7 w-7 rounded transition-opacity disabled:opacity-40"
                onClick={onSend}
                disabled={!canSend}
                title="Send"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ModelRow({ m, onPick }: { m: OpenrouterModel; onPick: () => void }) {
  return (
    <DropdownMenuItem onClick={onPick} className="flex flex-col items-start gap-0.5">
      <span className="flex w-full items-center gap-1.5">
        <ProviderIcon model={m.id} className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span className="truncate text-xs">{shortName(m.name)}</span>
        {m.supports_reasoning && <Brain className="h-3 w-3 shrink-0 opacity-50" />}
      </span>
      <span className="pl-5 text-[10px] text-muted-foreground">
        {fmtCtx(m.context_length)} ctx · in {fmtPrice(m.prompt_price)} / out{" "}
        {fmtPrice(m.completion_price)} per 1M
      </span>
    </DropdownMenuItem>
  );
}

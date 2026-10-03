import { type ClipboardEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  type SlashItem,
  filterSlashItems,
  groupSlashItems,
  loadSlashItems,
  SLASH_GROUPS,
} from "@/lib/slash-items";
import { useRouter } from "@tanstack/react-router";
import { open } from "@tauri-apps/plugin-dialog";
import {
  ArrowUp,
  Brain,
  Check,
  ChevronDown,
  Coins,
  Paperclip,
  Square,
  X,
  Zap,
} from "lucide-react";
import { api, type OpenrouterModel } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProviderIcon } from "@/components/ProviderIcon";
import { ComposerPlusMenu } from "@/components/ComposerPlusMenu";
import { getModelRate, fmtUsd } from "@/components/SessionUsageCost";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface Attachment {
  name: string;
  content: string;
}

const TEXT_EXTS = ["md", "txt", "csv", "json", "yaml", "yml", "ts", "tsx", "js", "py", "rs"];

export interface ThinkingLevelOption {
  id: string;
  label: string;
  hint: string;
}

const EFFORT_METADATA: Record<string, { label: string; hint: string; order: number }> = {
  off: { label: "Off", hint: "Standard generation without thinking", order: 0 },
  none: { label: "Off", hint: "Standard generation without thinking", order: 0 },
  minimal: { label: "Minimal", hint: "Minimal reasoning effort", order: 1 },
  low: { label: "Low", hint: "Fast thoughts (low reasoning effort)", order: 2 },
  medium: { label: "Medium", hint: "Balanced reasoning effort", order: 3 },
  high: { label: "High", hint: "Deep multi-step reasoning", order: 4 },
  xhigh: { label: "Extra", hint: "Extended maximum reasoning effort", order: 5 },
  extra: { label: "Extra", hint: "Extended maximum reasoning effort", order: 5 },
  max: { label: "Max", hint: "Maximum reasoning effort", order: 6 },
};

export const OPENAI_THINKING_LEVELS: readonly ThinkingLevelOption[] = [
  { id: "off", label: "Off", hint: "Standard generation without thinking" },
  { id: "low", label: "Low", hint: "Fast thoughts (low reasoning effort)" },
  { id: "medium", label: "Medium", hint: "Balanced reasoning effort" },
  { id: "high", label: "High", hint: "Deep multi-step reasoning" },
];

export const GEMINI_THINKING_LEVELS: readonly ThinkingLevelOption[] = [
  { id: "off", label: "Off", hint: "Standard generation without thinking" },
  { id: "low", label: "Low", hint: "Fast thoughts (~2K token budget)" },
  { id: "medium", label: "Medium", hint: "Balanced reasoning (~4K token budget)" },
  { id: "high", label: "High", hint: "Deep reasoning (~16K token budget)" },
];

export const ANTHROPIC_THINKING_LEVELS: readonly ThinkingLevelOption[] = [
  { id: "off", label: "Off", hint: "Standard generation without thinking" },
  { id: "low", label: "Low", hint: "Fast thoughts (~2K token budget)" },
  { id: "medium", label: "Medium", hint: "Balanced reasoning (~4K token budget)" },
  { id: "high", label: "High", hint: "Deep reasoning (~16K token budget)" },
  { id: "max", label: "Max", hint: "Comprehensive thoughts (~32K token budget)" },
];

export const DEFAULT_REASONING_LEVELS: readonly ThinkingLevelOption[] = [
  { id: "off", label: "Off", hint: "Standard generation without reasoning" },
  { id: "low", label: "Low", hint: "Fast reasoning effort" },
  { id: "medium", label: "Medium", hint: "Balanced reasoning effort" },
  { id: "high", label: "High", hint: "Deep reasoning effort" },
];

export const THINKING_LEVELS = GEMINI_THINKING_LEVELS;

const AGENT_MODES = [
  { id: "auto", label: "Auto", hint: "Tools run without approval" },
  { id: "semi", label: "Semi-Auto", hint: "Approve risky tools" },
  { id: "manual", label: "Manual", hint: "Approve every tool" },
] as const;

function basename(path: string): string {
  return path.split(/[\\/]/).pop() ?? path;
}

// Determines if the current provider & model support extended thinking/reasoning
export function modelSupportsThinking(
  provider: string,
  model: string,
  orModel?: OpenrouterModel,
): boolean {
  if (orModel?.supports_reasoning) return true;

  const m = (model || "").toLowerCase();
  const p = (provider || "").toLowerCase();

  // OpenAI reasoning models (o1, o3, gpt-5)
  if (/gpt-5|^o1|^o3|o4|o1-|o3-/.test(m)) return true;

  // Google Gemini thinking models (Gemini 2.5 Flash/Pro, Gemini 3.8 Flash, etc.)
  if (
    m.includes("gemini") &&
    (m.includes("flash") || m.includes("pro") || m.includes("2.5") || m.includes("3.") || m.includes("thinking"))
  ) {
    return true;
  }

  // Anthropic Claude models with extended thinking (Claude 3.7 Sonnet, Claude Sonnet 4.5 / 5, Claude Opus 4)
  if (
    m.includes("claude") &&
    (m.includes("3-7") || m.includes("3.7") || m.includes("sonnet-4") || m.includes("sonnet-5") || m.includes("opus-4"))
  ) {
    return true;
  }

  // DeepSeek R1 & reasoning models (Qwen reasoning, QwQ, etc.)
  if (m.includes("r1") || m.includes("reason") || m.includes("think") || m.includes("qwq")) {
    return true;
  }

  // OpenRouter / Local cross-vendor reasoning patterns
  if (p === "openrouter" || p === "local") {
    if (m.includes("deepseek") || m.includes("r1") || m.includes("grok-3")) {
      return true;
    }
  }

  return false;
}

export function getThinkingLevelsForModel(
  provider: string,
  model: string,
  orModel?: OpenrouterModel,
): readonly ThinkingLevelOption[] {
  // 1. If OpenRouter model metadata is available with explicit supported_efforts:
  // This is the real ground truth from the OpenRouter API for this model.
  if (orModel?.reasoning?.supported_efforts && orModel.reasoning.supported_efforts.length > 0) {
    const efforts = orModel.reasoning.supported_efforts;
    const items: ThinkingLevelOption[] = [];

    // Only allow "Off" if reasoning is not strictly mandatory for this model
    if (!orModel.reasoning.mandatory && !efforts.some((e) => e === "none" || e === "off")) {
      items.push({ id: "off", label: "Off", hint: "Standard generation without thinking" });
    }

    // Sort according to effort intensity
    const sorted = [...efforts].sort((a, b) => {
      const ordA = EFFORT_METADATA[a.toLowerCase()]?.order ?? 99;
      const ordB = EFFORT_METADATA[b.toLowerCase()]?.order ?? 99;
      return ordA - ordB;
    });

    for (const eff of sorted) {
      const norm = eff.toLowerCase();
      if (norm === "none" || norm === "off") {
        if (!items.some((i) => i.id === "off")) {
          items.unshift({ id: "off", label: "Off", hint: "Standard generation without thinking" });
        }
        continue;
      }
      const meta = EFFORT_METADATA[norm];
      items.push({
        id: eff,
        label: meta ? meta.label : eff.charAt(0).toUpperCase() + eff.slice(1),
        hint: meta ? meta.hint : `${eff} reasoning effort`,
      });
    }

    return items;
  }

  // 2. If the model does not support thinking at all, return empty (hidden)
  if (!modelSupportsThinking(provider, model, orModel)) {
    return [];
  }

  const p = (provider || "").toLowerCase();
  const m = (model || "").toLowerCase();

  // Gemini models (Gemini 3.8 Flash, 2.5 Flash, 2.5 Pro) support low, medium, high
  if (p === "gemini" || p === "google" || m.startsWith("google/") || m.includes("gemini")) {
    return GEMINI_THINKING_LEVELS;
  }

  // OpenAI reasoning models only support low | medium | high
  if (p === "openai" || m.startsWith("openai/") || /gpt-5|^o1|^o3|o4|o1-|o3-/.test(m)) {
    return OPENAI_THINKING_LEVELS;
  }

  // Anthropic Claude models with extended thinking
  if (p === "anthropic" || m.startsWith("anthropic/") || m.includes("claude")) {
    return ANTHROPIC_THINKING_LEVELS;
  }

  return DEFAULT_REASONING_LEVELS;
}

export function fmtCtx(n: number): string {
  if (!n) return "";
  return n >= 1000 ? `${Math.round(n / 1000)}K` : `${n}`;
}

export function fmtPrice(p: number): string {
  return `$${(p * 1e6).toFixed(2)}`;
}

export function fmtRate(v: number): string {
  if (v <= 0) return "$0";
  if (v < 0.01) return `$${v.toFixed(3)}`;
  if (v < 1) return `$${v.toFixed(2)}`;
  return v % 1 === 0 ? `$${v}` : `$${v.toFixed(2)}`;
}

// Provider tabs surfaced in the model selector, in this order.
export const ALLOWED_VENDORS = ["google", "openrouter", "anthropic", "openai"];

// Hide stale models from the per-provider tabs (OpenRouter tab is exempt).
export const MAX_MODEL_AGE_DAYS = 365;

// The "OpenRouter" tab is a curated cross-vendor flagship shortlist (incl. Grok,
// Kimi, GLM) rather than the raw openrouter/* utility models.
export const FLAGSHIP_PATTERNS = [
  "gemini-3.8-flash",
  "gemini-2.5-flash",
  "gemini-2.5-pro",
  "claude-opus-4",
  "claude-sonnet-4",
  "gpt-5",
  "openai/o3",
  "x-ai/grok",
  "moonshotai/kimi",
  "z-ai/glm",
];

export const VENDOR_LABELS: Record<string, string> = {
  google: "Gemini",
  openrouter: "OpenRouter",
  anthropic: "Anthropic",
  openai: "OpenAI",
};

export function providerDisplayName(provider: string): string {
  const p = (provider || "").toLowerCase();
  switch (p) {
    case "gemini":
    case "google":
      return "Gemini";
    case "openrouter":
      return "OpenRouter";
    case "anthropic":
    case "claude":
      return "Anthropic";
    case "openai":
      return "OpenAI";
    case "local":
    case "ollama":
      return "Local";
    default:
      return provider ? provider.charAt(0).toUpperCase() + provider.slice(1) : "AI";
  }
}

export function vendorFromProviderOrModel(provider: string, model: string): string {
  const p = (provider || "").toLowerCase();
  if (p === "gemini" || p === "google") return "google";
  if (p === "openrouter") return "openrouter";
  if (p === "anthropic" || p === "claude") return "anthropic";
  if (p === "openai") return "openai";

  const m = (model || "").toLowerCase();
  if (m.includes("gemini")) return "google";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gpt") || m.includes("o1") || m.includes("o3")) return "openai";
  if (m.includes("/")) {
    const v = m.split("/")[0];
    if (ALLOWED_VENDORS.includes(v)) return v;
  }
  return "google";
}

export function vendorOf(id: string): string {
  if (id.includes("/")) return id.split("/")[0];
  const m = id.toLowerCase();
  if (m.includes("gemini")) return "google";
  if (m.includes("claude")) return "anthropic";
  if (m.includes("gpt") || m.startsWith("o1") || m.startsWith("o3")) return "openai";
  return "other";
}

// Map a model's OpenRouter vendor to the app provider that should serve it
// natively. Vendors we don't support first-party (x-ai, moonshotai, z-ai, meta…)
// route through OpenRouter. The backend strips the `vendor/` prefix for native
// providers before calling their API.
export function providerOfModel(id: string): string {
  switch (vendorOf(id)) {
    case "anthropic":
      return "anthropic";
    case "openai":
      return "openai";
    case "google":
      return "gemini";
    default:
      return "openrouter";
  }
}

export function vendorLabel(v: string): string {
  return VENDOR_LABELS[v] ?? v.charAt(0).toUpperCase() + v.slice(1);
}

// OR model names are "Vendor: Model" — drop the redundant vendor prefix.
export function shortName(name: string): string {
  return name.includes(": ") ? name.split(": ").slice(1).join(": ") : name;
}

export function formatModelDisplay(modelId: string, orModel?: OpenrouterModel): string {
  if (orModel) return shortName(orModel.name);
  if (!modelId) return "select model";
  if (modelId === "gemini-3.8-flash" || modelId === "google/gemini-3.8-flash") return "Gemini 3.8 Flash";
  if (modelId === "gemini-2.5-flash" || modelId === "google/gemini-2.5-flash") return "Gemini 2.5 Flash";
  if (modelId === "gemini-2.5-pro" || modelId === "google/gemini-2.5-pro") return "Gemini 2.5 Pro";
  if (modelId === "claude-sonnet-4-5" || modelId === "anthropic/claude-sonnet-4.5") return "Claude Sonnet 5 / 4.5";
  if (modelId === "claude-3-5-sonnet-latest") return "Claude 3.5 Sonnet";
  if (modelId === "claude-opus-4-1" || modelId === "anthropic/claude-opus-4.1") return "Claude Opus";
  if (modelId === "gpt-5" || modelId === "openai/gpt-5") return "GPT-5";
  if (modelId === "gpt-4o" || modelId === "openai/gpt-4o") return "GPT-4o";
  return modelId.includes("/") ? modelId.split("/")[1] : modelId;
}

interface ChatComposerProps {
  workspaceId: number;
  projectId: string | null;
  orgId: string | null;
  userId: string | null;
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
  sessionCost?: number;
  onOpenUsageCost?: () => void;
}

export function ChatComposer({
  workspaceId,
  projectId,
  orgId,
  userId,
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
  sessionCost,
  onOpenUsageCost,
}: ChatComposerProps) {
  const router = useRouter();
  const [customModel, setCustomModel] = useState(false);
  const [orModels, setOrModels] = useState<OpenrouterModel[]>([]);
  const [modelQuery, setModelQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeVendor, setActiveVendor] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);

  const currentOrModel = useMemo(() => {
    return orModels.find(
      (m) => m.id === model || m.id.endsWith(`/${model}`) || model.endsWith(`/${m.id}`),
    );
  }, [orModels, model]);

  const rates = useMemo(() => {
    if (currentOrModel && (currentOrModel.prompt_price > 0 || currentOrModel.completion_price > 0)) {
      return {
        prompt: currentOrModel.prompt_price * 1e6,
        completion: currentOrModel.completion_price * 1e6,
      };
    }
    const fallback = getModelRate(model, provider);
    return { prompt: fallback.promptPer1M, completion: fallback.completionPer1M };
  }, [currentOrModel, model, provider]);

  // Slash autocomplete state
  const [slashItems, setSlashItems] = useState<SlashItem[]>([]);
  const [slashOpen, setSlashOpen] = useState(false);
  const [slashSelected, setSlashSelected] = useState(0);
  const [slashToken, setSlashToken] = useState(""); // the /word being typed
  const slashLoadedRef = useRef(false);

  const ensureSlashItems = () => {
    if (slashLoadedRef.current) return;
    slashLoadedRef.current = true;
    loadSlashItems(workspaceId)
      .then(setSlashItems)
      .catch(() => setSlashItems([]));
  };

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

  const orModel = useMemo(() => {
    if (!model) return undefined;
    const target = model.toLowerCase();
    return (
      orModels.find((m) => m.id === model) ||
      orModels.find((m) => m.id.toLowerCase() === target) ||
      orModels.find((m) => m.id.toLowerCase() === `${provider}/${target}`.toLowerCase()) ||
      orModels.find((m) => m.id.toLowerCase().endsWith(`/${target}`)) ||
      orModels.find((m) => target.endsWith(`/${m.id.toLowerCase()}`))
    );
  }, [orModels, model, provider]);
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
        if (flagship.length) {
          out.push(["openrouter", flagship]);
        } else {
          out.push([
            "openrouter",
            [
              { id: "google/gemini-3.8-flash", name: "Google: Gemini 3.8 Flash", context_length: 1000000, prompt_price: 0.15e-6, completion_price: 0.6e-6, supports_reasoning: true, created: Date.now() / 1000 },
              { id: "anthropic/claude-sonnet-4.5", name: "Anthropic: Claude Sonnet 5 / 4.5", context_length: 200000, prompt_price: 3e-6, completion_price: 15e-6, supports_reasoning: true, created: Date.now() / 1000 },
              { id: "openai/gpt-5", name: "OpenAI: GPT-5", context_length: 128000, prompt_price: 2.5e-6, completion_price: 10e-6, supports_reasoning: true, created: Date.now() / 1000 },
            ],
          ]);
        }
      } else if (byVendor.has(v) && byVendor.get(v)!.length > 0) {
        out.push([v, byVendor.get(v)!.sort(byCreatedDesc)]);
      } else if (v === "google") {
        out.push([
          "google",
          [
            { id: "gemini-3.8-flash", name: "Google: Gemini 3.8 Flash", context_length: 1000000, prompt_price: 0.15e-6, completion_price: 0.6e-6, supports_reasoning: true, created: Date.now() / 1000 },
            { id: "gemini-2.5-flash", name: "Google: Gemini 2.5 Flash", context_length: 1000000, prompt_price: 0.15e-6, completion_price: 0.6e-6, supports_reasoning: false, created: Date.now() / 1000 },
            { id: "gemini-2.5-pro", name: "Google: Gemini 2.5 Pro", context_length: 1000000, prompt_price: 1.25e-6, completion_price: 5e-6, supports_reasoning: true, created: Date.now() / 1000 },
          ],
        ]);
      } else if (v === "anthropic") {
        out.push([
          "anthropic",
          [
            { id: "claude-sonnet-4-5", name: "Anthropic: Claude Sonnet 5 / 4.5", context_length: 200000, prompt_price: 3e-6, completion_price: 15e-6, supports_reasoning: true, created: Date.now() / 1000 },
            { id: "claude-3-5-sonnet-latest", name: "Anthropic: Claude 3.5 Sonnet", context_length: 200000, prompt_price: 3e-6, completion_price: 15e-6, supports_reasoning: false, created: Date.now() / 1000 },
            { id: "claude-opus-4-1", name: "Anthropic: Claude Opus", context_length: 200000, prompt_price: 15e-6, completion_price: 75e-6, supports_reasoning: true, created: Date.now() / 1000 },
          ],
        ]);
      } else if (v === "openai") {
        out.push([
          "openai",
          [
            { id: "gpt-5", name: "OpenAI: GPT-5", context_length: 128000, prompt_price: 2.5e-6, completion_price: 10e-6, supports_reasoning: true, created: Date.now() / 1000 },
            { id: "gpt-4o", name: "OpenAI: GPT-4o", context_length: 128000, prompt_price: 2.5e-6, completion_price: 10e-6, supports_reasoning: false, created: Date.now() / 1000 },
            { id: "o3", name: "OpenAI: o3", context_length: 200000, prompt_price: 10e-6, completion_price: 40e-6, supports_reasoning: true, created: Date.now() / 1000 },
          ],
        ]);
      }
    }
    return out;
  }, [orModels]);

  const modelLabel = formatModelDisplay(model, orModel);
  const baseList =
    vendorGroups.find(([v]) => v === activeVendor)?.[1] ?? vendorGroups[0]?.[1] ?? [];
  // Search is scoped to the currently selected provider.
  const q = modelQuery.toLowerCase();
  const activeList = q
    ? baseList.filter((m) => m.id.toLowerCase().includes(q) || m.name.toLowerCase().includes(q))
    : baseList;
  const goSettings = () => router.navigate({ to: "/settings" });
  const goSettingsTo = (_tab: "account" | "org" | "project", section: string) =>
    router.navigate({ to: "/customize", search: { ws: workspaceId, tab: section.toLowerCase() } });
  const selectModel = (id: string) => {
    const resolvedProvider =
      activeVendor === "openrouter"
        ? "openrouter"
        : activeVendor === "google"
          ? "gemini"
          : activeVendor === "anthropic"
            ? "anthropic"
            : activeVendor === "openai"
              ? "openai"
              : providerOfModel(id);
    setProvider(resolvedProvider);
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

  const thinkingLevels = useMemo(
    () => getThinkingLevelsForModel(provider, model, orModel),
    [provider, model, orModel],
  );
  const canThink = thinkingLevels.length > 0;
  const activeThinkingItem = thinkingLevels.find((l) => l.id === reasoning);
  const thinkingLabel = activeThinkingItem
    ? activeThinkingItem.label
    : reasoning === "off"
      ? "Off"
      : reasoning;
  const isThinkingActive = canThink && reasoning !== "off";
  const agentLabel = AGENT_MODES.find((m) => m.id === agentMode)?.label ?? "Auto";
  const canSend = input.trim().length > 0 || attachments.length > 0;

  // Keep reasoning aligned with the active model's capabilities & requirements
  useEffect(() => {
    if (thinkingLevels.length === 0) return;
    if (orModel?.reasoning?.mandatory && reasoning === "off") {
      const defaultEffort =
        orModel.reasoning.default_effort ||
        thinkingLevels.find((l) => l.id !== "off")?.id ||
        "medium";
      setReasoning(defaultEffort);
    } else if (reasoning !== "off" && !thinkingLevels.some((l) => l.id === reasoning)) {
      const fallback =
        orModel?.reasoning?.default_effort ||
        thinkingLevels.find((l) => l.id !== "off")?.id ||
        "medium";
      setReasoning(fallback);
    }
  }, [orModel, thinkingLevels, reasoning, setReasoning]);

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

        {/* Slash-token autocomplete dropdown — rendered above the textarea */}
        {slashOpen && filterSlashItems(slashItems, slashToken).length > 0 && (() => {
          const filtered = filterSlashItems(slashItems, slashToken);
          const grouped = groupSlashItems(filtered);
          // Track which group names are present in this filtered view
          const presentGroups = new Set(grouped.map(([g]) => g));

          const insertToken = (item: SlashItem) => {
            // Replace the current /token word in the input with the selected value.
            const pos = taRef.current?.selectionStart ?? input.length;
            const before = input.slice(0, pos);
            // Find start of the /word being typed.
            const tokenStart = before.lastIndexOf(slashToken);
            const after = input.slice(pos);
            const newInput =
              tokenStart >= 0
                ? input.slice(0, tokenStart) + item.value + " " + after.trimStart()
                : input + item.value + " ";
            setInput(newInput);
            setSlashOpen(false);
            setSlashToken("");
            setSlashSelected(0);
            // If it's a command, expand its content and send.
            if (item.source === "command") {
              api
                .readCommand(workspaceId, item.value)
                .then((body) => {
                  setInput(body.trim() + " ");
                })
                .catch(() => {
                  // fallback: leave the slash token in place.
                });
            }
            setTimeout(() => taRef.current?.focus(), 0);
          };

          return (
            <div className="relative mx-3.5 mb-1">
              <div
                id="slash-dropdown"
                className="absolute bottom-0 left-0 right-0 z-50 flex max-h-80 flex-col overflow-hidden rounded-md border bg-popover shadow-lg"
              >
                {/* Anchor nav — fixed at top, links to each visible group */}
                <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border/50 bg-muted/40 px-2 py-1">
                  {SLASH_GROUPS.filter((g) => presentGroups.has(g)).map((g) => (
                    <a
                      key={g}
                      href={`#slash-group-${g.toLowerCase()}`}
                      className="shrink-0 rounded px-2 py-0.5 text-[10px] font-semibold tracking-wide text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-accent-foreground"
                      style={{ textDecoration: "none" }}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(`slash-group-${g.toLowerCase()}`)?.scrollIntoView({ block: "start", behavior: "smooth" });
                      }}
                    >
                      /{g.toLowerCase()}
                    </a>
                  ))}
                </div>

                {/* Scrollable list */}
                <div className="overflow-y-auto">
                  {grouped.map(([group, items]) => {
                    const groupStartIdx = filtered.indexOf(items[0]);
                    return (
                      <div key={group} id={`slash-group-${group.toLowerCase()}`}>
                        <div className="border-b border-border/50 bg-muted/30 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          {group}
                        </div>
                        {items.map((item, localIdx) => {
                          const globalIdx = groupStartIdx + localIdx;
                          return (
                            <button
                              key={item.value}
                              className={`flex w-full items-baseline gap-3 px-3 py-1.5 text-left ${
                                globalIdx === slashSelected
                                  ? "bg-accent text-accent-foreground"
                                  : "text-popover-foreground hover:bg-accent/50"
                              }`}
                              onMouseEnter={() => setSlashSelected(globalIdx)}
                              onMouseDown={(e) => {
                                e.preventDefault();
                                insertToken(item);
                              }}
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
            </div>
          );
        })()}

        <textarea
          ref={taRef}
          value={input}
          onChange={(e) => {
            const next = e.target.value;
            setInput(next);
            // Detect if the cursor is inside a /word token.
            const pos = e.target.selectionStart ?? next.length;
            const before = next.slice(0, pos);
            // Extract the current word up to cursor.
            const match = before.match(/(?:^|\s)(\/.*)$/);
            if (match) {
              const token = match[1];
              setSlashToken(token);
              setSlashOpen(true);
              setSlashSelected(0);
              ensureSlashItems();
            } else {
              setSlashOpen(false);
              setSlashToken("");
            }
          }}
          onKeyDown={(e) => {
            // Handle slash autocomplete navigation first.
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
                  // Inline reuse of insertToken logic.
                  const pos = taRef.current?.selectionStart ?? input.length;
                  const before = input.slice(0, pos);
                  const tokenStart = before.lastIndexOf(slashToken);
                  const after = input.slice(pos);
                  const newInput =
                    tokenStart >= 0
                      ? input.slice(0, tokenStart) + item.value + " " + after.trimStart()
                      : input + item.value + " ";
                  setInput(newInput);
                  setSlashOpen(false);
                  setSlashToken("");
                  setSlashSelected(0);
                  if (item.source === "command") {
                    api
                      .readCommand(workspaceId, item.value)
                      .then((body) => setInput(body.trim() + " "))
                      .catch(() => {});
                  }
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
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          onPaste={onPaste}
          rows={4}
          placeholder="Ask anything or type / for commands & resources…"
          style={{ lineHeight: "20px" }}
          className="resize-none overflow-y-auto bg-transparent px-3.5 py-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none"
          spellCheck={false}
        />

        {/* Bottom control bar */}
        <div className="flex items-center gap-1 px-2 pb-2">
          {/* + menu — self-contained reusable component */}
          <ComposerPlusMenu
            workspaceId={workspaceId}
            projectId={projectId}
            orgId={orgId}
            userId={userId}
            toolMode={toolMode}
            setToolMode={setToolMode}
            onInsert={insert}
            onPickFiles={pickFiles}
            onGoSettings={goSettings}
            onGoSettingsTo={goSettingsTo}
            onGoAgents={() => router.navigate({ to: "/agents" })}
          />

          {/* Price / Usage Cost Chip — currency icon [$₹E] placed before model chip */}
          <button
            type="button"
            onClick={onOpenUsageCost}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-md border border-border/70 bg-card/60 transition-colors shadow-2xs hover:bg-accent hover:border-border cursor-pointer shrink-0",
              sessionCost && sessionCost > 0
                ? "text-emerald-500 dark:text-emerald-400 border-emerald-500/30"
                : "text-muted-foreground hover:text-foreground",
            )}
            title={
              sessionCost && sessionCost > 0
                ? `Session Spend: ${fmtUsd(sessionCost)} | Rates: ${fmtRate(rates.prompt)} in / ${fmtRate(rates.completion)} out per 1M. Click to view full usage & cost breakdown.`
                : `Model Rates: ${fmtRate(rates.prompt)} in / ${fmtRate(rates.completion)} out per 1M. Click to view session usage & cost.`
            }
          >
            <Coins className="h-3.5 w-3.5 opacity-85" />
          </button>

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
                  setActiveVendor(vendorFromProviderOrModel(provider, model));
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex h-7 max-w-[320px] items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2 text-xs font-medium text-foreground hover:bg-accent hover:border-border transition-colors shadow-2xs"
                  title={`Provider: ${providerDisplayName(provider)} | Model: ${modelLabel}`}
                >
                  {/* Left end: Provider icon + provider name */}
                  <ProviderIcon provider={provider} className="h-3.5 w-3.5 shrink-0 opacity-90" />
                  <span className="font-semibold text-foreground/90 shrink-0">
                    {providerDisplayName(provider)}
                  </span>
                  <span className="text-muted-foreground/40 font-mono text-[10px]">/</span>
                  {/* After / : Model icon (shaded-greyed like model text) + model name */}
                  <ProviderIcon model={model} className="h-3.5 w-3.5 shrink-0 opacity-40 grayscale" />
                  <span className="truncate text-muted-foreground font-mono text-[11px]">
                    {modelLabel}
                  </span>
                  <ChevronDown className="h-3 w-3 shrink-0 opacity-40 ml-0.5" />
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
                          <ModelRow
                            key={m.id}
                            m={m}
                            selected={m.id === model}
                            onPick={() => selectModel(m.id)}
                          />
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

          {/* Thinking option — dynamically adapts to provider and model availability; completely hidden if unsupported */}
          {canThink && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    "flex h-7 items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2 text-xs font-medium transition-colors shadow-2xs hover:bg-accent hover:border-border",
                    isThinkingActive ? "text-foreground font-semibold" : "text-muted-foreground",
                  )}
                  title={`Thinking effort: ${thinkingLabel} (Supported on ${modelLabel})`}
                >
                  <Brain
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 transition-opacity",
                      isThinkingActive ? "opacity-85 text-foreground" : "opacity-45 text-muted-foreground",
                    )}
                  />
                  <span>{isThinkingActive ? thinkingLabel.replace(/^Thinking:\s*/i, "") : "Off"}</span>
                  <ChevronDown className="h-2.5 w-2.5 opacity-40 ml-0.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-56 p-1">
                <div className="px-2 py-1.5 border-b border-border/50 mb-1">
                  <p className="text-xs font-semibold text-foreground">Thinking Effort</p>
                  <p className="text-[10px] text-muted-foreground">
                    Available for {modelLabel} ({providerDisplayName(provider)})
                  </p>
                </div>
                <DropdownMenuRadioGroup value={reasoning} onValueChange={setReasoning}>
                  {thinkingLevels.map((l) => (
                    <DropdownMenuRadioItem key={l.id} value={l.id} className="cursor-pointer py-1.5">
                      <span className="flex flex-col">
                        <span className="font-medium text-xs text-foreground">{l.label}</span>
                        <span className="text-[10px] text-muted-foreground">{l.hint}</span>
                      </span>
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

function ModelRow({
  m,
  selected,
  onPick,
}: {
  m: OpenrouterModel;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <DropdownMenuItem
      onClick={onPick}
      className={`flex flex-col items-start gap-0.5 ${selected ? "bg-accent" : ""}`}
    >
      <span className="flex w-full items-center gap-1.5">
        <ProviderIcon model={m.id} className="h-3.5 w-3.5 shrink-0 opacity-60" />
        <span className="truncate text-xs">{shortName(m.name)}</span>
        {m.supports_reasoning && <Brain className="h-3 w-3 shrink-0 opacity-50" />}
        {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 opacity-70" />}
      </span>
      <span className="pl-5 text-[10px] text-muted-foreground">
        {fmtCtx(m.context_length)} ctx · in {fmtPrice(m.prompt_price)} / out{" "}
        {fmtPrice(m.completion_price)} per 1M
      </span>
    </DropdownMenuItem>
  );
}

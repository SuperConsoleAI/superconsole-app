import { getOpenRouterPricing, getActiveCliModels, setCliActiveModel, type OpenRouterPriceInfo, type CliModelStatus } from "./ipc";

export interface AgentModelOption {
  id: string;
  name: string;
  provider: string; // Brand logo key: "gemini" | "claude" | "openai" | "deepseek" | "meta" | "qwen" | "anthropic" | "openrouter"
  price?: string;
  badge?: string;
}

export const AGENT_PROVIDER_OPTIONS: { id: string; name: string; isCli?: boolean }[] = [
  { id: "openrouter", name: "OpenRouter" },
  { id: "gemini", name: "Gemini" },
  { id: "anthropic", name: "Anthropic" },
  { id: "openai", name: "OpenAI" },
  { id: "cli_claude", name: "Claude Code (CLI)", isCli: true },
  { id: "cli_antigravity", name: "Antigravity (CLI)", isCli: true },
  { id: "cli_codex", name: "Codex (CLI)", isCli: true },
  { id: "groq", name: "Groq" },
  { id: "deepseek", name: "DeepSeek" },
  { id: "mistral", name: "Mistral" },
  { id: "xai", name: "SpaceXAI (Grok)" },
];

export const AGENT_MODEL_OPTIONS: Record<string, AgentModelOption[]> = {
  cli_claude: [
    { id: "cli:claude:claude-5-sonnet", name: "Claude Sonnet 5", provider: "claude", price: "$2.00 / $10.00", badge: "Default" },
    { id: "cli:claude:claude-haiku-4-5", name: "Claude Haiku 4.5", provider: "claude", price: "$1.00 / $5.00", badge: "Fast" },
    { id: "cli:claude:claude-opus-4-8", name: "Claude Opus 4.8", provider: "claude", price: "$15.00 / $75.00", badge: "Flagship" },
    { id: "cli:claude:claude-5-1-fable", name: "Claude Fable 5.1", provider: "claude", price: "$10.00 / $50.00", badge: "Hardest Tasks" },
    { id: "cli:claude:claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "claude", price: "$3.00 / $15.00" },
    { id: "cli:claude:claude-sonnet-4-6-1m", name: "Claude Sonnet 4.6 (1M context)", provider: "claude", price: "$3.00 / $15.00", badge: "1M Context" },
  ],
  cli_antigravity: [
    { id: "cli:antigravity:gemini-3.7-flash", name: "Gemini 3.7 Flash", provider: "gemini", price: "$0.50 / $3.00", badge: "Default" },
    { id: "cli:antigravity:gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini", price: "$0.75 / $3.75", badge: "Fast" },
    { id: "cli:antigravity:gemini-3.6-flash", name: "Gemini 3.6 Flash", provider: "gemini", price: "$0.30 / $2.50", badge: "Cheapest" },
    { id: "cli:antigravity:gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "gemini", price: "$1.25 / $10.00", badge: "Pro" },
    { id: "cli:antigravity:gpt-oss-120b-medium", name: "GPT-OSS 120B", provider: "openai", price: "$0.15 / $0.60", badge: "Open Source" },
    { id: "cli:antigravity:claude-sonnet-4-6", name: "Claude Sonnet 4.6", provider: "claude", price: "$3.00 / $15.00" },
    { id: "cli:antigravity:claude-opus-4-6-thinking", name: "Claude Opus 4.6", provider: "claude", price: "$15.00 / $75.00" },
  ],
  cli_codex: [
    { id: "cli:codex:gpt-5.6-luna", name: "GPT-5.6 Luna", provider: "openai", price: "$0.40 / $1.60", badge: "Default" },
    { id: "cli:codex:gpt-5.6-terra", name: "GPT-5.6 Terra", provider: "openai", price: "$2.00 / $8.00", badge: "Flagship" },
    { id: "cli:codex:gpt-5.5", name: "GPT-5.5", provider: "openai", price: "$1.50 / $6.00" },
  ],
  openrouter: [
    { id: "google/gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", provider: "gemini", price: "$0.25 / $1.50", badge: "Default" },
    { id: "google/gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", provider: "gemini", price: "$0.30 / $2.50" },
    { id: "anthropic/claude-5-sonnet", name: "Claude Sonnet 5", provider: "claude", price: "$2.00 / $10.00" },
    { id: "anthropic/claude-4-6-sonnet", name: "Claude Sonnet 4.6", provider: "claude", price: "$3.00 / $15.00" },
    { id: "anthropic/claude-5-opus", name: "Claude Opus 5", provider: "claude", price: "$5.00 / $25.00" },
    { id: "anthropic/claude-4-8-opus", name: "Claude Opus 4.8", provider: "claude", price: "$15.00 / $75.00" },
    { id: "anthropic/claude-5-fable", name: "Claude Fable 5", provider: "claude", price: "$10.00 / $50.00" },
    { id: "anthropic/claude-4-5-haiku", name: "Claude Haiku 4.5", provider: "claude", price: "$1.00 / $5.00" },
    { id: "openai/gpt-4o", name: "GPT-4o", provider: "openai", price: "$2.50 / $10.00" },
    { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", provider: "gemini", price: "$1.25 / $10.00" },
    { id: "mistralai/mistral-small-4", name: "Mistral Small 4", provider: "mistral", price: "$0.10 / $0.30" },
    { id: "mistralai/mistral-large-2512", name: "Mistral Large 2512", provider: "mistral", price: "$2.00 / $6.00" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1", provider: "deepseek", price: "$0.70 / $2.50" },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", provider: "meta", price: "$0.10 / $0.32" },
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", provider: "qwen", price: "$0.36 / $0.40" },
  ],
  gemini: [
    { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", provider: "gemini", price: "$0.25 / $1.50", badge: "Default" },
    { id: "gemini-3.1-flash", name: "Gemini 3.1 Flash", provider: "gemini", price: "$0.50 / $3.00" },
    { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", provider: "gemini", price: "$1.25 / $10.00" },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", provider: "gemini", price: "$0.50 / $3.00" },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", provider: "gemini", price: "$0.30 / $2.50" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", provider: "gemini", price: "$0.75 / $3.75" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", provider: "gemini", price: "$0.30 / $2.50" },
  ],
  anthropic: [
    { id: "claude-5-sonnet", name: "Claude Sonnet 5", provider: "claude", price: "$2.00 / $10.00", badge: "Default" },
    { id: "claude-4-6-sonnet", name: "Claude Sonnet 4.6", provider: "claude", price: "$3.00 / $15.00" },
    { id: "claude-5-opus", name: "Claude Opus 5", provider: "claude", price: "$5.00 / $25.00" },
    { id: "claude-4-8-opus", name: "Claude Opus 4.8", provider: "claude", price: "$15.00 / $75.00" },
    { id: "claude-5-fable", name: "Claude Fable 5", provider: "claude", price: "$10.00 / $50.00" },
    { id: "claude-4-5-haiku", name: "Claude Haiku 4.5", provider: "claude", price: "$1.00 / $5.00" },
  ],
  openai: [
    { id: "gpt-5.4-nano", name: "GPT-5.4 Nano", provider: "openai", price: "$0.05 / $0.20", badge: "Default" },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", provider: "openai", price: "$0.15 / $0.60" },
    { id: "gpt-4o", name: "GPT-4o", provider: "openai", price: "$2.50 / $10.00" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", provider: "openai", price: "$0.15 / $0.60" },
    { id: "o3-mini", name: "o3-mini", provider: "openai", price: "$1.10 / $4.40" },
  ],
  groq: [
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", provider: "openai", price: "$0.15 / $0.60", badge: "Default" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", provider: "openai", price: "$0.05 / $0.20", badge: "Fast" },
    { id: "groq/compound", name: "Groq Compound", provider: "groq", price: "$0.50 / $1.50", badge: "Compound" },
    { id: "groq/compound-mini", name: "Groq Compound Mini", provider: "groq", price: "$0.15 / $0.50", badge: "Mini" },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek V3", provider: "deepseek", price: "$0.14 / $0.28", badge: "Default" },
    { id: "deepseek-reasoner", name: "DeepSeek R1", provider: "deepseek", price: "$0.55 / $2.19", badge: "Reasoning" },
  ],
  mistral: [
    { id: "mistralai/mistral-small-4", name: "Mistral Small 4", provider: "mistral", price: "$0.10 / $0.30", badge: "Default" },
    { id: "mistralai/mistral-medium-3.5", name: "Mistral Medium 3.5", provider: "mistral", price: "$0.40 / $1.20", badge: "Balanced" },
    { id: "mistralai/mistral-small-3.1-24b-instruct", name: "Mistral Small 3.1 24B", provider: "mistral", price: "$0.15 / $0.45", badge: "Instruct" },
    { id: "mistralai/mistral-nemo", name: "Mistral Nemo", provider: "mistral", price: "$0.15 / $0.15", badge: "Fast" },
    { id: "mistralai/mistral-large-2512", name: "Mistral Large 2512", provider: "mistral", price: "$2.00 / $6.00", badge: "Flagship" },
    { id: "codestral-latest", name: "Codestral", provider: "mistral", price: "$0.30 / $0.90", badge: "Coding" },
  ],
  xai: [
    { id: "grok-4.3", name: "Grok 4.3", provider: "xai", price: "$1.50 / $7.50", badge: "Default" },
    { id: "grok-4.5", name: "Grok 4.5", provider: "xai", price: "$2.00 / $10.00", badge: "Reasoning" },
    { id: "grok-4.6", name: "Grok 4.6", provider: "xai", price: "$2.50 / $12.50", badge: "Flagship" },
    { id: "grok-2-latest", name: "Grok 2", provider: "xai", price: "$2.00 / $10.00", badge: "Stable" },
    { id: "grok-2-vision-1212", name: "Grok 2 Vision", provider: "xai", price: "$2.00 / $10.00" },
  ],
};

let livePricingCache: Record<string, OpenRouterPriceInfo> | null = null;

export async function fetchAndApplyLivePricing(): Promise<Record<string, OpenRouterPriceInfo> | null> {
  if (livePricingCache) return livePricingCache;
  try {
    const pricing = await getOpenRouterPricing();
    if (pricing && typeof pricing === "object") {
      livePricingCache = pricing;
      for (const list of Object.values(AGENT_MODEL_OPTIONS)) {
        for (const m of list) {
          const rawId = m.id.includes(":") ? m.id.split(":").pop()! : m.id;
          const live = pricing[m.id] ||
            pricing[rawId] ||
            pricing[`google/${rawId}`] ||
            pricing[`anthropic/${rawId}`] ||
            pricing[`openai/${rawId}`] ||
            pricing[`deepseek/${rawId}`] ||
            pricing[`groq/${rawId}`] ||
            pricing[`mistral/${rawId}`] ||
            pricing[`xai/${rawId}`] ||
            pricing[`meta-llama/${rawId}`] ||
            pricing[rawId.replace("claude-5-sonnet", "anthropic/claude-sonnet-5")] ||
            pricing[rawId.replace("claude-4-6-sonnet", "anthropic/claude-sonnet-4.6")] ||
            pricing[rawId.replace("claude-5-opus", "anthropic/claude-opus-5")] ||
            pricing[rawId.replace("claude-4-6-opus", "anthropic/claude-opus-4.6")] ||
            pricing[rawId.replace("claude-5-fable", "anthropic/claude-fable-5.1")] ||
            pricing[rawId.replace("claude-4-5-haiku", "anthropic/claude-haiku-4.5")];
          if (live && live.formatted) {
            m.price = live.formatted;
          }
        }
      }
      return pricing;
    }
  } catch (err) {
    console.warn("Could not fetch live OpenRouter model pricing:", err);
  }
  return null;
}

let liveCliStatusCache: Record<string, CliModelStatus> | null = null;

export function getCachedCliStatus(): Record<string, CliModelStatus> | null {
  return liveCliStatusCache;
}

export function setCachedCliStatus(status: Record<string, CliModelStatus>) {
  liveCliStatusCache = status;
}

export async function fetchAndSyncActiveCliModels(): Promise<Record<string, CliModelStatus> | null> {
  try {
    const statuses = await getActiveCliModels();
    if (statuses && typeof statuses === "object") {
      liveCliStatusCache = statuses;
      for (const [providerKey, status] of Object.entries(statuses)) {
        const list = AGENT_MODEL_OPTIONS[providerKey];
        if (list) {
          // If the model is not in the list, dynamically add it
          const exists = list.some((m) => m.id === status.model_id);
          if (!exists && status.model_id && status.active_model) {
            list.unshift({
              id: status.model_id,
              name: status.active_model,
              provider: providerKey === "cli_claude" ? "claude" : providerKey === "cli_antigravity" ? "gemini" : "openai",
            });
          }
        }
      }
      return statuses;
    }
  } catch (err) {
    console.debug("Could not fetch active CLI models:", err);
  }
  return null;
}

export interface ModelReasoningConfig {
  supportsReasoning: boolean;
  supportedTiers: ("low" | "medium" | "high" | "extra" | "max")[];
  defaultTier: "low" | "medium" | "high" | "extra" | "max";
  type: "budget" | "effort" | "toggle" | "native" | "none";
  note?: string;
}

export function getModelReasoningConfig(modelId: string, provider?: string): ModelReasoningConfig {
  const p = (provider || findProviderForModel(modelId) || "").toLowerCase();
  const mid = (modelId || "").toLowerCase();

  // 1. Antigravity CLI Family (Gemini Flash/Pro, Claude, GPT-OSS)
  if (p === "cli_antigravity" || mid.startsWith("cli:antigravity")) {
    if (
      mid.includes("claude-sonnet-4-6") ||
      mid.includes("claude-opus-4-6") ||
      mid.includes("gpt-oss")
    ) {
      return {
        supportsReasoning: false,
        supportedTiers: [],
        defaultTier: "low",
        type: "none",
        note: "Thinking is automatically managed by Antigravity CLI for this model.",
      };
    }
    if (mid.includes("gemini-3.1-pro")) {
      return {
        supportsReasoning: true,
        supportedTiers: ["low", "high"],
        defaultTier: "low",
        type: "budget",
        note: "Gemini 3.1 Pro thinking passes (Low, High).",
      };
    }
    return {
      supportsReasoning: true,
      supportedTiers: ["low", "medium", "high"],
      defaultTier: "low",
      type: "budget",
      note: "Gemini thinking budget and reasoning passes (Low, Medium, High).",
    };
  }

  // 2. Anthropic / Claude Family (Hosted Anthropic, OpenRouter Claude, CLI Claude)
  // Claude models support full 5 tiers (Low, Medium, High, Extra, Max) except Haiku (Low, Medium).
  if (
    p === "anthropic" ||
    p === "cli_claude" ||
    mid.includes("claude") ||
    mid.startsWith("cli:claude") ||
    mid.includes("anthropic/")
  ) {
    if (mid.includes("haiku")) {
      return {
        supportsReasoning: true,
        supportedTiers: ["low", "medium"],
        defaultTier: "low",
        type: "budget",
        note: "Lightweight Claude Haiku thinking budget for rapid answers.",
      };
    }
    return {
      supportsReasoning: true,
      supportedTiers: ["low", "medium", "high", "extra", "max"],
      defaultTier: "low",
      type: "budget",
      note: "Extended Claude thinking tokens for deep analysis (includes Extra & Max).",
    };
  }

  // 2. Google Gemini Family (Hosted Gemini, OpenRouter Google, CLI Antigravity)
  // Gemini reasoning models support 3 tiers: Low, Medium, High (Gemini does not have Extra/Max).
  if (
    p === "gemini" ||
    p === "cli_antigravity" ||
    mid.includes("gemini") ||
    mid.startsWith("cli:antigravity") ||
    mid.includes("google/")
  ) {
    if (mid.includes("gemini-1.0") || mid.includes("gemini-1.5-flash-8b")) {
      return {
        supportsReasoning: false,
        supportedTiers: [],
        defaultTier: "low",
        type: "none",
        note: "Legacy Gemini model (no extended thinking support).",
      };
    }
    return {
      supportsReasoning: true,
      supportedTiers: ["low", "medium", "high"],
      defaultTier: "low",
      type: "budget",
      note: "Gemini thinking budget and reasoning passes (Low, Medium, High).",
    };
  }

  // 3. OpenAI & Codex Family (Hosted OpenAI, OpenRouter OpenAI, CLI Codex)
  // o1, o3, o4, and GPT-5 models support reasoning effort: Low, Medium, High.
  if (
    p === "cli_codex" ||
    mid.startsWith("cli:codex") ||
    mid.includes("o1") ||
    mid.includes("o3") ||
    mid.includes("o4") ||
    mid.includes("gpt-5")
  ) {
    return {
      supportsReasoning: true,
      supportedTiers: ["low", "medium", "high"],
      defaultTier: "low",
      type: "effort",
      note: "Native OpenAI reasoning effort tokens (Low, Medium, High).",
    };
  }

  // 4. DeepSeek Family (DeepSeek R1 / Reasoner)
  if (
    mid.includes("deepseek-reasoner") ||
    mid.includes("deepseek-r1") ||
    mid.includes("r1")
  ) {
    return {
      supportsReasoning: true,
      supportedTiers: ["low", "medium", "high"],
      defaultTier: "low",
      type: "native",
      note: "Built-in DeepSeek R1 chain-of-thought engine (Low, Medium, High).",
    };
  }

  // 5. xAI Grok Family
  if (mid.includes("grok-4.5") || mid.includes("grok-4.6")) {
    return {
      supportsReasoning: true,
      supportedTiers: ["low", "medium", "high"],
      defaultTier: "low",
      type: "effort",
      note: "xAI reasoning effort controller (Low, Medium, High).",
    };
  }

  // 6. Generic CLI fallback
  if (p.startsWith("cli") || mid.startsWith("cli:")) {
    return {
      supportsReasoning: true,
      supportedTiers: ["low", "medium", "high"],
      defaultTier: "low",
      type: "effort",
      note: "CLI thinking budget and reasoning depth (Low, Medium, High).",
    };
  }

  // 7. Dynamic OpenRouter live pricing check
  if (livePricingCache) {
    const rawId = modelId.includes(":") ? modelId.split(":").pop()! : modelId;
    const live = livePricingCache[modelId] || livePricingCache[rawId] || livePricingCache[`google/${rawId}`] || livePricingCache[`anthropic/${rawId}`];
    if (live?.supports_reasoning) {
      const isClaude = rawId.toLowerCase().includes("claude");
      return {
        supportsReasoning: true,
        supportedTiers: isClaude ? ["low", "medium", "high", "extra", "max"] : ["low", "medium", "high"],
        defaultTier: "low",
        type: isClaude ? "budget" : "effort",
        note: `OpenRouter reasoning support detected (${isClaude ? "5-tier Claude budget" : "Low, Medium, High"}).`,
      };
    }
  }

  // 8. Non-reasoning standard models (GPT-4o, GPT-4o-mini, Llama 3.3, Mistral Small/Large, Qwen 2.5, etc.)
  return {
    supportsReasoning: false,
    supportedTiers: [],
    defaultTier: "low",
    type: "none",
    note: "Standard direct generation model (no extended thinking phase).",
  };
}

export function modelSupportsReasoning(modelId: string, provider?: string): boolean {
  return getModelReasoningConfig(modelId, provider).supportsReasoning;
}

export function getModelDisplayName(modelId: string): string {
  for (const list of Object.values(AGENT_MODEL_OPTIONS)) {
    const found = list.find((m) => m.id === modelId);
    if (found) return found.name;
  }
  if (modelId === "cli:claude" || modelId === "cli_claude" || modelId === "cli:claude:default") {
    return liveCliStatusCache?.["cli_claude"]?.active_model || "Claude Sonnet 5";
  }
  if (modelId === "cli:antigravity" || modelId === "cli_antigravity" || modelId === "cli:antigravity:default") {
    return liveCliStatusCache?.["cli_antigravity"]?.active_model || "Gemini 3.7 Flash";
  }
  if (modelId === "cli:codex" || modelId === "cli_codex" || modelId === "cli:codex:default") {
    return liveCliStatusCache?.["cli_codex"]?.active_model || "GPT-5.6 Luna";
  }
  const raw = modelId.split("/").pop() || modelId;
  return raw
    .replace(/^claude-/, "Claude ")
    .replace(/^gemini-/, "Gemini ")
    .replace(/^gpt-/, "GPT-")
    .replace(/^deepseek-/, "DeepSeek ");
}

export function findProviderForModel(modelId: string): string {
  if (modelId === "cli:claude" || modelId.startsWith("cli:claude") || modelId === "cli_claude") return "cli_claude";
  if (modelId === "cli:antigravity" || modelId.startsWith("cli:antigravity") || modelId === "cli_antigravity") return "cli_antigravity";
  if (modelId === "cli:codex" || modelId.startsWith("cli:codex") || modelId === "cli_codex") return "cli_codex";
  for (const [provKey, list] of Object.entries(AGENT_MODEL_OPTIONS)) {
    if (list.some((m) => m.id === modelId)) {
      return provKey;
    }
  }
  if (modelId.includes("anthropic") || modelId.includes("claude")) return "anthropic";
  if (modelId.includes("google") || modelId.includes("gemini")) return "gemini";
  if (modelId.includes("gpt-oss") || modelId.includes("compound") || modelId.includes("groq")) return "groq";
  if (modelId.includes("deepseek")) return "deepseek";
  if (modelId.includes("mistral") || modelId.includes("codestral")) return "mistral";
  if (modelId.includes("xai") || modelId.includes("grok") || modelId.includes("spacexai")) return "xai";
  if (modelId.includes("openai") || modelId.includes("gpt")) return "openai";
  return "openrouter";
}

export function normalizeAiProvider(service: string): string {
  const s = (service || "").toLowerCase();
  if (s.includes("gemini") || s.includes("google")) return "gemini";
  if (s.includes("anthropic") || s.includes("claude")) return "anthropic";
  if (s.includes("openai") || s.includes("gpt")) return "openai";
  if (s.includes("groq")) return "groq";
  if (s.includes("deepseek")) return "deepseek";
  if (s.includes("mistral")) return "mistral";
  if (s.includes("xai") || s.includes("grok") || s.includes("spacexai") || s.includes("x_ai")) return "xai";
  if (s.includes("openrouter")) return "openrouter";
  return "openrouter";
}

export function getDefaultModelForProvider(provider: string): string {
  switch (provider) {
    case "cli_antigravity":
    case "cli:antigravity":
      return liveCliStatusCache?.["cli_antigravity"]?.model_id || "cli:antigravity:gemini-3.7-flash";
    case "cli_claude":
    case "cli:claude":
      return liveCliStatusCache?.["cli_claude"]?.model_id || "cli:claude:claude-5-sonnet";
    case "cli_codex":
    case "cli:codex":
      return liveCliStatusCache?.["cli_codex"]?.model_id || "cli:codex:gpt-5.6-luna";
    case "gemini":
      return "gemini-3.1-flash-lite";
    case "anthropic":
      return "claude-5-sonnet";
    case "openai":
      return "gpt-5.4-nano";
    case "groq":
      return "openai/gpt-oss-120b";
    case "deepseek":
      return "deepseek-chat";
    case "mistral":
      return "mistralai/mistral-small-4";
    case "xai":
    case "grok":
    case "spacexai":
      return "grok-4.3";
    case "openrouter":
    default:
      return "google/gemini-3.5-flash-lite";
  }
}

export function resolveCliModelId(modelId?: string, provider?: string): string {
  if (!modelId && provider) {
    return getDefaultModelForProvider(provider);
  }
  if (!modelId) return "google/gemini-3.1-flash-lite";

  // If a CLI provider is specified, ensure the model actually belongs to this CLI provider
  if (provider && (provider.startsWith("cli_") || provider.startsWith("cli:"))) {
    const normProv = provider.startsWith("cli:") ? provider.replace(":", "_") : provider;
    if (normProv === "cli_antigravity" && (modelId.startsWith("cli:claude") || modelId.startsWith("cli:codex"))) {
      return getDefaultModelForProvider(normProv);
    }
    if (normProv === "cli_claude" && (modelId.startsWith("cli:antigravity") || modelId.startsWith("cli:codex"))) {
      return getDefaultModelForProvider(normProv);
    }
    if (normProv === "cli_codex" && (modelId.startsWith("cli:antigravity") || modelId.startsWith("cli:claude"))) {
      return getDefaultModelForProvider(normProv);
    }
  }

  if (modelId === "cli:claude" || modelId === "cli_claude" || modelId === "cli:claude:default") {
    return liveCliStatusCache?.["cli_claude"]?.model_id || "cli:claude:claude-5-sonnet";
  }
  if (modelId === "cli:antigravity" || modelId === "cli_antigravity" || modelId === "cli:antigravity:default") {
    return liveCliStatusCache?.["cli_antigravity"]?.model_id || "cli:antigravity:gemini-3.7-flash";
  }
  if (modelId === "cli:codex" || modelId === "cli_codex" || modelId === "cli:codex:default") {
    return liveCliStatusCache?.["cli_codex"]?.model_id || "cli:codex:gpt-5.6-luna";
  }
  if (modelId === "default" && provider) {
    return getDefaultModelForProvider(provider);
  }
  return modelId;
}

export function getCliProviderForSession(params: {
  selectedProvider?: string;
  selectedModel?: string;
  newChatMode?: string;
  activePtyTabProvider?: string;
}): "cli_claude" | "cli_antigravity" | "cli_codex" | null {
  // If explicitly in Chat mode, it is strictly Cloud AI (not CLI, not PTY)
  if (params.newChatMode === "chat") {
    return null;
  }

  // 1. Prioritize active PTY tab provider if present
  if (params.activePtyTabProvider) {
    const raw = params.activePtyTabProvider.startsWith("cli:")
      ? params.activePtyTabProvider.replace(":", "_")
      : params.activePtyTabProvider;
    if (raw === "cli_claude" || raw === "cli_antigravity" || raw === "cli_codex") {
      return raw;
    }
  }

  // 2. Check newChatMode (e.g. from NewChat split-combo / PTY modes)
  if (params.newChatMode) {
    if (params.newChatMode === "cli_terminal_antigravity" || params.newChatMode === "cli_antigravity") {
      return "cli_antigravity";
    }
    if (params.newChatMode === "cli_terminal_codex" || params.newChatMode === "cli_codex") {
      return "cli_codex";
    }
    if (params.newChatMode === "cli_terminal_claude" || params.newChatMode === "cli_claude") {
      return "cli_claude";
    }
  }

  // 3. Check selectedProvider
  if (params.selectedProvider) {
    const p = params.selectedProvider.startsWith("cli:")
      ? params.selectedProvider.replace(":", "_")
      : params.selectedProvider;
    if (p === "cli_claude" || p === "cli_antigravity" || p === "cli_codex") {
      return p;
    }
  }

  // 4. Check selectedModel prefix
  if (params.selectedModel && params.selectedModel.startsWith("cli:")) {
    if (params.selectedModel.startsWith("cli:antigravity")) return "cli_antigravity";
    if (params.selectedModel.startsWith("cli:codex")) return "cli_codex";
    if (params.selectedModel.startsWith("cli:claude")) return "cli_claude";
  }

  return null;
}

export function isValidModelForCliProvider(provider: string, modelId: string): boolean {
  const models = AGENT_MODEL_OPTIONS[provider];
  if (!models || models.length === 0) return false;
  return models.some((m) => m.id === modelId);
}

export function isAiService(service: string): boolean {
  const s = (service || "").toLowerCase();
  return [
    "openrouter",
    "gemini",
    "google",
    "google_ai",
    "googleai",
    "anthropic",
    "claude",
    "openai",
    "gpt",
    "groq",
    "deepseek",
    "mistral",
    "xai",
    "grok",
    "spacexai",
    "x_ai",
  ].some((ai) => s.includes(ai));
}

export function detectDefaultAiConnection(connections: any[]): { provider: string; model: string } {
  if (!Array.isArray(connections) || connections.length === 0) {
    return { provider: "gemini", model: "gemini-3.1-flash-lite" };
  }

  // 1. Check for connection explicitly marked is_primary / primary
  for (const conn of connections) {
    if (!conn || !conn.service || conn.is_active === false) continue;
    let isPrimary = false;
    let defaultModel = "";
    try {
      const extra = typeof conn.extra === "string" ? JSON.parse(conn.extra || "{}") : conn.extra || {};
      if (extra.is_primary === true || extra.primary === true) isPrimary = true;
      if (extra.default_model) defaultModel = extra.default_model;
    } catch {}

    if (isPrimary && isAiService(conn.service)) {
      const prov = normalizeAiProvider(conn.service);
      let model = defaultModel;
      if (!model && conn.label && conn.label.trim()) {
        const lbl = conn.label.trim();
        if (lbl.includes("-") || lbl.includes("/") || lbl.includes(".")) {
          model = lbl;
        }
      }
      return { provider: prov, model: model || getDefaultModelForProvider(prov) };
    }
  }

  // 2. Filter active AI connections
  const activeAiConns = connections.filter((c) => c && c.is_active !== false && isAiService(c.service || ""));

  if (activeAiConns.length > 0) {
    // Check for configured connections (those with API key/secret/token)
    const configured = activeAiConns.filter(
      (c) =>
        (c.access_token && c.access_token.trim().length > 0) ||
        (c.client_id && c.client_id.trim().length > 0) ||
        (c.client_secret && c.client_secret.trim().length > 0)
    );

    // If Gemini is configured and no primary is set, prioritize Gemini as default provider
    const geminiConn = (configured.length > 0 ? configured : activeAiConns).find((c) => {
      const p = normalizeAiProvider(c.service);
      return p === "gemini";
    });

    const targetConn = geminiConn || (configured.length > 0 ? configured[0] : activeAiConns[0]);
    let defaultModel = "";
    try {
      const extra = typeof targetConn.extra === "string" ? JSON.parse(targetConn.extra || "{}") : targetConn.extra || {};
      if (extra.default_model) defaultModel = extra.default_model;
    } catch {}

    const prov = normalizeAiProvider(targetConn.service);
    let model = defaultModel;
    if (!model && targetConn.label && targetConn.label.trim()) {
      const lbl = targetConn.label.trim();
      if (lbl.includes("-") || lbl.includes("/") || lbl.includes(".")) {
        model = lbl;
      }
    }
    return { provider: prov, model: model || getDefaultModelForProvider(prov) };
  }

  return { provider: "gemini", model: "gemini-3.1-flash-lite" };
}

// ── In-Memory Session & Message Cache (0ms instant switching) ────────────────
const agentSessionCache = new Map<string, any[]>();
let cachedAnalyticsData: any = null;
let cachedSessionsList: any[] | null = null;
let cachedActiveSessionId: string | null = null;
let cachedStaffLookup: Record<string, string> | null = null;

export function getCachedSessionMessages(sessionId: string): any[] | undefined {
  return agentSessionCache.get(sessionId);
}

export function setCachedSessionMessages(sessionId: string, messages: any[]): void {
  agentSessionCache.set(sessionId, messages);
}

export function deleteCachedSession(sessionId: string): void {
  agentSessionCache.delete(sessionId);
}

export function clearCachedSessions(): void {
  agentSessionCache.clear();
}

export function getCachedAgentAnalytics(): any | null {
  return cachedAnalyticsData;
}

export function setCachedAgentAnalytics(data: any | null): void {
  cachedAnalyticsData = data;
}

export function getCachedSessionsList(): any[] | null {
  return cachedSessionsList;
}

export function setCachedSessionsList(list: any[] | null): void {
  cachedSessionsList = list;
}

export function getCachedActiveSessionId(): string | null {
  return cachedActiveSessionId;
}

export function setCachedActiveSessionId(id: string | null): void {
  cachedActiveSessionId = id;
}

let cachedCommandsList: any[] | null = null;
let cachedToolsList: any[] | null = null;

export function getCachedCommandsList(): any[] | null {
  return cachedCommandsList;
}

export function setCachedCommandsList(list: any[] | null): void {
  cachedCommandsList = list;
}

export function getCachedToolsList(): any[] | null {
  return cachedToolsList;
}

export function setCachedToolsList(list: any[] | null): void {
  cachedToolsList = list;
}

export function getCachedStaffLookup(): Record<string, string> | null {
  return cachedStaffLookup;
}

export function setCachedStaffLookup(map: Record<string, string>): void {
  cachedStaffLookup = map;
}


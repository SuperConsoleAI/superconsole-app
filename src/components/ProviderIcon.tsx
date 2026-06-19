import {
  Anthropic,
  Claude,
  DeepSeek,
  Gemini,
  Grok,
  Kimi,
  Meta,
  Ollama,
  OpenAI,
  OpenRouter,
  Qwen,
  Zhipu,
} from "@lobehub/icons";
import { MessageSquare } from "lucide-react";
import type { ComponentType } from "react";

type IconCmp = ComponentType<{ size?: number; className?: string }>;

const PROVIDER_ICONS: Record<string, IconCmp> = {
  openrouter: OpenRouter,
  anthropic: Anthropic,
  claude: Claude,
  openai: OpenAI,
  gemini: Gemini,
  google: Gemini,
  local: Ollama,
  ollama: Ollama,
  meta: Meta,
  "meta-llama": Meta,
  deepseek: DeepSeek,
  qwen: Qwen,
  "x-ai": Grok,
  grok: Grok,
  moonshotai: Kimi,
  kimi: Kimi,
  "z-ai": Zhipu,
  zhipu: Zhipu,
};

// Infer the brand from a model id (e.g. "anthropic/claude-..." or "gpt-5").
// Product icons (Claude, Grok, Kimi, GLM, Gemini) win over the company icon.
function modelBrand(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("claude")) return "claude";
  if (m.includes("grok")) return "grok";
  if (m.includes("kimi")) return "kimi";
  if (m.includes("glm")) return "zhipu";
  if (m.includes("gemini") || m.includes("gemma")) return "gemini";
  if (m.includes("deepseek")) return "deepseek";
  if (m.includes("qwen")) return "qwen";
  if (m.includes("llama")) return "meta";
  if (/(^|\/)(gpt|o1|o3|o4)/.test(m)) return "openai";
  if (m.includes("/")) return m.split("/")[0];
  return "ollama";
}

export function ProviderIcon({
  provider,
  model,
  size = 16,
  className,
}: {
  provider?: string | null;
  model?: string | null;
  size?: number;
  className?: string;
}) {
  const key = model ? modelBrand(model) : (provider ?? "").toLowerCase();
  const Icon = PROVIDER_ICONS[key];
  if (!Icon) return <MessageSquare className={className} strokeWidth={1.5} />;
  return <Icon size={size} className={className} />;
}

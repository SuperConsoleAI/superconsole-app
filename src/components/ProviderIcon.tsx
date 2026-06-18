import {
  Anthropic,
  DeepSeek,
  Gemini,
  Meta,
  Ollama,
  OpenAI,
  OpenRouter,
  Qwen,
} from "@lobehub/icons";
import { MessageSquare } from "lucide-react";
import type { ComponentType } from "react";

type IconCmp = ComponentType<{ size?: number; className?: string }>;

const PROVIDER_ICONS: Record<string, IconCmp> = {
  openrouter: OpenRouter,
  anthropic: Anthropic,
  openai: OpenAI,
  gemini: Gemini,
  google: Gemini,
  local: Ollama,
  ollama: Ollama,
  meta: Meta,
  "meta-llama": Meta,
  deepseek: DeepSeek,
  qwen: Qwen,
};

// Infer the brand from a model id (e.g. "anthropic/claude-..." or "gpt-5").
function modelBrand(model: string): string {
  const m = model.toLowerCase();
  if (m.includes("/")) return m.split("/")[0];
  if (m.startsWith("claude")) return "anthropic";
  if (m.startsWith("gpt") || m.startsWith("o3") || m.startsWith("o1")) return "openai";
  if (m.startsWith("gemini")) return "gemini";
  if (m.startsWith("llama")) return "meta";
  if (m.startsWith("qwen")) return "qwen";
  if (m.startsWith("deepseek")) return "deepseek";
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

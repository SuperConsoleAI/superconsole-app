// src/components/common/ProviderIcon.tsx
// High-performance AI / LLM Model & Provider Logo component using @lobehub/icons SVG assets.

import { component$ } from "@builder.io/qwik";
import { resolveCliModelId } from "~/lib/agent-config";

import openrouterSvg from "@lobehub/icons-static-svg/icons/openrouter.svg?raw";
import openrouterColorSvg from "@lobehub/icons-static-svg/icons/openrouter-color.svg?raw";

import anthropicSvg from "@lobehub/icons-static-svg/icons/anthropic.svg?raw";
import claudeSvg from "@lobehub/icons-static-svg/icons/claude.svg?raw";
import claudeColorSvg from "@lobehub/icons-static-svg/icons/claude-color.svg?raw";
import claudecodeSvg from "@lobehub/icons-static-svg/icons/claudecode.svg?raw";
import claudecodeColorSvg from "@lobehub/icons-static-svg/icons/claudecode-color.svg?raw";

import antigravitySvg from "@lobehub/icons-static-svg/icons/antigravity.svg?raw";
import antigravityColorSvg from "@lobehub/icons-static-svg/icons/antigravity-color.svg?raw";

import geminiSvg from "@lobehub/icons-static-svg/icons/gemini.svg?raw";
import geminiColorSvg from "@lobehub/icons-static-svg/icons/gemini-color.svg?raw";
import googleSvg from "@lobehub/icons-static-svg/icons/google.svg?raw";
import googleColorSvg from "@lobehub/icons-static-svg/icons/google-color.svg?raw";

import openaiSvg from "@lobehub/icons-static-svg/icons/openai.svg?raw";
import codexSvg from "@lobehub/icons-static-svg/icons/codex.svg?raw";
import codexColorSvg from "@lobehub/icons-static-svg/icons/codex-color.svg?raw";

import deepseekSvg from "@lobehub/icons-static-svg/icons/deepseek.svg?raw";
import deepseekColorSvg from "@lobehub/icons-static-svg/icons/deepseek-color.svg?raw";

import metaSvg from "@lobehub/icons-static-svg/icons/meta.svg?raw";
import metaColorSvg from "@lobehub/icons-static-svg/icons/meta-color.svg?raw";

import groqSvg from "@lobehub/icons-static-svg/icons/groq.svg?raw";

import mistralSvg from "@lobehub/icons-static-svg/icons/mistral.svg?raw";
import mistralColorSvg from "@lobehub/icons-static-svg/icons/mistral-color.svg?raw";

import ollamaSvg from "@lobehub/icons-static-svg/icons/ollama.svg?raw";

import xaiSvg from "@lobehub/icons-static-svg/icons/xai.svg?raw";
import grokSvg from "@lobehub/icons-static-svg/icons/grok.svg?raw";

import workersaiColorSvg from "@lobehub/icons-static-svg/icons/workersai-color.svg?raw";
import cloudflareColorSvg from "@lobehub/icons-static-svg/icons/cloudflare-color.svg?raw";

import cohereSvg from "@lobehub/icons-static-svg/icons/cohere.svg?raw";
import cohereColorSvg from "@lobehub/icons-static-svg/icons/cohere-color.svg?raw";

import togetherSvg from "@lobehub/icons-static-svg/icons/together.svg?raw";
import togetherColorSvg from "@lobehub/icons-static-svg/icons/together-color.svg?raw";

import perplexitySvg from "@lobehub/icons-static-svg/icons/perplexity.svg?raw";
import perplexityColorSvg from "@lobehub/icons-static-svg/icons/perplexity-color.svg?raw";

import qwenSvg from "@lobehub/icons-static-svg/icons/qwen.svg?raw";
import qwenColorSvg from "@lobehub/icons-static-svg/icons/qwen-color.svg?raw";

import huggingfaceSvg from "@lobehub/icons-static-svg/icons/huggingface.svg?raw";
import huggingfaceColorSvg from "@lobehub/icons-static-svg/icons/huggingface-color.svg?raw";

import azureSvg from "@lobehub/icons-static-svg/icons/azure.svg?raw";
import azureColorSvg from "@lobehub/icons-static-svg/icons/azure-color.svg?raw";

import bedrockSvg from "@lobehub/icons-static-svg/icons/bedrock.svg?raw";
import bedrockColorSvg from "@lobehub/icons-static-svg/icons/bedrock-color.svg?raw";

import githubSvg from "@lobehub/icons-static-svg/icons/github.svg?raw";
import githubcopilotSvg from "@lobehub/icons-static-svg/icons/githubcopilot.svg?raw";

export interface ProviderIconProps {
  provider?: string;
  model?: string;
  size?: number | string;
  color?: boolean;
  class?: string;
  style?: string;
}

const wrapSvg = (svg: string): string => {
  if (!svg) return "";
  // Ensure the SVG fills the wrapper container
  return svg
    .replace(/<svg\b([^>]*)>/i, (_match, attrs) => {
      // replace or inject width and height with 100%
      const cleaned = attrs
        .replace(/\bwidth="[^"]*"/gi, '')
        .replace(/\bheight="[^"]*"/gi, '')
        .replace(/\bstyle="[^"]*"/gi, '');
      return `<svg width="100%" height="100%" style="display:block;overflow:visible;" ${cleaned}>`;
    });
};

const ICONS: Record<string, { mono: string; color: string }> = {
  openrouter: { mono: wrapSvg(openrouterSvg), color: wrapSvg(openrouterColorSvg) },
  anthropic: { mono: wrapSvg(anthropicSvg), color: wrapSvg(anthropicSvg) },
  claude: { mono: wrapSvg(claudeSvg), color: wrapSvg(claudeColorSvg) },
  claudecode: { mono: wrapSvg(claudecodeSvg), color: wrapSvg(claudecodeColorSvg) },
  claude_code: { mono: wrapSvg(claudecodeSvg), color: wrapSvg(claudecodeColorSvg) },
  cli_claude: { mono: wrapSvg(claudecodeSvg), color: wrapSvg(claudecodeColorSvg) },

  antigravity: { mono: wrapSvg(antigravitySvg), color: wrapSvg(antigravityColorSvg) },
  cli_antigravity: { mono: wrapSvg(antigravitySvg), color: wrapSvg(antigravityColorSvg) },
  agy: { mono: wrapSvg(antigravitySvg), color: wrapSvg(antigravityColorSvg) },

  gemini: { mono: wrapSvg(geminiSvg), color: wrapSvg(geminiColorSvg) },
  google: { mono: wrapSvg(googleSvg), color: wrapSvg(googleColorSvg) },
  openai: { mono: wrapSvg(openaiSvg), color: wrapSvg(openaiSvg) },

  codex: { mono: wrapSvg(codexSvg), color: wrapSvg(codexColorSvg) },
  cli_codex: { mono: wrapSvg(codexSvg), color: wrapSvg(codexColorSvg) },
  chatgpt: { mono: wrapSvg(openaiSvg), color: wrapSvg(openaiSvg) },
  deepseek: { mono: wrapSvg(deepseekSvg), color: wrapSvg(deepseekColorSvg) },
  meta: { mono: wrapSvg(metaSvg), color: wrapSvg(metaColorSvg) },
  llama: { mono: wrapSvg(metaSvg), color: wrapSvg(metaColorSvg) },
  "meta-llama": { mono: wrapSvg(metaSvg), color: wrapSvg(metaColorSvg) },
  groq: { mono: wrapSvg(groqSvg), color: wrapSvg(groqSvg) },
  mistral: { mono: wrapSvg(mistralSvg), color: wrapSvg(mistralColorSvg) },
  ollama: { mono: wrapSvg(ollamaSvg), color: wrapSvg(ollamaSvg) },
  xai: { mono: wrapSvg(xaiSvg), color: wrapSvg(grokSvg) },
  grok: { mono: wrapSvg(grokSvg), color: wrapSvg(grokSvg) },
  cloudflare: { mono: wrapSvg(cloudflareColorSvg), color: wrapSvg(cloudflareColorSvg) },
  workersai: { mono: wrapSvg(workersaiColorSvg), color: wrapSvg(workersaiColorSvg) },
  cohere: { mono: wrapSvg(cohereSvg), color: wrapSvg(cohereColorSvg) },
  together: { mono: wrapSvg(togetherSvg), color: wrapSvg(togetherColorSvg) },
  togetherai: { mono: wrapSvg(togetherSvg), color: wrapSvg(togetherColorSvg) },
  perplexity: { mono: wrapSvg(perplexitySvg), color: wrapSvg(perplexityColorSvg) },
  qwen: { mono: wrapSvg(qwenSvg), color: wrapSvg(qwenColorSvg) },
  huggingface: { mono: wrapSvg(huggingfaceSvg), color: wrapSvg(huggingfaceColorSvg) },
  azure: { mono: wrapSvg(azureSvg), color: wrapSvg(azureColorSvg) },
  bedrock: { mono: wrapSvg(bedrockSvg), color: wrapSvg(bedrockColorSvg) },
  aws: { mono: wrapSvg(bedrockSvg), color: wrapSvg(bedrockColorSvg) },
  github: { mono: wrapSvg(githubSvg), color: wrapSvg(githubcopilotSvg) },
  githubcopilot: { mono: wrapSvg(githubcopilotSvg), color: wrapSvg(githubcopilotSvg) },
};

/**
 * Returns the SVG string for a given provider or model identifier.
 * Intelligently extracts model brand (Claude, Gemini, OpenAI, DeepSeek, etc.)
 * even when wrapped in CLI prefixes (e.g. `cli:antigravity:gemini-3.8-flash`).
 */
export function getProviderSvg(providerOrModel: string, color: boolean = true): string {
  if (!providerOrModel) return color ? ICONS.openrouter.color : ICONS.openrouter.mono;
  const raw = (providerOrModel || "").toLowerCase().trim();
  
  // 1. Strip CLI prefixes to reveal inner model id
  let modelPart = raw;
  if (modelPart.startsWith("cli:antigravity:")) {
    modelPart = modelPart.slice("cli:antigravity:".length);
  } else if (modelPart.startsWith("cli:claude:")) {
    modelPart = modelPart.slice("cli:claude:".length);
  } else if (modelPart.startsWith("cli:codex:")) {
    modelPart = modelPart.slice("cli:codex:".length);
  }

  if (raw === "cli:antigravity") {
    modelPart = "gemini";
  } else if (raw === "cli:claude") {
    modelPart = "claude";
  } else if (raw === "cli:codex") {
    modelPart = "openai";
  }

  // 2. Check exact keys
  if (ICONS[modelPart]) {
    return color ? ICONS[modelPart].color : ICONS[modelPart].mono;
  }
  if (ICONS[raw]) {
    return color ? ICONS[raw].color : ICONS[raw].mono;
  }

  // 3. Model brand matching (prioritize model name content over generic CLI provider name)
  if (
    modelPart.includes("claude") ||
    modelPart.includes("anthropic") ||
    modelPart.includes("sonnet") ||
    modelPart.includes("opus") ||
    modelPart.includes("haiku") ||
    modelPart.includes("fable")
  ) {
    return color ? ICONS.claude.color : ICONS.claude.mono;
  }

  if (
    modelPart.includes("gemini") ||
    modelPart.includes("google")
  ) {
    return color ? ICONS.gemini.color : ICONS.gemini.mono;
  }

  if (
    modelPart.includes("gpt") ||
    modelPart.includes("openai") ||
    modelPart.includes("chatgpt") ||
    modelPart.includes("o1") ||
    modelPart.includes("o3") ||
    modelPart.includes("o4") ||
    modelPart.includes("terra") ||
    modelPart.includes("luna")
  ) {
    return color ? ICONS.openai.color : ICONS.openai.mono;
  }

  if (modelPart.includes("deepseek")) {
    return color ? ICONS.deepseek.color : ICONS.deepseek.mono;
  }

  if (modelPart.includes("llama") || modelPart.includes("meta")) {
    return color ? ICONS.meta.color : ICONS.meta.mono;
  }

  if (modelPart.includes("mistral") || modelPart.includes("codestral")) {
    return color ? ICONS.mistral.color : ICONS.mistral.mono;
  }

  if (modelPart.includes("groq") || modelPart.includes("compound")) {
    return color ? ICONS.groq.color : ICONS.groq.mono;
  }

  if (modelPart.includes("grok") || modelPart.includes("xai") || modelPart.includes("spacexai")) {
    return color ? ICONS.grok.color : ICONS.grok.mono;
  }

  if (modelPart.includes("qwen")) {
    return color ? ICONS.qwen.color : ICONS.qwen.mono;
  }

  if (modelPart.includes("perplexity")) {
    return color ? ICONS.perplexity.color : ICONS.perplexity.mono;
  }

  if (modelPart.includes("cohere")) {
    return color ? ICONS.cohere.color : ICONS.cohere.mono;
  }

  // 4. CLI Container / Host Brand (when viewing pure CLI provider tabs or CLI mode badge)
  if (raw.includes("antigravity") || raw.includes("agy")) {
    return color ? ICONS.antigravity.color : ICONS.antigravity.mono;
  }
  if (raw.includes("claudecode") || raw.includes("claude_code") || raw.includes("cli_claude") || raw.includes("cli:claude")) {
    return color ? ICONS.claudecode.color : ICONS.claudecode.mono;
  }
  if (raw.includes("codex")) {
    return color ? ICONS.codex.color : ICONS.codex.mono;
  }
  if (raw.includes("workersai") || raw.includes("cloudflare")) {
    return color ? ICONS.workersai.color : ICONS.workersai.mono;
  }

  return color ? ICONS.openrouter.color : ICONS.openrouter.mono;
}

export const ProviderIcon = component$<ProviderIconProps>(({
  provider,
  model,
  size = "1rem",
  color = true,
  class: className = "",
  style = "",
}) => {
  const sizeValue = typeof size === "number" ? `${size}px` : size;
  const target = model ? resolveCliModelId(model, provider) : (provider || "openrouter");
  const svgContent = getProviderSvg(target, color);

  return (
    <span
      class={`inline-flex items-center justify-center flex-shrink-0 ${className}`}
      style={`width:${sizeValue};height:${sizeValue};min-width:${sizeValue};min-height:${sizeValue};line-height:1;display:inline-flex;align-items:center;justify-content:center;${style}`}
      dangerouslySetInnerHTML={svgContent}
    />
  );
});

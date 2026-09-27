import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { PresetIcon } from "@/components/PresetIcon";
import { ProviderIcon } from "@/components/ProviderIcon";
import { Copy, Check, BarChart3, Coins, Layers, ArrowUpRight } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

export interface SessionUsageData {
  id?: string | number;
  session_id?: string;
  resume_id?: string;
  session_type?: "cli" | "chat";
  workspace_id?: number;
  workspace_name?: string;
  wsName?: string;
  cli?: string;
  provider?: string;
  model?: string;
  label?: string | null;
  started_at?: string;
  ended_at?: string | null;
  tokens_prompt?: number;
  tokens_completion?: number;
  tokens_reasoning?: number;
  tokens_total?: number;
  cost_usd?: number;
}

export interface SessionUsageCostProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: SessionUsageData | null;
}

import { formatDuration, parseUtcDate, extractCleanResumeId } from "@/lib/utils";

export interface ModelRate {
  promptPer1M: number;
  completionPer1M: number;
  cachedPer1M: number;
  reasoningPer1M: number;
}

export function getModelRate(model?: string, provider?: string): ModelRate {
  const m = (model || "").toLowerCase();
  const p = (provider || "").toLowerCase();

  // Anthropic / Claude Code
  if (p === "anthropic" || m.includes("claude") || m.includes("opus") || m.includes("sonnet") || m.includes("haiku") || m.includes("fable")) {
    if (m.includes("fable-5.1") || m.includes("fable 5.1") || m.includes("fable")) return { promptPer1M: 10.0, completionPer1M: 50.0, cachedPer1M: 1.0, reasoningPer1M: 50.0 };
    if (m.includes("opus-5.5") || m.includes("opus 5.5") || m.includes("opus-5") || m.includes("opus 5")) return { promptPer1M: 4.0, completionPer1M: 20.0, cachedPer1M: 0.4, reasoningPer1M: 20.0 };
    if (m.includes("opus-4.8") || m.includes("opus 4.8")) return { promptPer1M: 6.0, completionPer1M: 30.0, cachedPer1M: 0.6, reasoningPer1M: 30.0 };
    if (m.includes("opus-4") || m.includes("opus 4.6") || m.includes("opus")) return { promptPer1M: 15.0, completionPer1M: 75.0, cachedPer1M: 1.5, reasoningPer1M: 75.0 };
    if (m.includes("sonnet-5") || m.includes("sonnet 5")) return { promptPer1M: 2.0, completionPer1M: 10.0, cachedPer1M: 0.2, reasoningPer1M: 10.0 };
    if (m.includes("haiku-4.5") || m.includes("haiku 4.5")) return { promptPer1M: 1.0, completionPer1M: 5.0, cachedPer1M: 0.1, reasoningPer1M: 5.0 };
    if (m.includes("haiku")) return { promptPer1M: 0.8, completionPer1M: 4.0, cachedPer1M: 0.08, reasoningPer1M: 4.0 };
    return { promptPer1M: 3.0, completionPer1M: 15.0, cachedPer1M: 0.3, reasoningPer1M: 15.0 };
  }

  // OpenAI / Codex
  if (m.includes("gpt-6-astra") || m.includes("astra")) return { promptPer1M: 5.0, completionPer1M: 20.0, cachedPer1M: 1.25, reasoningPer1M: 20.0 };
  if (m.includes("gpt-6-sol") || m.includes("gpt-6 sol")) return { promptPer1M: 1.50, completionPer1M: 6.0, cachedPer1M: 0.375, reasoningPer1M: 6.0 };
  if (m.includes("gpt-6-luna") || m.includes("gpt-6 luna")) return { promptPer1M: 0.20, completionPer1M: 0.80, cachedPer1M: 0.05, reasoningPer1M: 0.80 };
  if (m.includes("gpt-5.6-sol") || m.includes("5.6 sol")) return { promptPer1M: 2.0, completionPer1M: 8.0, cachedPer1M: 0.50, reasoningPer1M: 8.0 };
  if (m.includes("gpt-5.6-terra") || m.includes("5.6 terra")) return { promptPer1M: 1.0, completionPer1M: 4.0, cachedPer1M: 0.25, reasoningPer1M: 4.0 };
  if (m.includes("gpt-5.6-luna") || m.includes("5.6 luna")) return { promptPer1M: 0.30, completionPer1M: 1.20, cachedPer1M: 0.075, reasoningPer1M: 1.20 };
  if (m.includes("gpt-5.5") || m.includes("gpt-5.3")) return { promptPer1M: 1.25, completionPer1M: 10.0, cachedPer1M: 0.125, reasoningPer1M: 10.0 };
  if (m.includes("gpt-4o-mini")) return { promptPer1M: 0.15, completionPer1M: 0.60, cachedPer1M: 0.075, reasoningPer1M: 0.60 };
  if (m.includes("gpt-4o")) return { promptPer1M: 2.50, completionPer1M: 10.0, cachedPer1M: 1.25, reasoningPer1M: 10.0 };
  if (m.includes("o1-mini")) return { promptPer1M: 3.0, completionPer1M: 12.0, cachedPer1M: 1.50, reasoningPer1M: 12.0 };
  if (m.includes("o1")) return { promptPer1M: 15.0, completionPer1M: 60.0, cachedPer1M: 7.50, reasoningPer1M: 60.0 };
  if (m.includes("o3-mini")) return { promptPer1M: 1.10, completionPer1M: 4.40, cachedPer1M: 0.55, reasoningPer1M: 4.40 };

  // Google / Antigravity
  if (m.includes("3.8-flash") || m.includes("3.8 flash")) return { promptPer1M: 0.75, completionPer1M: 3.75, cachedPer1M: 0.1875, reasoningPer1M: 3.75 };
  if (m.includes("3.7-flash") || m.includes("3.7 flash")) return { promptPer1M: 0.75, completionPer1M: 3.75, cachedPer1M: 0.1875, reasoningPer1M: 3.75 };
  if (m.includes("3.6-flash") || m.includes("3.6 flash")) return { promptPer1M: 0.50, completionPer1M: 2.50, cachedPer1M: 0.125, reasoningPer1M: 2.50 };
  if (m.includes("3.1-pro") || m.includes("3-pro")) return { promptPer1M: 2.00, completionPer1M: 12.00, cachedPer1M: 0.50, reasoningPer1M: 12.00 };
  if (m.includes("3-flash") || m.includes("3 flash")) return { promptPer1M: 0.50, completionPer1M: 3.00, cachedPer1M: 0.125, reasoningPer1M: 3.00 };
  if (m.includes("2.5-pro") || m.includes("2.5 pro")) return { promptPer1M: 1.25, completionPer1M: 10.0, cachedPer1M: 0.3125, reasoningPer1M: 10.0 };
  if (m.includes("2.5-flash-lite")) return { promptPer1M: 0.10, completionPer1M: 0.40, cachedPer1M: 0.025, reasoningPer1M: 0.40 };
  if (m.includes("2.5-flash") || m.includes("2.5 flash")) return { promptPer1M: 0.30, completionPer1M: 2.50, cachedPer1M: 0.075, reasoningPer1M: 2.50 };
  if (m.includes("2.0-flash") || m.includes("2.0 flash")) return { promptPer1M: 0.10, completionPer1M: 0.40, cachedPer1M: 0.025, reasoningPer1M: 0.40 };
  if (m.includes("gpt-oss-120b") || m.includes("gpt-oss")) return { promptPer1M: 0.40, completionPer1M: 1.60, cachedPer1M: 0.04, reasoningPer1M: 1.60 };
  if (m.includes("gemini")) return { promptPer1M: 0.75, completionPer1M: 3.75, cachedPer1M: 0.1875, reasoningPer1M: 3.75 };

  // xAI / Grok
  if (m.includes("grok-4.7") || m.includes("grok-4.6") || m.includes("grok-4.5") || m.includes("grok")) return { promptPer1M: 2.0, completionPer1M: 10.0, cachedPer1M: 0.50, reasoningPer1M: 10.0 };
  if (m.includes("grok-3")) return { promptPer1M: 3.0, completionPer1M: 15.0, cachedPer1M: 0.75, reasoningPer1M: 15.0 };

  // Droid Core & Open Source
  if (m.includes("glm-5.3-flash")) return { promptPer1M: 0.10, completionPer1M: 0.40, cachedPer1M: 0.02, reasoningPer1M: 0.40 };
  if (m.includes("glm-5.3") || m.includes("glm-5.2") || m.includes("glm")) return { promptPer1M: 0.50, completionPer1M: 2.00, cachedPer1M: 0.10, reasoningPer1M: 2.00 };
  if (m.includes("kimi-k3") || m.includes("kimi")) return { promptPer1M: 0.60, completionPer1M: 2.40, cachedPer1M: 0.12, reasoningPer1M: 2.40 };
  if (m.includes("mistral-medium-3.5") || m.includes("mistral")) return { promptPer1M: 0.60, completionPer1M: 2.40, cachedPer1M: 0.12, reasoningPer1M: 2.40 };
  if (m.includes("inkling")) return { promptPer1M: 0.40, completionPer1M: 1.60, cachedPer1M: 0.08, reasoningPer1M: 1.60 };
  if (m.includes("deepseek-r1") || m.includes("reasoner")) return { promptPer1M: 0.55, completionPer1M: 2.19, cachedPer1M: 0.14, reasoningPer1M: 2.19 };
  if (m.includes("deepseek")) return { promptPer1M: 0.14, completionPer1M: 0.28, cachedPer1M: 0.014, reasoningPer1M: 0.28 };

  return { promptPer1M: 3.0, completionPer1M: 15.0, cachedPer1M: 0.30, reasoningPer1M: 15.0 };
}

function fmtUsd(n?: number): string {
  if (!n || isNaN(n)) return "$0.00";
  return n < 0.0001 && n > 0 ? `$${n.toFixed(5)}` : n < 0.01 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
}

function fmtTokens(n?: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function SessionUsageCost({ open, onOpenChange, session }: SessionUsageCostProps) {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);

  if (!session) return null;

  const sessionId = session.session_id || session.resume_id || (session.id != null ? String(session.id) : "");
  const cli = session.cli || "cli";
  const provider = session.provider || "";
  const model = session.model || "";
  
  const promptTokens = session.tokens_prompt ?? 0;
  const completionTokens = session.tokens_completion ?? 0;
  const reasoningTokens = session.tokens_reasoning ?? 0;
  const totalTokens = session.tokens_total ?? (promptTokens + completionTokens + reasoningTokens);

  const rate = getModelRate(model, provider);
  const promptCost = (promptTokens / 1_000_000) * rate.promptPer1M;
  const completionCost = (completionTokens / 1_000_000) * rate.completionPer1M;
  const reasoningCost = (reasoningTokens / 1_000_000) * rate.reasoningPer1M;
  const calculatedCost = promptCost + completionCost + reasoningCost;
  const cost = session.cost_usd && session.cost_usd > 0 ? session.cost_usd : calculatedCost;
  
  const isChat = session.session_type === "chat" || cli === "chat";
  const title = session.label || (isChat ? "Chat Session" : `${cli[0].toUpperCase() + cli.slice(1)} Session`);
  const wsName = session.wsName || session.workspace_name || "Workspace";

  const copySessionId = () => {
    if (!sessionId) return;
    navigator.clipboard.writeText(sessionId);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const goToUsage = () => {
    onOpenChange(false);
    navigate({ to: "/usage" as any });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-5 gap-4">
        <DialogHeader className="gap-1.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/70 bg-card">
              {isChat ? (
                <ProviderIcon provider={provider} model={model} size={16} />
              ) : (
                <PresetIcon preset={cli} className="h-4 w-4" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle className="text-base font-semibold truncate leading-tight">
                {title}
              </DialogTitle>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-0.5">
                <span className="truncate">{wsName}</span>
                {session.started_at && (
                  <>
                    <span>·</span>
                    <span className="shrink-0">
                      {parseUtcDate(session.started_at)?.toLocaleDateString([], { month: "short", day: "numeric" }) ?? ""}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>
        </DialogHeader>

        {/* Top Highlight Cards */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="rounded-xl border border-border/80 bg-card p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Estimated Cost</span>
              <Coins className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
            </div>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {fmtUsd(cost)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Based on token usage</p>
          </div>

          <div className="rounded-xl border border-border/80 bg-card p-3">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Total Tokens</span>
              <Layers className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
            </div>
            <p className="mt-1 text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {fmtTokens(totalTokens)}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {formatDuration(session.started_at, session.ended_at)} active
            </p>
          </div>
        </div>

        {/* Breakdown Box with Detailed Table */}
        <div className="rounded-xl border border-border/70 bg-card/60 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Usage & Cost Breakdown
            </p>
            <span className="text-[10px] font-mono text-muted-foreground bg-muted/70 px-2 py-0.5 rounded shrink-0">
              ${rate.promptPer1M.toFixed(2)} in / ${rate.completionPer1M.toFixed(2)} out · 1M
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground">Model</span>
              <span className="font-medium text-foreground truncate">
                {model || (isChat ? "Default Model" : `${cli} Agent`)}
              </span>
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-[11px] text-muted-foreground">Provider / CLI</span>
              <span className="font-medium text-foreground capitalize truncate">
                {provider || cli}
              </span>
            </div>
          </div>

          {/* Table Breakdown */}
          <div className="border-t border-border/60 pt-2 text-xs">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[11px] text-muted-foreground border-b border-border/40">
                  <th className="font-medium pb-1.5">Type</th>
                  <th className="font-medium pb-1.5">Snapshot Rate</th>
                  <th className="font-medium pb-1.5 text-right">Tokens</th>
                  <th className="font-medium pb-1.5 text-right">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/30 text-xs">
                <tr>
                  <td className="py-1.5 font-medium text-foreground">Prompt (In)</td>
                  <td className="py-1.5 font-mono text-muted-foreground text-[11px]">${rate.promptPer1M.toFixed(2)} / 1M</td>
                  <td className="py-1.5 text-right font-medium tabular-nums text-foreground">{fmtTokens(promptTokens)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums text-foreground">{fmtUsd(promptCost)}</td>
                </tr>
                <tr>
                  <td className="py-1.5 font-medium text-foreground">Completion (Out)</td>
                  <td className="py-1.5 font-mono text-muted-foreground text-[11px]">${rate.completionPer1M.toFixed(2)} / 1M</td>
                  <td className="py-1.5 text-right font-medium tabular-nums text-foreground">{fmtTokens(completionTokens)}</td>
                  <td className="py-1.5 text-right font-medium tabular-nums text-foreground">{fmtUsd(completionCost)}</td>
                </tr>
                {reasoningTokens > 0 && (
                  <tr>
                    <td className="py-1.5 font-medium text-foreground">Reasoning</td>
                    <td className="py-1.5 font-mono text-muted-foreground text-[11px]">${rate.reasoningPer1M.toFixed(2)} / 1M</td>
                    <td className="py-1.5 text-right font-medium tabular-nums text-foreground">{fmtTokens(reasoningTokens)}</td>
                    <td className="py-1.5 text-right font-medium tabular-nums text-foreground">{fmtUsd(reasoningCost)}</td>
                  </tr>
                )}
                <tr className="font-semibold text-foreground border-t border-border/70">
                  <td className="pt-2">Total</td>
                  <td className="pt-2 text-[11px] text-muted-foreground font-normal">
                    {session.started_at
                      ? `Snapshot (${parseUtcDate(session.started_at)?.toLocaleDateString([], { month: "short", day: "numeric" }) ?? "Recorded"})`
                      : "Snapshot Rate"}
                  </td>
                  <td className="pt-2 text-right tabular-nums">{fmtTokens(totalTokens)}</td>
                  <td className="pt-2 text-right tabular-nums text-primary">{fmtUsd(cost)}</td>
                </tr>
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground/80 pt-2 border-t border-border/30 italic">
              Rates reflect the pricing snapshot locked when this session was recorded. Future rate changes do not alter past session costs.
            </p>
          </div>
        </div>

        {/* Session ID bar */}
        {sessionId && (
          <div className="flex items-center justify-between gap-2 rounded-lg border border-border/60 bg-muted/40 px-2.5 py-1.5 text-xs overflow-hidden">
            <span
              className="text-muted-foreground font-mono text-[11px] truncate min-w-0 flex-1"
              title={sessionId}
            >
              ID: {extractCleanResumeId(sessionId) || sessionId}
            </span>
            <button
              onClick={copySessionId}
              className="flex items-center gap-1 text-[11px] font-medium text-primary hover:underline shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" /> Copied
                </>
              ) : (
                <>
                  <Copy className="h-3 w-3" /> Copy
                </>
              )}
            </button>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={goToUsage}
            className="text-xs text-muted-foreground hover:text-foreground gap-1.5 px-2"
          >
            <BarChart3 className="h-3.5 w-3.5" />
            <span>Full Analytics</span>
            <ArrowUpRight className="h-3 w-3" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs px-3"
          >
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

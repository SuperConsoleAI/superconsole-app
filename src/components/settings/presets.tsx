/**
 * Presets & Terminal Settings — Manages enabled CLI presets.
 * Allows users to toggle specific agent CLIs on/off so only their preferred
 * tools (e.g. agy and claude) appear in the New Tab [+] menu and launchers.
 */
import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Terminal } from "lucide-react";
import { PresetIcon } from "@/components/PresetIcon";
import { Toggle } from "@/components/settings/profile";
import { api, CLI_PRESETS, type AuthUser } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const CLI_DESCRIPTIONS: Record<string, string> = {
  agy: "Google DeepMind Antigravity CLI — Full agentic pairing, sidecar inspection, and workspace automation.",
  claude: "Anthropic Claude Code CLI — Autonomous coding agent powered by Claude Sonnet & Opus.",
  amp: "Amp Agent — High-throughput streaming codebase editor and iterative development engine.",
  droid: "Factory Droid CLI — Full-stack agent specializing in mobile, native, and full-stack software systems.",
  gemini: "Google Gemini CLI — Native 1M+ context window coding assistant powered by Gemini 2.5 & 3.8.",
  codex: "OpenAI Codex CLI — Terminal command generator, code refactoring, and agent harness.",
  copilot: "GitHub Copilot CLI — Workspace context-aware code suggestions and git command execution.",
  cursor: "Cursor Agent CLI — Fast terminal-based background agent for multi-file workspace changes.",
};

export function PresetsSection({ user: userProp }: { user?: AuthUser | null }) {
  const { auth } = useAuth();
  const user = userProp ?? auth?.user;

  // Parse enabled presets from user profile (default to all if not set or empty)
  const initialPresets = useMemo(() => {
    try {
      if (user?.presets) {
        const parsed = JSON.parse(user.presets);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return new Set<string>(parsed);
        }
      }
    } catch {
      /* ignore */
    }
    return new Set<string>(CLI_PRESETS.map((p) => p.id));
  }, [user?.presets]);

  const [enabledSet, setEnabledSet] = useState<Set<string>>(initialPresets);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEnabledSet(initialPresets);
  }, [initialPresets]);

  const savePresets = async (nextSet: Set<string>) => {
    const list = Array.from(nextSet);
    setEnabledSet(nextSet);
    setSaving(true);
    setError(null);
    try {
      await api.updateUserProfile({ presets: list });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const handleToggle = (id: string) => {
    const next = new Set(enabledSet);
    if (next.has(id)) {
      // Keep at least one enabled
      if (next.size <= 1) return;
      next.delete(id);
    } else {
      next.add(id);
    }
    savePresets(next);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Header Description */}
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          Terminal Presets & CLI Agents
        </h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Customize which agent CLIs appear in workspaces, session launchers, and the New Tab (+) menu.
          Unchecked CLIs are hidden from the menu.
        </p>
      </div>

      {saved && (
        <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-500 animate-in fade-in">
          <Check className="h-3.5 w-3.5" />
          Active CLI presets updated! Only enabled CLIs will appear in the [+] menu.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {error}
        </div>
      )}

      {/* Preset List */}
      <div className="grid grid-cols-1 gap-2.5">
        {CLI_PRESETS.map((p) => {
          const isEnabled = enabledSet.has(p.id);
          const desc = CLI_DESCRIPTIONS[p.id] ?? `Interactive ${p.label} terminal session.`;

          return (
            <div
              key={p.id}
              className={cn(
                "flex items-center justify-between rounded-xl border p-3.5 transition-colors",
                isEnabled
                  ? "border-border/90 bg-card/80 hover:bg-card"
                  : "border-border/40 bg-muted/20 opacity-60 hover:opacity-80",
              )}
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div
                  className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
                    isEnabled
                      ? "border-border/80 bg-muted/60"
                      : "border-border/40 bg-muted/20 opacity-50",
                  )}
                >
                  <PresetIcon preset={p.id} className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-foreground">
                      {p.label}
                    </span>
                    <span className="font-mono text-[11px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                      {p.id}
                    </span>
                    {isEnabled ? (
                      <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-medium">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        In [+] Menu
                      </span>
                    ) : (
                      <span className="text-[10px] text-muted-foreground/70">
                        Hidden
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground line-clamp-1 leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>

              <div className="ml-4 shrink-0">
                <Toggle
                  checked={isEnabled}
                  onChange={() => handleToggle(p.id)}
                  disabled={saving}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Backwards compatibility alias
export const TerminalSection = PresetsSection;

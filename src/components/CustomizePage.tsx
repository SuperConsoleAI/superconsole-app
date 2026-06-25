import { useState, useEffect, useCallback } from "react";
import {
  ChevronRight,
  Loader2,
  Puzzle,
  Webhook,
  ScrollText,
  SquareSlash,
  Search,
  Plus,
  Trash2,
  CheckCircle2,
  Circle,
  Check,
  UserCog,
  Building2,
  FolderClosed,
} from "lucide-react";
import { GitHubLight, GitHubDark } from "@ridemountainpig/svgl-react";
import { api, type HookFile, type PluginListItem } from "../lib/api";
import { useWorkspaces } from "../lib/workspace-context";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { PluginIcon } from "./PluginIcon";
import { SkillsView } from "./SkillsDialog";
import { CommandsView, CommandEditorDialog } from "./CommandDialog";

import { ConnectorManager } from "./SettingsPage";
import { Plug } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuGroup,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const HOOK_META: Record<string, { label: string; description: string }> = {
  "session-start": {
    label: "Session Start",
    description: "Runs when a CLI session opens. Use for env setup, notifications.",
  },
  "session-end": {
    label: "Session End",
    description: "Runs when a CLI session closes. Use for cleanup, HEARTBEAT.md updates.",
  },
  "before-prompt": {
    label: "Before Prompt",
    description: "Runs before every LLM call. Stdout injected into system prompt.",
  },
  "before-mcp": {
    label: "Before MCP Tool",
    description: "Runs before MCP tool executes. Exit code 1 blocks the tool.",
  },
  "before-shell": {
    label: "Before Shell",
    description: "Runs before shell commands in scheduled jobs.",
  },
};

const PLUGIN_CATEGORIES = ["All", "Productivity", "DevOps", "AI", "Analytics", "Communication", "Community", "Developer", "Business", "Design"];

// ─── Hook row ─────────────────────────────────────────────────────────────────

function HookRow({
  hookType,
  hook,
  onEdit,
}: {
  hookType: string;
  hook: HookFile | undefined;
  onEdit: () => void;
}) {
  const meta = HOOK_META[hookType];
  if (!meta) return null;
  const active = hook?.exists ?? false;

  return (
    <div className="flex items-center gap-3 rounded-lg border bg-card px-3.5 py-2.5">
      {/* Active indicator */}
      {active ? (
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" strokeWidth={1.5} />
      ) : (
        <Circle className="h-4 w-4 shrink-0 text-muted-foreground/40" strokeWidth={1.5} />
      )}

      {/* Label + description */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-medium">{meta.label}</span>
          {active && (
            <Badge variant="secondary" className="text-[10px] font-normal text-primary">
              Active
            </Badge>
          )}
        </div>
        <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{meta.description}</p>
      </div>

      {/* Edit button */}
      <Button
        variant="outline"
        size="sm"
        className="h-7 shrink-0 px-3 text-xs"
        onClick={onEdit}
      >
        {active ? "Edit" : "Add"}
      </Button>
    </div>
  );
}

// ─── Hook editor modal ─────────────────────────────────────────────────────────

function HookEditor({
  workspaceId,
  hookType,
  initial,
  onClose,
  onSaved,
}: {
  workspaceId: number;
  hookType: string;
  initial: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = HOOK_META[hookType];

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.writeHook(workspaceId, hookType, content);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.toString() || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!confirm("Delete this hook script?")) return;
    try {
      await api.deleteHook(workspaceId, hookType);
      onSaved();
      onClose();
    } catch (e: any) {
      setError(e?.toString() || "Delete failed");
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-xl border bg-card shadow-2xl">
        {/* Header */}
        <div className="flex items-center gap-3 border-b px-5 py-3">
          <Webhook className="h-4 w-4 text-primary" strokeWidth={1.5} />
          <span className="font-semibold">{meta?.label} Hook</span>
          <span className="ml-auto text-xs text-muted-foreground">{hookType}.sh</span>
        </div>

        {/* Description */}
        <p className="border-b px-5 py-2 text-xs text-muted-foreground">{meta?.description}</p>

        {/* Editor */}
        <textarea
          className="min-h-64 flex-1 resize-none bg-transparent p-5 font-mono text-xs leading-relaxed outline-none"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          spellCheck={false}
          placeholder={`#!/bin/bash\n# ${meta?.label} hook\n`}
        />

        {/* Error */}
        {error && <p className="border-t px-5 py-2 text-xs text-destructive">{error}</p>}

        {/* Footer */}
        <div className="flex items-center gap-2 border-t px-5 py-3">
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
          {initial && (
            <Button size="sm" variant="destructive" onClick={del}>
              Delete
            </Button>
          )}
          <Button size="sm" variant="ghost" className="ml-auto" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Plugin row ────────────────────────────────────────────────────────────────

type InstallStep =
  | { kind: "idle" }
  | { kind: "installing"; steps: { label: string; done: boolean }[] }
  | { kind: "auth"; service: string; authType: string }
  | { kind: "done" };

function PluginRow({
  plugin,
  wsName,
  onInstall,
  onUninstall,
  installing,
  scope,
}: {
  plugin: PluginListItem & { workspaceName?: string };
  wsName: string;
  onInstall: () => void;
  onUninstall: () => void;
  installing: boolean;
  scope: { type: string; id: string };
}) {
  const [expanded, setExpanded] = useState(false);
  const [installStep, setInstallStep] = useState<InstallStep>({ kind: "idle" });
  const [authValue, setAuthValue] = useState("");

  useEffect(() => {
    if (!installing) {
      if (installStep.kind === "installing") {
        const needsAuth = plugin.connectorAuth.length > 0;
        if (needsAuth) {
          setInstallStep({ kind: "auth", service: plugin.connectorAuth[0].service, authType: plugin.connectorAuth[0].authType });
        } else {
          setInstallStep({ kind: "done" });
          setTimeout(() => setInstallStep({ kind: "idle" }), 3000);
        }
      }
      return;
    }
    const steps = [
      plugin.skillCount > 0 ? `Downloading ${plugin.skillCount} skill${plugin.skillCount > 1 ? "s" : ""}` : null,
      plugin.mcpCount > 0 ? `Adding ${plugin.mcpCount} MCP server${plugin.mcpCount > 1 ? "s" : ""}` : null,
      "Registering plugin",
    ].filter(Boolean) as string[];
    setInstallStep({ kind: "installing", steps: steps.map((l) => ({ label: l, done: false })) });
    steps.forEach((_, i) => {
      setTimeout(() => {
        setInstallStep((prev) => {
          if (prev.kind !== "installing") return prev;
          const next = [...prev.steps];
          if (next[i]) next[i] = { ...next[i], done: true };
          return { kind: "installing", steps: next };
        });
      }, 400 * (i + 1));
    });
  }, [installing]);

  const showExpanded = expanded || installing || installStep.kind !== "idle";

  return (
    <div className={cn("flex flex-col rounded-lg border bg-card transition-colors", plugin.installed && "border-primary/30")}>
      {/* Main row */}
      <div
        className="flex cursor-pointer items-center gap-2.5 px-3.5 py-2.5"
        onClick={() => !installing && setExpanded((e) => !e)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => e.key === "Enter" && !installing && setExpanded((v) => !v)}
      >
        {/* Icon */}
        <PluginIcon
          pluginId={plugin.id}
          iconUrl={plugin.iconUrl}
          size={28}
          className="h-7 w-7 rounded-md"
        />

        {/* Name + badges */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-medium">{plugin.name}</span>
            {plugin.installed && (
              <Badge variant="secondary" className="shrink-0 text-[10px] font-normal">{wsName}</Badge>
            )}
            {plugin.featured && (
              <Badge className="shrink-0 bg-amber-500/15 text-[10px] text-amber-600 hover:bg-amber-500/20">Featured</Badge>
            )}
            {plugin.installed && (
              <Badge className="shrink-0 bg-primary/10 text-[10px] text-primary hover:bg-primary/15">✓ Installed</Badge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
            {plugin.skillCount > 0 && <span className="text-[10px] text-muted-foreground">📚 {plugin.skillCount} skill{plugin.skillCount > 1 ? "s" : ""}</span>}
            {plugin.mcpCount > 0 && <span className="text-[10px] text-muted-foreground">🔌 {plugin.mcpCount} MCP</span>}
            {plugin.hookCount > 0 && <span className="text-[10px] text-muted-foreground">🪝 {plugin.hookCount} hook{plugin.hookCount > 1 ? "s" : ""}</span>}
            {plugin.connectorAuth.length > 0 && <span className="text-[10px] text-amber-600">🔑 {plugin.connectorAuth.map((a) => a.service).join(", ")}</span>}
          </div>
        </div>

        {/* Right actions */}
        <div className="ml-auto flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
          {plugin.installed ? (
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-muted-foreground" onClick={onUninstall}>
              <Trash2 className="mr-1 h-3 w-3" strokeWidth={1.5} />
              Uninstall
            </Button>
          ) : (
            <Button size="sm" className="h-7 gap-1 px-2.5 text-xs ring-1" disabled={installing} onClick={onInstall}>
              <Plus className="h-3 w-3" strokeWidth={1.5} />
              {installing ? "Installing…" : "Install"}
            </Button>
          )}
          <button
            className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-accent"
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", showExpanded && "rotate-90")} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {showExpanded && (
        <div className="border-t px-4 py-3">
          {installStep.kind === "idle" && (
            <div className="space-y-1.5 text-xs text-muted-foreground">
              <p className="font-medium text-foreground">Includes</p>
              {plugin.skillCount > 0 && <p>✓ {plugin.skillCount} Skill{plugin.skillCount > 1 ? "s" : ""}</p>}
              {plugin.mcpCount > 0 && <p>✓ {plugin.mcpCount} MCP Server{plugin.mcpCount > 1 ? "s" : ""}</p>}
              {plugin.hookCount > 0 && <p>✓ {plugin.hookCount} Lifecycle Hook{plugin.hookCount > 1 ? "s" : ""}</p>}
              {plugin.connectorAuth.map((a) => (
                <p key={a.service} className="text-amber-600">
                  🔑 {a.service} — {a.authType === "oauth" ? "OAuth required" : "API key required"}
                </p>
              ))}
              {plugin.installed && plugin.connectorAuth.length > 0 && (
                <p className="mt-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-amber-700">
                  Configure credentials in Settings → Connectors.
                </p>
              )}
              <p className="pt-1 text-muted-foreground/60">by {plugin.author} · v{plugin.version}</p>
            </div>
          )}
          {installStep.kind === "installing" && (
            <div className="space-y-1.5 text-xs">
              <p className="font-medium">Installing…</p>
              {installStep.steps.map((step, i) => (
                <div key={i} className={cn("flex items-center gap-2", step.done ? "text-foreground" : "text-muted-foreground")}>
                  {step.done ? <span>✓</span> : <Loader2 className="h-3 w-3 animate-spin" />}
                  {step.label}
                </div>
              ))}
            </div>
          )}
          {installStep.kind === "auth" && (
            <div className="space-y-2 text-xs">
              <p className="font-medium">Connect {installStep.service}</p>
              <p className="text-muted-foreground">
                {installStep.authType === "oauth" ? `Authorize ${installStep.service} to continue.` : `Enter your ${installStep.service} API key.`}
              </p>
              {installStep.authType === "oauth" ? (
                <Button size="sm" className="h-7 text-xs" onClick={() => setInstallStep({ kind: "done" })}>
                  Connect with {installStep.service} →
                </Button>
              ) : (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="password"
                    placeholder="API Key"
                    value={authValue}
                    onChange={(e) => setAuthValue(e.target.value)}
                    className="h-7 flex-1 rounded-md border bg-background px-2 text-xs outline-none"
                  />
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!authValue.trim()}
                    onClick={async () => {
                      try {
                        await api.setConnector(scope.type as any, scope.id, installStep.service, { api_key: authValue });
                      } catch (e) {
                        console.error("Failed to save connector", e);
                      }
                      setInstallStep({ kind: "done" });
                      setTimeout(() => setInstallStep({ kind: "idle" }), 3000);
                    }}
                  >
                    Save &amp; Finish
                  </Button>
                </div>
              )}
              <button className="text-muted-foreground hover:text-foreground" onClick={() => { setInstallStep({ kind: "done" }); setTimeout(() => setInstallStep({ kind: "idle" }), 3000); }}>
                Skip for now
              </button>
            </div>
          )}
          {installStep.kind === "done" && (
            <div className="space-y-0.5 text-xs">
              <p className="font-medium text-primary">✓ {plugin.name} installed!</p>
              <p className="text-muted-foreground">Your agent can now use {plugin.name} in this workspace.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main CustomizePage ────────────────────────────────────────────────────────

export function CustomizePage({ initialWorkspaceId }: { initialWorkspaceId?: number }) {
  const { workspaces, organizations } = useWorkspaces();

  const [tab, setTab] = useState<"plugins" | "hooks" | "skills" | "commands" | "connectors">("plugins");

  const [scope, setScope] = useState<{ type: "account" | "org" | "project", id: string }>({
    type: initialWorkspaceId ? "project" : "account",
    id: initialWorkspaceId ? String(initialWorkspaceId) : "account",
  });

  // Keep scope in sync with route param
  useEffect(() => {
    if (initialWorkspaceId) {
      setScope({ type: "project", id: String(initialWorkspaceId) });
    }
  }, [initialWorkspaceId]);

  const wsName = (id: string) => workspaces.find((w) => String(w.id) === id)?.name ?? "unknown";
  const orgName = (id: string) => organizations.find((o) => String(o.id) === id)?.name ?? "unknown";

  // ── Plugins state ──────────────────────────────────────────────────────────
  const [plugins, setPlugins] = useState<PluginListItem[]>([]);
  const [pluginsLoading, setPluginsLoading] = useState(false);
  const [pluginsError, setPluginsError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [installing, setInstalling] = useState<string | null>(null);
  const [githubUrl, setGithubUrl] = useState("");
  const [urlInstalling, setUrlInstalling] = useState(false);
  const [urlResult, setUrlResult] = useState<string | null>(null);

  const loadPlugins = useCallback(async (q: string, cat: string, scp: { type: string, id: string }) => {
    setPluginsLoading(true);
    setPluginsError(null);
    try {
      const data = q.trim()
        ? await api.searchPluginsCatalog(scp.type, scp.id, q)
        : await api.listPluginsCatalog(scp.type, scp.id, cat === "All" ? undefined : cat);
      setPlugins(data);
    } catch (e: any) {
      setPluginsError(e?.toString() || "Failed to load plugins");
      setPlugins([]);
    } finally {
      setPluginsLoading(false);
    }
  }, []);

  useEffect(() => { if (tab === "plugins") loadPlugins(query, category, scope); }, [tab, scope, query, category]);

  const handleInstall = async (pluginId: string) => {
    if (!scope.id) return;
    setInstalling(pluginId);
    try { await api.installPlugin(scope.type, scope.id, pluginId); await loadPlugins(query, category, scope); }
    catch (e: any) { setPluginsError(e?.toString() || "Install failed"); }
    finally { setInstalling(null); }
  };

  const handleUninstall = async (pluginId: string) => {
    if (!scope || !confirm("Uninstall this plugin? Files are kept on disk.")) return;
    try { await api.uninstallPlugin(scope.type, scope.id, pluginId); await loadPlugins(query, category, scope); }
    catch (e: any) { setPluginsError(e?.toString() || "Uninstall failed"); }
  };

  const handleInstallFromUrl = async () => {
    if (!githubUrl.trim() || !scope) return;
    setUrlInstalling(true); setUrlResult(null);
    try {
      const msg = await api.installPluginFromUrl(scope.type, scope.id, githubUrl.trim());
      setUrlResult(msg); setGithubUrl("");
      await loadPlugins(query, category, scope);
    } catch (e: any) { setPluginsError(e?.toString() || "Install from URL failed"); }
    finally { setUrlInstalling(false); }
  };

  // ── Hooks state ────────────────────────────────────────────────────────────
  const [hooks, setHooks] = useState<HookFile[]>([]);
  const [hooksLoading, setHooksLoading] = useState(false);
  const [editingHook, setEditingHook] = useState<string | null>(null);
  const [addCommandOpen, setAddCommandOpen] = useState<any>(null);

  const loadHooks = useCallback(async (scopeType: string, scopeId: string) => {
    if (scopeType !== "project" || !scopeId || scopeId === "account") { setHooks([]); return; }
    setHooksLoading(true);
    try { setHooks(await api.listHooks(Number(scopeId))); }
    catch { setHooks([]); }
    finally { setHooksLoading(false); }
  }, []);

  useEffect(() => { if (tab === "hooks") loadHooks(scope.type, scope.id); }, [tab, scope]);

  const editingHookFile = hooks.find((h) => h.hookType === editingHook);

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full flex-col">
      {/* ── Top bar (same as TasksView) ──────────────────────────────────────── */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b bg-card/60 px-5">
        {/* Tab toggle pill */}
        <div className="flex gap-0.5 rounded-lg border bg-background p-0.5">
          <button
            onClick={() => setTab("plugins")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "plugins" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Puzzle className="h-3.5 w-3.5" strokeWidth={1} />
              Plugins
            </span>
          </button>
          <button
            onClick={() => setTab("hooks")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "hooks" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Webhook className="h-3.5 w-3.5" strokeWidth={1} />
              Hooks
            </span>
          </button>

          <button
            onClick={() => setTab("skills")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "skills" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              <ScrollText className="h-3.5 w-3.5" strokeWidth={1} />
              Skills
            </span>
          </button>
          <button
            onClick={() => setTab("commands")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "commands" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              <SquareSlash className="h-3.5 w-3.5" strokeWidth={1} />
              Commands
            </span>
          </button>

          <button
            onClick={() => setTab("connectors")}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              tab === "connectors" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            <span className="flex items-center gap-1.5">
              <Plug className="h-3.5 w-3.5" strokeWidth={1} />
              Connectors
            </span>
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          
          {tab === "commands" && scope?.type === "project" && (
            <Button size="sm" className="h-7 gap-1" onClick={() => setAddCommandOpen({ name: "", slash: "", description: "", content: "", isNew: true })}>
              <Plus className="h-3.5 w-3.5" />
              Add command
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-7 font-normal gap-2 px-2.5">
                {scope.type === "account" ? (
                  <>
                    <UserCog className="h-4 w-4 text-muted-foreground" />
                    Account
                  </>
                ) : scope.type === "org" ? (
                  <>
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    {orgName(scope.id)}
                  </>
                ) : (
                  <>
                    <FolderClosed className="h-4 w-4 text-muted-foreground" />
                    {wsName(scope.id)}
                  </>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={() => setScope({ type: "account", id: "account" })} className="justify-between font-medium">
                <span className="flex items-center gap-2">
                  <UserCog className="h-4 w-4 text-muted-foreground" />
                  Account (machine)
                </span>
                {scope.type === "account" && <Check className="h-4 w-4" />}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {organizations.map((o) => {
                const orgWorkspaces = workspaces.filter((w) => w.organization_id === o.id);
                return (
                  <DropdownMenuGroup key={o.id}>
                    <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                      Organization
                    </div>
                    <DropdownMenuItem
                      onClick={() => setScope({ type: "org", id: String(o.id) })}
                      className="justify-between font-medium"
                    >
                      <span className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {o.name} (Org)
                      </span>
                      {scope.type === "org" && scope.id === String(o.id) && <Check className="h-4 w-4" />}
                    </DropdownMenuItem>

                    {orgWorkspaces.length > 0 && (
                      <>
                        <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                          Projects
                        </div>
                        {orgWorkspaces.map((w) => (
                          <DropdownMenuItem
                            key={w.id}
                            onClick={() => setScope({ type: "project", id: String(w.id) })}
                            className="pl-4 justify-between"
                          >
                            <span className="flex items-center gap-2">
                              <FolderClosed className="h-3.5 w-3.5 text-muted-foreground" />
                              {w.name}
                            </span>
                            {scope.type === "project" && scope.id === String(w.id) && <Check className="h-4 w-4" />}
                          </DropdownMenuItem>
                        ))}
                      </>
                    )}
                    <DropdownMenuSeparator />
                  </DropdownMenuGroup>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Plugins tab ──────────────────────────────────────────────────────── */}
      {tab === "plugins" && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-3 px-5 py-4">
            {/* Search + category row */}
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
                <input
                  type="text"
                  placeholder="Search plugins…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadPlugins(query, category, scope)}
                  className="h-8 w-full rounded-md border bg-background pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <Button size="sm" className="h-8 px-3 text-xs" onClick={() => loadPlugins(query, category, scope)}>
                Search
              </Button>
            </div>

            {/* Category pills */}
            <div className="flex flex-wrap gap-1.5">
              {PLUGIN_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => { setCategory(cat); loadPlugins(query, cat, scope); }}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                    category === cat
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground hover:bg-muted",
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Install from URL */}
            <div className="rounded-lg border bg-card px-4 py-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <GitHubLight className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground dark:hidden" />
                  <GitHubDark className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground hidden dark:block" />
                  <input
                    type="text"
                    placeholder="https://github.com/owner/plugin-repo"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleInstallFromUrl()}
                    className="h-7 w-full rounded-md border bg-background pl-8 pr-2.5 text-xs outline-none focus:ring-1 focus:ring-primary"
                  />
                </div>
                <Button size="sm" className="h-7 px-3 text-xs" disabled={urlInstalling || !githubUrl.trim()} onClick={handleInstallFromUrl}>
                  {urlInstalling ? "Installing…" : "Install"}
                </Button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Paste a GitHub repo URL with a <code className="rounded bg-muted px-1 py-0.5">superconsole.json</code> manifest.
              </p>
              {urlResult && <p className="mt-1.5 text-[11px] text-primary">✓ {urlResult}</p>}
            </div>

            {/* Error */}
            {pluginsError && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">{pluginsError}</div>
            )}

            {/* No workspace */}
            {!scope && (
              <div className="rounded-xl border border-dashed py-16 text-center">
                <Puzzle className="mx-auto h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
                <p className="mt-3 text-sm text-muted-foreground">Select a project to browse and install plugins.</p>
              </div>
            )}

            {/* Loading */}
            {pluginsLoading && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading plugins…
              </div>
            )}

            {/* Empty */}
            {!pluginsLoading && scope && plugins.length === 0 && !pluginsError && (
              <div className="rounded-xl border border-dashed py-16 text-center">
                <Puzzle className="mx-auto h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
                <p className="mt-3 text-sm text-muted-foreground">
                  {query ? "No plugins match your search." : "No plugins in catalog yet — install from a GitHub URL above."}
                </p>
              </div>
            )}

            {/* Plugin list */}
            {!pluginsLoading && (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {plugins.map((p) => (
                  <PluginRow
                    key={p.id}
                    plugin={p}
                    wsName={scope ? wsName(scope.id) : ""}
                    scope={scope}
                    onInstall={() => handleInstall(p.id)}
                    onUninstall={() => handleUninstall(p.id)}
                    installing={installing === p.id}
                  />
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      )}

      {/* ── Hooks tab ────────────────────────────────────────────────────────── */}
      {tab === "hooks" && (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-2 px-5 py-4">
            {/* No workspace */}
            {!scope && (
              <div className="rounded-xl border border-dashed py-16 text-center">
                <Webhook className="mx-auto h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
                <p className="mt-3 text-sm text-muted-foreground">Select a project to manage lifecycle hooks.</p>
              </div>
            )}

            {/* Loading */}
            {hooksLoading && (
              <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading hooks…
              </div>
            )}

            {/* Hook rows */}
            {!hooksLoading && scope && Object.keys(HOOK_META).map((hookType) => (
              <HookRow
                key={hookType}
                hookType={hookType}
                hook={hooks.find((h) => h.hookType === hookType)}
                onEdit={() => setEditingHook(hookType)}
              />
            ))}
          </div>
        </ScrollArea>
      )}

      {tab === "skills" && (
        <ScrollArea className="min-h-0 flex-1">
          {scope && scope.type === "project" ? (
             <SkillsView workspaceId={Number(scope.id)} />
          ) : (
             <div className="flex flex-col items-center justify-center py-16 text-center px-5">
               <ScrollText className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
               <p className="mt-3 text-sm text-muted-foreground">Select a project to manage skills.</p>
             </div>
          )}
        </ScrollArea>
      )}
      
      {tab === "commands" && (
        <ScrollArea className="min-h-0 flex-1">
          {scope && scope.type === "project" ? (
             <CommandsView workspaceId={Number(scope.id)} />
          ) : (
             <div className="flex flex-col items-center justify-center py-16 text-center px-5">
               <SquareSlash className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
               <p className="mt-3 text-sm text-muted-foreground">Select a project to manage commands.</p>
             </div>
          )}
        </ScrollArea>
      )}

      {tab === "connectors" && (
        <ScrollArea className="min-h-0 flex-1">
          {scope ? (
             <div className="px-5 py-4">
               <ConnectorManager scope={scope.type} scopeId={scope.id} category="connectors" />
             </div>
          ) : (
             <div className="flex flex-col items-center justify-center py-16 text-center px-5">
               <Plug className="h-8 w-8 text-muted-foreground/40" strokeWidth={1} />
               <p className="mt-3 text-sm text-muted-foreground">Select a scope to manage connectors.</p>
             </div>
          )}
        </ScrollArea>
      )}

      {/* ── Hook editor modal ─────────────────────────────────────────────────── */}
      {editingHook && scope && (
        <HookEditor
          workspaceId={Number(scope.id)}
          hookType={editingHook}
          initial={editingHookFile?.content ?? ""}
          onClose={() => setEditingHook(null)}
          onSaved={() => loadHooks(scope.type, scope.id)}
        />
      )}

      {/* ── Command editor modal ──────────────────────────────────────────────── */}
      {scope && scope.type === "project" && (
        <CommandEditorDialog 
          workspaceId={Number(scope.id)} 
          editing={addCommandOpen} 
          setEditing={setAddCommandOpen} 
        />
      )}
    </div>
  );
}

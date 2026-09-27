/**
 * ComposerPlusMenu — reusable [+] button for the chat composer.
 *
 * Connector cascade (industry-standard scope inheritance):
 *   project scope   → agent uses project connector
 *   org scope only  → agent falls back to org connector
 *   account only    → agent falls back to account connector
 *
 * UI:
 *   - A single "Connectors" menu handles all scopes (flat list with dividers, max 2 levels deep).
 *   - "Project" section always shown if project connectors exist.
 *   - "Org" section shown only when a connector is NOT in project scope.
 *   - "Account" section shown only when a connector is NOT in org OR project scope.
 *   - Each connector row has a toggle (default ON) that inserts /connector:X into composer.
 */

import { useEffect, useState } from "react";
import {
  BookOpen,
  Bot,
  Building2,
  ClipboardList,
  FolderClosed,
  Globe,
  Paperclip,
  Plug,
  Plus,
  ScrollText,
  SquareSlash,
  UserCog,
  Wrench,
} from "lucide-react";
import { api, type Agent, type ContextFile, type SessionLogFile, type Skill, type SlashCommand } from "@/lib/api";
import { Button } from "@/components/ui/button";
// Switch-based toggle implemented inline
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


interface ComposerPlusMenuProps {
  workspaceId: number;
  projectId: string | null;
  orgId: string | null;
  userId: string | null;
  toolMode?: "auto" | "direct";
  setToolMode?: (m: "auto" | "direct") => void;
  onInsert: (snippet: string) => void;
  onPickFiles: () => void;
  onGoSettings: () => void;
  onGoSettingsTo: (tab: "account" | "org" | "project", section: string) => void;
  onGoAgents: () => void;
  triggerClassName?: string;
  iconClassName?: string;
}

export function ComposerPlusMenu({
  workspaceId,
  projectId,
  orgId,
  userId,
  toolMode,
  setToolMode,
  onInsert,
  onPickFiles,
  onGoSettings,
  onGoSettingsTo,
  onGoAgents,
  triggerClassName = "h-7 w-7 shrink-0",
  iconClassName = "h-4 w-4",
}: ComposerPlusMenuProps) {
  // Per-scope connector lists (service names)
  const [projectConnectors, setProjectConnectors] = useState<string[]>([]);
  const [orgConnectors, setOrgConnectors] = useState<string[]>([]);
  const [accountConnectors, setAccountConnectors] = useState<string[]>([]);

  // Toggle state: connector service → enabled (default true)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({});

  // Other menu data
  const [skills, setSkills] = useState<Skill[]>([]);
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [ctxFiles, setCtxFiles] = useState<ContextFile[]>([]);
  const [sessionLogs, setSessionLogs] = useState<SessionLogFile[]>([]);

  // Load workspace data
  useEffect(() => {
    api.listSkills(workspaceId).then((s) => setSkills(s.filter((x) => x.active))).catch(() => setSkills([]));
    api.listCommands(workspaceId).then(setCommands).catch(() => setCommands([]));
    api.listAgents(workspaceId).then(setAgents).catch(() => setAgents([]));
    api.listContextFiles(workspaceId).then(setCtxFiles).catch(() => setCtxFiles([]));
    api.listSessionLogFiles(workspaceId).then(setSessionLogs).catch(() => setSessionLogs([]));
  }, [workspaceId]);

  // Load project connectors
  useEffect(() => {
    if (!projectId) { setProjectConnectors([]); return; }
    api.listConnectors("project", projectId)
      .then((c) => setProjectConnectors(c.map((x) => x.service)))
      .catch(() => setProjectConnectors([]));
  }, [projectId]);

  // Load org connectors
  useEffect(() => {
    if (!orgId) { setOrgConnectors([]); return; }
    api.listConnectors("org", orgId)
      .then((c) => setOrgConnectors(c.map((x) => x.service)))
      .catch(() => setOrgConnectors([]));
  }, [orgId]);

  // Load account connectors
  useEffect(() => {
    if (!userId) { setAccountConnectors([]); return; }
    api.listConnectors("account", userId)
      .then((c) => setAccountConnectors(c.map((x) => x.service)))
      .catch(() => setAccountConnectors([]));
  }, [userId]);

  // Cascade: for each connector, determine the effective scope (most specific available)
  // org connector row = shown only if same service NOT in project
  // account connector row = shown only if NOT in project AND NOT in org
  const orgOnly = orgConnectors.filter((s) => !projectConnectors.includes(s));
  const accountOnly = accountConnectors.filter(
    (s) => !projectConnectors.includes(s) && !orgConnectors.includes(s),
  );

  // All effective connectors (for web_search check etc.)
  const allEffective = [
    ...projectConnectors,
    ...orgOnly,
    ...accountOnly,
  ];

  const toggleConnector = (service: string) => {
    const next = !(enabled[service] ?? true);
    setEnabled((prev) => ({ ...prev, [service]: next }));
    if (next) onInsert(`/connector:${service}`);
  };

  // ConnectorRow — plain toggle row (project scope, org, account all use same look)
  const ConnectorRow = ({ service }: { service: string }) => {
    const on = enabled[service] ?? true;
    return (
      <div
        className="flex items-center justify-between px-2 py-1.5 hover:bg-accent rounded-sm cursor-default select-none"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-sm truncate">{service}</span>
        <button
          onClick={() => toggleConnector(service)}
          aria-label={on ? "Disable" : "Enable"}
          className={`ml-3 relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none ${on ? "bg-toggle-box hover:bg-toggle-box-hover" : "bg-input"}`}
        >
          <span className={`pointer-events-none block h-3 w-3 rounded-full bg-toggle-circle shadow-lg ring-0 transition-transform ${on ? "translate-x-3" : "translate-x-0"}`} />
        </button>
      </div>
    );
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className={triggerClassName} title="Insert skill / connector / context">
          <Plus className={iconClassName} strokeWidth={triggerClassName.includes('h-5') ? 1.5 : undefined} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-60">

        {/* Files */}
        <DropdownMenuItem onClick={onPickFiles}>
          <Paperclip className="h-4 w-4" />
          Add files
          <DropdownMenuShortcut>⌘U</DropdownMenuShortcut>
        </DropdownMenuItem>

        {/* Skills */}
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
                <DropdownMenuItem key={s.name} onClick={() => onInsert(`/skill:${s.name}`)} className="font-mono text-xs">
                  {s.name}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onGoSettingsTo("project", "Skills")}>
              <Plus className="h-3.5 w-3.5" /> Add skill
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Agents */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Bot className="h-4 w-4" />
            Agents
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
            {agents.length === 0 ? (
              <DropdownMenuItem disabled>No agents</DropdownMenuItem>
            ) : (
              agents.map((a) => (
                <DropdownMenuItem key={a.name} onClick={() => onInsert(`/agent:${a.name}`)} className="font-mono text-xs">
                  {a.name}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onGoAgents}>
              <Plus className="h-3.5 w-3.5" /> Add agent
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* ── Connectors (all scopes, flat with dividers) ─────────────────── */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Plug className="h-4 w-4" />
            Connectors
            {allEffective.length > 0 && (
              <span className="ml-auto text-[10px] text-muted-foreground">{allEffective.length}</span>
            )}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-60 max-h-[70vh] overflow-y-auto">

            <DropdownMenuItem onClick={() => onGoSettingsTo("project", "Connectors")}>
              <Plus className="h-3.5 w-3.5" /> Add connector
            </DropdownMenuItem>

            {allEffective.length === 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>None connected</DropdownMenuItem>
              </>
            )}

            {/* Project scope */}
            {projectConnectors.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
                  <FolderClosed className="h-3.5 w-3.5" /> Project
                </DropdownMenuLabel>
                {projectConnectors.map((c) => (
                  <ConnectorRow key={c} service={c} />
                ))}
              </>
            )}

            {/* Org scope — only services NOT in project */}
            {orgOnly.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
                  <Building2 className="h-3.5 w-3.5" /> Organization
                </DropdownMenuLabel>
                {orgOnly.map((c) => (
                  <ConnectorRow key={c} service={c} />
                ))}
              </>
            )}

            {/* Account scope — only services NOT in project or org */}
            {accountOnly.length > 0 && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground">
                  <UserCog className="h-3.5 w-3.5" /> Account
                </DropdownMenuLabel>
                {accountOnly.map((c) => (
                  <ConnectorRow key={c} service={c} />
                ))}
              </>
            )}

            {/* Tool access */}
            {toolMode && setToolMode && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel className="flex items-center gap-2 px-2 py-1 text-xs text-muted-foreground">
                  <Wrench className="h-3.5 w-3.5" />
                  Tool access
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup value={toolMode} onValueChange={(v) => setToolMode(v as "auto" | "direct")}>
                  <DropdownMenuRadioItem value="auto">Load tools when needed</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="direct">Tools already loaded</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </>
            )}

          </DropdownMenuSubContent>
        </DropdownMenuSub>


        {/* Context */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <BookOpen className="h-4 w-4" />
            Context
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
            {ctxFiles.length === 0 ? (
              <DropdownMenuItem disabled>No context files</DropdownMenuItem>
            ) : (
              ctxFiles.map((f) => (
                <DropdownMenuItem key={f.slug} onClick={() => onInsert(`/context:${f.slug}`)} className="font-mono text-xs">
                  {f.slug}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onGoSettingsTo("project", "Context")}>
              <Plus className="h-3.5 w-3.5" /> Add context file
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Commands */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <SquareSlash className="h-4 w-4" />
            Commands
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 w-56 overflow-y-auto">
            {commands.length === 0 ? (
              <DropdownMenuItem disabled>No commands</DropdownMenuItem>
            ) : (
              commands.map((c) => (
                <DropdownMenuItem key={c.file_path} onClick={() => onInsert(c.slash)} className="font-mono text-xs">
                  {c.slash}
                </DropdownMenuItem>
              ))
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onGoSettingsTo("project", "Commands")}>
              <Plus className="h-3.5 w-3.5" /> Add command
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Sessions */}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ClipboardList className="h-4 w-4" />
            Sessions
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 w-60 overflow-y-auto">
            {sessionLogs.length === 0 ? (
              <DropdownMenuItem disabled>No saved sessions</DropdownMenuItem>
            ) : (
              sessionLogs.map((s) => (
                <DropdownMenuItem key={s.id} onClick={() => onInsert(`/session:${s.id}`)} className="flex-col items-start font-mono text-xs">
                  <span className="truncate">{s.id}</span>
                  {s.summary && <span className="truncate text-[10px] text-muted-foreground">{s.summary}</span>}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        {/* Web search quick-connect */}
        <DropdownMenuItem onClick={allEffective.includes("web_search") ? undefined : onGoSettings}>
          <Globe className="h-4 w-4" />
          Web search
          <DropdownMenuShortcut>
            {allEffective.includes("web_search") ? "connected" : "connect"}
          </DropdownMenuShortcut>
        </DropdownMenuItem>

      </DropdownMenuContent>
    </DropdownMenu>
  );
}

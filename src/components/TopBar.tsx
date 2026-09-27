import { useState, useEffect, useRef } from "react";
import { useRouter, useNavigate } from "@tanstack/react-router";
import {
  Bot,
  Brain,
  CalendarClock,
  ChevronDown,
  FileText,
  GitBranch,
  GitCommit,
  Library,
  PanelLeft,
  PanelRight,
  Play,
  ScrollText,
  SquareSlash,
  Upload,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JobsDialog } from "@/components/JobsDialog";
import { AgentsDialog } from "@/components/AgentsDialog";
import { SkillsDialog } from "@/components/SkillsDialog";
import { CommandDialog } from "@/components/CommandDialog";
import { MemoryDialog } from "@/components/MemoryDialog";
import { WikiDialog } from "@/components/WikiDialog";
import { ContextDialog } from "@/components/ContextDialog";
import { GitDialog } from "@/components/GitDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaces } from "@/lib/workspace-context";
import { type Workspace, type GitStatus, api } from "@/lib/api";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { cn } from "@/lib/utils";

import {
  InboxNavbar,
  TasksNavbar,
  SessionsNavbar,
  UsageNavbar,
  AgentsNavbar,
  CustomizeNavbar,
  SettingsNavbar,
} from "@/components/navbars";

interface TopBarProps {
  isProjectPage?: boolean;
  titleSuffix?: string;
  workspace: Workspace | null;
  filesOpen: boolean;
  sidebarOpen: boolean;
  onToggleFiles: () => void;
  onToggleSidebar: () => void;
}

export function TopBar({
  workspace,
  filesOpen,
  sidebarOpen,
  onToggleFiles,
  onToggleSidebar,
  isProjectPage,
  titleSuffix,
}: TopBarProps) {
  const router = useRouter();
  const navigate = useNavigate();
  const { openScriptTab, workspaces } = useWorkspaces();
  const currentWorkspace = workspace ?? (workspaces.length > 0 ? workspaces[0] : null);
  const pathname = router.state.location.pathname;

  const [jobsOpen, setJobsOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [gitOpen, setGitOpen] = useState(false);
  const [gitDialogStep, setGitDialogStep] = useState<"commit" | "publish">("commit");

  // Git status — null means "not a git repo" → hide button
  // undefined means "not yet loaded"
  const [gitStatus, setGitStatus] = useState<GitStatus | null | undefined>(undefined);
  const [isGitRepo, setIsGitRepo] = useState<boolean | null>(null); // null = unknown
  const [initializingGit, setInitializingGit] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollGitStatus = async (wsId: number) => {
    try {
      const status = await api.gitStatus(wsId);
      setGitStatus(status);
      setIsGitRepo(true);
    } catch {
      // Not a git repo or git not available — hide branch button
      setGitStatus(null);
      setIsGitRepo(false);
    }
  };

  useEffect(() => {
    if (!workspace || !isProjectPage) {
      setGitStatus(undefined);
      setIsGitRepo(null);
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    const wsId = workspace.id;
    pollGitStatus(wsId);
    // 4s poll — fast enough to feel live without hammering git
    pollRef.current = setInterval(() => pollGitStatus(wsId), 4_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [workspace?.id, isProjectPage]);

  const handleInitGit = async () => {
    if (!workspace) return;
    setInitializingGit(true);
    try {
      await api.gitInitRepo(workspace.id);
      await pollGitStatus(workspace.id);
    } catch (e) {
      console.error("git init failed:", e);
    } finally {
      setInitializingGit(false);
    }
  };

  const handleCommitted = () => {
    // Refresh git status after a commit
    if (workspace) pollGitStatus(workspace.id);
  };

  const [isFullscreen, setIsFullscreen] = useState(false);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    async function initFullscreen() {
      try {
        const appWindow = getCurrentWindow();
        const fs = await appWindow.isFullscreen();
        setIsFullscreen(fs);

        unlisten = await appWindow.onResized(async () => {
          try {
            const isFs = await appWindow.isFullscreen();
            setIsFullscreen(isFs);
          } catch {}
        });
      } catch {
        setIsFullscreen(Boolean(document.fullscreenElement));
      }
    }

    initFullscreen();

    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);

    return () => {
      if (unlisten) unlisten();
      document.removeEventListener("fullscreenchange", handleFsChange);
    };
  }, []);

  return (
    <header
      data-tauri-drag-region
      className="relative z-10 flex h-[2.5rem] shrink-0 items-center border-b bg-card/60 backdrop-blur"
    >
      <div
        className={cn(
          "pointer-events-none absolute left-0 top-0 w-64 border-r border-sidebar-border bg-sidebar",
          sidebarOpen ? "opacity-100" : "opacity-0"
        )}
        style={{ zIndex: -1, bottom: "-1px" }}
      />
      {workspace && (
        <div
          className={cn(
            "pointer-events-none absolute right-0 top-0 border-l border-border bg-sidebar",
            filesOpen ? "opacity-100" : "opacity-0"
          )}
          style={{ zIndex: -1, bottom: 0, width: "var(--file-panel-width, 256px)" }}
        />
      )}

      {/* Left controls container — exactly matches sidebar width (w-64 = 256px) when open */}
      <div
        className={cn(
          "flex items-center shrink-0 transition-all",
          isFullscreen ? "pl-3" : "pl-[84px]",
          sidebarOpen ? "w-64 pr-3 justify-between" : "w-auto pr-3"
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn("h-6 w-6 shrink-0", !sidebarOpen && "text-primary")}
                onClick={onToggleSidebar}
              >
                <PanelLeft className="h-4 w-4" strokeWidth={1} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{sidebarOpen ? "Hide sidebar" : "Show sidebar"}</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={() => navigate({ to: "/" })}
            className="truncate font-brand text-[15px] font-semibold tracking-tight text-foreground select-none hover:opacity-80 transition-opacity cursor-pointer text-left"
            title="Dashboard"
          >
            Super<span className="font-normal text-muted-foreground">Console</span>
          </button>
        </div>
      </div>

      {!sidebarOpen && (
        <div className="h-4 w-px bg-border/80 shrink-0 self-center" />
      )}

      {!isProjectPage ? (
        <div className="flex min-w-0 flex-1 items-center px-5">
          {pathname === "/tasks" && <TasksNavbar />}
          {pathname === "/inbox" && <InboxNavbar />}
          {pathname === "/sessions" && <SessionsNavbar />}
          {pathname === "/usage" && <UsageNavbar />}
          {pathname === "/agents" && <AgentsNavbar />}
          {pathname === "/customize" && <CustomizeNavbar />}
          {pathname === "/settings" && <SettingsNavbar />}
        </div>
      ) : (
        workspace && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex min-w-0 cursor-default items-center gap-1.5 pointer-events-auto",
                  !(sidebarOpen || filesOpen) &&
                    "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
                  (sidebarOpen || filesOpen) && "ml-4"
                )}
              >
                <span className="truncate text-xs font-medium">
                  {workspace.name}
                  {titleSuffix ? ` — ${titleSuffix}` : ""}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent>{workspace.path}</TooltipContent>
          </Tooltip>
        )
      )}

      {isProjectPage && (
        <div className="ml-auto flex items-center gap-1 pr-4">
          <div id="topbar-portal" className="flex items-center gap-2 mr-1" />
          {/* ── Git: Initialize Git (non-repo) ─────────── */}
          {workspace && isGitRepo === false && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-6 px-2.5 text-[11px] gap-1.5 text-muted-foreground hover:text-foreground"
                  onClick={handleInitGit}
                  disabled={initializingGit}
                >
                  <GitBranch className="h-3 w-3" strokeWidth={1.5} />
                  {initializingGit ? "Initializing…" : "Initialize Git"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Initialize git repository in this workspace</TooltipContent>
            </Tooltip>
          )}

        {/* ── Git: single split button ───────────────────── */}
        {workspace && isProjectPage && gitStatus && (() => {
          const isDirty = gitStatus.isDirty
          const noRemote = !gitStatus.hasRemote
          const hasAhead = gitStatus.ahead > 0

          // Which label + icon to show on the left action button
          const label = isDirty ? "Commit"
            : noRemote ? "Publish"
            : hasAhead ? "Push"
            : null   // clean + remote + no commits to push → hide

          if (!label) return null

          const icon = isDirty
            ? <GitCommit className="h-3 w-3" strokeWidth={1.5} />
            : <Upload className="h-3 w-3" />

          const openCommit = () => { setGitDialogStep("commit"); setGitOpen(true) }
          const openPublish = () => { setGitDialogStep("publish"); setGitOpen(true) }

          return (
            <div className={cn(
              "flex items-center h-6 overflow-hidden rounded-md border bg-background shadow-sm",
              isDirty ? "border-amber-400/50" : "border-input"
            )}>
              {/* Left: direct action — same px/hover as Manage left cell */}
              <button
                onClick={isDirty || hasAhead ? openCommit : openPublish}
                className={cn(
                  "flex items-center gap-1.5 px-1.5 h-full text-[11px] font-medium hover:bg-accent transition-colors",
                  isDirty ? "text-amber-400" : "text-muted-foreground"
                )}
              >
                {icon}
                {label}
              </button>

              {/* Divider — same as Manage */}
              <div className="w-px h-full bg-border shrink-0" />

              {/* Right: ▾ dropdown — same px/hover as Manage right cell */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "px-1 h-full flex items-center hover:bg-accent transition-colors",
                    isDirty ? "text-amber-400" : "text-muted-foreground"
                  )}>
                    <ChevronDown className="h-3 w-3 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem
                    onClick={openCommit}
                    disabled={!isDirty && gitStatus.hasCommits}
                    className="gap-2"
                  >
                    <GitCommit className="h-3.5 w-3.5" strokeWidth={1.5} />
                    <div>
                      <div>Commit</div>
                      {!isDirty && gitStatus.hasCommits && (
                        <div className="text-[10px] text-muted-foreground normal-case font-normal">
                          Worktree is clean
                        </div>
                      )}
                    </div>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={openPublish} className="gap-2">
                    <Upload className="h-3.5 w-3.5" />
                    Publish repository…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )
        })()}

        {workspace && isProjectPage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 p-0 overflow-hidden gap-0">
                <div className="flex h-full items-center px-1.5 hover:bg-accent">
                  <span className="text-[11px] font-medium text-muted-foreground">Manage</span>
                </div>
                <div className="h-full w-px bg-border shrink-0" />
                <div className="flex h-full items-center px-1 hover:bg-accent">
                  <ChevronDown className="h-3 w-3 text-muted-foreground shrink-0" />
                </div>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem
                onClick={() =>
                  workspace.script_run?.trim()
                    ? openScriptTab(workspace.id, "Run", workspace.script_run)
                    : null
                }
                disabled={!workspace.script_run?.trim()}
              >
                <Play className="mr-2 h-4 w-4" />
                <span>Run script</span>
              </DropdownMenuItem>

              <DropdownMenuItem onClick={() => setSkillsOpen(true)}>
                <ScrollText className="mr-2 h-4 w-4" />
                <span>Skills</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCommandsOpen(true)}>
                <SquareSlash className="mr-2 h-4 w-4" />
                <span>Commands</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setMemoryOpen(true)}>
                <Brain className="mr-2 h-4 w-4" />
                <span>Memory</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setWikiOpen(true)}>
                <Library className="mr-2 h-4 w-4" />
                <span>Wiki</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setContextOpen(true)}>
                <FileText className="mr-2 h-4 w-4" />
                <span>Context</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setJobsOpen(true)}>
                <CalendarClock className="mr-2 h-4 w-4" />
                <span>Schedule</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAgentsOpen(true)}>
                <Bot className="mr-2 h-4 w-4" />
                <span>Agents</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {workspace && isProjectPage && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={filesOpen ? "secondary" : "ghost"}
                size="icon"
                className={cn("h-6 w-6", filesOpen && "text-primary")}
                onClick={onToggleFiles}
              >
                <PanelRight className="h-4 w-4" strokeWidth={1} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Files</TooltipContent>
          </Tooltip>
        )}
        </div>
      )}

      {isProjectPage && (
        <div
          className="shrink-0 transition-all duration-0"
          style={{ width: filesOpen ? "var(--file-panel-width, 256px)" : "0px" }}
        />
      )}

      {currentWorkspace && (
        <>
          <JobsDialog workspaceId={currentWorkspace.id} open={jobsOpen} onOpenChange={setJobsOpen} />
          <AgentsDialog
            workspaceId={currentWorkspace.id}
            open={agentsOpen}
            onOpenChange={setAgentsOpen}
          />
          <SkillsDialog
            workspaceId={currentWorkspace.id}
            open={skillsOpen}
            onOpenChange={setSkillsOpen}
          />
          <CommandDialog
            workspaceId={currentWorkspace.id}
            open={commandsOpen}
            onOpenChange={setCommandsOpen}
          />
          <MemoryDialog
            workspaceId={currentWorkspace.id}
            open={memoryOpen}
            onOpenChange={setMemoryOpen}
          />
          <WikiDialog
            workspaceId={currentWorkspace.id}
            open={wikiOpen}
            onOpenChange={setWikiOpen}
          />
          <ContextDialog
            workspaceId={currentWorkspace.id}
            open={contextOpen}
            onOpenChange={setContextOpen}
          />
          {workspace && gitStatus && (
            <GitDialog
              workspaceId={workspace.id}
              gitStatus={gitStatus}
              open={gitOpen}
              onClose={() => setGitOpen(false)}
              onCommitted={handleCommitted}
              initialStep={gitDialogStep}
            />
          )}
        </>
      )}
    </header>
  );
}




import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Bot,
  Brain,
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FileText,
  FolderOpen,
  Library,
  PanelLeft,
  PanelRight,
  Play,
  ScrollText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { JobsDialog } from "@/components/JobsDialog";
import { AgentsDialog } from "@/components/AgentsDialog";
import { SkillsDialog } from "@/components/SkillsDialog";
import { MemoryDialog } from "@/components/MemoryDialog";
import { WikiDialog } from "@/components/WikiDialog";
import { ContextDialog } from "@/components/ContextDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaces } from "@/lib/workspace-context";
import { type Workspace } from "@/lib/api";
import { cn } from "@/lib/utils";

interface TopBarProps {
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
}: TopBarProps) {
  const router = useRouter();
  const { openScriptTab } = useWorkspaces();
  const [jobsOpen, setJobsOpen] = useState(false);
  const [agentsOpen, setAgentsOpen] = useState(false);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [wikiOpen, setWikiOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);

  return (
    <header
      data-tauri-drag-region
      className="relative z-10 flex h-[38px] shrink-0 items-center gap-1 border-b bg-card/60 pl-[78px] pr-2 backdrop-blur"
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

      <div className="flex items-center gap-1 mb-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7", !sidebarOpen && "text-primary")}
              onClick={onToggleSidebar}
            >
              <PanelLeft className="h-4 w-4" strokeWidth={1} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{sidebarOpen ? "Hide sidebar" : "Show sidebar"}</TooltipContent>
        </Tooltip>

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => router.history.back()}
        >
          <ChevronLeft className="h-4 w-4" strokeWidth={1} />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => router.history.forward()}
        >
          <ChevronRight className="h-4 w-4" strokeWidth={1} />
        </Button>
      </div>

      <div className={cn("shrink-0", sidebarOpen ? "w-[82px]" : "w-0")} />

      {workspace && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="ml-1 flex min-w-0 cursor-default items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" strokeWidth={1} />
              <span className="truncate text-[13px] font-medium">{workspace.name}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{workspace.path}</TooltipContent>
        </Tooltip>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        {workspace && (
          <>
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
                    workspace.script_run.trim()
                      ? openScriptTab(workspace.id, "Run", workspace.script_run)
                      : null
                  }
                  disabled={!workspace.script_run.trim()}
                >
                  <Play className="mr-2 h-4 w-4" />
                  <span>Run script</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSkillsOpen(true)}>
                  <ScrollText className="mr-2 h-4 w-4" />
                  <span>Skills</span>
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

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={filesOpen ? "secondary" : "ghost"}
                  size="icon"
                  className={cn("h-7 w-7", filesOpen && "text-primary")}
                  onClick={onToggleFiles}
                >
                  <PanelRight className="h-4 w-4" strokeWidth={1} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Files</TooltipContent>
            </Tooltip>
          </>
        )}
      </div>

      <div
        className="shrink-0 transition-all duration-0"
        style={{ width: filesOpen ? "var(--file-panel-width, 256px)" : "0px" }}
      />

      {workspace && (
        <>
          <JobsDialog workspaceId={workspace.id} open={jobsOpen} onOpenChange={setJobsOpen} />
          <AgentsDialog
            workspaceId={workspace.id}
            open={agentsOpen}
            onOpenChange={setAgentsOpen}
          />
          <SkillsDialog
            workspaceId={workspace.id}
            open={skillsOpen}
            onOpenChange={setSkillsOpen}
          />
          <MemoryDialog
            workspaceId={workspace.id}
            open={memoryOpen}
            onOpenChange={setMemoryOpen}
          />
          <WikiDialog
            workspaceId={workspace.id}
            open={wikiOpen}
            onOpenChange={setWikiOpen}
          />
          <ContextDialog
            workspaceId={workspace.id}
            open={contextOpen}
            onOpenChange={setContextOpen}
          />
        </>
      )}
    </header>
  );
}

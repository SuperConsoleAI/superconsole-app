import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  Bot,
  Brain,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FileText,
  Folder,
  FolderOpen,
  Library,
  Moon,
  PanelLeft,
  Play,
  ScrollText,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { JobsDialog } from "@/components/JobsDialog";
import { AgentsDialog } from "@/components/AgentsDialog";
import { SkillsDialog } from "@/components/SkillsDialog";
import { MemoryDialog } from "@/components/MemoryDialog";
import { WikiDialog } from "@/components/WikiDialog";
import { ContextDialog } from "@/components/ContextDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
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
  const { theme, setTheme } = useTheme();
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
      className="flex h-10 shrink-0 items-center gap-1 border-b bg-card/60 pl-[78px] pr-2 backdrop-blur"
    >
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
            {workspace.script_run.trim() ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => openScriptTab(workspace.id, "Run", workspace.script_run)}
                  >
                    <Play className="h-4 w-4" strokeWidth={1} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Run script</TooltipContent>
              </Tooltip>
            ) : (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <Play className="h-4 w-4" strokeWidth={1} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64 p-3">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    No run script configured. Set one in Project Settings →
                    Scripts.
                  </p>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setSkillsOpen(true)}
                >
                  <ScrollText className="h-4 w-4" strokeWidth={1} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Skills</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setMemoryOpen(true)}
                >
                  <Brain className="h-4 w-4" strokeWidth={1} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Memory</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setWikiOpen(true)}
                >
                  <Library className="h-4 w-4" strokeWidth={1} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Wiki</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setContextOpen(true)}
                >
                  <FileText className="h-4 w-4" strokeWidth={1} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Context</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setJobsOpen(true)}
                >
                  <CalendarClock className="h-4 w-4" strokeWidth={1} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Scheduled jobs</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setAgentsOpen(true)}
                >
                  <Bot className="h-4 w-4" strokeWidth={1} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Agents &amp; plugins</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={filesOpen ? "secondary" : "ghost"}
                  size="icon"
                  className={cn("h-7 w-7", filesOpen && "text-primary")}
                  onClick={onToggleFiles}
                >
                  <Folder className="h-4 w-4" strokeWidth={1} />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Files</TooltipContent>
            </Tooltip>
          </>
        )}

        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        >
          {theme === "dark" ? (
            <Sun className="h-4 w-4" strokeWidth={1} />
          ) : (
            <Moon className="h-4 w-4" strokeWidth={1} />
          )}
        </Button>
      </div>

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

import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  FolderTree,
  Moon,
  PanelLeft,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { JobsDialog } from "@/components/JobsDialog";
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
  const [jobsOpen, setJobsOpen] = useState(false);

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
            <PanelLeft className="h-4 w-4" />
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
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        onClick={() => router.history.forward()}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {workspace && (
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="ml-1 flex min-w-0 cursor-default items-center gap-1.5">
              <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate text-[13px] font-medium">{workspace.name}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>{workspace.path}</TooltipContent>
        </Tooltip>
      )}

      <div className="ml-auto flex items-center gap-0.5">
        {workspace && (
          <>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setJobsOpen(true)}
                >
                  <CalendarClock className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>Scheduled jobs</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant={filesOpen ? "secondary" : "ghost"}
                  size="icon"
                  className={cn("h-7 w-7", filesOpen && "text-primary")}
                  onClick={onToggleFiles}
                >
                  <FolderTree className="h-4 w-4" />
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
          {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>

      {workspace && (
        <JobsDialog workspaceId={workspace.id} open={jobsOpen} onOpenChange={setJobsOpen} />
      )}
    </header>
  );
}

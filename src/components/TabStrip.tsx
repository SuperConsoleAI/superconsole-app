import { MessageSquare, Plus, SquareTerminal, X } from "lucide-react";
import { CLI_PRESETS, type SessionTab } from "@/lib/api";
import { PresetIcon } from "@/components/PresetIcon";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

interface TabStripProps {
  tabs: SessionTab[];
  activeTabId: string;
  liveSessions: Set<string>;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onOpen: (cli: string) => void;
}

export function TabStrip({
  tabs,
  activeTabId,
  liveSessions,
  onActivate,
  onClose,
  onOpen,
}: TabStripProps) {
  return (
    <div className="flex h-9 shrink-0 items-stretch border-b bg-sidebar">
      <div
        className="flex min-w-0 flex-1 items-stretch overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onWheel={(e) => {
          if (e.deltaY !== 0) {
            e.currentTarget.scrollLeft += e.deltaY;
          }
        }}
      >
        {tabs.map((tab) => {
          const active = tab.id === activeTabId;
          const live = liveSessions.has(tab.id);
          return (
            <div
              key={tab.id}
              role="tab"
              tabIndex={0}
              onClick={() => onActivate(tab.id)}
              onKeyDown={(e) => e.key === "Enter" && onActivate(tab.id)}
              className={cn(
                "group relative flex max-w-44 cursor-pointer items-center gap-1.5 border-r px-3 text-xs transition-colors",
                active
                  ? "bg-background text-foreground"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground",
              )}
            >
              {active && (
                <span className="absolute inset-x-0 top-0 h-[2px] bg-primary" />
              )}
              {tab.cli === "shell" ? (
                <SquareTerminal
                  className={cn("h-3.5 w-3.5 shrink-0", active && "text-primary")}
                />
              ) : tab.cli === "chat" ? (
                <MessageSquare
                  className={cn("h-3.5 w-3.5 shrink-0", active && "text-primary")}
                />
              ) : (
                <PresetIcon
                  preset={tab.cli}
                  className={cn("h-3.5 w-3.5 shrink-0", !active && "opacity-70")}
                />
              )}
              <span className="truncate">{tab.label}</span>
              {live && !active && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
              )}
              <button
                className="ml-0.5 shrink-0 rounded-sm p-0.5 opacity-0 transition-opacity hover:bg-accent group-hover:opacity-100"
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                title="Close tab (stops session)"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          );
        })}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex h-9 w-9 shrink-0 items-center justify-center text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
              title="New tab"
            >
              <Plus className="h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44">
            {CLI_PRESETS.map((preset) => (
              <DropdownMenuItem key={preset.id} onClick={() => onOpen(preset.id)}>
                <PresetIcon preset={preset.id} className="h-3.5 w-3.5" />
                {preset.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => onOpen("chat")}>
              <MessageSquare className="h-3.5 w-3.5" />
              Chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => onOpen("shell")}>
              <SquareTerminal className="h-3.5 w-3.5" />
              New terminal
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex items-center gap-0.5 border-l px-1.5">
        {CLI_PRESETS.map((preset) => {
          const isOpen = tabs.some((t) => t.cli === preset.id);
          return (
            <Tooltip key={preset.id}>
              <TooltipTrigger asChild>
                <button
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-md transition-all hover:bg-accent",
                    isOpen ? "opacity-100" : "opacity-50 hover:opacity-100",
                  )}
                  onClick={() => onOpen(preset.id)}
                >
                  <PresetIcon preset={preset.id} className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {isOpen ? `Go to ${preset.label}` : `Open ${preset.label}`}
              </TooltipContent>
            </Tooltip>
          );
        })}
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-md transition-all hover:bg-accent",
                tabs.some((t) => t.cli === "chat")
                  ? "opacity-100"
                  : "opacity-50 hover:opacity-100",
              )}
              onClick={() => onOpen("chat")}
            >
              <MessageSquare className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {tabs.some((t) => t.cli === "chat") ? "Go to Chat" : "Open Chat"}
          </TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent"
              onClick={() => onOpen("shell")}
            >
              <SquareTerminal className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>New terminal</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

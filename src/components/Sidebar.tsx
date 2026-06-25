import { useState } from "react";
import {
  BarChart3,
  Bot,
  Check,
  ChevronsUpDown,
  History,
  Inbox,
  ListTodo,
  LogOut,
  Moon,
  Puzzle,
  Plus,
  FolderClosed,
  Settings,
  Sun,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";
import { type Organization, type Workspace } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

interface SidebarRailProps {
  workspaces: Workspace[];
  activeId: number | null;
  liveSessions: Set<number>;
  unreadCount: number;
  inboxActive: boolean;
  tasksActive: boolean;
  sessionsActive: boolean;
  usageActive: boolean;
  agentsActive: boolean;
  customizeActive: boolean;
  orgName: string;
  onExpand: () => void;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onInbox: () => void;
  onTasks: () => void;
  onSessions: () => void;
  onUsage: () => void;
  onAgents: () => void;
  onCustomize: () => void;
  onSettings: () => void;
}

export function SidebarRail({
  workspaces,
  activeId,
  liveSessions,
  unreadCount,
  inboxActive,
  tasksActive,
  sessionsActive,
  usageActive,
  agentsActive,
  customizeActive,
  orgName,
  onExpand,
  onSelect,
  onAdd,
  onInbox,
  onTasks,
  onSessions,
  onUsage,
  onAgents,
  onCustomize,
  onSettings,
}: SidebarRailProps) {
  const { theme, setTheme } = useTheme();
  const railButton = (active: boolean) =>
    cn(
      "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
      active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-accent/60",
    );

  return (
    <aside className="flex h-full w-12 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(false)} onClick={onExpand}>
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10">
              <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-label="SuperConsole" className="h-7 w-7">
                <rect width="32" height="32" rx="8" fill="var(--primary)" />
                <path d="M10 12l5 4-5 4" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M16 20h7" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
              </svg>
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">{orgName} — expand sidebar</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(inboxActive)} onClick={onInbox}>
            <Inbox className="h-4 w-4" />
            {unreadCount > 0 && (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Inbox</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(tasksActive)} onClick={onTasks}>
            <ListTodo className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Tasks</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(sessionsActive)} onClick={onSessions}>
            <History className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Sessions</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(usageActive)} onClick={onUsage}>
            <BarChart3 className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Usage</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(agentsActive)} onClick={onAgents}>
            <Bot className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Agents</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(customizeActive)} onClick={onCustomize}>
            <Puzzle className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Customize</TooltipContent>
      </Tooltip>

      <div className="my-1 h-px w-6 bg-sidebar-border" />

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
        {workspaces.map((ws) => (
          <Tooltip key={ws.id}>
            <TooltipTrigger asChild>
              <button className={railButton(activeId === ws.id)} onClick={() => onSelect(ws.id)}>
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] font-semibold uppercase text-muted-foreground ring-[1px] ring-border">
                  {ws.name[0]}
                </span>
                {liveSessions.has(ws.id) && (
                  <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                )}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">{ws.name}</TooltipContent>
          </Tooltip>
        ))}
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(false)} onClick={onAdd}>
            <FolderClosed className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">New workspace</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            className={railButton(false)}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Toggle theme</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(false)} onClick={onSettings}>
            <Settings className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Settings</TooltipContent>
      </Tooltip>
    </aside>
  );
}

interface SidebarProps {
  workspaces: Workspace[];
  organizations: Organization[];
  activeOrgId: number;
  activeId: number | null;
  liveSessions: Set<number>;
  unreadCount: number;
  inboxActive: boolean;
  tasksActive: boolean;
  sessionsActive: boolean;
  usageActive: boolean;
  agentsActive: boolean;
  customizeActive?: boolean;
  onOrgChange: (id: number) => void;
  onNewOrg: (name: string) => Promise<void>;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onInbox: () => void;
  onTasks: () => void;
  onSessions: () => void;
  onUsage: () => void;
  onAgents: () => void;
  onCustomize?: () => void;
  onSettings: () => void;
}


function OrgAvatar({ name, logoUrl }: { name: string; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className="h-4 w-4 shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-semibold uppercase text-primary">
      {name.trim().charAt(0) || "?"}
    </span>
  );
}

export function Sidebar({
  workspaces,
  organizations,
  activeOrgId,
  activeId,
  liveSessions,
  unreadCount,
  inboxActive,
  tasksActive,
  sessionsActive,
  usageActive,
  agentsActive,
  customizeActive,
  onOrgChange,
  onNewOrg,
  onSelect,
  onAdd,
  onRemove: _onRemove,
  onInbox,
  onTasks,
  onSessions,
  onUsage,
  onAgents,
  onCustomize,
  onSettings,
}: SidebarProps) {
  const { theme, setTheme } = useTheme();
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const activeOrg = organizations.find((o) => o.id === activeOrgId);
  const { auth, signOut } = useAuth();

  const createOrg = async () => {
    const name = orgName.trim();
    if (!name) return;
    await onNewOrg(name);
    setOrgName("");
    setOrgDialogOpen(false);
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-3 pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/60">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/60">
                <svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-label="SuperConsole" className="h-8 w-8">
                  <rect width="32" height="32" rx="8" fill="var(--primary)" />
                  <path d="M10 12l5 4-5 4" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M16 20h7" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" />
                </svg>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-semibold leading-tight">
                  {activeOrg?.name ?? "Personal"}
                </span>
                <span className="block text-[10px] text-muted-foreground">Organization</span>
              </span>
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[var(--radix-dropdown-menu-trigger-width)]">
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                Switch Organization
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-52" sideOffset={8}>
                {auth && (
                  <DropdownMenuLabel className="truncate text-[11px] font-normal text-muted-foreground">
                    {auth.user.email}
                  </DropdownMenuLabel>
                )}
                {organizations.map((org) => (
                  <DropdownMenuItem key={org.id} onClick={() => onOrgChange(org.id)}>
                    <OrgAvatar name={org.name} logoUrl={org.logo_url} />
                    {org.name}
                    {org.id === activeOrgId && <Check className="ml-auto h-3.5 w-3.5" />}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setOrgDialogOpen(true)}>
                  <Plus className="h-3.5 w-3.5" />
                  Create Organization
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => signOut?.()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </DropdownMenuItem>
            {auth && (
              <>
                <DropdownMenuSeparator />
                <div className="flex items-center gap-2.5 px-2 py-1.5">
                  {auth.user.logo_url ? (
                    <img
                      src={auth.user.logo_url}
                      alt=""
                      className="h-7 w-7 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold uppercase text-primary">
                      {(auth.user.name ?? auth.user.email).trim().charAt(0)}
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium leading-tight">
                      {auth.user.name ?? auth.user.email}
                    </span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {auth.user.email}
                    </span>
                  </span>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex flex-col gap-1 px-2 pb-2">
        <div
          role="button"
          tabIndex={0}
          onClick={onInbox}
          onKeyDown={(e) => e.key === "Enter" && onInbox()}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors",
            inboxActive ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          <Inbox
            className={cn("h-4 w-4", inboxActive ? "text-primary" : "text-muted-foreground")}
          />
          <span className="text-[13px] font-medium">Inbox</span>
          {unreadCount > 0 && (
            <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={onTasks}
          onKeyDown={(e) => e.key === "Enter" && onTasks()}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors",
            tasksActive ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          <ListTodo
            className={cn("h-4 w-4", tasksActive ? "text-primary" : "text-muted-foreground")}
          />
          <span className="text-[13px] font-medium">Tasks</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={onSessions}
          onKeyDown={(e) => e.key === "Enter" && onSessions()}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors",
            sessionsActive ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          <History
            className={cn("h-4 w-4", sessionsActive ? "text-primary" : "text-muted-foreground")}
          />
          <span className="text-[13px] font-medium">Sessions</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={onUsage}
          onKeyDown={(e) => e.key === "Enter" && onUsage()}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors",
            usageActive ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          <BarChart3
            className={cn("h-4 w-4", usageActive ? "text-primary" : "text-muted-foreground")}
          />
          <span className="text-[13px] font-medium">Usage</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={onAgents}
          onKeyDown={(e) => e.key === "Enter" && onAgents()}
          className={cn(
            "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors",
            agentsActive ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          <Bot
            className={cn("h-4 w-4", agentsActive ? "text-primary" : "text-muted-foreground")}
          />
          <span className="text-[13px] font-medium">Agents</span>
        </div>

        {onCustomize && (
          <div
            role="button"
            tabIndex={0}
            onClick={onCustomize}
            onKeyDown={(e) => e.key === "Enter" && onCustomize()}
            className={cn(
              "flex cursor-pointer items-center gap-2.5 rounded-md px-2.5 py-1.5 transition-colors",
              customizeActive ? "bg-accent" : "hover:bg-accent/50",
            )}
          >
            <Puzzle
              className={cn("h-4 w-4", customizeActive ? "text-primary" : "text-muted-foreground")}
            />
            <span className="text-[13px] font-medium">Customize</span>
          </div>
        )}
      </div>

      <div className="border-t border-sidebar-border" />

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col pb-2">
          {workspaces.length === 0 && (
            <div className="mx-3 mt-4 rounded-lg border border-dashed px-3 py-8 text-center">
              <p className="text-xs leading-relaxed text-muted-foreground">
                No workspaces yet.
                <br />
                Add any repo or folder to
                <br />
                start an agent session.
              </p>
            </div>
          )}
          {workspaces.map((ws) => {
            const active = activeId === ws.id;
            return (
              <div
                key={ws.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(ws.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(ws.id)}
                className={cn(
                  "relative flex cursor-pointer items-center gap-2 px-3 py-3 transition-colors",
                  active ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                {active && (
                  <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
                )}
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] font-semibold uppercase text-muted-foreground ring-[1px] ring-border">
                  {ws.name[0]}
                </span>
                <span className="truncate text-[13px] font-medium leading-tight flex-1">
                  {ws.name}
                </span>
                {liveSessions.has(ws.id) && (
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <div
        className="group flex h-[44px] shrink-0 cursor-pointer items-center justify-between border-t border-sidebar-border px-3 transition-colors hover:bg-accent/50"
        onClick={onAdd}
      >
        <div className="flex items-center gap-2 text-muted-foreground transition-colors group-hover:text-foreground">
          <FolderClosed className="h-4 w-4" />
          <span className="text-sm font-medium">New Workspace</span>
        </div>
        <div className="flex shrink-0 items-center gap-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              setTheme(theme === "dark" ? "light" : "dark");
            }}
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={(e) => {
              e.stopPropagation();
              onSettings();
            }}
          >
            <Settings className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>New organization</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && createOrg()}
            placeholder="Acme Agency"
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOrgDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={createOrg}>Create</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  );
}



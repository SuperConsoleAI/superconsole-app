/**
 * Sidebar & SidebarRail Components — Primary workspace navigation and control surface
 * Manages organization switcher, navigation rail, workspace selection, and theme controls.
 */
import { useState } from "react";
import { useRouter } from "@tanstack/react-router";
import {
  BarChart3,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  FolderPlus,
  GalleryHorizontalEnd,
  Inbox,
  ListTodo,
  LogOut,
  Moon,
  Puzzle,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  organizations?: Organization[];
  activeOrgId?: number;
  onOrgChange?: (id: number) => void;
  onNewOrg?: (name: string) => Promise<void>;
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
  organizations = [],
  activeOrgId = 1,
  onOrgChange,
  onNewOrg,
  activeId,
  liveSessions,
  unreadCount,
  inboxActive,
  tasksActive,
  sessionsActive,
  usageActive,
  agentsActive,
  customizeActive,
  orgName: _orgName,
  onExpand: _onExpand,
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
  const { auth, signOut } = useAuth();
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const railButton = (active: boolean) =>
    cn(
      "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
      active ? "bg-accent text-primary" : "text-icon hover:bg-hover hover:text-sidebar-foreground",
    );

  return (
    <aside className="flex h-full w-12 shrink-0 flex-col items-center border-r border-sidebar-border bg-sidebar py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(inboxActive)} onClick={onInbox}>
            <Inbox className="h-4 w-4" strokeWidth={1.5} />
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
            <ListTodo className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Tasks</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(sessionsActive)} onClick={onSessions}>
            <GalleryHorizontalEnd className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Sessions</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(usageActive)} onClick={onUsage}>
            <BarChart3 className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Usage</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(agentsActive)} onClick={onAgents}>
            <Bot className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Agents</TooltipContent>
      </Tooltip>

      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(customizeActive)} onClick={onCustomize}>
            <Puzzle className="h-4 w-4" strokeWidth={1.5} />
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
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] font-semibold uppercase text-icon ring-[1px] ring-border">
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

      <div className="flex flex-col items-center gap-0">
        {onOrgChange && (
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <button
                    className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-sidebar-foreground"
                  >
                    <User className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="right">Account & Organization</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" side="right" sideOffset={8} className="w-56">
              <OrgAccountMenuContent
                organizations={organizations}
                activeOrgId={activeOrgId}
                onOrgChange={onOrgChange}
                setOrgDialogOpen={setOrgDialogOpen}
                auth={auth}
                signOut={signOut}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-sidebar-foreground"
              onClick={onAdd}
            >
              <FolderPlus className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">New workspace</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-sidebar-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Toggle theme</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              className="relative flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-hover hover:text-sidebar-foreground"
              onClick={onSettings}
            >
              <Settings className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right">Settings</TooltipContent>
        </Tooltip>
      </div>

      {onNewOrg && (
        <Dialog open={orgDialogOpen} onOpenChange={setOrgDialogOpen}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>New organization</DialogTitle>
            </DialogHeader>
            <Input
              autoFocus
              value={newOrgName}
              onChange={(e) => setNewOrgName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newOrgName.trim()) {
                  onNewOrg(newOrgName.trim());
                  setNewOrgName("");
                  setOrgDialogOpen(false);
                }
              }}
              placeholder="Acme Agency"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setOrgDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (newOrgName.trim()) {
                    onNewOrg(newOrgName.trim());
                    setNewOrgName("");
                    setOrgDialogOpen(false);
                  }
                }}
              >
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
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

function OrgAccountMenuContent({
  organizations,
  activeOrgId,
  onOrgChange,
  setOrgDialogOpen,
  auth,
  signOut,
}: {
  organizations: Organization[];
  activeOrgId: number;
  onOrgChange: (id: number) => void;
  setOrgDialogOpen: (open: boolean) => void;
  auth: ReturnType<typeof useAuth>["auth"];
  signOut: ReturnType<typeof useAuth>["signOut"];
}) {
  return (
    <>
      {auth && (
        <>
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
          <DropdownMenuSeparator />
        </>
      )}

      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          Switch Organization
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-52" sideOffset={8}>
          {organizations.map((org) => (
            <DropdownMenuItem key={org.id} onSelect={() => onOrgChange(org.id)}>
              <OrgAvatar name={org.name} logoUrl={org.logo_url} />
              <span className="truncate">{org.name}</span>
              {org.id === activeOrgId && <Check className="ml-auto h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setOrgDialogOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Create Organization
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>

      <DropdownMenuSeparator />

      <DropdownMenuItem
        onSelect={() => signOut?.()}
        className="text-destructive focus:text-destructive"
      >
        <LogOut className="h-3.5 w-3.5" />
        Sign out
      </DropdownMenuItem>
    </>
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
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const { theme, setTheme } = useTheme();
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const { auth, signOut } = useAuth();

  const createOrg = async () => {
    const name = orgName.trim();
    if (!name) return;
    await onNewOrg(name);
    setOrgName("");
    setOrgDialogOpen(false);
  };

  const filteredWorkspaces = searchQuery.trim()
    ? workspaces.filter((ws) =>
      ws.name.toLowerCase().includes(searchQuery.toLowerCase().trim()),
    )
    : workspaces;

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      {/* Top Search & Navigation row */}
      <div className="px-2 py-1">
        <div className="flex h-8 items-center gap-1.5 rounded-md border border-border/70 bg-card/60 px-2 py-1 shadow-xs transition-colors focus-within:border-primary/60 focus-within:ring-1 focus-within:ring-primary/20">
          <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search..."
            className="w-full min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
          />
          <div className="flex items-center gap-0.5 shrink-0 border-l border-border/60 pl-1">
            <button
              onClick={() => {
                router.invalidate();
                window.dispatchEvent(new CustomEvent("app-refresh"));
              }}
              title="Refresh page"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-foreground transition-colors"
            >
              <RefreshCw className="h-3 w-3" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => router.history.back()}
              title="Go back"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
            <button
              onClick={() => router.history.forward()}
              title="Go forward"
              className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-hover hover:text-foreground transition-colors"
            >
              <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0 px-2 py-1">
        <div
          role="button"
          tabIndex={0}
          onClick={onInbox}
          onKeyDown={(e) => e.key === "Enter" && onInbox()}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[14px] font-normal transition-colors hover:bg-hover hover:text-sidebar-foreground",
            inboxActive ? "bg-accent text-primary" : "text-sidebar-foreground",
          )}
        >
          <Inbox
            strokeWidth={1.5}
            className={cn("h-3.5 w-3.5 shrink-0", inboxActive ? "text-primary" : "text-icon")}
          />
          <span className="truncate">Inbox</span>
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
            "flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[14px] font-normal transition-colors hover:bg-hover hover:text-sidebar-foreground",
            tasksActive ? "bg-accent text-primary" : "text-sidebar-foreground",
          )}
        >
          <ListTodo
            strokeWidth={1.5}
            className={cn("h-3.5 w-3.5 shrink-0", tasksActive ? "text-primary" : "text-icon")}
          />
          <span className="truncate">Tasks</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={onSessions}
          onKeyDown={(e) => e.key === "Enter" && onSessions()}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[14px] font-normal transition-colors hover:bg-hover hover:text-sidebar-foreground",
            sessionsActive ? "bg-accent text-primary" : "text-sidebar-foreground",
          )}
        >
          <GalleryHorizontalEnd
            strokeWidth={1.5}
            className={cn("h-3.5 w-3.5 shrink-0", sessionsActive ? "text-primary" : "text-icon")}
          />
          <span className="truncate">Sessions</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={onUsage}
          onKeyDown={(e) => e.key === "Enter" && onUsage()}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[14px] font-normal transition-colors hover:bg-hover hover:text-sidebar-foreground",
            usageActive ? "bg-accent text-primary" : "text-sidebar-foreground",
          )}
        >
          <BarChart3
            strokeWidth={1.5}
            className={cn("h-3.5 w-3.5 shrink-0", usageActive ? "text-primary" : "text-icon")}
          />
          <span className="truncate">Usage</span>
        </div>

        <div
          role="button"
          tabIndex={0}
          onClick={onAgents}
          onKeyDown={(e) => e.key === "Enter" && onAgents()}
          className={cn(
            "flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[14px] font-normal transition-colors hover:bg-hover hover:text-sidebar-foreground",
            agentsActive ? "bg-accent text-primary" : "text-sidebar-foreground",
          )}
        >
          <Bot
            strokeWidth={1.5}
            className={cn("h-3.5 w-3.5 shrink-0", agentsActive ? "text-primary" : "text-icon")}
          />
          <span className="truncate">Agents</span>
        </div>

        {onCustomize && (
          <div
            role="button"
            tabIndex={0}
            onClick={onCustomize}
            onKeyDown={(e) => e.key === "Enter" && onCustomize()}
            className={cn(
              "flex h-8 cursor-pointer items-center gap-2.5 rounded-md px-2 text-[14px] font-normal transition-colors hover:bg-hover hover:text-sidebar-foreground",
              customizeActive ? "bg-accent text-primary" : "text-sidebar-foreground",
            )}
          >
            <Puzzle
              strokeWidth={1.5}
              className={cn("h-3.5 w-3.5 shrink-0", customizeActive ? "text-primary" : "text-icon")}
            />
            <span className="truncate">Customize</span>
          </div>
        )}
      </div>

      <div className="px-3 pt-2.5 pb-1">
        <span className="text-[0.75rem] font-medium text-muted-foreground select-none">
          Workspace
        </span>
      </div>

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
          {workspaces.length > 0 && filteredWorkspaces.length === 0 && (
            <div className="mx-3 mt-4 px-3 py-4 text-center">
              <p className="text-xs text-muted-foreground">No matching workspaces</p>
            </div>
          )}
          {filteredWorkspaces.map((ws) => {
            const active = activeId === ws.id;
            return (
              <div
                key={ws.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(ws.id)}
                onKeyDown={(e) => e.key === "Enter" && onSelect(ws.id)}
                className={cn(
                  "relative flex cursor-pointer items-center gap-2 px-3 py-[0.7rem] transition-colors",
                  active ? "bg-accent" : "hover:bg-hover",
                )}
              >
                {active && (
                  <span className="absolute inset-y-0 left-0 w-[3px] bg-primary" />
                )}
                <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted text-[10px] font-semibold uppercase text-icon ring-[1px] ring-border">
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

      <div className="flex h-[44px] shrink-0 items-center justify-between border-t border-sidebar-border px-2">
        <div className="flex items-center gap-0">
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-hover hover:text-sidebar-foreground"
                  >
                    <User className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Account & Organization</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="start" side="top" sideOffset={8} className="w-56 mb-1">
              <OrgAccountMenuContent
                organizations={organizations}
                activeOrgId={activeOrgId}
                onOrgChange={onOrgChange}
                setOrgDialogOpen={setOrgDialogOpen}
                auth={auth}
                signOut={signOut}
              />
            </DropdownMenuContent>
          </DropdownMenu>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-hover hover:text-sidebar-foreground"
                onClick={onAdd}
              >
                <FolderPlus className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">New workspace</TooltipContent>
          </Tooltip>
        </div>

        <div className="flex shrink-0 items-center gap-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-hover hover:text-sidebar-foreground"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              >
                {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Toggle theme</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:bg-hover hover:text-sidebar-foreground"
                onClick={onSettings}
              >
                <Settings className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Settings</TooltipContent>
          </Tooltip>
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



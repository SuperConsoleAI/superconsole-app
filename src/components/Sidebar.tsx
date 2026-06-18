import { useEffect, useState } from "react";
import {
  BarChart3,
  Check,
  ChevronsUpDown,
  FolderOpen,
  History,
  Inbox,
  ListTodo,
  Plus,
  Settings,
  Sparkles,
  Terminal,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
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
import { api, CLI_PRESETS, type Organization, type OrgSkillView, type Workspace } from "@/lib/api";
import { AccountMenu } from "@/components/AccountMenu";
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
  orgName: string;
  onExpand: () => void;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onInbox: () => void;
  onTasks: () => void;
  onSessions: () => void;
  onUsage: () => void;
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
  orgName,
  onExpand,
  onSelect,
  onAdd,
  onInbox,
  onTasks,
  onSessions,
  onUsage,
  onSettings,
}: SidebarRailProps) {
  const railButton = (active: boolean) =>
    cn(
      "relative flex h-9 w-9 items-center justify-center rounded-lg transition-colors",
      active ? "bg-accent text-primary" : "text-muted-foreground hover:bg-accent/60",
    );

  return (
    <aside className="flex h-full w-12 shrink-0 flex-col items-center gap-1 border-r border-sidebar-border bg-sidebar py-2">
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(false)} onClick={onExpand}>
            <Terminal className="h-4 w-4 text-primary" />
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

      <div className="my-1 h-px w-6 bg-sidebar-border" />

      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto">
        {workspaces.map((ws) => (
          <Tooltip key={ws.id}>
            <TooltipTrigger asChild>
              <button className={railButton(activeId === ws.id)} onClick={() => onSelect(ws.id)}>
                <FolderOpen className="h-4 w-4" />
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
            <Plus className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">New workspace</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger asChild>
          <button className={railButton(false)} onClick={onSettings}>
            <Settings className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="right">Settings</TooltipContent>
      </Tooltip>
      <AccountMenu collapsed />
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
  onOrgChange: (id: number) => void;
  onNewOrg: (name: string) => Promise<void>;
  onSelect: (id: number) => void;
  onAdd: () => void;
  onRemove: (id: number) => void;
  onInbox: () => void;
  onTasks: () => void;
  onSessions: () => void;
  onUsage: () => void;
  onSettings: () => void;
}

const cliLabel = (id: string) =>
  CLI_PRESETS.find((p) => p.id === id)?.label ?? id;

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
  onOrgChange,
  onNewOrg,
  onSelect,
  onAdd,
  onRemove,
  onInbox,
  onTasks,
  onSessions,
  onUsage,
  onSettings,
}: SidebarProps) {
  const [orgDialogOpen, setOrgDialogOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const activeOrg = organizations.find((o) => o.id === activeOrgId);

  const createOrg = async () => {
    const name = orgName.trim();
    if (!name) return;
    await onNewOrg(name);
    setOrgName("");
    setOrgDialogOpen(false);
  };

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="px-3 pb-2 pt-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/60">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                <Terminal className="h-4 w-4 text-primary" />
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
          <DropdownMenuContent align="start" className="w-56">
            {organizations.map((org) => (
              <DropdownMenuItem key={org.id} onClick={() => onOrgChange(org.id)}>
                {org.name}
                {org.id === activeOrgId && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => setOrgDialogOpen(true)}>
              <Plus className="h-3.5 w-3.5" />
              New organization
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="px-2 pb-2">
        <div
          role="button"
          tabIndex={0}
          onClick={onInbox}
          onKeyDown={(e) => e.key === "Enter" && onInbox()}
          className={cn(
            "relative flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
            inboxActive ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          {inboxActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
          )}
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
            "relative mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
            tasksActive ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          {tasksActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
          )}
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
            "relative mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
            sessionsActive ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          {sessionsActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
          )}
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
            "relative mt-0.5 flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
            usageActive ? "bg-accent" : "hover:bg-accent/50",
          )}
        >
          {usageActive && (
            <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
          )}
          <BarChart3
            className={cn("h-4 w-4", usageActive ? "text-primary" : "text-muted-foreground")}
          />
          <span className="text-[13px] font-medium">Usage</span>
        </div>
      </div>

      <div className="px-4 pb-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Workspaces
        </p>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="flex flex-col gap-0.5 px-2 pb-2">
          {workspaces.length === 0 && (
            <div className="mx-1 mt-4 rounded-lg border border-dashed px-3 py-8 text-center">
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
                  "group relative flex cursor-pointer items-start gap-2.5 rounded-lg px-2.5 py-2 transition-colors",
                  active ? "bg-accent" : "hover:bg-accent/50",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-full bg-primary" />
                )}
                <FolderOpen
                  className={cn(
                    "mt-0.5 h-4 w-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[13px] font-medium leading-tight">
                      {ws.name}
                    </span>
                    {liveSessions.has(ws.id) && (
                      <span className="relative flex h-1.5 w-1.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-60" />
                        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      </span>
                    )}
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {cliLabel(ws.cli)}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(ws.id);
                  }}
                >
                  <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            );
          })}
        </div>
      </ScrollArea>

      <OrgSkillsRail onSettings={onSettings} />

      <div className="flex flex-col gap-2 border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" className="flex-1 justify-center" onClick={onAdd}>
            <Plus className="h-4 w-4" />
            New workspace
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onSettings}>
            <Settings className="h-4 w-4 text-muted-foreground" />
          </Button>
        </div>
        <AccountMenu />
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

function OrgSkillsRail({ onSettings }: { onSettings: () => void }) {
  const { activeCloudOrg } = useAuth();
  const [skills, setSkills] = useState<OrgSkillView[]>([]);

  useEffect(() => {
    if (!activeCloudOrg) {
      setSkills([]);
      return;
    }
    api
      .listOrgSkills(activeCloudOrg.id)
      .then(setSkills)
      .catch(() => setSkills([]));
  }, [activeCloudOrg]);

  if (!activeCloudOrg || skills.length === 0) return null;

  return (
    <div className="border-t border-sidebar-border px-2 py-2">
      <button
        onClick={onSettings}
        className="flex w-full items-center gap-1.5 px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
      >
        <Sparkles className="h-3 w-3" />
        Org skills
      </button>
      <div className="flex flex-col gap-0.5">
        {skills.map((s) => (
          <div
            key={s.name}
            className="flex items-center gap-2 rounded-md px-2.5 py-1 text-[12px] text-muted-foreground"
            title={s.in_library ? "Available to agents" : "Not on this machine yet"}
          >
            <span
              className={cn(
                "h-1.5 w-1.5 shrink-0 rounded-full",
                s.in_library ? "bg-emerald-500" : "bg-amber-500",
              )}
            />
            <span className="truncate">{s.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

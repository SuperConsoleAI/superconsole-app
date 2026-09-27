import { useState, useEffect } from "react";
import { Building2, Check, ChevronsUpDown, FolderClosed, User } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { api, type Workspace } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type TopTab = "account" | "org" | "project";

export function SettingsNavbar() {
  const { auth, activeCloudOrg, setActiveCloudOrgId } = useAuth();
  const [tab, setTab] = useState<TopTab>("account");
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeWsId, setActiveWsId] = useState<number | null>(null);

  const orgs = auth?.orgs ?? [];

  useEffect(() => {
    api.listWorkspaces().then(setWorkspaces).catch(console.error);
  }, []);

  useEffect(() => {
    const onTabSync = (e: any) => {
      if (e.detail) {
        if (typeof e.detail === "object") {
          if (e.detail.tab) setTab(e.detail.tab);
          if (e.detail.workspaceId !== undefined) setActiveWsId(e.detail.workspaceId);
        } else {
          setTab(e.detail);
        }
      }
    };
    window.addEventListener("settings-tab-sync", onTabSync);
    window.dispatchEvent(new CustomEvent("settings-nav-mounted"));
    return () => window.removeEventListener("settings-tab-sync", onTabSync);
  }, []);

  const handleTabChange = (t: TopTab) => {
    setTab(t);
    window.dispatchEvent(new CustomEvent("settings-tab-change", { detail: t }));
  };

  const handleOrgChange = (orgId: string) => {
    setActiveCloudOrgId(orgId);
    window.dispatchEvent(new CustomEvent("settings-org-change", { detail: orgId }));
  };

  const handleProjectChange = (wsId: number) => {
    setActiveWsId(wsId);
    window.dispatchEvent(new CustomEvent("settings-project-change", { detail: wsId }));
  };

  const currentWs = workspaces.find((w) => w.id === activeWsId) ?? workspaces[0];

  return (
    <div className="flex w-full items-center justify-between gap-3">
      {/* Left: Tab Switcher (Account | Org | Project) + Scoped Switcher */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 items-center gap-0.5 rounded-md border bg-background p-0.5">
          <button
            type="button"
            onClick={() => handleTabChange("account")}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
              tab === "account"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <User className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>Account</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("org")}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
              tab === "org"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <Building2 className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>Org</span>
          </button>
          <button
            type="button"
            onClick={() => handleTabChange("project")}
            className={cn(
              "flex h-6 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
              tab === "project"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:bg-muted"
            )}
          >
            <FolderClosed className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>Project</span>
          </button>
        </div>

        {/* Org selector dropdown when on Org tab */}
        {tab === "org" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 font-normal gap-1.5 px-2 text-xs max-w-[180px]"
              >
                <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <span className="truncate">{activeCloudOrg?.name ?? "Select organization"}</span>
                <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-auto" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {orgs.map((org) => (
                <DropdownMenuItem
                  key={org.id}
                  onClick={() => handleOrgChange(org.id)}
                  className="flex items-center justify-between"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-medium">{org.name}</span>
                    <span className="block truncate text-[10px] capitalize text-muted-foreground">
                      {org.role} · {org.plan}
                    </span>
                  </span>
                  {org.id === activeCloudOrg?.id && (
                    <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Project selector dropdown when on Project tab */}
        {tab === "project" && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-6 font-normal gap-1.5 px-2 text-xs max-w-[180px]"
              >
                <FolderClosed className="h-3.5 w-3.5 shrink-0 text-muted-foreground" strokeWidth={1.5} />
                <span className="truncate">{currentWs?.name ?? "Select project"}</span>
                <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50 ml-auto" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              {workspaces.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => handleProjectChange(w.id)}
                  className="flex items-center justify-between"
                >
                  <span className="truncate text-xs">{w.name}</span>
                  {(activeWsId === w.id || (!activeWsId && w.id === currentWs?.id)) && (
                    <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-primary" />
                  )}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Right: Subtitle */}
      <span className="text-[11px] text-muted-foreground hidden sm:inline">
        Configure account, providers, and environment
      </span>
    </div>
  );
}

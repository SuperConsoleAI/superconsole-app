/**
 * CustomizeNavbar Component
 * Top bar header controls for the Customize plugins, skills, hooks, and extensions surface.
 * Handles tab switching and scope resolution (Account vs Org vs Project).
 */
import { useState, useEffect } from "react";
import {
  Blocks,
  BookText,
  Brain,
  Building2,
  Check,
  FileText,
  FolderClosed,
  GalleryHorizontalEnd,
  List,
  ScrollText,
  SquareSlash,
  UserCog,
  Webhook,
} from "lucide-react";
import { ModelContextProtocol } from "@/components/McpIcon";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaces } from "@/lib/workspace-context";
import { useAuth } from "@/lib/auth-context";
import { cn, getActiveWorkspaceFilter, setActiveWorkspaceFilter } from "@/lib/utils";

type CustomizeTab =
  | "plugins"
  | "skills"
  | "commands"
  | "hooks"
  | "rules"
  | "mcp"
  | "context"
  | "wiki"
  | "memory"
  | "sessions";

type ScopeState = {
  type: "account" | "org" | "project";
  id: string;
  localWorkspaceId?: number;
};

export function CustomizeNavbar() {
  const { workspaces, organizations } = useWorkspaces();
  const { auth } = useAuth();

  const [tab, setTab] = useState<CustomizeTab>("plugins");
  const [scope, setScope] = useState<ScopeState>(() => {
    const activeWsId = getActiveWorkspaceFilter();
    if (activeWsId) {
      return { type: "project", id: "", localWorkspaceId: activeWsId };
    }
    const saved = sessionStorage.getItem("customizeScope");
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {}
    }
    return { type: "account", id: auth?.user.id ?? "" };
  });

  useEffect(() => {
    const onTabSync = (e: any) => {
      if (e.detail) setTab(e.detail);
    };
    const onScopeSync = (e: any) => {
      if (e.detail) {
        setScope(e.detail);
        if (e.detail.type === "project" && e.detail.localWorkspaceId) {
          setActiveWorkspaceFilter(e.detail.localWorkspaceId);
        }
      }
    };

    window.addEventListener("customize-tab-sync", onTabSync);
    window.addEventListener("customize-scope-sync", onScopeSync);
    window.dispatchEvent(new CustomEvent("customize-nav-mounted"));

    return () => {
      window.removeEventListener("customize-tab-sync", onTabSync);
      window.removeEventListener("customize-scope-sync", onScopeSync);
    };
  }, []);

  const selectTab = (t: CustomizeTab) => {
    setTab(t);
    window.dispatchEvent(new CustomEvent("customize-tab-change", { detail: t }));
  };

  const handleScopeChange = (s: ScopeState) => {
    setScope(s);
    sessionStorage.setItem("customizeScope", JSON.stringify(s));
    if (s.type === "project" && s.localWorkspaceId) {
      setActiveWorkspaceFilter(s.localWorkspaceId);
    }
    window.dispatchEvent(new CustomEvent("customize-scope-change", { detail: s }));
  };

  const wsName = (localId?: number) =>
    workspaces.find((w) => w.id === localId)?.name ?? "unknown";
  const orgName = (id: string) =>
    auth?.orgs.find((o) => o.id === id)?.name ?? "unknown";

  const navItem = (id: CustomizeTab, label: string, icon: React.ReactNode) => (
    <button
      key={id}
      type="button"
      onClick={() => selectTab(id)}
      className={cn(
        "flex h-6 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors whitespace-nowrap",
        tab === id
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      {icon}
      <span>{label}</span>
    </button>
  );

  return (
    <div className="flex w-full items-center justify-between gap-3">
      {/* Left: Tab bar */}
      <div className="flex items-center gap-1 overflow-x-auto no-scrollbar py-0.5 min-w-0 flex-1">
        {navItem("plugins", "Plugins", <Blocks className="h-3.5 w-3.5" strokeWidth={1.5} />)}
        {navItem("skills", "Skills", <ScrollText className="h-3.5 w-3.5" strokeWidth={1.5} />)}
        {navItem("commands", "Commands", <SquareSlash className="h-3.5 w-3.5" strokeWidth={1.5} />)}
        {navItem("hooks", "Hooks", <Webhook className="h-3.5 w-3.5" strokeWidth={1.5} />)}
        {navItem("rules", "Rules", <List className="h-3.5 w-3.5" strokeWidth={1.5} />)}
        {navItem("mcp", "MCP", <ModelContextProtocol className="h-3.5 w-3.5" />)}
        {navItem("context", "Context", <FileText className="h-3.5 w-3.5" strokeWidth={1.5} />)}
        {navItem("wiki", "Wiki", <BookText className="h-3.5 w-3.5" strokeWidth={1.5} />)}
        {navItem("memory", "Memory", <Brain className="h-3.5 w-3.5" strokeWidth={1.5} />)}
        {navItem("sessions", "Sessions", <GalleryHorizontalEnd className="h-3.5 w-3.5" strokeWidth={1.5} />)}
      </div>

      {/* Right: Project/Scope Selector Dropdown */}
      <div className="flex shrink-0 items-center">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-6 font-normal gap-1.5 px-2.5 text-xs">
              {scope.type === "account" ? (
                <>
                  <UserCog className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                  <span>Account</span>
                </>
              ) : scope.type === "org" ? (
                <>
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                  <span>{orgName(scope.id)}</span>
                </>
              ) : (
                <>
                  <FolderClosed className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                  <span>{wsName(scope.localWorkspaceId)}</span>
                </>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem
              onClick={() =>
                handleScopeChange({ type: "account", id: auth?.user.id ?? "" })
              }
              className="justify-between font-medium"
            >
              <span className="flex items-center gap-2 text-xs">
                <UserCog className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                Account (machine)
              </span>
              {scope.type === "account" && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {organizations.map((o) => {
              const cloudOrg = auth?.orgs.find((co) => co.name === o.name);
              const cloudOrgId = cloudOrg?.id ?? "";
              const orgWorkspaces = workspaces.filter((w) => w.organization_id === o.id);
              return (
                <DropdownMenuGroup key={o.id}>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase text-muted-foreground">
                    Organization
                  </div>
                  <DropdownMenuItem
                    onClick={() => {
                      if (cloudOrgId) handleScopeChange({ type: "org", id: cloudOrgId });
                    }}
                    className="justify-between font-medium"
                    disabled={!cloudOrgId}
                  >
                    <span className="flex items-center gap-2 text-xs">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.5} />
                      {o.name} (Org)
                    </span>
                    {scope.type === "org" && scope.id === cloudOrgId && (
                      <Check className="h-3.5 w-3.5" />
                    )}
                  </DropdownMenuItem>

                  {orgWorkspaces.length > 0 && (
                    <>
                      <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase text-muted-foreground">
                        Projects
                      </div>
                      {orgWorkspaces.map((w) => (
                        <DropdownMenuItem
                          key={w.id}
                          onClick={() =>
                            handleScopeChange({
                              type: "project",
                              id: w.project_id ?? "",
                              localWorkspaceId: w.id,
                            })
                          }
                          className="pl-4 justify-between"
                        >
                          <span className="flex items-center gap-2 text-xs">
                            <FolderClosed
                              className="h-3.5 w-3.5 text-muted-foreground"
                              strokeWidth={1.5}
                            />
                            {w.name}
                          </span>
                          {scope.type === "project" &&
                            (scope.localWorkspaceId === w.id || scope.id === w.project_id) && (
                              <Check className="h-3.5 w-3.5" />
                            )}
                        </DropdownMenuItem>
                      ))}
                    </>
                  )}
                  <DropdownMenuSeparator />
                </DropdownMenuGroup>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/**
 * AgentsNavbar Component
 * Top bar header controls for the Agents view.
 * Handles the Agents vs Activity vs Catalog tabs, along with creation and import triggers.
 */
import { useState, useEffect } from "react";
import { Bot, GitBranch, History, ListTodo, Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaces } from "@/lib/workspace-context";
import { cn, getActiveWorkspaceFilter, setActiveWorkspaceFilter } from "@/lib/utils";

type AgentTab = "agents" | "activity" | "library";

export function AgentsNavbar() {
  const { workspaces, organizations } = useWorkspaces();
  const [tab, setTab] = useState<AgentTab>("agents");
  const initialWsId = getActiveWorkspaceFilter();
  const [projFilter, setProjFilter] = useState<number | "all">(() => initialWsId ?? "all");
  const [orgFilter, setOrgFilter] = useState<number | "all">(() => {
    if (initialWsId) {
      const ws = workspaces.find((w) => w.id === initialWsId);
      if (ws?.organization_id) return ws.organization_id;
    }
    return "all";
  });

  useEffect(() => {
    if (projFilter !== "all" && orgFilter === "all" && workspaces.length > 0) {
      const ws = workspaces.find((w) => w.id === projFilter);
      if (ws?.organization_id) setOrgFilter(ws.organization_id);
    }
  }, [projFilter, orgFilter, workspaces]);

  useEffect(() => {
    const onTabSync = (e: any) => {
      if (e.detail) setTab(e.detail);
    };
    const onOrgSync = (e: any) => {
      if (e.detail !== undefined) setOrgFilter(e.detail);
    };
    const onProjSync = (e: any) => {
      if (e.detail !== undefined) {
        setProjFilter(e.detail);
        if (e.detail !== "all") setActiveWorkspaceFilter(e.detail);
      }
    };

    window.addEventListener("agents-tab-sync", onTabSync);
    window.addEventListener("agents-org-sync", onOrgSync);
    window.addEventListener("agents-proj-sync", onProjSync);

    window.dispatchEvent(new CustomEvent("agents-nav-mounted"));

    return () => {
      window.removeEventListener("agents-tab-sync", onTabSync);
      window.removeEventListener("agents-org-sync", onOrgSync);
      window.removeEventListener("agents-proj-sync", onProjSync);
    };
  }, []);

  const orgWorkspaces =
    orgFilter === "all"
      ? workspaces
      : workspaces.filter((w) => w.organization_id === orgFilter);

  const orgName = (id: number | "all") => {
    if (id === "all") return "All orgs";
    return organizations.find((o) => o.id === id)?.name ?? "Organization";
  };

  const wsName = (id: number | "all") => {
    if (id === "all") return "All projects";
    return workspaces.find((w) => w.id === id)?.name ?? "Project";
  };

  const handleTabChange = (t: AgentTab) => {
    setTab(t);
    window.dispatchEvent(new CustomEvent("agents-tab-change", { detail: t }));
  };

  const handleOrgChange = (orgId: number | "all") => {
    setOrgFilter(orgId);
    setProjFilter("all");
    window.dispatchEvent(new CustomEvent("agents-org-change", { detail: orgId }));
  };

  const handleProjChange = (projId: number | "all") => {
    setProjFilter(projId);
    if (projId !== "all") {
      setActiveWorkspaceFilter(projId);
    }
    window.dispatchEvent(new CustomEvent("agents-proj-change", { detail: projId }));
  };

  return (
    <div className="flex w-full items-center justify-between gap-3">
      {/* Left: Tab Switcher (Agents | Activity | Catalog) — 26px outer container, 22px inner button, vertically centered */}
      <div className="flex h-[26px] items-center gap-0.5 rounded-md border bg-background p-[1px]">
        <button
          type="button"
          onClick={() => handleTabChange("agents")}
          className={cn(
            "flex h-[22px] items-center justify-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors leading-none",
            tab === "agents"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Bot className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Agents</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("activity")}
          className={cn(
            "flex h-[22px] items-center justify-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors leading-none",
            tab === "activity"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <History className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Activity</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("library")}
          className={cn(
            "flex h-[22px] items-center justify-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors leading-none",
            tab === "library"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <ListTodo className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Catalog</span>
        </button>
      </div>

      {/* Right: Actions and filters */}
      <div className="flex items-center gap-1.5">
        {tab !== "library" && (
          <>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 px-2.5 text-xs font-normal">
                  {orgName(orgFilter)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-40">
                <DropdownMenuItem onClick={() => handleOrgChange("all")}>All orgs</DropdownMenuItem>
                {organizations.map((o) => (
                  <DropdownMenuItem key={o.id} onClick={() => handleOrgChange(o.id)}>
                    {o.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-6 px-2.5 text-xs font-normal">
                  {wsName(projFilter)}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem onClick={() => handleProjChange("all")}>All projects</DropdownMenuItem>
                {orgWorkspaces.map((w) => (
                  <DropdownMenuItem key={w.id} onClick={() => handleProjChange(w.id)}>
                    {w.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}

        {tab === "agents" && (
          <>
            <Button
              size="sm"
              className="h-6 gap-1.5 px-2.5 text-xs font-normal"
              onClick={() => window.dispatchEvent(new CustomEvent("agents-create-open"))}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Agent</span>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-6 gap-1.5 px-2.5 text-xs font-normal"
              onClick={() => window.dispatchEvent(new CustomEvent("agents-import-open"))}
              title="Import from GitHub repo"
            >
              <GitBranch className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Import</span>
            </Button>
          </>
        )}

        {tab === "library" && (
          <Button
            variant="outline"
            size="sm"
            className="h-6 gap-1.5 px-2.5 text-xs font-normal"
            onClick={() => window.dispatchEvent(new CustomEvent("agents-catalog-open"))}
            title="Add an agent to the shared catalog"
          >
            <Wrench className="h-3.5 w-3.5" strokeWidth={1.5} />
            <span>Add to catalog</span>
          </Button>
        )}
      </div>
    </div>
  );
}

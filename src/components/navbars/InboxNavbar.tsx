/**
 * InboxNavbar Component
 * Top bar header controls for the Inbox page displaying scheduled jobs and output summaries.
 * Provides organization and project scope selectors to filter incoming inbox items.
 */
import { useState, useEffect } from "react";
import { Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaces } from "@/lib/workspace-context";
import { getActiveWorkspaceFilter, setActiveWorkspaceFilter } from "@/lib/utils";

export function InboxNavbar() {
  const { workspaces, organizations } = useWorkspaces();
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
    const onOrgSync = (e: any) => {
      if (e.detail !== undefined) setOrgFilter(e.detail);
    };
    const onProjSync = (e: any) => {
      if (e.detail !== undefined) {
        setProjFilter(e.detail);
        if (e.detail !== "all") setActiveWorkspaceFilter(e.detail);
      }
    };

    window.addEventListener("inbox-org-sync", onOrgSync);
    window.addEventListener("inbox-proj-sync", onProjSync);
    window.dispatchEvent(new CustomEvent("inbox-nav-mounted"));

    return () => {
      window.removeEventListener("inbox-org-sync", onOrgSync);
      window.removeEventListener("inbox-proj-sync", onProjSync);
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

  const handleOrgChange = (orgId: number | "all") => {
    setOrgFilter(orgId);
    setProjFilter("all");
    window.dispatchEvent(new CustomEvent("inbox-org-change", { detail: orgId }));
  };

  const handleProjChange = (projId: number | "all") => {
    setProjFilter(projId);
    if (projId !== "all") {
      setActiveWorkspaceFilter(projId);
    }
    window.dispatchEvent(new CustomEvent("inbox-proj-change", { detail: projId }));
  };

  return (
    <div className="flex w-full items-center justify-between gap-3">
      {/* Left: Title and subtitle */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 font-medium text-xs">
          <Inbox className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
          <span>Inbox</span>
        </div>
        <span className="text-[11px] text-muted-foreground hidden sm:inline">
          — Output from scheduled jobs across workspaces
        </span>
      </div>

      {/* Right: Org & Project Dropdowns */}
      <div className="flex items-center gap-1.5">
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
      </div>
    </div>
  );
}

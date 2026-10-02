/**
 * TasksNavbar Component
 * Top bar header controls for the Tasks management page.
 * Provides the Tasks vs Activity switcher, List/Calendar view toggles, and task creation trigger.
 */
import { useState, useEffect } from "react";
import {
  CalendarDays,
  History,
  List,
  ListTodo,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaces } from "@/lib/workspace-context";
import { cn, getActiveWorkspaceFilter, setActiveWorkspaceFilter } from "@/lib/utils";

export function TasksNavbar() {
  const { workspaces, organizations } = useWorkspaces();
  const [tab, setTab] = useState<"tasks" | "activity">("tasks");
  const initialWsId = getActiveWorkspaceFilter();
  const [projFilter, setProjFilter] = useState<number | "all">(() => initialWsId ?? "all");
  const [orgFilter, setOrgFilter] = useState<number | "all">(() => {
    if (initialWsId) {
      const ws = workspaces.find((w) => w.id === initialWsId);
      if (ws?.organization_id) return ws.organization_id;
    }
    return "all";
  });
  const [view, setView] = useState<"list" | "calendar">("list");

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
    const onViewSync = (e: any) => {
      if (e.detail) setView(e.detail);
    };

    window.addEventListener("tasks-tab-sync", onTabSync);
    window.addEventListener("tasks-org-sync", onOrgSync);
    window.addEventListener("tasks-proj-sync", onProjSync);
    window.addEventListener("tasks-view-sync", onViewSync);

    window.dispatchEvent(new CustomEvent("tasks-nav-mounted"));

    return () => {
      window.removeEventListener("tasks-tab-sync", onTabSync);
      window.removeEventListener("tasks-org-sync", onOrgSync);
      window.removeEventListener("tasks-proj-sync", onProjSync);
      window.removeEventListener("tasks-view-sync", onViewSync);
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

  const handleTabChange = (t: "tasks" | "activity") => {
    setTab(t);
    window.dispatchEvent(new CustomEvent("tasks-tab-change", { detail: t }));
  };

  const handleOrgChange = (orgId: number | "all") => {
    setOrgFilter(orgId);
    setProjFilter("all");
    window.dispatchEvent(new CustomEvent("tasks-org-change", { detail: orgId }));
  };

  const handleProjChange = (projId: number | "all") => {
    setProjFilter(projId);
    if (projId !== "all") {
      setActiveWorkspaceFilter(projId);
    }
    window.dispatchEvent(new CustomEvent("tasks-proj-change", { detail: projId }));
  };

  const handleViewChange = (v: "list" | "calendar") => {
    setView(v);
    window.dispatchEvent(new CustomEvent("tasks-view-change", { detail: v }));
  };

  const handleAddTask = () => {
    window.dispatchEvent(new CustomEvent("tasks-add-open"));
  };

  return (
    <div className="flex w-full items-center justify-between gap-3">
      {/* Left: Tab Switcher (Tasks | Activity) — 26px outer container, 22px inner button, vertically centered */}
      <div className="flex h-[26px] items-center gap-0.5 rounded-md border bg-background p-[1px]">
        <button
          type="button"
          onClick={() => handleTabChange("tasks")}
          className={cn(
            "flex h-[22px] items-center justify-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors leading-none",
            tab === "tasks"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <ListTodo className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Tasks</span>
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
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-1.5">
        {/* Org filter */}
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

        {/* Project filter */}
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

        {tab === "tasks" && (
          <>
            {/* View toggle — 26px outer container, 22px inner icon buttons */}
            <div className="flex h-[26px] items-center rounded-md border bg-background p-[1px]">
              <Button
                variant={view === "list" ? "secondary" : "ghost"}
                size="icon"
                className="h-[22px] w-[22px] rounded-sm"
                onClick={() => handleViewChange("list")}
                title="List"
              >
                <List className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
              <Button
                variant={view === "calendar" ? "secondary" : "ghost"}
                size="icon"
                className="h-[22px] w-[22px] rounded-sm"
                onClick={() => handleViewChange("calendar")}
                title="Calendar"
              >
                <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.5} />
              </Button>
            </div>

            {/* Add Task */}
            <Button
              size="sm"
              className="h-6 gap-1.5 px-2.5 text-xs font-normal"
              onClick={handleAddTask}
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={1.5} />
              <span>Add task</span>
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

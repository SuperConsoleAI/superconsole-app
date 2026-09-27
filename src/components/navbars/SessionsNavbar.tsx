import { useState, useEffect } from "react";
import { MessageSquare, Terminal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaces } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";

export function SessionsNavbar() {
  const { workspaces, organizations } = useWorkspaces();
  const [tab, setTab] = useState<"cli" | "chat">("cli");
  const [orgFilter, setOrgFilter] = useState<number | "all">("all");
  const [projFilter, setProjFilter] = useState<number | "all">("all");

  useEffect(() => {
    const onTabSync = (e: any) => {
      if (e.detail) setTab(e.detail);
    };
    const onOrgSync = (e: any) => {
      if (e.detail !== undefined) setOrgFilter(e.detail);
    };
    const onProjSync = (e: any) => {
      if (e.detail !== undefined) setProjFilter(e.detail);
    };

    window.addEventListener("sessions-tab-sync", onTabSync);
    window.addEventListener("sessions-org-sync", onOrgSync);
    window.addEventListener("sessions-proj-sync", onProjSync);

    window.dispatchEvent(new CustomEvent("sessions-nav-mounted"));

    return () => {
      window.removeEventListener("sessions-tab-sync", onTabSync);
      window.removeEventListener("sessions-org-sync", onOrgSync);
      window.removeEventListener("sessions-proj-sync", onProjSync);
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

  const handleTabChange = (t: "cli" | "chat") => {
    setTab(t);
    window.dispatchEvent(new CustomEvent("sessions-tab-change", { detail: t }));
  };

  const handleOrgChange = (orgId: number | "all") => {
    setOrgFilter(orgId);
    setProjFilter("all");
    window.dispatchEvent(new CustomEvent("sessions-org-change", { detail: orgId }));
  };

  const handleProjChange = (projId: number | "all") => {
    setProjFilter(projId);
    window.dispatchEvent(new CustomEvent("sessions-proj-change", { detail: projId }));
  };

  return (
    <div className="flex w-full items-center justify-between gap-3">
      {/* Left: CLI | Chat Toggle — h-7 container, h-6 inner buttons */}
      <div className="flex h-7 items-center gap-0.5 rounded-md border bg-background p-0.5">
        <button
          type="button"
          onClick={() => handleTabChange("cli")}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
            tab === "cli"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <Terminal className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>CLI</span>
        </button>

        <button
          type="button"
          onClick={() => handleTabChange("chat")}
          className={cn(
            "flex h-6 items-center gap-1.5 rounded-sm px-2.5 text-xs font-medium transition-colors",
            tab === "chat"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted"
          )}
        >
          <MessageSquare className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Chat</span>
        </button>
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

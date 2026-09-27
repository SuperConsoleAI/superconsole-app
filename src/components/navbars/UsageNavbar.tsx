import { useState, useEffect, useMemo } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useWorkspaces } from "@/lib/workspace-context";
import { useAuth } from "@/lib/auth-context";
import { type UsageLevel } from "@/lib/api";
import { cn } from "@/lib/utils";

type Period = "month" | "year" | "all";

export function UsageNavbar() {
  const { workspaces } = useWorkspaces();
  const { auth, activeCloudOrg } = useAuth();

  const [level, setLevel] = useState<UsageLevel>("project");
  const [period, setPeriod] = useState<Period>("all");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [year, setYear] = useState<string>(() => String(new Date().getFullYear()));
  const [availableYears, setAvailableYears] = useState<string[]>([]);

  const cloudWorkspaces = useMemo(
    () => workspaces.filter((w) => !!w.project_id),
    [workspaces]
  );

  const orgs = auth?.orgs ?? [];
  const viewedOrgId = orgId ?? activeCloudOrg?.id ?? (orgs[0]?.id ?? null);

  // Initialize defaults
  useEffect(() => {
    if (!projectId && cloudWorkspaces.length > 0) {
      setProjectId(cloudWorkspaces[0].project_id as string);
    }
  }, [cloudWorkspaces, projectId]);

  useEffect(() => {
    const onStateSync = (e: any) => {
      const d = e.detail;
      if (!d) return;
      if (d.level !== undefined) setLevel(d.level);
      if (d.period !== undefined) setPeriod(d.period);
      if (d.projectId !== undefined) setProjectId(d.projectId);
      if (d.orgId !== undefined) setOrgId(d.orgId);
      if (d.year !== undefined) setYear(d.year);
      if (d.years !== undefined) setAvailableYears(d.years);
    };

    window.addEventListener("usage-state-sync", onStateSync);
    window.dispatchEvent(new CustomEvent("usage-nav-mounted"));

    return () => {
      window.removeEventListener("usage-state-sync", onStateSync);
    };
  }, []);

  const projectLabel =
    cloudWorkspaces.find((w) => w.project_id === projectId)?.name ??
    (cloudWorkspaces.length > 0 ? cloudWorkspaces[0].name : "Project");

  const orgLabel =
    orgs.find((o) => o.id === viewedOrgId)?.name ?? "Organization";

  const years = useMemo(() => {
    if (availableYears.length > 0) return availableYears;
    const cur = new Date().getFullYear().toString();
    return [cur, String(Number(cur) - 1), String(Number(cur) - 2)];
  }, [availableYears]);

  const handleLevelChange = (l: UsageLevel) => {
    setLevel(l);
    window.dispatchEvent(new CustomEvent("usage-level-change", { detail: l }));
  };

  const handleProjectChange = (pId: string) => {
    setProjectId(pId);
    window.dispatchEvent(new CustomEvent("usage-project-change", { detail: pId }));
  };

  const handleOrgChange = (oId: string) => {
    setOrgId(oId);
    window.dispatchEvent(new CustomEvent("usage-org-change", { detail: oId }));
  };

  const handlePeriodChange = (p: Period) => {
    setPeriod(p);
    window.dispatchEvent(new CustomEvent("usage-period-change", { detail: p }));
  };

  const handleYearChange = (y: string) => {
    setYear(y);
    window.dispatchEvent(new CustomEvent("usage-year-change", { detail: y }));
  };

  const handleExport = () => {
    window.dispatchEvent(new CustomEvent("usage-export-report"));
  };

  const seg = (active: boolean) =>
    cn(
      "flex h-6 items-center rounded-sm px-2.5 text-xs font-medium transition-colors",
      active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
    );

  return (
    <div className="flex w-full items-center justify-between gap-3">
      {/* Left side: Level switcher (Project | Org | User | Account) + Selectors */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 items-center gap-0.5 rounded-md bg-muted p-0.5">
          {(["project", "org", "user", "account"] as UsageLevel[]).map((l) => (
            <button
              key={l}
              type="button"
              className={seg(level === l)}
              onClick={() => handleLevelChange(l)}
            >
              {l[0].toUpperCase() + l.slice(1)}
            </button>
          ))}
        </div>

        {/* Project Selector Dropdown */}
        {level === "project" && cloudWorkspaces.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 px-2.5 text-xs font-normal">
                {projectLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {cloudWorkspaces.map((w) => (
                <DropdownMenuItem
                  key={w.id}
                  onClick={() => handleProjectChange(w.project_id as string)}
                >
                  {w.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Org Selector Dropdown */}
        {level === "org" && orgs.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 px-2.5 text-xs font-normal">
                {orgLabel}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
              {orgs.map((o) => (
                <DropdownMenuItem key={o.id} onClick={() => handleOrgChange(o.id)}>
                  {o.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* User Indicator */}
        {level === "user" && auth?.user && (
          <span className="text-xs text-muted-foreground px-1 truncate max-w-[200px]">
            {auth.user.email}
          </span>
        )}

        {/* Account Indicator */}
        {level === "account" && (
          <span className="text-[11px] text-muted-foreground px-1">
            All projects & orgs
          </span>
        )}
      </div>

      {/* Right side: Period switcher (This month | This year | All time) + Year picker + Export */}
      <div className="flex items-center gap-1.5">
        <div className="flex h-7 items-center gap-0.5 rounded-md bg-muted p-0.5">
          {(["month", "year", "all"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              className={seg(period === p)}
              onClick={() => handlePeriodChange(p)}
            >
              {p === "month" ? "This month" : p === "year" ? "This year" : "All time"}
            </button>
          ))}
        </div>

        {period === "year" && years.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-6 px-2.5 text-xs tabular-nums font-normal">
                {year}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {years.map((y) => (
                <DropdownMenuItem key={y} onClick={() => handleYearChange(y)}>
                  {y}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2.5 text-xs font-normal gap-1.5"
          onClick={handleExport}
        >
          <Download className="h-3.5 w-3.5" strokeWidth={1.5} />
          <span>Export</span>
        </Button>
      </div>
    </div>
  );
}

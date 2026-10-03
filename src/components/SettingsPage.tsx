/**
 * SettingsPage Component — Multi-tier settings console (Account, Organization, Project)
 * Manages models, connectors, team members, appearance, and general preferences.
 */
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  BookOpen,
  Blocks,
  Check,
  CircleUser,
  Copy,
  CreditCard,
  Database,
  FileCode,
  Globe,
  HardDrive,
  KeyRound,
  type LucideIcon,
  ArrowLeft,
  MessageSquare,
  Palette,
  Pencil,
  Play,
  Plug,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Trash2,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
  Sparkles,
  Terminal,
  Users,
  Workflow,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  api,
  CLI_PRESETS,
  LLM_PROVIDERS,
  ORG_ROLES,
  PROJECT_ROLES,
  type MemberView,
  type SlashCommand,
} from "@/lib/api";
import { ConnectorManager } from "@/components/connectors/ConnectorManager";
export { ConnectorManager };
import { LocalDBStudio } from "@/components/localdb/LocalDBStudio";
import { UserDBSection } from "@/components/UserDBSection";
import {
  ProfileSection,
  PublicProfileSection,
  OffPlatformSection,
} from "@/components/settings/profile";
import { GeneralSection } from "@/components/settings/general";
import { PresetsSection } from "@/components/settings/presets";
import { LlmKeyEditor } from "@/components/settings/models";
import {
  AccountEnvironmentSection,
  EnvironmentSection,
} from "@/components/settings/environment";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";


import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";

import { LibrarySection } from "@/components/libraryx";
import { useAuth } from "@/lib/auth-context";
import { useWorkspaces } from "@/lib/workspace-context";
import { cn, getActiveWorkspaceFilter, setActiveWorkspaceFilter } from "@/lib/utils";

type TopTab = "account" | "org" | "project" | "profile";

const NAV: Record<TopTab, string[]> = {
  account: [
    "General",
    "Profile",
    "Appearance",
    "Terminal",
    "Environment",
    "Models",
    "Integrations",
    "Connectors",
    "LocalDB",
    "UserDB",
    "Security",
    "Notifications",
  ],
  org: ["General", "Team", "Models", "Integrations", "Connectors", "Billing"],
  project: [
    "General",
    "Environment",
    "Scripts",
    "Team",
    "Models",
    "Integrations",
    "Connectors",
    "Messaging",
    "Automations",
  ],
  profile: ["Profile", "Public Profile", "Off-Platform"],
};

const NAV_ICONS: Record<string, LucideIcon> = {
  General: SettingsIcon,
  Profile: CircleUser,
  "Public Profile": Globe,
  "Off-Platform": ShieldAlert,
  Environment: KeyRound,
  Scripts: FileCode,
  Appearance: Palette,
  Terminal: Terminal,
  Models: Sparkles,
  Commands: Terminal,
  Integrations: Blocks,
  Connectors: Plug,
  LocalDB: Database,
  UserDB: HardDrive,
  Messaging: MessageSquare,
  Security: Shield,
  Notifications: Bell,
  Library: BookOpen,
  Team: Users,
  Billing: CreditCard,
  Automations: Workflow,
};

export function SettingsPage({
  initialWorkspaceId,
  initialTab,
  initialSection,
}: {
  initialWorkspaceId?: number;
  initialTab?: TopTab;
  initialSection?: string;
} = {}) {
  const { workspaces } = useWorkspaces();
  const { activeCloudOrg, setActiveCloudOrgId } = useAuth();
  const activeWsId = getActiveWorkspaceFilter(initialWorkspaceId);

  const [tab, setTab] = useState<TopTab>(
    initialTab === "profile" ? "account" : (initialTab ?? (initialWorkspaceId ? "project" : "account")),
  );
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Record<TopTab, string>>({
    account: initialTab === "profile" ? "Profile" : (initialTab === "account" && initialSection ? initialSection : "General"),
    org: initialTab === "org" && initialSection ? initialSection : "General",
    project: initialTab === "project" && initialSection ? initialSection : "General",
    profile: "Profile",
  });
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("settings_sidebar_collapsed") === "true";
    }
    return false;
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      if (typeof window !== "undefined") {
        localStorage.setItem("settings_sidebar_collapsed", String(next));
      }
      return next;
    });
  };

  useEffect(() => {
    if (initialTab === "profile") {
      setTab("account");
      setSection((prev) => ({ ...prev, account: "Profile" }));
    } else if (initialTab) {
      setTab(initialTab);
    }
    if (initialSection) {
      const targetTab = initialTab === "profile" ? "account" : (initialTab ?? tab);
      setSection((prev) => ({ ...prev, [targetTab]: initialSection }));
    }
  }, [initialTab, initialSection]);

  // Project scope selection, shared across Project sub-sections.
  const [workspaceId, setWorkspaceId] = useState<number | null>(() => activeWsId);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  const selectProject = async (id: number) => {
    setWorkspaceId(id);
    setActiveWorkspaceFilter(id);
    setProjectId(null);
    setProjectError(null);
    if (!activeCloudOrg) {
      setProjectError("Select an organisation first.");
      return;
    }
    setEnsuring(true);
    try {
      setProjectId(await api.ensureWorkspaceProject(id, activeCloudOrg.id));
    } catch (e) {
      setProjectError(String(e));
    } finally {
      setEnsuring(false);
    }
  };

  // Default to active or first workspace when entering the Project tab.
  useEffect(() => {
    if (tab === "project" && workspaces.length > 0) {
      const targetId = workspaceId ?? activeWsId ?? workspaces[0].id;
      if (workspaceId !== targetId || projectId === null) {
        selectProject(targetId);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, workspaces, activeCloudOrg, activeWsId]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("settings-tab-sync", {
        detail: { tab, workspaceId },
      })
    );
  }, [tab, workspaceId]);

  useEffect(() => {
    const onTab = (e: any) => {
      if (e.detail === "profile") {
        setTab("account");
        setSection((prev) => ({ ...prev, account: "Profile" }));
      } else if (e.detail) {
        setTab(e.detail);
      }
    };
    const onProject = (e: any) => { if (typeof e.detail === "number") selectProject(e.detail); };
    const onOrg = (e: any) => { if (e.detail) setActiveCloudOrgId(e.detail); };
    const onNavMounted = () => {
      window.dispatchEvent(
        new CustomEvent("settings-tab-sync", {
          detail: { tab, workspaceId },
        })
      );
    };
    window.addEventListener("settings-tab-change", onTab);
    window.addEventListener("settings-project-change", onProject);
    window.addEventListener("settings-org-change", onOrg);
    window.addEventListener("settings-nav-mounted", onNavMounted);
    return () => {
      window.removeEventListener("settings-tab-change", onTab);
      window.removeEventListener("settings-project-change", onProject);
      window.removeEventListener("settings-org-change", onOrg);
      window.removeEventListener("settings-nav-mounted", onNavMounted);
    };
  }, [tab, workspaceId, setActiveCloudOrgId]);

  const active = section[tab];
  const setActive = (s: string) =>
    setSection((prev) => ({ ...prev, [tab]: s }));

  const navItems = NAV[tab].filter((i) =>
    i.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col">

      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "flex shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 ease-in-out",
            isCollapsed ? "w-12" : "w-56",
          )}
        >
          {isCollapsed ? (
            <div className="p-2 pb-1 flex justify-center">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCollapsed(false);
                      if (typeof window !== "undefined") {
                        localStorage.setItem("settings_sidebar_collapsed", "false");
                      }
                    }}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Search settings"
                  >
                    <Search className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Search settings</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="p-3 pb-1">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search settings..."
                  className="h-8 pl-8 text-xs"
                />
              </div>
            </div>
          )}

          <ScrollArea className={cn("min-h-0 flex-1 py-2", isCollapsed ? "px-1.5" : "px-2")}>
            {navItems.map((item) => {
              const Icon = NAV_ICONS[item];
              if (isCollapsed) {
                return (
                  <Tooltip key={item}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => setActive(item)}
                        className={cn(
                          "relative flex h-8 w-8 items-center justify-center rounded-md mx-auto my-1 transition-colors cursor-pointer",
                          active === item
                            ? "bg-accent font-medium text-accent-foreground"
                            : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                        )}
                        aria-label={item}
                      >
                        {Icon ? (
                          <Icon className="h-4 w-4 shrink-0" />
                        ) : (
                          <span className="text-xs font-semibold">{item[0]}</span>
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="right">{item}</TooltipContent>
                  </Tooltip>
                );
              }
              return (
                <button
                  key={item}
                  onClick={() => setActive(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors cursor-pointer",
                    active === item
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                  {item}
                </button>
              );
            })}
          </ScrollArea>

          <button
            type="button"
            tabIndex={-1}
            onClick={() => {
              setTab("account");
              setSection((prev) => ({ ...prev, account: "Library" }));
            }}
            className={cn(
              "w-full text-transparent select-none cursor-default bg-transparent text-[11px] shrink-0 outline-none",
              isCollapsed ? "h-2" : "h-6",
            )}
            aria-label="Library"
          >
            Library
          </button>

          {isCollapsed ? (
            <div className="border-t p-1.5 flex flex-col items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={() => openUrl("https://github.com").catch(() => {})}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Documentation"
                  >
                    <BookOpen className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Documentation</TooltipContent>
              </Tooltip>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleCollapse}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Expand sidebar"
                  >
                    <PanelLeftOpen className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Expand sidebar</TooltipContent>
              </Tooltip>
            </div>
          ) : (
            <div className="border-t px-2.5 h-[44px] flex items-center justify-between shrink-0">
              <button
                type="button"
                onClick={() => openUrl("https://github.com").catch(() => {})}
                className="flex items-center gap-2 px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground hover:bg-accent/40 rounded-md cursor-pointer"
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                <span>Documentation</span>
              </button>

              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={toggleCollapse}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors cursor-pointer"
                    aria-label="Collapse sidebar"
                  >
                    <PanelLeftClose className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="right">Collapse sidebar</TooltipContent>
              </Tooltip>
            </div>
          )}
        </aside>

        {active === "LocalDB" ? (
          <div className="min-h-0 flex-1 flex flex-col overflow-hidden">
            <Content
              tab={tab}
              section={active}
              workspaceId={workspaceId}
              projectId={projectId}
              projectError={projectError}
              ensuring={ensuring}
              hasWorkspaces={workspaces.length > 0}
              onNavigateSection={(sec) => setSection((prev) => ({ ...prev, [tab]: sec }))}
            />
          </div>
        ) : (
          <ScrollArea className="min-h-0 flex-1">
            <div className="mx-auto max-w-2xl px-8 py-8">
              <h2 className="font-display text-xl font-semibold">{active}</h2>
              <div className="mt-6">
                <Content
                  tab={tab}
                  section={active}
                  workspaceId={workspaceId}
                  projectId={projectId}
                  projectError={projectError}
                  ensuring={ensuring}
                  hasWorkspaces={workspaces.length > 0}
                  onNavigateSection={(sec) => setSection((prev) => ({ ...prev, [tab]: sec }))}
                />
              </div>
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

function Content({
  tab,
  section,
  workspaceId,
  projectId,
  projectError,
  ensuring,
  hasWorkspaces,
  onNavigateSection,
}: {
  tab: TopTab;
  section: string;
  workspaceId: number | null;
  projectId: string | null;
  projectError: string | null;
  ensuring: boolean;
  hasWorkspaces: boolean;
  onNavigateSection?: (section: string) => void;
}) {
  const { auth, activeCloudOrg } = useAuth();

  if (tab === "account") {
    switch (section) {
      case "General":
        return <GeneralSection onNavigateSection={onNavigateSection} />;
      case "Profile":
        return auth ? (
          <ProfileSection user={auth.user} onNavigateSection={onNavigateSection} />
        ) : (
          <SignInPrompt label="manage your profile" />
        );
      case "Appearance":
        return <AppearanceSection />;
      case "Terminal":
      case "Presets":
        return <PresetsSection user={auth?.user} />;
      case "Environment":
        return <AccountEnvironmentSection />;
      case "Models":
        return auth ? (
          <LlmKeyEditor
            scope="account"
            scopeId={auth.user.id}
            description="Personal model keys that apply across every organisation you belong to."
          />
        ) : (
          <SignInPrompt label="manage model keys" />
        );
      case "Commands":
        return <GlobalCommandsSection />;
      case "Integrations":
        return auth ? (
          <ConnectorManager
            scope="account"
            scopeId={auth.user.id}
            category="integrations"
          />
        ) : (
          <SignInPrompt label="manage integrations" />
        );
      case "Connectors":
        return auth ? (
          <ConnectorManager
            scope="account"
            scopeId={auth.user.id}
            category="connectors"
          />
        ) : (
          <SignInPrompt label="manage connectors" />
        );
      case "LocalDB":
        return <LocalDBStudio />;
      case "UserDB":
        return <UserDBSection />;
      case "Security":
        return <SecuritySection />;
      case "Notifications":
        return <NotificationsSection />;
      case "Library":
        return auth ? <LibrarySection /> : <SignInPrompt label="manage library" />;
    }
  }

  if (tab === "profile") {
    if (!auth) return <SignInPrompt label="view and edit your profile" />;
    switch (section) {
      case "Profile":
        return <ProfileSection user={auth.user} onNavigateSection={onNavigateSection} />;
      case "Public Profile":
        return <PublicProfileSection user={auth.user} />;
      case "Off-Platform":
        return <OffPlatformSection user={auth.user} onNavigateSection={onNavigateSection} />;
      default:
        return <ProfileSection user={auth.user} onNavigateSection={onNavigateSection} />;
    }
  }

  if (tab === "org") {
    if (!auth) return <SignInPrompt label="manage your organisation" />;
    if (!activeCloudOrg)
      return <Hint>Select an organisation to continue.</Hint>;
    switch (section) {
      case "General":
        return <OrgGeneralSection />;
      case "Team":
        return <TeamSection />;
      case "Models":
        return (
          <LlmKeyEditor
            scope="org"
            scopeId={activeCloudOrg.id}
            description={`Shared model keys for everyone in ${activeCloudOrg.name}.`}
          />
        );
      case "Integrations":
        return (
          <ConnectorManager
            scope="org"
            scopeId={activeCloudOrg.id}
            category="integrations"
          />
        );
      case "Connectors":
        return (
          <ConnectorManager
            scope="org"
            scopeId={activeCloudOrg.id}
            category="connectors"
          />
        );
      case "Billing":
        return <Placeholder name="Billing" />;
    }
  }

  if (tab === "project") {
    if (!auth) return <SignInPrompt label="manage projects" />;
    if (!activeCloudOrg)
      return <Hint>Select an organisation to continue.</Hint>;
    if (!hasWorkspaces)
      return <Hint>Add a workspace to create your first project.</Hint>;
    if (ensuring) return <Hint>Linking project…</Hint>;
    if (projectError) return <p className="text-xs text-destructive">{projectError}</p>;
    if (!projectId) return <Hint>Select a project to continue.</Hint>;

    switch (section) {
      case "General":
        return workspaceId !== null ? (
          <ProjectGeneralSection projectId={projectId} workspaceId={workspaceId} />
        ) : (
          <Hint>Select a project to continue.</Hint>
        );
      case "Environment":
        return workspaceId !== null ? (
          <EnvironmentSection workspaceId={workspaceId} />
        ) : (
          <Hint>Select a project to continue.</Hint>
        );
      case "Scripts":
        return workspaceId !== null ? (
          <ScriptsSection workspaceId={workspaceId} />
        ) : (
          <Hint>Select a project to continue.</Hint>
        );
      case "Team":
        return <ProjectTeamSection projectId={projectId} />;
      case "Models":
        return (
          <LlmKeyEditor
            scope="project"
            scopeId={projectId}
            description="Per-project model keys. These override organisation and account keys."
          />
        );
      case "Integrations":
        return (
          <ConnectorManager
            scope="project"
            scopeId={projectId}
            category="integrations"
          />
        );
      case "Connectors":
        return (
          <ConnectorManager
            scope="project"
            scopeId={projectId}
            category="connectors"
          />
        );
      case "Automations":
        return (
          <div className="rounded-xl border border-dashed px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Automations have moved to the <Link to="/agents" className="font-medium text-primary hover:underline">Agents</Link> page.
            </p>
          </div>
        );
      case "Messaging":
        return <MessagingSection projectId={projectId} />;
    }
  }

  return <Placeholder name={section} />;
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

function Placeholder({ name }: { name: string }) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">{name} is coming soon.</p>
    </div>
  );
}

function SignInPrompt({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="text-sm text-muted-foreground">Sign in to {label}.</p>
    </div>
  );
}



function NotificationsSection() {
  return (
    <div className="flex flex-col gap-6">
      <IntegrationsSection />
      <div>
        <h3 className="text-sm font-medium">Desktop notifications</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Native desktop alerts for completed jobs and inbox items are coming
          soon.
        </p>
      </div>
    </div>
  );
}

function OrgGeneralSection() {
  const { activeCloudOrg } = useAuth();
  if (!activeCloudOrg) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-card px-4 py-3">
        <p className="text-sm font-medium">{activeCloudOrg.name}</p>
        <p className="mt-0.5 text-xs capitalize text-muted-foreground">
          {activeCloudOrg.role} · {activeCloudOrg.plan} plan
        </p>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Organisations live in the cloud and scope projects, team, model keys,
        and connectors shared across everyone who belongs to them. Agent
        sessions and files stay local to each device.
      </p>
    </div>
  );
}

function ProjectGeneralSection({
  projectId,
  workspaceId,
}: {
  projectId: string;
  workspaceId: number;
}) {
  const { workspaces, updateWorkspaceFields, removeWorkspace } = useWorkspaces();
  const ws =
    workspaces.find((w) => w.id === workspaceId) ??
    workspaces.find((w) => w.project_id === projectId);
  const [repo, setRepo] = useState("");
  const [desc, setDesc] = useState("");
  const [tagline, setTagline] = useState("");
  const [details, setDetails] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [sliderText, setSliderText] = useState("");
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setRepo(ws?.repo_url ?? "");
    setDesc(ws?.description ?? "");
    setTagline(ws?.tagline ?? "");
    setDetails(ws?.details ?? "");
    setLogoUrl(ws?.logo_url ?? "");
    setImageUrl(ws?.image_url ?? "");
    try {
      const parsed = typeof ws?.slider === "string" ? JSON.parse(ws.slider) : ws?.slider;
      if (Array.isArray(parsed)) {
        setSliderText(parsed.join("\n"));
      } else {
        setSliderText("");
      }
    } catch {
      setSliderText("");
    }
  }, [ws?.id, ws?.repo_url, ws?.description, ws?.tagline, ws?.details, ws?.logo_url, ws?.image_url, ws?.slider]);

  if (!ws) return <Hint>Select a project to continue.</Hint>;

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border bg-card px-4 py-3">
        <p className="text-sm font-medium">{ws.name}</p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">{ws.path}</p>
      </div>

      <div>
        <h3 className="text-sm font-medium">Default session</h3>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Opens this mode automatically when you switch to this workspace.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={ws.default_run_mode}
            onChange={(e) =>
              updateWorkspaceFields(ws.id, {
                default_run_mode: e.target.value as "cli" | "chat",
              }).catch(console.error)
            }
            className="h-8 rounded-md border bg-background px-2 text-[13px]"
          >
            <option value="cli">CLI</option>
            <option value="chat">Chat</option>
          </select>
          {ws.default_run_mode === "cli" ? (
            <select
              value={ws.default_cli}
              onChange={(e) =>
                updateWorkspaceFields(ws.id, { default_cli: e.target.value }).catch(
                  console.error,
                )
              }
              className="h-8 rounded-md border bg-background px-2 text-[13px]"
            >
              {CLI_PRESETS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
              <option value="shell">Shell</option>
            </select>
          ) : (
            <>
              <select
                value={ws.default_provider}
                onChange={(e) =>
                  updateWorkspaceFields(ws.id, {
                    default_provider: e.target.value,
                  }).catch(console.error)
                }
                className="h-8 rounded-md border bg-background px-2 text-[13px]"
              >
                {LLM_PROVIDERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              <Input
                value={ws.default_model}
                onChange={(e) =>
                  updateWorkspaceFields(ws.id, { default_model: e.target.value }).catch(
                    console.error,
                  )
                }
                placeholder="Model (optional)"
                className="h-8 w-48 font-mono text-xs"
              />
            </>
          )}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Repository</h3>
        <p className="mb-2 mt-1 text-xs leading-relaxed text-muted-foreground">
          Link to a GitHub/GitLab repo (optional, for display).
        </p>
        <div className="flex gap-2">
          <Input
            value={repo}
            onChange={(e) => setRepo(e.target.value)}
            placeholder="https://github.com/owner/repo"
            className="h-8 flex-1 font-mono text-xs"
          />
          <SaveButton onSave={() => updateWorkspaceFields(ws.id, { repo_url: repo })} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Tagline</h3>
        <p className="mb-2 mt-1 text-xs leading-relaxed text-muted-foreground">
          Short one-line punchline or subtitle for this workspace.
        </p>
        <div className="flex gap-2">
          <Input
            value={tagline}
            onChange={(e) => setTagline(e.target.value)}
            placeholder="e.g. Real-time developer workspace"
            className="h-8 flex-1 text-xs"
          />
          <SaveButton onSave={() => updateWorkspaceFields(ws.id, { tagline: tagline.trim() || null })} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Description</h3>
        <p className="mb-2 mt-1 text-xs leading-relaxed text-muted-foreground">
          Brief summary about this project.
        </p>
        <div className="flex gap-2">
          <Input
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="What is this project?"
            className="h-8 flex-1 text-xs"
          />
          <SaveButton onSave={() => updateWorkspaceFields(ws.id, { description: desc.trim() })} />
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Details</h3>
        <p className="mb-2 mt-1 text-xs leading-relaxed text-muted-foreground">
          Extended notes, overview, or markdown documentation for this project.
        </p>
        <div className="flex flex-col gap-2">
          <textarea
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Comprehensive project overview, documentation, or specifications..."
            rows={4}
            className="w-full rounded-md border border-input bg-background p-2.5 text-xs font-normal focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex justify-end">
            <SaveButton onSave={() => updateWorkspaceFields(ws.id, { details: details.trim() || null })} />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">Logo URL</h3>
          <p className="mb-2 mt-1 text-xs leading-relaxed text-muted-foreground">
            URL for the workspace logo / icon.
          </p>
          <div className="flex gap-2">
            <Input
              value={logoUrl}
              onChange={(e) => setLogoUrl(e.target.value)}
              placeholder="https://example.com/logo.svg"
              className="h-8 flex-1 font-mono text-xs"
            />
            <SaveButton onSave={() => updateWorkspaceFields(ws.id, { logo_url: logoUrl.trim() || null })} />
          </div>
        </div>

        <div>
          <h3 className="text-sm font-medium">Image URL</h3>
          <p className="mb-2 mt-1 text-xs leading-relaxed text-muted-foreground">
            Hero banner or preview image for this project.
          </p>
          <div className="flex gap-2">
            <Input
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://example.com/cover.png"
              className="h-8 flex-1 font-mono text-xs"
            />
            <SaveButton onSave={() => updateWorkspaceFields(ws.id, { image_url: imageUrl.trim() || null })} />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium">Slider Images</h3>
        <p className="mb-2 mt-1 text-xs leading-relaxed text-muted-foreground">
          Image URLs for the project slider / carousel (one per line).
        </p>
        <div className="flex flex-col gap-2">
          <textarea
            value={sliderText}
            onChange={(e) => setSliderText(e.target.value)}
            placeholder="https://example.com/slide1.png&#10;https://example.com/slide2.png"
            rows={3}
            className="w-full rounded-md border border-input bg-background p-2.5 font-mono text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex justify-end">
            <SaveButton
              onSave={() => {
                const arr = sliderText
                  .split("\n")
                  .map((s) => s.trim())
                  .filter(Boolean);
                return updateWorkspaceFields(ws.id, { slider: JSON.stringify(arr) });
              }}
            />
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-sm font-medium text-destructive">Danger zone</h3>
        <div className="mt-2 flex items-center justify-between rounded-lg border border-destructive/40 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium">Delete project</p>
            <p className="text-xs text-muted-foreground">
              Removes this workspace from SuperConsole. Files on disk are not
              deleted.
            </p>
          </div>
          {confirming ? (
            <div className="flex shrink-0 items-center gap-2">
              <Button
                size="sm"
                variant="destructive"
                onClick={() => removeWorkspace(ws.id).catch(console.error)}
              >
                Confirm
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              className="shrink-0"
              onClick={() => setConfirming(true)}
            >
              Delete project
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ScriptField({
  title,
  hint,
  value,
  onSave,
  onRun,
}: {
  title: string;
  hint: string;
  value: string;
  onSave: (v: string) => void;
  onRun: (v: string) => void;
}) {
  const [text, setText] = useState(value);
  useEffect(() => setText(value), [value]);
  return (
    <div>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">{title}</h3>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          disabled={!text.trim()}
          onClick={() => onRun(text)}
        >
          <Play className="h-3.5 w-3.5" />
          Run
        </Button>
      </div>
      <p className="mb-2 mt-0.5 text-xs text-muted-foreground">{hint}</p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onSave(text)}
        rows={3}
        placeholder="shell commands…"
        className="w-full rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
        spellCheck={false}
      />
    </div>
  );
}

function ScriptsSection({ workspaceId }: { workspaceId: number }) {
  const { workspaces, updateWorkspaceFields, openScriptTab } = useWorkspaces();
  const ws = workspaces.find((w) => w.id === workspaceId);
  if (!ws) return <Hint>Select a project to continue.</Hint>;

  return (
    <div className="flex flex-col gap-6">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Commands that run at workspace lifecycle events, in a shell tab with this
        project's .env loaded.
      </p>

      <ScriptField
        title="Setup script"
        hint="Runs when the workspace is first opened."
        value={ws.script_setup}
        onSave={(v) => updateWorkspaceFields(ws.id, { script_setup: v }).catch(console.error)}
        onRun={(v) => openScriptTab(ws.id, "Setup", v)}
      />

      <div>
        <ScriptField
          title="Run script"
          hint="Runs when you click the Run button."
          value={ws.script_run}
          onSave={(v) => updateWorkspaceFields(ws.id, { script_run: v }).catch(console.error)}
          onRun={(v) => openScriptTab(ws.id, "Run", v)}
        />
        <label className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={ws.script_auto_run}
            onChange={(e) =>
              updateWorkspaceFields(ws.id, { script_auto_run: e.target.checked }).catch(
                console.error,
              )
            }
          />
          Auto-run after setup
        </label>
      </div>

      <ScriptField
        title="Teardown script"
        hint="Runs before the workspace is archived or removed."
        value={ws.script_teardown}
        onSave={(v) => updateWorkspaceFields(ws.id, { script_teardown: v }).catch(console.error)}
        onRun={(v) => openScriptTab(ws.id, "Teardown", v)}
      />
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="mb-3 text-sm font-medium">Theme</h3>
        <div className="flex gap-3">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "flex-1 rounded-xl border p-1 transition-all",
                theme === t ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30",
              )}
            >
              <div
                className={cn(
                  "flex h-20 items-center justify-center rounded-lg border border-border/40 text-xs font-medium",
                  t === "light"
                    ? "bg-card text-foreground"
                    : "dark bg-card text-foreground",
                )}
              >
                {t === "light" ? "Cream" : "Charcoal"}
              </div>
              <p className="py-1.5 text-center text-xs capitalize">{t}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}



function SaveButton({
  onSave,
  disabled,
}: {
  onSave: () => Promise<void>;
  disabled?: boolean;
}) {
  const [saved, setSaved] = useState(false);
  return (
    <Button
      size="sm"
      disabled={disabled}
      onClick={async () => {
        try {
          await onSave();
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        } catch {
          // error handled by parent
        }
      }}
    >
      {saved && <Check className="h-3.5 w-3.5" />}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}

function IntegrationsSection() {
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-card px-4 py-4">
        <h3 className="text-sm font-medium">Telegram bot</h3>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          Telegram bots are now configured under{" "}
          <strong>Org → Connectors → Telegram</strong> (shared org bot) and{" "}
          <strong>Project → Connectors → Telegram</strong> (per-project routing).
          The old global token setting still works as a fallback.
        </p>
        <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
          <li>
            <span className="font-medium text-foreground">Option A — shared bot:</span>{" "}
            Set bot_token at org level, then set chat_id (+ optional topic) per project.
          </li>
          <li>
            <span className="font-medium text-foreground">Option B — own bot:</span>{" "}
            Set bot_token + chat_id per project to give each client their own bot.
          </li>
        </ul>
      </div>
    </div>
  );
}

const SECURITY_POINTS = [
  "Encrypted before leaving your device (AES-256-GCM)",
  "We never see your plaintext keys",
  "Go Local mode: Zero cloud credential synchronization — keeps model API keys and connector secrets strictly on-device",
  "UserDB support: Dedicated isolated per-account user database schemas",
  "Stored as encrypted data in your private database",
  "Decrypted only in memory when your agent needs them",
  "Signing out removes all keys from this machine",
  "You can delete all your data at any time",
];

function SecuritySection() {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [done, setDone] = useState(false);

  const clear = async () => {
    setClearing(true);
    try {
      await api.clearLocalCloudData();
      setDone(true);
      setTimeout(() => setDone(false), 5000);
    } catch {
      /* ignore */
    } finally {
      setClearing(false);
      setConfirming(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border bg-card px-4 py-4">
        <h3 className="text-sm font-medium">How we protect your API keys</h3>
        <ul className="mt-3 flex flex-col gap-2">
          {SECURITY_POINTS.map((point) => (
            <li key={point} className="flex items-start gap-2 text-[13px]">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="text-sm font-medium">Clear local data</h3>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Removes all cached keys and connectors plus the derived encryption key
          from this machine. Your cloud data is untouched and you stay signed
          in; keys re-sync on next use.
        </p>
        {done ? (
          <p className="text-xs text-primary">
            Local data cleared. Keys will re-sync on next use.
          </p>
        ) : confirming ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Are you sure?</span>
            <Button size="sm" variant="destructive" onClick={clear} disabled={clearing}>
              {clearing ? "Clearing..." : "Confirm clear"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
          </div>
        ) : (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            Clear local data
          </Button>
        )}
      </div>
    </div>
  );
}

const PORTAL_LOGIN_URL = "https://app.superconsole.dev/login";

function TeamSection() {
  const { auth, activeCloudOrg } = useAuth();
  const [members, setMembers] = useState<MemberView[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<string>(ORG_ROLES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const orgId = activeCloudOrg?.id ?? null;
  const canManage =
    activeCloudOrg?.role === "owner" || activeCloudOrg?.role === "admin";
  const isOwner = activeCloudOrg?.role === "owner";

  const load = async () => {
    if (!orgId) return;
    try {
      setMembers(await api.listOrgMembers(orgId));
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    setMembers([]);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  if (!auth || !activeCloudOrg) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const invite = () =>
    run(async () => {
      await api.inviteOrgMember(orgId!, email, role);
      setEmail("");
    });

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Members of {activeCloudOrg.name} share its projects, connectors, and
        keys. Owners and admins manage the team. Invited people join
        automatically when they sign in with the invited email.
      </p>

      {canManage && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <h3 className="text-sm font-medium">Invite a member</h3>
          <div className="flex gap-2">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@company.com"
              className="h-8 flex-1 text-xs"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="h-8 rounded-md border bg-background px-2 text-[13px]"
            >
              {ORG_ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={busy} onClick={invite}>
              Invite
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">
              Share the portal link so they can sign in:
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 text-[11px] text-muted-foreground"
              onClick={() => {
                navigator.clipboard.writeText(PORTAL_LOGIN_URL);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? (
                <Check className="h-3 w-3" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
              Copy link
            </Button>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {members.map((m) => {
          const isSelf = m.user_id === auth.user.id;
          const targetOwner = m.role === "owner";
          const editable =
            canManage && !isSelf && m.status === "active" && (isOwner || !targetOwner);
          return (
            <div
              key={m.user_id ?? `invite-${m.email}`}
              className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {m.name ?? m.email}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {m.email}
                  {m.status === "invited" && " · Invited"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {editable ? (
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(e) =>
                      run(() =>
                        api.updateOrgMemberRole(orgId!, m.user_id!, e.target.value),
                      )
                    }
                    className="h-7 rounded-md border bg-background px-1.5 text-xs capitalize"
                  >
                    {(isOwner
                      ? [{ id: "owner", label: "Owner" }, ...ORG_ROLES]
                      : ORG_ROLES
                    ).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] capitalize text-muted-foreground">
                    {m.role}
                  </span>
                )}
                {canManage && m.status === "invited" && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground"
                    disabled={busy}
                    onClick={() =>
                      run(() => api.cancelOrgInvitation(orgId!, m.email))
                    }
                  >
                    Cancel
                  </Button>
                )}
                {canManage && m.status === "active" && !isSelf && (isOwner || !targetOwner) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    disabled={busy}
                    onClick={() => run(() => api.removeOrgMember(orgId!, m.user_id!))}
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function ProjectTeamSection({ projectId }: { projectId: string }) {
  const { auth, activeCloudOrg } = useAuth();
  const [members, setMembers] = useState<MemberView[]>([]);
  const [addable, setAddable] = useState<MemberView[]>([]);
  const [userId, setUserId] = useState<string>("");
  const [role, setRole] = useState<string>(PROJECT_ROLES[0].id);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canManage =
    activeCloudOrg?.role === "owner" || activeCloudOrg?.role === "admin";

  const load = async () => {
    try {
      const [list, add] = await Promise.all([
        api.listProjectMembers(projectId),
        api.listAddableProjectMembers(projectId),
      ]);
      setMembers(list);
      setAddable(add);
      setUserId(add[0]?.user_id ?? "");
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    setMembers([]);
    setAddable([]);
    setError(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (!auth) return null;

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Project members are drawn from your organisation and granted access to
        this project's workspace, keys, and connectors.
      </p>

      {canManage && (
        <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
          <h3 className="text-sm font-medium">Add a member</h3>
          {addable.length > 0 ? (
            <div className="flex gap-2">
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="h-8 flex-1 rounded-md border bg-background px-2 text-[13px]"
              >
                {addable.map((m) => (
                  <option key={m.user_id ?? m.email} value={m.user_id ?? ""}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="h-8 rounded-md border bg-background px-2 text-[13px]"
              >
                {PROJECT_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                disabled={busy || !userId}
                onClick={() =>
                  run(() => api.addProjectMember(projectId, userId, role))
                }
              >
                Add
              </Button>
            </div>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              Everyone in your organisation already has access.
            </p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        {members.map((m) => {
          const isSelf = m.user_id === auth.user.id;
          return (
            <div
              key={m.user_id ?? m.email}
              className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {m.name ?? m.email}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {m.email}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canManage && !isSelf ? (
                  <select
                    value={m.role}
                    disabled={busy}
                    onChange={(e) =>
                      run(() =>
                        api.updateProjectMemberRole(
                          projectId,
                          m.user_id!,
                          e.target.value,
                        ),
                      )
                    }
                    className="h-7 rounded-md border bg-background px-1.5 text-xs capitalize"
                  >
                    {PROJECT_ROLES.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[11px] capitalize text-muted-foreground">
                    {m.role}
                  </span>
                )}
                {canManage && !isSelf && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive"
                    disabled={busy}
                    onClick={() =>
                      run(() => api.removeProjectMember(projectId, m.user_id!))
                    }
                  >
                    Remove
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MessagingSection({ projectId }: { projectId: string }) {
  return (
    <div className="flex flex-col gap-6">
      {/* How it works */}
      <div className="rounded-xl border bg-card px-5 py-5">
        <div className="mb-3 flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-semibold">How Telegram messaging works</h3>
        </div>
        <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
          Each project can receive messages and send notifications through Telegram.
          Two setups are supported — pick whichever fits your team:
        </p>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border bg-muted/40 px-4 py-3">
            <p className="mb-1 text-xs font-medium">Option A — shared org bot</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Set <code className="rounded bg-background px-1">bot_token</code> once at{" "}
              <strong>Org → Connectors → Telegram</strong>. Each project gets its own
              Telegram group topic — set <code className="rounded bg-background px-1">chat_id</code>{" "}
              and optionally <code className="rounded bg-background px-1">Message Thread ID</code>{" "}
              here. One bot serves all projects.
            </p>
          </div>
          <div className="rounded-lg border bg-muted/40 px-4 py-3">
            <p className="mb-1 text-xs font-medium">Option B — dedicated bot per project</p>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Fill in <code className="rounded bg-background px-1">Bot Token</code> below to give
              this project its own Telegram bot — useful when each client should see a
              branded bot. Set <code className="rounded bg-background px-1">chat_id</code> to
              their group.
            </p>
          </div>
        </div>
        <div className="border-t pt-3">
          <p className="mb-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            What you can do once connected
          </p>
          <ul className="grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
            <li>
              <span className="font-medium text-foreground">/inbox</span> — see pending approvals
              with ✅ / ❌ buttons
            </li>
            <li>
              <span className="font-medium text-foreground">/agents</span> — list agents,{" "}
              <span className="font-medium text-foreground">/agent name</span> — run one now
            </li>
            <li>
              <span className="font-medium text-foreground">/status</span> — running jobs &amp; next
              scheduled run
            </li>
            <li>
              <span className="font-medium text-foreground">/task daily /cmd</span> — create a
              scheduled job
            </li>
            <li>
              <span className="font-medium text-foreground">Free text</span> — chat directly with
              your project agent
            </li>
            <li>
              <span className="font-medium text-foreground">Allowed User IDs</span> — whitelist who
              can trigger the bot
            </li>
          </ul>
        </div>
      </div>

      {/* Telegram connector form */}
      <div>
        <p className="mb-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Telegram connector
        </p>
        <ConnectorManager
          scope="project"
          scopeId={projectId}
          category="connectors"
          filterService="telegram"
        />
      </div>
    </div>
  );
}

// ConnectorManager is defined in @/components/connectors/ConnectorManager
// and re-exported above in the import block.


type GlobalCmdEditing = {
  name: string;
  slash: string;
  description: string;
  content: string;
  isNew: boolean;
} | null;

function GlobalCommandsSection() {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [editing, setEditing] = useState<GlobalCmdEditing>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      setCommands(await api.listGlobalCommands());
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const openEditor = async (c: SlashCommand) => {
    try {
      const content = await api.readGlobalCommand(c.name);
      setEditing({
        name: c.name,
        slash: c.slash,
        description: c.description,
        content,
        isNew: false,
      });
    } catch (e) {
      setError(String(e));
    }
  };

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) {
      setError("Command name is required.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.writeGlobalCommand(
        editing.name.trim(),
        editing.slash.trim(),
        editing.description.trim(),
        editing.content,
      );
      setEditing(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col gap-2">
        <Button variant="ghost" size="sm" className="h-7 w-fit px-2" onClick={() => setEditing(null)}>
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
        <div className="grid grid-cols-2 gap-2">
          <Input
            value={editing.name}
            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            placeholder="command-name"
            className="h-8 text-sm"
            disabled={!editing.isNew}
          />
          <Input
            value={editing.slash}
            onChange={(e) => setEditing({ ...editing, slash: e.target.value })}
            placeholder="/slash"
            className="h-8 text-sm"
          />
          <Input
            value={editing.description}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            placeholder="One-line description"
            className="col-span-2 h-8 text-sm"
          />
          <textarea
            value={editing.content}
            onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            placeholder="The instructions sent to the agent when this command runs."
            rows={10}
            className="col-span-2 rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" className="h-8" onClick={save} disabled={busy}>
            Save command
          </Button>
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Global slash commands are stored on this machine and available in every project's chat
          and CLIs.
        </p>
        <Button
          size="sm"
          className="h-8 shrink-0"
          onClick={() =>
            setEditing({ name: "", slash: "", description: "", content: "", isNew: true })
          }
        >
          <Plus className="h-3.5 w-3.5" />
          New command
        </Button>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      <div className="flex flex-col gap-1.5">
        {commands.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No global commands yet.
          </p>
        )}
        {commands.map((c) => (
          <div
            key={c.name}
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2"
          >
            <div className="min-w-0 flex-1">
              <span className="truncate font-mono text-[13px] font-medium">{c.slash}</span>
              {c.description && (
                <p className="truncate text-[11px] text-muted-foreground">{c.description}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="Edit"
              onClick={() => openEditor(c)}
            >
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              title="Delete"
              onClick={() =>
                api.deleteGlobalCommand(c.name).then(load).catch((e) => setError(String(e)))
              }
            >
              <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}



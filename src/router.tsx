import { useEffect, useState } from "react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  useMatchRoute,
  useNavigate,
  useParams,
  useSearch,
} from "@tanstack/react-router";
import { listen } from "@tauri-apps/api/event";

import { cn } from "@/lib/utils";
import { api, type Agent } from "@/lib/api";
import { InboxView } from "@/components/InboxView";
import { Sidebar, SidebarRail } from "@/components/Sidebar";
import { TabStrip } from "@/components/TabStrip";
import { TopBar } from "@/components/TopBar";
import { TerminalView } from "@/components/TerminalView";
import { ChatView } from "@/components/ChatView";
import { FilePanel } from "@/components/FilePanel";
import { FileEditor } from "@/components/FileEditor";
import { BrowserView } from "@/components/BrowserView";
import { AddWorkspaceDialog } from "@/components/AddWorkspaceDialog";
import { AgentsView } from "@/components/AgentsView";
import { SettingsPage } from "@/components/SettingsPage";
import { TasksView } from "@/components/TasksView";
import { SessionsView } from "@/components/SessionsView";
import { UsageView } from "@/components/UsageView";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { LoginScreen } from "@/components/LoginScreen";
import { WorkspaceProvider, useWorkspaces } from "@/lib/workspace-context";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { Anchor as AnchorIcon } from "lucide-react";
import appIconUrl from "@/assets/app-icon.svg";
import { CustomizePage } from "@/components/CustomizePage";

interface WorkspaceSearch {
  file?: string;
  files?: boolean;
}

function Shell() {
  const {
    workspaces,
    organizations,
    activeOrgId,
    setActiveOrgId,
    addOrganization,
    openedIds,
    tabsByWs,
    activeTabByWs,
    liveSessions,
    addOpen,
    setAddOpen,
    pendingAgent,
    setPendingAgent,
    pendingNewAgent,
    setPendingNewAgent,
    pendingRepoImport,
    setPendingRepoImport,
    openWorkspace,
    openTab,
    openChatPicker,
    setTabState,
    openFileTab,
    closeTab,
    activateTab,
    addWorkspace,
    removeWorkspace,
    setSessionState,
    setSessionInfo,
  } = useWorkspaces();
  const navigate = useNavigate();
  const matchRoute = useMatchRoute();
  const params = useParams({ strict: false }) as { workspaceId?: string };
  const search = useSearch({ strict: false }) as WorkspaceSearch;
  const [unread, setUnread] = useState(0);
  const [sidebarState, setSidebarState] = useState<"open" | "rail" | "hidden">("open");
  const isSidebarOpen = sidebarState === "open";
  const [customizeTab, setCustomizeTab] = useState("plugins");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const onRefresh = () => setRefreshKey(k => k + 1);
    window.addEventListener("app-refresh", onRefresh);
    return () => window.removeEventListener("app-refresh", onRefresh);
  }, []);

  useEffect(() => {
    const onTab = (e: any) => setCustomizeTab(e.detail);
    window.addEventListener("customize-tab", onTab);
    return () => window.removeEventListener("customize-tab", onTab);
  }, []);

  useEffect(() => {
    const refresh = () => api.inboxUnreadCount().then(setUnread).catch(() => {});
    refresh();
    const interval = setInterval(refresh, 10000);
    const unlisten = listen("inbox-new", refresh);
    return () => {
      clearInterval(interval);
      unlisten.then((fn) => fn());
    };
  }, []);

  const inboxActive = !!matchRoute({ to: "/inbox" });
  const tasksActive = !!matchRoute({ to: "/tasks" });
  const sessionsActive = !!matchRoute({ to: "/sessions" });
  const usageActive = !!matchRoute({ to: "/usage" });
  const agentsActive = !!matchRoute({ to: "/agents" });
  const customizeActive = !!matchRoute({ to: "/customize" });
  const settingsActive = !!matchRoute({ to: "/settings" });

  const activeId = params.workspaceId ? Number(params.workspaceId) : null;
  const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null;
  const activeTabs = activeId !== null ? (tabsByWs[activeId] ?? []) : [];
  const activeTabId = activeId !== null ? (activeTabByWs[activeId] ?? "") : "";
  const filesOpen = search.files ?? false;
  const activeTab = activeTabs.find((t) => t.id === activeTabId);
  const openedFile = activeTab?.cli === "file" ? activeTab.relPath ?? null : null;

  let titleSuffix: string | undefined = undefined;
  if (activeWorkspace) {
    if (activeTab) {
      if (activeTab.cli === "file" && activeTab.relPath) {
        titleSuffix = activeTab.relPath.split('/').pop();
      } else if (activeTab.cli) {
        titleSuffix = activeTab.cli.charAt(0).toUpperCase() + activeTab.cli.slice(1);
      }
    }
  } else if (customizeActive) {
    titleSuffix = customizeTab.charAt(0).toUpperCase() + customizeTab.slice(1);
  }

  useEffect(() => {
    if (activeId !== null) {
      api.ensureMcpConfig(activeId).catch(() => {});
    }
  }, [activeId]);

  const goToWorkspace = (id: number, extra?: Partial<WorkspaceSearch>) => {
    const ws = workspaces.find((w) => w.id === id);
    openWorkspace(id, ws?.default_cli || ws?.cli || "claude", ws?.default_run_mode);
    navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: String(id) },
      search: { files: filesOpen, ...extra },
    });
  };

  const handleAdd = async (name: string, path: string, cli: string) => {
    const ws = await addWorkspace(name, path, cli);
    if (pendingAgent) {
      await api.installCatalogAgent(ws.id, pendingAgent).catch(() => {});
      setPendingAgent(null);
    }
    if (pendingNewAgent) {
      await saveAuthoredAgent(ws.id, pendingNewAgent.agent, pendingNewAgent.skills).catch(() => {});
      setPendingNewAgent(null);
    }
    if (pendingRepoImport) {
      await api
        .installRepoAgent(ws.id, pendingRepoImport.repo, pendingRepoImport.gitRef)
        .catch(() => {});
      setPendingRepoImport(null);
    }
    navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: String(ws.id) },
      search: {},
    });
    return ws;
  };

  const handleRemove = async (id: number) => {
    await removeWorkspace(id);
    if (activeId === id) navigate({ to: "/" });
  };

  const openedWorkspaces = workspaces.filter((w) => openedIds.includes(w.id));
  const orgWorkspaces = workspaces.filter((w) => w.organization_id === activeOrgId);
  const liveWorkspaceIds = new Set(
    [...liveSessions].map((sid) => Number(sid.split(":")[0])),
  );

  return (
    <div className="flex h-screen w-screen flex-col bg-background text-foreground">
      <TopBar
        workspace={settingsActive ? null : (activeWorkspace ?? workspaces.find(w => w.id === Number((search as any).ws)) ?? null)}
        isProjectPage={!!activeWorkspace}
        titleSuffix={titleSuffix}
        filesOpen={filesOpen}
        sidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setSidebarState(s => {
          if (s === "open") return "rail";
          if (s === "rail") return "hidden";
          return "open";
        })}
        onToggleFiles={() =>
          activeWorkspace &&
          goToWorkspace(activeWorkspace.id, {
            files: !filesOpen,
          })
        }
      />

      <div className="flex min-h-0 flex-1">
        {sidebarState === "open" ? (
          <Sidebar
            workspaces={orgWorkspaces}
            organizations={organizations}
            activeOrgId={activeOrgId}
            activeId={activeId}
            liveSessions={liveWorkspaceIds}
            unreadCount={unread}
            inboxActive={inboxActive}
            tasksActive={tasksActive}
            sessionsActive={sessionsActive}
            usageActive={usageActive}
            agentsActive={agentsActive}
            onOrgChange={(id) => {
              setActiveOrgId(id);
              navigate({ to: "/" });
            }}
            onNewOrg={addOrganization}
            onSelect={(id) => goToWorkspace(id)}
            onAdd={() => setAddOpen(true)}
            onRemove={handleRemove}
            onInbox={() => navigate({ to: "/inbox" })}
            onTasks={() => navigate({ to: "/tasks" })}
            onSessions={() => navigate({ to: "/sessions" })}
            onUsage={() => navigate({ to: "/usage" })}
            onAgents={() => navigate({ to: "/agents" })}
            customizeActive={customizeActive}
            onCustomize={() => navigate({ to: "/customize", search: activeId ? { ws: activeId } : {} })}
            onSettings={() => navigate({ to: "/settings" })}
          />
        ) : sidebarState === "rail" ? (
          <SidebarRail
            workspaces={orgWorkspaces}
            activeId={activeId}
            liveSessions={liveWorkspaceIds}
            unreadCount={unread}
            inboxActive={inboxActive}
            tasksActive={tasksActive}
            sessionsActive={sessionsActive}
            usageActive={usageActive}
            agentsActive={agentsActive}
            customizeActive={customizeActive}
            orgName={organizations.find((o) => o.id === activeOrgId)?.name ?? "Personal"}
            onExpand={() => setSidebarState("open")}
            onSelect={(id) => goToWorkspace(id)}
            onAdd={() => setAddOpen(true)}
            onInbox={() => navigate({ to: "/inbox" })}
            onTasks={() => navigate({ to: "/tasks" })}
            onSessions={() => navigate({ to: "/sessions" })}
            onUsage={() => navigate({ to: "/usage" })}
            onAgents={() => navigate({ to: "/agents" })}
            onCustomize={() => navigate({ to: "/customize", search: activeId ? { ws: activeId } : {} })}
            onSettings={() => navigate({ to: "/settings" })}
          />
        ) : null}

        <div className="flex min-h-0 min-w-0 flex-1">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col">
            {activeWorkspace && (
              <TabStrip
                tabs={activeTabs}
                activeTabId={activeTabId}
                liveSessions={liveSessions}
                onActivate={(tabId) => activateTab(activeWorkspace.id, tabId)}
                onClose={(tabId) => {
                  const tab = activeTabs.find((t) => t.id === tabId);
                  if (tab?.dirty) {
                    setTabState(activeWorkspace.id, tabId, { closeRequested: true });
                  } else {
                    closeTab(activeWorkspace.id, tabId);
                  }
                }}
                onOpen={(cli) =>
                  cli === "chat"
                    ? openChatPicker(activeWorkspace.id)
                    : openTab(activeWorkspace.id, cli)
                }
              />
            )}

            <main className="relative min-h-0 min-w-0 flex-1">
            {openedWorkspaces.map((ws) =>
              (tabsByWs[ws.id] ?? []).map((tab) => {
                const isActiveTab = ws.id === activeId && tab.id === activeTabId;
                if (tab.cli === "chat") {
                  return (
                    <div
                      key={tab.id}
                      className={cn(
                        "absolute inset-0 bg-background",
                        isActiveTab ? "z-10 opacity-100" : "-z-10 opacity-0 pointer-events-none"
                      )}
                    >
                      <ChatView
                        workspace={ws}
                        visible={isActiveTab}
                      tabId={tab.id}
                      onRouteToPty={(text) => {
                        const target = (tabsByWs[ws.id] ?? []).find(
                          (t) => t.cli !== "chat",
                        );
                        if (!target) return false;
                        api.writeSession(target.id, text + "\r").catch(() => {});
                        activateTab(ws.id, target.id);
                        return true;
                      }}
                      onOpenFiles={() =>
                        goToWorkspace(ws.id, {
                          files: !filesOpen,
                        })
                      }
                    />
                    </div>
                  );
                }
                if (tab.cli === "browser") {
                  return (
                    <div
                      key={tab.id}
                      className={cn(
                        "absolute inset-0 bg-background",
                        isActiveTab ? "z-10 opacity-100" : "-z-10 opacity-0 pointer-events-none"
                      )}
                    >
                      <BrowserView workspaceId={ws.id} tabId={tab.id} isActive={isActiveTab} />
                    </div>
                  );
                }
                if (tab.cli === "file") {
                  return (
                    <div
                      key={tab.id}
                      className={cn(
                        "absolute inset-0 bg-background",
                        isActiveTab ? "z-10 opacity-100" : "-z-10 opacity-0 pointer-events-none"
                      )}
                    >
                      <FileEditor
                        workspaceId={ws.id}
                        relPath={tab.relPath!}
                        tabId={tab.id}
                        onClose={() => closeTab(ws.id, tab.id)}
                      />
                    </div>
                  );
                }
                return (
                  <div
                    key={tab.id}
                    className={cn(
                      "absolute inset-0 bg-background",
                      isActiveTab ? "z-10 opacity-100" : "-z-10 opacity-0 pointer-events-none"
                    )}
                  >
                    <TerminalView
                      workspace={ws}
                      tab={tab}
                      visible={isActiveTab}
                      onSessionState={setSessionState}
                      onSessionInfo={setSessionInfo}
                      onOpenFiles={() =>
                        goToWorkspace(ws.id, {
                          files: !filesOpen,
                        })
                      }
                    />
                  </div>
                );
              }),
            )}
            <Outlet key={refreshKey} />
            </main>
          </div>

          {activeWorkspace && filesOpen && (
            <FilePanel
              workspaceId={activeWorkspace.id}
              openedFile={openedFile}
              onOpenFile={(rel) => {
                openFileTab(activeWorkspace.id, rel);
              }}
            />
          )}
        </div>
      </div>

      <AddWorkspaceDialog open={addOpen} onOpenChange={setAddOpen} onAdd={handleAdd} />
    </div>
  );
}

function AuthGate() {
  const { auth, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background">
        <AnchorIcon className="h-8 w-8 animate-pulse text-primary" />
      </div>
    );
  }
  if (!auth) return <LoginScreen />;
  return (
    <WorkspaceProvider>
      <Shell />
    </WorkspaceProvider>
  );
}

function RootLayout() {
  return (
    <ThemeProvider>
      <TooltipProvider>
        <AuthProvider>
          <AuthGate />
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  );
}

function Welcome() {
  const { setAddOpen, workspaces } = useWorkspaces();
  const firstRun = workspaces.length === 0;
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-center">
      <img src={appIconUrl} className="h-16 w-16 drop-shadow-sm" alt="SuperConsole" />
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          Welcome to SuperConsole
        </h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
          The desktop runtime for agentic repos. Bring any folder as a
          workspace and put agents to work on a schedule.
        </p>
      </div>

      {firstRun && (
        <div className="grid max-w-lg grid-cols-3 gap-3 px-6">
          {[
            ["1", "Add a workspace", "Point to any repo or client folder"],
            ["2", "Pick your CLI", "Claude Code, Droid, or Antigravity"],
            ["3", "Schedule jobs", "Results land in your Inbox for review"],
          ].map(([n, title, desc]) => (
            <div key={n} className="rounded-xl border bg-card px-3 py-4 text-left">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/15 text-[11px] font-semibold text-primary">
                {n}
              </span>
              <p className="mt-2 text-xs font-medium">{title}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      )}

      <Button onClick={() => setAddOpen(true)}>
        {firstRun ? "Add your first workspace" : "Add workspace"}
      </Button>
    </div>
  );
}

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Welcome,
});

function InboxRoute() {
  const { workspaces } = useWorkspaces();
  return (
    <div className="absolute inset-0 bg-background">
      <InboxView workspaces={workspaces} />
    </div>
  );
}

const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "inbox",
  component: InboxRoute,
});

function TasksRoute() {
  const { workspaces, organizations, activeOrgId, openWorkspace, openResumeTab } = useWorkspaces();
  const navigate = useNavigate();
  return (
    <div className="absolute inset-0 bg-background">
      <TasksView
        workspaces={workspaces}
        organizations={organizations}
        activeOrgId={activeOrgId}
        onResume={(workspaceId, cli, sessionId) => {
          openWorkspace(workspaceId, cli);
          openResumeTab(workspaceId, cli, sessionId);
          navigate({
            to: "/workspace/$workspaceId",
            params: { workspaceId: String(workspaceId) },
            search: {},
          });
        }}
      />
    </div>
  );
}

const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "tasks",
  component: TasksRoute,
});

function SessionsRoute() {
  const {
    workspaces,
    organizations,
    activeOrgId,
    openedIds,
    openChatPicker,
    openChatSession,
    openResumeTab,
    openWorkspace,
  } = useWorkspaces();
  const navigate = useNavigate();
  const lastProjectId = openedIds.length ? openedIds[openedIds.length - 1] : null;
  return (
    <div className="absolute inset-0 bg-background">
      <SessionsView
        workspaces={workspaces}
        organizations={organizations}
        activeOrgId={activeOrgId}
        lastProjectId={lastProjectId}
        onOpenChat={(id, sessionId) => {
          if (sessionId) openChatSession(id, sessionId);
          else openChatPicker(id);
          navigate({
            to: "/workspace/$workspaceId",
            params: { workspaceId: String(id) },
            search: {},
          });
        }}
        onResume={(workspaceId, cli, sessionId) => {
          openWorkspace(workspaceId, cli);
          openResumeTab(workspaceId, cli, sessionId);
          navigate({
            to: "/workspace/$workspaceId",
            params: { workspaceId: String(workspaceId) },
            search: {},
          });
        }}
      />
    </div>
  );
}

const sessionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "sessions",
  component: SessionsRoute,
});

function UsageRoute() {
  const { workspaces } = useWorkspaces();
  return (
    <div className="absolute inset-0 bg-background">
      <UsageView workspaces={workspaces} />
    </div>
  );
}

const usageRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "usage",
  component: UsageRoute,
});

async function saveAuthoredAgent(workspaceId: number, agent: Agent, skills: string[]) {
  const existing = await api.listSkills(workspaceId).catch(() => []);
  const projectNames = new Set(existing.map((s) => s.name));
  for (const sName of skills) {
    if (!projectNames.has(sName)) {
      await api.materializeSkillToWorkspace(workspaceId, sName).catch(() => {});
    }
  }
  await api.saveAgent(workspaceId, agent);
}

function AgentsRoute() {
  const {
    workspaces,
    organizations,
    activeOrgId,
    setAddOpen,
    setPendingAgent,
    setPendingNewAgent,
    setPendingRepoImport,
    openWorkspace,
    openResumeTab,
  } = useWorkspaces();
  const navigate = useNavigate();
  const go = (workspaceId: number) =>
    navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: String(workspaceId) },
      search: {},
    });
  return (
    <div className="absolute inset-0 bg-background">
      <AgentsView
        workspaces={workspaces}
        organizations={organizations}
        activeOrgId={activeOrgId}
        onUseInProject={async (id, workspaceId) => {
          await api.installCatalogAgent(workspaceId, id);
          go(workspaceId);
        }}
        onUseInNewProject={(id) => {
          setPendingAgent(id);
          setAddOpen(true);
        }}
        onCreateInProject={async (agent, skills, workspaceId) => {
          await saveAuthoredAgent(workspaceId, agent, skills);
          go(workspaceId);
        }}
        onCreateInNewProject={(agent, skills) => {
          setPendingNewAgent({ agent, skills });
          setAddOpen(true);
        }}
        onImportRepoNewProject={(repo, gitRef) => {
          setPendingRepoImport({ repo, gitRef });
          setAddOpen(true);
        }}
        onAddSkill={() =>
          navigate({ to: "/settings", search: { tab: "account", section: "Skills" } })
        }
        onAddConnector={(scope) =>
          navigate({ to: "/settings", search: { tab: scope, section: "Connectors" } })
        }
        onResume={(workspaceId, cli, sessionId) => {
          openWorkspace(workspaceId, cli);
          openResumeTab(workspaceId, cli, sessionId);
          navigate({
            to: "/workspace/$workspaceId",
            params: { workspaceId: String(workspaceId) },
            search: {},
          });
        }}
      />
    </div>
  );
}

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "agents",
  component: AgentsRoute,
});

interface SettingsSearch {
  tab?: "account" | "org" | "project";
  section?: string;
}

function SettingsRoute() {
  const { tab, section } = settingsRoute.useSearch();
  return (
    <div className="absolute inset-0 z-20 bg-background">
      <SettingsPage initialTab={tab} initialSection={section} />
    </div>
  );
}

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: SettingsRoute,
  validateSearch: (search: Record<string, unknown>): SettingsSearch => ({
    tab:
      search.tab === "account" || search.tab === "org" || search.tab === "project"
        ? search.tab
        : undefined,
    section: typeof search.section === "string" ? search.section : undefined,
  }),
});

interface CustomizeSearch {
  ws?: number;
  tab?: string;
}

function CustomizeRoute() {
  const { ws, tab } = customizeRoute.useSearch();
  return (
    <div className="absolute inset-0 bg-background">
      <CustomizePage initialWorkspaceId={ws} initialTab={tab} />
    </div>
  );
}

const customizeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "customize",
  component: CustomizeRoute,
  validateSearch: (search: Record<string, unknown>): CustomizeSearch => ({
    ws: typeof search.ws === "number" ? search.ws
      : typeof search.ws === "string" ? Number(search.ws) || undefined
      : undefined,
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
});

function WorkspaceView() {
  return <div className="absolute inset-0" />;
}

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "workspace/$workspaceId",
  component: WorkspaceView,
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => ({
    files: search.files === true || search.files === "true" ? true : undefined,
  }),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  inboxRoute,
  tasksRoute,
  sessionsRoute,
  usageRoute,
  agentsRoute,
  customizeRoute,
  settingsRoute,
  workspaceRoute,
]);

export const router = createRouter({
  routeTree,
  history: createMemoryHistory({ initialEntries: ["/"] }),
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

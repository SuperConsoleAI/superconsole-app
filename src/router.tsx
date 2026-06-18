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
import { Anchor } from "lucide-react";
import { api } from "@/lib/api";
import { InboxView } from "@/components/InboxView";
import { Sidebar, SidebarRail } from "@/components/Sidebar";
import { TabStrip } from "@/components/TabStrip";
import { TopBar } from "@/components/TopBar";
import { TerminalView } from "@/components/TerminalView";
import { ChatView } from "@/components/ChatView";
import { FilePanel } from "@/components/FilePanel";
import { FileEditor } from "@/components/FileEditor";
import { AddWorkspaceDialog } from "@/components/AddWorkspaceDialog";
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
    openWorkspace,
    openTab,
    openChatPicker,
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
  const [sidebarOpen, setSidebarOpen] = useState(true);

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
  const settingsActive = !!matchRoute({ to: "/settings" });

  const activeId = params.workspaceId ? Number(params.workspaceId) : null;
  const activeWorkspace = workspaces.find((w) => w.id === activeId) ?? null;
  const activeTabs = activeId !== null ? (tabsByWs[activeId] ?? []) : [];
  const activeTabId = activeId !== null ? (activeTabByWs[activeId] ?? "") : "";
  const openedFile = search.file ?? null;
  const filesOpen = search.files ?? false;

  useEffect(() => {
    if (activeId !== null) {
      api.ensureMcpConfig(activeId).catch(() => {});
    }
  }, [activeId]);

  const goToWorkspace = (id: number, extra?: Partial<WorkspaceSearch>) => {
    const ws = workspaces.find((w) => w.id === id);
    openWorkspace(id, ws?.cli ?? "claude");
    navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: String(id) },
      search: { files: filesOpen || undefined, ...extra },
    });
  };

  const handleAdd = async (name: string, path: string, cli: string) => {
    const ws = await addWorkspace(name, path, cli);
    navigate({
      to: "/workspace/$workspaceId",
      params: { workspaceId: String(ws.id) },
      search: {},
    });
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
        workspace={settingsActive ? null : activeWorkspace}
        filesOpen={filesOpen}
        sidebarOpen={sidebarOpen}
        onToggleSidebar={() => setSidebarOpen((o) => !o)}
        onToggleFiles={() =>
          activeWorkspace &&
          goToWorkspace(activeWorkspace.id, {
            files: !filesOpen || undefined,
            file: openedFile ?? undefined,
          })
        }
      />

      <div className="flex min-h-0 flex-1">
        {sidebarOpen ? (
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
            onSettings={() => navigate({ to: "/settings" })}
          />
        ) : (
          <SidebarRail
            workspaces={orgWorkspaces}
            activeId={activeId}
            liveSessions={liveWorkspaceIds}
            unreadCount={unread}
            inboxActive={inboxActive}
            tasksActive={tasksActive}
            sessionsActive={sessionsActive}
            usageActive={usageActive}
            orgName={organizations.find((o) => o.id === activeOrgId)?.name ?? "Personal"}
            onExpand={() => setSidebarOpen(true)}
            onSelect={(id) => goToWorkspace(id)}
            onAdd={() => setAddOpen(true)}
            onInbox={() => navigate({ to: "/inbox" })}
            onTasks={() => navigate({ to: "/tasks" })}
            onSessions={() => navigate({ to: "/sessions" })}
            onUsage={() => navigate({ to: "/usage" })}
            onSettings={() => navigate({ to: "/settings" })}
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {activeWorkspace && (
            <TabStrip
              tabs={activeTabs}
              activeTabId={activeTabId}
              liveSessions={liveSessions}
              onActivate={(tabId) => activateTab(activeWorkspace.id, tabId)}
              onClose={(tabId) => closeTab(activeWorkspace.id, tabId)}
              onOpen={(cli) =>
                cli === "chat"
                  ? openChatPicker(activeWorkspace.id)
                  : openTab(activeWorkspace.id, cli)
              }
            />
          )}

          <div className="flex min-h-0 flex-1">
            <main className="relative min-w-0 flex-1">
            {openedWorkspaces.map((ws) =>
              (tabsByWs[ws.id] ?? []).map((tab) => {
                const isActiveTab =
                  ws.id === activeId &&
                  tab.id === activeTabId &&
                  openedFile === null;
                if (tab.cli === "chat") {
                  return (
                    <ChatView
                      key={tab.id}
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
                    />
                  );
                }
                return (
                  <TerminalView
                    key={tab.id}
                    workspace={ws}
                    tab={tab}
                    visible={isActiveTab}
                    onSessionState={setSessionState}
                    onSessionInfo={setSessionInfo}
                  />
                );
              }),
            )}
            <Outlet />
          </main>

            {activeWorkspace && filesOpen && (
              <FilePanel
                workspaceId={activeWorkspace.id}
                openedFile={openedFile}
                onOpenFile={(rel) =>
                  goToWorkspace(activeWorkspace.id, { file: rel, files: true })
                }
              />
            )}
          </div>
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
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
        <Anchor className="h-8 w-8 text-primary" />
      </span>
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

function WorkspaceView() {
  const { workspaceId } = workspaceRoute.useParams();
  const { file, files } = workspaceRoute.useSearch();
  const navigate = useNavigate();
  const id = Number(workspaceId);

  if (!file) return null;
  return (
    <div className="absolute inset-0 z-10">
      <FileEditor
        workspaceId={id}
        relPath={file}
        onClose={() =>
          navigate({
            to: "/workspace/$workspaceId",
            params: { workspaceId },
            search: { files: files || undefined },
          })
        }
      />
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
  const { workspaces, activeOrgId } = useWorkspaces();
  return (
    <div className="absolute inset-0 bg-background">
      <TasksView workspaces={workspaces.filter((w) => w.organization_id === activeOrgId)} />
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

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "settings",
  component: () => (
    <div className="absolute inset-0 z-20 bg-background">
      <SettingsPage />
    </div>
  ),
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "workspace/$workspaceId",
  component: WorkspaceView,
  validateSearch: (search: Record<string, unknown>): WorkspaceSearch => ({
    file: typeof search.file === "string" ? search.file : undefined,
    files: search.files === true || search.files === "true" ? true : undefined,
  }),
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  inboxRoute,
  tasksRoute,
  sessionsRoute,
  usageRoute,
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

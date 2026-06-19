import { useEffect, useState } from "react";
import {
  Bell,
  BookOpen,
  Blocks,
  Check,
  ChevronsUpDown,
  Copy,
  CreditCard,
  type LucideIcon,
  ArrowLeft,
  Palette,
  Pencil,
  Plug,
  Plus,
  Search,
  Trash2,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Terminal,
  Users,
  Workflow,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  api,
  CLI_PRESETS,
  CONNECTOR_REGISTRY,
  LLM_PROVIDERS,
  ORG_ROLES,
  PROJECT_ROLES,
  type ConnectorCategory,
  type ConnectorScope,
  type ConnectorView,
  type LlmKeyView,
  type MemberView,
  type SlashCommand,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PresetIcon } from "@/components/PresetIcon";
import { useTheme } from "@/components/theme-provider";
import {
  AccountSkillsSection,
  OrgSkillsSection,
  ProjectSkillsSection,
} from "@/components/SkillsSettings";
import { useAuth } from "@/lib/auth-context";
import { useWorkspaces } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";

type TopTab = "account" | "org" | "project";

const TOP_TABS: { id: TopTab; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "org", label: "Organisation" },
  { id: "project", label: "Project" },
];

const NAV: Record<TopTab, string[]> = {
  account: [
    "General",
    "Appearance",
    "Terminal",
    "Models",
    "Skills",
    "Commands",
    "Integrations",
    "Connectors",
    "Security",
    "Notifications",
  ],
  org: ["General", "Team", "Models", "Skills", "Integrations", "Connectors", "Billing"],
  project: ["General", "Team", "Models", "Skills", "Integrations", "Connectors", "Automations"],
};

const NAV_ICONS: Record<string, LucideIcon> = {
  General: SettingsIcon,
  Appearance: Palette,
  Terminal: Terminal,
  Models: Sparkles,
  Skills: Sparkles,
  Commands: Terminal,
  Integrations: Blocks,
  Connectors: Plug,
  Security: Shield,
  Notifications: Bell,
  Team: Users,
  Billing: CreditCard,
  Automations: Workflow,
};

export function SettingsPage() {
  const { workspaces } = useWorkspaces();
  const { activeCloudOrg } = useAuth();

  const [tab, setTab] = useState<TopTab>("account");
  const [query, setQuery] = useState("");
  const [section, setSection] = useState<Record<TopTab, string>>({
    account: "General",
    org: "General",
    project: "General",
  });

  // Project scope selection, shared across Project sub-sections.
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  const selectProject = async (id: number) => {
    setWorkspaceId(id);
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

  // Default to the first workspace when entering the Project tab.
  useEffect(() => {
    if (tab === "project" && workspaceId === null && workspaces.length > 0) {
      selectProject(workspaces[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, workspaces, activeCloudOrg]);

  const active = section[tab];
  const setActive = (s: string) =>
    setSection((prev) => ({ ...prev, [tab]: s }));

  const navItems = NAV[tab].filter((i) =>
    i.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="flex h-full flex-col">
      {/* Top bar: three-level tabs + inline scope switcher */}
      <div className="flex shrink-0 items-center gap-5 border-b px-5">
        {TOP_TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "relative py-3 text-[13px] transition-colors",
              tab === t.id
                ? "font-medium text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
        {tab === "org" && (
          <div className="ml-1">
            <OrgSwitcher />
          </div>
        )}
        {tab === "project" && (
          <div className="ml-1">
            <ProjectSwitcher workspaceId={workspaceId} onSelect={selectProject} />
          </div>
        )}
      </div>

      <div className="flex min-h-0 flex-1">
        <aside className="flex w-56 shrink-0 flex-col border-r bg-sidebar">
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
          <ScrollArea className="min-h-0 flex-1 px-2 py-2">
            {navItems.map((item) => {
              const Icon = NAV_ICONS[item];
              return (
                <button
                  key={item}
                  onClick={() => setActive(item)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
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

          <div className="border-t p-3">
            <button
              className="flex items-center gap-2 px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => openUrl("https://github.com").catch(() => {})}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Documentation
            </button>
          </div>
        </aside>

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
              />
            </div>
          </div>
        </ScrollArea>
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
}: {
  tab: TopTab;
  section: string;
  workspaceId: number | null;
  projectId: string | null;
  projectError: string | null;
  ensuring: boolean;
  hasWorkspaces: boolean;
}) {
  const { auth, activeCloudOrg } = useAuth();

  if (tab === "account") {
    switch (section) {
      case "General":
        return <AccountGeneralSection />;
      case "Appearance":
        return <AppearanceSection />;
      case "Terminal":
        return <TerminalSection />;
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
      case "Skills":
        return <AccountSkillsSection />;
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
      case "Security":
        return <SecuritySection />;
      case "Notifications":
        return <NotificationsSection />;
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
      case "Skills":
        return <OrgSkillsSection orgId={activeCloudOrg.id} />;
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
        return <ProjectGeneralSection projectId={projectId} />;
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
      case "Skills":
        return workspaceId !== null ? (
          <ProjectSkillsSection workspaceId={workspaceId} />
        ) : (
          <Hint>Select a project to continue.</Hint>
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
        return <Placeholder name="Automations" />;
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

function OrgSwitcher() {
  const { auth, activeCloudOrg, setActiveCloudOrgId } = useAuth();
  const orgs = auth?.orgs ?? [];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex max-w-[200px] items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors hover:border-foreground/30">
          <span className="truncate">
            {activeCloudOrg?.name ?? "No organisation"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        {orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => setActiveCloudOrgId(org.id)}
            className="flex items-center justify-between"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{org.name}</span>
              <span className="block truncate text-[11px] capitalize text-muted-foreground">
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
  );
}

function ProjectSwitcher({
  workspaceId,
  onSelect,
}: {
  workspaceId: number | null;
  onSelect: (id: number) => void;
}) {
  const { workspaces } = useWorkspaces();
  const current = workspaces.find((w) => w.id === workspaceId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex max-w-[200px] items-center gap-2 rounded-md border bg-background px-2.5 py-1.5 text-left text-[13px] font-medium transition-colors hover:border-foreground/30">
          <span className="truncate">
            {current?.name ?? "Select a project"}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[200px]">
        {workspaces.map((w) => (
          <DropdownMenuItem
            key={w.id}
            onClick={() => onSelect(w.id)}
            className="flex items-center justify-between"
          >
            <span className="min-w-0">
              <span className="block truncate text-[13px]">{w.name}</span>
              <span className="block truncate text-[11px] text-muted-foreground">
                {w.cli}
              </span>
            </span>
            {w.id === workspaceId && (
              <Check className="ml-2 h-3.5 w-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AccountGeneralSection() {
  const { auth, signOut } = useAuth();

  return (
    <div className="flex flex-col gap-6">
      {auth && (
        <div className="rounded-lg border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Signed in as</p>
          <p className="mt-0.5 text-sm font-medium">{auth.user.email}</p>
          {auth.user.name && (
            <p className="text-xs text-muted-foreground">{auth.user.name}</p>
          )}
          <div className="mt-3">
            <Button size="sm" variant="outline" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>
      )}

      <UpdatesSection />
      <ApiKeysSection />
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

function TerminalSection() {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Terminal presets are the agent CLIs you can launch in a workspace. Each
        opens a full interactive session in its own tab.
      </p>
      <div className="flex flex-col gap-1.5">
        {CLI_PRESETS.map((p) => (
          <div
            key={p.id}
            className="flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5"
          >
            <PresetIcon preset={p.id} className="h-5 w-5" />
            <div className="min-w-0">
              <span className="block text-[13px] font-medium">{p.label}</span>
              <span className="block truncate font-mono text-[11px] text-muted-foreground">
                {p.id}
              </span>
            </div>
          </div>
        ))}
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

function ProjectGeneralSection({ projectId }: { projectId: string }) {
  const { workspaces } = useWorkspaces();
  const ws = workspaces.find((w) => w.project_id === projectId);
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-card px-4 py-3">
        <p className="text-sm font-medium">{ws?.name ?? "Project"}</p>
        {ws && (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {ws.path}
          </p>
        )}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Projects scope model keys, connectors, and team access to a single
        client workspace. Project settings override organisation defaults.
      </p>
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Theme</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          SuperConsole ships two themes tuned for long agent sessions.
        </p>
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
                  "flex h-20 items-center justify-center rounded-lg text-xs font-medium",
                  t === "light"
                    ? "bg-[#faf9f5] text-[#3d3929]"
                    : "bg-[#262624] text-[#f0eee7]",
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

function UpdatesSection() {
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) =>
      getVersion().then(setVersion).catch(() => {}),
    );
  }, []);

  const checkUpdates = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setStatus(`Update available: v${update.version}. Downloading...`);
        await update.downloadAndInstall();
        setStatus("Update installed. Restart SuperConsole to apply.");
      } else {
        setStatus("You're on the latest version.");
      }
    } catch {
      setStatus(
        "Update check failed. Updates require a configured release endpoint and signing key.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium">SuperConsole</p>
          <p className="text-xs text-muted-foreground">Version {version || "..."}</p>
        </div>
        <Button size="sm" variant="outline" onClick={checkUpdates} disabled={checking}>
          {checking ? "Checking..." : "Check for updates"}
        </Button>
      </div>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}

function useSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  useEffect(() => {
    api.getSettings().then(setSettings).catch(console.error);
  }, []);
  const update = (key: string, value: string) =>
    setSettings((s) => ({ ...s, [key]: value }));
  return { settings, update };
}

function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  const [saved, setSaved] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        await onSave();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }}
    >
      {saved && <Check className="h-3.5 w-3.5" />}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}

function IntegrationsSection() {
  const { settings, update } = useSettings();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Telegram bot</h3>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Trigger agents from your phone and get job reports pushed back.
          Create a bot with @BotFather, paste the token, then message your bot
          once to pair. Restart SuperConsole after changing the token.
        </p>
        <div className="flex flex-col gap-2">
          <Input
            value={settings.telegram_token ?? ""}
            onChange={(e) => update("telegram_token", e.target.value)}
            placeholder="Bot token"
            type="password"
            className="h-8 font-mono text-xs"
          />
          <Input
            value={settings.telegram_chat_id ?? ""}
            onChange={(e) => update("telegram_chat_id", e.target.value)}
            placeholder="Chat ID (auto-filled on first message)"
            className="h-8 font-mono text-xs"
          />
        </div>
      </div>
      <div>
        <SaveButton
          onSave={async () => {
            await api.setSetting("telegram_token", settings.telegram_token ?? "");
            await api.setSetting("telegram_chat_id", settings.telegram_chat_id ?? "");
          }}
        />
      </div>
    </div>
  );
}

const SECURITY_POINTS = [
  "Encrypted before leaving your device (AES-256-GCM)",
  "We never see your plaintext keys",
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

function ConnectorManager({
  scope,
  scopeId,
  category,
}: {
  scope: ConnectorScope;
  scopeId: string;
  category: ConnectorCategory;
}) {
  const available = CONNECTOR_REGISTRY.filter(
    (d) => d.scopes.includes(scope) && d.category === category,
  );
  const inCategory = (svc: string) =>
    CONNECTOR_REGISTRY.find((d) => d.id === svc)?.category === category;
  const [list, setList] = useState<ConnectorView[]>([]);
  const [service, setService] = useState<string>(available[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const def = CONNECTOR_REGISTRY.find((d) => d.id === service);
  const current = list.find((c) => c.service === service);

  const load = async () => {
    try {
      setList(await api.listConnectors(scope, scopeId));
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    setList([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeId]);

  // Prefill non-secret fields from the existing connector; secrets stay blank.
  useEffect(() => {
    if (!def) return;
    const existing = list.find((c) => c.service === service);
    const next: Record<string, string> = {};
    for (const f of def.fields) {
      const ev = existing?.fields.find((x) => x.key === f.key);
      next[f.key] = !f.secret && ev?.value ? ev.value : "";
    }
    setValues(next);
  }, [service, list, def]);

  const save = async () => {
    setError(null);
    try {
      await api.setConnector(scope, scopeId, service, values);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async (svc: string) => {
    setError(null);
    try {
      await api.deleteConnector(scope, scopeId, svc);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const labelFor = (svc: string) =>
    CONNECTOR_REGISTRY.find((d) => d.id === svc)?.label ?? svc;

  const shown = list.filter((c) => inCategory(c.service));

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-muted-foreground">
        {category === "integrations"
          ? "Integrations connect agents to your dev and productivity tools."
          : "Connectors give agents scoped access to external services and APIs."}{" "}
        Credentials are encrypted and injected as environment variables at
        session start; project overrides org, which overrides account.
      </p>

      {shown.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {shown.map((c) => (
            <div
              key={c.service}
              className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
            >
              <div className="min-w-0">
                <span className="block text-[13px] font-medium">
                  {labelFor(c.service)}
                </span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {c.status ?? "connected"}
                  {c.fields
                    .filter((f) => !f.secret && f.value)
                    .map((f) => ` · ${f.value}`)
                    .join("")}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-muted-foreground"
                  onClick={() => setService(c.service)}
                >
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs text-destructive"
                  onClick={() => remove(c.service)}
                >
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
        <select
          value={service}
          onChange={(e) => setService(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-[13px]"
        >
          {available.map((d) => (
            <option key={d.id} value={d.id}>
              {d.label}
            </option>
          ))}
        </select>
        {def?.fields.map((f) => {
          const fieldSet = current?.fields.find((x) => x.key === f.key)?.has_value;
          return (
            <Input
              key={f.key}
              value={values[f.key] ?? ""}
              onChange={(e) =>
                setValues((v) => ({ ...v, [f.key]: e.target.value }))
              }
              type={f.secret ? "password" : "text"}
              placeholder={
                f.secret && fieldSet
                  ? `${f.label} •••• set (leave blank to keep)`
                  : (f.placeholder ?? f.label)
              }
              className="h-8 font-mono text-xs"
            />
          );
        })}
        <div>
          <SaveButton onSave={save} />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function LlmKeyEditor({
  scope,
  scopeId,
  description,
}: {
  scope: import("@/lib/api").LlmScope;
  scopeId: string;
  description: string;
}) {
  const [keys, setKeys] = useState<LlmKeyView[]>([]);
  const [provider, setProvider] = useState<string>(LLM_PROVIDERS[0].id);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [extraEnv, setExtraEnv] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      setKeys(await api.listLlmKeys(scope, scopeId));
    } catch (e) {
      setError(String(e));
    }
  };

  useEffect(() => {
    setKeys([]);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeId]);

  useEffect(() => {
    const existing = keys.find((k) => k.provider === provider);
    setApiKey("");
    setBaseUrl(existing?.base_url ?? "");
    setModel(existing?.model ?? "");
    setExtraEnv(existing?.extra_env ?? "");
  }, [provider, keys]);

  const current = keys.find((k) => k.provider === provider);

  const save = async () => {
    setError(null);
    try {
      await api.setLlmKey(
        scope,
        scopeId,
        provider,
        apiKey,
        baseUrl || null,
        model || null,
        extraEnv || null,
      );
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const remove = async (p: string) => {
    setError(null);
    try {
      await api.deleteLlmKey(scope, scopeId, p);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs leading-relaxed text-muted-foreground">{description}</p>

      {keys.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {keys.map((k) => (
            <div
              key={k.provider}
              className="flex items-center justify-between rounded-lg border bg-card px-3 py-2"
            >
              <div>
                <span className="block text-[13px] font-medium capitalize">
                  {k.provider}
                </span>
                <span className="block text-[11px] text-muted-foreground">
                  {k.has_key ? "Key set" : "No key"}
                  {k.base_url ? ` · ${k.base_url}` : ""}
                  {k.model ? ` · ${k.model}` : ""}
                </span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs text-muted-foreground"
                onClick={() => remove(k.provider)}
              >
                Remove
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-lg border bg-card p-3">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          className="h-8 rounded-md border bg-background px-2 text-[13px]"
        >
          {LLM_PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <Input
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={current?.has_key ? "•••• set (leave blank to keep)" : "API key"}
          type="password"
          className="h-8 font-mono text-xs"
        />
        <Input
          value={baseUrl}
          onChange={(e) => setBaseUrl(e.target.value)}
          placeholder="Base URL (optional)"
          className="h-8 font-mono text-xs"
        />
        <Input
          value={model}
          onChange={(e) => setModel(e.target.value)}
          placeholder="Default model (optional)"
          className="h-8 font-mono text-xs"
        />
        <textarea
          value={extraEnv}
          onChange={(e) => setExtraEnv(e.target.value)}
          placeholder="Extra env vars (KEY=VALUE per line, optional)"
          rows={3}
          className="rounded-md border bg-background px-2 py-1.5 font-mono text-xs"
        />
        <div>
          <SaveButton onSave={save} />
        </div>
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

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

function ApiKeysSection() {
  const { settings, update } = useSettings();
  const [copied, setCopied] = useState(false);
  const httpEnabled = settings.http_enabled === "1";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Local HTTP server</h3>
          <button
            className={cn(
              "h-4 w-7 rounded-full transition-colors",
              httpEnabled ? "bg-primary" : "bg-muted",
            )}
            onClick={() => update("http_enabled", httpEnabled ? "0" : "1")}
          >
            <span
              className={cn(
                "block h-3 w-3 rounded-full bg-background transition-transform",
                httpEnabled ? "translate-x-3.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Binds 127.0.0.1 only. POST /trigger {"{ workspace, command }"} with the
          x-superconsole-token header. Expose via Cloudflare Tunnel for mobile.
          Restart SuperConsole to apply.
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-10 text-xs text-muted-foreground">Port</span>
            <Input
              value={settings.http_port ?? "4665"}
              onChange={(e) => update("http_port", e.target.value)}
              className="h-8 w-24 font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 text-xs text-muted-foreground">Token</span>
            <Input
              readOnly
              value={settings.api_token ?? ""}
              type="password"
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                navigator.clipboard.writeText(settings.api_token ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
      <div>
        <SaveButton
          onSave={async () => {
            await api.setSetting("http_enabled", httpEnabled ? "1" : "0");
            await api.setSetting("http_port", settings.http_port || "4665");
          }}
        />
      </div>
    </div>
  );
}

import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Check, Copy, Search } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  api,
  CONNECTOR_REGISTRY,
  LLM_PROVIDERS,
  ORG_ROLES,
  type ConnectorScope,
  type ConnectorView,
  type LlmKeyView,
  type MemberView,
} from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/lib/auth-context";
import { useWorkspaces } from "@/lib/workspace-context";
import { cn } from "@/lib/utils";

const SECTIONS: { group: string; items: string[] }[] = [
  { group: "Personal", items: ["Account", "Security", "Appearance", "Notifications"] },
  {
    group: "Editor & Workflow",
    items: ["General", "Keyboard", "Git & Worktrees", "Agents", "Terminal", "Links", "Models"],
  },
  {
    group: "Organization",
    items: ["Organization", "Teams", "Projects", "Connectors", "Hosts", "Integrations", "Billing", "API Keys"],
  },
];

export function SettingsPage() {
  const router = useRouter();
  const [section, setSection] = useState("Account");
  const [query, setQuery] = useState("");

  const filtered = SECTIONS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.toLowerCase().includes(query.toLowerCase())),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="px-4 pb-1 pt-4">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => router.history.back()}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h1 className="font-display mt-3 text-lg font-semibold">Settings</h1>
          <div className="relative mt-2">
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
          {filtered.map((group) => (
            <div key={group.group} className="mb-3">
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.group}
              </p>
              {group.items.map((item) => (
                <button
                  key={item}
                  onClick={() => setSection(item)}
                  className={cn(
                    "block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    section === item
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
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
          <h2 className="font-display text-xl font-semibold">{section}</h2>
          <div className="mt-6">
            <SectionContent section={section} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionContent({ section }: { section: string }) {
  switch (section) {
    case "Account":
      return <AccountSection />;
    case "General":
      return <GeneralSection />;
    case "Appearance":
      return <AppearanceSection />;
    case "Integrations":
      return <IntegrationsSection />;
    case "API Keys":
      return <ApiKeysSection />;
    case "Models":
      return <ModelsSection />;
    case "Security":
      return <SecuritySection />;
    case "Teams":
      return <TeamSection />;
    case "Connectors":
      return <ConnectorsSection />;
    default:
      return (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {section} settings are coming soon.
          </p>
        </div>
      );
  }
}

function AccountSection() {
  const { auth, activeCloudOrg, setActiveCloudOrgId, signOut } = useAuth();
  if (!auth) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border bg-card px-4 py-3">
        <p className="text-xs text-muted-foreground">Signed in as</p>
        <p className="mt-0.5 text-sm font-medium">{auth.user.email}</p>
        {auth.user.name && (
          <p className="text-xs text-muted-foreground">{auth.user.name}</p>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium">Organization</h3>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Organizations live in the cloud and scope your projects and
          connectors. Agent sessions and files stay local.
        </p>
        <div className="flex flex-col gap-1.5">
          {auth.orgs.map((org) => (
            <button
              key={org.id}
              onClick={() => setActiveCloudOrgId(org.id)}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors",
                org.id === activeCloudOrg?.id
                  ? "border-primary ring-1 ring-primary"
                  : "hover:border-foreground/30",
              )}
            >
              <span>
                <span className="block text-[13px] font-medium">{org.name}</span>
                <span className="block text-[11px] capitalize text-muted-foreground">
                  {org.role} · {org.plan}
                </span>
              </span>
              {org.id === activeCloudOrg?.id && (
                <Check className="h-4 w-4 text-primary" />
              )}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Button size="sm" variant="outline" onClick={() => signOut()}>
          Sign out
        </Button>
      </div>
    </div>
  );
}

function GeneralSection() {
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
    <div className="flex flex-col gap-4">
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

  if (!auth) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in to manage your team.
        </p>
      </div>
    );
  }
  if (!activeCloudOrg) {
    return (
      <p className="text-sm text-muted-foreground">
        Select an organization in Account settings first.
      </p>
    );
  }

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

function ConnectorsSection() {
  const { auth, activeCloudOrg } = useAuth();
  const { workspaces } = useWorkspaces();
  const [tab, setTab] = useState<ConnectorScope>("project");
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  if (!auth) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in to manage connectors.
        </p>
      </div>
    );
  }

  const selectProject = async (id: number) => {
    setWorkspaceId(id);
    setProjectId(null);
    setProjectError(null);
    if (!activeCloudOrg) {
      setProjectError("Select an organization in Account settings first.");
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

  const tabs: { id: ConnectorScope; label: string }[] = [
    { id: "project", label: "Project" },
    { id: "org", label: "Organization" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        Connectors give agents scoped access to external services. Credentials
        are encrypted and injected as environment variables at session start,
        project connectors overriding org connectors. API key / token only for
        now; OAuth flows come later.
      </p>

      <div className="flex gap-1 rounded-lg border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[13px] transition-colors",
              tab === t.id
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "org" ? (
        activeCloudOrg ? (
          <ConnectorManager scope="org" scopeId={activeCloudOrg.id} />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select an organization in Account settings first.
          </p>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium">Project</h3>
            <p className="mb-2 mt-1 text-xs text-muted-foreground">
              Connectors scoped to a single workspace and its client.
            </p>
            <select
              value={workspaceId ?? ""}
              onChange={(e) => selectProject(Number(e.target.value))}
              className="h-8 w-full rounded-md border bg-background px-2 text-[13px]"
            >
              <option value="" disabled>
                Select a workspace...
              </option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {ensuring && (
            <p className="text-xs text-muted-foreground">Linking project...</p>
          )}
          {projectError && (
            <p className="text-xs text-destructive">{projectError}</p>
          )}
          {projectId && <ConnectorManager scope="project" scopeId={projectId} />}
        </div>
      )}
    </div>
  );
}

function ConnectorManager({
  scope,
  scopeId,
}: {
  scope: ConnectorScope;
  scopeId: string;
}) {
  const available = CONNECTOR_REGISTRY.filter((d) => d.scopes.includes(scope));
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

  return (
    <div className="flex flex-col gap-4">
      {list.length > 0 && (
        <div className="flex flex-col gap-1.5">
          {list.map((c) => (
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

type ModelsTab = "account" | "org" | "project";

function ModelsSection() {
  const { auth, activeCloudOrg } = useAuth();
  const { workspaces } = useWorkspaces();
  const [tab, setTab] = useState<ModelsTab>("account");
  const [workspaceId, setWorkspaceId] = useState<number | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [projectError, setProjectError] = useState<string | null>(null);
  const [ensuring, setEnsuring] = useState(false);

  if (!auth) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">
          Sign in to manage model API keys.
        </p>
      </div>
    );
  }

  const selectProject = async (id: number) => {
    setWorkspaceId(id);
    setProjectId(null);
    setProjectError(null);
    if (!activeCloudOrg) {
      setProjectError("Select an organization in Account settings first.");
      return;
    }
    setEnsuring(true);
    try {
      const pid = await api.ensureWorkspaceProject(id, activeCloudOrg.id);
      setProjectId(pid);
    } catch (e) {
      setProjectError(String(e));
    } finally {
      setEnsuring(false);
    }
  };

  const tabs: { id: ModelsTab; label: string }[] = [
    { id: "account", label: "Account" },
    { id: "org", label: "Organization" },
    { id: "project", label: "Project" },
  ];

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs leading-relaxed text-muted-foreground">
        API keys are encrypted and stored in the cloud. At session start, keys
        resolve in order: project, then organization, then account, then your
        workspace .env. Standard provider env vars are injected into the agent.
      </p>

      <div className="flex gap-1 rounded-lg border bg-card p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex-1 rounded-md px-3 py-1.5 text-[13px] transition-colors",
              tab === t.id
                ? "bg-accent font-medium text-accent-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "account" && (
        <LlmKeyEditor
          scope="account"
          scopeId={auth.user.id}
          description="Personal keys that apply across every organization you belong to."
        />
      )}

      {tab === "org" && (
        activeCloudOrg ? (
          <LlmKeyEditor
            scope="org"
            scopeId={activeCloudOrg.id}
            description={`Shared keys for everyone in ${activeCloudOrg.name}.`}
          />
        ) : (
          <p className="text-sm text-muted-foreground">
            Select an organization in Account settings first.
          </p>
        )
      )}

      {tab === "project" && (
        <div className="flex flex-col gap-4">
          <div>
            <h3 className="text-sm font-medium">Project</h3>
            <p className="mb-2 mt-1 text-xs text-muted-foreground">
              Keys scoped to a single workspace and its client.
            </p>
            <select
              value={workspaceId ?? ""}
              onChange={(e) => selectProject(Number(e.target.value))}
              className="h-8 w-full rounded-md border bg-background px-2 text-[13px]"
            >
              <option value="" disabled>
                Select a workspace...
              </option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>
          {ensuring && (
            <p className="text-xs text-muted-foreground">Linking project...</p>
          )}
          {projectError && (
            <p className="text-xs text-destructive">{projectError}</p>
          )}
          {projectId && (
            <LlmKeyEditor
              scope="project"
              scopeId={projectId}
              description="Per-project keys override organization and account keys."
            />
          )}
        </div>
      )}
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
      <p className="text-xs text-muted-foreground">{description}</p>

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

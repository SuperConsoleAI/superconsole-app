import { useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import {
  Bell,
  Blocks,
  CreditCard,
  type LucideIcon,
  Palette,
  Plug,
  Settings as SettingsIcon,
  Shield,
  Sparkles,
  Terminal,
  Users,
  Workflow,
} from "lucide-react";
import { getSessionUser } from "../server/auth";
import { loadDashboard } from "../server/data";
import { AccountMenu } from "../AccountMenu";
import { Logo } from "../Logo";
import { ConnectorManager } from "../ConnectorManager";
import { LlmKeyEditor } from "../LlmKeyEditor";
import { OrgTeamManager, ProjectTeamManager } from "../TeamManager";

const getMeta = createServerFn({ method: "GET" })
  .validator((orgId: string | undefined) => orgId)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return loadDashboard(user, data);
  });

export const Route = createFileRoute("/settings")({
  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search.org === "string" ? search.org : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  loader: ({ deps }) => getMeta({ data: deps.org }),
  component: Settings,
});

type TopTab = "account" | "org" | "project";

const NAV: Record<TopTab, string[]> = {
  account: [
    "General",
    "Appearance",
    "Terminal",
    "Models",
    "Integrations",
    "Connectors",
    "Security",
    "Notifications",
  ],
  org: ["General", "Team", "Models", "Integrations", "Connectors", "Billing"],
  project: ["General", "Team", "Models", "Integrations", "Connectors", "Automations"],
};

const NAV_ICONS: Record<string, LucideIcon> = {
  General: SettingsIcon,
  Appearance: Palette,
  Terminal: Terminal,
  Models: Sparkles,
  Integrations: Blocks,
  Connectors: Plug,
  Security: Shield,
  Notifications: Bell,
  Team: Users,
  Billing: CreditCard,
  Automations: Workflow,
};

function DesktopOnly({ name }: { name: string }) {
  return (
    <div className="empty">{name} is managed in the desktop app.</div>
  );
}

function Soon({ name }: { name: string }) {
  return <div className="empty">{name} is coming soon.</div>;
}

function Settings() {
  const data = Route.useLoaderData();
  const orgId = data.activeOrg?.id ?? "";
  const canManage =
    data.activeOrg?.role === "owner" || data.activeOrg?.role === "admin";

  const [tab, setTab] = useState<TopTab>("account");
  const [section, setSection] = useState<Record<TopTab, string>>({
    account: "General",
    org: "General",
    project: "General",
  });
  const [projectId, setProjectId] = useState<string>(data.projects[0]?.id ?? "");
  const [query, setQuery] = useState("");

  const active = section[tab];
  const setActive = (s: string) =>
    setSection((prev) => ({ ...prev, [tab]: s }));

  const navItems = NAV[tab].filter((i) =>
    i.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="shell">
      <div className="topbar">
        <Link to="/" search={{ org: orgId }} className="brand-row">
          <Logo />
          <span className="brand">SuperConsole</span>
        </Link>
        <AccountMenu
          name={data.user.name}
          email={data.user.email}
          logoUrl={data.user.logoUrl}
          orgs={data.orgs}
          activeOrgId={orgId}
        />
      </div>

      <div className="toolbar">
        <div className="toptabs">
          {(
            [
              { id: "account", label: "Account" },
              { id: "org", label: "Organisation" },
              { id: "project", label: "Project" },
            ] as { id: TopTab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? "active" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "project" && (
          <div className="switcher">
            {data.projects.length === 0 ? (
              <span>No projects yet</span>
            ) : (
              <select
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </div>

      <div className="settings-layout">
        <div className="settings-nav">
          <input
            className="input nav-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search settings..."
          />
          {navItems.map((item) => {
            const Icon = NAV_ICONS[item];
            return (
              <button
                key={item}
                className={active === item ? "active" : ""}
                onClick={() => setActive(item)}
              >
                {Icon && <Icon size={15} />}
                {item}
              </button>
            );
          })}
        </div>

        <div className="settings-content">
          <div className="section-title" style={{ marginTop: 0 }}>
            {active}
          </div>
          <Content
            tab={tab}
            section={active}
            data={data}
            orgId={orgId}
            canManage={canManage}
            projectId={projectId}
          />
        </div>
      </div>
    </div>
  );
}

function Content({
  tab,
  section,
  data,
  orgId,
  canManage,
  projectId,
}: {
  tab: TopTab;
  section: string;
  data: ReturnType<typeof Route.useLoaderData>;
  orgId: string;
  canManage: boolean;
  projectId: string;
}) {
  if (tab === "account") {
    switch (section) {
      case "General":
        return (
          <div className="card">
            <div style={{ fontWeight: 600 }}>{data.user.email}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              Signed in to the SuperConsole portal
            </div>
          </div>
        );
      case "Models":
        return <LlmKeyEditor scope="account" scopeId="" />;
      case "Integrations":
        return (
          <ConnectorManager scope="account" scopeId="" category="integrations" />
        );
      case "Connectors":
        return (
          <ConnectorManager scope="account" scopeId="" category="connectors" />
        );
      case "Appearance":
      case "Terminal":
      case "Security":
      case "Notifications":
        return <DesktopOnly name={section} />;
    }
  }

  if (tab === "org") {
    if (!data.activeOrg)
      return <div className="empty">No organisation found for this account.</div>;
    switch (section) {
      case "General":
        return (
          <div className="card">
            <div style={{ fontWeight: 600 }}>{data.activeOrg.name}</div>
            <div className="muted" style={{ fontSize: 12 }}>
              {data.activeOrg.role} · {data.activeOrg.plan} plan
            </div>
          </div>
        );
      case "Team":
        return <OrgTeamManager orgId={orgId} role={data.activeOrg.role} />;
      case "Models":
        return <LlmKeyEditor scope="org" scopeId={orgId} />;
      case "Integrations":
        return (
          <ConnectorManager scope="org" scopeId={orgId} category="integrations" />
        );
      case "Connectors":
        return (
          <ConnectorManager scope="org" scopeId={orgId} category="connectors" />
        );
      case "Billing":
        return <Soon name="Billing" />;
    }
  }

  if (tab === "project") {
    if (data.projects.length === 0)
      return <div className="empty">No projects in this organisation yet.</div>;
    if (!projectId)
      return <div className="empty">Select a project to continue.</div>;
    const project = data.projects.find(
      (p: (typeof data.projects)[number]) => p.id === projectId,
    );
    switch (section) {
      case "General":
        return (
          <div className="card">
            <div style={{ fontWeight: 600 }}>{project?.name}</div>
            {project?.localPathHint && (
              <div className="muted" style={{ fontSize: 12 }}>
                {project.localPathHint}
              </div>
            )}
          </div>
        );
      case "Team":
        return (
          <ProjectTeamManager projectId={projectId} canManage={canManage} />
        );
      case "Models":
        return <LlmKeyEditor scope="project" scopeId={projectId} />;
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
        return <Soon name="Automations" />;
    }
  }

  return null;
}

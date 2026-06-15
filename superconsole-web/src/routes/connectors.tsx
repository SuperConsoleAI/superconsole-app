import { useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../server/auth";
import { loadDashboard } from "../server/data";
import { ConnectorManager } from "../ConnectorManager";
import type { ConnectorScope } from "../connector-registry";

const getMeta = createServerFn({ method: "GET" })
  .validator((orgId: string | undefined) => orgId)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return loadDashboard(user, data);
  });

export const Route = createFileRoute("/connectors")({
  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search.org === "string" ? search.org : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  loader: ({ deps }) => getMeta({ data: deps.org }),
  component: Connectors,
});

function Connectors() {
  const data = Route.useLoaderData();
  const orgId = data.activeOrg?.id ?? "";
  const [tab, setTab] = useState<ConnectorScope>("account");
  const [projectId, setProjectId] = useState<string>(data.projects[0]?.id ?? "");

  const scopeId =
    tab === "account" ? "" : tab === "org" ? orgId : projectId;

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">SuperConsole</span>
        <div className="row" style={{ gap: 12 }}>
          <Link to="/" search={{ org: orgId }} className="btn ghost">
            Dashboard
          </Link>
          <Link to="/logout" className="btn ghost">
            Sign out
          </Link>
        </div>
      </div>

      {data.orgs.length > 1 && (
        <div className="org-switch">
          {data.orgs.map((o) => (
            <Link
              key={o.id}
              to="/connectors"
              search={{ org: o.id }}
              className={o.id === orgId ? "active" : ""}
            >
              {o.name}
            </Link>
          ))}
        </div>
      )}

      <div className="section-title">Integrations & connectors</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        Credentials are encrypted before storage and synced to the desktop app.
        Resolution at session start: project, then organization, then account.
      </p>

      <div className="tabs">
        {(["account", "org", "project"] as ConnectorScope[]).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "account"
              ? "Account"
              : t === "org"
                ? "Organization"
                : "Project"}
          </button>
        ))}
      </div>

      {tab === "project" && (
        <div className="card">
          <div className="field">
            <label className="muted" style={{ fontSize: 12 }}>
              Project
            </label>
            {data.projects.length === 0 ? (
              <span className="muted">No projects in this organization yet.</span>
            ) : (
              <select
                className="select"
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
        </div>
      )}

      {tab === "org" && !data.activeOrg ? (
        <div className="empty">No organization found for this account.</div>
      ) : tab === "project" && !projectId ? (
        <div className="empty">Select a project to manage its connectors.</div>
      ) : (
        <>
          <div className="section-title" style={{ fontSize: 14 }}>
            Integrations
          </div>
          <ConnectorManager scope={tab} scopeId={scopeId} category="integrations" />
          <div className="section-title" style={{ fontSize: 14 }}>
            Connectors
          </div>
          <ConnectorManager scope={tab} scopeId={scopeId} category="connectors" />
        </>
      )}
    </div>
  );
}

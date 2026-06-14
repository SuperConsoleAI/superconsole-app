import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../server/auth";
import { loadDashboard, type ConnectorSummary } from "../server/data";

const getDashboard = createServerFn({ method: "GET" })
  .validator((orgId: string | undefined) => orgId)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return loadDashboard(user, data);
  });

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search.org === "string" ? search.org : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  loader: ({ deps }) => getDashboard({ data: deps.org }),
  component: Dashboard,
});

function StatusTag({ status }: { status: string }) {
  const cls = status === "connected" ? "tag ok" : "tag warn";
  return <span className={cls}>{status}</span>;
}

function ConnectorRow({ c }: { c: ConnectorSummary }) {
  return (
    <div className="connector-row">
      <span>{c.service}</span>
      <StatusTag status={c.status} />
    </div>
  );
}

function Dashboard() {
  const data = Route.useLoaderData();

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">SuperConsole</span>
        <div className="row" style={{ gap: 12 }}>
          <span className="muted">{data.user.email}</span>
          <Link
            to="/connectors"
            search={{ org: data.activeOrg?.id }}
            className="btn ghost"
          >
            Connectors
          </Link>
          <Link
            to="/team"
            search={{ org: data.activeOrg?.id }}
            className="btn ghost"
          >
            Team
          </Link>
          <Link
            to="/models"
            search={{ org: data.activeOrg?.id }}
            className="btn ghost"
          >
            Models
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
              to="/"
              search={{ org: o.id }}
              className={o.id === data.activeOrg?.id ? "active" : ""}
            >
              {o.name}
            </Link>
          ))}
        </div>
      )}

      {!data.activeOrg ? (
        <div className="empty">No organization found for this account.</div>
      ) : (
        <>
          <div className="card">
            <div className="row">
              <div>
                <div style={{ fontWeight: 600 }}>{data.activeOrg.name}</div>
                <div className="muted" style={{ fontSize: 12 }}>
                  {data.activeOrg.role} · {data.activeOrg.plan} plan
                </div>
              </div>
            </div>
          </div>

          <div className="section-title">Organization connectors</div>
          {data.orgConnectors.length === 0 ? (
            <div className="empty">No org-level connectors yet.</div>
          ) : (
            <div className="card">
              <div className="connector-list">
                {data.orgConnectors.map((c) => (
                  <ConnectorRow key={c.id} c={c} />
                ))}
              </div>
            </div>
          )}

          <div className="section-title">Projects</div>
          {data.projects.length === 0 ? (
            <div className="empty">No projects in this organization yet.</div>
          ) : (
            data.projects.map((p) => (
              <div key={p.id} className="card">
                <div className="row">
                  <div style={{ fontWeight: 600 }}>{p.name}</div>
                  <span className="muted" style={{ fontSize: 12 }}>
                    {p.connectors.length} connector
                    {p.connectors.length === 1 ? "" : "s"}
                  </span>
                </div>
                {p.localPathHint && (
                  <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>
                    {p.localPathHint}
                  </div>
                )}
                {p.connectors.length > 0 && (
                  <div className="connector-list">
                    {p.connectors.map((c) => (
                      <ConnectorRow key={c.id} c={c} />
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </>
      )}
    </div>
  );
}

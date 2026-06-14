import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../server/auth";
import { loadDashboard } from "../server/data";
import { ConnectorManager } from "../ConnectorManager";

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

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">SuperConsole</span>
        <div className="row" style={{ gap: 12 }}>
          <Link to="/" search={{ org: orgId }} className="btn ghost">
            Dashboard
          </Link>
          <Link
            to="/project-connectors"
            search={{ org: orgId, project: undefined }}
            className="btn ghost"
          >
            Project connectors
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

      <div className="section-title">Organization connectors</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        Operator-wide tools shared across every project in this organization.
        Credentials are encrypted before storage and synced to the desktop app.
      </p>

      {!data.activeOrg ? (
        <div className="empty">No organization found for this account.</div>
      ) : (
        <ConnectorManager scope="org" scopeId={orgId} />
      )}
    </div>
  );
}

import { useState } from "react";
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

export const Route = createFileRoute("/project-connectors")({
  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search.org === "string" ? search.org : undefined,
    project: typeof search.project === "string" ? search.project : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  loader: ({ deps }) => getMeta({ data: deps.org }),
  component: ProjectConnectors,
});

function ProjectConnectors() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const orgId = data.activeOrg?.id ?? "";
  const [projectId, setProjectId] = useState<string>(
    search.project ?? data.projects[0]?.id ?? "",
  );

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">SuperConsole</span>
        <div className="row" style={{ gap: 12 }}>
          <Link to="/" search={{ org: orgId }} className="btn ghost">
            Dashboard
          </Link>
          <Link to="/connectors" search={{ org: orgId }} className="btn ghost">
            Org connectors
          </Link>
          <Link to="/logout" className="btn ghost">
            Sign out
          </Link>
        </div>
      </div>

      <div className="section-title">Project connectors</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        Client-specific tools scoped to a single project. Agents running in this
        project use these credentials; project connectors override org ones.
      </p>

      {data.projects.length === 0 ? (
        <div className="empty">No projects in this organization yet.</div>
      ) : (
        <>
          <div className="card">
            <div className="field">
              <label className="muted" style={{ fontSize: 12 }}>
                Project
              </label>
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
            </div>
          </div>

          {projectId && (
            <ConnectorManager scope="project" scopeId={projectId} />
          )}
        </>
      )}
    </div>
  );
}

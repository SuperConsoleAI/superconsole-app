import { useEffect, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../server/auth";
import { loadDashboard } from "../server/data";
import {
  addProjectMember,
  listAddableProjectMembers,
  listProjectMembers,
  removeProjectMember,
  updateProjectMemberRole,
  type MemberRow,
} from "../server/team";

const PROJECT_ROLES = [
  { id: "editor", label: "Editor" },
  { id: "viewer", label: "Viewer" },
];

const getMeta = createServerFn({ method: "GET" })
  .validator((orgId: string | undefined) => orgId)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return loadDashboard(user, data);
  });

const fetchMembers = createServerFn({ method: "GET" })
  .validator((projectId: string) => projectId)
  .handler(async ({ data }): Promise<MemberRow[]> => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return listProjectMembers(user, data);
  });

const fetchAddable = createServerFn({ method: "GET" })
  .validator((projectId: string) => projectId)
  .handler(async ({ data }): Promise<MemberRow[]> => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return listAddableProjectMembers(user, data);
  });

const addMember = createServerFn({ method: "POST" })
  .validator((d: { projectId: string; userId: string; role: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await addProjectMember(user, data.projectId, data.userId, data.role);
  });

const changeRole = createServerFn({ method: "POST" })
  .validator((d: { projectId: string; userId: string; role: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await updateProjectMemberRole(user, data.projectId, data.userId, data.role);
  });

const removeMember = createServerFn({ method: "POST" })
  .validator((d: { projectId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await removeProjectMember(user, data.projectId, data.userId);
  });

export const Route = createFileRoute("/project-team")({
  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search.org === "string" ? search.org : undefined,
    project: typeof search.project === "string" ? search.project : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  loader: ({ deps }) => getMeta({ data: deps.org }),
  component: ProjectTeam,
});

function ProjectTeam() {
  const data = Route.useLoaderData();
  const search = Route.useSearch();
  const orgId = data.activeOrg?.id ?? "";
  const canManage =
    data.activeOrg?.role === "owner" || data.activeOrg?.role === "admin";

  const [projectId, setProjectId] = useState<string>(
    search.project ?? data.projects[0]?.id ?? "",
  );
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [addable, setAddable] = useState<MemberRow[]>([]);
  const [pickUser, setPickUser] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!projectId) return;
    fetchMembers({ data: projectId })
      .then(setMembers)
      .catch((e) => setError(String(e)));
    if (canManage) {
      fetchAddable({ data: projectId })
        .then((rows) => {
          setAddable(rows);
          setPickUser(rows[0]?.userId ?? "");
        })
        .catch(() => {});
    }
  };

  useEffect(() => {
    setMembers([]);
    setAddable([]);
    setError(null);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">SuperConsole</span>
        <div className="row" style={{ gap: 12 }}>
          <Link to="/" search={{ org: orgId }} className="btn ghost">
            Dashboard
          </Link>
          <Link to="/team" search={{ org: orgId }} className="btn ghost">
            Org team
          </Link>
          <Link to="/logout" className="btn ghost">
            Sign out
          </Link>
        </div>
      </div>

      <div className="section-title">Project members</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        Project members must already belong to this organization. Roles
        (editor/viewer) are stored for upcoming permission enforcement.
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

          {canManage && (
            <div className="card">
              <div className="field">
                <div className="row" style={{ gap: 8 }}>
                  {addable.length === 0 ? (
                    <span className="muted" style={{ fontSize: 13 }}>
                      All organization members are already on this project.
                    </span>
                  ) : (
                    <>
                      <select
                        className="select"
                        value={pickUser}
                        onChange={(e) => setPickUser(e.target.value)}
                      >
                        {addable.map((m) => (
                          <option key={m.userId} value={m.userId ?? ""}>
                            {m.name ? `${m.name} (${m.email})` : m.email}
                          </option>
                        ))}
                      </select>
                      <select
                        className="select"
                        style={{ width: 140 }}
                        value={role}
                        onChange={(e) => setRole(e.target.value)}
                      >
                        {PROJECT_ROLES.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <button
                        className="btn"
                        disabled={busy || !pickUser}
                        onClick={() =>
                          run(() =>
                            addMember({
                              data: { projectId, userId: pickUser, role },
                            }),
                          )
                        }
                      >
                        Add
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="card">
            {members.length === 0 ? (
              <span className="muted" style={{ fontSize: 13 }}>
                No members assigned to this project yet.
              </span>
            ) : (
              <div className="connector-list" style={{ marginTop: 0 }}>
                {members.map((m) => (
                  <div key={m.userId} className="connector-row">
                    <span>
                      {m.name ?? m.email}
                      <span className="muted" style={{ fontSize: 12 }}>
                        {" "}
                        · {m.email}
                      </span>
                    </span>
                    <span className="row" style={{ gap: 8 }}>
                      {canManage ? (
                        <select
                          className="select"
                          style={{ width: 120 }}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) =>
                            run(() =>
                              changeRole({
                                data: {
                                  projectId,
                                  userId: m.userId!,
                                  role: e.target.value,
                                },
                              }),
                            )
                          }
                        >
                          {PROJECT_ROLES.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="tag">{m.role}</span>
                      )}
                      {canManage && (
                        <button
                          className="btn ghost"
                          style={{ padding: "4px 10px", fontSize: 12 }}
                          disabled={busy}
                          onClick={() =>
                            run(() =>
                              removeMember({
                                data: { projectId, userId: m.userId! },
                              }),
                            )
                          }
                        >
                          Remove
                        </button>
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {error && (
        <p className="muted" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

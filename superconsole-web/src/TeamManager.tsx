import { useEffect, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSessionUser } from "./server/auth";
import {
  addProjectMember,
  cancelOrgInvitation,
  inviteOrgMember,
  listAddableProjectMembers,
  listOrgMembers,
  listProjectMembers,
  removeOrgMember,
  removeProjectMember,
  updateOrgMemberRole,
  updateProjectMemberRole,
  type MemberRow,
} from "./server/team";

const ORG_ROLES = [
  { id: "admin", label: "Admin" },
  { id: "member", label: "Member" },
];
const PROJECT_ROLES = [
  { id: "editor", label: "Editor" },
  { id: "viewer", label: "Viewer" },
];

const fetchOrgMembers = createServerFn({ method: "GET" })
  .validator((orgId: string) => orgId)
  .handler(async ({ data }): Promise<MemberRow[]> => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return listOrgMembers(user, data);
  });

const inviteOrg = createServerFn({ method: "POST" })
  .validator((d: { orgId: string; email: string; role: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await inviteOrgMember(user, data.orgId, data.email, data.role);
  });

const changeOrgRole = createServerFn({ method: "POST" })
  .validator((d: { orgId: string; userId: string; role: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await updateOrgMemberRole(user, data.orgId, data.userId, data.role);
  });

const removeOrg = createServerFn({ method: "POST" })
  .validator((d: { orgId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await removeOrgMember(user, data.orgId, data.userId);
  });

const cancelInvite = createServerFn({ method: "POST" })
  .validator((d: { orgId: string; email: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await cancelOrgInvitation(user, data.orgId, data.email);
  });

export function OrgTeamManager({
  orgId,
  role,
}: {
  orgId: string;
  role: string;
}) {
  const canManage = role === "owner" || role === "admin";
  const isOwner = role === "owner";

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [email, setEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!orgId) return;
    fetchOrgMembers({ data: orgId })
      .then(setMembers)
      .catch((e) => setError(String(e)));
  };

  useEffect(() => {
    setMembers([]);
    setError(null);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

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
    <>
      {canManage && (
        <div className="card">
          <div className="field">
            <div className="row" style={{ gap: 8 }}>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@company.com"
              />
              <select
                className="select"
                style={{ width: 140 }}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value)}
              >
                {ORG_ROLES.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <button
                className="btn"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await inviteOrg({ data: { orgId, email, role: inviteRole } });
                    setEmail("");
                  })
                }
              >
                Invite
              </button>
            </div>
            <span className="muted" style={{ fontSize: 12 }}>
              Invited people join automatically when they sign in here with the
              invited email.
            </span>
          </div>
        </div>
      )}

      <div className="card">
        <div className="connector-list" style={{ marginTop: 0 }}>
          {members.map((m) => {
            const targetOwner = m.role === "owner";
            const editable =
              canManage && m.status === "active" && (isOwner || !targetOwner);
            return (
              <div
                key={m.userId ?? `invite-${m.email}`}
                className="connector-row"
              >
                <span>
                  {m.name ?? m.email}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {" "}
                    · {m.email}
                    {m.status === "invited" ? " · invited" : ""}
                  </span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  {editable ? (
                    <select
                      className="select"
                      style={{ width: 120 }}
                      value={m.role}
                      disabled={busy}
                      onChange={(e) =>
                        run(() =>
                          changeOrgRole({
                            data: {
                              orgId,
                              userId: m.userId!,
                              role: e.target.value,
                            },
                          }),
                        )
                      }
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
                    <span className="tag">{m.role}</span>
                  )}
                  {canManage && m.status === "invited" && (
                    <button
                      className="btn ghost"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      disabled={busy}
                      onClick={() =>
                        run(() => cancelInvite({ data: { orgId, email: m.email } }))
                      }
                    >
                      Cancel
                    </button>
                  )}
                  {editable && (
                    <button
                      className="btn ghost"
                      style={{ padding: "4px 10px", fontSize: 12 }}
                      disabled={busy}
                      onClick={() =>
                        run(() => removeOrg({ data: { orgId, userId: m.userId! } }))
                      }
                    >
                      Remove
                    </button>
                  )}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {error && (
        <p className="muted" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}
    </>
  );
}

const fetchProjectMembers = createServerFn({ method: "GET" })
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

const changeProjectRole = createServerFn({ method: "POST" })
  .validator((d: { projectId: string; userId: string; role: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await updateProjectMemberRole(user, data.projectId, data.userId, data.role);
  });

const removeProject = createServerFn({ method: "POST" })
  .validator((d: { projectId: string; userId: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await removeProjectMember(user, data.projectId, data.userId);
  });

export function ProjectTeamManager({
  projectId,
  canManage,
}: {
  projectId: string;
  canManage: boolean;
}) {
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [addable, setAddable] = useState<MemberRow[]>([]);
  const [pickUser, setPickUser] = useState("");
  const [role, setRole] = useState("editor");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!projectId) return;
    fetchProjectMembers({ data: projectId })
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
    <>
      {canManage && (
        <div className="card">
          <div className="field">
            {addable.length > 0 ? (
              <div className="row" style={{ gap: 8 }}>
                <select
                  className="select"
                  value={pickUser}
                  onChange={(e) => setPickUser(e.target.value)}
                >
                  {addable.map((m) => (
                    <option key={m.userId ?? m.email} value={m.userId ?? ""}>
                      {m.name ?? m.email}
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
              </div>
            ) : (
              <span className="muted" style={{ fontSize: 12 }}>
                Everyone in your organization already has access.
              </span>
            )}
          </div>
        </div>
      )}

      <div className="card">
        <div className="connector-list" style={{ marginTop: 0 }}>
          {members.map((m) => (
            <div key={m.userId ?? m.email} className="connector-row">
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
                        changeProjectRole({
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
                        removeProject({ data: { projectId, userId: m.userId! } }),
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
      </div>

      {error && (
        <p className="muted" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}
    </>
  );
}

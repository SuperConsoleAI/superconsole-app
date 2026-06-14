import { useEffect, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../server/auth";
import { loadDashboard } from "../server/data";
import {
  cancelOrgInvitation,
  inviteOrgMember,
  listOrgMembers,
  removeOrgMember,
  updateOrgMemberRole,
  type MemberRow,
} from "../server/team";

const ORG_ROLES = [
  { id: "admin", label: "Admin" },
  { id: "member", label: "Member" },
];

const getMeta = createServerFn({ method: "GET" })
  .validator((orgId: string | undefined) => orgId)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return loadDashboard(user, data);
  });

const fetchMembers = createServerFn({ method: "GET" })
  .validator((orgId: string) => orgId)
  .handler(async ({ data }): Promise<MemberRow[]> => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return listOrgMembers(user, data);
  });

const invite = createServerFn({ method: "POST" })
  .validator((d: { orgId: string; email: string; role: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await inviteOrgMember(user, data.orgId, data.email, data.role);
  });

const changeRole = createServerFn({ method: "POST" })
  .validator((d: { orgId: string; userId: string; role: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await updateOrgMemberRole(user, data.orgId, data.userId, data.role);
  });

const removeMember = createServerFn({ method: "POST" })
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

export const Route = createFileRoute("/team")({
  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search.org === "string" ? search.org : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  loader: ({ deps }) => getMeta({ data: deps.org }),
  component: Team,
});

function Team() {
  const data = Route.useLoaderData();
  const orgId = data.activeOrg?.id ?? "";
  const canManage =
    data.activeOrg?.role === "owner" || data.activeOrg?.role === "admin";
  const isOwner = data.activeOrg?.role === "owner";

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    if (!orgId) return;
    fetchMembers({ data: orgId })
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
    <div className="shell">
      <div className="topbar">
        <span className="brand">SuperConsole</span>
        <div className="row" style={{ gap: 12 }}>
          <Link to="/" search={{ org: orgId }} className="btn ghost">
            Dashboard
          </Link>
          <Link
            to="/project-team"
            search={{ org: orgId, project: undefined }}
            className="btn ghost"
          >
            Project teams
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
              to="/team"
              search={{ org: o.id }}
              className={o.id === orgId ? "active" : ""}
            >
              {o.name}
            </Link>
          ))}
        </div>
      )}

      <div className="section-title">Team members</div>
      {!data.activeOrg ? (
        <div className="empty">No organization found for this account.</div>
      ) : (
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
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
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
                        await invite({ data: { orgId, email, role } });
                        setEmail("");
                      })
                    }
                  >
                    Invite
                  </button>
                </div>
                <span className="muted" style={{ fontSize: 12 }}>
                  Invited people join automatically when they sign in here with
                  the invited email.
                </span>
              </div>
            </div>
          )}

          <div className="card">
            <div className="connector-list" style={{ marginTop: 0 }}>
              {members.map((m) => {
                const targetOwner = m.role === "owner";
                const editable =
                  canManage &&
                  m.status === "active" &&
                  (isOwner || !targetOwner);
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
                              changeRole({
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
                            run(() =>
                              cancelInvite({ data: { orgId, email: m.email } }),
                            )
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
                            run(() =>
                              removeMember({
                                data: { orgId, userId: m.userId! },
                              }),
                            )
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

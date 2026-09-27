import { component$, useSignal, useStylesScoped$, $, useContext } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";
import { LuPlus, LuTrash2, LuMail, LuLoader, LuSend, LuCopy, LuCheck, LuSave } from "@qwikest/icons/lucide";
import { SettingsContext } from "../layout";
import { SlideOver } from "~/components/SlideOver";
import { useAppContext } from "~/lib/app-context";
import { useNavigate } from "@builder.io/qwik-city";

import styles from "./teams.css?inline";

type TeamMember = {
  id: string;
  user_id: string;
  email: string;
  role: string;
  app_access: string;
  created_at: number;
};

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

export default component$(() => {
  useStylesScoped$(styles);
  const settingsCtx = useContext(SettingsContext);

  const copiedId = useSignal<string | null>(null);

  const appCtx = useAppContext();
  const nav = useNavigate();
  const isLicensed = !!appCtx.license.value && ["active", "grace", "trial"].includes(appCtx.license.value.status);
  const globalPlan = isLicensed ? (appCtx.license.value?.plan || "FREE").toUpperCase() : "FREE";
  const canInvite = globalPlan === "BUSINESS" || globalPlan === "PRO";

  const showModal = useSignal(false);
  const editingMember = useSignal<TeamMember | null>(null);
  const inviteEmail = useSignal("");
  const inviteRole = useSignal("viewer");
  const inviteApps = useSignal<string[]>([]);
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);

  const allAvailableApps = Array.from(new Set(["store", "content", "c", "crm", ...(appCtx.installedApps.value || [])]));

  const handleSave = $(async () => {
    if (!editingMember.value && !inviteEmail.value.trim()) {
      error.value = "Email is required.";
      return;
    }
    saving.value = true;
    error.value = null;
    try {
      if (editingMember.value) {
        await invoke("update_team_member", { 
          memberId: editingMember.value.id, 
          role: inviteRole.value, 
          appAccess: JSON.stringify(inviteApps.value) 
        });
      } else {
        await invoke("invite_member", { 
          email: inviteEmail.value, 
          role: inviteRole.value, 
          appAccess: JSON.stringify(inviteApps.value) 
        });
      }
      showModal.value = false;
      editingMember.value = null;
      inviteEmail.value = "";
      inviteRole.value = "viewer";
      inviteApps.value = ["*"];

      // Refresh data via global settings context
      await settingsCtx.refresh();
    } catch (e) {
      console.error(e);
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const handleRemoveMember = $(async (id: string) => {
    if (!confirm("Are you sure you want to remove this member?")) return;
    try {
      await invoke("remove_team_member", { memberId: id });
      await settingsCtx.refresh();
    } catch (e) {
      alert(String(e));
    }
  });

  const handleRevokeInvite = $(async (id: string) => {
    if (!confirm("Are you sure you want to revoke this invitation?")) return;
    try {
      await invoke("delete_invite", { inviteId: id });
      await settingsCtx.refresh();
    } catch (e) {
      alert(String(e));
    }
  });

  const openEditModal = $((member: TeamMember) => {
    editingMember.value = member;
    inviteEmail.value = member.email;
    inviteRole.value = member.role;
    try {
      inviteApps.value = JSON.parse(member.app_access || '[]');
    } catch {
      inviteApps.value = [];
    }
    showModal.value = true;
  });

  const toggleApp = $((app: string) => {
    if (app === "*") {
      inviteApps.value = inviteApps.value.includes("*") ? [] : ["*"];
      return;
    }
    let newApps = inviteApps.value.filter(a => a !== "*");
    if (newApps.includes(app)) {
      newApps = newApps.filter(a => a !== app);
    } else {
      newApps = [...newApps, app];
    }
    inviteApps.value = newApps;
  });

  if (settingsCtx.loading) {
    return <div class="teams-main">Loading team data...</div>;
  }

  return (
    <div class="teams-main">
      <div class="form-wrapper">
        <div class="form-card" style={{ padding: "0" }}>
          {settingsCtx.teamMembers.length === 0 ? (
            <p style={{ padding: "1.5rem" }}>No active members yet.</p>
          ) : (
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>App Access</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {settingsCtx.teamMembers.map((m: any) => {
                    const apps: string[] = JSON.parse(m.app_access || '[]');
                    return (
                      <tr key={m.id}>
                        <td>{m.email}</td>
                        <td><span class="role-badge">{m.role}</span></td>
                        <td>
                          {apps.includes('*') ? (
                            <span class="app-tag">All Apps</span>
                          ) : apps.length === 0 ? (
                            <span class="app-tag" style="background:var(--surface-3);color:var(--text-secondary)">None</span>
                          ) : (
                            apps.map(a => <span key={a} class="app-tag">{a}</span>)
                          )}
                        </td>
                        <td>
                          {m.role !== 'owner' && (
                            <div style="display:flex;gap:0.5rem;">
                              <button class="button-secondary" title="Edit access" style="padding:0.25rem 0.5rem; height:auto; font-size:0.75rem;" onClick$={() => openEditModal(m)}>Edit</button>
                              <button class="button-danger" title="Remove member" onClick$={() => handleRemoveMember(m.id)}><LuTrash2 class="w-4 h-4" /></button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div class="form-card">
          <h2 class="section-title" style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
            <span style="display:flex; align-items:center; gap:0.5rem;"><LuMail class="w-5 h-5" /> Pending Invites</span>
            {canInvite ? (
              <button class="button-primary" style="height:2rem; padding:0 1rem;" onClick$={() => { editingMember.value = null; inviteEmail.value = ""; inviteRole.value = "viewer"; inviteApps.value = ["*"]; showModal.value = true; }}>
                <LuPlus class="w-4 h-4" /> Invite
              </button>
            ) : (
              <button class="button-primary" style="height:2rem; padding:0 1rem; background: var(--border);" onClick$={() => nav("/dashboard/settings?tab=plan")}>
                Upgrade to Invite
              </button>
            )}
          </h2>
          {settingsCtx.teamInvites.length === 0 ? (
            <p style="margin:0; color:var(--text-secondary);">No pending invites.</p>
          ) : (
            <div class="table-wrapper">
              <table class="data-table">
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {settingsCtx.teamInvites.map(inv => (
                    <tr key={inv.id}>
                      <td>{inv.email}</td>
                      <td><span class="role-badge">{inv.role}</span></td>
                      <td>{inv.status}</td>
                      <td>
                        <div style="display:flex; gap:0.5rem;">
                          <button
                            class="button-secondary"
                            title="Copy link"
                            onClick$={() => {
                              const text = `https://businesskit.io/invite?token=${inv.token}`;
                              const doCopy = () => {
                                copiedId.value = inv.id;
                                setTimeout(() => { if (copiedId.value === inv.id) copiedId.value = null; }, 2000);
                              };
                              if (navigator.clipboard && window.isSecureContext) {
                                navigator.clipboard.writeText(text).then(doCopy).catch(() => {});
                              }
                            }}
                            style="padding:0.25rem 0.5rem; height:auto;"
                          >
                            {copiedId.value === inv.id ? <LuCheck class="w-4 h-4" style="color:var(--success)" /> : <LuCopy class="w-4 h-4" />}
                          </button>
                          <button class="button-danger" title="Revoke invite" onClick$={() => handleRevokeInvite(inv.id)}><LuTrash2 class="w-4 h-4" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <SlideOver
        open={showModal}
        title={editingMember.value ? "Edit Team Member" : "Invite Team Member"}
        subtitle="Fill the details."
        width="520px"
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
          {error.value && (
                <div style="padding:0.75rem;background:var(--error-soft, rgba(239,68,68,0.1));color:var(--error);border-radius:0.375rem;font-size:0.875rem;">
                  {error.value}
                </div>
              )}
              <div>
                <label style={labelStyle}>Email Address <span style="color:var(--error);">*</span></label>
                <input type="email" value={inviteEmail.value} onInput$={(e) => { inviteEmail.value = (e.target as HTMLInputElement).value; }} placeholder="colleague@example.com" style={inputStyle} disabled={!!editingMember.value} />
                {editingMember.value && <p style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.25rem;">Email cannot be changed.</p>}
              </div>
              <div>
                <label style={labelStyle}>Role</label>
                <select value={inviteRole.value} onChange$={(e) => { inviteRole.value = (e.target as HTMLSelectElement).value; }} style={{ ...inputStyle, cursor: "pointer" }}>
                  <option value="admin">Manager (Admin)</option>
                  <option value="editor">Editor</option>
                  <option value="viewer">Viewer</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Restrict App Access</label>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem", maxHeight: "200px", overflowY: "auto", border: "1px solid var(--border)", padding: "1rem", borderRadius: "0.375rem", background: "var(--field-fill)" }}>
                  <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer" }}>
                    <input type="checkbox" checked={inviteApps.value.includes("*")} onChange$={() => toggleApp("*")} />
                    <strong>All Apps</strong>
                  </label>
                  {allAvailableApps.map((app: string) => {
                    const displayName = { "c": "Link In Bio", "crm": "CRM", "store": "Store", "content": "Content" }[app] || app;
                    return (
                      <label key={app} style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", cursor: "pointer", opacity: inviteApps.value.includes("*") ? 0.6 : 1 }}>
                        <input type="checkbox" checked={inviteApps.value.includes("*") || inviteApps.value.includes(app)} disabled={inviteApps.value.includes("*")} onChange$={() => toggleApp(app)} />
                        {displayName}
                      </label>
                    );
                  })}
                </div>
              </div>
        </div>
        <div q:slot="footer" style={{ padding: "1rem 1.5rem", background: "var(--surface-2)", borderTop: "1px solid var(--border)" }}>
            <button
              onClick$={handleSave}
              disabled={saving.value || (!editingMember.value && !inviteEmail.value)}
              style={{
                width: "100%",
                height: "2.625rem",
                background: saving.value ? "var(--muted)" : "var(--button-primary-bg, var(--text-primary))",
                color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text, var(--surface-1))",
                border: "none",
                borderRadius: "0.375rem",
                fontSize: "0.875rem",
                fontWeight: "600",
                cursor: saving.value ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "0.5rem",
                transition: "background 150ms ease, opacity 150ms ease",
              }}
            >
              {saving.value ? (
                <>
                  <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                  Saving…
                </>
              ) : (
                <>
                  {editingMember.value ? <LuSave style="width:1rem;height:1rem;" stroke-width="1" /> : <LuSend style="width:1rem;height:1rem;" stroke-width="1" />}
                  {editingMember.value ? "Save Changes" : "Send Invite"}
                </>
              )}
            </button>
        </div>
      </SlideOver>
    </div>
  );
});

export const head: DocumentHead = { title: "Team Permissions | BusinessKit" };

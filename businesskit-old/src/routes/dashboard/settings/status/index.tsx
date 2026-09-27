// src/routes/dashboard/settings/status/index.tsx
// Mirrors businesskit-web/src/routes/settings/status/index.tsx

import { component$, useSignal, useVisibleTask$, $ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { useAppContext } from "~/lib/app-context";
import { getUserdbStatus, provisionUserDbNow, provisionMigrationsNow, recreateUserTable, recreateUserTriggers, recreateSingleTrigger } from "~/lib/ipc";
import {
  LuUser, LuLink, LuDatabase, LuCalendar,
  LuTable, LuGitBranch, LuZap, LuEye, LuRefreshCw, LuCode,
} from "@qwikest/icons/lucide";

type DbStatus = Awaited<ReturnType<typeof getUserdbStatus>>;

// Friendly date: "28 May 2026, 18:34"
function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
    + ", "
    + d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

export default component$(() => {
  const ctx = useAppContext();
  const nav = useNavigate();

  const status       = useSignal<DbStatus | null>(null);
  const error        = useSignal<string | null>(null);
  const provisioning = useSignal(false);
  const migrating    = useSignal(false);
  const provisionMsg = useSignal<{ ok: boolean; msg: string } | null>(null);
  const recreatingTable = useSignal<string | null>(null);
  const recreatingTriggerGroup = useSignal<string | null>(null);
  const recreatingSingleTrg = useSignal<string | null>(null);
  const selectedTableTab = useSignal<string>("all");
  const selectedIndexTab = useSignal<string>("all");
  const selectedTriggerTab = useSignal<string>("all");
  const selectedViewTab = useSignal<string>("all");

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const profileId = track(() => ctx.activeProfileId.value);
    if (!profileId) return;
    error.value = null;
    try {
      status.value = await getUserdbStatus();
    } catch (e: any) {
      error.value = String(e);
    }
  });

  const refreshing = useSignal(false);

  const refresh = $(async (force: boolean = false) => {
    refreshing.value = true;
    try { 
      status.value = await getUserdbStatus(force); 
    } catch { /* ignore */ } finally {
      refreshing.value = false;
    }
  });

  const runProvision = $(async () => {
    provisioning.value = true;
    provisionMsg.value = null;
    try {
      const msg = await provisionUserDbNow();
      provisionMsg.value = { ok: true, msg };
      const pid = ctx.activeProfileId.value;
      if (pid) localStorage.removeItem(`bk-provisioned-${pid}`);
      await refresh(true);
      if (status.value?.last_provisioned_at && pid) {
        localStorage.setItem(`bk-provisioned-${pid}`, String(status.value.last_provisioned_at));
      }
    } catch (e: any) {
      provisionMsg.value = { ok: false, msg: String(e) };
    } finally {
      provisioning.value = false;
    }
  });

  const runProvisionMigrations = $(async () => {
    migrating.value = true;
    provisionMsg.value = null;
    try {
      const msg = await provisionMigrationsNow();
      provisionMsg.value = { ok: true, msg };
      await refresh(true);
    } catch (e: any) {
      provisionMsg.value = { ok: false, msg: String(e) };
    } finally {
      migrating.value = false;
    }
  });

  const runRecreateTable = $(async (tableName: string) => {
    recreatingTable.value = tableName;
    provisionMsg.value = null;
    try {
      const msg = await recreateUserTable(tableName);
      provisionMsg.value = { ok: true, msg };
      await refresh(true);
    } catch (e: any) {
      provisionMsg.value = { ok: false, msg: String(e) };
    } finally {
      recreatingTable.value = null;
    }
  });

  const runRecreateTriggers = $(async (group?: string) => {
    recreatingTriggerGroup.value = group ?? "all";
    provisionMsg.value = null;
    try {
      const msg = await recreateUserTriggers(group);
      provisionMsg.value = { ok: true, msg };
      await refresh(true);
    } catch (e: any) {
      provisionMsg.value = { ok: false, msg: String(e) };
    } finally {
      recreatingTriggerGroup.value = null;
    }
  });

  const runRecreateSingleTrigger = $(async (triggerName: string) => {
    recreatingSingleTrg.value = triggerName;
    provisionMsg.value = null;
    try {
      const msg = await recreateSingleTrigger(triggerName);
      provisionMsg.value = { ok: true, msg };
      await refresh(true);
    } catch (e: any) {
      provisionMsg.value = { ok: false, msg: String(e) };
    } finally {
      recreatingSingleTrg.value = null;
    }
  });

  const activeProfile = ctx.profiles.value.find(p => p.id === ctx.activeProfileId.value);
  const s = status.value;

  // Icon style shared
  const iconStyle = "width:1rem;height:1rem;flex-shrink:0;color:var(--text-secondary);";

  return (
    <>
      <style>{`.status-table-row { transition: background 0.15s ease; } .status-table-row:hover { background: var(--surface-3) !important; }`}</style>
      {/* ── Info card ─────────────────────────────────────────────── */}
      <div style="background:var(--surface-2);border-radius:var(--radius-md);border:1px solid var(--border);padding:1.25rem 1.5rem;margin-bottom:1.5rem;color:var(--text-primary);">

        <div style="display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0;width:100%;">
          <LuUser style={iconStyle} />
          <span style="color:var(--text-secondary);font-size:0.875rem;min-width:7rem;">Profile</span>
          <span style="font-size:0.875rem;font-weight:500;">
            {activeProfile?.title ?? activeProfile?.slug ?? ctx.activeProfileId.value ?? "—"}
          </span>
        </div>

        <div style="border-top:1px solid var(--border);display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0;width:100%;">
          <LuDatabase style={iconStyle} />
          <span style="color:var(--text-secondary);font-size:0.875rem;min-width:7rem;">Profile ID</span>
          <code style="font-size:0.78rem;background:var(--surface-1);padding:0.15rem 0.4rem;border-radius:4px;word-break:break-all;">
            {ctx.activeProfileId.value ?? "N/A"}
          </code>
        </div>

        {s && (
          <>
            <div style="border-top:1px solid var(--border);display:flex;align-items:flex-start;gap:0.6rem;padding:0.4rem 0;width:100%;">
              <LuLink style={`${iconStyle}margin-top:0.15rem;`} />
              <span style="color:var(--text-secondary);font-size:0.875rem;min-width:7rem;flex-shrink:0;">Turso URL</span>
              <code style="font-size:0.78rem;background:var(--surface-1);padding:0.15rem 0.4rem;border-radius:4px;word-break:break-all;flex:1;">
                {s.turso_url}
              </code>
            </div>

            <div style="border-top:1px solid var(--border);display:flex;align-items:center;gap:0.6rem;padding:0.4rem 0;width:100%;">
              <LuCalendar style={iconStyle} />
              <span style="color:var(--text-secondary);font-size:0.875rem;min-width:7rem;">Provisioned</span>
              {s.last_provisioned_at
                ? <span style="color:var(--success,#10B981);font-size:0.875rem;">✓ {fmtDate(s.last_provisioned_at)}</span>
                : <span style="color:var(--warning,#F59E0B);font-size:0.875rem;">Never provisioned</span>}
            </div>
          </>
        )}

        {error.value && (
          <p style="margin:0.5rem 0 0 0;color:var(--error,#EF4444);font-size:0.85rem;">
            {error.value}
          </p>
        )}
      </div>

      {/* ── Provision banner ──────────────────────────────────────── */}
      {s && (
        (() => {
          const missingCount = s.tables.filter(t => !t.exists).length;
          const isReady = missingCount === 0 && s.last_provisioned_at;
          
          return (
            <div style={`background:${isReady ? 'var(--surface-3)' : 'var(--surface-2)'};border-radius:var(--radius-md);border:1px solid var(--border);padding:1.25rem 1.5rem;margin-bottom:1.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap;`}>
              {!s.last_provisioned_at ? (
                <>
                  <div>
                    <h2 style="font-size:1.1rem;font-weight:600;margin:0 0 0.25rem 0;">One Last Step</h2>
                    <p style="color:var(--text-secondary);margin:0;font-size:0.9rem;">Set up your database schema.</p>
                    <p style="color:var(--warning,#F59E0B);margin:0.2rem 0 0 0;font-size:0.82rem;font-weight:500;">Takes up to 5 min. Do not close the app.</p>
                  </div>
                  <button
                    disabled={provisioning.value}
                    onClick$={runProvision}
                    style={`background:var(--button-primary-bg);color:var(--button-primary-text);border:none;padding:0.6rem 1.25rem;border-radius:var(--radius-sm);font-weight:500;cursor:pointer;font-size:0.95rem;opacity:${provisioning.value ? 0.7 : 1};`}
                  >
                    {provisioning.value ? "Provisioning…" : "Continue"}
                  </button>
                </>
              ) : isReady ? (
                <>
                  <div>
                    <h2 style="font-size:1.1rem;font-weight:600;margin:0 0 0.2rem 0;color:var(--success,#10B981);">Workspace Ready</h2>
                    <p style="color:var(--text-secondary);margin:0;font-size:0.875rem;">All tables have been provisioned.</p>
                  </div>
                  <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
                    <button
                      onClick$={() => nav("/dashboard")}
                      style="background:var(--button-primary-bg);color:var(--button-primary-text);border:none;padding:0.4rem 1rem;border-radius:var(--radius-sm);font-weight:500;cursor:pointer;font-size:0.875rem;"
                    >
                      Go to Dashboard
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h2 style="font-size:1.1rem;font-weight:600;margin:0 0 0.2rem 0;color:var(--warning,#F59E0B);">Missing Tables Detected</h2>
                    <p style="color:var(--text-secondary);margin:0;font-size:0.875rem;">We found {missingCount} missing tables.</p>
                  </div>
                  <div style="display:flex;gap:0.75rem;align-items:center;flex-wrap:wrap;">
                    <button
                      disabled={provisioning.value}
                      onClick$={runProvision}
                      style={`background:var(--button-primary-bg);color:var(--button-primary-text);border:none;padding:0.4rem 1rem;border-radius:var(--radius-sm);font-weight:500;cursor:pointer;font-size:0.875rem;opacity:${provisioning.value ? 0.7 : 1};`}
                    >
                      {provisioning.value ? "Running…" : "Provision All Missing"}
                    </button>
                  </div>
                </>
              )}
            </div>
          );
        })()
      )}

      {/* ── Provision result ──────────────────────────────────────── */}
      {provisionMsg.value && (
        <div style={`background:${provisionMsg.value.ok ? "var(--success-bg, rgba(16, 185, 129, 0.15))" : "var(--error-bg, rgba(239, 68, 68, 0.15))"};border-radius:var(--radius-sm);padding:0.75rem 1rem;margin-bottom:1rem;font-size:0.875rem;color:${provisionMsg.value.ok ? "var(--success, #10B981)" : "var(--error, #EF4444)"};display:flex;align-items:center;gap:0.75rem;font-weight:500;`}>
          {provisionMsg.value.ok
            ? <><span>✓ {provisionMsg.value.msg}</span></>
            : `✗ ${provisionMsg.value.msg}`}
        </div>
      )}

      {/* ── Schema sections (show when data available) ────────────── */}
      {s && (
        <div style="background:var(--surface-2);border-radius:var(--radius-md);border:1px solid var(--border);">

          {/* Header row */}
          <div style="display:flex;align-items:center;justify-content:space-between;padding:1rem 1.5rem;border-bottom:1px solid var(--border);">
            <span style="font-weight:600;font-size:0.95rem;">
              Schema — {s.table_count}/{s.expected_table_count}T · {s.index_count}/{s.expected_index_count}I · {s.trigger_count}/{s.expected_trigger_count}Tr · {s.view_count}/{s.expected_view_count}V
            </span>
            <div style="display:flex;gap:0.5rem;align-items:center;">
              <button
                disabled={refreshing.value}
                onClick$={() => refresh(true)}
                title="Refresh Schema Status"
                style={`background:transparent;color:var(--text-primary);border:1px solid var(--border);padding:0.3rem 0.6rem;border-radius:var(--radius-sm);cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.3rem;opacity:${refreshing.value ? 0.6 : 1};`}
              >
                <LuRefreshCw style={`width:0.85rem;height:0.85rem;${refreshing.value ? "animation:spin 1s linear infinite;" : ""}`} />
                <span>{refreshing.value ? "Checking…" : "Refresh"}</span>
              </button>
              <button
                onClick$={() => {
                  ctx.sqlRunnerOpen.value = true;
                }}
                title="Open Turso SQL Editor"
                style="background:transparent;color:var(--text-primary);border:1px solid var(--border);padding:0.3rem 0.75rem;border-radius:var(--radius-sm);font-weight:500;cursor:pointer;font-size:0.82rem;display:flex;align-items:center;gap:0.35rem;"
              >
                <LuCode style="width:0.85rem;height:0.85rem;color:var(--accent,#10b981);" />
                <span>SQL Editor</span>
              </button>
              <button
                disabled={provisioning.value || migrating.value}
                onClick$={runProvisionMigrations}
                style={`background:transparent;color:var(--text-primary);border:1px solid var(--border);padding:0.3rem 0.85rem;border-radius:var(--radius-sm);font-weight:500;cursor:pointer;font-size:0.82rem;opacity:${migrating.value ? 0.7 : 1};`}
              >
                {migrating.value ? "Migrating…" : "Provision Migration"}
              </button>
              <button
                disabled={provisioning.value}
                onClick$={runProvision}
                style={`background:var(--button-primary-bg);color:var(--button-primary-text);border:none;padding:0.3rem 0.85rem;border-radius:var(--radius-sm);font-weight:500;cursor:pointer;font-size:0.82rem;opacity:${provisioning.value ? 0.7 : 1};`}
              >
                {provisioning.value ? "Provisioning…" : "Provision All Missing"}
              </button>
            </div>
          </div>

          {/* Tables */}
          <details style="border-bottom:1px solid var(--border);">
            <summary style="list-style:none;outline:none;cursor:pointer;padding:0.875rem 1.5rem;display:flex;align-items:center;gap:0.5rem;font-weight:600;font-size:0.875rem;color:var(--text-primary);">
              <LuTable style="width:1rem;height:1rem;flex-shrink:0;" />
              Tables ({s.table_count}/{s.expected_table_count})
              {s.table_count >= s.expected_table_count 
                ? <span style="color:var(--success,#10B981);margin-left:auto;">✓</span>
                : <span style="color:var(--error,#EF4444);margin-left:auto;">— missing tables</span>}
            </summary>

            {(() => {
              const moduleOrder = [
                "core.rs", "content.rs", "crm.rs", "email.rs", "product_triggers.rs", 
                "links.rs", "pages.rs", "products.rs", "shop.rs", "shop-ops.rs", 
                "tax.rs", "accounts.rs", "payroll.rs", "chat-agent.rs", "social.rs", 
                "community.rs", "community_triggers.rs", "agents.rs", "gsc.rs", 
                "feedback.rs", "review.rs", "ads.rs", "affiliate.rs", "forms.rs", "jobs.rs"
              ];
              const foundModules = Array.from(new Set(s.tables.map(t => t.module || "Other")));
              foundModules.sort((a, b) => {
                const ai = moduleOrder.indexOf(a);
                const bi = moduleOrder.indexOf(b);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return a.localeCompare(b);
              });

              const tabs = [
                { id: "all", label: "All", count: s.tables.length },
                ...foundModules.map(m => ({
                  id: m.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
                  label: m,
                  count: s.tables.filter(t => (t.module || "Other") === m).length,
                }))
              ];

              const filteredList = s.tables.filter(t => {
                if (selectedTableTab.value === "all") return true;
                const mId = (t.module || "Other").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
                return mId === selectedTableTab.value;
              });

              return (
                <>
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1.5rem;background:var(--surface-3);border-bottom:1px solid var(--border);flex-wrap:wrap;">
                    <div style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap;">
                      {tabs.map(tab => {
                        const active = selectedTableTab.value === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick$={() => selectedTableTab.value = tab.id}
                            style={`background:${active ? 'var(--surface-1)' : 'transparent'};color:${active ? 'var(--text-primary)' : 'var(--text-secondary)'};border:1px solid ${active ? 'var(--border)' : 'transparent'};padding:0.3rem 0.65rem;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:${active ? '600' : '400'};transition:all 0.15s;`}
                          >
                            {tab.label} <span style="opacity:0.7;font-size:0.75rem;">({tab.count})</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {filteredList.length === 0 ? (
                    <p style="padding:0.75rem 1.5rem;color:var(--warning,#F59E0B);font-size:0.875rem;margin:0;">No tables found for this filter.</p>
                  ) : (
                    <div style="overflow-x:auto;">
                      <table style="width:100%;border-collapse:collapse;">
                        <thead>
                          <tr style="border-bottom:1px solid var(--border);background:var(--surface-1);">
                            <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Table Name</th>
                            <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Module</th>
                            <th style="text-align:center;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;width:5rem;">Status</th>
                            <th style="text-align:center;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Columns</th>
                            <th style="text-align:right;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Rows</th>
                            <th style="text-align:right;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredList.map((t: any) => {
                            const colOk = t.colCount !== null && t.colCount >= t.expectedCols;
                            return (
                              <tr key={t.name} class="status-table-row" style={`border-bottom:1px solid var(--border);background:${!t.exists ? "var(--surface-1)" : "transparent"};`}>
                                <td style="padding:0.4rem 1.5rem;font-family:monospace;font-size:0.82rem;">{t.name}</td>
                                <td style="padding:0.4rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);">{t.module ?? "—"}</td>
                                <td style="padding:0.4rem 1.5rem;text-align:center;">
                                  {t.exists 
                                    ? <span style="color:var(--success,#10B981);font-size:0.85rem;">✓</span>
                                    : <span style="color:var(--error,#EF4444);font-size:0.85rem;">✗ Missing</span>}
                                </td>
                                <td style={`padding:0.4rem 1.5rem;text-align:center;font-family:monospace;font-size:0.82rem;color:${colOk ? "var(--success,#10B981)" : t.exists ? "var(--error,#EF4444)" : "var(--text-secondary)"};`}>
                                  {t.colCount !== null ? `${t.colCount}/${t.expectedCols}` : "—"}
                                </td>
                                <td style="padding:0.4rem 1.5rem;text-align:right;font-family:monospace;font-size:0.82rem;">{t.rowCount ?? "—"}</td>
                                <td style="padding:0.4rem 1.5rem;text-align:right;display:flex;gap:0.4rem;justify-content:flex-end;">
                                  {t.exists && (
                                    <button
                                      type="button"
                                      title={`Query ${t.name} in SQL Editor`}
                                      onClick$={() => {
                                        ctx.sqlRunnerInitialQuery.value = `SELECT * FROM ${t.name} LIMIT 50;`;
                                        ctx.sqlRunnerOpen.value = true;
                                      }}
                                      style="background:transparent;color:var(--text-secondary);border:1px solid var(--border);padding:0.25rem 0.6rem;border-radius:4px;cursor:pointer;font-size:0.8rem;display:inline-flex;align-items:center;gap:0.3rem;"
                                    >
                                      <LuCode style="width:0.75rem;height:0.75rem;color:var(--accent,#10b981);" />
                                      <span>Query</span>
                                    </button>
                                  )}
                                  {!t.exists ? (
                                    <button
                                      disabled={recreatingTable.value === t.name}
                                      onClick$={() => runRecreateTable(t.name)}
                                      style="background:var(--button-primary-bg);color:var(--button-primary-text);border:none;padding:0.25rem 0.75rem;border-radius:4px;cursor:pointer;font-size:0.8rem;"
                                    >
                                      {recreatingTable.value === t.name ? "..." : "Create Table"}
                                    </button>
                                  ) : (
                                    <button
                                      disabled={recreatingTable.value === t.name}
                                      onClick$={() => runRecreateTable(t.name)}
                                      style="background:transparent;color:var(--text-secondary);border:1px solid var(--border);padding:0.25rem 0.75rem;border-radius:4px;cursor:pointer;font-size:0.8rem;transition:all 0.15s;"
                                      onMouseOver$={(e) => { 
                                        (e.target as HTMLElement).style.color = 'white'; 
                                        (e.target as HTMLElement).style.background = 'var(--error, #EF4444)'; 
                                        (e.target as HTMLElement).style.borderColor = 'var(--error, #EF4444)'; 
                                      }}
                                      onMouseOut$={(e) => { 
                                        (e.target as HTMLElement).style.color = 'var(--text-secondary)'; 
                                        (e.target as HTMLElement).style.background = 'transparent'; 
                                        (e.target as HTMLElement).style.borderColor = 'var(--border)'; 
                                      }}
                                    >
                                      {recreatingTable.value === t.name ? "..." : "Drop & Recreate Fresh"}
                                    </button>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              );
            })()}
          </details>

          {/* Indexes */}
          <details style="border-bottom:1px solid var(--border);">
            <summary style="list-style:none;outline:none;cursor:pointer;padding:0.875rem 1.5rem;display:flex;align-items:center;gap:0.5rem;font-weight:600;font-size:0.875rem;color:var(--text-primary);">
              <LuGitBranch style="width:1rem;height:1rem;flex-shrink:0;" />
              Indexes ({s.index_count}/{s.expected_index_count})
              {s.index_count >= s.expected_index_count
                ? <span style="color:var(--success,#10B981);margin-left:auto;">✓</span>
                : <span style="color:var(--error,#EF4444);margin-left:auto;">— missing</span>}
            </summary>
            {s.indexes.length === 0
              ? <p style="padding:0.75rem 1.5rem;color:var(--warning,#F59E0B);font-size:0.875rem;margin:0;">No indexes found.</p>
              : (() => {
                const moduleOrder = [
                  "core.rs", "content.rs", "crm.rs", "email.rs", "product_triggers.rs", 
                  "links.rs", "pages.rs", "products.rs", "shop.rs", "shop-ops.rs", 
                  "tax.rs", "accounts.rs", "payroll.rs", "chat-agent.rs", "social.rs", 
                  "community.rs", "community_triggers.rs", "agents.rs", "gsc.rs", 
                  "feedback.rs", "review.rs", "ads.rs", "affiliate.rs", "forms.rs", "jobs.rs"
                ];
                const foundModules = Array.from(new Set(s.indexes.map(idx => idx.module || "Other")));
                foundModules.sort((a, b) => {
                  const ai = moduleOrder.indexOf(a);
                  const bi = moduleOrder.indexOf(b);
                  if (ai !== -1 && bi !== -1) return ai - bi;
                  if (ai !== -1) return -1;
                  if (bi !== -1) return 1;
                  return a.localeCompare(b);
                });

                const tabs = [
                  { id: "all", label: "All", count: s.indexes.length },
                  ...foundModules.map(m => ({
                    id: m.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
                    label: m,
                    count: s.indexes.filter(idx => (idx.module || "Other") === m).length,
                  }))
                ];

                const filteredList = s.indexes.filter(idx => {
                  if (selectedIndexTab.value === "all") return true;
                  const mId = (idx.module || "Other").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
                  return mId === selectedIndexTab.value;
                });

                return (
                  <>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1.5rem;background:var(--surface-3);border-bottom:1px solid var(--border);flex-wrap:wrap;">
                      <div style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap;">
                        {tabs.map(tab => {
                          const active = selectedIndexTab.value === tab.id;
                          return (
                            <button
                              key={tab.id}
                              onClick$={() => selectedIndexTab.value = tab.id}
                              style={`background:${active ? 'var(--surface-1)' : 'transparent'};color:${active ? 'var(--text-primary)' : 'var(--text-secondary)'};border:1px solid ${active ? 'var(--border)' : 'transparent'};padding:0.3rem 0.65rem;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:${active ? '600' : '400'};transition:all 0.15s;`}
                            >
                              {tab.label} <span style="opacity:0.7;font-size:0.75rem;">({tab.count})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {filteredList.length === 0 ? (
                      <p style="padding:0.75rem 1.5rem;color:var(--warning,#F59E0B);font-size:0.875rem;margin:0;">No indexes found for this filter.</p>
                    ) : (
                      <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;">
                          <thead>
                            <tr style="border-bottom:1px solid var(--border);background:var(--surface-1);">
                              <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Index Name</th>
                              <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Module</th>
                              <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Table</th>
                              <th style="text-align:center;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;width:6rem;">Status</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredList.map(idx => (
                              <tr key={idx.name} class="status-table-row" style={`border-bottom:1px solid var(--border);background:${!idx.exists ? "var(--surface-1)" : "transparent"};`}>
                                <td style="padding:0.4rem 1.5rem;font-family:monospace;font-size:0.82rem;color:var(--text-primary);">{idx.name}</td>
                                <td style="padding:0.4rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);">{idx.module ?? "—"}</td>
                                <td style="padding:0.4rem 1.5rem;font-family:monospace;font-size:0.82rem;color:var(--text-secondary);">{idx.table}</td>
                                <td style="padding:0.4rem 1.5rem;text-align:center;">
                                  {idx.exists 
                                    ? <span style="color:var(--success,#10B981);font-size:0.85rem;">✓</span>
                                    : <span style="color:var(--error,#EF4444);font-size:0.85rem;">✗ Missing</span>}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
          </details>

          {/* Triggers */}
          <details style="border-bottom:1px solid var(--border);">
            <summary style="list-style:none;outline:none;cursor:pointer;padding:0.875rem 1.5rem;display:flex;align-items:center;gap:0.5rem;font-weight:600;font-size:0.875rem;color:var(--text-primary);">
              <LuZap style="width:1rem;height:1rem;flex-shrink:0;" />
              Triggers ({s.trigger_count}/{s.expected_trigger_count})
              {s.trigger_count >= s.expected_trigger_count
                ? <span style="color:var(--success,#10B981);margin-left:auto;">✓</span>
                : <span style="color:var(--error,#EF4444);margin-left:auto;">— missing</span>}
            </summary>
            
            {/* Filter Tabs on Left End + Create/Drop & Recreate on Right End */}
            {(() => {
              const moduleOrder = [
                "core.rs", "content.rs", "crm.rs", "email.rs", "product_triggers.rs", 
                "links.rs", "pages.rs", "products.rs", "shop.rs", "shop-ops.rs", 
                "tax.rs", "accounts.rs", "payroll.rs", "chat-agent.rs", "social.rs", 
                "community.rs", "community_triggers.rs", "agents.rs", "gsc.rs", 
                "feedback.rs", "review.rs", "ads.rs", "affiliate.rs", "forms.rs", "jobs.rs"
              ];
              const foundModules = Array.from(new Set(s.triggers.map(t => t.module || "Other")));
              
              // Sort modules according to moduleOrder, then any remaining
              foundModules.sort((a, b) => {
                const ai = moduleOrder.indexOf(a);
                const bi = moduleOrder.indexOf(b);
                if (ai !== -1 && bi !== -1) return ai - bi;
                if (ai !== -1) return -1;
                if (bi !== -1) return 1;
                return a.localeCompare(b);
              });

              const tabs = [
                { id: "all", label: "All", count: s.triggers.length },
                ...foundModules.map(m => ({
                  id: m.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
                  label: m,
                  count: s.triggers.filter(t => (t.module || "Other") === m).length,
                }))
              ];

              const currentTab = tabs.find(t => t.id === selectedTriggerTab.value) || tabs[0];
              const filteredList = s.triggers.filter(t => {
                if (selectedTriggerTab.value === "all") return true;
                const mId = (t.module || "Other").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
                return mId === selectedTriggerTab.value;
              });

              return (
                <>
                  <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1.5rem;background:var(--surface-3);border-bottom:1px solid var(--border);flex-wrap:wrap;">
                    {/* Left: Filter Tabs */}
                    <div style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap;">
                      {tabs.map(tab => {
                        const active = selectedTriggerTab.value === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick$={() => selectedTriggerTab.value = tab.id}
                            style={`background:${active ? 'var(--surface-1)' : 'transparent'};color:${active ? 'var(--text-primary)' : 'var(--text-secondary)'};border:1px solid ${active ? 'var(--border)' : 'transparent'};padding:0.3rem 0.65rem;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:${active ? '600' : '400'};transition:all 0.15s;`}
                          >
                            {tab.label} <span style="opacity:0.7;font-size:0.75rem;">({tab.count})</span>
                          </button>
                        );
                      })}
                    </div>

                    {/* Right: Drop & Recreate Action Button */}
                    <button
                      disabled={recreatingTriggerGroup.value !== null}
                      onClick$={() => runRecreateTriggers(selectedTriggerTab.value === "all" ? undefined : selectedTriggerTab.value)}
                      style={`background:var(--button-primary-bg);color:var(--button-primary-text);border:none;padding:0.35rem 0.9rem;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:500;display:flex;align-items:center;gap:0.4rem;opacity:${recreatingTriggerGroup.value ? 0.7 : 1};`}
                    >
                      <LuZap style="width:0.85rem;height:0.85rem;" />
                      <span>
                        {recreatingTriggerGroup.value !== null
                          ? "Recreating…"
                          : `Drop & Recreate (${currentTab.label})`}
                      </span>
                    </button>
                  </div>

                  {filteredList.length === 0
                    ? <p style="padding:0.75rem 1.5rem;color:var(--warning,#F59E0B);font-size:0.875rem;margin:0;">No triggers found for this filter.</p>
                    : (
                      <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;">
                          <thead>
                            <tr style="border-bottom:1px solid var(--border);background:var(--surface-1);">
                              <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Trigger Name</th>
                              <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Module</th>
                              <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Table</th>
                              <th style="text-align:center;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;width:5rem;">Status</th>
                              <th style="text-align:right;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Action</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredList.map(trg => (
                              <tr key={trg.name} class="status-table-row" style={`border-bottom:1px solid var(--border);background:${!trg.exists ? "var(--surface-1)" : "transparent"};`}>
                                <td style="padding:0.4rem 1.5rem;font-family:monospace;font-size:0.82rem;color:var(--text-primary);">{trg.name}</td>
                                <td style="padding:0.4rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);">{trg.module ?? "—"}</td>
                                <td style="padding:0.4rem 1.5rem;font-family:monospace;font-size:0.82rem;color:var(--text-secondary);">{trg.table}</td>
                                <td style="padding:0.4rem 1.5rem;text-align:center;">
                                  {trg.exists 
                                    ? <span style="color:var(--success,#10B981);font-size:0.85rem;">✓</span>
                                    : <span style="color:var(--error,#EF4444);font-size:0.85rem;">✗ Missing</span>}
                                </td>
                                <td style="padding:0.4rem 1.5rem;text-align:right;">
                                  <button
                                    disabled={recreatingSingleTrg.value === trg.name}
                                    onClick$={() => runRecreateSingleTrigger(trg.name)}
                                    style="background:transparent;color:var(--text-secondary);border:1px solid var(--border);padding:0.25rem 0.75rem;border-radius:4px;cursor:pointer;font-size:0.8rem;transition:all 0.15s;"
                                    onMouseOver$={(e) => { 
                                      (e.target as HTMLElement).style.color = 'white'; 
                                      (e.target as HTMLElement).style.background = 'var(--primary, #3B82F6)'; 
                                      (e.target as HTMLElement).style.borderColor = 'var(--primary, #3B82F6)'; 
                                    }}
                                    onMouseOut$={(e) => { 
                                      (e.target as HTMLElement).style.color = 'var(--text-secondary)'; 
                                      (e.target as HTMLElement).style.background = 'transparent'; 
                                      (e.target as HTMLElement).style.borderColor = 'var(--border)'; 
                                    }}
                                  >
                                    {recreatingSingleTrg.value === trg.name ? "..." : (trg.exists ? "Recreate" : "Create")}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                </>
              );
            })()}
          </details>

          {/* Views */}
          <details>
            <summary style="list-style:none;outline:none;cursor:pointer;padding:0.875rem 1.5rem;display:flex;align-items:center;gap:0.5rem;font-weight:600;font-size:0.875rem;color:var(--text-primary);">
              <LuEye style="width:1rem;height:1rem;flex-shrink:0;" />
              Views ({s.view_count}/{s.expected_view_count})
              {s.view_count >= s.expected_view_count
                ? <span style="color:var(--success,#10B981);margin-left:auto;">✓</span>
                : <span style="color:var(--error,#EF4444);margin-left:auto;">— missing</span>}
            </summary>
            {s.views.length === 0
              ? <p style="padding:0.75rem 1.5rem;color:var(--warning,#F59E0B);font-size:0.875rem;margin:0;">No views found.</p>
              : (() => {
                const foundModules = Array.from(new Set(s.views.map(v => v.module || "Other")));
                const tabs = [
                  { id: "all", label: "All", count: s.views.length },
                  ...foundModules.map(m => ({
                    id: m.toLowerCase().replace(/[^a-z0-9_-]/g, "_"),
                    label: m,
                    count: s.views.filter(v => (v.module || "Other") === m).length,
                  }))
                ];

                const filteredList = s.views.filter(v => {
                  if (selectedViewTab.value === "all") return true;
                  const mId = (v.module || "Other").toLowerCase().replace(/[^a-z0-9_-]/g, "_");
                  return mId === selectedViewTab.value;
                });

                return (
                  <>
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:0.75rem;padding:0.75rem 1.5rem;background:var(--surface-3);border-bottom:1px solid var(--border);flex-wrap:wrap;">
                      <div style="display:flex;gap:0.35rem;align-items:center;flex-wrap:wrap;">
                        {tabs.map(tab => {
                          const active = selectedViewTab.value === tab.id;
                          return (
                            <button
                              key={tab.id}
                              onClick$={() => selectedViewTab.value = tab.id}
                              style={`background:${active ? 'var(--surface-1)' : 'transparent'};color:${active ? 'var(--text-primary)' : 'var(--text-secondary)'};border:1px solid ${active ? 'var(--border)' : 'transparent'};padding:0.3rem 0.65rem;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:${active ? '600' : '400'};transition:all 0.15s;`}
                            >
                              {tab.label} <span style="opacity:0.7;font-size:0.75rem;">({tab.count})</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {filteredList.length === 0 ? (
                      <p style="padding:0.75rem 1.5rem;color:var(--warning,#F59E0B);font-size:0.875rem;margin:0;">No views found for this filter.</p>
                    ) : (
                      <div style="overflow-x:auto;">
                        <table style="width:100%;border-collapse:collapse;">
                          <thead>
                            <tr style="border-bottom:1px solid var(--border);background:var(--surface-1);">
                              <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">View Name</th>
                              <th style="text-align:left;padding:0.5rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);font-weight:500;">Module</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredList.map(v => (
                              <tr key={v.name} style="border-bottom:1px solid var(--border);">
                                <td style="padding:0.4rem 1.5rem;font-family:monospace;font-size:0.82rem;color:var(--success,#10B981);">{v.name}</td>
                                <td style="padding:0.4rem 1.5rem;font-size:0.8rem;color:var(--text-secondary);">{v.module ?? "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </>
                );
              })()}
          </details>

        </div>
      )}
    </>
  );
});

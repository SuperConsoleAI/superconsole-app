import { component$, $, useSignal, useStylesScoped$, useVisibleTask$ } from "@builder.io/qwik";
import { type DocumentHead, useLocation, Link, type StaticGenerateHandler } from "@builder.io/qwik-city";

export const onStaticGenerate: StaticGenerateHandler = () => {
  return {
    params: [
      { id: "1" },
      { id: "2" },
      { id: "3" },
      { id: "new" },
      { id: "default" },
    ],
  };
};
import { invoke } from "@tauri-apps/api/core";

import { AddDeals } from "~/components/crm/AddDeals";
import { AddTask } from "~/components/crm/AddTask";
import { AddNote } from "~/components/crm/AddNote";
import { AddActivity } from "~/components/crm/AddActivity";
import { ContactDetails } from "~/components/crm/ContactDetails";
import { LuClock, LuKanban, LuFileText, LuCheckSquare, LuPlus, LuUser } from "@qwikest/icons/lucide";
import type { ContactRow, ActivityRow, DealRow, TaskRow, NoteRow, GroupRow } from "~/lib/types";

const TYPE_META: Record<string, { label: string; color: string; bg: string }> = {
  note: { label: "Note", color: "#6366f1", bg: "rgba(99,102,241,0.12)" },
  in_person: { label: "In Person", color: "#10b981", bg: "rgba(16,185,129,0.12)" },
  email: { label: "Email", color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  call: { label: "Call", color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  meeting: { label: "Meeting", color: "#8b5cf6", bg: "rgba(139,92,246,0.12)" },
  task_done: { label: "Task Done", color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  purchase: { label: "Purchase", color: "#ec4899", bg: "rgba(236,72,153,0.12)" },
  dm: { label: "DM", color: "#06b6d4", bg: "rgba(6,182,212,0.12)" },
  agent_action: { label: "Agent", color: "#f97316", bg: "rgba(249,115,22,0.12)" },
};

const CONTACT_DETAIL_STYLES = `
  .detail-main {
    flex: 1;
    width: 100%;
    box-sizing: border-box;
    display: flex;
    gap: 2rem;
    align-items: flex-start;
  }
  @media (max-width: 1024px) {
    .detail-main {
      flex-direction: column;
    }
    .left-panel { width: 100% !important; }
  }
  @media (max-width: 768px) {
    .detail-main {
    }
  }
  .left-panel {
    width: 320px;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    flex-shrink: 0;
  }
  .card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    padding: 1rem;
  }
  .contact-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.75rem;
  }
  .big-avatar {
    width: 5rem;
    height: 5rem;
    border-radius: 50%;
    background: var(--surface);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 600;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    object-fit: cover;
  }
  .name {
    font-size: 1.25rem;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }
  .title-company {
    font-size: 0.875rem;
    color: var(--text-secondary);
  }
  .score-bar-bg {
    width: 100%;
    height: 8px;
    background: var(--surface);
    border-radius: 4px;
    overflow: hidden;
    margin-top: 0.5rem;
  }
  .score-bar-fill {
    height: 100%;
    background: var(--accent);
  }
  .meta-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--border);
  }
  .meta-row {
    display: flex;
    justify-content: space-between;
    font-size: 0.8125rem;
  }
  .meta-label { color: var(--text-secondary); }
  .meta-value { color: var(--text-primary); font-weight: 500; text-align: right; max-width: 60%; word-break: break-all; }
  
  .right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
  }
  .tabs-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    width: 100%;
  }
  @media (max-width: 768px) {
    .tabs-row {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .tab-label {
      display: none;
    }
    .tabs {
      width: 100%;
      justify-content: space-between;
    }
    .tab-btn {
      flex: 1;
      justify-content: center;
      padding: 0 0.5rem;
    }
  }
  .tabs {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-3);
    padding: 0.25rem;
    border-radius: 0.5rem;
    height: 2.5rem;
    align-items: center;
    width: fit-content;
    max-width: 100%;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }
  .tabs::-webkit-scrollbar { display: none; }
  .tab-btn {
    display: flex;
    align-items: center;
    height: 100%;
    box-sizing: border-box;
    padding: 0 1rem;
    border-radius: 0.375rem;
    font-size: 0.8125rem;
    font-weight: 500;
    text-transform: capitalize;
    color: var(--text-secondary);
    background: transparent;
    border: none;
    cursor: pointer;
    transition: all 0.15s;
  }
  .tab-btn:hover { color: var(--text-primary); }
  .tab-btn.active {
    background: var(--surface-2);
    color: var(--text-primary);
    box-shadow: 0 1px 3px rgba(0,0,0,0.1);
  }
  .btn-add-tab {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.75rem 1rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    color: var(--text-secondary);
    border: 1px solid var(--border);
    background: transparent;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    white-space: nowrap;
    justify-content: center;
  }
  .btn-add-tab:hover {
    background: var(--surface-3);
    color: var(--text-primary);
  }
  .outreach-header {
    display: flex;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .outreach-btn {
    flex: 1;
    padding: 0.5rem;
    text-align: center;
    border: 1px solid var(--border);
    background: var(--surface-3);
    color: var(--text-secondary);
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.875rem;
    font-weight: 500;
    transition: all 0.15s;
  }
  .outreach-btn.active {
    background: var(--text-primary);
    color: var(--surface-1);
    border-color: var(--text-primary);
  }
  .outreach-btn:hover:not(.active) { color: var(--text-primary); }
  .outreach-box {
    width: 100%;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    min-height: 100px;
    padding: 1rem;
    font-size: 0.875rem;
    color: var(--text-primary);
    resize: vertical;
    outline: none;
    box-sizing: border-box;
  }
  .btn-send {
    margin-top: 1rem;
    background: var(--text-primary);
    color: var(--surface-1);
    border: none;
    padding: 0.5rem 1rem;
    border-radius: 0.375rem;
    font-weight: 500;
    cursor: pointer;
    float: right;
  }
  .timeline-item {
    display: flex;
    gap: 1rem;
    padding-bottom: 1.5rem;
    position: relative;
  }
  .timeline-item:not(:last-child)::before {
    content: '';
    position: absolute;
    left: 0.5rem;
    top: 1.5rem;
    bottom: 0;
    width: 2px;
    background: var(--border);
  }
  .timeline-dot {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: var(--accent);
    flex-shrink: 0;
    position: relative;
    z-index: 2;
    margin-top: 0.25rem;
  }
  .timeline-content {
    flex: 1;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 1rem;
    font-size: 0.875rem;
  }
  .timeline-date {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.25rem;
  }
  .timeline-title {
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-wrap: wrap;
  }
  .type-badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }
`;

export default component$(() => {
  useStylesScoped$(CONTACT_DETAIL_STYLES);
  
  const loc = useLocation();

  const contact = useSignal<ContactRow | null>(null);
  const activities = useSignal<ActivityRow[]>([]);
  const deals = useSignal<DealRow[]>([]);
  const tasks = useSignal<TaskRow[]>([]);
  const notes = useSignal<NoteRow[]>([]);
  const groups = useSignal<GroupRow[]>([]);
  const loading = useSignal(true);

  const activeTab = useSignal("timeline");
  const activeOutreach = useSignal("email");

  const addDealOpen = useSignal(false);
  const addTaskOpen = useSignal(false);
  const addNoteOpen = useSignal(false);
  const addActOpen = useSignal(false);
  const editOpen = useSignal(false);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    track(() => loc.url.searchParams.get("id"));
    track(() => loc.params.id);

    // Primary: sessionStorage (set by navigation caller before nav()) — reliable across all build modes
    // Fallback: window.location.search, then loc.url.searchParams, then loc.params.id
    let cid = "";
    if (typeof window !== "undefined") {
      const stored = window.sessionStorage.getItem("__bk_view_contact_id");
      if (stored) {
        cid = stored;
        window.sessionStorage.removeItem("__bk_view_contact_id");
      } else {
        cid = new URLSearchParams(window.location.search).get("id")
          || loc.url.searchParams.get("id")
          || (loc.params.id && !(["detail", "default", "new"].includes(loc.params.id)) ? loc.params.id : "")
          || "";
      }
    }
    cid = cid.trim();

    loading.value = true;
    try {
      let c: ContactRow | null = null;

      if (cid && cid !== "new") {
        c = await invoke<ContactRow>('get_contact', { contactId: cid }).catch(() => null);
      }
      // No fallback: if no valid cid, contact view stays empty

      if (c) {
        contact.value = c;
        const targetId = c.id;
        const [actRes, dealRes, taskRes, noteRes, groupRes] = await Promise.all([
          invoke<ActivityRow[]>('list_activities', { contactId: targetId, limit: 50 }).catch(() => []),
          invoke<DealRow[]>('list_deals', { contactId: targetId }).catch(() => []),
          invoke<TaskRow[]>('list_tasks', { contactId: targetId }).catch(() => []),
          invoke<NoteRow[]>('list_notes', { contactId: targetId }).catch(() => []),
          invoke<GroupRow[]>('list_crm_groups').catch(() => [])
        ]);

        activities.value = actRes || [];
        deals.value = dealRes || [];
        tasks.value = taskRes || [];
        notes.value = noteRes || [];
        groups.value = groupRes || [];
      }
    } catch (err) {
      console.error("Failed to load contact details:", err);
    } finally {
      loading.value = false;
    }
  });

  if (loading.value) {
    return <div style="display:flex;min-height:100vh;align-items:center;justify-content:center;">Loading...</div>;
  }

  const c = contact.value;
  if (!c) {
    return (
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;gap:1.5rem;padding:2rem;color:var(--text-secondary);text-align:center;">
        <div style="width:3.5rem;height:3.5rem;border-radius:50%;background:var(--surface-3);display:flex;align-items:center;justify-content:center;color:var(--text-primary);">
          <LuUser style="width:1.75rem;height:1.75rem;" />
        </div>
        <div>
          <h2 style="font-size:1.25rem;font-weight:600;color:var(--text-primary);margin:0 0 0.5rem 0;">No Contact Selected</h2>
          <p style="font-size:0.875rem;margin:0;">Select a contact from your CRM list to view full timeline and details.</p>
        </div>
        <Link href="/dashboard/crm/" class="btn-primary" style="padding:0.625rem 1.25rem;border-radius:0.5rem;text-decoration:none;font-weight:500;display:inline-block;">
          ← Back to Contacts
        </Link>
      </div>
    );
  }

  const fallbackInitial = (c.first_name || '?').charAt(0).toUpperCase();

  return (
    <div style="display: flex; min-height: 100vh; background: var(--background);">

      <div class="detail-main">


        <div style="display:flex;gap:2rem;width:100%;">
          {/* LEFT PANEL */}
          <div class="left-panel">
            <div class="card contact-header">
              {c.avatar_url ? (
                <img src={c.avatar_url} alt="" class="big-avatar" width={80} height={80} />
              ) : (
                <div class="big-avatar">{fallbackInitial}</div>
              )}
              <div>
                <h2 class="name">{c.first_name} {c.last_name || ''}</h2>
                <div class="title-company">
                  {c.job_title ? c.job_title + (c.company ? ` at ${c.company}` : '') : (c.company || 'Unknown Company')}
                </div>
                <div style="margin-top: 0.75rem; display: flex; justify-content: center;">
                  <button class="btn-add-tab" style="padding: 0.25rem 0.75rem; font-size: 0.75rem;" onClick$={() => editOpen.value = true}>
                    Edit Contact
                  </button>
                </div>
              </div>

              <div style="width:100%;text-align:left;margin-top:0.5rem;">
                <div style="display:flex;justify-content:space-between;font-size:0.75rem;color:var(--text-secondary);">
                  <span>Lead Score</span>
                  <span style="font-weight:600;color:var(--accent);">{c.lead_score || 0}/100</span>
                </div>
                <div class="score-bar-bg">
                  <div class="score-bar-fill" style={`width:${Math.min(100, Math.max(0, c.lead_score || 0))}%`}></div>
                </div>
              </div>

              <div style="display:flex;gap:0.5rem;flex-wrap:wrap;justify-content:center;margin-top:0.5rem;">
                <span style="background:var(--surface);padding:0.25rem 0.5rem;border-radius:1rem;font-size:0.75rem;border:1px solid var(--border);">
                  {c.status || 'Lead'}
                </span>
                <span style="background:var(--surface);padding:0.25rem 0.5rem;border-radius:1rem;font-size:0.75rem;border:1px solid var(--border);">
                  ICP: {c.icp_match || 'Unrated'}
                </span>
                <span style="background:var(--surface);padding:0.25rem 0.5rem;border-radius:1rem;font-size:0.75rem;border:1px solid var(--border);">
                  {c.outreach_status || 'No Outreach'}
                </span>
              </div>
            </div>

            <div class="card meta-group">
              <h3 style="font-size:0.875rem;font-weight:600;color:var(--text-primary);margin:0 0 0.5rem 0;">Identity &amp; Contact</h3>
              <div class="meta-row"><span class="meta-label">Email</span><span class="meta-value">{c.email || '—'}</span></div>
              <div class="meta-row"><span class="meta-label">Phone</span><span class="meta-value">{c.phone || '—'}</span></div>
              <div class="meta-row"><span class="meta-label">Platform</span><span class="meta-value">{c.platform ? `${c.platform} / ${c.platform_username || ''}` : '—'}</span></div>
              <div class="meta-row"><span class="meta-label">Website</span><span class="meta-value">{c.website ? <a href={c.website} target="_blank" style="color:var(--accent);">Link</a> : '—'}</span></div>
              <div class="meta-row"><span class="meta-label">Location</span><span class="meta-value">{[c.city, c.country].filter(Boolean).join(', ') || '—'}</span></div>
            </div>

            <div class="card meta-group">
              <h3 style="font-size:0.875rem;font-weight:600;color:var(--text-primary);margin:0 0 0.5rem 0;">Sales &amp; Agent State</h3>
              <div class="meta-row"><span class="meta-label">Urgency</span><span class="meta-value">{c.urgency || '—'}</span></div>
              <div class="meta-row"><span class="meta-label">Source</span><span class="meta-value">{c.source || '—'}</span></div>
              <div class="meta-row"><span class="meta-label">Spent</span><span class="meta-value">${((c.total_spent_cents || 0) / 100).toFixed(2)}</span></div>
              <div class="meta-row"><span class="meta-label">Purchases</span><span class="meta-value">{c.total_purchases || 0}</span></div>
              <div class="meta-row">
                <span class="meta-label">Agent Status</span>
                <span class="meta-value">
                  <span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:var(--accent);margin-right:4px;"></span>
                  {c.agent_status || 'Idle'}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div class="right-panel">

            {/* Quick Outreach */}
            <div class="card">
              <h3 style="font-size:1rem;font-weight:600;margin:0 0 1rem 0;">Quick Outreach</h3>
              <div class="outreach-header">
                <button class={`outreach-btn ${activeOutreach.value === 'email' ? 'active' : ''}`} onClick$={() => activeOutreach.value = 'email'}>Email Draft</button>
                <button class={`outreach-btn ${activeOutreach.value === 'dm' ? 'active' : ''}`} onClick$={() => activeOutreach.value = 'dm'}>Social DM</button>
              </div>
              <textarea
                class="outreach-box"
                placeholder={activeOutreach.value === 'email' ? "Type your email subject and body here..." : "Draft a quick DM message..."}
              ></textarea>
              <div style="overflow:hidden;">
                <button class="btn-send" onClick$={() => alert(`Sending ${activeOutreach.value} (Mock)`)}>
                  Send {activeOutreach.value === 'email' ? 'Email' : 'Message'}
                </button>
              </div>
            </div>

            {/* Tabs row — tabs on left, Add button on right */}
            <div class="tabs-row">
              <div class="tabs">
                <button class={`tab-btn ${activeTab.value === 'timeline' ? 'active' : ''}`} onClick$={() => activeTab.value = 'timeline'}>
                  <span style="display: flex; align-items: center; gap: 0.375rem;">
                    <LuClock style="width: 1rem; height: 1rem;" /><span class="tab-label">Timeline </span><span>({activities.value.length})</span>
                  </span>
                </button>
                <button class={`tab-btn ${activeTab.value === 'deals' ? 'active' : ''}`} onClick$={() => activeTab.value = 'deals'}>
                  <span style="display: flex; align-items: center; gap: 0.375rem;">
                    <LuKanban style="width: 1rem; height: 1rem;" /><span class="tab-label">Deals </span><span>({deals.value.length})</span>
                  </span>
                </button>
                <button class={`tab-btn ${activeTab.value === 'notes' ? 'active' : ''}`} onClick$={() => activeTab.value = 'notes'}>
                  <span style="display: flex; align-items: center; gap: 0.375rem;">
                    <LuFileText style="width: 1rem; height: 1rem;" /><span class="tab-label">Notes </span><span>({notes.value.length})</span>
                  </span>
                </button>
                <button class={`tab-btn ${activeTab.value === 'tasks' ? 'active' : ''}`} onClick$={() => activeTab.value = 'tasks'}>
                  <span style="display: flex; align-items: center; gap: 0.375rem;">
                    <LuCheckSquare style="width: 1rem; height: 1rem;" /><span class="tab-label">Tasks </span><span>({tasks.value.length})</span>
                  </span>
                </button>
              </div>

              {/* Per-tab Add button */}
              {activeTab.value === 'timeline' && (
                <button class="btn-add-tab" onClick$={() => addActOpen.value = true}>
                  <LuPlus style="width: 0.875rem; height: 0.875rem;" /> Add
                </button>
              )}
              {activeTab.value === 'deals' && (
                <button class="btn-add-tab" onClick$={() => addDealOpen.value = true}>
                  <LuPlus style="width: 0.875rem; height: 0.875rem;" /> Add
                </button>
              )}
              {activeTab.value === 'notes' && (
                <button class="btn-add-tab" onClick$={() => addNoteOpen.value = true}>
                  <LuPlus style="width: 0.875rem; height: 0.875rem;" /> Add
                </button>
              )}
              {activeTab.value === 'tasks' && (
                <button class="btn-add-tab" onClick$={() => addTaskOpen.value = true}>
                  <LuPlus style="width: 0.875rem; height: 0.875rem;" /> Add
                </button>
              )}
            </div>

            {/* ── Timeline ── */}
            {activeTab.value === 'timeline' && (
              <div class="card" style="min-height:300px;">
                {activities.value.length === 0 ? (
                  <div style="text-align:center;padding:3rem;color:var(--text-secondary);">No timeline activity yet.</div>
                ) : (
                  activities.value.map((act: ActivityRow) => {
                    const meta = TYPE_META[act.activity_type] ?? { label: act.activity_type, color: "var(--text-secondary)", bg: "var(--surface-3)" };
                    return (
                      <div class="timeline-item" key={act.id}>
                        <div class="timeline-dot" style={`background: ${meta.color};`}></div>
                        <div class="timeline-content">
                          <div class="timeline-date">{new Date((act.occurred_at as number) * 1000).toLocaleString()}</div>
                          <div class="timeline-title">
                            <span
                              class="type-badge"
                              style={`color: ${meta.color}; background: ${meta.bg};`}
                            >
                              {meta.label}
                            </span>
                            {act.subject || 'Activity logged'}
                          </div>
                          {act.body && <div style="color:var(--text-secondary);margin-top:0.5rem;">{act.body}</div>}
                          {act.outcome && (
                            <div style="margin-top:0.375rem;font-size:0.75rem;color:var(--text-secondary);">
                              Outcome: <strong style="color:var(--text-primary);">{act.outcome}</strong>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* ── Deals ── */}
            {activeTab.value === 'deals' && (
              <div class="card" style="min-height:300px;">
                {deals.value.length === 0 ? (
                  <div style="text-align:center;padding:3rem;color:var(--text-secondary);">No deals associated yet.</div>
                ) : (
                  deals.value.map((deal: DealRow) => (
                    <div key={deal.id} style="padding:1rem;border:1px solid var(--border);border-radius:0.5rem;margin-bottom:1rem;">
                      <div style="font-weight:600;">{deal.title} - ${(deal.value_cents || 0) / 100}</div>
                      <div style="font-size:0.875rem;color:var(--text-secondary);margin-top:0.25rem;">Stage: {deal.stage} - Probability: {deal.probability}%</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Notes ── */}
            {activeTab.value === 'notes' && (
              <div class="card" style="min-height:300px;">
                {notes.value.length === 0 ? (
                  <div style="text-align:center;padding:3rem;color:var(--text-secondary);">No notes found.</div>
                ) : (
                  notes.value.map((note: NoteRow) => (
                    <div key={note.id} style="padding:1rem;border:1px solid var(--border);border-radius:0.5rem;margin-bottom:1rem;background:var(--surface);">
                      <div style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:0.5rem;">{new Date((note.created_at as number) * 1000).toLocaleString()}</div>
                      <div style="white-space:pre-wrap;font-size:0.875rem;">{note.body}</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* ── Tasks ── */}
            {activeTab.value === 'tasks' && (
              <div class="card" style="min-height:300px;">
                {tasks.value.length === 0 ? (
                  <div style="text-align:center;padding:3rem;color:var(--text-secondary);">No tasks open.</div>
                ) : (
                  tasks.value.map((task: TaskRow) => (
                    <div key={task.id} style="padding:1rem;border:1px solid var(--border);border-radius:0.5rem;margin-bottom:1rem;display:flex;align-items:center;gap:1rem;">
                      <input type="checkbox" checked={task.status === 'done'} disabled />
                      <div style="flex:1;">
                        <div style={`font-weight:600;font-size:0.875rem;text-decoration:${task.status === 'done' ? 'line-through' : 'none'};`}>{task.title}</div>
                        <div style="font-size:0.75rem;color:var(--text-secondary);">Due: {task.due_at ? new Date((task.due_at as number) * 1000).toLocaleDateString() : 'N/A'} - Priority: {task.priority}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      <AddActivity
        isOpen={addActOpen.value}
        onClose$={$(() => addActOpen.value = false)}
        contactId={c.id}
      />
      <AddDeals
        isOpen={addDealOpen.value}
        onClose$={$(() => addDealOpen.value = false)}
        contacts={[c]}
      />
      <AddNote
        isOpen={addNoteOpen.value}
        onClose$={$(() => addNoteOpen.value = false)}
        contactId={c.id}
      />
      <AddTask
        isOpen={addTaskOpen.value}
        onClose$={$(() => addTaskOpen.value = false)}
        contacts={[c]}
      />
      <ContactDetails
        isOpen={editOpen.value}
        onClose$={$(() => editOpen.value = false)}
        contact={c}
        groups={groups.value}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Contact Detail - CRM",
};

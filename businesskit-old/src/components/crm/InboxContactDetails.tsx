import { component$, useSignal, useVisibleTask$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import type { ContactRow, DealRow, TaskRow, ActivityRow } from "~/lib/types";

export const InboxContactDetails = component$((props: {
  contact: ContactRow | null;
  onClose$?: PropFunction<() => void>;
}) => {
  const c = props.contact;
  const tasks = useSignal<TaskRow[]>([]);
  const deals = useSignal<DealRow[]>([]);
  const pending = useSignal<ActivityRow[]>([]);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const cid = track(() => c?.id);
    if (!cid) return;
    try {
      const [dealsRes, tasksRes, activitiesRes] = await Promise.all([
        invoke<DealRow[]>('list_deals', { contactId: cid }),
        invoke<TaskRow[]>('list_tasks', { contactId: cid, status: null }),
        invoke<ActivityRow[]>('list_activities', { contactId: cid, limit: 100 }),
      ]);
      
      deals.value = dealsRes || [];
      tasks.value = tasksRes || [];
      pending.value = (activitiesRes || []).filter(a => a.approval_status === 'pending_approval');
    } catch (err) {
      console.error("Failed to load contact details", err);
    }
  });

  useStylesScoped$(`
    @media (min-width: 1025px) {
      .close-btn { display: none !important; }
    }
  `);

  if (!c) return null;

  return (
    <div style="width:100%;height:100%;flex-shrink:0;background:var(--surface-3);display:flex;flex-direction:column;overflow-y:auto;border-radius:0.75rem;border:1px solid var(--border);position:relative;">
      {props.onClose$ && (
        <button 
          type="button"
          class="close-btn"
          onClick$={props.onClose$} 
          style="position:absolute;top:0.75rem;right:0.75rem;background:transparent;border:none;font-size:1.5rem;color:var(--text-secondary);cursor:pointer;line-height:1;"
        >
          &times;
        </button>
      )}
      <div style="padding:1.5rem;display:flex;flex-direction:column;align-items:center;border-bottom:1px solid var(--border);">
        {c.avatar_url ? (
          <img src={c.avatar_url} alt="" width={64} height={64} style="border-radius:50%;object-fit:cover;margin-bottom:1rem;" />
        ) : (
          <div style="width:64px;height:64px;border-radius:50%;background:var(--surface);display:flex;align-items:center;justify-content:center;font-size:1.5rem;font-weight:600;color:var(--text-secondary);border:1px solid var(--border);margin-bottom:1rem;">
            {(c.first_name || "?").charAt(0).toUpperCase()}
          </div>
        )}
        <div style="font-size:1.125rem;font-weight:600;color:var(--text-primary);text-align:center;">
          {c.first_name} {c.last_name || ""}
        </div>
        <div style="font-size:0.875rem;color:var(--text-secondary);margin-top:0.25rem;">
          {c.job_title && c.company ? `${c.job_title} at ${c.company}` : (c.job_title || c.company || "No title")}
        </div>
      </div>

      <div style="padding:1.5rem;display:flex;flex-direction:column;gap:1.25rem;">
        <div>
          <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;margin-bottom:0.5rem;">Contact Info</div>
          {c.email && <div style="font-size:0.875rem;color:var(--text-primary);margin-bottom:0.25rem;">📧 {c.email}</div>}
          {c.phone && <div style="font-size:0.875rem;color:var(--text-primary);margin-bottom:0.25rem;">📞 {c.phone}</div>}
          {c.platform && <div style="font-size:0.875rem;color:var(--text-primary);">📱 {c.platform} {c.platform_username ? `@${c.platform_username}` : ""}</div>}
        </div>

        <div>
          <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem;">Deal State</div>
          <div style="font-size:0.875rem;color:var(--text-primary);display:flex;justify-content:space-between;margin-bottom:0.25rem;">
            <span style="color:var(--text-secondary);">Status</span>
            <span style="font-weight:500;text-transform:capitalize;">{c.status || "Lead"}</span>
          </div>
          <div style="font-size:0.875rem;color:var(--text-primary);display:flex;justify-content:space-between;margin-bottom:0.25rem;">
            <span style="color:var(--text-secondary);">Outreach</span>
            <span style="font-weight:500;text-transform:capitalize;">{(c.outreach_status || "New").replace("_", " ")}</span>
          </div>
        </div>

        {c.notes && (
          <div>
            <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem;">Notes</div>
            <div style="font-size:0.8125rem;color:var(--text-primary);line-height:1.5;background:var(--surface-1);padding:0.75rem;border-radius:0.5rem;border:1px solid var(--border);">
              {c.notes}
            </div>
          </div>
        )}

        {deals.value.length > 0 && (
          <div>
            <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem;">Deals</div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              {deals.value.map(d => (
                <div key={d.id} style="font-size:0.8125rem;color:var(--text-primary);display:flex;justify-content:space-between;background:var(--surface-1);padding:0.5rem;border-radius:0.5rem;border:1px solid var(--border);">
                  <span style="font-weight:400;">{d.title}</span>
                  <span style="color:var(--text-secondary);text-transform:capitalize;font-weight:400;">{d.stage}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {tasks.value.length > 0 && (
          <div>
            <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem;">Tasks</div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              {tasks.value.map(t => (
                <div key={t.id} style="font-size:0.8125rem;color:var(--text-primary);display:flex;justify-content:space-between;background:var(--surface-1);padding:0.5rem;border-radius:0.5rem;border:1px solid var(--border);">
                  <span style="font-weight:400;">{t.title}</span>
                  <span style="color:var(--text-secondary);text-transform:capitalize;font-weight:400;">{t.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {pending.value.length > 0 && (
          <div>
            <div style="font-size:0.75rem;font-weight:600;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.04em;margin-bottom:0.5rem;">Pending Approvals</div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              {pending.value.map(p => (
                <div key={p.id} style="font-size:0.75rem;font-weight:400;color:var(--text-primary);display:flex;flex-direction:column;background:var(--surface-1);padding:0.5rem;border-radius:0.5rem;border:1px solid var(--border);">
                  <div style="display:flex;justify-content:space-between;margin-bottom:0.125rem;">
                    <span style="text-transform:capitalize;">🤖 {p.activity_type?.replace('_', ' ')}</span>
                  </div>
                  <div style="color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                    {p.body || p.subject || "Draft"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

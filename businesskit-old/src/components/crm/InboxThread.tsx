import { component$, useSignal, useVisibleTask$, useStylesScoped$, type PropFunction, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";
import { InboxMessageBubble } from "./InboxMessageBubble";
import { InboxCompose } from "./InboxCompose";
import { AddActivity } from "~/components/crm/AddActivity";
import { LuInfo, LuArrowLeft } from "@qwikest/icons/lucide";
import type { ContactRow, ActivityRow } from "~/lib/types";
import { useNavigate } from "@builder.io/qwik-city";

export const InboxThread = component$((props: {
  contact: ContactRow;
  profileName?: string | null;
  onToggleDetails$?: PropFunction<() => void>;
  onBack$?: PropFunction<() => void>;
}) => {
  const activities = useSignal<ActivityRow[]>([]);
  const loading = useSignal(true);
  const error = useSignal<string | null>(null);
  const isAddModalOpen = useSignal(false);
  const nav = useNavigate();

  useStylesScoped$(`
    .btn-add-log {
      font-size: 0.75rem; font-weight: 600; color: var(--text-primary); text-decoration: none;
      white-space: nowrap; padding: 0.4rem 0.875rem; border: 1px solid var(--border);
      border-radius: 2rem; background: transparent; cursor: pointer; transition: background 0.15s;
      text-transform: capitalize;
    }
    .btn-add-log:hover {
      background: var(--surface-3);
    }
    .mobile-back-btn {
      display: none;
      background: transparent; border: none; font-size: 1.25rem; color: var(--text-secondary);
      cursor: pointer; padding: 0.25rem; margin-right: 0.5rem;
    }
    .info-toggle-btn {
      display: none;
      background: transparent; border: none; font-size: 1.25rem; color: var(--text-secondary);
      cursor: pointer; padding: 0.25rem; margin-left: 0.5rem;
    }
    @media (max-width: 1024px) {
      .info-toggle-btn { display: flex; align-items: center; justify-content: center; }
    }
    @media (max-width: 768px) {
      .mobile-back-btn { display: flex; align-items: center; justify-content: center; }
      .view-profile-btn { display: none; }
    }
  `);

  const fetchThread = $(async (contactId: string) => {
    try {
      const res = await invoke<ActivityRow[]>('list_activities', { contactId, limit: 100 });
      // In the inbox, we usually want messages sorted chronologically (oldest to newest) to show a thread, 
      // but the API might return newest first. Let's assume we want them in chronological order.
      const sorted = (res || []).slice().sort((a, b) => ((a.occurred_at as number) || 0) - ((b.occurred_at as number) || 0));
      activities.value = sorted;
    } catch (e: any) {
      error.value = e.message || String(e);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async ({ track }) => {
    const contactId = track(() => props.contact?.id);
    if (!contactId) { loading.value = false; return; }
    loading.value = true;
    error.value = null;
    await fetchThread(contactId);
    loading.value = false;
  });

  const c = props.contact;

  return (
    <div style="flex:1;display:flex;flex-direction:column;min-width:0;background:var(--background);">
      {/* Thread header */}
      <div style="display:flex;align-items:center;padding:0.75rem 1.25rem;border-bottom:1px solid var(--border);background:transparent;flex-shrink:0;">
        <button type="button" class="mobile-back-btn" onClick$={props.onBack$}>
          <LuArrowLeft />
        </button>
        <div style="flex:1;min-width:0;display:flex;align-items:center;gap:1rem;">
          <div style="font-size:0.9375rem;font-weight:600;color:var(--text-primary);">
            {c.first_name} {c.last_name || ""}
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <button
            type="button"
            class="btn-add-log"
            onClick$={() => isAddModalOpen.value = true}
          >
            + Add Log
          </button>
          <button
            class="view-profile-btn"
            onClick$={() => {
              window.sessionStorage.setItem("__bk_view_contact_id", c.id);
              nav(`/dashboard/crm/default/`);
            }}
            style="font-size:0.75rem;font-weight:600;color:var(--text-primary);text-decoration:none;white-space:nowrap;padding:0.4rem 0.875rem;border:1px solid var(--border);border-radius:2rem;background:var(--surface-3);transition:background 0.15s;cursor:pointer;"
          >
            View Profile
          </button>
          <button type="button" class="info-toggle-btn" onClick$={props.onToggleDetails$}>
            <LuInfo />
          </button>
        </div>
      </div>

      {/* Message thread */}
      <div style="flex:1;overflow-y:auto;padding:1.25rem;">
        {loading.value && (
          <div style="text-align:center;padding:3rem;color:var(--text-secondary);font-size:0.875rem;">Loading thread...</div>
        )}
        {error.value && (
          <div style="text-align:center;padding:3rem;color:var(--error);font-size:0.875rem;">{error.value}</div>
        )}
        {!loading.value && !error.value && activities.value.length === 0 && (
          <div style="text-align:center;padding:4rem;color:var(--text-secondary);">
            <div style="font-size:2rem;margin-bottom:0.5rem;">💬</div>
            <div style="font-weight:600;margin-bottom:0.25rem;">No messages yet</div>
            <div style="font-size:0.8125rem;">Log a DM, email or call below to start the thread.</div>
          </div>
        )}
        {activities.value.map((act: ActivityRow) => (
          <InboxMessageBubble key={act.id} activity={act} contactName={c.first_name} profileName={props.profileName} />
        ))}
      </div>

      {/* Compose box */}
      <InboxCompose
        contactId={c.id}
        onSent$={async () => {
          // Refresh thread after send
          await fetchThread(c.id);
        }}
      />

      {isAddModalOpen.value && (
        <AddActivity
          isOpen={isAddModalOpen.value}
          onClose$={$(() => (isAddModalOpen.value = false))}
          contactId={c.id}
        />
      )}
    </div>
  );
});

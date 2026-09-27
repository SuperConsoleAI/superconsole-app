import { component$, $, useSignal, useStylesScoped$, useVisibleTask$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";

import { InboxSidebar } from "~/components/crm/InboxSidebar";
import { InboxThread } from "~/components/crm/InboxThread";
import { InboxContactDetails } from "~/components/crm/InboxContactDetails";
import type { ContactRow } from "~/lib/types";

const crmInboxContactsSessionCache: { current: ContactRow[] | null } = { current: null };

export default component$(() => {
  const contacts = useSignal<ContactRow[]>([]);
  const loading = useSignal(true);
  const selectedId = useSignal<string | null>(null);
  const showDetails = useSignal(false);

  useStylesScoped$(`
    .inbox-page-container {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      background: var(--background);
      padding: 1rem;
      box-sizing: border-box;
    }
    
    @media (max-width: 768px) {
      .inbox-page-container {
        padding: 0.5rem 0.5rem calc(4.5rem + env(safe-area-inset-bottom, 0px)) 0.5rem;
      }
    }

    .inbox-layout {
      display: flex;
      flex: 1;
      height: 100%;
      min-height: 0;
      overflow: hidden;
      gap: 0.75rem;
      box-sizing: border-box;
      position: relative;
    }
    
    .panel-left {
      width: 290px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    
    .panel-center {
      flex: 1;
      display: flex;
      flex-direction: column;
      min-width: 0;
      border: 1px solid var(--border);
      border-radius: 0.75rem;
      background: var(--surface-2);
      position: relative;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    
    .panel-right {
      width: 300px;
      flex-shrink: 0;
      display: flex;
      flex-direction: column;
      transition: transform 0.3s ease;
      height: 100%;
      min-height: 0;
      overflow: hidden;
    }
    
    @media (max-width: 1024px) {
      .panel-right { display: none; }
      .panel-right.open {
        display: flex;
        flex: 1;
        min-width: 0;
        border-radius: 0.75rem;
      .inbox-details-pane {
        position: absolute;
        right: 0;
        top: 0;
        bottom: 0;
        z-index: 20;
        box-shadow: -4px 0 16px rgba(0,0,0,0.15);
      }
    }
    @media (max-width: 768px) {
      .inbox-page-container {
        padding: 0;
        background: transparent;
      }
      .inbox-layout {
        flex-direction: column;
        gap: 0.75rem;
        height: auto;
        min-height: calc(100vh - 120px);
        overflow: visible;
      }
      .inbox-main {
        border-right: none;
        height: auto;
        min-height: 520px;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        box-sizing: border-box;
      }
      .inbox-details-pane {
        position: static;
        width: 100% !important;
        height: auto;
        border-left: none;
        box-shadow: none;
        background: var(--surface-2);
        border: 1px solid var(--border);
        border-radius: 0.75rem;
        box-sizing: border-box;
        margin-top: 0;
      }
      .inbox-sidebar {
        width: 100% !important;
        min-width: 0 !important;
        max-width: 100% !important;
        border-radius: 0.75rem;
        box-sizing: border-box;
      }
      .empty-state { display: none !important; }
    }
  `);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    if (crmInboxContactsSessionCache.current) {
      contacts.value = crmInboxContactsSessionCache.current;
      if (contacts.value.length > 0 && !selectedId.value) {
        selectedId.value = contacts.value[0].id;
      }
      loading.value = false;
    } else {
      loading.value = true;
    }
    try {
      const res = await invoke<ContactRow[]>('list_contacts', { opts: { limit: 100 } });
      // Sort by last_activity_at DESC client-side
      res.sort((a, b) => (((b as any).last_activity_at as number) ?? 0) - (((a as any).last_activity_at as number) ?? 0));
      contacts.value = res;
      crmInboxContactsSessionCache.current = res;
      if (res.length > 0 && !selectedId.value) {
        selectedId.value = res[0].id;
      }
    } catch (e) {
      console.error("Failed to load contacts for inbox:", e);
    } finally {
      loading.value = false;
    }
  });

  const selectedContact = contacts.value.find((c: ContactRow) => c.id === selectedId.value) ?? null;

  return (
    <div class="page-full inbox-page-container">
      {loading.value ? (
        <div style="display:flex;align-items:center;justify-content:center;flex:1;">
          Loading...
        </div>
      ) : (
        <div class="inbox-layout">
          {/* Left: contact list */}
          <div class={["panel-left", selectedContact ? "hide-on-mobile" : ""]} >
            <InboxSidebar
              contacts={contacts.value}
              selectedId={selectedId.value}
              onSelect$={$((id: string) => { selectedId.value = id; showDetails.value = false; })}
            />
          </div>

          {/* Center: thread or empty state */}
          {selectedContact ? (
            <>
              <div class={["panel-center", showDetails.value ? "hide-on-tablet" : ""]}>
                <InboxThread 
                  contact={selectedContact} 
                  profileName="You"
                  onToggleDetails$={$(() => { showDetails.value = !showDetails.value; })}
                  onBack$={$(() => { selectedId.value = null; })}
                />
              </div>

              {/* Right: contact details */}
              <div class={["panel-right", showDetails.value ? "open" : ""]}>
                <InboxContactDetails 
                  contact={selectedContact} 
                  onClose$={$(() => { showDetails.value = false; })}
                />
              </div>
            </>
          ) : (
            <div class={["empty-state", "flex", "flex-col"]} style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);flex-direction:column;gap:0.75rem;border:1px solid var(--border);border-radius:0.75rem;background:var(--surface-1);">
              <div style="font-size:3rem;">💬</div>
              <div style="font-size:1rem;font-weight:600;">Select a contact</div>
              <div style="font-size:0.875rem;">to view the conversation thread</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
});

export const head: DocumentHead = {
  title: "Inbox — CRM",
};

import { component$, useVisibleTask$, useSignal, useStylesScoped$,  $ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { invoke } from "@tauri-apps/api/core";

import { AddDeals } from "~/components/crm/AddDeals";
import type { DealRow, ContactRow } from "~/lib/types";

const DEALS_STYLES = `
  .deals-page-container {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    background: var(--background);
    padding: 1.5rem;
    box-sizing: border-box;
  }
  @media (max-width: 768px) {
    .deals-page-container {
      padding: 0.75rem 0.75rem calc(4.5rem + env(safe-area-inset-bottom, 0px)) 0.75rem;
    }
  }
  .deals-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 0;
    box-sizing: border-box;
    overflow: hidden;
  }
  .kanban-board {
    display: flex;
    gap: 1.25rem;
    overflow-x: auto;
    overflow-y: hidden;
    flex: 1;
    min-height: 0;
    height: 100%;
    box-sizing: border-box;
    align-items: stretch;
    padding-bottom: 0;
    margin-bottom: 0;
    -webkit-overflow-scrolling: touch;
  }
  .kanban-board::-webkit-scrollbar {
    height: 6px;
  }
  .kanban-board::-webkit-scrollbar-track {
    background: transparent;
  }
  .kanban-board::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }
  .kanban-board::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }
  .kanban-col {
    width: 310px;
    min-width: 310px;
    max-width: 310px;
    height: 100%;
    max-height: 100%;
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    overflow: hidden;
    flex-shrink: 0;
  }
  .kanban-col-header {
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    font-size: 0.875rem;
    background: var(--surface-2);
    flex-shrink: 0;
  }
  .kanban-col-count {
    background: var(--surface);
    color: var(--text-secondary);
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.75rem;
    border: 1px solid var(--border);
  }
  .kanban-cards {
    padding: 0.875rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    overflow-y: auto;
    overflow-x: hidden;
    flex: 1;
    min-height: 0;
    box-sizing: border-box;
    -webkit-overflow-scrolling: touch;
  }
  .kanban-cards::-webkit-scrollbar {
    width: 5px;
  }
  .kanban-cards::-webkit-scrollbar-track {
    background: transparent;
  }
  .kanban-cards::-webkit-scrollbar-thumb {
    background: var(--border);
    border-radius: 3px;
  }
  .kanban-cards::-webkit-scrollbar-thumb:hover {
    background: var(--text-muted);
  }
  .kanban-card {
    background: var(--surface-1, var(--background));
    border: 1px solid var(--border);
    border-radius: 0.5rem;
    padding: 0.875rem;
    cursor: grab;
    box-shadow: 0 1px 2px rgba(0,0,0,0.05);
    transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;
    flex-shrink: 0;
  }
  .kanban-card:hover {
    border-color: var(--border-strong, var(--border));
    box-shadow: var(--shadow-sm, 0 2px 4px rgba(0,0,0,0.08));
  }
  .kanban-card:active {
    cursor: grabbing;
    transform: scale(0.98);
  }
  .deal-title {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
    margin-bottom: 0.35rem;
  }
  .deal-contact {
    font-size: 0.75rem;
    color: var(--text-secondary);
    margin-bottom: 0.65rem;
  }
  .deal-metrics {
    display: flex;
    justify-content: space-between;
    font-size: 0.8125rem;
    color: var(--text-primary);
    background: var(--surface-2, var(--surface));
    padding: 0.375rem 0.5rem;
    border-radius: 0.375rem;
    border: 1px solid var(--border);
  }
  .deal-prob {
    font-weight: 600;
    color: var(--accent);
  }
`;

const COLUMNS = [
  { id: "new", label: "New" },
  { id: "contacted", label: "Contacted" },
  { id: "proposal", label: "Proposal" },
  { id: "negotiation", label: "Negotiation" },
  { id: "won", label: "Won" },
  { id: "lost", label: "Lost" }
];

const crmDealsSessionCache: { current: { deals: DealRow[]; contactsMap: Record<string, ContactRow> } | null } = { current: null };

export default component$(() => {
  useStylesScoped$(DEALS_STYLES);
  
  const deals = useSignal<DealRow[]>([]);
  const contactsMap = useSignal<Record<string, ContactRow>>({});
  const loading = useSignal(true);

  const isAddOpen = useSignal(false);
  const draggedDealId = useSignal<string | null>(null);

  const formatCurrency = (cents: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 0 }).format((cents || 0) / 100);
  };

  const loadDeals$ = $(async () => {
    try {
      const [dealsData, contactsRaw] = await Promise.all([
        invoke<DealRow[]>('list_deals', { contactId: null }),
        invoke<ContactRow[]>('list_contacts', { opts: { limit: 1000 } })
      ]);
      deals.value = dealsData || [];
      const map: Record<string, ContactRow> = {};
      (contactsRaw || []).forEach(c => { map[c.id] = c; });
      contactsMap.value = map;
      crmDealsSessionCache.current = { deals: deals.value, contactsMap: contactsMap.value };
    } catch (err) {
      console.error("Failed to load deals:", err);
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    if (crmDealsSessionCache.current) {
      deals.value = crmDealsSessionCache.current.deals;
      contactsMap.value = crmDealsSessionCache.current.contactsMap;
      loading.value = false;
    } else {
      loading.value = true;
    }
    await loadDeals$();
    loading.value = false;
  });

  const handleDragStart$ = $((dealId: string) => {
    draggedDealId.value = dealId;
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const handleOpenAddDeal = () => {
      isAddOpen.value = true;
    };
    window.addEventListener('open-add-deal', handleOpenAddDeal);
    return () => window.removeEventListener('open-add-deal', handleOpenAddDeal);
  });

  const handleDragOver$ = $(() => {
    // allow drop
  });

  const handleDrop$ = $(async (stageId: string) => {
    if (!draggedDealId.value) return;
    const dealId = draggedDealId.value;
    draggedDealId.value = null;

    // Optimistic UI update
    const currentDeals = [...deals.value];
    const dealIndex = currentDeals.findIndex(d => d.id === dealId);
    if (dealIndex > -1 && currentDeals[dealIndex].stage !== stageId) {
      currentDeals[dealIndex] = { ...currentDeals[dealIndex], stage: stageId };
      deals.value = currentDeals;
      
      try {
        await invoke('update_deal_stage', { dealId, stage: stageId, lostReason: null });
      } catch (err) {
        console.error("Failed to update deal stage:", err);
        // revert if failed
        await loadDeals$();
      }
    }
  });

  return (
    <div class="page-full deals-page-container">
      <div class="deals-main">


        {loading.value ? (
          <div style="text-align:center;padding:3rem;color:var(--text-secondary);">Loading...</div>
        ) : (
          <div class="kanban-board">
            {COLUMNS.map((col) => {
              const colDeals = deals.value.filter(d => (d.stage || 'new') === col.id);
              return (
                <div 
                  class="kanban-col" 
                  key={col.id}
                  preventdefault:dragover
                  onDragOver$={handleDragOver$}
                  onDrop$={() => handleDrop$(col.id)}
                >
                  <div class="kanban-col-header">
                    <span>{col.label}</span>
                    <span class="kanban-col-count">{colDeals.length}</span>
                  </div>
                  <div class="kanban-cards">
                    {colDeals.map((deal) => {
                      const contact = contactsMap.value[deal.contact_id];
                      return (
                        <div 
                          class="kanban-card" 
                          key={deal.id}
                          draggable
                          onDragStart$={() => handleDragStart$(deal.id)}
                        >
                          <div class="deal-title">{deal.title}</div>
                          <div class="deal-contact">
                            {contact ? `${contact.first_name} ${contact.last_name || ''}` : 'Unknown Contact'}
                          </div>
                          <div class="deal-metrics">
                            <span>{formatCurrency(deal.value_cents, deal.currency)}</span>
                            <span class="deal-prob">{deal.probability || 0}%</span>
                          </div>
                          {deal.expected_close_at && (
                            <div style="font-size:0.75rem;color:var(--text-secondary);margin-top:0.5rem;display:flex;justify-content:space-between;">
                              <span>Expected Close:</span>
                              <span>{new Date((deal.expected_close_at as number) * 1000).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <AddDeals 
        isOpen={isAddOpen.value} 
        onClose$={$(() => isAddOpen.value = false)} 
        contacts={Object.values(contactsMap.value)}
      />
    </div>
  );
});

export const head: DocumentHead = {
  title: "Deals - CRM",
};

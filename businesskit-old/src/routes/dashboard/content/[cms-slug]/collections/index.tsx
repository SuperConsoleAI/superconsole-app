import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import { type StaticGenerateHandler } from "@builder.io/qwik-city";
import { CollectionModal } from "~/components/CollectionModal";
import { CollectionsTable } from "~/components/CollectionsTable";
import { designSystem } from "~/lib/design-system";
import { ContentContext } from "../../layout";

export const onStaticGenerate: StaticGenerateHandler = () => ({
  params: [
    "blog", "n", "notes", "docs", "directory", "articles", "guides",
    "skills", "prompt", "compare", "alternative", "posts", "tools",
    "links", "listing", "booking", "services", "courses", "sponsorship",
    "downloads", "events", "meetings", "webinars", "community", "page",
    "videos", "podcast", "membership", "subscription", "ai-tools",
    "store", "forms", "jobs",
  ].map((s) => ({ "cms-slug": s })),
});

const { spacing } = designSystem;

export default component$(() => {
  const state = useContext(ContentContext);
  
  const isModalOpen = useSignal(false);

  // Form State
  const editingId = useSignal<string | null>(null);
  const initialData = useSignal<{
    id?: string;
    title: string;
    description?: string;
    icon?: string;
    category_id?: string;
    parent_id?: string;
  } | undefined>(undefined);

  const handleEdit = $((id: string) => {
    const col = state.collections.find(c => c.id === id);
    if (col) {
      editingId.value = col.id;
      initialData.value = {
        id: col.id,
        title: col.title,
        description: col.description || "",
        icon: col.icon || "",
        category_id: col.category_id || "",
        parent_id: col.parent_id || ""
      };
      isModalOpen.value = true;
    }
  });

  return (
    <div style={`display:flex;flex-direction:column;gap:${spacing.lg};flex:1;background:var(--surface-1);`}>
      {state.loading && state.collections.length === 0 ? (
        <div style="display: flex; flex-direction: column; gap: 1rem; padding: 2rem;">
          {[1,2,3].map((i) => (
            <div key={i} style={`display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface-2); border-radius: 0.5rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: ${i * 150}ms;`}>
              <div style="width: 2rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="flex: 1; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="flex: 2; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
            </div>
          ))}
        </div>
      ) : (
        <CollectionsTable
          collections={{ value: state.collections } as any}
          allCollections={state.collections}
          hubs={state.hubs}
          onEdit$={handleEdit}
        >
          <button
            q:slot="headerActions"
            onClick$={$(() => { 
              editingId.value = null;
              initialData.value = undefined;
              isModalOpen.value = true; 
            })}
            style="background:var(--button-primary-bg);color:var(--button-primary-text);border:none;border-radius:0.5rem;height:2rem;padding:0 1rem;font-weight:500;cursor:pointer;display:flex;align-items:center;white-space:nowrap;"
          >
            + New Collection
          </button>
        </CollectionsTable>
      )}

      <CollectionModal 
        isOpen={isModalOpen} 
        hubs={state.hubs}
        collections={state.collections}
        initialData={initialData.value}
        onClose$={$(() => { 
          isModalOpen.value = false; 
          setTimeout(() => { editingId.value = null; initialData.value = undefined; }, 300);
        })}
        onSave$={$(async (data) => {
          const { createCollection } = await import('~/lib/ipc');
          await createCollection(data); 
          await state.refresh();
        })}
      />
    </div>
  );
});

import { type PropFunction, type Signal, $, component$, useSignal, useComputed$, Slot, useTask$ } from "@builder.io/qwik";
import { LuPencil, LuTrash2, LuSearch, LuChevronLeft, LuChevronRight } from "@qwikest/icons/lucide";

export type CollectionItem = {
  id: string;
  title: string;
  slug: string;
  icon?: string | null;
  description?: string | null;
  category_id?: string | null;
  parent_id?: string | null;
};

type CollectionsTableProps = {
  collections: Signal<CollectionItem[]>;
  allCollections?: CollectionItem[];
  hubs?: { id: string; title: string }[];
  onEdit$: PropFunction<(id: string) => void>;
  onDelete$?: PropFunction<(id: string) => void>;
};

export const CollectionsTable = component$<CollectionsTableProps>(({
  collections,
  allCollections = [],
  hubs = [],
  onEdit$,
  onDelete$,
}) => {
  const handleDelete$ = $(async (id: string) => {
    if (onDelete$) {
      await onDelete$(id);
      return;
    }
    const ok = typeof window === "undefined" ? true : window.confirm("Delete this collection? This cannot be undone.");
    if (!ok) return;
    collections.value = collections.value.filter((p) => p.id !== id);
  });

  const searchQuery = useSignal("");
  const currentPage = useSignal(1);
  const itemsPerPage = 25;

  const filteredCollections = useComputed$(() => {
    if (!searchQuery.value) return collections.value;
    const query = searchQuery.value.toLowerCase();
    return collections.value.filter((p) => p.title.toLowerCase().includes(query) || (p.description && p.description.toLowerCase().includes(query)));
  });

  const totalPages = useComputed$(() => Math.ceil(filteredCollections.value.length / itemsPerPage));

  const paginatedCollections = useComputed$(() => {
    const start = (currentPage.value - 1) * itemsPerPage;
    return filteredCollections.value.slice(start, start + itemsPerPage);
  });

  // Reset page to 1 when search changes
  useTask$(({ track }) => {
    track(() => searchQuery.value);
    currentPage.value = 1;
  });

  const getHubName = (categoryId: string) => {
    const hub = hubs.find(h => h.id === categoryId);
    return hub ? hub.title : categoryId;
  };

  const getParentName = (parentId: string) => {
    const parent = allCollections.find(c => c.id === parentId);
    return parent ? parent.title : parentId;
  };

  return (
    <div style="display: flex; flex-direction: column; gap: 1rem;">
      <style>{COLLECTIONS_TABLE_STYLES}</style>
      <div style="display: flex; gap: 1rem; align-items: center; justify-content: space-between;">
        <div style="position: relative; flex: 1; max-width: 400px;">
          <div style="position: absolute; left: 0.75rem; top: 50%; transform: translateY(-50%); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; pointer-events: none;">
            <LuSearch style="width: 1rem; height: 1rem;" />
          </div>
          <input
            type="text"
            placeholder="Search collections..."
            bind:value={searchQuery}
            style="width: 100%; padding: 0.5rem 1rem 0.5rem 2.25rem; background: var(--surface-1); border: 1px solid var(--divider, rgba(255, 255, 255, 0.1)); border-radius: 0.5rem; color: var(--text-primary); font-size: 0.875rem;"
          />
        </div>
        <Slot name="headerActions" />
      </div>

      <div style="overflow-x: auto; background: var(--surface-2); border-radius: 0.75rem;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.875rem;">
          <thead>
            <tr style="background: var(--surface-3); border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.1));">
              <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; padding-left: 1rem; color: var(--text-secondary);">Title</th>
              <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; color: var(--text-secondary);">Description</th>
              <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; color: var(--text-secondary);">Scope</th>
              <th style="padding: 0.75rem 0.5rem; text-align: left; font-weight: 600; color: var(--text-secondary);">Parent</th>
              <th style="padding: 0.75rem 0.5rem; text-align: right; font-weight: 600; padding-right: 1rem; color: var(--text-secondary);">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paginatedCollections.value.length === 0 ? (
              <tr>
                <td colSpan={5} style="padding: 2rem; text-align: center; color: var(--text-secondary);">
                  No collections found.
                </td>
              </tr>
            ) : (
              paginatedCollections.value.map((col) => (
                <tr key={col.id} class="product-table-row">
                  <td style="padding: 0.75rem 0.5rem; padding-left: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.75rem; font-weight: 500;">
                      {col.icon && <span style="font-size: 1.25rem;">{col.icon}</span>}
                      <span>{col.title}</span>
                    </div>
                  </td>
                  <td style="padding: 0.75rem 0.5rem; color: var(--text-secondary);">
                    {col.description || "—"}
                  </td>
                  <td style="padding: 0.75rem 0.5rem;">
                    {col.category_id ? (
                      <span style={{ 
                        padding: "0.25rem 0.5rem", 
                        background: "var(--surface-3)", 
                        borderRadius: "0.375rem",
                        fontSize: "0.75rem",
                        fontWeight: 500,
                        color: "var(--text-primary)"
                      }}>
                        {getHubName(col.category_id)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>Global</span>
                    )}
                  </td>
                  <td style="padding: 0.75rem 0.5rem;">
                    {col.parent_id ? (
                      <span style={{ color: "var(--text-primary)", fontWeight: 500 }}>
                        {getParentName(col.parent_id)}
                      </span>
                    ) : (
                      <span style={{ color: "var(--text-3)", fontSize: "0.8125rem" }}>—</span>
                    )}
                  </td>
                  <td style="padding: 0.75rem 0.5rem; padding-right: 1rem;">
                    <div style="display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem;">
                      <button type="button" onClick$={() => onEdit$(col.id)} title="Edit" style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; display: flex; color: var(--text-secondary);">
                        <LuPencil style="width: 1rem; height: 1rem;" />
                      </button>
                      <button
                        type="button"
                        onClick$={() => handleDelete$(col.id)}
                        title="Delete"
                        style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; cursor: pointer; display: flex; color: var(--text-secondary);"
                      >
                        <LuTrash2 style="width: 1rem; height: 1rem;" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {totalPages.value > 1 && (
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 0.5rem 0; font-size: 0.875rem; color: var(--text-secondary);">
          <div>
            Showing {(currentPage.value - 1) * itemsPerPage + 1} to {Math.min(currentPage.value * itemsPerPage, filteredCollections.value.length)} of {filteredCollections.value.length} entries
          </div>
          <div style="display: flex; gap: 0.5rem;">
            <button
              type="button"
              disabled={currentPage.value === 1}
              onClick$={() => currentPage.value--}
              style={`padding: 0.375rem 0.75rem; border-radius: 0.375rem; border: 1px solid var(--divider, rgba(255, 255, 255, 0.1)); display: flex; align-items: center; gap: 0.25rem; font-weight: 500; transition: all 0.2s; ${currentPage.value === 1 ? 'opacity: 0.5; cursor: not-allowed; background: transparent; color: var(--text-secondary);' : 'cursor: pointer; background: var(--surface-2); color: var(--text-primary); hover:bg-surface-3'}`}
            >
              <LuChevronLeft style="width: 1rem; height: 1rem;" /> Prev
            </button>
            <button
              type="button"
              disabled={currentPage.value >= totalPages.value}
              onClick$={() => currentPage.value++}
              style={`padding: 0.375rem 0.75rem; border-radius: 0.375rem; border: 1px solid var(--divider, rgba(255, 255, 255, 0.1)); display: flex; align-items: center; gap: 0.25rem; font-weight: 500; transition: all 0.2s; ${currentPage.value >= totalPages.value ? 'opacity: 0.5; cursor: not-allowed; background: transparent; color: var(--text-secondary);' : 'cursor: pointer; background: var(--surface-2); color: var(--text-primary); hover:bg-surface-3'}`}
            >
              Next <LuChevronRight style="width: 1rem; height: 1rem;" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});

export const COLLECTIONS_TABLE_STYLES = `
  .product-table-row {
    border-bottom: 1px solid var(--divider, rgba(255, 255, 255, 0.1));
    transition: background-color 0.2s ease;
  }
  .product-table-row:hover {
    background: var(--surface-3);
  }
`;

export default CollectionsTable;

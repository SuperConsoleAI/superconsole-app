import { $, component$, useSignal, useComputed$, useStylesScoped$, useContext } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import { LuPencil } from "@qwikest/icons/lucide";
import { designSystem } from "~/lib/design-system";
import { CMSForm } from "~/components/CMSForm";
import { ContentContext } from "./layout";

const { spacing, typography, borderRadius, shadows } = designSystem;

const HIDDEN_SLUGS = new Set([
  "listing", "booking", "services", "courses", "sponsorship",
  "downloads", "events", "meetings", "webinars", "community",
  "page", "membership", "store", "forms", "jobs", "links"
]);

const PAGE_STYLE = `
  .store-dashboard__landing {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: ${spacing.lg};
    background-color: var(--surface-1);
  }

  .store-dashboard__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: ${spacing.lg};
  }

  .store-dashboard__card {
    display: flex;
    flex-direction: column;
    gap: ${spacing.sm};
    border: 1px solid var(--border);
    border-radius: ${borderRadius.xl};
    padding: ${spacing.lg};
    background: var(--surface-2);
    transition: border-color ${designSystem.transitions.fast}, box-shadow ${designSystem.transitions.fast};
  }

  .store-dashboard__card:hover,
  .store-dashboard__card:focus-visible {
    border-color: var(--accent);
    box-shadow: ${shadows.sm};
  }

  .store-dashboard__card h2 {
    margin: 0;
    font-size: ${typography.sizes.lg};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
  }

  .store-dashboard__card p {
    margin: 0;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    flex: 1;
  }

  .store-dashboard__card-actions {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: ${spacing.sm};
    margin-top: ${spacing.xs};
  }
`;

export default component$(() => {
  useStylesScoped$(PAGE_STYLE);
  const state = useContext(ContentContext);
  
  const editingCmsId = useSignal<string | null>(null);
  
  const lists = useComputed$(() => {
    return state.hubs.filter(r => !HIDDEN_SLUGS.has(String(r.slug)));
  });

  const editingRecord = lists.value.find((r) => r.id === editingCmsId.value);

  return (
    <div class="store-dashboard__landing">
      {state.loading ? (
        <section class="store-dashboard__grid">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} class="store-dashboard__card" style="height: 140px; justify-content: center;">
              <div class="skeleton" style="height:24px;width:120px;margin-bottom:8px;border-radius:4px" />
              <div class="skeleton" style="height:14px;width:180px;margin-bottom:auto;border-radius:4px" />
              <div class="skeleton" style="height:32px;width:120px;margin-top:16px;border-radius:6px" />
            </div>
          ))}
        </section>
      ) : lists.value.length === 0 ? (
        <div style="color:var(--text-secondary);">No content hubs found.</div>
      ) : (
        <section class="store-dashboard__grid">
          {lists.value.map((item) => (
            <article key={item.id} class="store-dashboard__card">
              <div>
                <h2>{item.title}</h2>
                <p>{item.description || "No description provided."}</p>
              </div>
              
              <div class="store-dashboard__card-actions">
                <Link
                  href={`/dashboard/content/${item.slug}/`}
                  style={`
                    flex: 1;
                    height: 2rem;
                    padding: 0 16px;
                    border-radius: 0.5rem;
                    background: var(--surface-3);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: var(--text-primary);
                    font-size: 13px;
                    font-weight: 500;
                    text-decoration: none;
                  `}
                  class="hover:opacity-80 transition-opacity"
                >
                  Open workspace
                </Link>
                <button
                  type="button"
                  onClick$={() => { editingCmsId.value = item.id; }}
                  title="Edit Settings"
                  style={`
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 2rem;
                    height: 2rem;
                    background: transparent;
                    border: 1px solid var(--border);
                    border-radius: 0.5rem;
                    color: var(--text-secondary);
                    cursor: pointer;
                  `}
                  class="hover:opacity-80 transition-opacity"
                >
                  <LuPencil style="width: 14px; height: 14px;" />
                </button>
              </div>
            </article>
          ))}
        </section>
      )}

      {editingRecord && (
        <CMSForm
          record={editingRecord}
          onClose$={$(() => {
            editingCmsId.value = null;
          })}
          onSaved$={$((updated) => {
            lists.value = lists.value.map((r) =>
              r.id === updated.id ? updated : r
            );
            editingCmsId.value = null;
          })}
        />
      )}
    </div>
  );
});

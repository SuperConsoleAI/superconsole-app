import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import { LuBriefcase } from "@qwikest/icons/lucide";
import "~/routes/dashboard/c/[category]/category.css";
import {
  updateJobListingIPC,
  deleteJobListingIPC,
} from "~/lib/ipc";
import { ProductTable } from "~/components/ProductTable";
import { JobsForm } from "~/components/JobsForm";
import { JobsContext } from "./layout";

export default component$(() => {
  const store = useContext(JobsContext);
  const showForm = useSignal(false);
  const editingJob = useSignal<any>(null);

  const products = store.jobs.map((j) => ({
    id: j.id,
    title: j.title,
    slug: j.slug,
    excerpt: j.company ? `${j.company} · ${j.location}` : j.location,
    hero_image_url: j.image_url ?? null,
    published: j.published === true,
  }));


  return (
      <div class="jobs-main" style="flex:1; display:flex; flex-direction:column; gap:1.5rem; background:var(--surface-1);">
        <JobsForm
          open={showForm}
          editingJob={editingJob}
          onSaved$={store.refresh}
        />

        {/* Category Stats */}
        {products.length > 0 && !store.loading && (
          <div class="category-stats">
            <div class="stat-card">
              <h3>Total Job Posts</h3>
              <div class="stat-value">
                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.stats?.total_posts || 0)}
              </div>
              <div class="stat-description">lifetime</div>
            </div>
            <div class="stat-card">
              <h3>Active Jobs</h3>
              <div class="stat-value">
                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.stats?.total_published || 0)}
              </div>
              <div class="stat-description">currently visible</div>
            </div>
            <div class="stat-card">
              <h3>Total Applications</h3>
              <div class="stat-value">
                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.stats?.total_applications || 0)}
              </div>
              <div class="stat-description">across all jobs</div>
            </div>
            <div class="stat-card">
              <h3>Total Views</h3>
              <div class="stat-value">
                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.stats?.total_views || 0)}
              </div>
              <div class="stat-description">across all jobs</div>
            </div>
          </div>
        )}

        {/* Job Listings Table */}
        {store.loading ? (
          <div style="padding: 1rem; display: flex; flex-direction: column; gap: 0.5rem; flex: 1;">
            <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface-2); border-radius: 0.5rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;">
              <div style="width: 2rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="flex: 1; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="flex: 2; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="width: 4rem; height: 1.5rem; background: var(--border); border-radius: 1rem;" />
              <div style="width: 3rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
            </div>
            <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface-2); border-radius: 0.5rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 150ms;">
              <div style="width: 2rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="flex: 1; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="flex: 2; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="width: 4rem; height: 1.5rem; background: var(--border); border-radius: 1rem;" />
              <div style="width: 3rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
            </div>
            <div style="display: flex; align-items: center; gap: 1rem; padding: 1rem; background: var(--surface-2); border-radius: 0.5rem; animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite; animation-delay: 300ms;">
              <div style="width: 2rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="flex: 1; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="flex: 2; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
              <div style="width: 4rem; height: 1.5rem; background: var(--border); border-radius: 1rem;" />
              <div style="width: 3rem; height: 1.5rem; background: var(--border); border-radius: 0.25rem;" />
            </div>
          </div>
        ) : products.length === 0 ? (
          <section class="flex flex-col items-center justify-center py-20 px-4 text-center bg-surface-2 rounded-2xl border border-divider">
            <div class="w-16 h-16 bg-surface-3 rounded-full flex items-center justify-center mb-6 text-primary">
              <LuBriefcase class="w-8 h-8" />
            </div>
            <h2 class="text-2xl font-semibold text-primary mb-3">No job listings yet</h2>
            <p class="text-secondary max-w-md mb-8">Post job openings to hire top talent directly from your audience.</p>
            <button
              type="button"
              class="btn btn-primary px-8 py-3 rounded-xl shadow-lg shadow-accent/20"
              onClick$={$(() => { showForm.value = true; })}
            >
              Create your first job listing
            </button>
          </section>
        ) : (
          <ProductTable
            products={{ value: products } as any}
            pathPrefix="/dashboard/jobs/"
            showPrice={false}
            showSales={false}
            showStatus={true}
            showEdit={true}
            showView={false}
            onEdit$={$(async (id: string) => {
              const job = store.jobs.find((j) => j.id === id);
              if (job) {
                editingJob.value = job;
                showForm.value = true;
              }
            })}
            onDelete$={$(async (id: string) => {
              if (confirm("Are you sure you want to delete this job listing?")) {
                await deleteJobListingIPC(id);
                await store.refresh();
              }
            })}
            onToggleStatus$={$(async (id: string, published: boolean) => {
              await updateJobListingIPC(id, { published });
              await store.refresh();
            })}
          >
            <button
              q:slot="headerActions"
              type="button"
              class="btn btn-primary"
              style="height: 32px; padding: 0 1rem; display: flex; align-items: center; white-space: nowrap;"
              onClick$={$(() => { showForm.value = true; })}
            >
              + Add Job
            </button>
          </ProductTable>
        )}
      </div>
  );
});

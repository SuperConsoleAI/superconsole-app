import { component$, useSignal, useContext } from "@builder.io/qwik";
import type { JobApplicationRow } from "~/lib/types";
import { ApplicationModal } from "~/components/ApplicationModal";
import { LuUsers, LuSearch } from "@qwikest/icons/lucide";
import { JobsContext } from "../layout";

export default component$(() => {
  const store = useContext(JobsContext);
  const selectedApp = useSignal<JobApplicationRow | null>(null);
  const showModal = useSignal(false);
  const searchQuery = useSignal("");

  const filteredData = store.applications.filter(app => {
    if (!searchQuery.value) return true;
    const q = searchQuery.value.toLowerCase();
    return app.full_name.toLowerCase().includes(q) || app.email.toLowerCase().includes(q) || (app.job_id && app.job_id.toLowerCase().includes(q));
  });

  return (
    <div class="jobs-applications" style="flex:1; display:flex; flex-direction:column; gap:1.5rem; background:var(--surface-1);">
      <ApplicationModal
        open={showModal}
        application={selectedApp}
        onUpdated$={store.refresh}
      />

      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="font-size:1.25rem; font-weight:600; color:var(--text-primary); margin:0;">Applications</h2>
        <div style="display:flex; gap:0.75rem;">
          <div style="position:relative; width:250px;">
            <LuSearch style="position:absolute; left:0.75rem; top:50%; transform:translateY(-50%); color:var(--text-secondary); width:1rem; height:1rem;" />
            <input
              type="text"
              placeholder="Search applicants..."
              value={searchQuery.value}
              onInput$={(e) => { searchQuery.value = (e.target as HTMLInputElement).value; }}
              style="width:100%; height:2.5rem; padding:0 1rem 0 2.25rem; background:var(--field-fill); border:1px solid var(--border); border-radius:0.5rem; color:var(--text-primary); font-size:0.875rem;"
            />
          </div>
        </div>
      </div>

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

      ) : store.applications.length === 0 ? (
        <section class="flex flex-col items-center justify-center py-20 px-4 text-center bg-surface-2 rounded-2xl border border-divider">
          <div class="w-16 h-16 bg-surface-3 rounded-full flex items-center justify-center mb-6 text-primary">
            <LuUsers class="w-8 h-8" />
          </div>
          <h2 class="text-2xl font-semibold text-primary mb-3">No applications yet</h2>
          <p class="text-secondary max-w-md mb-8">When candidates apply for your job listings, they will appear here.</p>
        </section>
      ) : (
        <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:0.75rem; overflow:hidden;">
          <table style="width:100%; border-collapse:collapse; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid var(--border); background:var(--surface-3);">
                <th style="padding:1rem; font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Applicant</th>
                <th style="padding:1rem; font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Job ID</th>
                <th style="padding:1rem; font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Status</th>
                <th style="padding:1rem; font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Stage</th>
                <th style="padding:1rem; font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Decision</th>
                <th style="padding:1rem; font-size:0.75rem; font-weight:600; color:var(--text-secondary); text-transform:uppercase; letter-spacing:0.05em;">Applied</th>
              </tr>
            </thead>
            <tbody>
              {filteredData.map(app => (
                <tr
                  key={app.id}
                  style="border-bottom:1px solid var(--border); cursor:pointer; transition:background 0.15s;"
                  onClick$={() => {
                    selectedApp.value = app;
                    showModal.value = true;
                  }}
                  onMouseEnter$={(e: any) => { e.currentTarget.style.background = 'var(--surface-3)'; }}
                  onMouseLeave$={(e: any) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <td style="padding:1rem;">
                    <div style="font-weight:500; color:var(--text-primary); font-size:0.875rem;">{app.full_name}</div>
                    <div style="color:var(--text-secondary); font-size:0.8125rem;">{app.email}</div>
                  </td>
                  <td style="padding:1rem; font-size:0.875rem; color:var(--text-secondary);">
                    {app.job_id.substring(0, 8)}...
                  </td>
                  <td style="padding:1rem;">
                    <span style="display:inline-flex; align-items:center; padding:0.25rem 0.625rem; border-radius:9999px; font-size:0.75rem; font-weight:500; background:var(--surface-3); color:var(--text-primary); text-transform:capitalize;">
                      {app.status}
                    </span>
                  </td>
                  <td style="padding:1rem;">
                    <span style="display:inline-flex; align-items:center; padding:0.25rem 0.625rem; border-radius:9999px; font-size:0.75rem; font-weight:500; background:var(--surface-3); color:var(--text-primary); text-transform:capitalize;">
                      {app.stage}
                    </span>
                  </td>
                  <td style="padding:1rem;">
                    {app.decision ? (
                      <span style={`display:inline-flex; align-items:center; padding:0.25rem 0.625rem; border-radius:9999px; font-size:0.75rem; font-weight:500; text-transform:capitalize; ${
                        app.decision === 'accepted' ? 'background:rgba(34,197,94,0.1); color:#22c55e;' :
                        app.decision === 'rejected' ? 'background:rgba(239,68,68,0.1); color:#ef4444;' :
                        'background:var(--surface-3); color:var(--text-primary);'
                      }`}>
                        {app.decision}
                      </span>
                    ) : (
                      <span style="color:var(--text-secondary); font-size:0.875rem; font-style:italic;">Pending</span>
                    )}
                  </td>
                  <td style="padding:1rem; font-size:0.875rem; color:var(--text-secondary);">
                    {new Date(app.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
              {filteredData.length === 0 && (
                <tr>
                  <td colSpan={6} style="padding:2rem; text-align:center; color:var(--text-secondary); font-size:0.875rem;">
                    No applications matched your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
});

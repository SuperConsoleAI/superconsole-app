// src/routes/dashboard/forms/index.tsx
//
// WHAT:  Forms list page — shows all forms for the active profile.
//        Inline "New Form" modal (title input → createFormIPC → navigate to builder).
//        Delete confirmation modal. Publish toggle via toggleFormPublishedIPC.
//
// HOW:   Consumes FormsContext (from layout.tsx).
//        After any mutation, calls store.refresh() to sync state.
//        Navigation to builder uses nav() — never window.location.href.
//
// FLOW:
//   mount  → context already loaded by layout.tsx
//   + New Form → modal open → title input → createFormIPC() → nav to [id]/edit
//   toggle → toggleFormPublishedIPC() → store.refresh()
//   delete → deleteFormIPC() → store.refresh()

import { component$, useSignal, $, useContext } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { LuFileText, LuInbox, LuSettings, LuLink } from "@qwikest/icons/lucide";
import "~/routes/dashboard/c/[category]/category.css";
import { createFormIPC, deleteFormIPC, toggleFormPublishedIPC } from "~/lib/ipc";
import { ProductTable, type ProductItem } from "~/components/ProductTable";
import { FormModal } from "~/components/FormModal";
import { FormsContext } from "./layout";

function slugify(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

export default component$(() => {
  const store = useContext(FormsContext);
  const nav = useNavigate();

  // ── Create modal state
  const showCreate = useSignal(false);
  const newTitle = useSignal("");
  const isCreating = useSignal(false);
  const createError = useSignal("");

  // ── Delete modal state
  const deleteId = useSignal<string | null>(null);
  const isDeleting = useSignal(false);

  // ── Settings modal state (form row settings icon)
  const settingsFormId    = useSignal<string>("");
  const settingsModalOpen = useSignal(false);
  const settingsFormTitle = useSignal<string>("");

  // ── Copy link state
  const copiedId = useSignal<string | null>(null);

  // ── Build ProductTable items
  const products = store.forms.map((f) => ({
    id: f.id,
    title: f.title,
    slug: f.slug,
    excerpt: `${f.submission_count} submission${f.submission_count !== 1 ? "s" : ""}`,
    published: f.published,
  } as ProductItem));

  const handleCreate = $(async () => {
    const title = newTitle.value.trim();
    if (!title) { createError.value = "Please enter a form title."; return; }
    isCreating.value = true;
    createError.value = "";
    try {
      const slug = slugify(title) + "-" + Date.now().toString(36);
      const form = await createFormIPC({ title, slug });
      showCreate.value = false;
      newTitle.value = "";
      window.sessionStorage.setItem("__bk_edit_form_id", form.id);
      await nav(`/dashboard/forms/default/edit/`);
    } catch (e: any) {
      // Tauri IPC errors come as plain strings, not Error objects
      createError.value = typeof e === "string" ? e : (e?.message || JSON.stringify(e) || "Failed to create form.");
      console.error("create_form error:", e);
    } finally {
      isCreating.value = false;
    }
  });

  const handleDelete = $(async () => {
    if (!deleteId.value) return;
    isDeleting.value = true;
    try {
      await deleteFormIPC(deleteId.value);
      deleteId.value = null;
      await store.refresh();
    } catch (e: any) {
      console.error("Delete failed:", e);
    } finally {
      isDeleting.value = false;
    }
  });

  return (
    <div class="jobs-main" style="flex:1; display:flex; flex-direction:column; gap:1.5rem; background:var(--surface-1);">

      {/* Form settings slideover */}
      <FormModal
        open={settingsModalOpen}
        formId={settingsFormId.value}
        initialTitle={settingsFormTitle.value}
      />

      {/* ── Create Form Modal ── */}
      {showCreate.value && (
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div style="background:var(--surface-2);border-radius:0.75rem;max-width:420px;width:100%;padding:2rem;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
            <h2 style="font-size:1.125rem;font-weight:600;color:var(--text-primary);margin:0 0 1.25rem;">Create New Form</h2>
            <div style="display:flex;flex-direction:column;gap:0.75rem;">
              <div>
                <label style="display:block;font-size:0.875rem;font-weight:500;color:var(--text-primary);margin-bottom:0.5rem;">
                  Form Title
                </label>
                <input
                  id="new-form-title"
                  type="text"
                  placeholder="e.g. Contact Form"
                  value={newTitle.value}
                  onInput$={(e) => { newTitle.value = (e.target as HTMLInputElement).value; }}
                  onKeyDown$={(e) => { if (e.key === "Enter") handleCreate(); }}
                  style="width:100%;padding:0.75rem;background:var(--background);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;outline:none;"
                  autofocus
                />
                {createError.value && (
                  <p style="color:var(--error);font-size:0.8125rem;margin-top:0.375rem;">{createError.value}</p>
                )}
              </div>
              <div style="display:flex;gap:0.75rem;justify-content:flex-end;">
                <button
                  type="button"
                  onClick$={() => { showCreate.value = false; newTitle.value = ""; createError.value = ""; }}
                  style="padding:0.625rem 1.25rem;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:0.5rem;font-size:0.875rem;cursor:pointer;"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick$={handleCreate}
                  disabled={isCreating.value}
                  style={{
                    padding: "0.625rem 1.25rem",
                    background: "var(--button-primary-bg)",
                    color: "var(--button-primary-text)",
                    border: "none",
                    borderRadius: "0.5rem",
                    fontSize: "0.875rem",
                    fontWeight: "600",
                    cursor: "pointer",
                    opacity: isCreating.value ? 0.7 : 1,
                  }}
                >
                  {isCreating.value ? "Creating…" : "Create Form"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {deleteId.value && (
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:1000;">
          <div style="background:var(--surface-2);border-radius:0.75rem;max-width:400px;width:100%;padding:2rem;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,0.2);">
            <h3 style="font-size:1.125rem;font-weight:600;color:var(--text-primary);margin:0 0 0.75rem;">Delete Form?</h3>
            <p style="color:var(--text-secondary);margin-bottom:1.5rem;font-size:0.875rem;">
              This will permanently delete the form and all its submissions. This cannot be undone.
            </p>
            <div style="display:flex;gap:0.75rem;justify-content:center;">
              <button
                type="button"
                onClick$={handleDelete}
                disabled={isDeleting.value}
                style="padding:0.75rem 1.5rem;background:var(--error);color:#fff;border:none;border-radius:0.5rem;font-weight:600;cursor:pointer;font-size:0.875rem;"
              >
                {isDeleting.value ? "Deleting…" : "Delete"}
              </button>
              <button
                type="button"
                onClick$={() => { deleteId.value = null; }}
                style="padding:0.75rem 1.5rem;background:transparent;color:var(--text-secondary);border:1px solid var(--border);border-radius:0.5rem;cursor:pointer;font-size:0.875rem;"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Stats Cards ── */}
      {products.length > 0 && !store.loading && (
        <div class="category-stats">
          <div class="stat-card">
            <h3>Total Forms</h3>
            <div class="stat-value">
              {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.forms.length)}
            </div>
            <div class="stat-description">lifetime</div>
          </div>
          <div class="stat-card">
            <h3>Published</h3>
            <div class="stat-value">
              {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.forms.filter((f) => f.published).length)}
            </div>
            <div class="stat-description">currently live</div>
          </div>
          <div class="stat-card">
            <h3>Total Submissions</h3>
            <div class="stat-value">
              {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.forms.reduce((acc, f) => acc + f.submission_count, 0))}
            </div>
            <div class="stat-description">all time</div>
          </div>
          <div class="stat-card">
            <h3>Draft Forms</h3>
            <div class="stat-value">
              {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(store.forms.filter((f) => !f.published).length)}
            </div>
            <div class="stat-description">not yet published</div>
          </div>
        </div>
      )}

      {/* ── Loading Skeleton ── */}
      {store.loading ? (
        <div style="padding:1rem;display:flex;flex-direction:column;gap:0.5rem;flex:1;">
          {[1, 2, 3].map((i) => (
            <div key={i} style="display:flex;align-items:center;gap:1rem;padding:1rem;background:var(--surface-2);border-radius:0.5rem;animation:pulse 2s cubic-bezier(0.4,0,0.6,1) infinite;">
              <div style="width:2rem;height:1.5rem;background:var(--border);border-radius:0.25rem;" />
              <div style="flex:1;height:1.5rem;background:var(--border);border-radius:0.25rem;" />
              <div style="flex:2;height:1.5rem;background:var(--border);border-radius:0.25rem;" />
              <div style="width:4rem;height:1.5rem;background:var(--border);border-radius:1rem;" />
              <div style="width:3rem;height:1.5rem;background:var(--border);border-radius:0.25rem;" />
            </div>
          ))}
        </div>

      ) : products.length === 0 ? (
        /* ── Empty State ── */
        <section class="flex flex-col items-center justify-center py-20 px-4 text-center bg-surface-2 rounded-2xl border border-divider">
          <div class="w-16 h-16 bg-surface-3 rounded-full flex items-center justify-center mb-6 text-primary">
            <LuFileText class="w-8 h-8" />
          </div>
          <h2 class="text-2xl font-semibold text-primary mb-3">No forms yet</h2>
          <p class="text-secondary max-w-md mb-8">
            Create forms to collect leads, feedback, applications, and more — directly from your audience.
          </p>
          <button
            type="button"
            class="btn btn-primary px-8 py-3 rounded-xl shadow-lg shadow-accent/20"
            onClick$={$(() => { showCreate.value = true; })}
          >
            Create your first form
          </button>
        </section>

      ) : (
        /* ── Forms Table ── */
        <ProductTable
          products={{ value: products } as any}
          pathPrefix="/dashboard/forms/"
          showPrice={false}
          showSales={false}
          showStatus={true}
          showEdit={true}
          showView={false}
          showDelete={true}
          onEdit$={$(async (id: string) => {
            window.sessionStorage.setItem("__bk_edit_form_id", id);
            await nav(`/dashboard/forms/default/edit/`);
          })}
          onDelete$={$((id: string) => {
            deleteId.value = id;
          })}
          onToggleStatus$={$(async (id: string, published: boolean) => {
            await toggleFormPublishedIPC(id, published);
            await store.refresh();
          })}
          extraActions$={$((form: ProductItem) => (
            <>
              {/* Submissions */}
              <button
                type="button"
                title="View Submissions"
                onClick$={$(async () => {
                  window.sessionStorage.setItem("__bk_edit_form_id", form.id);
                  await nav(`/dashboard/forms/default/submissions/`);
                })}
                style="padding:0.375rem;background:var(--surface-3);border:1px solid var(--border);border-radius:0.5rem;cursor:pointer;display:flex;color:var(--text-secondary);"
              >
                <LuInbox style="width:1rem;height:1rem;" />
              </button>

              {/* Copy Link */}
              <button
                type="button"
                title={copiedId.value === form.id ? "Copied!" : "Copy form link"}
                onClick$={$(async () => {
                  try {
                    await navigator.clipboard.writeText(`${window.location.origin}/form/${form.id}`);
                    copiedId.value = form.id;
                    setTimeout(() => { copiedId.value = null; }, 2000);
                  } catch { /* ignore */ }
                })}
                style={`padding:0.375rem;background:var(--surface-3);border:1px solid var(--border);border-radius:0.5rem;cursor:pointer;display:flex;${copiedId.value === form.id ? "color:var(--success);border-color:var(--success);" : "color:var(--text-secondary);"}`}
              >
                <LuLink style="width:1rem;height:1rem;" />
              </button>

              {/* Settings */}
              <button
                type="button"
                title="Form settings"
                onClick$={$(() => {
                  settingsFormId.value    = form.id;
                  settingsFormTitle.value = form.title;
                  settingsModalOpen.value = true;
                })}
                style="padding:0.375rem;background:var(--surface-3);border:1px solid var(--border);border-radius:0.5rem;cursor:pointer;display:flex;color:var(--text-secondary);"
              >
                <LuSettings style="width:1rem;height:1rem;" />
              </button>
            </>
          ))}
        >
          <button
            q:slot="headerActions"
            type="button"
            class="btn btn-primary"
            style="height:32px;padding:0 1rem;display:flex;align-items:center;white-space:nowrap;"
            onClick$={$(() => { showCreate.value = true; })}
          >
            + New Form
          </button>
        </ProductTable>
      )}
    </div>
  );
});

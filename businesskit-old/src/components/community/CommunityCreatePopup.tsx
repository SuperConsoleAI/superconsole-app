/* eslint-disable */
// @ts-nocheck
import { component$, useStylesScoped$, useSignal, useStore, type PropFunction, $ } from "@builder.io/qwik";
import { createCommunity, authStatus } from "~/lib/ipc";

const STYLES = `
  .modal-overlay {
    position: fixed;
    top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 1rem;
    backdrop-filter: blur(4px);
  }
  .form-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: 1rem;
    padding: 2rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    width: 100%;
    max-width: 600px;
    max-height: 90vh;
    overflow-y: auto;
    position: relative;
  }
  .close-btn {
    position: absolute;
    top: 1rem; right: 1rem;
    background: none; border: none;
    font-size: 1.5rem; cursor: pointer; color: var(--text-secondary);
  }
  .close-btn:hover { color: var(--text-primary); }
  .form-title { font-size: 1.2rem; font-weight: 700; color: var(--text-primary); margin-bottom: 0.25rem; }
  .form-row { display: flex; flex-direction: column; gap: 0.4rem; }
  .form-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 520px) { .form-row-2 { grid-template-columns: 1fr; } }
  label { font-size: 0.82rem; font-weight: 600; color: var(--text-secondary); }
  .form-input {
    padding: 0.6rem 0.85rem;
    border-radius: 0.6rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-primary);
    font-size: 0.9rem;
    width: 100%;
    box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .form-input:focus { outline: none; border-color: var(--accent); }
  .form-textarea { min-height: 100px; resize: vertical; }
  .form-select { appearance: none; }
  .form-hint { font-size: 0.75rem; color: var(--text-secondary); }
  .btn-row { display: flex; gap: 0.75rem; justify-content: flex-end; }
  .btn {
    padding: 0.6rem 1.4rem;
    border-radius: 0.6rem;
    font-size: 0.88rem;
    font-weight: 600;
    border: none;
    cursor: pointer;
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    transition: opacity 0.15s;
  }
  .btn:hover { opacity: 0.9; }
  .btn-primary { background: var(--button-primary-bg); color: var(--button-primary-text); }
  .btn-ghost { background: var(--surface); color: var(--text-primary); border: 1px solid var(--border); }
  .error-banner {
    background: #fee2e2; color: #991b1b;
    border-radius: 0.6rem; padding: 0.7rem 1rem;
    font-size: 0.85rem; border: 1px solid #fca5a5;
  }
  .section-divider {
    border: none; border-top: 1px solid var(--border); margin: 0.25rem 0;
  }
`;

import { AppContext } from "~/lib/app-context";
import { useContext } from "@builder.io/qwik";

export default component$((props: { onClose$: PropFunction<() => void>; onCreated$: PropFunction<(c: any) => void> }) => {
  useStylesScoped$(STYLES);
  
  const appCtx = useContext(AppContext);

  const form = useStore({
    title: "",
    slug: "",
    accessType: "free",
    price: "",
    tagline: "",
    description: "",
    isPublic: "1"
  });
  
  const isSubmitting = useSignal(false);
  const error = useSignal<string | null>(null);

  const handleSave$ = $(async () => {
    if (!form.title.trim()) {
      error.value = "Community Name is required.";
      return;
    }
    isSubmitting.value = true;
    error.value = null;

    const activeProfile = appCtx.profiles.value.find(p => p.id === appCtx.activeProfileId.value);
    
    try {
      const session = await authStatus();
      const newComm = await createCommunity({
        name: form.title,
        slug: form.slug || form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""),
        description: form.description,
        is_private: form.accessType === "invite_only",
        user_id: activeProfile?.user_id,
        user_email: session?.email,
        user_name: activeProfile?.title,
        user_avatar: activeProfile?.avatar_url,
      });
      props.onCreated$(newComm);
    } catch (err: any) {
      console.error("CREATE COMMUNITY ERROR:", err);
      alert("Raw Error: " + (typeof err === 'string' ? err : JSON.stringify(err)));
      error.value = typeof err === 'string' ? err : (err?.message || "Failed to create community");
    } finally {
      isSubmitting.value = false;
    }
  });

  return (
    <div class="modal-overlay" onClick$={(e) => { if (e.target === e.currentTarget) props.onClose$(); }}>
      <div class="form-card">
        <button class="close-btn" onClick$={props.onClose$}>&times;</button>
        <div>
          <div class="form-title">Create a new community 🏘️</div>
          <div style="font-size:0.85rem;color:var(--text-secondary);margin-top:0.3rem;">
            Build a Skool-style community with posts, events, leaderboards and more.
          </div>
        </div>

        <div class="ccp-form">
          <div style="display:flex;flex-direction:column;gap:1.1rem;">
            {error.value && (
              <div class="error-banner">{error.value}</div>
            )}
            
            <div class="form-row">
              <label for="title">Community Name *</label>
              <input id="title" class="form-input" placeholder="e.g. The Growth Lab" required value={form.title} onInput$={(e) => {
                const val = (e.target as HTMLInputElement).value;
                form.title = val;
                form.slug = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
              }} />
            </div>

            <div class="form-row-2">
              <div class="form-row">
                <label for="slug">Slug (auto-generated)</label>
                <input id="slug" class="form-input" placeholder="growth-lab" value={form.slug} onInput$={(e) => form.slug = (e.target as HTMLInputElement).value} />
                <div class="form-hint">URL: /community/[slug]</div>
              </div>
              <div class="form-row">
                <label for="accessType">Access Type</label>
                <select id="accessType" class="form-input form-select" value={form.accessType} onChange$={(e) => form.accessType = (e.target as HTMLSelectElement).value}>
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                  <option value="invite_only">Invite Only</option>
                  <option value="application">Application</option>
                </select>
              </div>
            </div>

            {form.accessType === "paid" && (
              <div class="form-row-2">
                <div class="form-row">
                  <label for="price">Price (USD)</label>
                  <input id="price" type="number" min="0" step="0.01" class="form-input" placeholder="9.99" value={form.price} onInput$={(e) => form.price = (e.target as HTMLInputElement).value} />
                </div>
              </div>
            )}

            <div class="form-row">
              <label for="tagline">Tagline</label>
              <input id="tagline" class="form-input" placeholder="A short punchy description..." value={form.tagline} onInput$={(e) => form.tagline = (e.target as HTMLInputElement).value} />
            </div>

            <div class="form-row">
              <label for="description">Description</label>
              <textarea id="description" class="form-input form-textarea" placeholder="What's this community about?" value={form.description} onInput$={(e) => form.description = (e.target as HTMLTextAreaElement).value} />
            </div>

            <div class="form-row">
              <label for="isPublic">Visibility</label>
              <select id="isPublic" class="form-input form-select" value={form.isPublic} onChange$={(e) => form.isPublic = (e.target as HTMLSelectElement).value}>
                <option value="1">Public — visible on your profile</option>
                <option value="0">Unlisted — invite only</option>
              </select>
            </div>

            

            <div class="btn-row">
              <button type="button" class="btn btn-ghost" onClick$={props.onClose$}>Cancel</button>
              <button type="button" class="btn btn-primary" disabled={isSubmitting.value} onClick$={handleSave$}>
                {isSubmitting.value ? "Creating…" : "Create Community"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

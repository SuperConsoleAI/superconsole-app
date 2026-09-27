import { component$, useStylesScoped$, useSignal, $ } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";


export const AddContact = component$((props: { 
  isOpen: boolean; 
  onClose$: any;
  onSave$?: any;
}) => {
  useStylesScoped$(`
    .drawer-overlay {
      position: fixed; top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0,0,0,0.5); z-index: 50;
      opacity: 0; pointer-events: none; transition: opacity 0.3s;
    }
    .drawer-overlay.open { opacity: 1; pointer-events: auto; }
    .drawer-panel {
      position: fixed; top: 50%; left: 50%; width: 90%; max-width: 500px; max-height: 90vh;
      background: var(--surface-2); z-index: 51;
      transform: translate(-50%, -50%) scale(0.95); transition: transform 0.2s ease, opacity 0.2s ease;
      box-shadow: 0 10px 40px rgba(0,0,0,0.2);
      display: flex; flex-direction: column;
      overflow-y: auto;
      border-radius: 1rem;
      border: 1px solid var(--border);
      opacity: 0; pointer-events: none;
      box-sizing: border-box;
    }
    .drawer-panel.open { 
      transform: translate(-50%, -50%) scale(1); 
      opacity: 1; pointer-events: auto;
    }
    .drawer-head { 
      display: flex; justify-content: space-between; align-items: center;
      padding: 0 1.5rem; height: 3.5rem; border-bottom: 1px solid var(--border); 
      flex-shrink: 0;
    }
    .drawer-body { padding: 1.5rem; flex: 1; box-sizing: border-box; }
    .drawer-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--text-secondary); }
    .field-group { margin-bottom: 1.25rem; display: flex; flex-direction: column; }
    .field-label { display: block; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.35rem; font-weight: 500; }
    .field-input { width: 100%; box-sizing: border-box; border: 1px solid var(--border); padding: 0.5rem 0.75rem; border-radius: 0.5rem; background: var(--surface-1); color: var(--text-primary); }
    select.field-input { height: 36px; }
    .col-half { display: grid; grid-template-columns: 1fr 1fr; gap: 1.25rem; margin-bottom: 1.25rem; }
    .col-half .field-group { margin-bottom: 0; }
    .btn-save { background: var(--text-primary); color: var(--surface-1); padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 0.5rem; }
  `);

  const isSaving = useSignal(false);
  const errorMessage = useSignal("");

  const handleSubmit$ = $(async (e: SubmitEvent) => {

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    isSaving.value = true;
    errorMessage.value = "";

    try {
      await invoke('create_contact', {
        data: {
          first_name: formData.get("first_name") as string,
          last_name: formData.get("last_name") as string || null,
          email: formData.get("email") as string || null,
          company: formData.get("company") as string || null,
          status: formData.get("status") as string || "lead",
        }
      });
      if (props.onSave$) {
        await props.onSave$();
      }
      props.onClose$();
    } catch (err: any) {
      errorMessage.value = String(err);
    } finally {
      isSaving.value = false;
    }
  });

  if (!props.isOpen && !isSaving.value) return null;

  return (
    <div class={['drawer-overlay', props.isOpen ? 'open' : '']}>
      <div class="drawer-overlay" onClick$={props.onClose$}></div>
      <div class={['drawer-panel', props.isOpen ? 'open' : '']}>
        <div class="drawer-head">
          <h2 style="margin:0;font-size:1.25rem;font-weight:600;">Add New Contact</h2>
          <button class="drawer-close" type="button" onClick$={props.onClose$}>&times;</button>
        </div>
        <div class="drawer-body">
          <form preventdefault:submit onSubmit$={handleSubmit$}>
            <div class="col-half">
              <div class="field-group">
                <label class="field-label">First Name *</label>
                <input type="text" name="first_name" class="field-input" required placeholder="John" />
              </div>
              <div class="field-group">
                <label class="field-label">Last Name</label>
                <input type="text" name="last_name" class="field-input" placeholder="Doe" />
              </div>
            </div>

            <div class="col-half">
              <div class="field-group">
                <label class="field-label">Email</label>
                <input type="email" name="email" class="field-input" placeholder="john@example.com" />
              </div>
              <div class="field-group">
                <label class="field-label">Company</label>
                <input type="text" name="company" class="field-input" placeholder="Acme Inc" />
              </div>
            </div>

            <div class="field-group">
              <label class="field-label">Initial Status</label>
              <select name="status" class="field-input">
                <option value="lead">Lead</option>
                <option value="prospect">Prospect</option>
                <option value="customer">Customer</option>
              </select>
            </div>

            <button type="submit" class="btn-save" disabled={isSaving.value}>
              {isSaving.value ? "Saving..." : "Add Contact"}
            </button>
            {errorMessage.value && <div style="color:var(--error);font-size:0.875rem;margin-top:0.5rem;text-align:center;">{errorMessage.value}</div>}
          </form>
        </div>
      </div>
    </div>
  );
});

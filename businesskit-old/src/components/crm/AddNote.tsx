import { component$, useStylesScoped$, useSignal, $, type PropFunction } from "@builder.io/qwik";
import { invoke } from "@tauri-apps/api/core";

export const AddNote = component$((props: {
  isOpen: boolean;
  onClose$: PropFunction<() => void>;
  contactId: string;
  dealId?: string;
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
    .drawer-panel.open { transform: translate(-50%, -50%) scale(1); opacity: 1; pointer-events: auto; }
    .drawer-head { display: flex; justify-content: space-between; align-items: center; padding: 0 1.5rem; height: 3.5rem; border-bottom: 1px solid var(--border); flex-shrink: 0; }
    .drawer-body { padding: 1.5rem; flex: 1; box-sizing: border-box; }
    .drawer-close { background: none; border: none; font-size: 1.25rem; cursor: pointer; color: var(--text-secondary); }
    .field-group { margin-bottom: 1.25rem; display: flex; flex-direction: column; }
    .field-label { display: block; font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 0.35rem; font-weight: 500; }
    .field-input { width: 100%; box-sizing: border-box; border: 1px solid var(--border); padding: 0.5rem 0.75rem; border-radius: 0.5rem; background: var(--surface-1); color: var(--text-primary); }
    .btn-save { background: var(--button-primary-bg); color: var(--button-primary-text); padding: 0.75rem 1.5rem; border: none; border-radius: 0.5rem; font-weight: 600; cursor: pointer; width: 100%; margin-top: 0.5rem; }
    .btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
  `);

  const loading = useSignal(false);
  const errorMsg = useSignal("");

  const handleSubmit = $(async (e: Event) => {

    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    const body = formData.get("body") as string;
    
    if (!body) {
      errorMsg.value = "Note body is required.";
      return;
    }

    loading.value = true;
    errorMsg.value = "";
    
    try {
      await invoke("create_note", {
        data: {
          contact_id: props.contactId,
          deal_id: props.dealId || null,
          body: body
        }
      });
      props.onClose$();
      window.location.reload();
    } catch (err: any) {
      errorMsg.value = err.message || String(err);
    } finally {
      loading.value = false;
    }
  });

  if (!props.isOpen && !loading.value) return null;

  return (
    <div class={["drawer-overlay", props.isOpen ? "open" : ""]}>
      <div class="drawer-overlay" onClick$={props.onClose$}></div>
      <div class={["drawer-panel", props.isOpen ? "open" : ""]}>
        <div class="drawer-head">
          <h2 style="margin:0;font-size:1.25rem;font-weight:600;">Add Note</h2>
          <button type="button" class="drawer-close" onClick$={props.onClose$}>&times;</button>
        </div>
        <div class="drawer-body">
          <form preventdefault:submit onSubmit$={handleSubmit}>

            <div class="field-group">
              <label class="field-label">Note *</label>
              <textarea
                name="body"
                class="field-input"
                rows={5}
                required
                placeholder="Write your note here..."
                style="resize: vertical;"
              ></textarea>
            </div>

            <button type="submit" class="btn-save" disabled={loading.value}>
              {loading.value ? "Saving..." : "Save Note"}
            </button>
            {errorMsg.value && (
              <div style="color:var(--error);font-size:0.875rem;margin-top:0.5rem;text-align:center;">{errorMsg.value}</div>
            )}
          </form>
        </div>
      </div>
    </div>
  );
});

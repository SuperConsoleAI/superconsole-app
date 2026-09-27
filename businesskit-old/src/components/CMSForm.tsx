import { $, component$, useSignal, type PropFunction } from "@builder.io/qwik";
import { updateCms } from "~/lib/ipc";
import type { CmsRow } from "~/lib/types";

type CMSFormProps = {
  record: CmsRow;
  onClose$: PropFunction<() => void>;
  onSaved$: PropFunction<(updated: CmsRow) => void>;
};

const Toggle = component$<{
  label: string;
  checked: boolean;
  onChange$: PropFunction<(val: boolean) => void>;
}>(({ label, checked, onChange$ }) => (
  <div style="display:flex;align-items:center;justify-content:space-between;padding:0.75rem 0;border-bottom:1px solid var(--border);">
    <span style="font-size:0.875rem;color:var(--text-primary);">{label}</span>
    <button
      type="button"
      onClick$={() => onChange$(!checked)}
      style={`position:relative;width:40px;height:22px;background:${checked ? 'var(--text-primary)' : 'var(--surface-3)'};border:1px solid ${checked ? 'var(--text-primary)' : 'var(--border)'};border-radius:11px;cursor:pointer;transition:all 0.2s;padding:0;`}
    >
      <div style={`position:absolute;top:50%;left:${checked ? 'calc(100% - 18px)' : '2px'};transform:translateY(-50%);width:16px;height:16px;background:${checked ? 'var(--surface-1)' : 'var(--text-primary)'};border-radius:50%;transition:all 0.2s;box-shadow:0 1px 2px rgba(0,0,0,0.2);`} />
    </button>
  </div>
));

export const CMSForm = component$<CMSFormProps>(({ record, onClose$, onSaved$ }) => {
  const title = useSignal(record.title);
  const description = useSignal(record.description ?? "");
  const navActive = useSignal(record.nav_active === 1);
  const menuActive = useSignal(record.menu_active === 1);
  const footerActive = useSignal(record.footer_active === 1);
  const subscribeForm = useSignal(record.subscribe_form === 1);
  const saving = useSignal(false);
  const error = useSignal("");

  const handleSave$ = $(async () => {
    if (!title.value.trim()) { error.value = "Title is required."; return; }
    saving.value = true;
    error.value = "";
    try {
      const updated = await updateCms(record.id, {
        title: title.value.trim(),
        description: description.value.trim(),
        nav_active: navActive.value ? 1 : 0,
        menu_active: menuActive.value ? 1 : 0,
        footer_active: footerActive.value ? 1 : 0,
        subscribe_form: subscribeForm.value ? 1 : 0,
      });
      await onSaved$(updated);
    } catch (e: any) {
      error.value = e.message || "Failed to save.";
    } finally {
      saving.value = false;
    }
  });

  return (
    /* Backdrop */
    <div
      style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;padding:1rem;"
      onClick$={(e) => { if ((e.target as HTMLElement).dataset.backdrop) onClose$(); }}
      data-backdrop="1"
    >
      <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:1rem;width:100%;max-width:520px;padding:2rem;display:flex;flex-direction:column;gap:1.25rem;max-height:90vh;overflow-y:auto;">
        {/* Header */}
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h2 style="font-size:1.125rem;font-weight:600;color:var(--text-primary);margin:0;">
            Edit — {record.title}
          </h2>
          <button
            type="button"
            onClick$={onClose$}
            style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);font-size:1.25rem;line-height:1;padding:0.25rem;"
          >✕</button>
        </div>

        {error.value && (
          <div style="padding:0.75rem 1rem;background:var(--error-soft,#fee2e2);border:1px solid var(--error,#ef4444);border-radius:0.5rem;color:var(--error,#dc2626);font-size:0.875rem;">
            {error.value}
          </div>
        )}

        {/* Title */}
        <div>
          <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-secondary);margin-bottom:0.375rem;">Title</label>
          <input
            type="text"
            value={title.value}
            onInput$={(e) => { title.value = (e.target as HTMLInputElement).value; }}
            style="width:100%;padding:0.625rem 0.75rem;background:var(--surface);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;"
          />
        </div>

        {/* Description */}
        <div>
          <label style="display:block;font-size:0.8125rem;font-weight:500;color:var(--text-secondary);margin-bottom:0.375rem;">Description</label>
          <textarea
            rows={3}
            value={description.value}
            onInput$={(e) => { description.value = (e.target as HTMLTextAreaElement).value; }}
            style="width:100%;padding:0.625rem 0.75rem;background:var(--surface);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;resize:vertical;"
          />
        </div>

        {/* Settings */}
        <div style="display:flex;flex-direction:column;gap:0.25rem;margin-top:0.5rem;">
          <Toggle label="Show in Top Navigation" checked={navActive.value} onChange$={$(v => navActive.value = v)} />
          <Toggle label="Show in Global Menu" checked={menuActive.value} onChange$={$(v => menuActive.value = v)} />
          <Toggle label="Show in Footer" checked={footerActive.value} onChange$={$(v => footerActive.value = v)} />
          <Toggle label="Show Email Subscribe Form" checked={subscribeForm.value} onChange$={$(v => subscribeForm.value = v)} />
        </div>

        {/* Actions */}
        <div style="display:flex;justify-content:flex-end;gap:0.75rem;margin-top:0.5rem;">
          <button
            type="button"
            onClick$={onClose$}
            style="padding:0.625rem 1rem;background:var(--surface-3);border:1px solid var(--border);border-radius:0.5rem;color:var(--text-primary);font-size:0.875rem;font-weight:500;cursor:pointer;"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick$={handleSave$}
            disabled={saving.value}
            style={`padding:0.625rem 1.25rem;background:var(--accent);border:none;border-radius:0.5rem;color:#fff;font-size:0.875rem;font-weight:500;cursor:${saving.value ? 'not-allowed' : 'pointer'};opacity:${saving.value ? 0.7 : 1};`}
          >
            {saving.value ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
});

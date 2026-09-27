import { component$, useSignal, useStore, useTask$, type Signal, type PropFunction, $ } from "@builder.io/qwik";
import { SlideOver } from "./SlideOver";
import { LuLoader, LuSave } from "@qwikest/icons/lucide";

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--surface-1)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.8125rem",
  outline: "none",
  transition: "border-color 150ms ease",
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

interface FormState {
  title: string;
  description: string;
  icon: string;
  category_id: string;
  parent_id: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  description: "",
  icon: "",
  category_id: "",
  parent_id: "",
};

interface CollectionModalProps {
  isOpen: Signal<boolean>;
  hubs: { id: string; title: string }[];
  collections: { id: string; title: string; category_id?: string | null }[];
  initialData?: {
    id?: string;
    title: string;
    description?: string;
    icon?: string;
    category_id?: string;
    parent_id?: string;
  };
  onClose$: PropFunction<() => void>;
  onSave$: PropFunction<(data: {
    title: string;
    description: string;
    icon: string;
    category_id: string;
    parent_id: string;
  }) => Promise<void>>;
}

export const CollectionModal = component$<CollectionModalProps>(({ isOpen, hubs, collections, initialData, onClose$, onSave$ }) => {
  const form = useStore<FormState>({ ...EMPTY_FORM });
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);
  const isEditMode = useSignal(false);

  useTask$(({ track }) => {
    const open = track(() => isOpen.value);
    const data = track(() => initialData);

    if (!open) {
      Object.assign(form, EMPTY_FORM);
      error.value = null;
      saving.value = false;
      isEditMode.value = false;
      return;
    }

    if (data && data.id) {
      isEditMode.value = true;
      form.title = data.title || "";
      form.description = data.description || "";
      form.icon = data.icon || "";
      form.category_id = data.category_id || "";
      form.parent_id = data.parent_id || "";
    } else {
      isEditMode.value = false;
      Object.assign(form, EMPTY_FORM);
    }
    error.value = null;
  });

  const handleSave$ = $(async () => {
    if (!form.title.trim()) {
      error.value = "Title is required.";
      return;
    }

    saving.value = true;
    error.value = null;

    try {
      await onSave$({
        title: form.title.trim(),
        description: form.description.trim(),
        icon: form.icon.trim(),
        category_id: form.category_id,
        parent_id: form.parent_id
      });
      onClose$();
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  return (
    <SlideOver
      open={isOpen}
      title={isEditMode.value ? "Edit Collection" : "Add Collection"}
      subtitle={isEditMode.value ? "Update the details below and save." : "Fill in the details below to add a new collection."}
      width="520px"
      onClose$={onClose$}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {error.value && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "0.375rem",
              color: "var(--error)",
              fontSize: "0.8125rem",
              lineHeight: "1.5",
            }}
          >
            {error.value}
          </div>
        )}

        <div>
          <label style={labelStyle}>
            Title <span style="color:var(--error);">*</span>
          </label>
          <input
            type="text"
            value={form.title}
            onInput$={(e) => { form.title = (e.target as HTMLInputElement).value; }}
            placeholder="e.g. Summer Collection"
            style={inputStyle}
            onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
            onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
        </div>

        <div>
          <label style={labelStyle}>Icon (Emoji)</label>
          <input
            type="text"
            value={form.icon}
            onInput$={(e) => { form.icon = (e.target as HTMLInputElement).value; }}
            placeholder="e.g. 🌴"
            style={inputStyle}
            onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
            onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
        </div>

        <div>
          <label style={labelStyle}>Description</label>
          <textarea
            value={form.description}
            onInput$={(e) => { form.description = (e.target as HTMLTextAreaElement).value; }}
            placeholder="Short description..."
            rows={3}
            style={{ ...inputStyle, resize: "vertical" }}
            onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
            onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
          />
        </div>

        <div>
          <label style={labelStyle}>Category Scope</label>
          <select
            value={form.category_id}
            onChange$={(e) => { form.category_id = (e.target as HTMLSelectElement).value; }}
            style={{
              ...inputStyle,
              cursor: "pointer",
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0.75rem center",
              paddingRight: "2.25rem",
            }}
          >
            <option value="">Global (No specific category)</option>
            {hubs.map((hub) => (
              <option key={hub.id} value={hub.id}>
                {hub.title}
              </option>
            ))}
          </select>
          <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: "0.25rem 0 0" }}>
            Restrict this collection so it only appears in a specific CMS Hub category.
          </p>
        </div>

        <div>
          <label style={labelStyle}>Parent Collection</label>
          <select
            value={form.parent_id}
            onChange$={(e) => { form.parent_id = (e.target as HTMLSelectElement).value; }}
            style={{
              ...inputStyle,
              cursor: "pointer",
              appearance: "none",
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
              backgroundRepeat: "no-repeat",
              backgroundPosition: "right 0.75rem center",
              paddingRight: "2.25rem",
            }}
          >
            <option value="">None (Top level)</option>
            {collections.filter(c => c.id !== initialData?.id).map((col) => (
              <option key={col.id} value={col.id}>
                {`${col.title} ${col.category_id ? `[${col.category_id}]` : ""}`.trim()}
              </option>
            ))}
          </select>
          <p style={{ fontSize: "0.75rem", color: "var(--text-3)", margin: "0.25rem 0 0" }}>
            Nest this collection under another existing collection.
          </p>
        </div>

        {/* ── Save button ───────────────────────────────────────────────── */}
        <div
          style={{
            position: "sticky",
            bottom: "-1.5rem",
            margin: "0 -1.5rem -1.5rem",
            padding: "1rem 1.5rem",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <button
            onClick$={handleSave$}
            disabled={saving.value}
            style={{
              width: "100%",
              height: "2.625rem",
              background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
              color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: saving.value ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "background 150ms ease, opacity 150ms ease",
            }}
          >
            {saving.value ? (
              <>
                <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                Saving…
              </>
            ) : (
              <>
                <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                {isEditMode.value ? "Save Changes" : "Add Collection"}
              </>
            )}
          </button>
        </div>
      </div>
    </SlideOver>
  );
});

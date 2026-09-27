// src/components/FormModal.tsx
//
// WHAT:  Form settings SlideOver — edit title, description, slug, image_url,
//        published, accepting_responses, hidden, background, layout, email_notification.
//        All fields from the `forms` schema.
//
// HOW:   Opened from FormsBuilderActions settings icon (on detail pages) or from
//        the settings icon on the forms table row.
//        On save: calls updateFormIPC, syncs title back into FormsBuilderCtx.
//        Pattern mirrors LinkModal.tsx: SlideOver + useStore + IPC save.

import {
  component$,
  useSignal,
  useStore,
  useTask$,
  useContext,
  $,
  type Signal,
} from "@builder.io/qwik";
import { LuSave, LuLoader } from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { updateFormIPC } from "~/lib/ipc";
import { FormsBuilderCtx } from "~/lib/forms-builder-context";

// ── Shared input styles ───────────────────────────────────────────────────────
const inp = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
};
const lbl = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

function SectionTitle({ children }: { children: string }) {
  return (
    <div style={{
      fontSize: "0.75rem", fontWeight: "600",
      color: "var(--text-secondary)", textTransform: "uppercase",
      letterSpacing: "0.06em", marginBottom: "0.875rem",
      paddingBottom: "0.5rem", borderBottom: "1px solid var(--border)",
    }}>
      {children}
    </div>
  );
}


// ── Props & state ─────────────────────────────────────────────────────────────

export interface FormModalProps {
  open: Signal<boolean>;
  formId: string;
  /** When provided (from forms list), we don't try to read context */
  initialTitle?: string;
}

interface ModalState {
  title: string;
  description: string;
  slug: string;
  image_url: string;
  background: string;
  layout: string;
  published: boolean;
  accepting_responses: boolean;
  hidden: boolean;
  email_notification: boolean;
}

const EMPTY: ModalState = {
  title: "", description: "", slug: "", image_url: "",
  background: "", layout: "classic",
  published: false, accepting_responses: true,
  hidden: false, email_notification: false,
};

const LAYOUTS = [
  { value: "classic",         label: "Classic" },
  { value: "card",            label: "Card" },
  { value: "conversational",  label: "Conversational" },
  { value: "minimal",         label: "Minimal" },
];

// ── Component ─────────────────────────────────────────────────────────────────

export const FormModal = component$<FormModalProps>(({ open, formId, initialTitle }) => {
  const ctx    = useContext(FormsBuilderCtx);
  const saving = useSignal(false);
  const error  = useSignal<string | null>(null);
  const form   = useStore<ModalState>({ ...EMPTY });

  // Signals we can safely capture in $ closures
  const ctxFormTitle = ctx.formTitle;

  // Seed form when panel opens
  useTask$(({ track }) => {
    const isOpen = track(() => open.value);
    if (!isOpen) { error.value = null; return; }
    form.title              = initialTitle ?? ctxFormTitle.value ?? "";
    form.description        = "";
    form.slug               = "";
    form.image_url          = "";
    form.background         = "";
    form.layout             = "classic";
    form.published          = false;
    form.accepting_responses = true;
    form.hidden             = false;
    form.email_notification = false;
    error.value             = null;
  });

  const handleSave$ = $(async () => {
    if (!form.title.trim()) { error.value = "Title is required."; return; }
    saving.value = true;
    error.value  = null;
    try {
      await updateFormIPC(formId, {
        title:               form.title.trim(),
        description:         form.description.trim() || null,
        slug:                form.slug.trim() || null,
        image_url:           form.image_url.trim() || null,
        background:          form.background.trim() || null,
        layout:              form.layout || "classic",
        published:           form.published,
        accepting_responses: form.accepting_responses,
        hidden:              form.hidden,
        email_notification:  form.email_notification,
      });
      ctxFormTitle.value = form.title.trim();
      open.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const rowStyle = {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: "0.75rem 1rem",
    background: "var(--surface-3)", border: "1px solid var(--border)",
    borderRadius: "0.375rem",
  };

  return (
    <SlideOver open={open} title="Form Settings" subtitle="Update your form details and settings." width="480px">
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

        {/* Error */}
        {error.value && (
          <div style={{
            padding: "0.75rem 1rem",
            background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)",
            borderRadius: "0.375rem", color: "var(--error)", fontSize: "0.8125rem",
          }}>
            {error.value}
          </div>
        )}

        {/* ═══ Basic ═══════════════════════════════════════════════════════ */}
        <div>
          <SectionTitle>Basic</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            <div>
              <label style={lbl}>Title <span style="color:var(--error);">*</span></label>
              <input
                type="text" value={form.title}
                onInput$={(e) => { form.title = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. Contact Form"
                style={inp}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>

            <div>
              <label style={lbl}>Description</label>
              <textarea
                value={form.description}
                onInput$={(e) => { form.description = (e.target as HTMLTextAreaElement).value; }}
                placeholder="Short subtitle shown at the top of the form…"
                rows={3}
                style={{ ...inp, resize: "vertical", minHeight: "5rem", fontFamily: "inherit", lineHeight: "1.5" }}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>

            <div>
              <label style={lbl}>Slug <span style={{ color: "var(--text-secondary)", fontWeight: "400" }}>(optional)</span></label>
              <input
                type="text" value={form.slug}
                onInput$={(e) => { form.slug = (e.target as HTMLInputElement).value.toLowerCase().replace(/[^a-z0-9-]/g, "-"); }}
                placeholder="e.g. contact-form"
                style={inp}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.25rem" }}>
                Used in the public form URL. Leave blank to auto-generate.
              </div>
            </div>
          </div>
        </div>

        {/* ═══ Media ═══════════════════════════════════════════════════════ */}
        <div>
          <SectionTitle>Media</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>

            <div>
              <label style={lbl}>Cover Image URL</label>
              <input
                type="url" value={form.image_url}
                onInput$={(e) => { form.image_url = (e.target as HTMLInputElement).value; }}
                placeholder="https://…"
                style={inp}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
              {form.image_url && (
                <img
                  src={form.image_url}
                  alt="Cover preview"
                  width="400" height="128"
                  style={{ marginTop: "0.5rem", width: "100%", height: "8rem", objectFit: "cover", borderRadius: "0.375rem", border: "1px solid var(--border)" }}
                  onError$={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
            </div>

            <div>
              <label style={lbl}>Background <span style={{ color: "var(--text-secondary)", fontWeight: "400" }}>(preset key or image URL)</span></label>
              <input
                type="text" value={form.background}
                onInput$={(e) => { form.background = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. gradient-purple or https://…"
                style={inp}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>
          </div>
        </div>

        {/* ═══ Layout ══════════════════════════════════════════════════════ */}
        <div>
          <SectionTitle>Layout</SectionTitle>
          <div>
            <label style={lbl}>Form Style</label>
            <select
              value={form.layout}
              onChange$={(e) => { form.layout = (e.target as HTMLSelectElement).value; }}
              style={{ ...inp, cursor: "pointer", appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23808080' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat", backgroundPosition: "right 0.75rem center", paddingRight: "2.25rem",
              }}
            >
              {LAYOUTS.map((l) => (
                <option key={l.value} value={l.value}>{l.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* ═══ Visibility & Settings ═══════════════════════════════════════ */}
        <div>
          <SectionTitle>Visibility &amp; Settings</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>

            <div style={rowStyle}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Published</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Make this form publicly accessible</div>
              </div>
              <button type="button" onClick$={() => { form.published = !form.published; }}
                role="switch" aria-checked={form.published}
                style={{ width:"2.75rem",height:"1.5rem",borderRadius:"9999px",border:"none",cursor:"pointer",background:form.published?"var(--accent)":"var(--border)",position:"relative",transition:"background 200ms ease",flexShrink:"0" }}
              ><span style={{ position:"absolute",top:"0.1875rem",left:form.published?"1.3125rem":"0.1875rem",width:"1.125rem",height:"1.125rem",background:"white",borderRadius:"9999px",transition:"left 200ms ease",boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} /></button>
            </div>

            <div style={rowStyle}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Accepting Responses</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Pause without unpublishing</div>
              </div>
              <button type="button" onClick$={() => { form.accepting_responses = !form.accepting_responses; }}
                role="switch" aria-checked={form.accepting_responses}
                style={{ width:"2.75rem",height:"1.5rem",borderRadius:"9999px",border:"none",cursor:"pointer",background:form.accepting_responses?"var(--accent)":"var(--border)",position:"relative",transition:"background 200ms ease",flexShrink:"0" }}
              ><span style={{ position:"absolute",top:"0.1875rem",left:form.accepting_responses?"1.3125rem":"0.1875rem",width:"1.125rem",height:"1.125rem",background:"white",borderRadius:"9999px",transition:"left 200ms ease",boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} /></button>
            </div>

            <div style={rowStyle}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Hidden</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Accessible via direct URL but not listed publicly</div>
              </div>
              <button type="button" onClick$={() => { form.hidden = !form.hidden; }}
                role="switch" aria-checked={form.hidden}
                style={{ width:"2.75rem",height:"1.5rem",borderRadius:"9999px",border:"none",cursor:"pointer",background:form.hidden?"var(--accent)":"var(--border)",position:"relative",transition:"background 200ms ease",flexShrink:"0" }}
              ><span style={{ position:"absolute",top:"0.1875rem",left:form.hidden?"1.3125rem":"0.1875rem",width:"1.125rem",height:"1.125rem",background:"white",borderRadius:"9999px",transition:"left 200ms ease",boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} /></button>
            </div>

            <div style={rowStyle}>
              <div>
                <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)" }}>Email Notifications</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>Send email on each new submission</div>
              </div>
              <button type="button" onClick$={() => { form.email_notification = !form.email_notification; }}
                role="switch" aria-checked={form.email_notification}
                style={{ width:"2.75rem",height:"1.5rem",borderRadius:"9999px",border:"none",cursor:"pointer",background:form.email_notification?"var(--accent)":"var(--border)",position:"relative",transition:"background 200ms ease",flexShrink:"0" }}
              ><span style={{ position:"absolute",top:"0.1875rem",left:form.email_notification?"1.3125rem":"0.1875rem",width:"1.125rem",height:"1.125rem",background:"white",borderRadius:"9999px",transition:"left 200ms ease",boxShadow:"0 1px 3px rgba(0,0,0,0.2)" }} /></button>
            </div>
          </div>
        </div>

        {/* ── Save footer ──────────────────────────────────────────────────── */}
        <div style={{
          position: "sticky", bottom: "-1.5rem",
          margin: "0 -1.5rem -1.5rem",
          padding: "1rem 1.5rem",
          background: "var(--surface-2)",
          borderTop: "1px solid var(--border)",
        }}>
          <button
            onClick$={handleSave$}
            disabled={saving.value}
            style={{
              width: "100%", height: "2.625rem",
              background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
              color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
              border: "none", borderRadius: "0.375rem",
              fontSize: "0.875rem", fontWeight: "600",
              cursor: saving.value ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem",
              transition: "background 150ms ease",
            }}
          >
            {saving.value
              ? <><LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" /> Saving…</>
              : <><LuSave style="width:1rem;height:1rem;" /> Save Changes</>
            }
          </button>
        </div>

      </div>
    </SlideOver>
  );
});

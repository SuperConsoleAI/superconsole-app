// src/routes/dashboard/forms/[id]/edit/index.tsx
//
// WHAT:  Form builder for the Tauri desktop app.
//        Exact port of businesskit-web/src/routes/dashboard/forms/[id]/edit/index.tsx
//        adapted for Tauri IPC (no routeLoader$, no routeAction$ — uses invoke()).
//
// HOW:   Exports BuilderContext, QUESTION_TYPES, getTypeInfo so the 3 sub-components
//        can import them without circular deps. Context holds all signals + handlers
//        matching the webapp's BuilderContext shape exactly.
//
// FLOW:
//   mount → listFormsIPC + listFormQuestionsIPC → populate signals
//   doSave → updateFormIPC + updateFormQuestionsIPC (delete-all + re-insert)
//   publish → toggleFormPublishedIPC
//   addQuestion → prepend with temp_* id, markDirty
//   deleteQuestion / duplicateQuestion / moveQuestion → mutate questions signal
//
// EXPORTS:
//   BuilderContext   — createContextId shared with QuestionSidebar/Preview/Details
//   QUESTION_TYPES   — full type catalogue (same as webapp)
//   getTypeInfo()    — lookup helper

import {
  component$, useSignal, $, useVisibleTask$,
  createContextId, useContextProvider, useContext,
} from "@builder.io/qwik";
import { useLocation, type StaticGenerateHandler } from "@builder.io/qwik-city";

export const onStaticGenerate: StaticGenerateHandler = () => ({
  params: ["default", "new"].map((id) => ({ id })),
});
import {
  listFormsIPC, listFormQuestionsIPC,
  updateFormIPC, updateFormQuestionsIPC, toggleFormPublishedIPC,
} from "~/lib/ipc";
import type { QuestionRow } from "~/lib/types";
import { FormsBuilderCtx } from "~/lib/forms-builder-context";
import { QuestionSidebar } from "~/components/forms/builder/QuestionSidebar";
import { QuestionPreview } from "~/components/forms/builder/QuestionPreview";
import { QuestionDetails } from "~/components/forms/builder/QuestionDetails";

// ── BuilderContext ────────────────────────────────────────────────────────────
// Shared with QuestionSidebar, QuestionPreview, QuestionDetails.
// Shape must match the webapp's BuilderContext exactly.

export const BuilderContext = createContextId<any>("builder-context");

import {
  LuFileText, LuType, LuAlignLeft, LuHash, LuMail, LuPhone, LuLink,
  LuMapPin, LuUser, LuCheckCircle, LuCheckSquare, LuChevronDown,
  LuListOrdered, LuCalendar, LuUploadCloud, LuPenTool, LuStar,
  LuBarChart2, LuPartyPopper
} from "@qwikest/icons/lucide";

// ── Question type catalogue (exact copy of webapp) ────────────────────────────
export const QUESTION_TYPES = [
  { id: "statement",    label: "Statement",      icon: LuFileText,    color: "#f97316", description: "Display text without requiring an answer" },
  { id: "short_text",   label: "Short Text",     icon: LuType,        color: "#3b82f6", description: "A single line of text" },
  { id: "long_text",    label: "Long Text",      icon: LuAlignLeft,   color: "#3b82f6", description: "A multi-line text block" },
  { id: "number",       label: "Number",         icon: LuHash,        color: "#8b5cf6", description: "Numeric input only" },
  { id: "email",        label: "Email",          icon: LuMail,        color: "#6366f1", description: "Email address format" },
  { id: "phone",        label: "Phone",          icon: LuPhone,       color: "#6366f1", description: "Phone number format" },
  { id: "url",          label: "Website URL",    icon: LuLink,        color: "#6366f1", description: "Website link format" },
  { id: "address",      label: "Address",        icon: LuMapPin,      color: "#ef4444", description: "Full street address" },
  { id: "contact_info", label: "Contact Info",   icon: LuUser,        color: "#0ea5e9", description: "Collect multiple contact details" },
  { id: "single_select",label: "Single Select",  icon: LuCheckCircle, color: "#22c55e", description: "Select one option from a list" },
  { id: "multi_select", label: "Multi Select",   icon: LuCheckSquare, color: "#22c55e", description: "Select multiple options" },
  { id: "dropdown",     label: "Dropdown",       icon: LuChevronDown, color: "#06b6d4", description: "Select one option from a dropdown" },
  { id: "ranking",      label: "Ranking",        icon: LuListOrdered, color: "#f59e0b", description: "Drag and drop to rank options" },
  { id: "date",         label: "Date",           icon: LuCalendar,    color: "#ec4899", description: "Select a date from a calendar" },
  { id: "file_upload",  label: "File Upload",    icon: LuUploadCloud, color: "#64748b", description: "Upload a file or image" },
  { id: "signature",    label: "Signature",      icon: LuPenTool,     color: "#a855f7", description: "Collect an e-signature" },
  { id: "rating",       label: "Star Rating",    icon: LuStar,        color: "#eab308", description: "Rate out of 5 stars" },
  { id: "nps",          label: "NPS Scale",      icon: LuBarChart2,   color: "#f97316", description: "Net Promoter Score from 0-10" },
  { id: "thank_you",    label: "Thank You Slide",icon: LuPartyPopper, color: "#10b981", description: "Show a completion message" },
];

export const getTypeInfo = (type: string) =>
  QUESTION_TYPES.find((t) => t.id === type) || { label: type, icon: LuType, color: "#6b7280", description: "" };

// ── Default thank-you settings ────────────────────────────────────────────────
const DEFAULT_THANK_YOU = {
  title: "Thank you! 🙌",
  message: "That's all. You may now close this window.",
  type: "none" as "none" | "button" | "redirect",
  button_text: "Create Form @ BusinessKit",
  button_url: "https://businesskit.io",
  redirect_url: "",
  redirect_message: "Redirecting, please wait...",
  redirect_delay: 2,
  show_confetti: false,
  social_share: false,
};

// ── Local question type ───────────────────────────────────────────────────────
// questions signal uses this type — options stored as JSON string (matches schema).
type LocalQuestion = {
  id: string;
  form_id: string;
  question_type: string;
  title: string;
  description: string | null;
  position: number;
  options: string;          // JSON [] — same as DB column
  embed_url: string | null;
  required: boolean;
  settings: string | null;
  button_text: string | null;
  image_url: string | null;
  placeholder: string | null;
  label: string | null;
  ai_follow_up: string | null;
};

export default component$(() => {
  const loc = useLocation();
  // Read formId from sessionStorage first (set before nav), then URL fallbacks
  const formId = typeof window !== "undefined"
    ? (() => {
        const stored = window.sessionStorage.getItem("__bk_edit_form_id");
        if (stored) { window.sessionStorage.removeItem("__bk_edit_form_id"); return stored; }
        return new URLSearchParams(window.location.search).get("id")
          || loc.url.searchParams.get("id")
          || (!(["default", "new"].includes(loc.params.id)) ? loc.params.id : "")
          || "";
      })()
    : (loc.params.id || "");

  // ── Signals ───────────────────────────────────────────────────────────────
  const questions       = useSignal<LocalQuestion[]>([]);
  const selectedId      = useSignal<string | null>(null);
  const formTitle       = useSignal("Untitled Form");
  const published       = useSignal(false);
  const showAddMenu     = useSignal(false);
  const dropdownId      = useSignal<string | null>(null);
  const dirty           = useSignal(false);
  const saving          = useSignal(false);
  const editingThankYou = useSignal(false);
  const thankYou        = useSignal({ ...DEFAULT_THANK_YOU });
  const showDetails     = useSignal(false);
  const publishing      = useSignal(false);
  const loading         = useSignal(true);

  // ── Load form + questions on mount ────────────────────────────────────────
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const [forms, qs] = await Promise.all([
        listFormsIPC(),
        listFormQuestionsIPC(formId),
      ]);
      const form = forms.find((f) => f.id === formId);
      if (form) {
        formTitle.value = form.title;
        published.value = form.published;
        // Parse thank_you_settings if stored
        if (form.thank_you_settings) {
          try {
            const parsed = typeof form.thank_you_settings === "string"
              ? JSON.parse(form.thank_you_settings)
              : form.thank_you_settings;
            thankYou.value = { ...DEFAULT_THANK_YOU, ...parsed };
          } catch { /* keep default */ }
        }
      }
      questions.value = qs.map((q: QuestionRow) => ({
        id: q.id,
        form_id: q.form_id,
        question_type: q.question_type,
        title: q.title,
        description: q.description,
        position: q.position,
        options: q.options || "[]",
        embed_url: q.embed_url,
        required: q.required,
        settings: q.settings,
        button_text: q.button_text,
        image_url: q.image_url,
        placeholder: q.placeholder,
        label: q.label,
        ai_follow_up: q.ai_follow_up,
      }));
      if (questions.value.length > 0 && !selectedId.value) {
        selectedId.value = questions.value[0].id;
      }
    } catch (e) {
      console.error("Failed to load form:", e);
    } finally {
      loading.value = false;
    }
  });

  // ── markDirty ─────────────────────────────────────────────────────────────
  const markDirty = $(() => { dirty.value = true; });

  // ── doSave — matches webapp useSaveForm pattern ──────────────────────────
  const doSave = $(async () => {
    if (saving.value) return;
    saving.value = true;
    try {
      // Serialise questions for IPC — map to QuestionData shape
      const payload = questions.value.map((q, i) => ({
        id: q.id,
        question_type: q.question_type,
        title: q.title,
        label: q.label,
        description: q.description,
        position: i,
        options: q.options,
        required: q.required,
        placeholder: q.placeholder,
        button_text: q.button_text,
        image_url: q.image_url,
        settings: q.settings,
        embed_url: q.embed_url,
      }));

      await Promise.all([
        updateFormQuestionsIPC(formId, payload),
        updateFormIPC(formId, {
          title: formTitle.value,
          thank_you_settings: JSON.stringify(thankYou.value),
        }),
      ]);

      dirty.value = false;
    } catch (e) {
      console.error("Save failed:", e);
    } finally {
      saving.value = false;
    }
  });

  // ── addQuestion ───────────────────────────────────────────────────────────
  const addQuestion = $((type: string) => {
    showAddMenu.value = false;
    const info = getTypeInfo(type);
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const hasOptions = ["single_select", "multi_select", "dropdown", "ranking"].includes(type);

    const newQ: LocalQuestion = {
      id: tempId,
      form_id: formId,
      question_type: type,
      title: type === "thank_you" ? "Thank you! 🙌" : info.label,
      description: type === "thank_you" ? "That's all. You may now close this window." : null,
      position: questions.value.length,
      options: hasOptions ? '["Option 1","Option 2","Option 3"]' : "[]",
      embed_url: null,
      required: false,
      settings: null,
      button_text: "Next",
      image_url: null,
      placeholder: null,
      label: null,
      ai_follow_up: null,
    };

    questions.value = [...questions.value, newQ];
    selectedId.value = tempId;
    editingThankYou.value = false;
    markDirty();
  });

  // ── deleteQuestion ────────────────────────────────────────────────────────
  const deleteQuestion = $((id: string) => {
    dropdownId.value = null;
    questions.value = questions.value.filter((q) => q.id !== id);
    if (selectedId.value === id) {
      selectedId.value = questions.value[0]?.id || null;
    }
    markDirty();
  });

  // ── duplicateQuestion ─────────────────────────────────────────────────────
  const duplicateQuestion = $((q: LocalQuestion, index: number) => {
    dropdownId.value = null;
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newQ: LocalQuestion = { ...q, id: tempId, title: q.title + " (copy)", position: index + 1 };
    const newList = [...questions.value];
    newList.splice(index + 1, 0, newQ);
    questions.value = newList;
    selectedId.value = tempId;
    markDirty();
  });

  // ── moveQuestion ──────────────────────────────────────────────────────────
  const moveQuestion = $((index: number, direction: "up" | "down") => {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= questions.value.length) return;
    const newList = [...questions.value];
    const [item] = newList.splice(index, 1);
    newList.splice(newIndex, 0, item);
    questions.value = newList.map((q, i) => ({ ...q, position: i }));
    markDirty();
  });

  // ── goToPrevQuestion / goToNextQuestion ───────────────────────────────────
  const goToPrevQuestion = $(() => {
    const idx = questions.value.findIndex((q) => q.id === selectedId.value);
    if (editingThankYou.value) {
      if (questions.value.length > 0) {
        editingThankYou.value = false;
        selectedId.value = questions.value[questions.value.length - 1].id;
      }
    } else if (idx > 0) {
      selectedId.value = questions.value[idx - 1].id;
    }
  });

  const goToNextQuestion = $(() => {
    const idx = questions.value.findIndex((q) => q.id === selectedId.value);
    if (idx >= 0 && idx < questions.value.length - 1) {
      selectedId.value = questions.value[idx + 1].id;
    } else if (idx === questions.value.length - 1) {
      editingThankYou.value = true;
      selectedId.value = null;
    }
  });

  // ── togglePublish ─────────────────────────────────────────────────────────
  const togglePublish = $(async () => {
    if (publishing.value || published.value) return;
    publishing.value = true;
    try {
      if (dirty.value) await doSave();
      await toggleFormPublishedIPC(formId, true);
      published.value = true;
    } catch (e) {
      console.error("Publish failed:", e);
    } finally {
      publishing.value = false;
    }
  });

  // ── Provide BuilderContext ───────────────────────────────────────────
  useContextProvider(BuilderContext, {
    questions, selectedId, editingThankYou, showAddMenu, dropdownId, thankYou,
    markDirty, moveQuestion, duplicateQuestion, deleteQuestion,
    showDetails, goToNextQuestion, goToPrevQuestion,
  });

  // ── Sync local signals into root FormsBuilderCtx so AppTopbar can read them
  // Root layout provides the context; we just push our local signals into it.
  const rootBuilder = useContext(FormsBuilderCtx);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    // Push local QRLs into the root signal slots
    if (rootBuilder._doSaveSlot)    rootBuilder._doSaveSlot.value    = doSave;
    if (rootBuilder._togglePubSlot) rootBuilder._togglePubSlot.value = togglePublish;
    // Sync scalar signals
    const syncAll = () => {
      rootBuilder.formTitle.value  = formTitle.value;
      rootBuilder.dirty.value      = dirty.value;
      rootBuilder.saving.value     = saving.value;
      rootBuilder.published.value  = published.value;
      rootBuilder.publishing.value = publishing.value;
    };
    syncAll();
    // Keep them in sync
    const interval = setInterval(syncAll, 100);
    cleanup(() => {
      clearInterval(interval);
      // Reset on unmount
      rootBuilder.formTitle.value  = "";
      rootBuilder.dirty.value      = false;
      rootBuilder.saving.value     = false;
      rootBuilder.published.value  = false;
      rootBuilder.publishing.value = false;
      if (rootBuilder._doSaveSlot)    rootBuilder._doSaveSlot.value    = null;
      if (rootBuilder._togglePubSlot) rootBuilder._togglePubSlot.value = null;
    });
  });

  return (
    <>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .spinner { animation: spin 1s linear infinite !important; }
        .add-block-item:hover { background: var(--surface-3); }

        .form-builder-outer {
          margin: -1.25rem -1.25rem 0.5rem -1.25rem;
          width: calc(100% + 2.5rem);
          height: calc(100vh - var(--header-box-height) - 2rem);
          display: flex;
          overflow: hidden;
          box-sizing: border-box;
        }

        .form-builder-layout {
          display: flex; flex: 1; height: 100%; overflow: hidden;
          gap: 0.5rem; padding: 0.5rem; box-sizing: border-box;
          position: relative; background: var(--surface-1);
        }

        .panel-left {
          width: 220px; flex-shrink: 0; display: flex; flex-direction: column;
          border: 1px solid var(--border); border-radius: 0.75rem;
          background: var(--surface-2); overflow: hidden;
        }
        .panel-center {
          flex: 1; display: flex; flex-direction: column; min-width: 0;
          border: 1px solid var(--border); border-radius: 0.75rem;
          background: var(--surface-2); position: relative; overflow: hidden;
        }
        .panel-right {
          width: 280px; flex-shrink: 0; display: flex; flex-direction: column;
          border: 1px solid var(--border); border-radius: 0.75rem;
          background: var(--surface-2); overflow: hidden;
        }

        @media (max-width: 1024px) {
          .panel-right { display: none; }
          .panel-right.mobile-open { display: flex; flex: 1; min-width: 0; }
          .panel-center.hide-on-tablet { display: none; }
        }

        @media (max-width: 768px) {
          .form-builder-outer {
            margin: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            height: calc(100vh - var(--header-box-height) - 5rem) !important;
            box-sizing: border-box !important;
          }
          .form-builder-layout {
            padding: 0 !important;
            gap: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            box-sizing: border-box !important;
          }
          .panel-left { flex: none; width: 100% !important; max-width: 100% !important; border-radius: 0.75rem; box-sizing: border-box; }
          .panel-left.hide-on-mobile { display: none !important; }
          .panel-center { flex: none; width: 100% !important; max-width: 100% !important; border-radius: 0.75rem; box-sizing: border-box; }
          .panel-center.hide-on-mobile { display: none !important; }
          .panel-right.mobile-open { flex: none; width: 100% !important; max-width: 100% !important; border-radius: 0.75rem; box-sizing: border-box; }
        }
      `}</style>

      {/* ── 3-Panel layout ────────────────────────────────────────────── */}
      <div class="form-builder-outer">
        {loading.value ? (
          <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">
            Loading form…
          </div>
        ) : (
          <div class="form-builder-layout">

            {/* Left — Question Sidebar */}
            <div class={["panel-left", (selectedId.value || editingThankYou.value) ? "hide-on-mobile" : ""]}>
              <QuestionSidebar />
            </div>

            {/* Center — Preview Canvas */}
            <div class={["panel-center", showDetails.value ? "hide-on-tablet hide-on-mobile" : (!selectedId.value && !editingThankYou.value ? "hide-on-mobile" : "")]}>
              <QuestionPreview />
            </div>

            {/* Right — Question Details */}
            <div class={`panel-right ${showDetails.value ? "mobile-open" : ""}`} style="overflow-y:auto;">
              <QuestionDetails />
            </div>
          </div>
        )}
      </div>

      {/* ── Add Block menu overlay ─────────────────────────────────────────── */}
      {showAddMenu.value && (
        <div style="position:fixed;inset:0;z-index:1000;" onClick$={() => { showAddMenu.value = false; }}>
          <div
            onClick$={(e) => e.stopPropagation()}
            style="position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);background:var(--surface-2);border:1px solid var(--border);border-radius:0.75rem;padding:0.75rem;width:340px;box-shadow:0 10px 30px rgba(0,0,0,0.2);max-height:80vh;overflow-y:auto;overflow-x:hidden;"
          >
            <div style="font-size:0.75rem;color:var(--text-secondary);padding:0.375rem 0.5rem;text-transform:uppercase;font-weight:700;margin-bottom:0.5rem;">
              Add Block
            </div>
            {QUESTION_TYPES.map((type, idx) => {
              const IconComp = type.icon;
              const typeId = type.id;
              return (
                <div key={type.id}>
                  {idx > 0 && <div style="height:1px;background:var(--border);margin:4px 0;" />}
                  <div
                    onClick$={() => addQuestion(typeId)}
                    class="add-block-item"
                    style="padding:0.75rem;cursor:pointer;display:flex;align-items:center;gap:0.75rem;border-radius:0.375rem;transition:background 0.15s ease;"
                  >
                    <div style={`display:flex;align-items:center;justify-content:center;width:32px;height:32px;border-radius:8px;background:${type.color}15;color:${type.color};flex-shrink:0;`}>
                      <IconComp style="width:1.25rem;height:1.25rem;" />
                    </div>
                    <div style="display:flex;flex-direction:column;gap:2px;">
                      <span style="font-size:0.875rem;font-weight:500;color:var(--text-primary);">{type.label}</span>
                      <span style="font-size:0.6875rem;color:var(--text-secondary);">{type.description}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Click-outside to dismiss dropdown menus */}
      {dropdownId.value && (
        <div style="position:fixed;inset:0;z-index:50;" onClick$={() => { dropdownId.value = null; }} />
      )}
    </>
  );
});

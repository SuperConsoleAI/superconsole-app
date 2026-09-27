// src/components/forms/builder/QuestionDetails.tsx
//
// WHAT:  Right panel of the form builder. Shows editable properties for the
//        currently selected question, or Thank You settings when editingThankYou.
//
// HOW:   Reads/writes BuilderContext signals. Direct array mutation pattern
//        (same as webapp): [...questions.value], splice at selectedIndex, reassign.
//        Every change calls markDirty() to enable the Save button.
//
// FLOW:
//   editingThankYou=true  → render Thank You settings (title, message, action type)
//   selectedId set        → render question properties panel
//   neither               → render empty placeholder
//
// FIELDS per question type:
//   all types      : title, description, required, embed_url, cover_image, button_text
//   text types     : placeholder
//   select types   : options list (add / edit / remove per option)

import { component$, useContext } from "@builder.io/qwik";
import { LuX, LuTrash2, LuGripVertical } from "@qwikest/icons/lucide";
import { BuilderContext, getTypeInfo } from "~/routes/dashboard/forms/[id]/edit/index";

export const QuestionDetails = component$(() => {
  const {
    questions,
    selectedId,
    editingThankYou,
    thankYou,
    markDirty,
    showDetails,
  } = useContext(BuilderContext);

  const selectedIndex = questions.value.findIndex((q: any) => q.id === selectedId.value);
  const selected = questions.value[selectedIndex];

  const fieldStyle = "width:100%;padding:0.625rem;background:transparent;border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.875rem;box-sizing:border-box;outline:none;";
  const labelStyle = "display:block;font-size:0.75rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.5rem;text-transform:uppercase;";
  const sectionStyle = "margin-bottom:1rem;";

  // ── Thank You Settings ────────────────────────────────────────────────────
  if (editingThankYou.value) {
    return (
      <div style="padding:1.25rem;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
          <h3 style="font-size:0.875rem;font-weight:600;color:var(--text-primary);margin:0;">Thank You Settings</h3>
          <button
            type="button"
            onClick$={() => { showDetails.value = false; }}
            style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);display:flex;padding:0.25rem;border-radius:0.25rem;"
          >
            <LuX style="width:1.25rem;height:1.25rem;" />
          </button>
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Title</label>
          <input
            type="text"
            value={thankYou.value.title}
            onInput$={(e) => { thankYou.value = { ...thankYou.value, title: (e.target as HTMLInputElement).value }; markDirty(); }}
            style={fieldStyle}
          />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Message</label>
          <textarea
            value={thankYou.value.message}
            onInput$={(e) => { thankYou.value = { ...thankYou.value, message: (e.target as HTMLTextAreaElement).value }; markDirty(); }}
            rows={3}
            style={`${fieldStyle}resize:none;`}
          />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle}>Action Type</label>
          <select
            value={thankYou.value.type}
            onChange$={(e) => { thankYou.value = { ...thankYou.value, type: (e.target as HTMLSelectElement).value as any }; markDirty(); }}
            style={fieldStyle}
          >
            <option value="none">Default</option>
            <option value="redirect">Redirect to URL</option>
            <option value="button">Call to Action Button</option>
          </select>
        </div>

        {thankYou.value.type === "redirect" && (
          <div style={sectionStyle}>
            <label style={labelStyle}>Redirect URL</label>
            <input
              type="url"
              placeholder="https://"
              value={thankYou.value.redirect_url || ""}
              onInput$={(e) => { thankYou.value = { ...thankYou.value, redirect_url: (e.target as HTMLInputElement).value }; markDirty(); }}
              style={fieldStyle}
            />
          </div>
        )}

        {thankYou.value.type === "button" && (
          <>
            <div style={sectionStyle}>
              <label style={labelStyle}>Button Text</label>
              <input
                type="text"
                value={thankYou.value.button_text || ""}
                onInput$={(e) => { thankYou.value = { ...thankYou.value, button_text: (e.target as HTMLInputElement).value }; markDirty(); }}
                style={fieldStyle}
              />
            </div>
            <div style={sectionStyle}>
              <label style={labelStyle}>Button Link URL</label>
              <input
                type="url"
                placeholder="https://"
                value={thankYou.value.button_url || ""}
                onInput$={(e) => { thankYou.value = { ...thankYou.value, button_url: (e.target as HTMLInputElement).value }; markDirty(); }}
                style={fieldStyle}
              />
            </div>
          </>
        )}
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────
  if (!selected) {
    return (
      <div style="padding:2rem 1rem;text-align:center;color:var(--text-secondary);font-size:0.8125rem;">
        Select a block to edit its properties
      </div>
    );
  }

  const info = getTypeInfo(selected.question_type);

  // ── Question Properties ───────────────────────────────────────────────────
  return (
    <div style="padding:1.25rem;">
      {/* Header */}
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.5rem;padding-bottom:0.75rem;border-bottom:1px solid var(--border);">
        <div style="display:flex;align-items:center;gap:0.5rem;">
          <div style={`display:flex;align-items:center;justify-content:center;width:1.5rem;height:1.5rem;color:${info.color};`}>
            <info.icon style="width:1.25rem;height:1.25rem;" />
          </div>
          <h3 style="font-size:0.875rem;font-weight:600;color:var(--text-primary);margin:0;">{info.label} Settings</h3>
        </div>
        <button
          type="button"
          onClick$={() => { showDetails.value = false; }}
          style="background:transparent;border:none;cursor:pointer;color:var(--text-secondary);display:flex;padding:0.25rem;border-radius:0.25rem;"
        >
          <LuX style="width:1.25rem;height:1.25rem;" />
        </button>
      </div>

      {/* Question Title */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Question Title</label>
        <input
          type="text"
          value={selected.title || ""}
          placeholder={`E.g. ${info.label}`}
          onInput$={(e) => {
            const newQ = [...questions.value];
            newQ[selectedIndex] = { ...newQ[selectedIndex], title: (e.target as HTMLInputElement).value };
            questions.value = newQ;
            markDirty();
          }}
          style={fieldStyle}
        />
      </div>

      {/* Description */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Description (Optional)</label>
        <textarea
          value={selected.description || ""}
          placeholder="Add additional context..."
          rows={3}
          onInput$={(e) => {
            const newQ = [...questions.value];
            newQ[selectedIndex] = { ...newQ[selectedIndex], description: (e.target as HTMLTextAreaElement).value };
            questions.value = newQ;
            markDirty();
          }}
          style={`${fieldStyle}resize:none;`}
        />
      </div>

      {/* Required checkbox */}
      <div style="margin-bottom:1.5rem;display:flex;align-items:center;gap:0.5rem;">
        <input
          type="checkbox"
          checked={selected.required}
          onChange$={(e) => {
            const newQ = [...questions.value];
            newQ[selectedIndex] = { ...newQ[selectedIndex], required: (e.target as HTMLInputElement).checked };
            questions.value = newQ;
            markDirty();
          }}
          id="req-check"
          style="width:1rem;height:1rem;accent-color:#000;cursor:pointer;"
        />
        <label for="req-check" style="font-size:0.8125rem;color:var(--text-primary);cursor:pointer;user-select:none;">
          Required field
        </label>
      </div>

      {/* Video / Embed URL */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Video / Embed URL</label>
        <input
          type="text"
          value={selected.embed_url || ""}
          placeholder="https://youtube.com/embed/..."
          onInput$={(e) => {
            const newQ = [...questions.value];
            newQ[selectedIndex] = { ...newQ[selectedIndex], embed_url: (e.target as HTMLInputElement).value };
            questions.value = newQ;
            markDirty();
          }}
          style={fieldStyle}
        />
      </div>

      {/* Cover Image URL */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Cover Image URL</label>
        <input
          type="text"
          value={selected.image_url || ""}
          placeholder="https://..."
          onInput$={(e) => {
            const newQ = [...questions.value];
            newQ[selectedIndex] = { ...newQ[selectedIndex], image_url: (e.target as HTMLInputElement).value };
            questions.value = newQ;
            markDirty();
          }}
          style={fieldStyle}
        />
      </div>

      {/* Button Text */}
      <div style={sectionStyle}>
        <label style={labelStyle}>Button Text</label>
        <input
          type="text"
          value={selected.button_text || ""}
          placeholder="Next"
          onInput$={(e) => {
            const newQ = [...questions.value];
            newQ[selectedIndex] = { ...newQ[selectedIndex], button_text: (e.target as HTMLInputElement).value };
            questions.value = newQ;
            markDirty();
          }}
          style={fieldStyle}
        />
      </div>

      {/* Placeholder — text-input types only */}
      {["short_text", "long_text", "email", "phone", "url", "number"].includes(selected.question_type) && (
        <div style={sectionStyle}>
          <label style={labelStyle}>Placeholder Text</label>
          <input
            type="text"
            value={selected.placeholder || ""}
            placeholder="Type your answer here..."
            onInput$={(e) => {
              const newQ = [...questions.value];
              newQ[selectedIndex] = { ...newQ[selectedIndex], placeholder: (e.target as HTMLInputElement).value };
              questions.value = newQ;
              markDirty();
            }}
            style={fieldStyle}
          />
        </div>
      )}

      {/* Options editor — select types */}
      {["single_select", "multi_select", "dropdown", "ranking"].includes(selected.question_type) && (() => {
        let opts: string[] = ["Option 1", "Option 2"];
        try { opts = JSON.parse(selected.options || "[]"); if (!Array.isArray(opts)) opts = ["Option 1", "Option 2"]; } catch { /* ignore */ }
        return (
          <div style={sectionStyle}>
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.5rem;">
              <label style={labelStyle}>Options</label>
              <button
                type="button"
                onClick$={() => {
                  const newQ = [...questions.value];
                  const cur: string[] = (() => { try { const p = JSON.parse(newQ[selectedIndex].options || "[]"); return Array.isArray(p) ? p : ["Option 1", "Option 2"]; } catch { return ["Option 1", "Option 2"]; } })();
                  newQ[selectedIndex] = { ...newQ[selectedIndex], options: JSON.stringify([...cur, `Option ${cur.length + 1}`]) };
                  questions.value = newQ;
                  markDirty();
                }}
                style="padding:0.25rem 0.5rem;background:var(--surface-3);border:none;border-radius:0.25rem;font-size:0.75rem;cursor:pointer;color:var(--text-primary);"
              >
                + Add Option
              </button>
            </div>
            <div style="display:flex;flex-direction:column;gap:0.5rem;">
              {opts.map((opt: string, idx: number) => (
                <div key={idx} style="display:flex;align-items:center;gap:0.5rem;">
                  <LuGripVertical style="width:1rem;height:1rem;color:var(--text-secondary);cursor:grab;" />
                  <input
                    type="text"
                    value={opt}
                    onInput$={(e) => {
                      const newQ = [...questions.value];
                      const newOpts: string[] = (() => { try { const p = JSON.parse(newQ[selectedIndex].options || "[]"); return Array.isArray(p) ? [...p] : ["Option 1", "Option 2"]; } catch { return ["Option 1", "Option 2"]; } })();
                      newOpts[idx] = (e.target as HTMLInputElement).value;
                      newQ[selectedIndex] = { ...newQ[selectedIndex], options: JSON.stringify(newOpts) };
                      questions.value = newQ;
                      markDirty();
                    }}
                    style="flex:1;padding:0.5rem;background:transparent;border:1px solid var(--border);border-radius:0.375rem;color:var(--text-primary);font-size:0.8125rem;"
                  />
                  <button
                    type="button"
                    onClick$={() => {
                      const newQ = [...questions.value];
                      const newOpts: string[] = (() => { try { const p = JSON.parse(newQ[selectedIndex].options || "[]"); return Array.isArray(p) ? [...p] : ["Option 1", "Option 2"]; } catch { return ["Option 1", "Option 2"]; } })();
                      if (newOpts.length > 1) {
                        newOpts.splice(idx, 1);
                        newQ[selectedIndex] = { ...newQ[selectedIndex], options: JSON.stringify(newOpts) };
                        questions.value = newQ;
                        markDirty();
                      }
                    }}
                    style="padding:0.5rem;background:transparent;border:1px solid var(--border);border-radius:0.375rem;color:var(--text-secondary);cursor:pointer;"
                  >
                    <LuTrash2 style="width:1rem;height:1rem;" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
});

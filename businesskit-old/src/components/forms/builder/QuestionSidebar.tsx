// src/components/forms/builder/QuestionSidebar.tsx
//
// WHAT:  Left panel of the form builder. Shows the ordered list of questions and
//        the Thank You slide at the bottom. Has an "Add Block" button that opens
//        the type picker popup (controlled by BuilderContext.showAddMenu).
//
// HOW:   Reads/writes BuilderContext signals (questions, selectedId, editingThankYou,
//        showAddMenu, dropdownId, thankYou). Mutation helpers (moveQuestion,
//        duplicateQuestion, deleteQuestion) are also from context.
//
// FLOW:
//   showAddMenu toggle → parent renders the type picker overlay
//   question row click  → selectedId = q.id, editingThankYou = false
//   MoreVertical click  → dropdownId = q.id (shows duplicate/delete menu)
//   Thank You row click → editingThankYou = true, selectedId = null

import { component$, useContext } from "@builder.io/qwik";
import {
  LuPlus, LuChevronUp, LuChevronDown,
  LuMoreVertical, LuCopy, LuTrash2,
} from "@qwikest/icons/lucide";
import { BuilderContext, getTypeInfo } from "~/routes/dashboard/forms/[id]/edit/index";

export const QuestionSidebar = component$(() => {
  const {
    questions,
    selectedId,
    editingThankYou,
    showAddMenu,
    dropdownId,
    thankYou,
    moveQuestion,
    duplicateQuestion,
    deleteQuestion,
  } = useContext(BuilderContext);

  return (
    <div style="display:flex;flex-direction:column;height:100%;overflow:hidden;">
      {/* Add Block button */}
      <div style="padding:0.75rem;">
        <button
          type="button"
          onClick$={() => { showAddMenu.value = !showAddMenu.value; }}
          style="width:100%;padding:0.625rem;background:white;border:1px dashed var(--border);border-radius:0.375rem;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:0.5rem;font-size:0.8125rem;color:#000;font-weight:500;"
        >
          <LuPlus style="width:1rem;height:1rem;" /> Add Block
        </button>
      </div>

      {/* Question list */}
      <div style="flex:1;overflow-y:auto;padding:0 0.5rem;">
        {questions.value.map((q: any, i: number) => {
          const info = getTypeInfo(q.question_type);
          const isSelected = selectedId.value === q.id && !editingThankYou.value;
          return (
            <div
              key={q.id}
              style={`position:relative;padding:0.5rem 0.625rem;margin-bottom:0.25rem;border-radius:0.375rem;cursor:pointer;display:flex;align-items:center;gap:0.375rem;font-size:0.8125rem;${isSelected ? `background:${info.color};color:white;` : "background:var(--surface-3);color:var(--text-primary);"}`}
            >
              {/* Up/down arrows */}
              <div style="display:flex;flex-direction:column;gap:0.125rem;">
                <button
                  type="button"
                  onClick$={() => moveQuestion(i, "up")}
                  disabled={i === 0}
                  style="padding:0;background:transparent;border:none;cursor:pointer;opacity:0.5;display:flex;"
                >
                  <LuChevronUp style="width:0.75rem;height:0.75rem;" />
                </button>
                <button
                  type="button"
                  onClick$={() => moveQuestion(i, "down")}
                  disabled={i === questions.value.length - 1}
                  style="padding:0;background:transparent;border:none;cursor:pointer;opacity:0.5;display:flex;"
                >
                  <LuChevronDown style="width:0.75rem;height:0.75rem;" />
                </button>
              </div>

              {/* Question label */}
              <div
                onClick$={() => { selectedId.value = q.id; editingThankYou.value = false; }}
                style="flex:1;overflow:hidden;display:flex;align-items:center;gap:0.375rem;"
              >
                <div style={`display:flex;align-items:center;justify-content:center;width:1.25rem;height:1.25rem;color:${info.color};`}>
                  <info.icon style="width:1rem;height:1rem;" />
                </div>
                <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                  {i + 1}. {q.title || info.label}
                </span>
              </div>

              {/* More menu */}
              <button
                type="button"
                onClick$={(e) => { e.stopPropagation(); dropdownId.value = dropdownId.value === q.id ? null : q.id; }}
                style="padding:0.25rem;background:transparent;border:none;cursor:pointer;border-radius:0.25rem;display:flex;opacity:0.6;"
              >
                <LuMoreVertical style="width:0.875rem;height:0.875rem;" />
              </button>

              {dropdownId.value === q.id && (
                <div style="position:absolute;right:0;top:100%;background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:100;min-width:120px;">
                  <button
                    type="button"
                    onClick$={() => duplicateQuestion(q, i)}
                    style="width:100%;padding:0.5rem 0.75rem;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;gap:0.5rem;font-size:0.8125rem;color:var(--text-primary);text-align:left;"
                  >
                    <LuCopy style="width:0.875rem;height:0.875rem;" /> Duplicate
                  </button>
                  <button
                    type="button"
                    onClick$={() => deleteQuestion(q.id)}
                    style="width:100%;padding:0.5rem 0.75rem;background:transparent;border:none;cursor:pointer;display:flex;align-items:center;gap:0.5rem;font-size:0.8125rem;color:var(--error);text-align:left;"
                  >
                    <LuTrash2 style="width:0.875rem;height:0.875rem;" /> Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {questions.value.length === 0 && (
          <div style="text-align:center;padding:2rem 1rem;color:var(--text-secondary);font-size:0.8125rem;">
            Click "Add Block" to start
          </div>
        )}
      </div>

      {/* Thank You slide */}
      <div style="padding:0.75rem;border-top:1px solid var(--border);flex-shrink:0;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.375rem;">
          <span style="font-size:0.6875rem;color:var(--text-secondary);text-transform:uppercase;">Thank you page</span>
        </div>
        <div
          onClick$={() => { editingThankYou.value = true; selectedId.value = null; }}
          style={`padding:0.5rem 0.625rem;border-radius:0.375rem;font-size:0.8125rem;cursor:pointer;${editingThankYou.value ? "background:#fbbf24;color:white;" : "background:var(--surface-3);color:var(--text-primary);"}`}
        >
          🎉 {thankYou.value.title}
        </div>
      </div>
    </div>
  );
});

// src/routes/dashboard/forms/[id]/submissions/index.tsx
//
// WHAT:  Submissions viewer for a specific form.
//        Shows a table of all responses with question columns, status badges, timestamps.
//
// HOW:   Loads form questions + submissions via useVisibleTask$ (listFormQuestionsIPC +
//        listSubmissionsIPC). Parses answers JSON per row. Client-side search filter.
//        Pagination is client-side (25 per page).
//
// FLOW:
//   mount → listFormQuestionsIPC(formId) + listSubmissionsIPC(formId)
//   answers = JSON.parse(sub.answers) → { questionId: answer }
//   display first 5 question columns, "+N more" header if there are more

import { component$, useSignal, useVisibleTask$, useContext } from "@builder.io/qwik";
import { useLocation, type StaticGenerateHandler } from "@builder.io/qwik-city";

export const onStaticGenerate: StaticGenerateHandler = () => ({
  params: ["default", "new"].map((id) => ({ id })),
});
import {
  LuSearch, LuChevronLeft, LuChevronRight,
} from "@qwikest/icons/lucide";
import { listFormQuestionsIPC, listSubmissionsIPC, listFormsIPC } from "~/lib/ipc";
import type { QuestionRow, SubmissionRow } from "~/lib/types";
import { FormsBuilderCtx } from "~/lib/forms-builder-context";

const PAGE_SIZE = 25;

function statusStyle(status: string): string {
  if (status === "submitted") return "background:#dcfce7;color:#166534;";
  if (status === "partial")   return "background:#fef3c7;color:#92400e;";
  return "background:#f3f4f6;color:#6b7280;";
}

function formatDate(iso: string): string {
  if (!iso) return "–";
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

function displayAnswer(val: unknown): string {
  if (val === undefined || val === null) return "–";
  if (Array.isArray(val)) return val.join(", ");
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export default component$(() => {
  const loc = useLocation();
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

  const formTitle  = useSignal("Form");
  const questions  = useSignal<QuestionRow[]>([]);
  const allSubs    = useSignal<(SubmissionRow & { parsedAnswers: Record<string, unknown> })[]>([]);
  const search     = useSignal("");
  const page       = useSignal(0);
  const loading    = useSignal(true);
  const error      = useSignal("");

  // Sync form title into AppTopbar via root context
  const rootBuilder = useContext(FormsBuilderCtx);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const [forms, qs, subs] = await Promise.all([
        listFormsIPC(),
        listFormQuestionsIPC(formId),
        listSubmissionsIPC(formId, 500),
      ]);
      const form = forms.find((f) => f.id === formId);
      if (form) {
        formTitle.value = form.title;
        rootBuilder.formTitle.value = form.title;  // drive AppTopbar left slot
      }

      questions.value = qs;
      allSubs.value = subs.map((s) => {
        let parsedAnswers: Record<string, unknown> = {};
        try { parsedAnswers = JSON.parse(s.answers); } catch { /* ignore */ }
        return { ...s, parsedAnswers };
      });
    } catch (e: any) {
      error.value = e.message || "Failed to load submissions.";
    } finally {
      loading.value = false;
    }
  });

  // Synchronous client-side search filter (no $ needed — no serialization)
  const filteredSubs = search.value.trim()
    ? allSubs.value.filter((s) => {
        const q = search.value.toLowerCase();
        const ans = Object.values(s.parsedAnswers).map(String).join(" ").toLowerCase();
        return ans.includes(q) || s.status.includes(q) || (s.country ?? "").toLowerCase().includes(q);
      })
    : allSubs.value;

  const visibleQs = questions.value.slice(0, 5);
  const extraQs   = questions.value.length - 5;

  return (
    <>
      <style>{`
        .sub-table { width:100%;border-collapse:collapse;font-size:0.875rem; }
        .sub-table th,
        .sub-table td { padding:0.75rem 1rem;text-align:left;white-space:nowrap; }
        .sub-table th { font-weight:600;color:var(--text-primary);border-bottom:1px solid var(--border);background:var(--surface-3); }
        .sub-table td { color:var(--text-primary);border-bottom:1px solid var(--border); }
        .sub-table tr:last-child td { border-bottom:none; }
        .sub-table td.overflow { max-width:200px;overflow:hidden;text-overflow:ellipsis; }
        @media (max-width:768px) {
          .sub-table { min-width:600px; }
          .sub-table th, .sub-table td { padding:0.5rem 0.75rem;font-size:0.8125rem; }
        }
      `}</style>

      {loading.value ? (
        <div style="display:flex;align-items:center;justify-content:center;padding:4rem;color:var(--text-secondary);">
          Loading submissions…
        </div>
      ) : error.value ? (
        <div style="padding:1.5rem;background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:0.75rem;color:var(--error);">
          {error.value}
        </div>
      ) : (
        <>
          {/* Search + count row */}
          <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;">
            <div style="position:relative;width:300px;max-width:100%;">
              <LuSearch style="position:absolute;left:0.75rem;top:50%;transform:translateY(-50%);width:1rem;height:1rem;color:var(--text-secondary);" />
              <input
                id="sub-search"
                type="text"
                placeholder="Search answers, country…"
                value={search.value}
                onInput$={(e) => { search.value = (e.target as HTMLInputElement).value; page.value = 0; }}
                style="width:100%;padding:0.625rem 0.75rem 0.625rem 2.25rem;border:1px solid var(--border);border-radius:0.5rem;font-size:0.875rem;background:var(--surface-2);color:var(--text-primary);box-sizing:border-box;outline:none;"
              />
            </div>
            <span style="font-size:0.875rem;color:var(--text-secondary);white-space:nowrap;">
              {allSubs.value.length} total submission{allSubs.value.length !== 1 ? "s" : ""}
            </span>
          </div>

          {/* Table */}
          <div style="background:var(--surface-2);border-radius:0.75rem;border:1px solid var(--border);overflow:hidden;">
            <div style="overflow-x:auto;-webkit-overflow-scrolling:touch;">
              <table class="sub-table">
                <thead>
                  <tr>
                    <th style="width:3rem;">#</th>
                    <th>Date</th>
                    <th>Status</th>
                    {visibleQs.map((q) => (
                      <th key={q.id} style="max-width:160px;overflow:hidden;text-overflow:ellipsis;">
                        {q.title}
                      </th>
                    ))}
                    {extraQs > 0 && (
                      <th style="color:var(--text-secondary);">+{extraQs} more</th>
                    )}
                    <th>Country</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubs.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4 + Math.min(questions.value.length, 5)}
                        style="padding:3rem;text-align:center;color:var(--text-secondary);"
                      >
                        No submissions yet. Share your form to start collecting responses.
                      </td>
                    </tr>
                  ) : (
                    filteredSubs
                      .slice(page.value * PAGE_SIZE, (page.value + 1) * PAGE_SIZE)
                      .map((sub, idx) => (
                        <tr key={sub.id}>
                          <td style="color:var(--text-secondary);">
                            {filteredSubs.length - (page.value * PAGE_SIZE + idx)}
                          </td>
                          <td>{formatDate(sub.created_at)}</td>
                          <td>
                            <span style={`padding:0.25rem 0.5rem;border-radius:1rem;font-size:0.75rem;font-weight:500;${statusStyle(sub.status)}`}>
                              {sub.status}
                            </span>
                          </td>
                          {visibleQs.map((q) => (
                            <td key={q.id} class="overflow">
                              {displayAnswer(sub.parsedAnswers[q.id])}
                            </td>
                          ))}
                          {extraQs > 0 && <td style="color:var(--text-secondary);">…</td>}
                          <td style="color:var(--text-secondary);">{sub.country ?? "–"}</td>
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {allSubs.value.length > PAGE_SIZE && (
            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:1rem;flex-wrap:wrap;gap:0.5rem;">
              <span style="font-size:0.875rem;color:var(--text-secondary);">
                Showing {page.value * PAGE_SIZE + 1}–{Math.min((page.value + 1) * PAGE_SIZE, allSubs.value.length)} of {allSubs.value.length}
              </span>
              <div style="display:flex;gap:0.25rem;">
                <button
                  type="button"
                  disabled={page.value === 0}
                  onClick$={() => { page.value = Math.max(0, page.value - 1); }}
                  style={`padding:0.5rem;background:var(--surface-3);border:1px solid var(--border);border-radius:0.375rem;cursor:pointer;display:flex;opacity:${page.value === 0 ? 0.4 : 1};`}
                >
                  <LuChevronLeft style="width:1rem;height:1rem;" />
                </button>
                <button
                  type="button"
                  disabled={(page.value + 1) * PAGE_SIZE >= allSubs.value.length}
                  onClick$={() => { page.value = page.value + 1; }}
                  style={`padding:0.5rem;background:var(--surface-3);border:1px solid var(--border);border-radius:0.375rem;cursor:pointer;display:flex;opacity:${(page.value + 1) * PAGE_SIZE >= allSubs.value.length ? 0.4 : 1};`}
                >
                  <LuChevronRight style="width:1rem;height:1rem;" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
});

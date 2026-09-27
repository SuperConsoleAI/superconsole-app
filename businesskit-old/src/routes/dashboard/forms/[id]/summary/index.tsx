// src/routes/dashboard/forms/[id]/summary/index.tsx
//
// WHAT:  Summary stats for a specific form — submission counts, completion rate, avg time.
//        Uses the same IPC data as submissions but shows aggregate cards.

import { component$, useStylesScoped$, useSignal, useVisibleTask$, useContext, useComputed$ } from "@builder.io/qwik";
import { useLocation, type StaticGenerateHandler } from "@builder.io/qwik-city";

export const onStaticGenerate: StaticGenerateHandler = () => ({
  params: ["default", "new"].map((id) => ({ id })),
});
import { LuInbox, LuCheckCircle, LuClock, LuTrendingUp, LuBarChart2, LuStar, LuCheckSquare } from "@qwikest/icons/lucide";
import { listFormsIPC, listFormQuestionsIPC, listSubmissionsIPC } from "~/lib/ipc";
import type { SubmissionRow, QuestionData } from "~/lib/types";
import { FormsBuilderCtx } from "~/lib/forms-builder-context";

const SUMMARY_STYLES = `
  .summary-content {
    flex: 1;
    display: flex;
    align-items: flex-start;
    padding: 1.5rem;
    gap: 1.5rem;
    overflow: auto;
  }
  @media (max-width: 1024px) {
    .summary-content {
      flex-direction: column-reverse;
      padding: 1rem;
    }
  }
  .summary-cards {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
    min-width: 0;
  }
  .summary-sidebar {
    width: 300px;
    flex-shrink: 0;
  }
  @media (max-width: 1024px) {
    .summary-sidebar {
      width: 100%;
    }
  }
  .summary-card {
    background: var(--surface-2);
    border-radius: 0.75rem;
    border: 1px solid var(--border);
    padding: 1.5rem;
  }
  @media (max-width: 768px) {
    .summary-card {
      padding: 1rem;
    }
  }
  .nps-grid {
    display: flex;
    gap: 0.25rem;
    margin-top: 1rem;
  }
  @media (max-width: 768px) {
    .nps-grid {
      overflow-x: auto;
      -webkit-overflow-scrolling: touch;
      padding-bottom: 0.5rem;
    }
    .nps-grid > div {
      min-width: 32px;
    }
  }
  .share-btn-primary {
    width: 100%;
    padding: 0.75rem;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
  }
  .share-btn-secondary {
    padding: 0.5rem 0.75rem;
    background: var(--button-primary-bg);
    color: var(--button-primary-text);
    border: none;
    border-radius: 0.375rem;
    font-size: 0.75rem;
    font-weight: 500;
    cursor: pointer;
  }
`;

export default component$(() => {
  useStylesScoped$(SUMMARY_STYLES);
  const loc    = useLocation();
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

  const formTitle   = useSignal("Form");
  const formSlug    = useSignal("");
  const questions   = useSignal<QuestionData[]>([]);
  const subs        = useSignal<SubmissionRow[]>([]);
  const loading     = useSignal(true);
  const rootBuilder = useContext(FormsBuilderCtx);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const [forms, qResult, submissions] = await Promise.all([
        listFormsIPC(),
        listFormQuestionsIPC(formId),
        listSubmissionsIPC(formId),
      ]);
      const form = forms.find((f) => f.id === formId);
      if (form) {
        formTitle.value = form.title;
        formSlug.value  = form.slug || form.id;
        rootBuilder.formTitle.value = form.title;
      }
      if (qResult) {
        questions.value = qResult.map(q => ({
          ...q,
          options: typeof q.options === "string" ? JSON.parse(q.options || "[]") : q.options,
          settings: typeof q.settings === "string" ? JSON.parse(q.settings || "{}") : q.settings,
        }));
      }
      subs.value = (submissions || []).map(s => ({
        ...s,
        answers: typeof s.answers === "string" ? JSON.parse(s.answers || "{}") : s.answers,
      }));
    } catch (e) {
      console.error("Failed to load summary:", e);
    } finally {
      loading.value = false;
    }
  });

  const summaries = useComputed$(() => {
    const summaryTypes = ['single_select', 'multi_select', 'dropdown', 'rating', 'nps', 'ranking'];
    return questions.value
      .filter(q => summaryTypes.includes(q.question_type))
      .map((q: QuestionData) => {
        const answers = subs.value.map((s: SubmissionRow) => (s.answers as any)?.[q.id!]).filter((a: any) => a !== undefined && a !== null);
        const totalResponses = answers.length;

        if (q.question_type === 'nps') {
          const counts: Record<number, number> = {};
          for (let i = 0; i <= 10; i++) counts[i] = 0;
          answers.forEach((a: any) => { if (typeof a === 'number' && a >= 0 && a <= 10) counts[a]++; });
          return { question: q, type: 'nps', totalResponses, counts };
        }

        if (q.question_type === 'rating') {
          const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
          answers.forEach((a: any) => { if (typeof a === 'number' && a >= 1 && a <= 5) counts[a]++; });
          const avg = totalResponses > 0 ? answers.reduce((s: number, a: any) => s + (typeof a === 'number' ? a : 0), 0) / totalResponses : 0;
          return { question: q, type: 'rating', totalResponses, counts, avg };
        }

        // Single/Multi/Dropdown/Ranking
        const options = Array.isArray(q.options) ? q.options : [];
        const optionCounts: Record<string, number> = {};
        options.forEach((opt: string) => { optionCounts[opt] = 0; });
        
        answers.forEach((a: any) => {
          if (Array.isArray(a)) {
            a.forEach((v: any) => { if (optionCounts[v] !== undefined) optionCounts[v]++; });
          } else if (typeof a === 'string' && optionCounts[a] !== undefined) {
            optionCounts[a]++;
          }
        });

        return { question: q, type: 'options', totalResponses, options, optionCounts };
      });
  });

  const total     = subs.value.length;
  const submitted = subs.value.filter((s) => s.status === "submitted").length;
  const partial   = subs.value.filter((s) => s.status === "partial").length;
  const rate      = total > 0 ? Math.round((submitted / total) * 100) : 0;
  const formUrl   = typeof window !== 'undefined' ? `${window.location.origin}/form/${formSlug.value}/report` : '';

  if (loading.value) {
    return (
      <div style="flex:1;display:flex;align-items:center;justify-content:center;color:var(--text-secondary);">
        Loading summary…
      </div>
    );
  }

  const kpis = [
    { label: "Total Responses",    value: total,     icon: LuInbox,       color: "#6366f1" },
    { label: "Completed",          value: submitted,  icon: LuCheckCircle, color: "#22c55e" },
    { label: "Partial",            value: partial,    icon: LuClock,       color: "#f59e0b" },
    { label: "Completion Rate",    value: `${rate}%`, icon: LuTrendingUp,  color: "#0ea5e9" },
  ];

  return (
    <div style="flex:1;display:flex;flex-direction:column;background:var(--surface-1);">
      <div class="summary-content">
        <div class="summary-cards">
          
          {/* Top KPI Cards */}
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:1rem;">
            {kpis.map((c) => {
              const Icon = c.icon;
              return (
                <div key={c.label} style="background:var(--surface-2);border:1px solid var(--border);border-radius:0.75rem;padding:1.25rem;display:flex;flex-direction:column;gap:0.75rem;">
                  <div style={`width:2.25rem;height:2.25rem;border-radius:0.5rem;background:${c.color}22;display:flex;align-items:center;justify-content:center;`}>
                    <Icon style={`width:1.125rem;height:1.125rem;color:${c.color};`} />
                  </div>
                  <div>
                    <div style="font-size:1.5rem;font-weight:700;color:var(--text-primary);line-height:1;">{c.value}</div>
                    <div style="font-size:0.8125rem;color:var(--text-secondary);margin-top:0.25rem;">{c.label}</div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Question Breakdowns */}
          {summaries.value.length === 0 ? (
            <div style="background:var(--surface-2);border-radius:0.75rem;border:1px solid var(--border);padding:3rem;text-align:center;">
              <LuBarChart2 style="width:2.5rem;height:2.5rem;color:var(--text-secondary);opacity:0.4;margin-bottom:1rem;" />
              <p style="color:var(--text-secondary);margin:0;">No choice-based questions to summarize.</p>
              <p style="color:var(--text-secondary);margin:0.5rem 0 0;font-size:0.875rem;">Add Single Select, Multi Select, Dropdown, Rating, or NPS questions to see summaries.</p>
            </div>
          ) : (
            summaries.value.map((s: any, idx: number) => (
              <div key={idx} class="summary-card">
                <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem;">
                  <span style="width:2.25rem;height:2.25rem;display:flex;align-items:center;justify-content:center;background:#fef3c7;border-radius:0.5rem;color:#d97706;">
                    {s.type === 'nps' ? <LuBarChart2 style="width:1.25rem;height:1.25rem;" /> : 
                     s.type === 'rating' ? <LuStar style="width:1.25rem;height:1.25rem;" /> : 
                     <LuCheckSquare style="width:1.25rem;height:1.25rem;" />}
                  </span>
                  <div>
                    <h3 style="font-size:1rem;font-weight:600;color:var(--text-primary);margin:0;">{s.question.title}</h3>
                    <p style="font-size:0.75rem;color:var(--text-secondary);margin:0;">
                      {s.totalResponses === 0 ? 'No one answered this question yet' : `${s.totalResponses} response${s.totalResponses !== 1 ? 's' : ''}`}
                    </p>
                  </div>
                </div>

                {/* NPS visualization */}
                {s.type === 'nps' && (
                  <div class="nps-grid">
                    {[0,1,2,3,4,5,6,7,8,9,10].map((n: number) => {
                      const count = s.counts[n] || 0;
                      const pct = s.totalResponses > 0 ? Math.round((count / s.totalResponses) * 100) : 0;
                      return (
                        <div key={n} style="flex:1;text-align:center;">
                          <div style="font-size:0.625rem;color:var(--text-secondary);margin-bottom:0.25rem;">{count} resp.</div>
                          <div style="font-size:0.625rem;color:var(--text-secondary);margin-bottom:0.25rem;">{pct}%</div>
                          <div style={`height:80px;background:${n <= 6 ? '#fee2e2' : n <= 8 ? '#fef3c7' : '#dcfce7'};border-radius:0.25rem;display:flex;align-items:flex-end;`}>
                            <div style={`width:100%;background:${n <= 6 ? '#ef4444' : n <= 8 ? '#f59e0b' : '#22c55e'};border-radius:0.25rem;height:${Math.max(pct, 5)}%;`} />
                          </div>
                          <div style="font-size:0.75rem;color:var(--text-primary);margin-top:0.25rem;font-weight:500;">{n}</div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Rating visualization */}
                {s.type === 'rating' && (
                  <div style="margin-top:1rem;">
                    <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:1rem;">
                      <span style="font-size:2rem;font-weight:700;color:var(--text-primary);">{s.avg.toFixed(1)}</span>
                      <div style="display:flex;gap:0.125rem;">
                        {[1,2,3,4,5].map((n: number) => (
                          <svg key={n} width="20" height="20" viewBox="0 0 24 24" fill={n <= Math.round(s.avg) ? '#eab308' : 'none'} stroke="#eab308" stroke-width="1.5">
                            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                          </svg>
                        ))}
                      </div>
                    </div>
                    {[5,4,3,2,1].map((n: number) => {
                      const count = s.counts[n] || 0;
                      const pct = s.totalResponses > 0 ? Math.round((count / s.totalResponses) * 100) : 0;
                      return (
                        <div key={n} style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;">
                          <span style="width:1rem;font-size:0.875rem;color:var(--text-secondary);">{n}</span>
                          <div style="flex:1;height:0.5rem;background:var(--surface-3);border-radius:0.25rem;overflow:hidden;">
                            <div style={`height:100%;width:${pct}%;background:#eab308;border-radius:0.25rem;`} />
                          </div>
                          <span style="font-size:0.75rem;color:var(--text-secondary);width:4rem;text-align:right;">{count} ({pct}%)</span>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Options visualization */}
                {s.type === 'options' && (
                  <div style="margin-top:1rem;">
                    {(s.options || []).map((opt: string) => {
                      const count = s.optionCounts[opt] || 0;
                      const pct = s.totalResponses > 0 ? Math.round((count / s.totalResponses) * 100) : 0;
                      return (
                        <div key={opt} style="margin-bottom:0.75rem;">
                          <div style="display:flex;justify-content:space-between;margin-bottom:0.25rem;">
                            <span style="font-size:0.875rem;color:var(--text-primary);">{opt}</span>
                            <span style="font-size:0.75rem;color:var(--text-secondary);">{count} responses • {pct}%</span>
                          </div>
                          <div style="height:0.5rem;background:#fef3c7;border-radius:0.25rem;overflow:hidden;">
                            <div style={`height:100%;width:${pct}%;background:#f59e0b;border-radius:0.25rem;`} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <div class="summary-sidebar">
          <div style="background:var(--surface-2);border-radius:0.75rem;border:1px solid var(--border);padding:1.5rem;position:sticky;top:1.5rem;">
            <h3 style="font-size:1rem;font-weight:600;color:var(--text-primary);margin:0 0 1rem;">Sharing Options</h3>
            
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">
              <span style="font-size:0.875rem;color:var(--text-primary);">Enable Link Sharing</span>
              <div style="width:44px;height:24px;background:#22c55e;border-radius:12px;position:relative;cursor:pointer;">
                <div style="position:absolute;right:2px;top:2px;width:20px;height:20px;background:white;border-radius:50%;" />
              </div>
            </div>

            <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 1rem;">Link sharing lets you share the summary report with anyone. No login required. The report updates in real-time with new responses.</p>

            <div style="margin-bottom:1rem;">
              <label style="display:block;font-size:0.75rem;font-weight:500;color:var(--text-secondary);margin-bottom:0.5rem;">Shareable Link</label>
              <div style="display:flex;gap:0.5rem;">
                <input type="text" value={formUrl} readOnly style="flex:1;padding:0.5rem;border:1px solid var(--border);border-radius:0.375rem;font-size:0.75rem;background:var(--surface-3);color:var(--text-primary);" />
                <button class="share-btn-secondary" onClick$={async () => {
                  try { await navigator.clipboard.writeText(formUrl); } catch { /* ignore */ }
                }}>Copy</button>
              </div>
            </div>

            <button class="share-btn-primary">
              Download PDF Report
            </button>
          </div>
        </div>
      </div>
    </div>
  );
});


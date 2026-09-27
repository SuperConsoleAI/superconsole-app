// src/components/forms/builder/QuestionPreview.tsx
//
// WHAT:  Center panel of the form builder. Renders a Typeform-style canvas preview
//        of the currently selected question, using the design-system light theme
//        hardcoded so it always looks like a live public form (light bg regardless
//        of app dark/light mode).
//
// HOW:   Reads BuilderContext signals (questions, selectedId, editingThankYou,
//        thankYou, goToNextQuestion, goToPrevQuestion, showDetails).
//        All styles inline — no Tailwind, no CSS vars for the canvas content (it
//        matches the public form appearance).
//
// FLOW:
//   no selection + no editingThankYou → empty placeholder
//   editingThankYou=true              → renders Thank You slide preview
//   selectedId set                    → renders question type preview
//   ↑ / ↓ overlay buttons             → goToPrevQuestion / goToNextQuestion

import { component$, useContext } from "@builder.io/qwik";
import { LuArrowLeft, LuSettings } from "@qwikest/icons/lucide";
import { BuilderContext } from "~/routes/dashboard/forms/[id]/edit/index";
import { lightTheme, typography, spacing, borderRadius, transitions } from "~/lib/design-system";

export const QuestionPreview = component$(() => {
  const {
    questions,
    selectedId,
    editingThankYou,
    thankYou,
    goToNextQuestion,
    goToPrevQuestion,
    showDetails,
  } = useContext(BuilderContext);

  const selectedIndex = questions.value.findIndex((q: any) => q.id === selectedId.value);
  const selected = questions.value[selectedIndex];

  // ── Design-system canvas tokens (always light — matches public form)
  const canvasText    = lightTheme.colors.textPrimary;
  const canvasMuted   = lightTheme.colors.textSecondary;
  const canvasSurface3 = lightTheme.colors.surface3;
  const canvasBtnBg   = lightTheme.colors.buttonPrimaryBackground;
  const canvasBtnText = lightTheme.colors.buttonPrimaryText;

  const inputStyle    = `width:100%;padding:${spacing.sm} 0;border:none;border-bottom:1px solid ${canvasText};background:transparent;font-size:${typography.sizes.lg};color:${canvasText};outline:none;`;
  const labelStyle    = `display:block;font-size:${typography.sizes.xs};font-weight:${typography.weights.semibold};color:${canvasMuted};margin-bottom:${spacing.sm};text-transform:capitalize;`;
  const optionBtnStyle = `height:2.875rem;padding:0 ${spacing.lg};min-width:10rem;background:${canvasSurface3};border:1px solid ${canvasText};border-radius:${borderRadius.lg};cursor:pointer;color:${canvasText};font-size:${typography.sizes.base};text-align:left;display:inline-flex;align-items:center;justify-content:flex-start;width:auto;text-transform:none;transition:all ${transitions.fast};`;
  const nextBtnStyle  = `padding:${spacing.md} ${spacing.xl};height:2.875rem;background:${canvasBtnBg};color:${canvasBtnText};border:none;border-radius:${borderRadius.lg};font-size:${typography.sizes.xl};font-weight:${typography.weights.semibold};cursor:pointer;display:flex;align-items:center;text-transform:none;`;
  const selectStyle   = `width:auto;min-width:10rem;height:2.875rem;padding:0 2.5rem 0 ${spacing.md};border:1px solid ${canvasText};border-radius:${borderRadius.lg};background:transparent;font-size:${typography.sizes.base};color:${canvasText};`;
  const dateStyle     = `padding:${spacing.md};border:none;border-bottom:1px solid ${canvasText};border-radius:0;background:transparent;font-size:${typography.sizes.lg};color:${canvasText};`;

  // ── Shared mobile nav styles
  const navStyles = `
    .builder-top-nav { display:none;padding-bottom:1rem;margin-bottom:1rem;border-bottom:1px solid var(--border);width:100%;justify-content:space-between;flex-shrink:0; }
    .preview-container { flex:1;display:flex;align-items:center;justify-content:center; }
    @media (max-width:1024px) { .builder-top-nav { display:flex; } .preview-container { align-items:flex-start;margin-top:1rem; } }
    .builder-back-btn { display:none; }
    @media (max-width:768px) { .builder-back-btn { display:flex; } }
  `;

  // ── Empty state ──────────────────────────────────────────────────────────
  if (!selected && !editingThankYou.value) {
    return (
      <div style="flex:1;display:flex;flex-direction:column;padding:1rem;overflow:auto;background:var(--surface-1);height:100%;">
        <style>{`
          .builder-top-nav { display:none;padding-bottom:1rem;margin-bottom:1rem;border-bottom:1px solid var(--border);width:100%;justify-content:space-between;flex-shrink:0; }
          @media (max-width:1024px) { .builder-top-nav { display:flex; } }
          .builder-back-btn { display:none; }
          @media (max-width:768px) { .builder-back-btn { display:flex; } }
        `}</style>
        <div class="builder-top-nav">
          <button class="builder-back-btn" type="button" onClick$={() => { selectedId.value = null; }} style="padding:0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--text-primary);">
            <LuArrowLeft style="width:1rem;height:1rem;" /> Back
          </button>
        </div>
        <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;">
          <div style="color:var(--text-secondary);text-align:center;">
            <div style="font-size:3rem;margin-bottom:1rem;">📝</div>
            <p>Select a block from the sidebar to preview.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Resolve options array from JSON string ───────────────────────────────
  const getOpts = (): string[] => {
    if (!selected) return ["Option 1", "Option 2"];
    try {
      const p = JSON.parse(selected.options || "[]");
      return Array.isArray(p) && p.length > 0 ? p : ["Option 1", "Option 2"];
    } catch { return ["Option 1", "Option 2"]; }
  };

  return (
    <div style="flex:1;display:flex;flex-direction:column;padding:1rem;overflow:auto;background:var(--surface-1);height:100%;">
      <style>{navStyles}</style>

      {/* Mobile top nav */}
      <div class="builder-top-nav">
        <button class="builder-back-btn" type="button" onClick$={() => { selectedId.value = null; editingThankYou.value = false; }} style="padding:0.5rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--text-primary);">
          <LuArrowLeft style="width:1rem;height:1rem;" /> Question
        </button>
        <div style="flex:1;" />
        <button type="button" onClick$={() => { showDetails.value = !showDetails.value; }} style="padding:0.5rem 1rem;background:var(--surface-2);border:1px solid var(--border);border-radius:0.375rem;cursor:pointer;display:flex;align-items:center;gap:0.5rem;font-size:0.875rem;color:var(--text-primary);">
          <LuSettings style="width:1rem;height:1rem;" /> Edit Details
        </button>
      </div>

      <div class="preview-container">
        {/* Canvas — always white, Typeform-style */}
        <div style="width:100%;max-width:800px;min-height:500px;background:white;border:1px dashed #ccc;border-radius:0.5rem;display:flex;flex-direction:column;position:relative;">
          <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:2rem 3rem;">

            {/* ── Thank You slide ─────────────────────────────────────── */}
            {editingThankYou.value ? (
              <div style="max-width:500px;width:100%;text-align:left;">
                <h2 style="font-size:2.25rem;font-weight:600;color:#000;margin:0 0 0.75rem;">{thankYou.value.title}</h2>
                <p style="font-size:1.125rem;font-weight:400;color:#666;margin:0 0 2rem;">{thankYou.value.message}</p>
                {thankYou.value.type === "redirect" && (
                  <div style="display:flex;align-items:center;gap:0.5rem;color:#666;">
                    <span style="width:1rem;height:1rem;border:2px solid #ccc;border-top-color:#000;border-radius:50%;" />
                    Redirecting to: {thankYou.value.redirect_url}
                  </div>
                )}
                {thankYou.value.type === "button" && (
                  <div style="display:flex;align-items:center;gap:1rem;">
                    <button type="button" style="padding:1rem 2rem;height:2.875rem;background:#000;color:white;border:none;border-radius:0.5rem;font-size:1.25rem;font-weight:600;cursor:pointer;display:flex;align-items:center;">
                      {thankYou.value.button_text}
                    </button>
                    <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                  </div>
                )}
              </div>

            ) : selected ? (
              /* ── Question preview ──────────────────────────────────── */
              <div style="max-width:500px;width:100%;text-align:left;">
                {selected.image_url && (
                  <img src={selected.image_url} alt="" width={500} height={200} style="max-width:100%;max-height:200px;margin-bottom:1.5rem;border-radius:0.5rem;object-fit:cover;" />
                )}
                {selected.embed_url && (
                  <div style="margin-bottom:1.5rem;width:100%;border-radius:0.5rem;overflow:hidden;aspect-ratio:16/9;background:#000;">
                    <iframe src={selected.embed_url} width="100%" height="100%" frameBorder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullscreen style="border:none;" />
                  </div>
                )}
                <h2 style="font-size:2.25rem;font-weight:600;color:#000;margin:0 0 0.5rem;">{selected.title}</h2>
                {selected.description && (
                  <p style="font-size:1.125rem;font-weight:400;color:#666;margin:0 0 2rem;">{selected.description}</p>
                )}

                {/* Statement */}
                {selected.question_type === "statement" && (
                  <div style="display:flex;align-items:center;gap:1rem;margin-top:2rem;">
                    <button type="button" style={nextBtnStyle}>{selected.button_text || "Let's start"}</button>
                    <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                  </div>
                )}

                {/* Thank You (embedded) */}
                {selected.question_type === "thank_you" && (
                  <div style="display:flex;align-items:center;gap:1rem;margin-top:2rem;">
                    <button type="button" style={nextBtnStyle}>{selected.button_text || "Create Form @ BusinessKit"}</button>
                  </div>
                )}

                {/* Short text / email / phone / url / number */}
                {["short_text", "email", "phone", "url", "number"].includes(selected.question_type) && (
                  <div style="margin-top:1.5rem;">
                    <input type="text" placeholder={selected.placeholder || "Type your answer here..."} style={inputStyle} />
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* Long text */}
                {selected.question_type === "long_text" && (
                  <div style="margin-top:1.5rem;">
                    <textarea placeholder={selected.placeholder || "Type your answer here..."} rows={4} style={`width:100%;padding:${spacing.md};border:1px solid ${canvasText};border-radius:${borderRadius.lg};background:transparent;font-size:${typography.sizes.lg};color:${canvasText};outline:none;resize:none;`} />
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* Date */}
                {selected.question_type === "date" && (
                  <div style="margin-top:1.5rem;">
                    <input type="date" style={dateStyle} />
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* Contact Info */}
                {selected.question_type === "contact_info" && (
                  <div style="margin-top:1.5rem;display:flex;flex-direction:column;gap:1.5rem;">
                    <div style="display:flex;gap:1.5rem;">
                      <div style="flex:1;"><label style={labelStyle}>First Name</label><input type="text" placeholder="John" style={inputStyle} /></div>
                      <div style="flex:1;"><label style={labelStyle}>Last Name</label><input type="text" placeholder="Doe" style={inputStyle} /></div>
                    </div>
                    <div><label style={labelStyle}>Phone Number</label><input type="tel" placeholder="+1 (555) 000-0000" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Email</label><input type="email" placeholder="john@example.com" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Company</label><input type="text" placeholder="Acme Inc." style={inputStyle} /></div>
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:0.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* Address */}
                {selected.question_type === "address" && (
                  <div style="margin-top:1.5rem;display:flex;flex-direction:column;gap:1.5rem;">
                    <div><label style={labelStyle}>Address</label><input type="text" placeholder="123 Main St" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Address Line 2 (Optional)</label><input type="text" placeholder="Apt, Suite, Bldg" style={inputStyle} /></div>
                    <div><label style={labelStyle}>City</label><input type="text" placeholder="New York" style={inputStyle} /></div>
                    <div style="display:flex;gap:1.5rem;">
                      <div style="flex:1;"><label style={labelStyle}>State / Province</label><input type="text" placeholder="NY" style={inputStyle} /></div>
                      <div style="flex:1;"><label style={labelStyle}>ZIP / Postal Code</label><input type="text" placeholder="10001" style={inputStyle} /></div>
                    </div>
                    <div>
                      <label style={labelStyle}>Country</label>
                      <select style={selectStyle}><option>United States</option><option>United Kingdom</option><option>Canada</option></select>
                    </div>
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:0.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* Single select / Multi select / Ranking */}
                {["single_select", "multi_select", "ranking"].includes(selected.question_type) && (
                  <div style="margin-top:1.5rem;display:flex;flex-direction:column;gap:0.5rem;">
                    {getOpts().map((opt: string, idx: number) => (
                      <button key={idx} type="button" style={optionBtnStyle}>
                        <div style="width:1.5rem;height:1.5rem;background:rgba(0,0,0,0.05);color:#000;border:1px solid var(--border);font-size:0.75rem;display:flex;align-items:center;justify-content:center;border-radius:0.25rem;font-weight:600;margin-right:0.75rem;">
                          {String.fromCharCode(65 + idx)}
                        </div>
                        {opt}
                      </button>
                    ))}
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* Dropdown */}
                {selected.question_type === "dropdown" && (
                  <div style="margin-top:1.5rem;position:relative;max-width:300px;">
                    <select style={selectStyle}>
                      <option disabled>Select an option...</option>
                      {getOpts().map((opt: string, idx: number) => (
                        <option key={idx} value={opt}>{opt}</option>
                      ))}
                    </select>
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* File Upload */}
                {selected.question_type === "file_upload" && (
                  <div style="margin-top:1.5rem;">
                    <div style={`width:100%;padding:2rem;border:2px dashed ${canvasText};border-radius:${borderRadius.lg};text-align:center;color:${canvasText};cursor:pointer;`}>
                      <div style="font-size:2rem;margin-bottom:0.5rem;">📁</div>
                      <div>Choose a file or drag & drop it here</div>
                    </div>
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* Signature */}
                {selected.question_type === "signature" && (
                  <div style="margin-top:1.5rem;">
                    <div style={`width:100%;height:120px;border-bottom:2px solid ${canvasText};display:flex;align-items:flex-end;padding-bottom:0.5rem;color:${canvasMuted};font-family:cursive;font-size:1.5rem;`}>
                      Sign here...
                    </div>
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* Star Rating */}
                {selected.question_type === "rating" && (
                  <div style="margin-top:1.5rem;">
                    <div style="display:flex;gap:0.5rem;">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <div key={star} style={`width:3rem;height:3rem;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${canvasText};opacity:0.2;`}>
                          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        </div>
                      ))}
                    </div>
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

                {/* NPS */}
                {selected.question_type === "nps" && (
                  <div style="margin-top:1.5rem;">
                    <div style="display:flex;flex-wrap:wrap;gap:0.5rem;width:100%;">
                      {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                        <div key={num} style={`width:3rem;height:3.5rem;border:1px solid ${canvasText};border-radius:0.25rem;display:flex;align-items:center;justify-content:center;font-weight:600;cursor:pointer;color:${canvasText};transition:all 0.2s;`}>{num}</div>
                      ))}
                    </div>
                    <div style={`display:flex;justify-content:space-between;margin-top:0.5rem;font-size:0.75rem;color:${canvasMuted};`}>
                      <span>Not at all likely</span>
                      <span>Extremely likely</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:1rem;margin-top:1.5rem;">
                      <button type="button" style={nextBtnStyle}>{selected.button_text || "Next"}</button>
                      <span style="font-size:0.75rem;color:#999;">press Enter ↵</span>
                    </div>
                  </div>
                )}

              </div>
            ) : null}
          </div>

          {/* ↑ ↓ navigation overlay */}
          <div style="position:absolute;bottom:1rem;right:1rem;display:flex;gap:0.5rem;">
            <div
              onClick$={goToPrevQuestion}
              style={`width:2.125rem;height:2.125rem;background:${canvasBtnBg};border-radius:${borderRadius.lg};cursor:${editingThankYou.value ? "default" : "pointer"};display:flex;align-items:center;justify-content:center;${editingThankYou.value ? "opacity:0.5;" : ""}`}
            >
              <div style={`width:1.5rem;height:1.5rem;display:flex;align-items:center;justify-content:center;color:${canvasBtnText};`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
              </div>
            </div>
            <div
              onClick$={goToNextQuestion}
              style={`width:2.125rem;height:2.125rem;background:${canvasBtnBg};border-radius:${borderRadius.lg};cursor:${editingThankYou.value ? "default" : "pointer"};display:flex;align-items:center;justify-content:center;${editingThankYou.value ? "opacity:0.5;" : ""}`}
            >
              <div style={`width:1.5rem;height:1.5rem;display:flex;align-items:center;justify-content:center;color:${canvasBtnText};`}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

// src/routes/dashboard/settings/brand/index.tsx
// Brand Foundation — context & working style injected into AI Agent Chat turns.

import { component$, useSignal, useVisibleTask$, $, useStyles$ } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { LuSparkles, LuSave, LuCheck, LuInfo, LuLoader } from "@qwikest/icons/lucide";
import { getBrandFoundation, saveBrandFoundation } from "~/lib/ipc";
import type { BrandFoundation } from "~/lib/types";

const BRAND_STYLES = `
  .brand-wrap {
    container-type: inline-size;
    width: 100%;
    max-width: 960px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    box-sizing: border-box;
  }
  .brand-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .brand-header-info {
    flex: 1;
    min-width: 240px;
  }
  .brand-save-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    height: 2.25rem;
    padding: 0 1rem;
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    font-weight: 500;
    border: none;
    background: var(--text-primary);
    color: var(--surface-1);
    transition: opacity 0.15s;
    flex-shrink: 0;
    box-sizing: border-box;
  }
  .brand-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    width: 100%;
  }
  .brand-card {
    padding: 1.25rem;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    box-sizing: border-box;
    min-width: 0;
  }
  .brand-card-label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
    margin-bottom: 0.25rem;
    flex-wrap: wrap;
    gap: 0.35rem;
  }
  .brand-helper {
    padding: 1rem 1.25rem;
    border-radius: 0.5rem;
    background: var(--surface-3);
    border: 1px solid var(--border);
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    box-sizing: border-box;
  }

  @container (max-width: 640px) {
    .brand-header {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .brand-header-info {
      min-width: 0;
      width: 100%;
    }
    .brand-save-btn {
      width: 100%;
      justify-content: center;
    }
    .brand-grid {
      grid-template-columns: 1fr !important;
      gap: 0.75rem;
    }
    .brand-card {
      padding: 1rem;
    }
    .brand-helper {
      padding: 0.875rem 1rem;
    }
  }

  @media (max-width: 640px) {
    .brand-header {
      flex-direction: column;
      align-items: stretch;
      gap: 0.75rem;
    }
    .brand-header-info {
      min-width: 0;
      width: 100%;
    }
    .brand-save-btn {
      width: 100%;
      justify-content: center;
    }
    .brand-grid {
      grid-template-columns: 1fr !important;
      gap: 0.75rem;
    }
    .brand-card {
      padding: 1rem;
    }
    .brand-helper {
      padding: 0.875rem 1rem;
    }
  }
`;

const inputStyle = {
  width: "100%",
  padding: "0.625rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.8125rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
  lineHeight: "1.5",
  fontFamily: "inherit",
};

export default component$(() => {
  useStyles$(BRAND_STYLES);
  const loading = useSignal(true);
  const saving = useSignal(false);
  const savedSuccessfully = useSignal(false);
  const errorMsg = useSignal("");

  const aboutMe = useSignal("");
  const brandVoice = useSignal("");
  const workingStyle = useSignal("");
  const businessGoals = useSignal("");

  const loadFoundation = $(async () => {
    loading.value = true;
    errorMsg.value = "";
    try {
      const data: BrandFoundation = await getBrandFoundation();
      aboutMe.value = data.about_me || "";
      brandVoice.value = data.brand_voice || "";
      workingStyle.value = data.working_style || "";
      businessGoals.value = data.business_goals || "";
    } catch (err: any) {
      console.error("Failed to load brand foundation:", err);
      errorMsg.value = typeof err === "string" ? err : err.message || "Failed to load data";
    } finally {
      loading.value = false;
    }
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    loadFoundation();
  });

  const handleSave = $(async () => {
    saving.value = true;
    errorMsg.value = "";
    savedSuccessfully.value = false;
    try {
      await saveBrandFoundation({
        about_me: aboutMe.value,
        brand_voice: brandVoice.value,
        working_style: workingStyle.value,
        business_goals: businessGoals.value,
      });
      savedSuccessfully.value = true;
      setTimeout(() => {
        savedSuccessfully.value = false;
      }, 2500);
    } catch (err: any) {
      console.error("Failed to save brand foundation:", err);
      errorMsg.value = typeof err === "string" ? err : err.message || "Failed to save data";
    } finally {
      saving.value = false;
    }
  });

  return (
    <div class="brand-wrap">
      {/* Header (No divider line) */}
      <div class="brand-header">
        <div class="brand-header-info">
          <div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.25rem;">
            <div style="width:1.75rem;height:1.75rem;border-radius:0.375rem;background:var(--surface-3);border:1px solid var(--border);display:flex;align-items:center;justify-content:center;color:var(--text-primary);flex-shrink:0;">
              <LuSparkles style="width:0.875rem;height:0.875rem;" />
            </div>
            <h1 style="font-size:1.125rem;font-weight:600;color:var(--text-primary);margin:0;">
              Brand Foundation
            </h1>
          </div>
          <p style="font-size:0.8125rem;color:var(--text-secondary);margin:0;">
            Context and instructions automatically injected into AI Agent turns and content generation. Stored in UserDB.
          </p>
        </div>

        <button
          type="button"
          class="brand-save-btn"
          onClick$={handleSave}
          disabled={saving.value || loading.value}
          style={`cursor:${saving.value || loading.value ? 'not-allowed' : 'pointer'};opacity:${saving.value || loading.value ? '0.5' : '1'};`}
        >
          {saving.value ? (
            <LuLoader style="width:0.875rem;height:0.875rem;animation:spin 1s linear infinite;" />
          ) : savedSuccessfully.value ? (
            <LuCheck style="width:0.875rem;height:0.875rem;color:var(--success);" />
          ) : (
            <LuSave style="width:0.875rem;height:0.875rem;" />
          )}
          <span>{savedSuccessfully.value ? "Saved" : saving.value ? "Saving…" : "Save Foundation"}</span>
        </button>
      </div>

      {errorMsg.value && (
        <div style="padding:0.75rem 1rem;background:var(--error-soft, rgba(239,68,68,0.08));border:1px solid var(--error);border-radius:0.375rem;color:var(--error);font-size:0.8125rem;">
          {errorMsg.value}
        </div>
      )}

      {loading.value ? (
        <div class="brand-grid">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} class="brand-card">
              <div style="height:1rem;background:var(--surface-3);border-radius:0.25rem;width:40%;" />
              <div style="height:7rem;background:var(--surface-3);border-radius:0.375rem;width:100%;" />
            </div>
          ))}
        </div>
      ) : (
        <div class="brand-grid">
          {/* Card 1: About Me & Business */}
          <div class="brand-card">
            <div class="brand-card-label">
              <span>About the Business & Founder</span>
              <span style="font-size:0.6875rem;font-weight:500;padding:2px 6px;border-radius:0.25rem;background:var(--surface-3);color:var(--text-secondary);border:1px solid var(--border);">Context</span>
            </div>
            <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 0.25rem 0;">
              Core background, offerings, target audience, founding story, and industry specifics.
            </p>
            <textarea
              value={aboutMe.value}
              onInput$={(e) => (aboutMe.value = (e.target as HTMLTextAreaElement).value)}
              placeholder="e.g. BusinessKit builds tools for modern commerce operators. Our customers are solo entrepreneurs..."
              rows={6}
              style={{ ...inputStyle, resize: "vertical", minHeight: "6rem" }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Card 2: Brand Voice & Tone */}
          <div class="brand-card">
            <div class="brand-card-label">
              <span>Brand Voice & Tone</span>
              <span style="font-size:0.6875rem;font-weight:500;padding:2px 6px;border-radius:0.25rem;background:var(--surface-3);color:var(--text-secondary);border:1px solid var(--border);">Personality</span>
            </div>
            <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 0.25rem 0;">
              Tone guidelines, vocabulary, personality traits, and writing style rules.
            </p>
            <textarea
              value={brandVoice.value}
              onInput$={(e) => (brandVoice.value = (e.target as HTMLTextAreaElement).value)}
              placeholder="e.g. Confident, direct, hyper-pragmatic. Avoid corporate jargon or fluff. Speak clearly with high information density..."
              rows={6}
              style={{ ...inputStyle, resize: "vertical", minHeight: "6rem" }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Card 3: Working Style & Rules */}
          <div class="brand-card">
            <div class="brand-card-label">
              <span>Working Style & Operational Rules</span>
              <span style="font-size:0.6875rem;font-weight:500;padding:2px 6px;border-radius:0.25rem;background:var(--surface-3);color:var(--text-secondary);border:1px solid var(--border);">Operations</span>
            </div>
            <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 0.25rem 0;">
              Preferences for how actions should be executed (e.g. default warehouse, invoice terms, tags).
            </p>
            <textarea
              value={workingStyle.value}
              onInput$={(e) => (workingStyle.value = (e.target as HTMLTextAreaElement).value)}
              placeholder="e.g. Always set invoice due date to Net 15 days. Prefix leads with 'web-' tag. Use Main Warehouse by default..."
              rows={6}
              style={{ ...inputStyle, resize: "vertical", minHeight: "6rem" }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>

          {/* Card 4: Business Goals & Focus */}
          <div class="brand-card">
            <div class="brand-card-label">
              <span>Business Goals & Priorities</span>
              <span style="font-size:0.6875rem;font-weight:500;padding:2px 6px;border-radius:0.25rem;background:var(--surface-3);color:var(--text-secondary);border:1px solid var(--border);">Strategy</span>
            </div>
            <p style="font-size:0.75rem;color:var(--text-secondary);margin:0 0 0.25rem 0;">
              Current quarter goals, key products to push, high-priority customer segments.
            </p>
            <textarea
              value={businessGoals.value}
              onInput$={(e) => (businessGoals.value = (e.target as HTMLTextAreaElement).value)}
              placeholder="e.g. Q4 Goal: Increase direct B2B invoice volume by 25%. Push SKU-1042 wholesale bundles..."
              rows={6}
              style={{ ...inputStyle, resize: "vertical", minHeight: "6rem" }}
              onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
              onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
            />
          </div>
        </div>
      )}

      {/* Helper Box */}
      <div class="brand-helper">
        <LuInfo style="width:1.125rem;height:1.125rem;color:var(--text-secondary);flex-shrink:0;margin-top:2px;" />
        <p style="font-size:0.8125rem;color:var(--text-secondary);line-height:1.5;margin:0;">
          <strong style="color:var(--text-primary);font-weight:600;">How it works:</strong> Whenever you interact with the agent in the chat sidebar, the system prompt automatically loads this Brand Foundation from your cloud UserDB.
        </p>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Brand Foundation — Settings",
};

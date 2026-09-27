// src/routes/onboarding/index.tsx
//
// WHAT:  First-launch onboarding wizard — 2 steps.
// HOW:   Step-based UI driven by local signal. Each step invokes Rust commands.
//        No navigation between steps — same page, signal-controlled rendering.
//
// FLOW:
//   Step 1: Create project   → invoke('create_project')  → success → step 2
//   Step 2: Connect Turso DB → invoke('connect_user_db') → success → /dashboard

import { $, component$, useSignal, useContext, useTask$, useVisibleTask$ } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { connectUserDb, createProject, switchProject, getProvisionStatus, authStatus } from "~/lib/ipc";
import { AppContext } from "~/lib/app-context";
import { triggerHaptic } from "~/lib/haptics";
import { LuLoader2, LuArrowRight, LuDatabase, LuFolderOpen } from "@qwikest/icons/lucide";
import type { Profile } from "~/lib/types";
import businesskitIcon from "~/assets/businesskit-icon.svg?url";

type Step = 1 | 2;

export default component$(() => {
  const ctx = useContext(AppContext);
  const nav = useNavigate();
  const step = useSignal<Step>(1);
  const loading = useSignal(false);
  const cancelling = useSignal(false);
  const exiting = useSignal(false);
  const error = useSignal<string | null>(null);

  // Step 1 — Project
  const projectName = useSignal("");
  const projectSlug = useSignal("");
  const createdProfile = useSignal<Profile | null>(null);

  // Step 2 — Turso DB
  const tursoUrl = useSignal("");
  const tursoToken = useSignal("");

  // Default project name & slug from user's email username (without @)
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    try {
      const session = await authStatus();
      if (session?.email) {
        const emailPrefix = session.email.split("@")[0] || "";
        const defaultSlug = emailPrefix
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-|-$/g, "");
        if (!projectName.value) {
          projectName.value = session.name || emailPrefix;
        }
        if (!projectSlug.value) {
          projectSlug.value = defaultSlug;
        }
      }
    } catch (e) {
      console.warn("Failed to load user email for onboarding defaults:", e);
    }
  });

  useTask$(({ track }) => {
    track(() => ctx.profiles.value);
    track(() => ctx.activeProfileId.value);

    // If no profiles exist, always enforce Step 1 (Create Profile)
    if (ctx.profiles.value.length === 0 && !createdProfile.value) {
      step.value = 1;
    }
  });

  const handleCancel = $(async () => {
    if (cancelling.value) return;
    cancelling.value = true;
    triggerHaptic("light");

    // If user has multiple profiles, switch to another profile before going to dashboard
    if (ctx.profiles.value.length > 1) {
      const otherProfile = ctx.profiles.value.find((p) => p.id !== ctx.activeProfileId.value) || ctx.profiles.value[0];
      if (otherProfile) {
        try {
          await switchProject(otherProfile.id);
          ctx.activeProfileId.value = otherProfile.id;
          localStorage.setItem("bk-active-profile", otherProfile.id);
        } catch (e) {
          console.error("Failed to switch profile on cancel:", e);
        }
      }
    }

    exiting.value = true;
    await new Promise((resolve) => setTimeout(resolve, 200));
    nav("/dashboard");
  });

  const handleStep1 = $(async () => {
    if (!projectName.value.trim()) {
      error.value = "Project name is required.";
      return;
    }
    if (!projectSlug.value.trim()) {
      projectSlug.value = projectName.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    error.value = null;
    loading.value = true;
    try {
      const newProf = await createProject(projectName.value.trim(), projectSlug.value.trim());
      createdProfile.value = newProf;
      ctx.profiles.value = [...ctx.profiles.value.filter((p) => p.id !== newProf.id), newProf];
      ctx.activeProfileId.value = newProf.id;
      localStorage.setItem("bk-active-profile", newProf.id);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("bk-window-profile", newProf.id);
      }
      step.value = 2;
    } catch (e) {
      const errStr = String(e);
      if (
        errStr.includes("UNIQUE constraint failed") ||
        errStr.includes("profiles.slug") ||
        errStr.includes("Username Taken")
      ) {
        error.value = "Username Taken";
      } else {
        error.value = errStr;
      }
      triggerHaptic("error");
    } finally {
      loading.value = false;
    }
  });

  const connectStatusMsg = useSignal("");

  const handleStep2 = $(async () => {
    if (!tursoUrl.value.trim() || !tursoToken.value.trim()) {
      error.value = "Turso URL and token are required.";
      triggerHaptic("error");
      return;
    }
    error.value = null;
    loading.value = true;
    connectStatusMsg.value = "Testing...";
    triggerHaptic("medium");

    const saveTimer = setTimeout(() => {
      if (loading.value) {
        connectStatusMsg.value = "Saving...";
        triggerHaptic("light");
      }
    }, 450);

    try {
      const orgId = ctx.org.value?.id;
      if (!orgId) {
        throw new Error("Organization not loaded. Please reload the page.");
      }
      const activeProfile = createdProfile.value || ctx.profiles.value.find((p) => p.id === ctx.activeProfileId.value) || ctx.profiles.value[0];
      const targetProfileId = activeProfile?.id;
      if (!targetProfileId) {
        step.value = 1;
        throw new Error("No profile found. Please create a project first.");
      }
      await connectUserDb(tursoUrl.value.trim(), tursoToken.value.trim(), orgId, targetProfileId);
      clearTimeout(saveTimer);

      ctx.activeProfileId.value = targetProfileId;
      localStorage.setItem("bk-active-profile", targetProfileId);
      if (typeof sessionStorage !== "undefined") {
        sessionStorage.setItem("bk-window-profile", targetProfileId);
      }

      connectStatusMsg.value = "Saving...";
      await new Promise((r) => setTimeout(r, 200));

      connectStatusMsg.value = "Connected!";
      triggerHaptic("success");

      // Check if this profile has tables provisioned
      localStorage.removeItem(`bk-provisioned-${targetProfileId}`);
      let shouldGoToStatus = true;
      try {
        const ps = await getProvisionStatus();
        if (ps.last_provisioned_at) {
          shouldGoToStatus = false;
          localStorage.setItem(`bk-provisioned-${targetProfileId}`, String(ps.last_provisioned_at));
        }
      } catch (e) {
        console.warn("Failed to check provision status on onboarding finish:", e);
      }

      await new Promise((r) => setTimeout(r, 250));
      if (shouldGoToStatus) {
        nav("/dashboard/settings/status");
      } else {
        nav("/dashboard");
      }
    } catch (e) {
      clearTimeout(saveTimer);
      error.value = String(e);
      triggerHaptic("error");
    } finally {
      loading.value = false;
      connectStatusMsg.value = "";
    }
  });

  const slugify = $((val: string) => {
    projectSlug.value = val
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  });

  return (
    <div class="auth-screen">
      <div
        class="auth-card"
        style={{
          "max-width": "520px",
          "transition": "opacity 0.22s cubic-bezier(0.16, 1, 0.3, 1), transform 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
          "opacity": exiting.value ? "0" : "1",
          "transform": exiting.value ? "translateY(-12px) scale(0.98)" : "translateY(0) scale(1)",
        }}
      >
        {/* Logo */}
        <div class="auth-logo">
          <img
            src={businesskitIcon}
            alt="BusinessKit"
            width={32}
            height={32}
            style="width:32px;height:32px;border-radius:var(--radius-sm);object-fit:cover;flex-shrink:0"
          />
          <span style="font-size:1rem;font-weight:700;color:var(--text-primary)">
            BusinessKit Setup
          </span>
        </div>

        {/* Step indicator */}
        <div class="step-indicator">
          {([1, 2] as Step[]).map((s) => (
            <div
              key={s}
              class={
                "step-dot" +
                (s === step.value ? " active" : "") +
                (s < step.value ? " done" : "")
              }
            />
          ))}
        </div>

        {/* Error */}
        {error.value && (
          <div class="error-banner" style="margin-bottom:16px">
            {error.value}
          </div>
        )}

        {/* ── Step 1: Create Project ── */}
        {step.value === 1 && (
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
              <LuFolderOpen style="width:20px;height:20px;color:var(--accent)" />
              <h2 style="font-size:1.25rem;font-weight:700;color:var(--text-primary)">
                Create your first project
              </h2>
            </div>
            <p class="text-sm text-secondary" style="margin-bottom:24px;line-height:1.6">
              A project is your public profile — links, products, community, and more live under it.
            </p>

            <div class="form-group">
              <label class="form-label">Project name</label>
              <input
                class="form-input"
                type="text"
                placeholder="My Business"
                value={projectName.value}
                onInput$={(e) => {
                  projectName.value = (e.target as HTMLInputElement).value;
                  slugify(projectName.value);
                }}
              />
            </div>

            <div class="form-group">
              <label class="form-label">URL slug</label>
              <div style="display:flex;align-items:center;gap:0;position:relative">
                <input
                  class="form-input"
                  type="text"
                  placeholder="my-business"
                  value={projectSlug.value}
                  style="border-radius:var(--radius-sm) 0 0 var(--radius-sm);border-right:none;position:relative;z-index:1"
                  onInput$={(e) => (projectSlug.value = (e.target as HTMLInputElement).value)}
                />
                <div style="height:36px;padding:0 12px;background:var(--surface-3);border:1px solid var(--border);border-left:none;border-radius:0 var(--radius-sm) var(--radius-sm) 0;display:flex;align-items:center;font-size:0.8125rem;color:var(--text-muted);white-space:nowrap;user-select:none;flex-shrink:0">
                  .businesskit.io
                </div>
              </div>
            </div>

            <button
              class="btn btn-primary w-full btn-lg"
              onClick$={handleStep1}
              disabled={loading.value || cancelling.value}
              style="margin-top:8px"
            >
              {loading.value ? <LuLoader2 style="width:16px;height:16px" /> : null}
              {loading.value ? "Creating…" : "Create & Continue"}
              {!loading.value && <LuArrowRight style="width:16px;height:16px" />}
            </button>
            <button
              class="btn w-full btn-lg"
              onClick$={handleCancel}
              disabled={loading.value || cancelling.value}
              style="margin-top:8px; background:transparent; border:1px solid var(--border); color:var(--text-secondary); display:flex; align-items:center; justify-content:center; gap:8px;"
            >
              {cancelling.value && <LuLoader2 style="width:16px;height:16px;animation:spin 1s linear infinite;" />}
              {cancelling.value ? "Returning to dashboard…" : "Cancel"}
            </button>
          </div>
        )}

        {/* ── Step 2: Connect Turso ── */}
        {step.value === 2 && (() => {
          const activeProfile = createdProfile.value || ctx.profiles.value.find(p => p.id === ctx.activeProfileId.value) || ctx.profiles.value[0];
          return (
            <div>
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                <LuDatabase style="width:20px;height:20px;color:var(--accent)" />
                <h2 style="font-size:1.25rem;font-weight:700;color:var(--text-primary)">
                  Connect your database
                </h2>
              </div>
              <p class="text-sm text-secondary" style="margin-bottom:16px;line-height:1.6">
                BusinessKit stores your data in your own Turso database. Create a free database at
                <a href="https://turso.tech" target="_blank" style="color:var(--accent);margin-left:4px">turso.tech</a>.
              </p>

              {activeProfile && (
                <div style="background:var(--surface-3);border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 14px;margin-bottom:16px;display:flex;align-items:center;gap:12px;">
                  <LuFolderOpen style="width:20px;height:20px;color:var(--accent);flex-shrink:0;" />
                  <div style="display:flex;flex-direction:column;gap:2px;">
                    <span style="font-size:0.7rem;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-secondary);font-weight:700;">Adding Database For</span>
                    <div style="display:flex;align-items:center;gap:6px;">
                      <strong style="color:var(--text-primary);font-size:0.95rem;">{activeProfile.title}</strong>
                      <span style="color:var(--text-muted);font-size:0.8rem;">({activeProfile.slug})</span>
                    </div>
                  </div>
                </div>
              )}

              <div class="form-group">
                <label class="form-label">Database URL</label>
                <input
                  class="form-input"
                  type="text"
                  placeholder="libsql://your-db.turso.io"
                  value={tursoUrl.value}
                  onInput$={(e) => (tursoUrl.value = (e.target as HTMLInputElement).value)}
                />
              </div>

              <div class="form-group">
                <label class="form-label">Auth Token</label>
                <input
                  class="form-input"
                  type="password"
                  placeholder="eyJhbGciOiJFZERTQSJ9…"
                  value={tursoToken.value}
                  onInput$={(e) => (tursoToken.value = (e.target as HTMLInputElement).value)}
                />
                <p class="text-xs text-muted" style="margin-top:4px">
                  Found in Turso dashboard → your database → Generate token
                </p>
              </div>

              <button
                class="btn btn-primary w-full btn-lg"
                onClick$={handleStep2}
                disabled={loading.value || cancelling.value}
                style="margin-top:8px; display:flex; align-items:center; justify-content:center; gap:8px;"
              >
                {loading.value ? (
                  <>
                    <LuLoader2 style="width:18px;height:18px;animation:spin 1s linear infinite;" />
                    <span>{connectStatusMsg.value || "Connecting database…"}</span>
                  </>
                ) : (
                  <>
                    <span>Connect &amp; Finish</span>
                    <LuArrowRight style="width:16px;height:16px;" />
                  </>
                )}
              </button>
              <button
                class="btn w-full btn-lg"
                onClick$={handleCancel}
                disabled={loading.value || cancelling.value}
                style="margin-top:8px; background:transparent; border:1px solid var(--border); color:var(--text-secondary); display:flex; align-items:center; justify-content:center; gap:8px;"
              >
                {cancelling.value && <LuLoader2 style="width:16px;height:16px;animation:spin 1s linear infinite;" />}
                {cancelling.value ? "Returning to dashboard…" : "Cancel"}
              </button>
            </div>
          );
        })()}
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Setup — BusinessKit",
};

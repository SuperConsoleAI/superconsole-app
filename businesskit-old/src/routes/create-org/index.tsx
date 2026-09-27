// src/routes/create-org/index.tsx
//
// WHAT:  UI to create a new organization.
// HOW:   Invokes create_new_organization command, updates context, switches to it.

import { $, component$, useSignal, useContext } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { createOrganization, getUserOrganizations, switchOrganization } from "~/lib/ipc";
import { AppContext } from "~/lib/app-context";
import { LuLoader2, LuArrowRight, LuBuilding } from "@qwikest/icons/lucide";
import businesskitIcon from "~/assets/businesskit-icon.svg?url";

export default component$(() => {
  const ctx = useContext(AppContext);
  const nav = useNavigate();
  const loading = useSignal(false);
  const error = useSignal<string | null>(null);

  const orgName = useSignal("");

  const handleCreate = $(async () => {
    if (!orgName.value.trim()) {
      error.value = "Organization name is required.";
      return;
    }
    error.value = null;
    loading.value = true;
    try {
      const newOrg = await createOrganization(orgName.value.trim());
      
      // Update global context
      const orgs = await getUserOrganizations();
      ctx.organizations.value = orgs;
      
      // Switch to new org
      await switchOrganization(newOrg.id);
      
      // Navigate to dashboard which will auto-resolve the default profile
      nav("/dashboard");
    } catch (e) {
      error.value = String(e);
    } finally {
      loading.value = false;
    }
  });

  return (
    <div class="auth-screen">
      <div class="auth-card" style="max-width:520px">
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

        {/* Error */}
        {error.value && (
          <div class="error-banner" style="margin-bottom:16px">
            {error.value}
          </div>
        )}

        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
            <LuBuilding style="width:20px;height:20px;color:var(--accent)" />
            <h2 style="font-size:1.25rem;font-weight:700;color:var(--text-primary)">
              Create new organization
            </h2>
          </div>
          <p class="text-sm text-secondary" style="margin-bottom:24px;line-height:1.6">
            An organization contains your workspaces and users. It's the top-level container for billing and access control.
          </p>

          <div class="form-group">
            <label class="form-label">Organization name</label>
            <input
              class="form-input"
              type="text"
              placeholder="Acme Corp"
              value={orgName.value}
              onInput$={(e) => {
                orgName.value = (e.target as HTMLInputElement).value;
              }}
              onKeyDown$={(e) => {
                if (e.key === 'Enter') handleCreate();
              }}
            />
          </div>

          <button
            class="btn btn-primary w-full btn-lg"
            onClick$={handleCreate}
            disabled={loading.value}
            style="margin-top:8px"
          >
            {loading.value ? <LuLoader2 style="width:16px;height:16px" /> : null}
            {loading.value ? "Creating…" : "Create Organization"}
            {!loading.value && <LuArrowRight style="width:16px;height:16px" />}
          </button>
          
          <button
            class="btn w-full btn-lg"
            onClick$={() => nav("/dashboard")}
            disabled={loading.value}
            style="margin-top:8px; background:transparent; border:1px solid var(--border); color:var(--text-secondary);"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Create Organization — BusinessKit",
};

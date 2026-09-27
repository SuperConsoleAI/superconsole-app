// src/components/NoProfileModal.tsx
//
// WHAT:  Prompt modal displayed when a user visits /dashboard without any profile created.
// HOW:   Provides instant "Create Project" action navigating to /onboarding, plus a dismiss option.

import { component$, $, useSignal, type PropFunction } from "@builder.io/qwik";
import { useNavigate } from "@builder.io/qwik-city";
import { LuX, LuArrowRight } from "@qwikest/icons/lucide";
import businesskitIcon from "~/assets/businesskit-icon.svg?url";

export interface NoProfileModalProps {
  onDismiss$?: PropFunction<() => void>;
}

export const NoProfileModal = component$<NoProfileModalProps>((props) => {
  const nav = useNavigate();
  const closing = useSignal(false);

  const handleDismiss = $(async () => {
    closing.value = true;
    await new Promise((r) => setTimeout(r, 180));
    if (props.onDismiss$) {
      await props.onDismiss$();
    }
  });

  const handleCreate = $(() => {
    nav("/onboarding");
  });

  return (
    <div
      class="no-profile-modal-overlay"
      style={{
        position: "fixed",
        inset: "0",
        background: "rgba(0, 0, 0, 0.65)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        zIndex: "99999",
        opacity: closing.value ? "0" : "1",
        transition: "opacity 0.2s ease",
      }}
      onClick$={(e) => {
        if (e.target === e.currentTarget) {
          handleDismiss();
        }
      }}
    >
      <div
        class="no-profile-modal-card"
        style={{
          width: "100%",
          maxWidth: "420px",
          background: "var(--surface-2)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-lg)",
          padding: "2rem",
          boxShadow: "var(--shadow-xl)",
          position: "relative",
          transform: closing.value ? "scale(0.96) translateY(8px)" : "scale(1) translateY(0)",
          transition: "transform 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
          boxSizing: "border-box",
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick$={handleDismiss}
          title="Dismiss"
          style={{
            position: "absolute",
            top: "1.25rem",
            right: "1.25rem",
            width: "30px",
            height: "30px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border)",
            background: "var(--surface-3)",
            color: "var(--text-secondary)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            padding: "0",
            transition: "color 0.15s ease, border-color 0.15s ease",
          }}
        >
          <LuX style="width:16px;height:16px;" />
        </button>

        {/* Top: Logo & Badge */}
        <div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1.25rem;">
          <img
            src={businesskitIcon}
            alt="BusinessKit"
            width={38}
            height={38}
            style="width:38px;height:38px;border-radius:var(--radius-sm);object-fit:cover;flex-shrink:0"
          />
          <div style="display:flex;flex-direction:column;gap:2px;">
            <div style="display:flex;align-items:center;gap:6px;">
              <span style="font-size:0.75rem;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;color:var(--accent);background:var(--accent-soft);padding:2px 8px;border-radius:999px;">
                Setup Required
              </span>
            </div>
            <span style="font-size:0.875rem;font-weight:600;color:var(--text-secondary);">
              BusinessKit
            </span>
          </div>
        </div>

        {/* Heading & Details */}
        <h2 style="font-size:1.375rem;font-weight:700;color:var(--text-primary);letter-spacing:-0.02em;margin-bottom:0.5rem;line-height:1.3;">
          Create your first project
        </h2>
        <p style="font-size:0.875rem;color:var(--text-secondary);line-height:1.6;margin-bottom:1.75rem;">
          You don't have any projects or profiles set up yet. Create a project to connect your database, publish tools, and unlock your apps.
        </p>

        {/* Action Buttons */}
        <div style="display:flex;flex-direction:column;gap:0.625rem;">
          <button
            type="button"
            class="btn btn-primary btn-lg w-full"
            onClick$={handleCreate}
            style="display:flex;align-items:center;justify-content:center;gap:0.5rem;font-size:0.9375rem;font-weight:600;border-radius:var(--radius-sm);"
          >
            <span>Create Project Now</span>
            <LuArrowRight style="width:16px;height:16px;" />
          </button>
          <button
            type="button"
            class="btn w-full btn-lg"
            onClick$={handleDismiss}
            style="background:transparent;border:1px solid var(--border);color:var(--text-secondary);font-size:0.875rem;font-weight:500;border-radius:var(--radius-sm);"
          >
            Dismiss &amp; View Dashboard
          </button>
        </div>
      </div>
    </div>
  );
});

// src/components/app/FormsBuilderActions.tsx
//
// WHAT:  Right-slot actions for form detail pages in AppTopbar.
//        Order: Share | View | Settings | divider | Save | Publish
//        Title is shown in the LEFT slot by AppTopbar (from rootBuilder.formTitle).
//        This component only handles action buttons.

import { component$, useSignal, $ } from "@builder.io/qwik";
import { useLocation } from "@builder.io/qwik-city";
import { LuCheck, LuRocket, LuShare2, LuExternalLink, LuSettings } from "@qwikest/icons/lucide";
import { useFormsBuilderCtx } from "~/lib/forms-builder-context";
import { FormModal } from "~/components/FormModal";

const iconBtn = (extra = "") =>
  `padding:0.375rem;background:var(--surface-3);border:1px solid var(--border);border-radius:0.375rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background 0.15s;${extra}`;

export const FormsBuilderActions = component$(() => {
  const ctx         = useFormsBuilderCtx();
  const loc         = useLocation();
  const modalOpen   = useSignal(false);
  const linkCopied  = useSignal(false);

  // Extract formId from /dashboard/forms/<id>/...
  const segments = loc.url.pathname.replace(/^\/dashboard\/forms\/?/, "").split("/").filter(Boolean);
  const formId   = segments[0] ?? "";

  // For sharing / viewing the public form URL — placeholder until slug IPC exists
  const formUrl = typeof window !== "undefined"
    ? `${window.location.origin}/form/${formId}`
    : `/form/${formId}`;

  const doCopyLink = $(async () => {
    try {
      await navigator.clipboard.writeText(formUrl);
      linkCopied.value = true;
      setTimeout(() => { linkCopied.value = false; }, 2000);
    } catch { /* ignore */ }
  });

  return (
    <>
      <FormModal open={modalOpen} formId={formId} />

      <div style="display:flex;align-items:center;gap:0.375rem;">

        {/* Share — copy link */}
        <button
          type="button"
          title={linkCopied.value ? "Link copied!" : "Copy share link"}
          onClick$={doCopyLink}
          style={iconBtn(linkCopied.value ? "border-color:var(--success);" : "")}
        >
          <LuShare2 style={`width:1rem;height:1rem;${linkCopied.value ? "color:var(--success);" : "color:var(--text-secondary);"}`} />
        </button>

        {/* View — open public form */}
        <a
          href={formUrl}
          target="_blank"
          title="View public form"
          style={iconBtn("text-decoration:none;")}
        >
          <LuExternalLink style="width:1rem;height:1rem;color:var(--text-secondary);" />
        </a>

        {/* Settings — opens FormModal */}
        <button
          type="button"
          title="Form settings"
          onClick$={() => { modalOpen.value = true; }}
          style={iconBtn()}
        >
          <LuSettings style="width:1rem;height:1rem;color:var(--text-secondary);" />
        </button>

        {/* Divider */}
        <div style="width:1px;height:1.25rem;background:var(--border);margin:0 0.125rem;" />

        {/* Save */}
        <button
          type="button"
          onClick$={ctx.doSave}
          disabled={ctx.saving.value || !ctx.dirty.value}
          title={ctx.dirty.value ? "Save changes" : "All changes saved"}
          style={`
            display:inline-flex;align-items:center;gap:0.375rem;
            height:2rem;padding:0 0.75rem;border-radius:0.375rem;
            font-size:0.8125rem;font-weight:500;
            border:1px solid var(--border);
            cursor:${ctx.dirty.value ? "pointer" : "default"};
            background:var(--surface-3);color:var(--text-primary);
            transition:all 0.15s;
          `}
        >
          {ctx.saving.value ? (
            <span style="width:1rem;height:1rem;border:2px solid currentColor;border-top-color:transparent;border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite;" />
          ) : ctx.dirty.value ? (
            "Save"
          ) : (
            <LuCheck style="width:1rem;height:1rem;color:var(--success);" />
          )}
        </button>

        {/* Publish */}
        <button
          type="button"
          onClick$={ctx.togglePublish}
          disabled={ctx.publishing.value || ctx.published.value}
          style={`
            display:inline-flex;align-items:center;gap:0.375rem;
            height:2rem;padding:0 0.875rem;border-radius:0.375rem;
            font-size:0.8125rem;font-weight:600;border:none;
            cursor:${ctx.published.value ? "default" : "pointer"};
            ${ctx.published.value
              ? "background:var(--success);color:white;"
              : "background:var(--text-primary);color:var(--surface-1);"
            }
            transition:all 0.15s;
          `}
        >
          {ctx.publishing.value ? (
            <span style="width:1rem;height:1rem;border:2px solid rgba(255,255,255,0.4);border-top-color:white;border-radius:50%;display:inline-block;animation:spin 0.7s linear infinite;" />
          ) : ctx.published.value ? (
            <><LuCheck style="width:0.875rem;height:0.875rem;" /> Published</>
          ) : (
            <><LuRocket style="width:0.875rem;height:0.875rem;" /> Publish</>
          )}
        </button>

      </div>
    </>
  );
});

// src/components/app/FormsResultsActions.tsx
//
// WHAT:  Right-slot for Summary and Analytics tabs.
//        Share + View + Settings — no Save/Publish.

import { component$, useSignal, $ } from "@builder.io/qwik";
import { useLocation } from "@builder.io/qwik-city";
import { LuShare2, LuExternalLink, LuSettings } from "@qwikest/icons/lucide";
import { FormModal } from "~/components/FormModal";

const iconBtn = (extra = "") =>
  `padding:0.375rem;background:var(--surface-3);border:1px solid var(--border);border-radius:0.375rem;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:background 0.15s;${extra}`;

export const FormsResultsActions = component$(() => {
  const loc        = useLocation();
  const modalOpen  = useSignal(false);
  const linkCopied = useSignal(false);

  const seg    = loc.url.pathname.replace(/^\/dashboard\/forms\/?/, "").split("/").filter(Boolean);
  const formId = seg[0] ?? "";
  const formUrl = typeof window !== "undefined"
    ? `${window.location.origin}/form/${formId}`
    : `/form/${formId}`;

  const doCopy = $(async () => {
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
        <button type="button" title={linkCopied.value ? "Copied!" : "Copy link"} onClick$={doCopy}
          style={iconBtn(linkCopied.value ? "border-color:var(--success);" : "")}>
          <LuShare2 style={`width:1rem;height:1rem;${linkCopied.value ? "color:var(--success);" : "color:var(--text-secondary);"}`} />
        </button>
        <a href={formUrl} target="_blank" title="View form" style={iconBtn("text-decoration:none;")}>
          <LuExternalLink style="width:1rem;height:1rem;color:var(--text-secondary);" />
        </a>
        <button type="button" title="Form settings" onClick$={() => { modalOpen.value = true; }} style={iconBtn()}>
          <LuSettings style="width:1rem;height:1rem;color:var(--text-secondary);" />
        </button>
      </div>
    </>
  );
});

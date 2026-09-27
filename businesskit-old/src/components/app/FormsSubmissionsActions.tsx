// src/components/app/FormsSubmissionsActions.tsx
//
// WHAT:  Right-slot actions for the Submissions tab.
//        Shows: Export CSV button only. No Save/Publish.

import { component$, $ } from "@builder.io/qwik";
import { useLocation } from "@builder.io/qwik-city";
import { LuDownload } from "@qwikest/icons/lucide";

export const FormsSubmissionsActions = component$(() => {
  const loc    = useLocation();
  const seg    = loc.url.pathname.replace(/^\/dashboard\/forms\/?/, "").split("/").filter(Boolean);
  const formId = seg[0] ?? "";

  const doExport = $(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const csv: string = await invoke("export_submissions_csv", { formId });
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `submissions-${formId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
    }
  });

  return (
    <div style="display:flex;align-items:center;gap:0.375rem;">
      <button
        type="button"
        title="Export CSV"
        onClick$={doExport}
        style="display:inline-flex;align-items:center;gap:0.375rem;height:2rem;padding:0 0.875rem;border-radius:0.375rem;font-size:0.8125rem;font-weight:500;border:1px solid var(--border);background:var(--surface-3);color:var(--text-primary);cursor:pointer;transition:all 0.15s;"
      >
        <LuDownload style="width:0.875rem;height:0.875rem;" />
        Export CSV
      </button>
    </div>
  );
});

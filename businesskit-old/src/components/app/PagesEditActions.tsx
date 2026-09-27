import { component$, useSignal, $, useVisibleTask$, useStylesScoped$ } from "@builder.io/qwik";

export const PagesEditActions = component$(() => {
  const saveStatus = useSignal<"idle" | "saving" | "saved">("idle");
  const pagePublished = useSignal(false);

  useStylesScoped$(`
    .btn-page-save { transition: all 0.15s ease; }
    .btn-page-save:active:not(:disabled) { transform: scale(0.95); opacity: 0.9; }
  `);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    const handler = (e: any) => {
      saveStatus.value = e.detail.saveStatus;
      // Convert to boolean to be safe (sqlite returns 1/0)
      pagePublished.value = !!e.detail.pagePublished;
    };
    document.addEventListener('page-status', handler);
    return () => document.removeEventListener('page-status', handler);
  });

  const doSave = $((intent: "draft" | "publish") => {
    if (typeof document !== "undefined") {
      document.dispatchEvent(new CustomEvent('do-page-save', { detail: intent }));
    }
  });

  return (
    <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
        <span style={{ fontSize: "0.8125rem", fontWeight: 500, color: pagePublished.value ? "var(--success)" : "var(--text-secondary)" }}>
          {pagePublished.value ? "Published" : "Draft"}
        </span>
      </div>
      <div style={{ width: "1px", height: "12px", background: "var(--border)" }} />
      <button 
        type="button" 
        class="btn-page-save"
        onClick$={() => doSave("draft")} 
        disabled={saveStatus.value === "saving"}
        style={{
          padding: "0 1rem",
          height: "2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          borderRadius: "0.5rem",
          background: "var(--surface-3)",
          border: "1px solid var(--border)",
          color: "var(--text-primary)",
          cursor: saveStatus.value === "saving" ? "default" : "pointer",
          fontSize: "0.8125rem",
          fontWeight: 500,
          transition: "all 0.15s",
        }}
      >
        {saveStatus.value === "saving" ? (
          <span style={{ width: "1rem", height: "1rem", border: "2px solid currentColor", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block", animation: "spin 0.7s linear infinite" }} />
        ) : saveStatus.value === "saved" ? (
          "Saved!"
        ) : (
          "Save"
        )}
      </button>
    </div>
  );
});

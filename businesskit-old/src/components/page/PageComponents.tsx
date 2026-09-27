import { component$, useSignal } from "@builder.io/qwik";
import type { Signal } from "@builder.io/qwik";
import { PageSections } from "~/components/page/PageSections";
import { SectionPickerModal } from "~/components/page/SectionPickerModal";
import { ComponentDefaultData } from "~/components/page/SectionSchemas";
import type { SectionBlock, CustomComponentData } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { borderRadius } = designSystem;

interface PageComponentsProps {
  visualPageContent: Signal<SectionBlock[]>;
  customComponents: Signal<Record<string, CustomComponentData>>;
  availableCustomComponents: Signal<any[]>;
}

export const PageComponents = component$<PageComponentsProps>((props) => {
  const isPickerOpen = useSignal(false);
  const { visualPageContent, customComponents, availableCustomComponents } = props;

  return (
    <>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.875rem" }}>
          <div
            style={{
              fontSize: "0.75rem",
              fontWeight: "600",
              color: "var(--text-secondary)",
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              margin: 0,
            }}
          >
            Visual Builder
          </div>
        </div>

        {visualPageContent.value.length === 0 ? (
          <div style={{ padding: "3rem", textAlign: "center", border: "1px dashed var(--border)", borderRadius: borderRadius.lg }}>
            <p style={{ color: "var(--text-secondary)", margin: 0 }}>No sections added yet.</p>
            <button
              type="button"
              onClick$={() => (isPickerOpen.value = true)}
              style={{
                marginTop: "1rem",
                padding: "0.5rem 1rem",
                background: "transparent",
                color: "var(--button-primary-bg)",
                border: "1px solid var(--button-primary-bg)",
                borderRadius: borderRadius.md,
                cursor: "pointer",
              }}
            >
              Add your first section
            </button>
          </div>
        ) : (
          <div style={{ border: "1px dashed var(--border)", borderRadius: borderRadius.lg, padding: "2px", overflow: "hidden" }}>
            <PageSections
              content={visualPageContent.value}
              customComponents={customComponents.value}
              onUpdate$={(newSections) => {
                visualPageContent.value = [...newSections];
              }}
              editable={true}
            />
          </div>
        )}

        {/* Floating Action Button to Add Section */}
        <button
          type="button"
          onClick$={() => (isPickerOpen.value = true)}
          style={{
            position: "fixed",
            bottom: "2rem",
            right: "2rem",
            width: "3.5rem",
            height: "3.5rem",
            borderRadius: "50%",
            background: "var(--button-primary-bg)",
            color: "var(--button-primary-text)",
            border: "none",
            boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 50,
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter$={(e: any) => {
            e.target.style.transform = "scale(1.05)";
            e.target.style.boxShadow = "0 6px 16px rgba(0, 0, 0, 0.2)";
          }}
          onMouseLeave$={(e: any) => {
            e.target.style.transform = "scale(1)";
            e.target.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.15)";
          }}
          aria-label="Add Section"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>

      {isPickerOpen.value && (
        <SectionPickerModal
          isOpen={isPickerOpen.value}
          availableCustomComponents={availableCustomComponents.value}
          onClose$={() => (isPickerOpen.value = false)}
          onSelect$={(type, componentId) => {
            const defaultData = ComponentDefaultData[type as keyof typeof ComponentDefaultData] || {};
            visualPageContent.value = [
              ...visualPageContent.value,
              {
                id: crypto.randomUUID(),
                type,
                component_id: componentId,
                enabled: true,
                data: JSON.parse(JSON.stringify(defaultData || {})),
              },
            ];
            isPickerOpen.value = false;
          }}
        />
      )}
    </>
  );
});

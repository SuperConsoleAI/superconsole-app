import { component$, Slot } from "@builder.io/qwik";
import type { PropFunction } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";
import { LuArrowUp, LuArrowDown, LuTrash2, LuPencil, LuPaintbrush } from "@qwikest/icons/lucide";

const { transitions } = designSystem;

interface SectionWrapperProps {
  id: string;
  name: string;
  index: number;
  editable?: boolean;
  isFirst?: boolean;
  isLast?: boolean;
  onEdit$?: PropFunction<() => void>;
  onMoveUp$?: PropFunction<() => void>;
  onMoveDown$?: PropFunction<() => void>;
  onDelete$?: PropFunction<() => void>;
  onBgColor$?: PropFunction<(e: MouseEvent, el: HTMLElement) => void>;
}

export const SectionWrapper = component$<SectionWrapperProps>(({ 
  id, name, index, editable = false, isFirst = false, isLast = false, onEdit$, onMoveUp$, onMoveDown$, onDelete$, onBgColor$
}) => {
  if (!editable) {
    return (
      <div id={id} style="position: relative; width: 100%;">
        <Slot />
      </div>
    );
  }

  const iconBtnStyle = {
    background: "transparent",
    color: "#047EEC",
    border: "none",
    padding: "4px 8px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: transitions.fast,
  };

  return (
    <div
      id={id}
      class="section-wrapper-container"
      data-section-index={index}
      style={{
        position: "relative",
        width: "100%",
        borderRadius: "0",
        zIndex: 1,
      }}
    >
      <style>{`
        .section-wrapper-container {
          outline: 1px solid transparent;
          transition: outline 0.15s ease;
        }
        .section-wrapper-container:hover {
          outline: 1px solid #047EEC !important;
          z-index: 10 !important;
        }
        .section-wrapper-toolbar {
          display: none !important;
        }
        .section-wrapper-container:hover .section-wrapper-toolbar {
          display: flex !important;
        }
      `}</style>
      
      <div class="section-wrapper-toolbar" style={{
        position: "absolute",
        top: 0,
        left: 0,
        zIndex: 50,
        background: "#047EEC",
        color: "#FFF",
        padding: "4px 12px",
        fontSize: "12px",
        fontWeight: 500,
        textTransform: "capitalize",
        letterSpacing: "0.5px"
      }}>
        {name.replace(/_/g, ' ')}
      </div>
      
      <div class="section-wrapper-toolbar" style={{
        position: "absolute",
        top: 0,
        right: 0,
        zIndex: 50,
        alignItems: "stretch",
        background: "var(--surface-1, #fff)",
        borderLeft: "1px solid #047EEC",
        borderBottom: "1px solid #047EEC",
        height: "28px"
      }}>
        {onMoveUp$ && !isFirst && (
          <button
            type="button"
            onClick$={(e) => { e.stopPropagation(); if (onMoveUp$) onMoveUp$(); }}
            style={{ ...iconBtnStyle, height: "100%" }}
            title="Move Up"
          >
            <LuArrowUp width={14} height={14} />
          </button>
        )}
        {onMoveDown$ && !isLast && (
          <>
            {onMoveUp$ && !isFirst && <div style={{ width: "1px", background: "#047EEC" }} />}
            <button
              type="button"
              onClick$={(e) => { e.stopPropagation(); if (onMoveDown$) onMoveDown$(); }}
              style={{ ...iconBtnStyle, height: "100%" }}
              title="Move Down"
            >
              <LuArrowDown width={14} height={14} />
            </button>
          </>
        )}
        {((onMoveUp$ && !isFirst) || (onMoveDown$ && !isLast)) && (
          <div style={{ width: "1px", background: "#047EEC" }} />
        )}
        {onBgColor$ && (
          <>
            <button
              type="button"
              onClick$={(e, target) => { e.stopPropagation(); if (onBgColor$) onBgColor$(e, target); }}
              style={{ ...iconBtnStyle, height: "100%" }}
              title="Edit Background Color"
            >
              <LuPaintbrush width={14} height={14} />
            </button>
            <div style={{ width: "1px", background: "#047EEC" }} />
          </>
        )}
        <button
          type="button"
          onClick$={(e) => { e.stopPropagation(); if (onEdit$) onEdit$(); }}
          style={{ ...iconBtnStyle, height: "100%" }}
          title="Edit Section Details"
        >
          <LuPencil width={14} height={14} />
        </button>
        {onDelete$ && (
          <>
            <div style={{ width: "1px", background: "#047EEC" }} />
            <button
              type="button"
              onClick$={(e) => { e.stopPropagation(); if (onDelete$) onDelete$(); }}
              style={{ ...iconBtnStyle, height: "100%", color: "var(--error)" }}
              title="Delete Section"
            >
              <LuTrash2 width={14} height={14} />
            </button>
          </>
        )}
      </div>

      <Slot />
    </div>
  );
});

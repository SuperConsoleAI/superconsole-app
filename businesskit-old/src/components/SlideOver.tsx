// src/components/SlideOver.tsx
//
// WHAT:  Shared slide-in panel component used by forms, detail views, and modals.
//        Slides in from the right edge of the viewport over the main content.
//
// HOW:   Accepts an `open` signal — when true the panel translates into view and
//        a translucent backdrop appears. Clicking the backdrop or the × button
//        calls onClose$() to let the parent set open.value = false.
//        Content is provided via a <Slot /> so any form/body can be dropped in.
//
// FLOW:
//   Parent sets open.value = true → panel slides in from right
//   User submits / cancels → parent sets open.value = false → panel slides out
//
// RULES: No routeLoader$, no server$, no fetch() — pure UI component.

import { component$, Slot, type Signal, $, useStylesScoped$, useContext } from "@builder.io/qwik";
import { AppContext } from "~/lib/app-context";
import {
  LuX,
  LuBookOpen,
  LuFlame,
  LuUsers,
  LuSquare,
  LuUtensils,
  LuPackage,
  LuPlus,
  LuDatabase,
  LuCode,
} from "@qwikest/icons/lucide";

export type SlideOverIcon = "book" | "flame" | "users" | "square" | "utensils" | "package" | "plus" | "database" | "code";

export interface SlideOverProps {
  open: Signal<boolean>;
  title: string;
  subtitle?: string;
  width?: string; // default "480px"
  icon?: SlideOverIcon;
  zIndex?: number;
  placement?: "left" | "right" | "auto";
  noPadding?: boolean;
  onClose$?: import("@builder.io/qwik").PropFunction<() => void>;
}

const STYLES = `
  .slideover-panel {
    position: fixed;
    top: 0;
    bottom: 0;
    height: 100%;
    height: 100dvh;
    max-height: 100dvh;
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    will-change: transform;
    transition: transform 200ms cubic-bezier(0.16, 1, 0.3, 1), box-shadow 200ms ease, left 150ms ease, width 150ms ease;
  }

  .slideover-panel::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .slideover-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 1.5rem;
    height: 3.5rem;
    min-height: 3.5rem;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
    box-sizing: border-box;
  }

  /* When opening on the left side on desktop macOS, provide traffic lights clearance */
  .slideover-left .slideover-header {
    padding-left: 5.25rem;
  }

  .slideover-body {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: none;
    -ms-overflow-style: none;
    padding: 1.5rem;
    min-height: 0;
    box-sizing: border-box;
    position: relative;
    z-index: 1;
  }

  .slideover-body.no-padding {
    padding: 0 !important;
  }

  .slideover-body::-webkit-scrollbar {
    display: none;
    width: 0;
    height: 0;
  }

  .slideover-footer {
    flex-shrink: 0;
    background: var(--surface-2);
    box-sizing: border-box;
    position: relative;
    z-index: 200;
  }

  /* Tablet / Touch devices (>= 641px): Top safe area clearance + footer bottom clearance */
  @media (min-width: 641px) and (hover: none) and (pointer: coarse) {
    .slideover-header {
      padding-top: env(safe-area-inset-top, 0px) !important;
      height: calc(3.5rem + env(safe-area-inset-top, 0px)) !important;
      min-height: calc(3.5rem + env(safe-area-inset-top, 0px)) !important;
      max-height: calc(3.5rem + env(safe-area-inset-top, 0px)) !important;
    }
    .slideover-left .slideover-header {
      padding-left: 1.5rem !important;
    }
    .slideover-footer {
      padding-bottom: max(0.875rem, env(safe-area-inset-bottom, 0px)) !important;
    }
  }

  @media (max-width: 640px) {
    .slideover-panel {
      width: 100vw !important;
      max-width: 100vw !important;
      left: 0 !important;
      right: 0 !important;
      border-left: none !important;
      border-right: none !important;
    }
    .slideover-header {
      padding: 0 1.25rem !important;
      padding-top: env(safe-area-inset-top, 0px) !important;
      height: calc(3.5rem + env(safe-area-inset-top, 0px)) !important;
      min-height: calc(3.5rem + env(safe-area-inset-top, 0px)) !important;
      max-height: calc(3.5rem + env(safe-area-inset-top, 0px)) !important;
    }
    .slideover-left .slideover-header {
      padding-left: 1.25rem !important;
    }
    .slideover-body {
      padding: 1.25rem !important;
    }
    .slideover-body.no-padding {
      padding: 0 !important;
    }
    .slideover-footer {
      padding-bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px)) !important;
    }
  }
`;

export const SlideOver = component$<SlideOverProps>(({ open, title, subtitle, width = "480px", icon, zIndex, placement = "auto", noPadding = false, onClose$ }) => {
  useStylesScoped$(STYLES);

  const appCtx = useContext(AppContext, null as any);

  const isAgentChatOpen = Boolean(appCtx?.agentChatOpen?.value);
  const effectivePlacement =
    placement && placement !== "auto"
      ? placement
      : isAgentChatOpen
      ? "left"
      : "right";
  const isLeft = effectivePlacement === "left";

  const backdropZ = zIndex ? String(zIndex - 1) : "400";
  const panelZ    = zIndex ? String(zIndex) : "401";

  // Backdrop click: if parent provides onClose$, let parent decide whether to close.
  // Parent can inspect state and return early to block accidental close.
  // If no onClose$, close directly (default behavior).
  const handleBackdropClick$ = $(() => {
    if (onClose$) {
      onClose$();
    } else {
      open.value = false;
    }
  });

  // X button: always delegates to onClose$ if provided, else closes directly.
  // Note: NewBillModal's onClose$ blocks close when bill has items —
  // but X button in the header should always close. So X uses a separate path.
  const handleClose$ = $(() => {
    open.value = false;
    if (onClose$) onClose$();
  });

  return (
    <>
      {/* ── Backdrop ────────────────────────────────────────────────────── */}
      <div
        onClick$={handleBackdropClick$}
        style={{
          position: "fixed",
          inset: "0",
          left: "0",
          right: isAgentChatOpen ? "var(--agent-panel-width, 0px)" : "0",
          background: isAgentChatOpen ? "transparent" : "rgba(0,0,0,0.35)",
          zIndex: backdropZ,
          opacity: open.value ? (isAgentChatOpen ? "0" : "1") : "0",
          pointerEvents: isAgentChatOpen ? "none" : (open.value ? "auto" : "none"),
          display: open.value ? "block" : "none",
          transition: "opacity 180ms ease",
        }}
      />

      {/* ── Panel ───────────────────────────────────────────────────────── */}
      <div
        class={["slideover-panel", isLeft ? "slideover-left" : "slideover-right"].join(" ")}
        style={{
          width: width,
          maxWidth: isAgentChatOpen ? "calc(100vw - var(--agent-panel-width, 0px))" : "100vw",
          zIndex: panelZ,
          left: isLeft ? "0" : "auto",
          right: isLeft ? "auto" : (isAgentChatOpen ? "var(--agent-panel-width, 0px)" : "0"),
          borderLeft: (!isLeft && open.value) ? "1px solid var(--border)" : "none",
          borderRight: (isLeft && open.value) ? "1px solid var(--border)" : "none",
          boxShadow: open.value
            ? (isLeft ? "18px 0 38px rgba(14,14,24,0.18)" : "-18px 0 38px rgba(14,14,24,0.18)")
            : "none",
          transform: open.value
            ? "translateX(0)"
            : (isLeft ? "translateX(calc(-100% - 80px))" : "translateX(calc(100% + 80px))"),
          pointerEvents: open.value ? "auto" : "none",
          display: open.value ? "flex" : "none",
        }}
      >
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div class="slideover-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", minWidth: "0" }}>
            {icon === "book" && <LuBookOpen style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />}
            {icon === "flame" && <LuFlame style="width:1.25rem;height:1.25rem;color:#d97706;flex-shrink:0;" />}
            {icon === "users" && <LuUsers style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />}
            {icon === "square" && <LuSquare style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />}
            {icon === "utensils" && <LuUtensils style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />}
            {icon === "package" && <LuPackage style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />}
            {icon === "plus" && <LuPlus style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />}
            {icon === "database" && <LuDatabase style="width:1.25rem;height:1.25rem;color:var(--accent,#10b981);flex-shrink:0;" />}
            {icon === "code" && <LuCode style="width:1.25rem;height:1.25rem;color:var(--brand-primary);flex-shrink:0;" />}
            <Slot name="icon" />
            <h2
              style={{
                margin: "0",
                fontSize: "1rem",
                fontWeight: "600",
                color: "var(--text-primary)",
                lineHeight: "1.2",
                whiteSpace: "nowrap",
              }}
            >
              {title}
            </h2>
            {subtitle && (
              <span
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-secondary)",
                  lineHeight: "1.2",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                • {subtitle}
              </span>
            )}
            <Slot name="header-tabs" />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <Slot name="header-actions" />
            <button
              onClick$={handleClose$}
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: "2rem",
                height: "2rem",
                border: "1px solid var(--border)",
                background: "transparent",
                color: "var(--text-secondary)",
                cursor: "pointer",
                borderRadius: "0.375rem",
                flexShrink: "0",
                transition: "all 150ms ease",
              }}
              onMouseOver$={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "var(--surface-3)";
                el.style.color = "var(--text-primary)";
                el.style.borderColor = "var(--border-hover, #3d4356)";
              }}
              onMouseOut$={(e) => {
                const el = e.currentTarget as HTMLElement;
                el.style.background = "transparent";
                el.style.color = "var(--text-secondary)";
                el.style.borderColor = "var(--border)";
              }}
              aria-label="Close panel"
            >
              <LuX style="width:1rem;height:1rem;" />
            </button>
          </div>
        </div>

        {/* ── Body (scrollable) ───────────────────────────────────────────── */}
        <div class={["slideover-body", noPadding ? "no-padding" : ""].join(" ")}>
          <Slot />
        </div>

        {/* ── Footer (pinned below scroll area) ───────────────────────────── */}
        <div class="slideover-footer">
          <Slot name="footer" />
        </div>
      </div>
    </>
  );
});

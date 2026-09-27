import { component$, $, useSignal, useVisibleTask$, useStylesScoped$ } from "@builder.io/qwik";
import { useAppContext } from "~/lib/app-context";

interface TitleBarProps {
  title?: string;
}

const STYLES = `
  .app-titlebar {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 2.1rem;
    z-index: 399;
    background: transparent;
    display: flex;
    align-items: center;
    justify-content: space-between;
    box-sizing: border-box;
    user-select: none;
    -webkit-app-region: drag;
  }

  .win-controls {
    display: flex;
    align-items: center;
    height: 100%;
    margin-left: auto;
    -webkit-app-region: no-drag;
  }

  .win-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.875rem;
    height: 100%;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    cursor: pointer;
    padding: 0;
    margin: 0;
    outline: none;
    transition: background-color 120ms ease, color 120ms ease;
  }

  .win-btn:hover {
    background: var(--muted, rgba(255, 255, 255, 0.08));
    color: var(--text-primary);
  }

  .win-btn-close:hover {
    background: #e81123 !important;
    color: #ffffff !important;
  }

  @media (max-width: 768px), (hover: none) and (pointer: coarse) {
    .app-titlebar {
      display: none !important;
    }
  }
`;

export default component$<TitleBarProps>(({ title }) => {
  useStylesScoped$(STYLES);

  const ctx = useAppContext();
  const activeProfile = ctx.profiles.value.find((p: any) => p.id === ctx.activeProfileId.value);
  const profileName = activeProfile?.title ?? ctx.org.value?.name ?? "";

  const isDesktop = useSignal(true);
  const showControls = useSignal(false);
  const isMaximized = useSignal(false);

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(async () => {
    // Detect mobile / tablet vs desktop
    const userAgent = navigator.userAgent || "";
    const platform = (navigator as any).userAgentData?.platform || navigator.platform || "";
    const isTouchOrMobile =
      /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(userAgent) ||
      (typeof navigator.maxTouchPoints === "number" && navigator.maxTouchPoints > 2 && /Macintosh/i.test(userAgent));

    isDesktop.value = !isTouchOrMobile;

    const isMac = userAgent.includes("Mac") || platform.includes("Mac");
    showControls.value = !isTouchOrMobile && !isMac;

    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const maxState = await invoke("app_is_maximized") as boolean;
      isMaximized.value = !!maxState;
    } catch {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const appWin = getCurrentWindow();
        isMaximized.value = await appWin.isMaximized();

        const unlisten = await appWin.onResized(async () => {
          try {
            isMaximized.value = await appWin.isMaximized();
          } catch { /* ignore */ }
        });

        return () => {
          unlisten();
        };
      } catch {
        // Running outside Tauri or web preview
      }
    }
  });

  const handleMinimize$ = $(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("app_minimize_window");
    } catch (e) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().minimize();
      } catch (err) {
        console.warn("[TitleBar] minimize error:", e, err);
      }
    }
  });

  const handleMaximize$ = $(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("app_toggle_maximize_window");
      isMaximized.value = !isMaximized.value;
    } catch (e) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().toggleMaximize();
        isMaximized.value = await getCurrentWindow().isMaximized();
      } catch (err) {
        console.warn("[TitleBar] toggleMaximize error:", e, err);
      }
    }
  });

  const handleClose$ = $(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("app_close_window");
    } catch (e) {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().close();
      } catch (err) {
        console.warn("[TitleBar] close error:", e, err);
      }
    }
  });

  return (
    <div class="app-titlebar" data-tauri-drag-region>
      {/* Left section: on Windows/Linux show Logo + App Name, on macOS keep empty spacer for traffic lights */}
      <div
        style="height: 100%; display: flex; align-items: center; padding-left: 0.75rem; gap: 0.5rem; flex-shrink: 0; min-width: 5rem;"
        data-tauri-drag-region
      >
        {showControls.value && (
          <div style="display: flex; align-items: center; gap: 0.45rem; pointer-events: none;" data-tauri-drag-region>
            <div style="width: 1.15rem; height: 1.15rem; border-radius: 0.3rem; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
              <svg width="18" height="18" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;height:100%;">
                <rect width="512" height="512" fill="url(#bk_logo_grad_titlebar)"/>
                <path d="M256 128C233.909 128 216 145.909 216 168C216 190.091 233.909 208 256 208C278.091 208 296 190.091 296 168C296 145.909 278.091 128 256 128ZM256 128V96M400 303C364.819 342.86 313.345 368 256 368C198.655 368 147.181 342.86 112 303M235.917 202.587L112 416M276.083 202.587L400 416" stroke="#F4F4F4" stroke-width="36" stroke-linecap="round" stroke-linejoin="round"/>
                <defs>
                  <linearGradient id="bk_logo_grad_titlebar" x1="256" y1="0" x2="256" y2="512" gradientUnits="userSpaceOnUse">
                    <stop stop-color="#BF2F00"/>
                    <stop offset="1" stop-color="#D97757"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span style="font-size: 0.75rem; font-weight: 600; color: var(--text-primary); letter-spacing: -0.01em; white-space: nowrap;">
              BusinessKit
            </span>
          </div>
        )}
      </div>

      {/* Center title area */}
      <div
        data-tauri-drag-region
        style="flex: 1; height: 100%; display: flex; align-items: center; justify-content: center; min-width: 0;"
      >
        {profileName && title && (
          <span
            data-tauri-drag-region
            style="font-size:0.75rem;font-weight:500;color:var(--text-secondary);display:flex;align-items:center;gap:0.375rem;white-space:nowrap;user-select:none;pointer-events:none;"
          >
            <span>{profileName}</span>
            <span style="opacity:0.5;">—</span>
            <span>{title}</span>
          </span>
        )}
      </div>

      {/* Right slot: window controls on Windows/Linux, or empty spacer on macOS */}
      <div style="min-width: 5rem; height: 100%; display: flex; justify-content: flex-end;" data-tauri-drag-region>
        {showControls.value && (
          <div class="win-controls">
            {/* Minimize */}
            <button
              type="button"
              class="win-btn"
              onClick$={handleMinimize$}
              title="Minimize"
              aria-label="Minimize"
            >
              <svg width="10" height="1" viewBox="0 0 10 1">
                <rect width="10" height="1" fill="currentColor" />
              </svg>
            </button>

            {/* Maximize / Restore */}
            <button
              type="button"
              class="win-btn"
              onClick$={handleMaximize$}
              title={isMaximized.value ? "Restore" : "Maximize"}
              aria-label={isMaximized.value ? "Restore" : "Maximize"}
            >
              {isMaximized.value ? (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
                  <rect x="2.5" y="0.5" width="7" height="7" />
                  <polyline points="0.5,2.5 0.5,9.5 7.5,9.5" />
                </svg>
              ) : (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1">
                  <rect x="0.5" y="0.5" width="9" height="9" />
                </svg>
              )}
            </button>

            {/* Close */}
            <button
              type="button"
              class="win-btn win-btn-close"
              onClick$={handleClose$}
              title="Close"
              aria-label="Close"
            >
              <svg width="10" height="10" viewBox="0 0 10 10" stroke="currentColor" stroke-width="1.2">
                <line x1="0.5" y1="0.5" x2="9.5" y2="9.5" />
                <line x1="9.5" y1="0.5" x2="0.5" y2="9.5" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});

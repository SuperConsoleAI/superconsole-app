import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import {
  LuFileImage,
  LuSliders,
} from "@qwikest/icons/lucide";
import { MobileDock } from "~/components/MobileDock";

const TAB_STYLES = `
  .tabs-container {
    display: flex;
  }
  .tabs-desktop {
    display: flex;
    gap: 0.25rem;
    background: var(--surface-3);
    padding: 2px;
    border-radius: 0.5rem;
    height: 32px;
    box-sizing: border-box;
    align-items: center;
  }
`;

export const MediaTabs = component$(() => {
  useStyles$(TAB_STYLES);
  const loc = useLocation();
  const path = loc.url.pathname;

  const tabs = [
    { label: "Media Library", href: "/dashboard/media/", icon: LuFileImage },
    { label: "Sliders & Banners", href: "/dashboard/media/sliders/", icon: LuSliders },
  ];

  const getIsActive = (href: string) => {
    if (href === "/dashboard/media/") {
      return (
        path === "/dashboard/media/" ||
        path === "/dashboard/media" ||
        path.startsWith("/dashboard/media/library")
      );
    }
    return path === href || (path.startsWith(href) && href !== "/dashboard/media/");
  };

  const tabStyle = (isActive: boolean) =>
    `padding: 0 1rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500; text-decoration: none; text-transform: capitalize; display: flex; align-items: center; height: 100%; box-sizing: border-box; transition: background 0.15s; ${
      isActive
        ? "background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1);"
        : "background: transparent; color: var(--text-secondary);"
    }`;

  return (
    <div class="tabs-container">
      {/* Desktop Tabs Bar */}
      <div class="tabs-desktop">
        {tabs.map((t) => {
          const isActive = getIsActive(t.href);
          const Icon = t.icon;
          return (
            <Link key={t.href} href={t.href} style={tabStyle(isActive)}>
              <span style="display: flex; align-items: center; gap: 0.5rem;">
                <Icon style="width: 1rem; height: 1rem;" /> {t.label}
              </span>
            </Link>
          );
        })}
      </div>

      {/* Mobile Floating macOS Dock Slider */}
      <MobileDock>
        <div class="tabs-dock-slider">
          {tabs.map((t) => {
            const isActive = getIsActive(t.href);
            const Icon = t.icon;
            return (
              <Link
                key={t.href}
                href={t.href}
                class={`dock-tab-item ${isActive ? "active" : ""}`}
              >
                <Icon style="width: 0.9375rem; height: 0.9375rem; flex-shrink: 0;" />
                <span>{t.label}</span>
              </Link>
            );
          })}
        </div>
      </MobileDock>
    </div>
  );
});

import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import { 
  LuPenTool, LuFolder, LuBarChart3, LuFileText, LuUsers
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

export const ContentTabs = component$(() => {
  useStyles$(TAB_STYLES);
  const loc = useLocation();
  const path = loc.url.pathname;

  const tabs = [
    { label: "Content", href: "/dashboard/content/", icon: LuPenTool },
  ];

  const match = path.match(/^\/dashboard\/content\/([^/]+)\/?/);
  const currentSlug = match ? match[1] : null;
  if (currentSlug && !["collections", "analytics", "settings", "subscribers"].includes(currentSlug)) {
    // Format slug to Title Case (e.g., 'n' -> 'Newsletter', 'blog' -> 'Blog', 'my-notes' -> 'My Notes')
    const formattedLabel = currentSlug === "n"
      ? "Newsletter"
      : currentSlug
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' ');
      
    tabs.splice(1, 0, {
      label: formattedLabel,
      href: `/dashboard/content/${currentSlug}/`,
      icon: LuFileText
    });

    // Subscribers tab ONLY when Newsletter ('n') is active
    if (currentSlug === "n") {
      tabs.push({
        label: "Subscribers",
        href: "/dashboard/content/subscribers/",
        icon: LuUsers
      });
    }

    // Dynamic Collections tab for this specific CMS
    tabs.push({
      label: "Collections",
      href: `/dashboard/content/${currentSlug}/collections/`,
      icon: LuFolder
    });
    
    // Dynamic Analytics tab for this specific CMS
    tabs.push({
      label: "Analytics",
      href: `/dashboard/content/${currentSlug}/analytics/`,
      icon: LuBarChart3
    });
  } else if (path === "/dashboard/content/" || path === "/dashboard/content" || path.startsWith("/dashboard/content/subscribers") || path.startsWith("/dashboard/content/analytics") || path.startsWith("/dashboard/content/collections")) {
    if (path !== "/dashboard/content/" && path !== "/dashboard/content") {
      tabs.push({
        label: "Newsletter",
        href: "/dashboard/content/n/",
        icon: LuFileText
      });
    }

    if (path.startsWith("/dashboard/content/subscribers")) {
      tabs.push({
        label: "Subscribers",
        href: "/dashboard/content/subscribers/",
        icon: LuUsers
      });
    }

    // Global Collections tab for root context
    tabs.push({
      label: "Collections",
      href: "/dashboard/content/collections/",
      icon: LuFolder
    });
    
    // Global Analytics tab ONLY for root content page and the analytics page itself
    tabs.push({
      label: "Analytics",
      href: "/dashboard/content/analytics/",
      icon: LuBarChart3
    });
  }

  const getIsActive = (href: string) => {
    if (href === "/dashboard/content/") {
      return path === href || path === "/dashboard/content";
    }
    return path === href || path.startsWith(href);
  };

  const tabStyle = (isActive: boolean) =>
    `padding: 0 1rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500; text-decoration: none; text-transform: capitalize; display: flex; align-items: center; height: 100%; box-sizing: border-box; transition: background 0.15s; ${isActive
      ? 'background: var(--surface-2); color: var(--text-primary); box-shadow: 0 1px 3px rgba(0,0,0,0.1);'
      : 'background: transparent; color: var(--text-secondary);'
    }`;

  return (
    <div class="tabs-container">
      {/* Desktop Tabs Bar */}
      <div class="tabs-desktop">
        {tabs.map((t) => {
          const isActive = getIsActive(t.href);
          const Icon = t.icon;
          return (
            <Link
              key={t.href}
              href={t.href}
              style={tabStyle(isActive)}
            >
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

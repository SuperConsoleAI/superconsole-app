import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import { 
  LuLayoutDashboard, LuPenTool, LuCalendar, LuMessageSquare, 
  LuBarChart3, LuTimer, LuLink
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

export const SocialTabs = component$(() => {
  useStyles$(TAB_STYLES);
  const loc = useLocation();
  const path = loc.url.pathname;

  const tabs = [
    { label: "Overview",  href: "/dashboard/social/",          icon: LuLayoutDashboard },
    { label: "Posts",     href: "/dashboard/social/posts/",    icon: LuPenTool },
    { label: "Calendar",  href: "/dashboard/social/calendar/", icon: LuCalendar },
    { label: "Inbox",     href: "/dashboard/social/inbox/",    icon: LuMessageSquare },
    { label: "Analytics", href: "/dashboard/social/analytics/",icon: LuBarChart3 },
    { label: "Queue",     href: "/dashboard/social/queue/",    icon: LuTimer },
    { label: "Accounts",  href: "/dashboard/social/accounts/", icon: LuLink },
  ];

  const getIsActive = (href: string) => {
    // If it's the base overview tab, it should only be active exactly there
    if (href === "/dashboard/social/") {
      return path === href || path === "/dashboard/social";
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

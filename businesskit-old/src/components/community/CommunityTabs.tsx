import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import { LuLayoutDashboard, LuMessageSquare, LuCalendarDays, LuUsers, LuTrophy } from "@qwikest/icons/lucide";
import { MobileDock } from "~/components/MobileDock";

const TAB_STYLES = `
  .tabs-container {
    display: flex;
    align-items: center;
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

export const CommunityTabs = component$((props: { communityId: string; memberCount?: number }) => {
  useStyles$(TAB_STYLES);
  const loc = useLocation();
  const path = loc.url.pathname;

  const tabs = [
    { label: "Community", href: `/dashboard/community/`, icon: LuLayoutDashboard },
    { label: "Posts", href: `/dashboard/community/${props.communityId}/posts/`, icon: LuMessageSquare },
    { label: "Events", href: `/dashboard/community/${props.communityId}/events/`, icon: LuCalendarDays },
    { label: props.memberCount ? `Members (${props.memberCount})` : "Members", href: `/dashboard/community/${props.communityId}/members/`, icon: LuUsers },
    { label: "Leaderboard", href: `/dashboard/community/${props.communityId}/leaderboard/`, icon: LuTrophy },
    { label: "Analytics", href: `/dashboard/community/${props.communityId}/analytics/`, icon: LuLayoutDashboard },
  ];

  const getIsActive = (href: string) => {
    // Exact match for the list view since otherwise prefix matching breaks
    if (href === "/dashboard/community/") {
      return false; // we are already inside a specific community, so the list view tab is not active
    }
    // Exact match for overview, otherwise prefix match
    if (href.endsWith(`${props.communityId}/`)) {
      return path === href || path === href.replace(/\/$/, "");
    }
    return path.startsWith(href) || path.startsWith(href.replace(/\/$/, ""));
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

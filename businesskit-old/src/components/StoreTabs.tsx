import { component$, useStyles$ } from "@builder.io/qwik";
import { Link, useLocation } from "@builder.io/qwik-city";
import { 
  LuDownload, LuBarChart3, LuDollarSign,
  LuGraduationCap, LuCalendar, LuList, LuUsers, LuWrench, LuHeartHandshake, LuVideo, LuPackage, LuStore
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

export const StoreTabs = component$(() => {
  useStyles$(TAB_STYLES);
  const loc = useLocation();
  const path = loc.url.pathname;

  const isStoreIndex = path === "/dashboard/store/" || path === "/dashboard/store";
  const productType = path.split("/")[3] || "digital-download";

  const getProductLabel = () => {
    switch (productType) {
      case "digital-download": return "Downloads";
      case "courses": return "Courses";
      case "event": return "Events";
      case "listing": return "Listings";
      case "meeting": return "Meetings";
      case "service": return "Services";
      case "sponsorship": return "Sponsorships";
      case "webinar": return "Webinars";
      default: return "Products";
    }
  };

  const getProductIcon = () => {
    switch (productType) {
      case "digital-download": return LuDownload;
      case "courses": return LuGraduationCap;
      case "event": return LuCalendar;
      case "listing": return LuList;
      case "meeting": return LuUsers;
      case "service": return LuWrench;
      case "sponsorship": return LuHeartHandshake;
      case "webinar": return LuVideo;
      default: return LuPackage;
    }
  };

  const tabs = [
    { label: "Store (Digital)", href: "/dashboard/store/", icon: LuStore },
  ];

  if (!isStoreIndex) {
    tabs.push({ label: getProductLabel(), href: `/dashboard/store/${productType}/`, icon: getProductIcon() });
  }

  tabs.push(
    { label: "Analytics", href: `/dashboard/store/${productType}/analytics/`, icon: LuBarChart3 },
    { label: "Sales", href: `/dashboard/store/${productType}/sales/`, icon: LuDollarSign }
  );

  const getIsActive = (href: string) => {
    if (href === "/dashboard/store/") {
      return path === "/dashboard/store/" || path === "/dashboard/store";
    }
    const basePath = `/dashboard/store/${productType}/`;
    // If it's the base product tab, it should only be active on exactly that path, not sub-paths
    if (href === basePath) {
      return path === href || path === `/dashboard/store/${productType}`;
    }
    return path === href || (path.startsWith(href) && href !== '/dashboard/store/');
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

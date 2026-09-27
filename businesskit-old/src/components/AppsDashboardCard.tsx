import { component$, type QRL } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import {
  LuBookOpen,
  LuBriefcase,
  LuDownload,
  LuFormInput,
  LuLayoutList,
  LuLaptop,
  LuMegaphone,
  LuMessageSquare,
  LuStickyNote,
  LuGraduationCap,
  LuRss,
  LuTicket,
  LuUsers,
  LuVideo,
  LuPenTool,
  LuMap,
  LuAward,
  LuFileText,
  LuMail,
  LuCalendar,
  LuDatabase,
  LuBot,
  LuShare2,
} from "@qwikest/icons/lucide";
import { designSystem } from "~/lib/design-system";

export type AppsDashboardCardIconId =
  | "link-in-bio"
  | "website"
  | "form"
  | "blog"
  | "directory"
  | "testimonials"
  | "jobs"
  | "chat-agent"
  | "digital-download"
  | "listings"
  | "store-courses"
  | "meetings"
  | "webinars"
  | "services"
  | "sponsorships"
  | "events"
  | "notes"
  | "guides"
  | "skills"
  | "docs"
  | "newsletter"
  | "bookings"
  | "crm"
  | "agents"
  | "community"
  | "social"
  // Installable apps
  | "shop"
  | "tax"
  | "accounts"
  | "payroll";

export interface AppsDashboardCardProps {
  href: string;
  backgroundImageUrl: string;
  label: string;
  title: string;
  subtitle: string;
  appName: string;
  appDescription: string;
  footerColor: string;
  iconId: AppsDashboardCardIconId;
  ctaLabel?: string;
  disabled?: boolean;
  layout?: "grid" | "list";
  /** If true this app must be installed before navigating */
  installable?: boolean;
  /** Whether this app is already installed */
  isInstalled?: boolean;
  /** Called when the user clicks Install */
  onInstall$?: QRL<() => void>;
  /** True while install is in-flight */
  installing?: boolean;
  /** True if app requires an upgrade */
  upgradeRequired?: boolean;
  /** If true card appears dimmed/faded */
  faded?: boolean;
}

const DatabaseLinkIcon = (props: { style?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24" height="24" viewBox="0 0 24 24"
    fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
    style={props.style}
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5V19A9 3 0 0 0 12 21.5" />
    <path d="M21 5V8" />
    <path d="M3 12A9 3 0 0 0 12 14.5" />
    <g transform="translate(12, 10) scale(0.6)" stroke-width="3">
      <path d="M17 9V7A5 5 0 0 0 7 7v2" />
      <path d="M7 15v2a5 5 0 1 0 10 0v-2" />
      <line x1="12" x2="12" y1="8" y2="16" />
    </g>
  </svg>
);

function IconForId(props: { id: AppsDashboardCardIconId; style?: string }) {
  const sizeStyle =
    props.style ??
    "width: 1.5rem; height: 1.5rem; stroke-width: 2px; color: var(--text-secondary);";
  switch (props.id) {
    case "link-in-bio":
      return <DatabaseLinkIcon style={sizeStyle} />;
    case "website":
      return <LuLaptop style={sizeStyle} />;
    case "form":
      return <LuFormInput style={sizeStyle} />;
    case "blog":
      return <LuRss style={sizeStyle} />;
    case "directory":
      return <LuStickyNote style={sizeStyle} />;
    case "testimonials":
      return <LuUsers style={sizeStyle} />;
    case "jobs":
      return <LuGraduationCap style={sizeStyle} />;
    case "chat-agent":
      return <LuMessageSquare style={sizeStyle} />;
    case "digital-download":
      return <LuDownload style={sizeStyle} />;
    case "listings":
      return <LuLayoutList style={sizeStyle} />;
    case "store-courses":
      return <LuBookOpen style={sizeStyle} />;
    case "meetings":
      return <LuUsers style={sizeStyle} />;
    case "webinars":
      return <LuVideo style={sizeStyle} />;
    case "services":
      return <LuBriefcase style={sizeStyle} />;
    case "sponsorships":
      return <LuMegaphone style={sizeStyle} />;
    case "events":
      return <LuTicket style={sizeStyle} />;
    case "notes":
      return <LuPenTool style={sizeStyle} />;
    case "guides":
      return <LuMap style={sizeStyle} />;
    case "skills":
      return <LuAward style={sizeStyle} />;
    case "docs":
      return <LuFileText style={sizeStyle} />;
    case "newsletter":
      return <LuMail style={sizeStyle} />;
    case "bookings":
      return <LuCalendar style={sizeStyle} />;
    case "crm":
      return <LuDatabase style={sizeStyle} />;
    case "agents":
      return <LuBot style={sizeStyle} />;
    case "community":
      return <LuUsers style={sizeStyle} />;
    case "social":
      return <LuShare2 style={sizeStyle} />;
    case "shop":
      return <LuBriefcase style={sizeStyle} />;
    case "tax":
      return <LuFileText style={sizeStyle} />;
    case "accounts":
      return <LuDatabase style={sizeStyle} />;
    case "payroll":
      return <LuUsers style={sizeStyle} />;
  }
}

function hexToRgba(hex: string, alpha: number) {
  const normalized = hex.trim().replace(/^#/, "");
  const full =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => `${c}${c}`)
          .join("")
      : normalized;

  if (full.length !== 6) {
    return `rgba(0,0,0,${alpha})`;
  }

  const r = Number.parseInt(full.slice(0, 2), 16);
  const g = Number.parseInt(full.slice(2, 4), 16);
  const b = Number.parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const { borderRadius, typography } = designSystem;

export const AppsDashboardCard = component$<AppsDashboardCardProps>((props) => {
  const isDisabled = props.disabled ?? false;
  const isList = props.layout === "list";
  const isInstallable = props.installable ?? false;
  const isInstalled = props.isInstalled ?? false;
  const installing = props.installing ?? false;
  const upgradeRequired = props.upgradeRequired ?? false;
  const isFaded = props.faded ?? false;

  // For installable apps: show Install/Installing/Open based on state
  const cta = upgradeRequired
    ? "Upgrade"
    : isInstallable
      ? installing
        ? "Installing…"
        : isInstalled
          ? (props.ctaLabel ?? "Open")
          : (props.ctaLabel ?? "Install")
      : (props.ctaLabel ?? "Open");

  const overlay = hexToRgba(props.footerColor, 0.68);

  const shellStyleGrid = `
    width: 100%;
    max-width: 320px;
    height: 320px;
    border-radius: ${borderRadius["2xl"]};
    background: var(--surface-2) url('${props.backgroundImageUrl}') center / cover no-repeat;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
  `;

  const shellStyleList = `
    width: 100%;
    border-radius: ${borderRadius["2xl"]};
    background: var(--surface-2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    text-decoration: none;
    color: inherit;
    border: 1px solid var(--border);
  `;

  const shellStyle = isList ? shellStyleList : shellStyleGrid;

  const interactiveClass = isDisabled
    ? "opacity-70 cursor-default"
    : isFaded
      ? "opacity-60 hover:opacity-95 transition-opacity cursor-pointer"
      : "cursor-pointer";

  const content = (
    <>
      {!isList && (
        <div
          style={`
            flex: 1;
            padding: 1rem;
            display: flex;
            align-items: flex-end;
            background: ${overlay};
          `}
        >
          <div style={`display: flex; flex-direction: column; gap: 6px;`}>
            <div style={`font-size: 0.75rem; line-height: 20px; color: rgba(255, 255, 255, 0.74); font-weight: 600;`}>
              {props.label}
            </div>
            <h3
              style={`
                font-size: 2.125rem;
                font-weight: ${typography.weights.semibold};
                color: #ffffff;
                margin: 0;
                line-height: 1.15;
              `}
            >
              {props.title}
            </h3>
            <div style={`font-size: 0.875rem; color: rgba(255, 255, 255, 0.74);`}>
              {props.subtitle}
            </div>
          </div>
        </div>
      )}

      <div
        style={`
          padding: 1rem;
          background: var(--surface-2);
          display: flex;
          align-items: center;
          gap: 16px;
          border-radius: ${isList ? borderRadius["2xl"] : `0 0 ${borderRadius["2xl"]} ${borderRadius["2xl"]}`};
        `}
      >
        <div
          style={`
            width: 3rem;
            height: 3rem;
            border-radius: ${borderRadius.xl};
            background: linear-gradient(180deg, rgba(10,10,10,0.92) 0%, rgba(40,40,40,0.92) 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
          `}
        >
          <IconForId id={props.iconId} />
        </div>

        <div style={`flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0;`}>
          <div style={`font-size: 1rem; font-weight: 600; color: var(--text-primary);`}>
            {props.appName}
          </div>
          <div style={`font-size: 0.75rem; font-weight: 400; color: var(--text-secondary); line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;`}>
            {props.appDescription}
          </div>
        </div>

        <div
          style={`
            height: 2rem;
            border-radius: ${borderRadius.pill};
            background: ${
              isInstallable && !isInstalled
                ? installing
                  ? "#6d5de8"
                  : isFaded
                    ? "var(--surface-3)"
                    : "#4f46e5"
                : "var(--surface-3)"
            };
            display: flex;
            align-items: center;
            justify-content: center;
            color: ${isInstallable && !isInstalled ? (isFaded ? "var(--text-secondary)" : "#ffffff") : "var(--text-primary)"};
            font-size: 13px;
            font-weight: ${typography.weights.medium};
            user-select: none;
            transition: background 0.2s, color 0.2s;
            min-width: 4.5rem;
            padding: 0 0.75rem;
            border: ${isFaded ? "1px solid var(--border)" : "none"};
            white-space: nowrap;
          `}
          aria-hidden="true"
        >
          {cta}
        </div>
      </div>
    </>
  );

  if (isDisabled) {
    return (
      <div aria-disabled="true" class={interactiveClass} style={shellStyle}>
        {content}
      </div>
    );
  }

  // Installable app that is NOT yet installed → clicking runs install, not navigation
  if (isInstallable && !isInstalled) {
    return (
      <div
        class={installing ? "cursor-default" : "cursor-pointer"}
        style={shellStyle}
        onClick$={props.onInstall$}
      >
        {content}
      </div>
    );
  }

  return (
    <Link href={props.href} class={interactiveClass} style={shellStyle}>
      {content}
    </Link>
  );
});
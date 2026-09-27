import { component$, type CSSProperties } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { spacing, typography, transitions } = designSystem;

const NAV_HEIGHT = "2.75rem";

export interface CommunityNavItem {
  id: string;
  label: string;
  href: string;
}

interface CommunityNavbarProps {
  items: CommunityNavItem[];
  activeId: string;
  class?: string;
  variant?: "desktop" | "mobile";
  transparentMobile?: boolean;
}

export const CommunityNavbar = component$<CommunityNavbarProps>((props) => {
  const isMobile = props.variant === "mobile";

  const navLinkBase: CSSProperties = {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center",
    gap: spacing.xs,
    height: NAV_HEIGHT,
    padding: `${spacing.xs} ${spacing.sm} 0`,
    fontSize: typography.sizes.base,
    fontWeight: typography.weights.medium,
    textDecoration: "none",
    borderBottom: "4px solid transparent",
    boxSizing: "border-box",
    transition: `color ${transitions.fast}, border-color ${transitions.fast}`,
  };

  const mobileBackground = props.transparentMobile ? "transparent" : "var(--surface-2)";

  return (
    <>
      <style>{`
        /* Base Navigation Styles */
        .comm-profile-nav {
          display: flex;
          align-items: stretch;
          gap: ${typography.sizes.xs};
          background-color: var(--surface-2);
          border-bottom: 1px solid var(--border);
          height: ${NAV_HEIGHT};
          overflow-x: auto;
          padding: 0 ${spacing.md};
          width: 100%;
          box-sizing: border-box;
          scrollbar-width: none;
        }

        .comm-profile-nav::-webkit-scrollbar {
          display: none;
        }

        /* Desktop Navigation */
        .comm-profile-nav--desktop {
          width: 100%;
          position: relative;
          top: -1px;
        }

        /* Mobile Navigation */
        .comm-profile-nav--mobile {
          display: none;
          background-color: ${mobileBackground};
        }

        /* Desktop always visible variant */
        .comm-profile-nav--desktop-always {
          display: flex !important;
        }

        /* Medium screens - 768px+ */
        @media (min-width: ${designSystem.breakpoints.md}) {
          .comm-profile-nav--desktop {
            padding: 0 ${spacing.xl};
          }
        }

        /* Large screens - 1024px+ */
        @media (min-width: ${designSystem.breakpoints.lg}) {
          .comm-profile-nav--desktop {
            padding: 0 ${spacing.xl};
          }
        }

        /* Extra large screens - 75rem+ */
        @media (min-width: 75rem) {
          .comm-profile-nav--desktop {
            display: flex;
            padding: 0 ${spacing["3xl"]};
            height: ${NAV_HEIGHT};
          }

          .comm-profile-nav--mobile {
            display: none;
          }
        }

        /* Tablet/Mobile - show mobile nav up to 75rem */
        @media (max-width: 75rem) {
          .comm-profile-nav--mobile {
            display: flex;
            flex: 0 0 auto;
            width: 100%;
            height: ${NAV_HEIGHT};
            padding: 0 ${spacing.md};
            margin-top: -1px;
            background-color: ${mobileBackground};
          }
        }
      `}</style>
      
      <nav class={props.class || (isMobile ? "comm-profile-nav comm-profile-nav--mobile" : "comm-profile-nav comm-profile-nav--desktop")}>
        {props.items.map((item) => {
          const isActive = item.id === props.activeId;
          
          return (
            <a
              key={item.id}
              href={item.href}
              style={{
                ...navLinkBase,
                color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
                borderBottomColor: isActive ? "var(--text-primary)" : "transparent",
              }}
            >
              {item.label}
            </a>
          );
        })}
      </nav>
    </>
  );
});

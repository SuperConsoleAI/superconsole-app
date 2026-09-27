/**
 * CommunityAbout.tsx
 * Right sidebar card for the community About/public page.
 * Shows: logo, name, slug, description, quick links,
 *        stats (members/online/admins), member avatars, invite button.
 */
import { component$, type PropFunction } from "@builder.io/qwik";
import { LuLink2 } from "@qwikest/icons/lucide";
import { designSystem } from "~/lib/design-system";

const { spacing, borderRadius, typography, shadows, transitions } = designSystem;

export interface CommunityMemberAvatar {
  id: string;
  firstName?: string | null;
  profilePictureUrl?: string | null;
}

export interface QuickLink {
  label: string;
  href: string;
}

export interface CommunityAboutProps {
  title: string;
  slug: string;
  coverUrl?: string | null;
  description?: string | null;
  memberCount: number;
  onlineCount: number;
  adminCount?: number;
  topMembers?: CommunityMemberAvatar[];    // up to 8 avatars shown
  quickLinks?: QuickLink[];
  onJoin$?: PropFunction<() => void>;
  showInvite?: boolean;
  accessType?: "free" | "paid" | "invite_only" | "application";
  priceCents?: number;
  currency?: string;
  isMember?: boolean;
  creatorName?: string | null;
  creatorAvatarUrl?: string | null;
  creatorProfileId?: string | null;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k`;
  return String(n);
}

export const CommunityAbout = component$<CommunityAboutProps>((props) => {
  const members = props.topMembers?.slice(0, 8) ?? [];

  return (
    <div 
      style={{
        background: "var(--surface-2)", border: "1px solid var(--border)",
        borderRadius: borderRadius.lg, overflow: "hidden",
        boxShadow: shadows.sm, fontFamily: typography.fontFamily,
        display: "flex", flexDirection: "column", width: "100%",
    }}>
      {/* Cover strip */}
      <div style={{
        width: "100%", aspectRatio: "16/9",
        background: props.coverUrl ? "var(--surface-3)" : "linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--accent) 60%, #000) 100%)",
        display: "flex", alignItems: "center", justifyContent: "center",
        overflow: "hidden", flexShrink: 0,
        margin: 0,
        borderTopLeftRadius: borderRadius.lg,
        borderTopRightRadius: borderRadius.lg,
      }}>
        {props.coverUrl
          ? <img src={props.coverUrl} alt={props.title} width={800} height={340} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <span style={{ fontSize: "3rem" }}>🏘️</span>
        }
      </div>

      {/* Body */}
      <div style={{ padding: "1rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>

        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
          {/* Name */}
          <div style={{
            fontSize: typography.sizes["2xl"], fontWeight: typography.weights.semibold,
            color: "var(--text-primary)", lineHeight: "2rem",
          }}>
            {props.title}
          </div>

          {/* Description */}
          {props.description && (
            <p style={{
              fontSize: typography.sizes.base, color: "var(--text-primary)",
              fontWeight: 300, lineHeight: 1.6, margin: 0,
            }}>
              {props.description}
            </p>
          )}
        </div>

        {/* Quick links */}
        {props.quickLinks && props.quickLinks.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: "0.125rem" }}>
            {props.quickLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                style={{
                  display: "flex", alignItems: "center", gap: "0.5rem",
                  fontSize: typography.sizes.sm, color: "var(--text-secondary)",
                  textDecoration: "none",
                  transition: `color ${transitions.fast}`,
                }}
              >
                <LuLink2 style={{ width: "16px", height: "16px" }} />
                {link.label}
              </a>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div style={{
          display: "flex", justifyContent: "space-between", textAlign: "center",
          gap: spacing.sm,
          padding: "0.75rem 0",
          borderTop: "1px solid var(--border)",
          borderBottom: "1px solid var(--border)",
        }}>
          {[
            { label: "Members", value: formatCount(props.memberCount), dot: false },
            { label: "Online",  value: formatCount(props.onlineCount),  dot: true  },
            { label: "Admins",  value: formatCount(props.adminCount ?? 0), dot: false },
          ].map((stat, index) => (
            <div key={stat.label} style={{ flex: 1, borderRight: index === 2 ? "none" : "1px solid var(--border)" }}>
              <div style={{
                fontSize: typography.sizes.lg, fontWeight: 500,
                color: "var(--text-primary)",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "0.3rem",
              }}>
                {stat.dot && props.onlineCount > 0 && (
                  <span style={{
                    display: "inline-block",
                    width: "7px", height: "7px",
                    borderRadius: "50%",
                    background: "#22c55e",
                    boxShadow: "0 0 0 2px rgba(34,197,94,0.3)",
                    flexShrink: 0,
                  }} />
                )}
                {stat.value}
              </div>
              <div style={{ fontSize: typography.sizes.xs, color: "var(--text-secondary)", fontWeight: 400 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* Member avatars */}
        {members.length > 0 && (
          <div style={{ display: "flex", gap: "0", flexWrap: "wrap" }}>
            {members.map((m, i) => (
              <div
                key={m.id}
                title={m.firstName ?? ""}
                style={{
                  width: "1.5rem", height: "1.5rem", borderRadius: "50%",
                  border: "2px solid var(--surface-2)",
                  overflow: "hidden", background: "var(--surface-3)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: "0.65rem", fontWeight: typography.weights.bold,
                  color: "var(--text-secondary)",
                  marginLeft: i === 0 ? "0" : "-0.5rem",
                  zIndex: members.length - i,
                  position: "relative",
                }}
              >
                {m.profilePictureUrl
                  ? <img src={m.profilePictureUrl} alt="" width={24} height={24} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : (m.firstName?.[0] ?? "?").toUpperCase()
                }
              </div>
            ))}
          </div>
        )}

        {/* Invite / Join button */}
        {props.showInvite !== false && (
          <button
            onClick$={() => props.onJoin$?.()}
            style={{
              width: "100%", height: "3rem", padding: "0 1rem",
              borderRadius: borderRadius.md,
              border: props.isMember ? "1.5px solid var(--button-secondary-border, #14161A)" : "none",
              background: props.isMember ? "var(--button-secondary-bg, transparent)" : "var(--button-primary-bg, #14161A)",
              color: props.isMember ? "var(--button-secondary-text, #14161A)" : "var(--button-primary-text, #FFFFFF)",
              fontSize: "1rem", fontWeight: props.isMember ? typography.weights.semibold : typography.weights.bold,
              letterSpacing: props.isMember ? "0.08em" : "normal",
              textTransform: props.isMember ? "uppercase" : "none",
              cursor: "pointer", transition: `all ${transitions.fast}`,
            }}
          >
            {props.isMember ? "Invite People" : (
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", justifyContent: "center" }}>
                <span>JOIN</span>
                <span>
                  {props.accessType === "paid" && props.priceCents
                    ? `${(props.currency === "usd" || !props.currency) ? "$" : props.currency.toUpperCase()}${Math.floor(props.priceCents / 100)}/month`
                    : "FREE"
                  }
                </span>
              </div>
            )}
          </button>
        )}
      </div>
    </div>
  );
});

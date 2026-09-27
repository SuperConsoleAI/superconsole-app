import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { LuCalendar, LuMapPin, LuMessageCircle } from "@qwikest/icons/lucide";

import { designSystem } from "~/lib/design-system";

const { spacing, typography, borderRadius, shadows, transitions } = designSystem;

const STYLES = `
  .cm-container {
    display: flex;
    flex-direction: column;
    gap: ${spacing.xl};
    width: 100%;
  }

  /* Header Controls */
  .cm-controls {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: ${spacing.md};
  }
  .cm-filters {
    display: flex;
    gap: ${spacing.sm};
    flex-wrap: wrap;
  }
  .cm-pill {
    padding: ${spacing.sm} ${spacing.md};
    border-radius: 9999px;
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.medium};
    cursor: pointer;
    border: 1px solid var(--border);
    color: var(--text-secondary);
    background: transparent;
    transition: all ${transitions.fast};
    display: flex;
    align-items: center;
    gap: ${spacing.xs};
    font-family: inherit;
  }
  .cm-pill.active {
    background: var(--button-primary-bg, var(--text-primary));
    color: var(--button-secondary-text, var(--surface-1));
    border-color: var(--button-primary-bg, var(--text-primary));
  }
  .cm-pill-count {
    opacity: 0.8;
  }
  .cm-invite-btn {
    padding: 0.6rem 1.25rem;
    border-radius: ${borderRadius.md};
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.bold};
    cursor: pointer;
    background: #fcd34d;
    color: var(--text-primary);
    border: none;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    transition: opacity ${transitions.fast};
    font-family: inherit;
  }
  .cm-invite-btn:hover { opacity: 0.9; }

  /* Member List Card */
  .cm-list-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: ${borderRadius.lg};
    box-shadow: ${shadows.sm};
  }
  
  .cm-row {
    display: flex;
    gap: ${spacing.xl};
    padding: ${spacing.xl};
    border-bottom: 1px solid var(--border);
    align-items: flex-start;
  }
  .cm-row:last-child {
    border-bottom: none;
  }

  .cm-avatar-wrapper {
    flex-shrink: 0;
  }
  .cm-avatar-ring {
    position: relative;
    width: 56px;
    height: 56px;
    border-radius: 50%;
    padding: 2px;
    background: conic-gradient(from 180deg, #10b981 0%, #3b82f6 50%, #f59e0b 100%);
  }
  .cm-avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    background: var(--surface-3);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: ${typography.weights.bold};
    color: var(--text-primary);
  }
  .cm-level-badge {
    position: absolute;
    bottom: 2px;
    right: 2px;
    width: 20px;
    height: 20px;
    background: var(--accent);
    color: var(--button-primary-text);
    font-size: 0.65rem;
    font-weight: ${typography.weights.bold};
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
  }

  .cm-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .cm-name-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: ${spacing.md};
  }
  .cm-name {
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.bold};
    color: var(--text-primary);
    line-height: 1.2;
  }
  .cm-username {
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    margin-top: 0.15rem;
  }
  .cm-bio {
    font-size: 0.95rem;
    color: var(--text-primary);
    line-height: 1.45;
    margin: 0.4rem 0 0.6rem 0;
  }

  .cm-meta-list {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .cm-meta-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }
  .cm-status-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #10b981;
  }

  .cm-chat-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.85rem;
    border-radius: ${borderRadius.md};
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-primary);
    font-size: ${typography.sizes.xs};
    font-weight: ${typography.weights.semibold};
    cursor: pointer;
    transition: all ${transitions.fast};
    font-family: inherit;
  }
  .cm-chat-btn:hover {
    color: var(--text-primary);
    border-color: var(--text-secondary);
  }

  @media (max-width: 640px) {
    .cm-row {
      flex-direction: column;
    }
    .cm-name-row {
      flex-direction: column;
      align-items: flex-start;
    }
    .cm-chat-btn {
      width: 100%;
      justify-content: center;
      margin-top: ${spacing.sm};
    }
  }
`;

export interface MemberProp {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  email: string;
  username?: string | null;
  avatarUrl?: string | null;
  bio?: string | null;
  level?: number;
  points?: number;
  role?: string;
  joinedAt: number;
  isOnline?: boolean;
  city?: string | null;
  country?: string | null;
}

interface CommunityMembersProps {
  members: MemberProp[];
  totalMembers: number;
  totalAdmins: number;
  totalOnline: number;
  isDashboard?: boolean;
  totalActive?: number;
  totalCancelling?: number;
  totalChurned?: number;
  totalBanned?: number;
}

export const CommunityMembers = component$((props: CommunityMembersProps) => {
  useStylesScoped$(STYLES);

  // Generate mock username from email or name
  const getUsername = (m: MemberProp) => {
    if (m.username) return `@${m.username}`;
    let base = m.firstName ? m.firstName.toLowerCase() : m.email.split('@')[0];
    if (m.lastName) base += `-${m.lastName.toLowerCase()}`;
    return `@${base.replace(/[^a-z0-9]/g, '-')}-${m.id.substring(0,4)}`;
  };

  return (
    <div class="cm-container">
      {props.isDashboard ? (
        <div class="cm-controls">
          <div class="cm-filters">
            <button class="cm-pill active">
              <span>Active</span>
              <span class="cm-pill-count">{(props.totalActive ?? props.totalMembers).toLocaleString()}</span>
            </button>
            <button class="cm-pill">
              <span>Cancelling</span>
              <span class="cm-pill-count">{props.totalCancelling?.toLocaleString() ?? "0"}</span>
            </button>
            <button class="cm-pill">
              <span>Churned</span>
              <span class="cm-pill-count">{props.totalChurned?.toLocaleString() ?? "0"}</span>
            </button>
            <button class="cm-pill">
              <span>Banned</span>
              <span class="cm-pill-count">{props.totalBanned?.toLocaleString() ?? "0"}</span>
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button class="cm-chat-btn" style="height: auto; padding: 0.6rem 1.25rem;">Filter</button>
            <button class="cm-chat-btn" style="height: auto; padding: 0.6rem 1.25rem;">Export</button>
            <button class="cm-invite-btn">Invite</button>
          </div>
        </div>
      ) : (
        <div class="cm-controls">
          <div class="cm-filters">
            <button class="cm-pill active">
              <span>Members</span>
              <span class="cm-pill-count">{props.totalMembers.toLocaleString()}</span>
            </button>
            <button class="cm-pill">
              <span>Admins</span>
              <span class="cm-pill-count">{props.totalAdmins.toLocaleString()}</span>
            </button>
            <button class="cm-pill">
              <span>Online</span>
              <span class="cm-pill-count">{props.totalOnline.toLocaleString()}</span>
            </button>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <button class="cm-invite-btn">Invite</button>
          </div>
        </div>
      )}

      <div class="cm-list-card">
        {props.members.slice(0, 20).map((m) => {
          const name = m.firstName ? `${m.firstName} ${m.lastName ?? ""}`.trim() : "Member";
          const loc = m.city && m.country ? `${m.city}, ${m.country}` : m.city || m.country || null;
          
          return (
            <div class="cm-row" key={m.id}>
              {/* Avatar Column */}
              <div class="cm-avatar-wrapper">
                <div class="cm-avatar-ring">
                  <div class="cm-avatar">
                    {m.avatarUrl ? (
                      <img src={m.avatarUrl} alt="" width={48} height={48} style="width:100%;height:100%;border-radius:50%;object-fit:cover;" />
                    ) : (
                      name[0].toUpperCase()
                    )}
                  </div>
                  <div class="cm-level-badge">{m.level || 1}</div>
                </div>
              </div>

              {/* Info Column */}
              <div class="cm-info">
                <div class="cm-name-row">
                  <div>
                    <div class="cm-name">{name}</div>
                    <div class="cm-username">{getUsername(m)}</div>
                  </div>
                  <button class="cm-chat-btn">
                    CHAT <LuMessageCircle style={{ width: '14px', height: '14px' }} />
                  </button>
                </div>
                
                <div class="cm-bio">{m.bio || "No bio"}</div>

                <div class="cm-meta-list">
                  <div class="cm-meta-item">
                    <div class="cm-status-dot" style={{ background: m.isOnline ? '#10b981' : '#a1a1aa' }}></div>
                    {m.isOnline ? "Online now" : "Offline"}
                  </div>
                  <div class="cm-meta-item">
                    <LuCalendar style={{ width: '14px', height: '14px' }} />
                    Joined {new Date(m.joinedAt * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </div>
                  {loc && (
                    <div class="cm-meta-item" style="text-transform: capitalize;">
                      <LuMapPin style={{ width: '14px', height: '14px' }} />
                      {loc}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
});

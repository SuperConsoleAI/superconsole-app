import { component$, useStylesScoped$, useSignal } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { spacing, typography, borderRadius, shadows } = designSystem;

const STYLES = `
  .cl-container {
    display: flex;
    flex-direction: column;
    gap: ${spacing.xl};
    width: 100%;
    color: var(--text-primary, #18191c);
    font-family: ${typography.fontFamily};
  }

  /* Top Card (Profile + Levels) */
  .cl-top-card {
    background: var(--surface-2, #ffffff);
    border: 1px solid var(--border, #e4e4e7);
    border-radius: ${borderRadius.lg};
    box-shadow: ${shadows.sm};
    padding: ${spacing.xl};
    display: flex;
    gap: ${spacing["2xl"]};
    align-items: flex-start;
  }
  @media (max-width: 768px) {
    .cl-top-card {
      flex-direction: column;
      align-items: center;
    }
  }

  /* Profile Column */
  .cl-profile-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    min-width: 200px;
    padding-top: ${spacing.md};
  }
  .cl-avatar-wrapper {
    position: relative;
    width: 140px;
    height: 140px;
    border-radius: 50%;
    padding: 4px;
    background: conic-gradient(from 180deg, #10b981 0%, #3b82f6 50%, #f59e0b 100%);
    margin-bottom: ${spacing.md};
  }
  .cl-avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    background: var(--surface-2, #f4f4f5);
    object-fit: cover;
  }
  .cl-level-badge {
    position: absolute;
    bottom: 5%;
    right: 5%;
    width: 36px;
    height: 36px;
    background: #4f46e5;
    color: #fff;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: ${typography.weights.bold};
    font-size: ${typography.sizes.lg};
    border: 2px solid var(--surface-1, #fff);
  }
  .cl-profile-name {
    font-size: 1.35rem;
    font-weight: ${typography.weights.bold};
    margin-bottom: 0.25rem;
  }
  .cl-profile-level-title {
    font-size: ${typography.sizes.sm};
    color: #4f46e5;
    font-weight: ${typography.weights.semibold};
    margin-bottom: 0.25rem;
  }
  .cl-profile-pts {
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary, #71717a);
  }

  /* Levels Column */
  .cl-levels-col {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: ${spacing.lg};
  }
  @media (max-width: 768px) {
    .cl-levels-col {
      grid-template-columns: 1fr;
    }
  }
  .cl-level-item {
    display: flex;
    align-items: flex-start;
    gap: ${spacing.md};
  }
  .cl-level-icon {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #fef08a; /* yellow-200 */
    color: #854d0e; /* yellow-800 */
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: ${typography.weights.bold};
    font-size: 0.9rem;
    flex-shrink: 0;
  }
  .cl-level-icon.locked {
    background: #e4e4e7;
    color: #71717a;
  }
  .cl-level-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .cl-level-title {
    font-size: 0.95rem;
    font-weight: ${typography.weights.bold};
  }
  .cl-level-desc {
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary, #71717a);
    line-height: 1.35;
  }
  .cl-unlock-highlight {
    color: #3b82f6;
  }

  /* Boards Section */
  .cl-boards-header {
    font-size: ${typography.sizes.sm};
    font-style: italic;
    color: var(--text-secondary, #71717a);
    margin: ${spacing.md} 0 ${spacing.xs} 0;
  }
  .cl-boards-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: ${spacing.xl};
  }
  @media (max-width: 1024px) {
    .cl-boards-grid {
      grid-template-columns: 1fr;
    }
  }

  /* Math Info Box */
  .cl-math-info {
    margin-top: 0.5rem;
    padding: 1rem;
    background: var(--surface-3, #f8fafc);
    border: 1px solid var(--border, #e2e8f0);
    border-radius: ${borderRadius.md};
    text-align: left;
    font-size: 0.85rem;
    color: var(--text-primary);
    line-height: 1.5;
  }
  .cl-math-info h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.95rem;
  }
  .cl-math-info p {
    margin: 0 0 0.75rem 0;
    color: var(--text-secondary);
  }
  .cl-math-info-toggle {
    cursor: pointer;
    background: transparent;
    border: none;
    padding: 0 0.25rem;
    color: var(--accent);
    font-size: 0.9rem;
  }
  @media (max-width: 1024px) {
    .cl-boards-grid {
      grid-template-columns: 1fr;
    }
  }
  
  .cl-board {
    background: var(--surface-2, #ffffff);
    border: 1px solid var(--border, #e4e4e7);
    border-radius: ${borderRadius.lg};
    padding: ${spacing.lg};
    box-shadow: ${shadows.sm};
  }
  .cl-board-title {
    font-size: 1.1rem;
    font-weight: ${typography.weights.bold};
    margin-bottom: ${spacing.lg};
    padding-bottom: ${spacing.sm};
    border-bottom: 1px solid var(--border, #e4e4e7);
  }
  .cl-board-list {
    display: flex;
    flex-direction: column;
    gap: ${spacing.md};
  }
  .cl-board-row {
    display: flex;
    align-items: center;
    gap: ${spacing.md};
  }
  .cl-rank {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    font-weight: ${typography.weights.bold};
    color: #fff;
    background: #a1a1aa; /* gray */
    flex-shrink: 0;
  }
  .cl-rank.gold { background: #f59e0b; color: #fff; }
  .cl-rank.silver { background: #94a3b8; color: #fff; }
  .cl-rank.bronze { background: #d97706; color: #fff; }
  
  .cl-b-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--surface-2, #f4f4f5);
  }
  .cl-b-name {
    flex: 1;
    font-size: 0.95rem;
    font-weight: ${typography.weights.semibold};
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cl-b-pts {
    font-size: 0.9rem;
    font-weight: ${typography.weights.bold};
    color: #4f46e5;
  }
`;

export interface LeaderboardUser {
  id: string;
  name: string;
  avatarUrl?: string;
  points: number;
}

export interface CommunityLeaderboardsProps {
  currentMember?: {
    name: string;
    avatarUrl?: string;
    level: number;
    levelName: string;
    pointsToNext: number;
  };
  levels: {
    level: number;
    name: string;
    percentage: string;
    unlocks?: string;
    isLocked: boolean;
  }[];
  board7d: LeaderboardUser[];
  board30d: LeaderboardUser[];
  boardAllTime: LeaderboardUser[];
  lastUpdated: string;
}

export const CommunityLeaderboards = component$((props: CommunityLeaderboardsProps) => {
  useStylesScoped$(STYLES);
  const showInfo = useSignal(false);

  return (
    <div class="cl-container">
      {/* Top Banner */}
      <div class="cl-top-card">
        {/* Profile Info */}
        <div class="cl-profile-col">
          <div class="cl-avatar-wrapper">
            {props.currentMember?.avatarUrl ? (
              <img src={props.currentMember.avatarUrl} alt="Avatar" class="cl-avatar" width="64" height="64" />
            ) : (
              <div class="cl-avatar" style="display:flex;align-items:center;justify-content:center;font-size:2rem;font-weight:bold;">
                {props.currentMember?.name?.[0]?.toUpperCase() || "?"}
              </div>
            )}
            <div class="cl-level-badge">{props.currentMember?.level || 1}</div>
          </div>
          <div class="cl-profile-name">{props.currentMember?.name || "Member"}</div>
          <div class="cl-profile-level-title">
            Level {props.currentMember?.level || 1} - {props.currentMember?.levelName || "Member"}
          </div>
          <div class="cl-profile-pts">
            {props.currentMember?.pointsToNext} points to level up 
            <button class="cl-math-info-toggle" onClick$={() => showInfo.value = !showInfo.value}>[?]</button>
          </div>
          {showInfo.value && (
            <div class="cl-math-info">
              <h4>Points</h4>
              <p>You earn points when other members like your posts or comments. 1 like = 1 point. This encourages users to produce quality content and interact with other members in their community.</p>
              <h4>Levels</h4>
              <p>As you gain points, you level up. Your level is shown at the bottom right of your avatar. The number of points required to get to the next level is shown under your avatar on your profile page.</p>
              <div style="column-count: 2; column-gap: 1rem; font-size: 0.8rem;">
                <div>Level 1 - 0 points</div>
                <div>Level 2 - 5 points</div>
                <div>Level 3 - 20 points</div>
                <div>Level 4 - 65 points</div>
                <div>Level 5 - 155 points</div>
                <div>Level 6 - 515 points</div>
                <div>Level 7 - 2,015 points</div>
                <div>Level 8 - 8,015 points</div>
                <div>Level 9 - 33,015 points</div>
              </div>
            </div>
          )}
        </div>

        {/* Levels List */}
        <div class="cl-levels-col">
          {props.levels.map((lvl) => {
            const isActuallyLocked = (props.currentMember?.level || 1) < lvl.level;
            return (
              <div class="cl-level-item" key={lvl.level}>
                <div class={`cl-level-icon ${isActuallyLocked ? "locked" : ""}`}>
                  {isActuallyLocked ? "🔒" : lvl.level}
                </div>
                <div class="cl-level-info">
                  <div class="cl-level-title">Level {lvl.level} - {lvl.name}</div>
                  <div class="cl-level-desc">
                    {lvl.unlocks && (
                      <>Unlock <span class="cl-unlock-highlight">{lvl.unlocks}</span> </>
                    )}
                    {lvl.percentage}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div class="cl-boards-header">Last updated: {props.lastUpdated}</div>

      {/* Leaderboards Grid */}
      <div class="cl-boards-grid">
        {/* 7 Day Board */}
        <div class="cl-board">
          <div class="cl-board-title">Leaderboard (7-day)</div>
          <div class="cl-board-list">
            {props.board7d.map((user, idx) => (
              <div class="cl-board-row" key={user.id}>
                <div class={`cl-rank ${idx === 0 ? "gold" : idx === 1 ? "silver" : idx === 2 ? "bronze" : ""}`}>
                  {idx + 1}
                </div>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} class="cl-b-avatar" alt="" width="32" height="32" />
                ) : (
                  <div class="cl-b-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:bold;">
                    {user.name[0]?.toUpperCase()}
                  </div>
                )}
                <div class="cl-b-name">{user.name}</div>
                <div class="cl-b-pts">+{user.points.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* 30 Day Board */}
        <div class="cl-board">
          <div class="cl-board-title">Leaderboard (30-day)</div>
          <div class="cl-board-list">
            {props.board30d.map((user, idx) => (
              <div class="cl-board-row" key={user.id}>
                <div class={`cl-rank ${idx === 0 ? "gold" : idx === 1 ? "silver" : idx === 2 ? "bronze" : ""}`}>
                  {idx + 1}
                </div>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} class="cl-b-avatar" alt="" width="32" height="32" />
                ) : (
                  <div class="cl-b-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:bold;">
                    {user.name[0]?.toUpperCase()}
                  </div>
                )}
                <div class="cl-b-name">{user.name}</div>
                <div class="cl-b-pts">+{user.points.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>

        {/* All Time Board */}
        <div class="cl-board">
          <div class="cl-board-title">Leaderboard (all-time)</div>
          <div class="cl-board-list">
            {props.boardAllTime.map((user, idx) => (
              <div class="cl-board-row" key={user.id}>
                <div class={`cl-rank ${idx === 0 ? "gold" : idx === 1 ? "silver" : idx === 2 ? "bronze" : ""}`}>
                  {idx + 1}
                </div>
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} class="cl-b-avatar" alt="" width="32" height="32" />
                ) : (
                  <div class="cl-b-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:bold;">
                    {user.name[0]?.toUpperCase()}
                  </div>
                )}
                <div class="cl-b-name">{user.name}</div>
                <div class="cl-b-pts">{user.points.toLocaleString()}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
});

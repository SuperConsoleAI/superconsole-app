import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { LuUsers, LuHeart, LuEye, LuMessageCircle } from "@qwikest/icons/lucide";

export const SocialProfileAnalytics = component$<{ data: any, platformFilter?: string }>(({ data, platformFilter }) => {
  useStylesScoped$(`
    .stat-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 1.5rem; }
    @media (max-width: 1024px) { .stat-grid { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 480px) { .stat-grid { grid-template-columns: 1fr; } }
    .stat-card { padding: 1.25rem; border-radius: 0.75rem; background: var(--surface-2); border: 1px solid var(--border); }
    .stat-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem; color: var(--text-secondary); font-size: 0.875rem; font-weight: 500; }
    .stat-value { font-size: 1.75rem; font-weight: 700; color: var(--text-primary); }
    
    .chart-card { background: var(--surface-2); border-radius: 0.75rem; border: 1px solid var(--border); padding: 1.5rem; }
    .platforms-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1rem; margin-top: 1.5rem; }
    .platform-card { padding: 1.25rem; border-radius: 0.75rem; background: var(--surface-2); border: 1px solid var(--border); }
    .platform-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1rem; font-weight: 600; text-transform: capitalize; }
  `);

  if (!data || Object.keys(data).length === 0) {
    return (
      <div style="text-align:center; padding:3rem; color:var(--text-secondary);">
        No profile analytics data found yet. Syncing...
      </div>
    );
  }

  // Parse platform breakdown
  let platforms: any = {};
  if (data.platform_breakdown) {
    try {
      platforms = typeof data.platform_breakdown === 'string' 
        ? JSON.parse(data.platform_breakdown) 
        : data.platform_breakdown;
    } catch { /* ignore */ }
  }
  
  const entries = Object.entries(platforms).filter(([platform]) => 
      !platformFilter || platformFilter === platform
  );

  return (
    <div>
      <div class="stat-grid">
        <div class="stat-card">
          <div class="stat-header">
            <span>Total Followers</span>
            <LuUsers style="width: 1rem; height: 1rem;" />
          </div>
          <div class="stat-value">{data.total_followers?.toLocaleString() || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span>Total Impressions</span>
            <LuEye style="width: 1rem; height: 1rem;" />
          </div>
          <div class="stat-value">{data.total_impressions_all_platforms?.toLocaleString() || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span>Total Likes</span>
            <LuHeart style="width: 1rem; height: 1rem;" />
          </div>
          <div class="stat-value">{data.total_likes_all_platforms?.toLocaleString() || 0}</div>
        </div>
        <div class="stat-card">
          <div class="stat-header">
            <span>Total Comments</span>
            <LuMessageCircle style="width: 1rem; height: 1rem;" />
          </div>
          <div class="stat-value">{data.total_comments_all_platforms?.toLocaleString() || 0}</div>
        </div>
      </div>

      <h2 style="font-size: 1.125rem; font-weight: 600; margin: 2rem 0 1rem 0;">Platform Breakdown</h2>
      <div class="platforms-grid">
        {entries.map(([platform, stats]: [string, any]) => (
          <div class="platform-card" key={platform}>
            <div class="platform-header">
              {platform}
              <span style="margin-left:auto; font-size:0.75rem; font-weight:400; color:var(--text-secondary);">
                @{stats.username}
              </span>
            </div>
            
            <div style="display:flex; flex-direction:column; gap:0.5rem; font-size:0.875rem;">
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-secondary);">Followers</span>
                <span style="font-weight:500;">{stats.followers?.toLocaleString() || 0}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-secondary);">Engagement Rate</span>
                <span style="font-weight:500;">{((stats.engagement_rate || 0) / 100).toFixed(2)}%</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-secondary);">Total Posts</span>
                <span style="font-weight:500;">{stats.total_posts?.toLocaleString() || 0}</span>
              </div>
              <div style="display:flex; justify-content:space-between;">
                <span style="color:var(--text-secondary);">Impressions</span>
                <span style="font-weight:500;">{stats.total_impressions?.toLocaleString() || 0}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

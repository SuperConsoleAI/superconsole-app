import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { LuHeart, LuMessageCircle, LuEye, LuRepeat } from "@qwikest/icons/lucide";

export const SocialPostAnalytics = component$<{ data: any[], platformFilter?: string }>(({ data, platformFilter }) => {
  useStylesScoped$(`
    .post-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 1.5rem; }
    .post-card { background: var(--surface-2); border-radius: 0.75rem; border: 1px solid var(--border); overflow: hidden; display: flex; flex-direction: column; }
    .post-content { padding: 1.25rem; flex: 1; font-size: 0.875rem; color: var(--text-primary); line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
    .post-meta { display: flex; align-items: center; justify-content: space-between; padding: 0.75rem 1.25rem; border-top: 1px solid var(--border); font-size: 0.75rem; color: var(--text-secondary); background: var(--surface-1); }
    
    .stats-row { display: flex; align-items: center; gap: 1rem; padding: 0.75rem 1.25rem; border-top: 1px solid var(--border); font-size: 0.875rem; font-weight: 500; }
    .stat-item { display: flex; align-items: center; gap: 0.35rem; }
    .platform-chip { padding: 0.25rem 0.5rem; border-radius: 0.25rem; background: var(--surface-3); text-transform: capitalize; }
  `);

  const filteredData = data?.filter(p => !platformFilter || p.platform === platformFilter) || [];

  if (filteredData.length === 0) {
    return (
      <div style="text-align:center; padding:3rem; color:var(--text-secondary);">
        No recent posts found. Syncing...
      </div>
    );
  }

  return (
    <div>
      <h2 style="font-size: 1.125rem; font-weight: 600; margin: 0 0 1.5rem 0;">Recent Posts Performance</h2>
      
      <div class="post-grid">
        {filteredData.map((post) => (
          <div class="post-card" key={post.id}>
            <div class="post-content">
              {post.content || "Media only post..."}
            </div>
            
            <div class="stats-row">
              <div class="stat-item" title="Impressions">
                <LuEye style="width: 1rem; height: 1rem; color: var(--text-secondary);" />
                {post.impressions?.toLocaleString() || 0}
              </div>
              <div class="stat-item" title="Likes">
                <LuHeart style="width: 1rem; height: 1rem; color: var(--text-secondary);" />
                {post.likes?.toLocaleString() || 0}
              </div>
              <div class="stat-item" title="Comments">
                <LuMessageCircle style="width: 1rem; height: 1rem; color: var(--text-secondary);" />
                {post.comments?.toLocaleString() || 0}
              </div>
              <div class="stat-item" title="Shares/Reposts">
                <LuRepeat style="width: 1rem; height: 1rem; color: var(--text-secondary);" />
                {(post.shares + post.reposts)?.toLocaleString() || 0}
              </div>
            </div>

            <div class="post-meta">
              <span class="platform-chip">{post.platform}</span>
              <span>
                {post.published_at 
                  ? new Date(post.published_at * 1000).toLocaleDateString()
                  : "Unknown Date"
                }
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});

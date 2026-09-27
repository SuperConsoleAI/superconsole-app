import { component$, useStylesScoped$, useSignal, type PropFunction } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

export interface CommunityPostListProps {
  posts: any[];
  categories: { id: string; name: string; icon?: string }[];
  activeCategoryId?: string;
  onFilterChange$?: PropFunction<(categoryId: string) => void>;
  baseHref: string; // Used to compute URLs if needed
  currentUserProfileId?: string;
  currentUserName?: string;
  currentUserAvatar?: string;
}

const { typography, spacing, borderRadius, transitions } = designSystem;

const STYLES = `
  .cpl-container {
    display: flex;
    flex-direction: column;
    gap: ${spacing.md};
  }

  /* Filter Tag Row */
  .cpl-filters {
    display: flex;
    gap: ${spacing.sm};
    overflow-x: auto;
    padding-bottom: ${spacing.xs};
    scrollbar-width: none;
    margin-bottom: ${spacing.sm};
  }
  .cpl-filters::-webkit-scrollbar { display: none; }
  
  .cpl-filter-tag {
    white-space: nowrap;
    padding: 0.4rem 1rem;
    border-radius: ${borderRadius.pill};
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-secondary);
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.medium};
    cursor: pointer;
    transition: all ${transitions.fast};
  }
  .cpl-filter-tag:hover {
    background: var(--surface-2);
    color: var(--text-primary);
  }
  .cpl-filter-tag.active {
    background: var(--text-secondary);
    color: var(--surface);
    border-color: var(--text-secondary);
  }

  /* Post Card */
  .cpl-card {
    background: var(--surface-2);
    border: 1px solid var(--border);
    border-radius: ${borderRadius.lg};
    padding: ${spacing.lg};
    cursor: pointer;
    transition: border-color ${transitions.fast}, box-shadow ${transitions.fast};
    min-width: 0;
    overflow: hidden;
    word-break: break-word;
  }
  .cpl-card:hover {
    border-color: var(--accent);
  }
  .cpl-card.pinned {
    border-top: 3px solid #f59e0b;
  }

  /* Header */
  .cpl-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: ${spacing.md};
  }
  .cpl-author-block {
    display: flex;
    gap: ${spacing.md};
    align-items: center;
  }
  .cpl-avatar-wrap {
    position: relative;
    width: 44px;
    height: 44px;
  }
  .cpl-avatar {
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    background: var(--surface-3);
    border: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    color: var(--text-secondary);
  }
  .cpl-level-badge {
    position: absolute;
    bottom: -2px;
    right: -2px;
    background: #6366f1; /* purple-ish blue */
    color: #fff;
    font-size: 0.65rem;
    font-weight: bold;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    border: 2px solid var(--surface-2);
  }
  .cpl-author-info {
    display: flex;
    flex-direction: column;
  }
  .cpl-author-name {
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.bold};
    color: var(--text-primary);
  }
  .cpl-meta-text {
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
    margin-top: 0.15rem;
  }
  
  .cpl-pin-indicator {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.bold};
    color: var(--text-secondary);
  }

  /* Body */
  .cpl-title {
    font-size: 1.15rem;
    font-weight: ${typography.weights.bold};
    color: var(--text-primary);
    margin-bottom: ${spacing.sm};
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .cpl-title-dot {
    width: 8px;
    height: 8px;
    background: #3b82f6;
    border-radius: 50%;
    display: inline-block;
  }
  .cpl-preview {
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    line-height: 1.6;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    margin-bottom: ${spacing.lg};
  }

  /* Footer */
  .cpl-footer {
    display: flex;
    align-items: center;
    gap: ${spacing.xl};
  }
  .cpl-reaction {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.medium};
    color: var(--text-secondary);
  }
  .cpl-new-comment {
    color: #3b82f6;
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.semibold};
    margin-left: auto;
  }
  
  .cpl-empty {
    text-align: center;
    padding: 4rem ${spacing.xl};
    color: var(--text-secondary);
    border: 1px dashed var(--border);
    border-radius: ${borderRadius.xl};
  }

  /* Pagination */
  .cpl-pagination {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    margin-top: ${spacing.xl};
  }
  .cpl-page-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 0.5rem;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--text-primary);
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.medium};
    cursor: pointer;
    transition: all ${transitions.fast};
  }
  .cpl-page-btn:hover {
    background: var(--surface-2);
    border-color: var(--accent);
  }
  .cpl-page-btn.active {
    background: var(--accent);
    color: #fff;
    border-color: var(--accent);
  }
`;

export const CommunityPostLists = component$<CommunityPostListProps>((props) => {
  useStylesScoped$(STYLES);
  
  const currentPage = useSignal(1);
  const postsPerPage = 30;

  if (!props.posts || props.posts.length === 0) {
    return (
      <div class="cpl-empty">
        <div style={{ fontSize: "3rem", marginBottom: "0.5rem" }}>✍️</div>
        <div style={{ fontSize: "1.25rem", fontWeight: "bold", color: "var(--text-primary)" }}>No posts yet</div>
        <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>Be the first to start the conversation!</div>
      </div>
    );
  }

  const totalPages = Math.ceil(props.posts.length / postsPerPage);
  const startIndex = (currentPage.value - 1) * postsPerPage;
  const currentPosts = props.posts.slice(startIndex, startIndex + postsPerPage);

  return (
    <div class="cpl-container">
      {/* Filters (only show if we have categories) */}
      {props.categories && props.categories.length > 0 && (
        <div class="cpl-filters">
          <button 
            type="button" 
            class={`cpl-filter-tag ${!props.activeCategoryId ? "active" : ""}`}
            onClick$={() => {
              props.onFilterChange$?.("");
              currentPage.value = 1;
            }}
          >
            All
          </button>
          
          {/* We add un-grouped tags just like UI */}
          {props.categories.map(c => (
            <button 
              key={c.id}
              type="button" 
              class={`cpl-filter-tag ${props.activeCategoryId === c.id ? "active" : ""}`}
              onClick$={() => props.onFilterChange$?.(c.id)}
            >
              {c.icon ? `${c.icon} ${c.name}` : c.name}
            </button>
          ))}
          
          <button type="button" class="cpl-filter-tag">More...</button>
          <button type="button" class="cpl-filter-tag">⚙️</button>
        </div>
      )}

      {/* Post List */}
      <div class="cpl-feed">
        {currentPosts.map((p: any) => {
          const isMe = props.currentUserProfileId && p.profile_id === props.currentUserProfileId;
          const authorName = isMe && props.currentUserName ? props.currentUserName : (p.member_first_name || "Member");
          const authorAvatar = isMe && props.currentUserAvatar ? props.currentUserAvatar : p.author_avatar_url;
          
          let d = new Date();
          if (p.created_at) {
             if (typeof p.created_at === 'number') {
                d = new Date(p.created_at * 1000);
             } else {
                d = new Date(p.created_at);
                if (isNaN(d.getTime()) && /^\d+$/.test(String(p.created_at))) {
                   d = new Date(parseInt(String(p.created_at)) * 1000);
                }
             }
          }
          if (isNaN(d.getTime())) d = new Date();
          const formattedDate = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          const isPinned = p.is_pinned === true;

          // Attempt to find the category name
          let catName = "";
          if (p.category_id && props.categories) {
             const c = props.categories.find((x: any) => x.id === p.category_id);
             if (c) catName = c.name;
          }
          if (p.post_type === "announcement" && !catName) catName = "Announcements";

          return (
            <div class={`cpl-card ${isPinned ? "pinned" : ""}`} key={p.id} style={{ marginBottom: "1rem" }}>
              
              <div class="cpl-header">
                <div class="cpl-author-block">
                  <div class="cpl-avatar-wrap">
                    {authorAvatar ? (
                      <img src={authorAvatar} class="cpl-avatar" alt="" width="44" height="44" />
                    ) : (
                      <div class="cpl-avatar">{authorName[0]?.toUpperCase()}</div>
                    )}
                    <div class="cpl-level-badge">{p.author_level || 1}</div>
                  </div>
                  <div class="cpl-author-info">
                    <div class="cpl-author-name">{authorName}</div>
                    <div class="cpl-meta-text">
                       {formattedDate} {catName ? ` • ${catName}` : ""}
                    </div>
                  </div>
                </div>

                {isPinned && (
                  <div class="cpl-pin-indicator">
                    <span>📌</span> Pinned
                  </div>
                )}
              </div>

              {p.title && (
                <div class="cpl-title">
                  <span class="cpl-title-dot"></span>
                  {p.title}
                </div>
              )}
              
              {p.body && <div class="cpl-preview">{p.body}</div>}

              <div class="cpl-footer">
                <div class="cpl-reaction">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
                  {p.like_count || 0}
                </div>
                <div class="cpl-reaction">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                  {p.comment_count || 0}
                </div>
                
                {/* Visual anchor for potential new comments */}
                {p.comment_count > 0 && <div class="cpl-new-comment">New comment</div>}
              </div>

            </div>
          );
        })}
      </div>

      {totalPages > 1 && (
        <div class="cpl-pagination">
          <button 
            type="button" 
            class="cpl-page-btn"
            disabled={currentPage.value === 1}
            onClick$={() => { if (currentPage.value > 1) currentPage.value--; }}
          >
            &lt;
          </button>
          
          {Array.from({ length: totalPages }).map((_, i) => (
            <button 
              key={i}
              type="button" 
              class={`cpl-page-btn ${currentPage.value === i + 1 ? "active" : ""}`}
              onClick$={() => currentPage.value = i + 1}
            >
              {i + 1}
            </button>
          ))}

          <button 
            type="button" 
            class="cpl-page-btn"
            disabled={currentPage.value === totalPages}
            onClick$={() => { if (currentPage.value < totalPages) currentPage.value++; }}
          >
            &gt;
          </button>
        </div>
      )}
    </div>
  );
});

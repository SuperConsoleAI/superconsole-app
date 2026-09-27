import { component$, useStylesScoped$, useSignal, useComputed$ } from "@builder.io/qwik";
import { Link, useNavigate, type DocumentHead } from "@builder.io/qwik-city";
import CommunityCreatePopup from "~/components/community/CommunityCreatePopup";
import { CommunitySettings } from "~/components/community/CommunitySettings";
import { ProductTable } from "~/components/ProductTable";
import { LuSettings, LuBarChart2, LuUsers, LuEye } from "@qwikest/icons/lucide";
import { useContext, $ } from "@builder.io/qwik";
import { CommunityStateContext } from "./layout";

const STYLES = `
  .community-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: var(--space-lg);
  }
  .community-card {
    background: var(--surface-2);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: box-shadow var(--transition-normal), border-color var(--transition-normal);
    text-decoration: none;
  }
  .community-card:hover { border-color: var(--accent); box-shadow: var(--shadow-md); }
  .community-cover {
    width: 100%;
    height: 120px;
    object-fit: cover;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
  }
  .community-cover-placeholder {
    width: 100%;
    height: 120px;
    background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 2.5rem;
  }
  .community-body { padding: var(--space-md); display: flex; flex-direction: column; flex: 1; gap: var(--space-xs); }
  .community-name { font-size: 1.1rem; font-weight: 600; color: var(--text-primary); text-decoration: none; }
  .community-tagline { font-size: 0.85rem; color: var(--text-secondary); }
  .community-meta {
    display: flex;
    gap: var(--space-md);
    margin-top: var(--space-sm);
  }
  .meta-stat { display: flex; align-items: center; gap: 4px; font-size: 0.8rem; color: var(--text-secondary); }
  .badge-access {
    display: inline-block;
    padding: 2px 8px;
    border-radius: var(--radius-full);
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .badge-free { background: var(--success-soft); color: var(--success); }
  .badge-invite { background: var(--warning-soft); color: var(--warning); }
  
  .empty-state {
    text-align: center;
    padding: var(--space-3xl) var(--space-xl);
    color: var(--text-secondary);
  }
  .empty-icon { font-size: 3.5rem; margin-bottom: var(--space-md); }
  .empty-title { font-size: 1.25rem; font-weight: 600; color: var(--text-primary); margin-bottom: var(--space-xs); }
  .empty-desc { font-size: 0.9rem; margin-bottom: var(--space-lg); }
  
  .btn-primary { background: var(--button-primary-bg); color: var(--button-primary-text); }
  .btn-primary:hover { opacity: 0.9; }
  
  
`;

export default component$(() => {
  useStylesScoped$(STYLES);
  const showCreate = useSignal(false);
  const settingsOpen = useSignal(false);
  const selectedCommunity = useSignal<any>(null);
  const searchQuery = useSignal("");
  const nav = useNavigate();
  
  const store = useContext(CommunityStateContext);
  
  const totalMembers = useComputed$(() => store.communities.reduce((s: number, c: any) => s + (c.member_count || 0), 0));
  const totalPosts = useComputed$(() => store.communities.reduce((s: number, c: any) => s + (c.post_count || 0), 0));
  const totalPrivate = useComputed$(() => store.communities.filter((c: any) => c.is_private).length);

  const filteredCommunities = useComputed$(() => {
    if (!searchQuery.value) return store.communities;
    const lower = searchQuery.value.toLowerCase();
    return store.communities.filter(c => 
      c.name?.toLowerCase().includes(lower) || 
      c.tagline?.toLowerCase().includes(lower)
    );
  });

  const paginatedCommunities = useComputed$(() => {
    return filteredCommunities.value.map(c => ({
      id: c.id,
      title: c.name,
      slug: `${c.id}/posts/`,
      hero_image_url: c.cover_image,
      total_sales: c.member_count || 0,
      published: !c.is_private,
      originalCommunity: c // stash the original object
    })) as any;
  });

  return (
    <div class="p-4 md:p-8 flex flex-col gap-6" style="width: 100%; box-sizing: border-box;">
      {store.loading ? (
        <div class="stats-grid" style="margin-bottom:var(--space-lg)">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} class="stat-card">
              <div class="skeleton" style="height:14px;width:80px;margin-bottom:12px" />
              <div class="skeleton" style="height:32px;width:60px" />
            </div>
          ))}
        </div>
      ) : store.communities.length === 0 && !searchQuery.value ? (
        <div class="empty-state bg-surface-2 border border-divider rounded-2xl">
          <div class="empty-icon">🏘️</div>
          <div class="empty-title">No communities found</div>
          <p class="empty-desc">Create a space for your members to connect.</p>
          <button type="button" class="btn btn-primary px-8 py-3 rounded-xl shadow-lg shadow-accent/20" onClick$={() => showCreate.value = true}>
            Create your first Community
          </button>
        </div>
      ) : (
        <>
          <div class="category-stats">
            <div class="stat-card">
              <h3>Total Communities</h3>
              <div class="stat-value">
                {store.communities.length}
              </div>
              <div class="stat-description">managed by you</div>
            </div>
            <div class="stat-card">
              <h3>Total Members</h3>
              <div class="stat-value">
                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(totalMembers.value)}
              </div>
              <div class="stat-description">across all spaces</div>
            </div>
            <div class="stat-card">
              <h3>Total Posts</h3>
              <div class="stat-value">
                {Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(totalPosts.value)}
              </div>
              <div class="stat-description">published overall</div>
            </div>
            <div class="stat-card">
              <h3>Private Spaces</h3>
              <div class="stat-value">
                {totalPrivate.value}
              </div>
              <div class="stat-description">invite only</div>
            </div>
          </div>
          <ProductTable
            products={paginatedCommunities}
            pathPrefix="/dashboard/community/"
            showPrice={false}
            showSales={true}
            showStatus={true}
            showEdit={false}
            showAnalytics={false}
            showView={false}
            showDelete={false}
            onRowClick$={$((item: any) => nav(`/dashboard/community/${item.id}/posts`))}
            salesLabel="Members"
            statusLabel="Access"
            renderStatus$={$((item: any) => {
              const isPrivate = !item.published;
              return (
                <span class={`badge-access ${isPrivate ? "badge-invite" : "badge-free"}`}>
                  {isPrivate ? "Invite Only" : "Free"}
                </span>
              );
            })}
            extraActions$={$((item: any) => {
              return (
                <>
                    <Link href={`/dashboard/community/${item.id}/analytics`} title="Analytics" style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; display: flex; color: var(--text-secondary); cursor: pointer; transition: border-color 0.2s;">
                      <LuBarChart2 style="width: 1rem; height: 1rem;" />
                    </Link>
                    <Link href={`/dashboard/community/${item.id}/members`} title="Members" style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; display: flex; color: var(--text-secondary); cursor: pointer; transition: border-color 0.2s;">
                      <LuUsers style="width: 1rem; height: 1rem;" />
                    </Link>
                    <Link href={`/c/${item.id}`} target="_blank" title="View" style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; display: flex; color: var(--text-secondary); cursor: pointer; transition: border-color 0.2s;">
                      <LuEye style="width: 1rem; height: 1rem;" />
                    </Link>
                    <button 
                      type="button"
                      preventdefault:click
                      onClick$={() => { 
                        const comm = filteredCommunities.value.find(c => c.id === item.id);
                        if (comm) {
                          selectedCommunity.value = comm; 
                          settingsOpen.value = true;
                        }
                      }} 
                      title="Settings"
                      style="padding: 0.375rem; background: var(--surface-2); border: 1px solid var(--border); border-radius: 0.5rem; display: flex; color: var(--text-secondary); cursor: pointer; transition: border-color 0.2s;"
                    >
                    <LuSettings style="width: 1rem; height: 1rem;" />
                  </button>
                </>
              );
            })}
            onEdit$={$((/* unused */) => {
              // Not used, handled by extraActions
            })}
          >
            <div q:slot="headerActions" style="display: flex; gap: 0.75rem; align-items: center;">
              <button 
                type="button" 
                class="btn btn-primary" 
                style="height: 32px; padding: 0 1rem; display: flex; align-items: center; white-space: nowrap; border: none; border-radius: var(--radius-sm); font-size: 0.85rem; font-weight: 600; cursor: pointer;" 
                onClick$={() => showCreate.value = true}
              >
                + Add Community
              </button>
            </div>
          </ProductTable>
        </>
      )}

      {showCreate.value && (
        <CommunityCreatePopup
          onClose$={() => showCreate.value = false}
          onCreated$={async (newComm) => {
            showCreate.value = false;
            await store.refresh();
            nav(`/dashboard/community/${newComm.id}`);
          }}
        />
      )}

      <CommunitySettings 
        open={settingsOpen} 
        communityId={selectedCommunity.value?.id || ""} 
        initialCommunity={selectedCommunity.value}
        onClose$={() => { settingsOpen.value = false; setTimeout(() => selectedCommunity.value = null, 300); }}
      />
    </div>
  );
});

export const head: DocumentHead = { title: "Community Dashboard — BusinessKit" };

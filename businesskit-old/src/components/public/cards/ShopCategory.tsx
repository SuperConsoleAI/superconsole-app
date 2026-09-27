import { $, component$, useComputed$, useSignal, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";
import ShopProductCard from "../ShopProductCard";

const { spacing, borderRadius, typography, shadows } = designSystem;

const SHOP_CATEGORY_STYLES = `
  .shop-category {
    display: flex;
    flex-direction: column;
    gap: ${spacing.md};
  }

  .shop-category__tabs {
    display: inline-flex;
    background-color: var(--surface-3);
    border-radius: ${borderRadius.lg};
    padding: 0.25rem;
    border: 1px solid var(--border);
    width: fit-content;
  }

  .shop-category__tab {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.medium};
    padding: 0.375rem 0.875rem;
    border-radius: ${borderRadius.lg};
    cursor: pointer;
    text-transform: capitalize;
    transition: background-color ${designSystem.transitions.fast}, color ${designSystem.transitions.fast};
  }

  .shop-category__tab--active {
    background-color: var(--accent-soft);
    color: var(--text-primary);
  }

  .shop-category__products-grid {
    display: grid;
    gap: 0.7rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .shop-category :global(.wears-card__image-wrap) {
    aspect-ratio: 3 / 2;
  }

  .shop-category__collections-list {
    display: grid;
    grid-template-columns: 1fr;
    gap: ${spacing.md};
    width: 100%;
    padding: ${spacing.sm};
  }

  .shop-category__collection-card {
    border: 1px solid var(--border);
    border-radius: ${borderRadius.lg};
    background-color: transparent;
    padding: ${spacing.md};
    display: flex;
    flex-direction: column;
    align-items: stretch;
    cursor: pointer;
    width: 100%;
    text-align: left;
    grid-column: 1 / -1;
  }

  .shop-category__collection-card:hover,
  .shop-category__collection-card:focus-visible {
    outline: none;
  }

  .shop-category__collection-header {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: ${spacing.xs} ${spacing.xs} ${spacing.sm};
  }

  .shop-category__collection-title {
    margin: 0;
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .shop-category__collection-count {
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
    margin-top: 0;
    text-transform: capitalize;
  }

  .shop-category__collection-images {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 0.75rem;
    width: 100%;
  }

  .shop-category__collection-image {
    position: relative;
    aspect-ratio: 1 / 1;
    border-radius: ${borderRadius.md};
    overflow: hidden;
    background-color: #d9d9d9;
  }

  .shop-category__collection-image img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .shop-category__posts-grid {
    column-count: 2;
    column-gap: 0.75rem;
  }

  .shop-category__post-card {
    border: 1px solid var(--border);
    border-radius: ${borderRadius.lg};
    background-color: var(--surface-2);
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
    cursor: pointer;
    width: 100%;
    break-inside: avoid;
    -webkit-column-break-inside: avoid;
    margin-bottom: 0.75rem;
  }

  .shop-category__post-card:hover,
  .shop-category__post-card:focus-visible {
    outline: none;
  }

  .shop-category__post-media {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    border-radius: ${borderRadius.md};
    overflow: hidden;
    background-color: #000000;
  }

  .shop-category__post-media--portrait {
    aspect-ratio: 9 / 16;
  }

  .shop-category__post-media iframe,
  .shop-category__post-media video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    border: none;
    pointer-events: none;
    display: block;
  }

  .shop-category__post-summary {
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
    display: flex;
    gap: ${spacing.xs};
    align-items: center;
  }

  .shop-category__empty {
    padding: ${spacing.lg};
    text-align: center;
    border: 1px dashed var(--border);
    border-radius: ${borderRadius.lg};
    color: var(--text-secondary);
    background-color: var(--surface-2);
  }

  .shop-category__modal-overlay {
    position: fixed;
    inset: 0;
    background-color: var(--surface-overlay);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: ${spacing.lg};
    z-index: 70;
  }

  .shop-category__modal-content {
    width: 100%;
    max-width: 64rem;
    max-height: 90vh;
    overflow-y: auto;
    background-color: var(--surface-1);
    border-radius: ${borderRadius.lg};
    padding: ${spacing.lg};
    display: flex;
    flex-direction: column;
    gap: ${spacing.md};
    box-shadow: ${shadows.lg};
  }

  .shop-category__modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0;
  }

  .shop-category__modal-heading {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .shop-category__modal-title {
    margin: 0;
    font-size: ${typography.sizes.lg};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
    text-transform: capitalize;
  }

  .shop-category__modal-count {
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

  .shop-category__modal-close {
    appearance: none;
    border: none;
    background: transparent;
    color: var(--text-secondary);
    font-size: ${typography.sizes.base};
    cursor: pointer;
  }

  .shop-category__modal-body {
    display: grid;
    gap: ${spacing.lg};
  }

  .shop-category__modal-grid {
    display: grid;
    gap: ${spacing.md};
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  @media (min-width: ${designSystem.breakpoints.md}) {
    .shop-category__products-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }

    .shop-category__posts-grid {
      column-count: 4;
      column-gap: 0.75rem;
    }

    .shop-category__modal-body {
      grid-template-columns: minmax(0, 0.75fr) minmax(0, 2.25fr);
      align-items: start;
    }

    .shop-category__modal-grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
  }

  .shop-category__modal-video {
    width: 100%;
    max-width: 48rem;
    aspect-ratio: 16 / 9;
    border-radius: ${borderRadius.lg};
    overflow: hidden;
    background-color: #000000;
    border: 1px solid var(--border);
  }

  .shop-category__modal-video--portrait {
    max-width: 27rem;
    aspect-ratio: 9 / 16;
  }

  .shop-category__modal-video iframe,
  .shop-category__modal-video video {
    width: 100%;
    height: 100%;
    border: none;
  }
`;

interface ShopLinkItem {
  key: string;
  link: PageSettingsLinkItem;
  href: string;
  imageUrl: string | null;
  onNavigate$?: PropFunction<() => void>;
}

interface ShopCategoryProps {
  items: ShopLinkItem[];
}

const sanitizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const candidateStrings = (value: unknown): string[] => {
  if (!value || typeof value !== "object") {
    return [];
  }
  const results: string[] = [];
  for (const key of ["name", "title", "label", "value"]) {
    const entry = (value as Record<string, unknown>)[key];
    if (typeof entry === "string") {
      results.push(entry);
    }
  }
  return results;
};

const extractCollectionName = (link: PageSettingsLinkItem): string | null => {
  const candidates: unknown[] = [
    (link as Record<string, unknown>)["collection_name"],
    (link as Record<string, unknown>)["collectionName"],
    (link as Record<string, unknown>)["collection"],
    (link as Record<string, unknown>)["collection_title"],
  ];

  for (const candidate of candidates) {
    const sanitized = sanitizeText(candidate);
    if (sanitized) {
      return sanitized;
    }
  }

  const nestedCandidates = candidateStrings((link as Record<string, unknown>)["collection"]);
  for (const value of nestedCandidates) {
    const sanitized = sanitizeText(value);
    if (sanitized) {
      return sanitized;
    }
  }

  return null;
};

const extractVideoUrl = (link: PageSettingsLinkItem): string | null => {
  const candidates: unknown[] = [
    (link as Record<string, unknown>)["video_url"],
    (link as Record<string, unknown>)["videoUrl"],
    (link as Record<string, unknown>)["video"],
    (link as Record<string, unknown>)["video_link"],
  ];

  for (const candidate of candidates) {
    const sanitized = sanitizeText(candidate);
    if (sanitized) {
      return sanitized;
    }
  }

  const nested = (link as Record<string, unknown>)["video"];
  if (nested && typeof nested === "object") {
    for (const key of ["url", "source", "href"]) {
      const value = sanitizeText((nested as Record<string, unknown>)[key]);
      if (value) {
        return value;
      }
    }
  }

  return null;
};

type VideoOrientation = "portrait" | "landscape";

interface VideoPresentation {
  type: "iframe" | "video";
  src: string;
  orientation: VideoOrientation;
}

const getVideoPresentation = (value: string): VideoPresentation | null => {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();

    if (host.includes("youtube") || host === "youtu.be") {
      let videoId: string | null = null;
      let isShort = false;

      if (host === "youtu.be") {
        const path = url.pathname.replace("/", "");
        if (path.length > 0) {
          videoId = path;
          isShort = true;
        }
      } else {
        if (url.pathname.startsWith("/shorts/")) {
          const [, , shortsId] = url.pathname.split("/");
          if (shortsId) {
            videoId = shortsId;
            isShort = true;
          }
        }
        if (!videoId) {
          const candidate = url.searchParams.get("v");
          if (candidate) {
            videoId = candidate;
          }
        }
      }

      if (videoId) {
        const embedUrl = `https://www.youtube.com/embed/${videoId}${isShort ? "?feature=shorts" : ""}`;
        return {
          type: "iframe",
          src: embedUrl,
          orientation: isShort ? "portrait" : "landscape",
        };
      }
    }

    if (host.includes("tiktok.com")) {
      const segments = url.pathname.split("/").filter(Boolean);
      const videoIndex = segments.indexOf("video");
      if (videoIndex !== -1 && segments.length > videoIndex + 1) {
        const videoId = segments[videoIndex + 1];
        const embedUrl = `https://www.tiktok.com/embed/v2/${videoId}`;
        return {
          type: "iframe",
          src: embedUrl,
          orientation: "portrait",
        };
      }
      return {
        type: "iframe",
        src: `${url.origin}${url.pathname}?embed=1`,
        orientation: "portrait",
      };
    }

    if (host.includes("instagram.com")) {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length >= 2) {
        const contentType = segments[0];
        const contentId = segments[1];
        const embedUrl = `https://www.instagram.com/${contentType}/${contentId}/embed/?hidecaption=true&byline=0`;
        return {
          type: "iframe",
          src: embedUrl,
          orientation: contentType === "reel" ? "portrait" : "landscape",
        };
      }
      return {
        type: "iframe",
        src: `${url.origin}${url.pathname}embed/?hidecaption=true&byline=0`,
        orientation: "portrait",
      };
    }

    if (host.includes("vimeo.com")) {
      const segments = url.pathname.split("/").filter(Boolean);
      if (segments.length > 0) {
        const videoId = segments[segments.length - 1];
        const embedUrl = `https://player.vimeo.com/video/${videoId}`;
        return {
          type: "iframe",
          src: embedUrl,
          orientation: "landscape",
        };
      }
    }
  } catch {
    return null;
  }

  return null;
};

export const ShopCategory = component$<ShopCategoryProps>(({ items }) => {
  useStylesScoped$(SHOP_CATEGORY_STYLES);

  const activeTab = useSignal<"products" | "collections" | "posts">("products");
  const activeCollection = useSignal<string | null>(null);
  const activeVideo = useSignal<string | null>(null);

  const collections = useComputed$(() => {
    const grouped = new Map<string, ShopLinkItem[]>();
    for (const item of items) {
      const collectionName = extractCollectionName(item.link);
      if (!collectionName) {
        continue;
      }
      const existing = grouped.get(collectionName) ?? [];
      existing.push(item);
      grouped.set(collectionName, existing);
    }
    return Array.from(grouped.entries()).map(([name, collectionItems]) => ({
      name,
      items: collectionItems,
    }));
  });

  const posts = useComputed$(() => {
    const grouped = new Map<string, ShopLinkItem[]>();
    for (const item of items) {
      const videoUrl = extractVideoUrl(item.link);
      if (!videoUrl) {
        continue;
      }
      const existing = grouped.get(videoUrl) ?? [];
      existing.push(item);
      grouped.set(videoUrl, existing);
    }
    return Array.from(grouped.entries()).map(([videoUrl, postItems]) => ({
      videoUrl,
      items: postItems,
    }));
  });

  const openCollection$ = $((name: string) => {
    activeCollection.value = name;
  });

  const closeCollection$ = $(() => {
    activeCollection.value = null;
  });

  const openVideo$ = $((videoUrl: string) => {
    activeVideo.value = videoUrl;
  });

  const closeVideo$ = $(() => {
    activeVideo.value = null;
  });

  const activeCollectionItems = useComputed$(() => {
    if (!activeCollection.value) {
      return [] as ShopLinkItem[];
    }
    return collections.value.find((group) => group.name === activeCollection.value)?.items ?? [];
  });

  const activeVideoItems = useComputed$(() => {
    if (!activeVideo.value) {
      return [] as ShopLinkItem[];
    }
    return posts.value.find((group) => group.videoUrl === activeVideo.value)?.items ?? [];
  });

  const activeVideoTitle = useComputed$(() => {
    if (activeVideoItems.value.length === 0) {
      return null;
    }
    for (const item of activeVideoItems.value) {
      const collectionName = extractCollectionName(item.link);
      if (collectionName) {
        return collectionName;
      }
      const title = sanitizeText((item.link as Record<string, unknown>)?.title);
      if (title) {
        return title;
      }
    }
    return null;
  });

  return (
    <div class="shop-category">
      <div class="shop-category__tabs">
        {(["products", "collections", "posts"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            class={`shop-category__tab${activeTab.value === tab ? " shop-category__tab--active" : ""}`}
            onClick$={() => {
              activeTab.value = tab;
            }}
          >
                {tab === "products" ? "products" : tab === "collections" ? "collections" : "posts"}
          </button>
        ))}
      </div>

      {activeTab.value === "products" && (
        items.length === 0 ? (
          <div class="shop-category__empty">No products published yet.</div>
        ) : (
          <div class="shop-category__products-grid">
            {items.map((item) => (
              <ShopProductCard
                key={item.key}
                link={item.link}
                href={item.href}
                imageUrl={item.imageUrl}
                onNavigate$={item.onNavigate$}
              />
            ))}
          </div>
        )
      )}

      {activeTab.value === "collections" && (
        collections.value.length === 0 ? (
          <div class="shop-category__empty">No collections available.</div>
        ) : (
          <div class="shop-category__collections-list">
            {collections.value.map((collection) => (
              <button
                key={collection.name}
                type="button"
                class="shop-category__collection-card"
                onClick$={() => openCollection$(collection.name)}
              >
                <div class="shop-category__collection-header">
                  <h3 class="shop-category__collection-title">{collection.name}</h3>
                  <span class="shop-category__collection-count">{collection.items.length} Product{collection.items.length === 1 ? "" : "s"}</span>
                </div>
                <div class="shop-category__collection-images">
                  {collection.items.slice(0, 4).map((item, index) => (
                    <div key={`${collection.name}-${item.key}-${index}`} class="shop-category__collection-image">
                      {item.imageUrl ? (
                        <img
                          src={item.imageUrl}
                          alt={sanitizeText(item.link.title) ?? "Collection item"}
                          loading="lazy"
                          width={200}
                          height={200}
                        />
                      ) : (
                        <span style={`position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${typography.sizes.xs};color:var(--text-secondary);`}>No image</span>
                      )}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {activeTab.value === "posts" && (
        posts.value.length === 0 ? (
          <div class="shop-category__empty">No shoppable posts yet.</div>
        ) : (
          <div class="shop-category__posts-grid">
            {posts.value.map((post) => {
              const presentation = getVideoPresentation(post.videoUrl);
              const posterImage = post.items.find((item) => item.imageUrl)?.imageUrl ?? null;
              const mediaClass = `shop-category__post-media${presentation?.orientation === "portrait" ? " shop-category__post-media--portrait" : ""}`;
              return (
                <button
                  key={post.videoUrl}
                  type="button"
                  class="shop-category__post-card"
                  onClick$={() => openVideo$(post.videoUrl)}
                >
                  <div class={mediaClass}>
                    {presentation ? (
                      presentation.type === "iframe" ? (
                        <iframe src={presentation.src} title="Product video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullscreen />
                      ) : (
                        <video src={presentation.src} poster={posterImage ?? undefined} preload="metadata" muted playsInline />
                      )
                    ) : (
                      <video src={post.videoUrl} poster={posterImage ?? undefined} preload="metadata" muted playsInline />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}

      {activeCollection.value && (
        <div class="shop-category__modal-overlay" onClick$={closeCollection$}>
          <div class="shop-category__modal-content" onClick$={(event) => event.stopPropagation()}>
            <div class="shop-category__modal-header">
              <div class="shop-category__modal-heading">
                <h3 class="shop-category__modal-title">{activeCollection.value}</h3>
                <span class="shop-category__modal-count">{activeCollectionItems.value.length} product{activeCollectionItems.value.length === 1 ? "" : "s"}</span>
              </div>
              <button type="button" class="shop-category__modal-close" onClick$={closeCollection$} aria-label="Close collection">
                ✕
              </button>
            </div>
            <div class="shop-category__modal-grid">
              {activeCollectionItems.value.map((item) => (
                <ShopProductCard
                  key={`${item.key}-collection`}
                  link={item.link}
                  href={item.href}
                  imageUrl={item.imageUrl}
                  onNavigate$={item.onNavigate$}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {activeVideo.value && (
        <div class="shop-category__modal-overlay" onClick$={closeVideo$}>
          <div class="shop-category__modal-content" onClick$={(event) => event.stopPropagation()}>
            <div class="shop-category__modal-header">
              <div class="shop-category__modal-heading">
                <h3 class="shop-category__modal-title">{activeVideoTitle.value ?? "Collection Name"}</h3>
                <span class="shop-category__modal-count">{activeVideoItems.value.length} product{activeVideoItems.value.length === 1 ? "" : "s"}</span>
              </div>
              <button type="button" class="shop-category__modal-close" onClick$={closeVideo$} aria-label="Close video">
                ✕
              </button>
            </div>
            <div class="shop-category__modal-body">
              {(() => {
                const presentation = getVideoPresentation(activeVideo.value!);
                const posterImage = activeVideoItems.value.find((item) => item.imageUrl)?.imageUrl ?? undefined;
                const modalVideoClass = `shop-category__modal-video${presentation?.orientation === "portrait" ? " shop-category__modal-video--portrait" : ""}`;
                if (presentation) {
                  return (
                    <div class={modalVideoClass}>
                      {presentation.type === "iframe" ? (
                        <iframe
                          src={presentation.src}
                          title="Product video"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullscreen
                        />
                      ) : (
                        <video src={presentation.src} controls poster={posterImage} />
                      )}
                    </div>
                  );
                }
                return (
                  <div class="shop-category__modal-video">
                    <video src={activeVideo.value!} controls poster={posterImage} />
                  </div>
                );
              })()}
              <div class="shop-category__modal-grid">
                {activeVideoItems.value.map((item) => (
                  <ShopProductCard
                    key={`${item.key}-video`}
                    link={item.link}
                    href={item.href}
                    imageUrl={item.imageUrl}
                    onNavigate$={item.onNavigate$}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

export default ShopCategory;

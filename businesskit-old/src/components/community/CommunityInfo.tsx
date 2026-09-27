/**
 * CommunityInfo.tsx
 * Left-panel for the community About/public page.
 * Shows: media slider, meta badges, description.
 */
import { component$, useSignal, $ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { spacing, borderRadius, typography, transitions, shadows } = designSystem;

export interface MediaItem {
  type: "image" | "video";
  url: string;
}

export interface CommunityInfoProps {
  title: string;
  mediaItems: MediaItem[];           // parsed from community.mediaItems
  isPublic: boolean;
  memberCount: number;
  accessType: "free" | "paid" | "invite_only" | "application";
  priceCents?: number;
  currency?: string;
  creatorName?: string | null;
  creatorAvatarUrl?: string | null;
  creatorProfileId?: string | null;
  description?: string | null;
  slug: string;
  isMember?: boolean;
  onJoin$?: any; // or QRL<() => void>
  showInvite?: boolean;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k`;
  return String(n);
}

function accessLabel(type: string, priceCents?: number, currency?: string): string {
  if (type === "free") return "Free";
  if (type === "paid") {
    if (!priceCents) return "Paid";
    const amount = (priceCents / 100).toFixed(0);
    const sym = currency?.toUpperCase() === "USD" ? "$" : currency ?? "$";
    return `${sym}${amount}/mo`;
  }
  if (type === "invite_only") return "Invite Only";
  return "Application";
}

function isVideoUrl(url: string): boolean {
  return /youtube\.com|youtu\.be|vimeo\.com|\.mp4|\.webm|\.mov/i.test(url);
}

function getYouTubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&?/]+)/);
  return m ? m[1] : null;
}

function getYouTubeThumbnail(url: string): string | null {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/hqdefault.jpg` : null;
}

export const CommunityInfo = component$<CommunityInfoProps>((props) => {
  const activeIdx = useSignal(0);
  const playing   = useSignal(false);

  const items = props.mediaItems.length > 0 ? props.mediaItems : [];
  const active = items[activeIdx.value];

  const isVideo = active ? (active.type === "video" || isVideoUrl(active.url)) : false;
  const ytId    = active && isVideoUrl(active.url) ? getYouTubeId(active.url) : null;
  const thumb   = ytId ? getYouTubeThumbnail(active.url) : null;

  const selectSlide = $((idx: number) => {
    activeIdx.value = idx;
    playing.value = false;
  });

  return (
    <div style={{
      width: "18.75rem",
      display: "flex", flexDirection: "column",
      fontFamily: typography.fontFamily,
      background: "var(--surface-2)",
      border: "1px solid var(--border)",
      borderRadius: borderRadius.lg,
      boxShadow: shadows.sm,
      overflow: "hidden",
    }}>
      {/* Main media area (touches edges) */}
      {items.length > 0 && (
        <div style={{
          width: "100%", aspectRatio: "16/9",
          background: "var(--surface-3)",
          position: "relative", cursor: isVideo && !playing.value ? "pointer" : "default",
        }}
          onClick$={() => { if (isVideo && !playing.value) playing.value = true; }}
        >
          {isVideo ? (
            playing.value && ytId ? (
              <iframe
                src={`https://www.youtube.com/embed/${ytId}?autoplay=1`}
                style={{ width: "100%", height: "100%", border: "none" }}
                allow="autoplay; fullscreen"
              />
            ) : playing.value && !ytId ? (
              <video
                src={active.url} autoplay controls
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <>
                {thumb
                  ? <img src={thumb} alt="" width={800} height={450} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", background: "#000" }} />
                }
                {/* Play button */}
                <div style={{
                  position: "absolute", inset: 0, display: "flex",
                  alignItems: "center", justifyContent: "center",
                  background: "rgba(0,0,0,0.25)",
                }}>
                  <div style={{
                    width: "64px", height: "64px", borderRadius: "50%",
                    background: "rgba(255,255,255,0.95)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
                  }}>
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="var(--text-primary)">
                      <path d="M5 3l14 9-14 9V3z" />
                    </svg>
                  </div>
                </div>
              </>
            )
          ) : (
            <img src={active.url} alt="" width={800} height={450} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          )}
        </div>
      )}

      {/* Body content with padding */}
      <div class="comm-info-body" style={{ display: "flex", flexDirection: "column" }}>
        {/* Thumbnail strip (if >1 item) */}
        {items.length > 1 && (
          <div style={{
            display: "flex", gap: spacing.xs,
            overflowX: "auto", paddingBottom: "2px",
          }}>
            {items.map((item, idx) => {
              const tIsVideo = item.type === "video" || isVideoUrl(item.url);
              const tThumb = tIsVideo ? getYouTubeThumbnail(item.url) : item.url;
              return (
                <div
                  key={idx}
                  onClick$={() => selectSlide(idx)}
                  style={{
                    width: "80px", flexShrink: 0, aspectRatio: "16/9",
                    borderRadius: borderRadius.md, overflow: "hidden",
                    cursor: "pointer", position: "relative",
                    border: idx === activeIdx.value
                      ? "2px solid var(--text-primary)"
                      : "2px solid var(--border)",
                    transition: `border-color ${transitions.fast}`,
                    background: "var(--surface-3)",
                  }}
                >
                  {tThumb
                    ? <img src={tThumb} alt="" width={80} height={45} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <div style={{ width: "100%", height: "100%", background: "var(--surface-3)" }} />
                  }
                  {tIsVideo && (
                    <div style={{
                      position: "absolute", inset: 0, display: "flex",
                      alignItems: "center", justifyContent: "center",
                      background: "rgba(0,0,0,0.3)",
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff">
                        <path d="M5 3l14 9-14 9V3z" />
                      </svg>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Meta badges */}
        <div class="comm-meta-badges">
          {/* Public / Private */}
          <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span style={{ fontSize: typography.sizes.sm, color: "var(--text-secondary)", fontWeight: typography.weights.medium }}>
              {props.isPublic ? "Public" : "Private"}
            </span>
          </div>

          {/* Member count */}
          <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
              <circle cx="9" cy="7" r="4"/>
              <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
              <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span style={{ fontSize: typography.sizes.sm, color: "var(--text-secondary)", fontWeight: typography.weights.medium }}>
              {formatCount(props.memberCount)} members
            </span>
          </div>

          {/* Access / Price */}
          <div style={{ display: "flex", alignItems: "center", gap: spacing.xs }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
              <line x1="7" y1="7" x2="7.01" y2="7"/>
            </svg>
            <span style={{ fontSize: typography.sizes.sm, color: "var(--text-secondary)", fontWeight: typography.weights.medium }}>
              {accessLabel(props.accessType, props.priceCents, props.currency)}
            </span>
          </div>

          {/* Creator */}
          {props.creatorProfileId && (
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <div style={{
                width: "2rem", height: "2rem", borderRadius: "50%",
                overflow: "hidden", background: "var(--surface-3)",
                flexShrink: 0,
              }}>
                {props.creatorAvatarUrl
                  ? <img src={props.creatorAvatarUrl} alt="" width={32} height={32} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "var(--text-secondary)", fontWeight: "700" }}>
                      {(props.creatorName || props.creatorProfileId)[0].toUpperCase()}
                    </div>
                }
              </div>
              <span style={{ fontSize: typography.sizes.sm, color: "var(--text-primary)", fontWeight: "bold" }}>
                By {props.creatorName || props.creatorProfileId}
              </span>
            </div>
          )}
        </div>

        {/* Join button above description (Mobile Only) */}
        {props.showInvite !== false && (
          <div class="comm-mobile-join">
            <button
              onClick$={props.onJoin$}
              style={{
                width: "100%", height: "3rem", padding: "0 1rem",
                borderRadius: borderRadius.md,
                border: props.isMember ? "1.5px solid var(--button-secondary-border)" : "none",
                background: props.isMember ? "var(--button-secondary-background)" : "var(--button-primary-background)",
                color: props.isMember ? "var(--button-secondary-text)" : "var(--button-primary-text)",
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
          </div>
        )}

        {/* Description */}
        {props.description && (
          <p style={{
            fontSize: typography.sizes.base, color: "var(--text-primary)",
            lineHeight: "1.7", margin: 0,
          }}>
            {props.description}
          </p>
        )}
      </div>
    </div>
  );
});

import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { LuFacebook, LuGithub, LuInstagram, LuYoutube, LuGlobe } from "@qwikest/icons/lucide";
import { designSystem } from "~/lib/design-system";

const { typography } = designSystem;

const TESTIMONIALS_CARD_STYLES = `
  .testimonials-card {
    position: relative;
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background-color: var(--surface-2);
    width: 100%;
    box-sizing: border-box;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .testimonials-card__media-wrap {
    position: relative;
    width: calc(100% + 2rem);
    margin: -1rem -1rem 0;
    border-radius: 0.75rem 0.75rem 0 0;
    overflow: hidden;
    background: #000;
  }

  .testimonials-card__media {
    width: 100%;
    aspect-ratio: 16 / 9;
    object-fit: cover;
    display: block;
    border: 0;
  }

  .testimonials-card__media-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: flex-end;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.1));
    padding: 1rem;
    box-sizing: border-box;
    pointer-events: none;
    transition: opacity 0.2s ease;
  }

  .testimonials-card__media-wrap:hover .testimonials-card__media-overlay {
    opacity: 0;
  }

  .testimonials-card__media-meta {
    width: auto;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    gap: 0.375rem;
  }

  .testimonials-card__media-top {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.375rem;
  }

  .testimonials-card__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .testimonials-card__avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 9999px;
    object-fit: cover;
    flex-shrink: 0;
  }

  .testimonials-card__identity {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .testimonials-card__name {
    margin: 0;
    font-size: 1rem;
    font-weight: ${typography.weights.medium};
    color: var(--text-primary);
    line-height: 1.4;
  }

  .testimonials-card__name.on-media,
  .testimonials-card__meta.on-media {
    color: #fff;
  }

  .testimonials-card__meta {
    margin: 0;
    font-size: 0.875rem;
    font-weight: ${typography.weights.regular};
    color: var(--text-secondary);
    line-height: 1.4;
  }

  .testimonials-card__header-right {
    margin-left: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
  }

  .testimonials-card__platform-icon {
    width: 1.25rem;
    height: 1.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--text-secondary);
  }

  .testimonials-card__platform-badge {
    position: absolute;
    top: 1rem;
    right: 1rem;
    z-index: 3;
  }

  .testimonials-card__platform-badge.on-media {
    top: 1rem;
    right: 1rem;
    color: #fff;
  }

  .testimonials-card__platform-icon.on-media {
    color: #fff;
  }

  .testimonials-card__platform-icon svg {
    width: 1.25rem;
    height: 1.25rem;
    display: block;
  }

  .testimonials-card__rating {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
  }

  .testimonials-card__rating.on-media {
    gap: 0;
  }

  .testimonials-card__star {
    width: 1.25rem;
    height: 1.25rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .testimonials-card__star svg {
    width: 1.25rem;
    height: 1.25rem;
  }

  .testimonials-card__star.on-media {
    width: 0.7rem;
    height: 0.7rem;
  }

  .testimonials-card__star.on-media svg {
    width: 0.7rem;
    height: 0.7rem;
  }

  .testimonials-card__quote {
    margin: 0;
    font-size: 1rem;
    font-weight: ${typography.weights.regular};
    color: var(--text-primary);
    line-height: 1.6;
  }

  .testimonials-card__link {
    font-size: 0.875rem;
    color: var(--text-secondary);
    text-decoration: none;
  }
`;

const ICON_SIZE = 20;

const TwitterIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
  </svg>
);

const LinkedInIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
  </svg>
);

const GoogleIcon = () => (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12.48 10.92v3.28h7.84c-.24 1.84-.853 3.187-1.787 4.133-1.147 1.147-2.933 2.4-6.053 2.4-4.827 0-8.6-3.893-8.6-8.72s3.773-8.72 8.6-8.72c2.6 0 4.507 1.027 5.907 2.347l2.307-2.307C18.747 1.44 15.907 0 12.48 0 5.867 0 .307 5.387.307 12s5.56 12 12.173 12c3.573 0 6.267-1.173 8.373-3.36 2.16-2.16 2.84-5.213 2.84-7.667 0-.76-.053-1.467-.173-2.053H12.48z" />
  </svg>
);

export interface TestimonialsCardProps {
  name?: string;
  role?: string;
  platform?: string;
  url?: string;
  linkUrl?: string;
  quote?: string;
  avatarUrl?: string;
  rating?: number | string;
  mediaUrl?: string;
  embedCode?: string;
  editableKeyPrefix?: string;
  editable?: boolean;
  itemData?: any;
  sectionData?: any;
}

export const TestimonialsCard = component$<TestimonialsCardProps>((props) => {
  useStylesScoped$(TESTIMONIALS_CARD_STYLES);

  const getYouTubeId = (url: string) => {
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\s]+)/,
      /youtube\.com\/watch\?.*v=([^&\s]+)/,
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  };

  const isLikelyVideoUrl = (url: string) => /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);

  const parsedRating = Number(props.rating ?? 0);
  const normalizedRating = Number.isFinite(parsedRating) ? Math.min(5, Math.max(1, Math.round(parsedRating))) : 0;
  const mediaUrl = props.mediaUrl?.trim() ?? "";
  const hasMedia = mediaUrl.length > 0;
  const youtubeId = hasMedia ? getYouTubeId(mediaUrl) : null;
  const targetUrl = props.url || props.linkUrl || props.itemData?.url || props.itemData?.linkUrl;

  // Shared colors derived from sectionData / itemData
  const cardBg = props.itemData?.cardBgColor || props.sectionData?.cardBgColor || 'var(--surface-2)';
  const nameClr = props.itemData?.nameColor || props.sectionData?.nameColor || 'var(--text-primary)';
  const roleClr = props.itemData?.roleColor || props.sectionData?.roleColor || 'var(--text-secondary)';
  const quoteClr = props.itemData?.quoteColor || props.sectionData?.quoteColor || 'var(--text-primary)';
  const iconClr = props.itemData?.iconColor || props.sectionData?.iconColor || (hasMedia ? '#FFFFFF' : 'var(--text-secondary)');

  const platformIcon = (() => {
    const platform = (props.platform ?? "").toLowerCase().trim();
    if (!platform) return null;
    if (platform === "twitter" || platform === "x") {
      return <TwitterIcon />;
    }
    if (platform === "linkedin") {
      return <LinkedInIcon />;
    }
    if (platform === "instagram") {
      return <LuInstagram style={{ stroke: "currentColor" }} width={20} height={20} stroke-width={1.8} />;
    }
    if (platform === "tiktok") {
      return <svg viewBox="0 0 640 640" fill="currentColor" width="20" height="20"><path d="M544.5 273.9C500.5 274 457.5 260.3 421.7 234.7L421.7 413.4C421.7 446.5 411.6 478.8 392.7 506C373.8 533.2 347.1 554 316.1 565.6C285.1 577.2 251.3 579.1 219.2 570.9C187.1 562.7 158.3 545 136.5 520.1C114.7 495.2 101.2 464.1 97.5 431.2C93.8 398.3 100.4 365.1 116.1 336C131.8 306.9 156.1 283.3 185.7 268.3C215.3 253.3 248.6 247.8 281.4 252.3L281.4 342.2C266.4 337.5 250.3 337.6 235.4 342.6C220.5 347.6 207.5 357.2 198.4 369.9C189.3 382.6 184.4 398 184.5 413.8C184.6 429.6 189.7 444.8 199 457.5C208.3 470.2 221.4 479.6 236.4 484.4C251.4 489.2 267.5 489.2 282.4 484.3C297.3 479.4 310.4 469.9 319.6 457.2C328.8 444.5 333.8 429.1 333.8 413.4L333.8 64L421.8 64C421.7 71.4 422.4 78.9 423.7 86.2C426.8 102.5 433.1 118.1 442.4 131.9C451.7 145.7 463.7 157.5 477.6 166.5C497.5 179.6 520.8 186.6 544.6 186.6L544.6 274z"/></svg>;
    }
    if (platform === "youtube") {
      return <LuYoutube style={{ stroke: "currentColor" }} width={20} height={20} stroke-width={1.8} />;
    }
    if (platform === "facebook") {
      return <LuFacebook style={{ stroke: "currentColor" }} width={20} height={20} stroke-width={1.8} />;
    }
    if (platform === "github") {
      return <LuGithub style={{ stroke: "currentColor" }} width={20} height={20} stroke-width={1.8} />;
    }
    if (platform === "pinterest") {
      return <svg viewBox="0 0 640 640" fill="currentColor" width="20" height="20"><path d="M568 320C568 457 457 568 320 568C294.4 568 269.8 564.1 246.6 556.9C256.7 540.4 271.8 513.4 277.4 491.9C280.4 480.3 292.8 432.9 292.8 432.9C300.9 448.3 324.5 461.4 349.6 461.4C424.4 461.4 478.3 392.6 478.3 307.1C478.3 225.2 411.4 163.9 325.4 163.9C218.4 163.9 161.5 235.7 161.5 314C161.5 350.4 180.9 395.7 211.8 410.1C216.5 412.3 219 411.3 220.1 406.8C220.9 403.4 225.1 386.5 227 378.7C227.6 376.2 227.3 374 225.3 371.6C215.2 359.1 207 336.3 207 315C207 260.3 248.4 207.4 319 207.4C379.9 207.4 422.6 248.9 422.6 308.3C422.6 375.4 388.7 421.9 344.6 421.9C320.3 421.9 302 401.8 307.9 377.1C314.9 347.6 328.4 315.8 328.4 294.5C328.4 275.5 318.2 259.6 297 259.6C272.1 259.6 252.1 285.3 252.1 319.8C252.1 341.8 259.5 356.6 259.5 356.6C259.5 356.6 235 460.4 230.5 479.8C225.5 501.2 227.5 531.4 229.6 551C137.4 514.9 72 425.1 72 320C72 183 183 72 320 72C457 72 568 183 568 320z"/></svg>;
    }
    if (platform === "google") {
      return <GoogleIcon />;
    }
    return <LuGlobe width={20} height={20} />;
  })();

  return (
    <div
      class="testimonials-card"
      data-element-type={props.editable ? "box" : undefined}
      data-color-field="cardBgColor"
      data-current-color={cardBg}
      data-default-bg="var(--surface-2)"
      style={`background-color: ${cardBg};`}
    >
      {platformIcon && (
        targetUrl ? (
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            class={`testimonials-card__platform-icon testimonials-card__platform-badge ${hasMedia ? "on-media" : ""}`}
            aria-label={props.platform}
            data-field="icon"
            data-default-color={hasMedia ? "#FFFFFF" : "var(--text-secondary)"}
            onClick$={(e) => props.editable && e.preventDefault()}
            style={`color: ${iconClr}; text-decoration: none; cursor: ${props.editable ? 'text' : 'pointer'};`}
          >
            {platformIcon}
          </a>
        ) : (
          <span
            class={`testimonials-card__platform-icon testimonials-card__platform-badge ${hasMedia ? "on-media" : ""}`}
            aria-label={props.platform}
            data-field="icon"
            data-default-color={hasMedia ? "#FFFFFF" : "var(--text-secondary)"}
            style={`color: ${iconClr}; cursor: ${props.editable ? 'text' : 'default'};`}
          >
            {platformIcon}
          </span>
        )
      )}
      
      {hasMedia ? (
        <div class="testimonials-card__media-wrap">
          {youtubeId ? (
            <iframe
              src={`https://www.youtube.com/embed/${youtubeId}`}
              title="Testimonial video"
              frameBorder="0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullscreen
              class="testimonials-card__media"
            />
          ) : isLikelyVideoUrl(mediaUrl) ? (
            <video
              muted
              loop
              playsInline
              preload="metadata"
              class="testimonials-card__media"
              onMouseEnter$={(event) => {
                const video = event.currentTarget as HTMLVideoElement;
                video.play().catch(() => undefined);
              }}
              onMouseLeave$={(event) => {
                const video = event.currentTarget as HTMLVideoElement;
                video.pause();
                video.currentTime = 0;
              }}
            >
              <source src={mediaUrl} />
            </video>
          ) : (
            <img 
              data-field={props.editableKeyPrefix ? `${props.editableKeyPrefix}.mediaUrl` : undefined} 
              data-element-type="image"
              src={mediaUrl} 
              alt={props.name ?? "Testimonial media"} 
              class="testimonials-card__media" 
              width={640} 
              height={360} 
              style={props.editable ? 'cursor: pointer;' : ''}
            />
          )}
          <div class="testimonials-card__media-overlay">
            <div class="testimonials-card__media-meta">
              <div class="testimonials-card__media-top">
                {normalizedRating > 0 && (
                  <div class="testimonials-card__rating on-media" aria-label={`Rating ${normalizedRating} out of 5`}>
                    {Array.from({ length: 5 }).map((_, index) => (
                      <span key={`star-media-${index}`} class="testimonials-card__star on-media">
                        <svg viewBox="0 0 24 24" fill={index < normalizedRating ? "#FBBF23" : "transparent"} stroke="#d28a3e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">
                          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                        </svg>
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div style={`display:flex; flex-direction:column; gap:0.125rem;`}>
                {props.name && (
                  <p
                    class="testimonials-card__name on-media"
                    data-field={props.editableKeyPrefix ? `${props.editableKeyPrefix}.name` : "name"}
                    contentEditable={props.editable ? "true" : undefined}
                    data-default-color="#FFFFFF"
                    style={`color: ${nameClr}; cursor: ${props.editable ? 'text' : 'default'};`}
                  >
                    {props.name}
                  </p>
                )}
                {props.role && (
                  <p
                    class="testimonials-card__meta on-media"
                    data-field={props.editableKeyPrefix ? `${props.editableKeyPrefix}.role` : "role"}
                    contentEditable={props.editable ? "true" : undefined}
                    data-default-color="rgba(255,255,255,0.8)"
                    style={`color: ${roleClr}; cursor: ${props.editable ? 'text' : 'default'};`}
                  >
                    {props.role}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div class="testimonials-card__header">
          {props.avatarUrl && (
            <img
              class="testimonials-card__avatar"
              src={props.avatarUrl}
              alt={props.name ?? "Avatar"}
              width={40}
              height={40}
              data-field={props.editableKeyPrefix ? `${props.editableKeyPrefix}.avatarUrl` : undefined}
              data-element-type="image"
              style={props.editable ? 'cursor: pointer;' : ''}
            />
          )}
          <div class="testimonials-card__identity">
            {props.name && (
              <p
                class="testimonials-card__name"
                data-field={props.editableKeyPrefix ? `${props.editableKeyPrefix}.name` : "name"}
                contentEditable={props.editable ? "true" : undefined}
                data-default-color="var(--text-primary)"
                style={`color: ${nameClr}; cursor: ${props.editable ? 'text' : 'default'};`}
              >
                {props.name}
              </p>
            )}
            {props.role && (
              <p
                class="testimonials-card__meta"
                data-field={props.editableKeyPrefix ? `${props.editableKeyPrefix}.role` : "role"}
                contentEditable={props.editable ? "true" : undefined}
                data-default-color="var(--text-secondary)"
                style={`color: ${roleClr}; cursor: ${props.editable ? 'text' : 'default'};`}
              >
                {props.role}
              </p>
            )}
          </div>
          <div class="testimonials-card__header-right" />
        </div>
      )}
      {!hasMedia && normalizedRating > 0 && (
        <div class="testimonials-card__rating" aria-label={`Rating ${normalizedRating} out of 5`}>
          {Array.from({ length: 5 }).map((_, index) => (
            <span key={`star-top-${index}`} class="testimonials-card__star">
              <svg viewBox="0 0 24 24" fill={index < normalizedRating ? "#FBBF23" : "transparent"} stroke="#d28a3e" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            </span>
          ))}
        </div>
      )}
      {props.quote && (
        <p
          class="testimonials-card__quote"
          data-field={props.editableKeyPrefix ? `${props.editableKeyPrefix}.quote` : "quote"}
          contentEditable={props.editable ? "true" : undefined}
          data-default-color="var(--text-primary)"
          style={`color: ${quoteClr}; cursor: ${props.editable ? 'text' : 'default'};`}
        >
          {props.quote}
        </p>
      )}
      {props.embedCode && <div dangerouslySetInnerHTML={props.embedCode} />}
    </div>
  );
});

export default TestimonialsCard;

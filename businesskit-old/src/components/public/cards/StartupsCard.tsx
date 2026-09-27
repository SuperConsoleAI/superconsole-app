import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, shadows } = designSystem;

const CARD_RADIUS = "0.5rem";
const IMAGE_RADIUS = "0.325rem";
const LOGO_SIZE = "2rem";
const LOGO_RADIUS = "0.25rem";

const STARTUPS_CARD_STYLES = `
  .startups-card {
    display: flex;
    flex-direction: column;
    padding: 1rem;
    border-radius: ${CARD_RADIUS};
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
    min-width: 0;
    width: 100%;
    box-sizing: border-box;
    overflow: hidden;
  }
  
  @media (max-width: 768px) {
    .startups-card {
      padding: 0.75rem;
    }
  }

  .startups-card:hover,
  .startups-card:focus-visible {
    outline: none;
  }

  .startups-card__top {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1rem;
    min-width: 0;
    width: 100%;
  }

  .startups-card__header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
    width: 100%;
  }

  .startups-card__logo {
    width: ${LOGO_SIZE};
    height: ${LOGO_SIZE};
    flex-shrink: 0;
    overflow: hidden;
    border-radius: ${LOGO_RADIUS};
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .startups-card__logo img {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .startups-card__logo-placeholder {
    width: ${LOGO_SIZE};
    height: ${LOGO_SIZE};
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
    font-weight: ${typography.weights.semibold};
  }

  .startups-card__title {
    margin: 0;
    font-size: 1rem;
    font-weight: ${typography.weights.semibold};
    line-height: 1.3;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .startups-card__description {
    margin: 0;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    line-height: 1.4;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    text-overflow: ellipsis;
    word-break: break-word;
    overflow-wrap: break-word;
  }

  .startups-card__bottom {
    position: relative;
    width: 100%;
    padding-bottom: 45%;
    border-radius: ${IMAGE_RADIUS};
    overflow: hidden;
    background-color: var(--surface-3);
    flex-shrink: 0;
  }

  .startups-card__bottom img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .startups-card__image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }
`;

interface StartupsCardProps {
  link: PageSettingsLinkItem;
  href: string;
  imageUrl: string | null;
  logoUrl: string | null;
  onNavigate$?: PropFunction<() => void>;
}

const sanitizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const StartupsCard = component$<StartupsCardProps>(({ link, href, imageUrl, logoUrl, onNavigate$ }) => {
  useStylesScoped$(STARTUPS_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled startup";
  const description = sanitizeText(link.description);
  const logoInitial = title.charAt(0).toUpperCase();
  const hasLogo = logoUrl && typeof logoUrl === 'string' && logoUrl.trim().length > 0;

  return (
    <a
      class="startups-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      <div class="startups-card__top">
        <div class="startups-card__header">
          <div class="startups-card__logo">
            {hasLogo ? (
              <img src={logoUrl} alt={`${title} logo`} loading="lazy" width="28" height="28" />
            ) : (
              <span class="startups-card__logo-placeholder">{logoInitial}</span>
            )}
          </div>
          <h3 class="startups-card__title">{title}</h3>
        </div>
        {description && <p class="startups-card__description">{description}</p>}
      </div>
      <div class="startups-card__bottom">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width="320" height="166" />
        ) : (
          <span class="startups-card__image-placeholder">No image</span>
        )}
      </div>
    </a>
  );
});

export default StartupsCard;

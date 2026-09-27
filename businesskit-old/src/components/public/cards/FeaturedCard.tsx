import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, shadows } = designSystem;

const CARD_RADIUS = "0.5rem";
const IMAGE_RADIUS = "0.325rem";

const FEATURED_CARD_STYLES = `
  .featured-card {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    padding: 0.75rem;
    border-radius: ${CARD_RADIUS};
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
  }

  .featured-card:hover,
  .featured-card:focus-visible {
    outline: none;
  }

  .featured-card__logo-wrap {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .featured-card__logo {
    height: 2rem;
    width: auto;
    object-fit: contain;
  }

  .featured-card__logo-placeholder {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.semibold};
    color: var(--text-secondary);
  }

  .featured-card__content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .featured-card__title {
    margin: 0;
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.semibold};
    line-height: 1.3;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .featured-card__description {
    margin: 0;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .featured-card__image-wrap {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%;
    border-radius: ${IMAGE_RADIUS};
    overflow: hidden;
    background-color: var(--surface-3);
  }

  .featured-card__image-wrap img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .featured-card__image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

  .featured-card__button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.25rem 0.6rem;
    border-radius: 0.5rem;
    background-color: var(--card-button-bg, var(--button-primary-bg, var(--text-primary)));
    color: var(--text-primary);
    font-size: ${typography.sizes.xs};
    font-weight: ${typography.weights.medium};
    min-width: 3.5rem;
    align-self: flex-start;
  }
`;

interface FeaturedCardProps {
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

export const FeaturedCard = component$<FeaturedCardProps>(({ link, href, imageUrl, logoUrl, onNavigate$ }) => {
  useStylesScoped$(FEATURED_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled feature";
  const description = sanitizeText(link.description);
  const buttonLabel = sanitizeText(link.button_text);
  const hasLogo = logoUrl && typeof logoUrl === 'string' && logoUrl.trim().length > 0;
  const logoInitial = title.charAt(0).toUpperCase();

  return (
    <a
      class="featured-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      <div class="featured-card__image-wrap">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width="320" height="180" />
        ) : (
          <span class="featured-card__image-placeholder">No image</span>
        )}
      </div>
      <div class="featured-card__content">
        <h3 class="featured-card__title">{title}</h3>
        {description && <p class="featured-card__description">{description}</p>}
        {buttonLabel && <span class="featured-card__button">{buttonLabel}</span>}
      </div>
      <div class="featured-card__logo-wrap">
        {hasLogo ? (
          <img src={logoUrl} alt={`${title} logo`} loading="lazy" class="featured-card__logo" width="48" height="48" />
        ) : (
          <span class="featured-card__logo-placeholder">{logoInitial}</span>
        )}
      </div>
    </a>
  );
});

export default FeaturedCard;

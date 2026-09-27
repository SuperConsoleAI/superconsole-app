import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, spacing, shadows } = designSystem;

const GEARS_CARD_STYLES = `
  .gears-card {
    display: flex;
    flex-direction: column;
    gap: ${spacing.sm};
    padding: ${spacing.sm};
    border-radius: 1.5rem;
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
    transition: box-shadow ${designSystem.transitions.fast}, transform ${designSystem.transitions.fast};
  }

  .gears-card:hover,
  .gears-card:focus-visible {
    outline: none;
    box-shadow: ${shadows.md};
    transform: translateY(-2px);
  }

  .gears-card__image-wrap {
    position: relative;
    width: 100%;
    padding-bottom: 66.6667%;
    border-radius: 1rem;
    background-color: #d9d9d9;
    overflow: hidden;
  }

  .gears-card__image-wrap img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .gears-card__image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

  .gears-card__content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-width: 0;
    padding: 0 ${spacing.xs};
  }

  .gears-card__copy {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
  }

  .gears-card__title {
    margin: 0;
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.medium};
    line-height: 1.3;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
  }

  .gears-card__price-row {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .gears-card__sale-price {
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
  }

  .gears-card__price {
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    text-decoration: line-through;
  }

  .gears-card__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
  }

  .gears-card__spacer {
    opacity: 0.6;
  }

  .gears-card__cta {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .gears-card__button {
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
  }

  .gears-card__button:empty {
    display: none;
  }
`;

interface GearsCardProps {
  link: PageSettingsLinkItem;
  href: string;
  imageUrl: string | null;
  onNavigate$?: PropFunction<() => void>;
}

const sanitizeText = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const GearsCard = component$<GearsCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(GEARS_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled gear";
  const salePrice = sanitizeText(link.sale_price);
  const price = sanitizeText(link.price);
  const buttonLabel = sanitizeText(link.button_text);
  const location = sanitizeText(link.location);
  const date = sanitizeText(link.date);
  const showPriceRow = Boolean(salePrice || price);
  const showMeta = Boolean(location || date);

  return (
    <a
      class="gears-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      <div class="gears-card__image-wrap">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width="320" height="213" />
        ) : (
          <span class="gears-card__image-placeholder">No image</span>
        )}
      </div>
      <div class="gears-card__content">
        <div class="gears-card__copy">
          <h3 class="gears-card__title">{title}</h3>
          {showMeta && (
            <div class="gears-card__meta">
              {location && <span>{location}</span>}
              {location && date && <span class="gears-card__spacer">•</span>}
              {date && <span>{date}</span>}
            </div>
          )}
        </div>
        <div class="gears-card__cta">
          {showPriceRow && (
            <div class="gears-card__price-row">
              {salePrice && <span class="gears-card__sale-price">{salePrice}</span>}
              {price && <span class="gears-card__price">{price}</span>}
            </div>
          )}
          {buttonLabel && <span class="gears-card__button">{buttonLabel}</span>}
        </div>
      </div>
    </a>
  );
});

export default GearsCard;

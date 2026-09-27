import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, spacing, shadows } = designSystem;

const WEARS_CARD_STYLES = `
  .wears-card {
    display: flex;
    flex-direction: column;
    gap: 0.7rem;
    padding: ${spacing.sm};
    border-radius: 1.5rem;
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
  }

  .wears-card__image-wrap {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 5;
    border-radius: 1rem;
    background-color: #d9d9d9;
    overflow: hidden;
  }

  .wears-card__image-wrap img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .wears-card__image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

  .wears-card__content {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: ${spacing.xs};
  }

  .wears-card__title {
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

  .wears-card__price-row {
    display: flex;
    align-items: baseline;
    gap: 0.25rem;
  }

  .wears-card__sale-price {
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
  }

  .wears-card__price {
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    text-decoration: line-through;
  }

  .wears-card__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
  }

  .wears-card__spacer {
    opacity: 0.6;
  }

  .wears-card__button {
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
    margin-top: 0.25rem;
  }
`;

interface WearsCardProps {
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

export const WearsCard = component$<WearsCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(WEARS_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled wear";
  const salePrice = sanitizeText(link.sale_price);
  const price = sanitizeText(link.price);
  const buttonLabel = sanitizeText(link.button_text);
  const location = sanitizeText(link.location);
  const date = sanitizeText(link.date);
  const showPriceRow = Boolean(salePrice || price);
  const showMeta = Boolean(location || date);

  return (
    <a
      class="wears-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      <div class="wears-card__image-wrap">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width="320" height="400" />
        ) : (
          <span class="wears-card__image-placeholder">No image</span>
        )}
      </div>
      <div class="wears-card__content">
        <h3 class="wears-card__title">{title}</h3>
        {showPriceRow && (
          <div class="wears-card__price-row">
            {salePrice && <span class="wears-card__sale-price">{salePrice}</span>}
            {price && <span class="wears-card__price">{price}</span>}
          </div>
        )}
        {showMeta && (
          <div class="wears-card__meta">
            {location && <span>{location}</span>}
            {location && date && <span class="wears-card__spacer">•</span>}
            {date && <span>{date}</span>}
          </div>
        )}
        {buttonLabel && <span class="wears-card__button">{buttonLabel}</span>}
      </div>
    </a>
  );
});

export default WearsCard;

import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, spacing, shadows } = designSystem;

const SHOP_PRODUCT_CARD_STYLES = `
  .shop-product-card {
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
    transition: box-shadow ${designSystem.transitions.fast}, transform ${designSystem.transitions.fast};
  }

  .shop-product-card:hover,
  .shop-product-card:focus-visible {
    outline: none;
    box-shadow: ${shadows.md};
    transform: translateY(-2px);
  }

  .shop-product-card__image {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    border-radius: 1rem;
    background-color: #d9d9d9;
    overflow: hidden;
  }

  .shop-product-card__image img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .shop-product-card__image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

  .shop-product-card__content {
    display: flex;
    flex-direction: column;
    gap: 0;
    padding: ${spacing.xs};
  }

  .shop-product-card__title {
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

  .shop-product-card__price-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }

  .shop-product-card__sale-price {
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
  }

  .shop-product-card__price {
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    text-decoration: line-through;
  }

  .shop-product-card__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.35rem;
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
    margin-top: 0.35rem;
  }

  .shop-product-card__meta-spacer {
    opacity: 0.6;
  }

  .shop-product-card__price-actions {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .shop-product-card__button {
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
`;

interface ShopProductCardProps {
  link: PageSettingsLinkItem;
  href: string;
  imageUrl: string | null;
  onNavigate$?: PropFunction<() => void>;
}

const sanitizeText = (value: unknown): string | null => {
  if (value == null) {
    return null;
  }
  let text: string | null = null;
  if (typeof value === "string") {
    text = value;
  } else if (typeof value === "number" && Number.isFinite(value)) {
    text = String(value);
  }
  if (text == null) {
    return null;
  }
  const trimmed = text.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const ShopProductCard = component$<ShopProductCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(SHOP_PRODUCT_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled product";
  const salePrice = sanitizeText(link.sale_price);
  const price = sanitizeText(link.price);
  const buttonLabel = sanitizeText(link.button_text);
  const location = sanitizeText(link.location);
  const date = sanitizeText(link.date);
  const showPriceRow = Boolean(salePrice || price);
  const showMeta = Boolean(location || date);
  const isExternal = href.startsWith("http");

  return (
    <a
      class="shop-product-card"
      href={href}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      <div class="shop-product-card__image">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width={320} height={320} />
        ) : (
          <span class="shop-product-card__image-placeholder">No image</span>
        )}
      </div>
      <div class="shop-product-card__content">
        <h3 class="shop-product-card__title">{title}</h3>
        {showPriceRow && (
          <div class="shop-product-card__price-row">
            {buttonLabel && <span class="shop-product-card__button">{buttonLabel}</span>}
            <div class="shop-product-card__price-actions">
              {salePrice && <span class="shop-product-card__sale-price">{salePrice}</span>}
              {price && <span class="shop-product-card__price">{price}</span>}
            </div>
          </div>
        )}
        {showMeta && (
          <div class="shop-product-card__meta">
            {location && <span>{location}</span>}
            {location && date && <span class="shop-product-card__meta-spacer">•</span>}
            {date && <span>{date}</span>}
          </div>
        )}
        {!showPriceRow && buttonLabel && <span class="shop-product-card__button">{buttonLabel}</span>}
      </div>
    </a>
  );
});

export default ShopProductCard;

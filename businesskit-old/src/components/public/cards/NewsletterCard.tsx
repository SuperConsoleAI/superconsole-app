import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, borderRadius, shadows } = designSystem;

const NEWSLETTER_CARD_STYLES = `
  .newsletter-card {
    display: flex;
    flex-direction: column;
    padding: 0;
    border-radius: ${borderRadius.lg};
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
    box-sizing: border-box;
    overflow: hidden;
  }

  .newsletter-card:hover,
  .newsletter-card:focus-visible {
    outline: none;
  }

  .newsletter-card__image {
    width: 100%;
    aspect-ratio: 16 / 9;
    background-color: #d9d9d9;
    flex-shrink: 0;
  }

  .newsletter-card__image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .newsletter-card__content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 1rem;
  }

  .newsletter-card__title {
    margin: 0;
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.semibold};
    line-height: 1.25;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .newsletter-card__description {
    margin: 0;
    font-size: ${typography.sizes.xs};
    line-height: 1.5;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

`;

interface NewsletterCardProps {
  link?: PageSettingsLinkItem;
  title?: string;
  excerpt?: string;
  date?: string;
  href: string;
  imageUrl?: string | null;
  onNavigate$?: PropFunction<() => void>;
}

export const NewsletterCard = component$<NewsletterCardProps>(({ link, title, excerpt, date, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(NEWSLETTER_CARD_STYLES);

  const cardTitle = title || link?.title || link?.url || "Newsletter";
  const cardDescription = excerpt || (typeof link?.description === "string" ? link.description : "");
  const trimmedDescription = cardDescription.trim();
  const hasDescription = trimmedDescription.length > 0;
  const hasImage = Boolean(imageUrl);

  return (
    <a
      href={href}
      class="newsletter-card"
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      {hasImage && (
        <div class="newsletter-card__image">
          <img
            src={imageUrl ?? ""}
            alt={cardTitle}
            width={336}
            height={224}
            loading="lazy"
          />
        </div>
      )}
      <div class="newsletter-card__content">
        <h3 class="newsletter-card__title">{cardTitle}</h3>
        {hasDescription && <p class="newsletter-card__description">{trimmedDescription}</p>}
        {date && (
          <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--text-secondary);">
            {date}
          </div>
        )}
      </div>
    </a>
  );
});

export default NewsletterCard;

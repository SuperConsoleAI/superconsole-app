import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, borderRadius, shadows } = designSystem;

const BOOK_CARD_STYLES = `
  .books-card {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 100%;
    max-width: 100%;
    min-width: 0;
    padding: 0.5rem;
    gap: 0.5rem;
    border-radius: ${borderRadius.lg};
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    text-decoration: none;
    color: inherit;
    transition: transform ${designSystem.transitions.fast}, box-shadow ${designSystem.transitions.fast};
    box-sizing: border-box;
    flex: 0 0 auto;
  }

  .books-card:hover,
  .books-card:focus-visible {
    transform: translateY(-2px);
    box-shadow: ${shadows.sm};
    outline: none;
  }

  .books-card__image {
    width: 100%;
    border-radius: ${borderRadius.md};
    overflow: hidden;
    background-color: #d9d9d9;
    aspect-ratio: 208.5 / 312;
    flex-shrink: 0;
  }

  .books-card__image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  .books-card__content {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    width: 100%;
    padding: 0.25rem 0.5rem 0.5rem 0.5rem;
  }

  .books-card__content--no-image {
    padding: 0.5rem;
  }

  .books-card__title {
    margin: 0;
    font-size: ${typography.sizes.sm};
    font-weight: ${typography.weights.semibold};
    line-height: 1.2;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .books-card__description {
    margin: 0;
    font-family: ${typography.fontFamily};
    font-size: ${typography.sizes.xs};
    font-weight: ${typography.weights.regular};
    line-height: 1.4;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
    min-height: calc(1.4em * 2);
  }
`;

interface BooksCardProps {
  link: PageSettingsLinkItem;
  href: string;
  imageUrl: string | null;
  onNavigate$?: PropFunction<() => void>;
}

export const BooksCard = component$<BooksCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(BOOK_CARD_STYLES);

  const hasImage = Boolean(imageUrl);

  return (
    <a
      href={href}
      class="books-card"
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      {hasImage && (
        <div class="books-card__image">
          <img
            src={imageUrl ?? ""}
            alt={link.title ?? link.url ?? "Book cover"}
            width={209}
            height={312}
            loading="lazy"
          />
        </div>
      )}
      <div class={`books-card__content${hasImage ? "" : " books-card__content--no-image"}`}>
        <h3 class="books-card__title">{link.title ?? link.url ?? "Untitled Book"}</h3>
        {link.description && (
          <p class="books-card__description">{link.description}</p>
        )}
      </div>
    </a>
  );
});

export default BooksCard;

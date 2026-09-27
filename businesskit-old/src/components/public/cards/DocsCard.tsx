import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { typography, borderRadius } = designSystem;

const DOCS_CARD_STYLES = `
  .docs-card {
    display: flex;
    flex-direction: column;
    padding: 1.25rem;
    border-radius: ${borderRadius.lg};
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    text-decoration: none;
    color: inherit;
    box-sizing: border-box;
  }

  .docs-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .docs-card__icon {
    font-size: 1.5rem;
    margin-bottom: 0.75rem;
  }

  .docs-card__title {
    margin: 0 0 0.375rem;
    font-size: ${typography.sizes.base};
    font-weight: ${typography.weights.semibold};
    line-height: 1.3;
    color: var(--text-primary);
  }

  .docs-card__description {
    margin: 0;
    font-size: ${typography.sizes.sm};
    line-height: 1.5;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .docs-card__count {
    margin-top: 0.75rem;
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
  }
`;

export interface DocsCardProps {
  title: string;
  description?: string;
  icon?: string;
  articleCount: number;
  href: string;
}

export const DocsCard = component$<DocsCardProps>((props) => {
  useStylesScoped$(DOCS_CARD_STYLES);

  return (
    <a href={props.href} class="docs-card">
      {props.icon && <div class="docs-card__icon">{props.icon}</div>}
      <h3 class="docs-card__title">{props.title}</h3>
      {props.description && <p class="docs-card__description">{props.description}</p>}
      <span class="docs-card__count">
        {props.articleCount} {props.articleCount === 1 ? 'article' : 'articles'}
      </span>
    </a>
  );
});

export default DocsCard;

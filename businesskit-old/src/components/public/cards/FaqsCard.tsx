import { $, component$, useSignal, useStylesScoped$ } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography } = designSystem;

const FAQS_CARD_STYLES = `
  .faqs-card {
    border: 1px solid var(--border);
    border-radius: 0.75rem;
    background-color: var(--surface-2);
    overflow: hidden;
    width: 100%;
    display: block;
  }

  .faqs-card__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 3.25rem;
    padding: 0 0 0 1rem;
    cursor: pointer;
    user-select: none;
    box-sizing: border-box;
  }

  .faqs-card__question {
    display: flex;
    align-items: center;
    gap: 1rem;
    flex: 1;
    overflow: hidden;
  }

  .faqs-card__number {
    font-size: 1rem;
    font-weight: ${typography.weights.medium};
    color: var(--text-secondary);
    flex-shrink: 0;
    transition: opacity 0.5s cubic-bezier(0.4, 0, 0.2, 1), transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .faqs-card.open .faqs-card__number {
    opacity: 0;
    transform: translateX(-16px);
  }

  .faqs-card__title {
    font-size: 1rem;
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
    margin: 0;
    line-height: 1.4;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: transform 0.5s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .faqs-card.open .faqs-card__title {
    transform: translateX(-28px);
  }

  .faqs-card__toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
    font-size: 1.5rem;
    font-weight: 300;
    line-height: 1;
    color: var(--text-primary);
    background: transparent;
    border: none;
    cursor: pointer;
  }

  .faqs-card__content {
    display: grid;
    grid-template-rows: 0fr;
    overflow: hidden;
    transition: grid-template-rows 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .faqs-card.open .faqs-card__content {
    grid-template-rows: 1fr;
  }

  .faqs-card__content-inner {
    min-height: 0;
    overflow: hidden;
  }

  .faqs-card__answer {
    padding: 1rem;
    margin: 0;
    font-size: 0.875rem;
    font-weight: ${typography.weights.regular};
    color: var(--text-primary);
    line-height: 1.6;
    border-top: 1px solid var(--border);
  }

  @media (max-width: 768px) {
    .faqs-card__answer {
      font-size: 0.875rem;
    }
  }
`;

interface FaqsCardProps {
  link: PageSettingsLinkItem;
  index: number;
  editableKeyPrefix?: string;
  editable?: boolean;
  itemData?: any; // full item object for color values
}

export const FaqsCard = component$<FaqsCardProps>(({ link, index, editableKeyPrefix, editable, itemData }) => {
  useStylesScoped$(FAQS_CARD_STYLES);

  const isOpen = useSignal(false);

  const toggleOpen = $(() => {
    isOpen.value = !isOpen.value;
  });

  const questionNumber = String(index + 1).padStart(2, '0');
  const question = link.title || "Untitled question";
  const answer = link.description || "";

  // Per-item color values
  const bgColor = itemData?.bgColor || 'var(--surface-2)';
  const questionColor = itemData?.questionColor || 'var(--text-primary)';
  const answerColor = itemData?.answerColor || 'var(--text-primary)';

  return (
    <div
      class={`faqs-card ${isOpen.value ? 'open' : ''}`}
      data-element-type={editable ? "box" : undefined}
      data-color-field={editableKeyPrefix ? `${editableKeyPrefix}.bgColor` : undefined}
      data-current-color={bgColor}
      data-default-bg="var(--surface-2)"
      style={`background-color: ${bgColor};`}
    >
      <div class="faqs-card__header" onClick$={toggleOpen}>
        <div class="faqs-card__question">
          <span class="faqs-card__number">{questionNumber}</span>
          <h3
            class="faqs-card__title"
            data-field={editableKeyPrefix ? `${editableKeyPrefix}.question` : undefined}
            contentEditable={editable ? "true" : undefined}
            data-default-color="var(--text-primary)"
            onClick$={(e) => editable && e.stopPropagation()}
            style={`color: ${questionColor}; cursor: ${editable ? 'text' : 'default'};`}
          >
            {question}
          </h3>
        </div>
        <button
          type="button"
          class="faqs-card__toggle"
          aria-label={isOpen.value ? 'Collapse' : 'Expand'}
        >
          {isOpen.value ? '−' : '+'}
        </button>
      </div>
      <div class="faqs-card__content">
        <div class="faqs-card__content-inner">
          {(answer || editable) && (
            <div
              class="faqs-card__answer"
              data-field={editableKeyPrefix ? `${editableKeyPrefix}.answer` : undefined}
              contentEditable={editable ? "true" : undefined}
              data-default-color="var(--text-primary)"
              onClick$={(e) => editable && e.stopPropagation()}
              style={`color: ${answerColor}; cursor: ${editable ? 'text' : 'default'};`}
            >
              {answer || (editable ? 'Answer...' : '')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

export default FaqsCard;

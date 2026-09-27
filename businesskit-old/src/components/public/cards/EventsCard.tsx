import { component$, useStylesScoped$, type PropFunction } from "@builder.io/qwik";
import type { PageSettingsLinkItem } from "~/lib/types";
import { designSystem } from "~/lib/design-system";

const { typography, shadows } = designSystem;

const EVENTS_CARD_STYLES = `
  .events-card {
    display: flex;
    flex-direction: column;
  gap: 0;
    padding: 0;
    border-radius: 1rem;
    border: 1px solid var(--border);
    background-color: var(--surface-2);
    box-shadow: ${shadows.sm};
    text-decoration: none;
    color: inherit;
    transition: box-shadow ${designSystem.transitions.fast}, transform ${designSystem.transitions.fast};
  }

  .events-card:hover,
  .events-card:focus-visible {
    outline: none;
    box-shadow: ${shadows.md};
    transform: translateY(-2px);
  }

  .events-card__image-wrap {
    position: relative;
    width: 100%;
    padding-bottom: 56.25%;
    border-radius: 0.75rem 0.75rem 0 0;
    overflow: hidden;
    background-color: #d9d9d9;
  }

  .events-card__image-wrap img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .events-card__image-placeholder {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

  .events-card__body {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 0.75rem;
  }

  .events-card__header {
    display: flex;
    align-items: stretch;
    gap: 0.75rem;
  }

  .events-card__date {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 5rem;
    height: 5rem;
    border-radius: 0.75rem;
    background: var(--card-button-bg, rgba(0, 0, 0, 0.05));
    color: var(--text-primary);
    text-transform: uppercase;
    line-height: 1.1;
    gap: 0.25rem;
  }

  .events-card__date-month {
    font-size: 0.75rem;
    font-weight: ${typography.weights.regular};
  }

  .events-card__date-day {
    font-size: 1.5rem;
    font-weight: ${typography.weights.semibold};
  }

  .events-card__date-year {
    font-size: 0.75rem;
    font-weight: ${typography.weights.regular};
    letter-spacing: 0.06em;
  }

  .events-card__info {
    display: flex;
    flex-direction: column;
    gap: 0;
    flex: 1;
    min-width: 0;
  }

  .events-card__title {
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

  .events-card__meta {
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
  }

  .events-card__button {
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
    margin-top: 0.5rem;
  }
`;

interface EventsCardProps {
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

const formatEventDateParts = (value: unknown): { day: string; month: string; year: string } | null => {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  const day = parsed.getDate().toString().padStart(2, "0");
  const month = parsed
    .toLocaleString("en-US", { month: "short" })
    .toUpperCase();
  const year = parsed.getFullYear().toString();
  return { day, month, year };
};

export const EventsCard = component$<EventsCardProps>(({ link, href, imageUrl, onNavigate$ }) => {
  useStylesScoped$(EVENTS_CARD_STYLES);

  const title = sanitizeText(link.title) ?? sanitizeText(link.url) ?? "Untitled event";
  const buttonLabel = sanitizeText(link.button_text);
  const location = sanitizeText(link.location);
  const formattedDate = formatEventDateParts(link.date);
  const dateFirst = formattedDate ? {
    month: formattedDate.month,
    day: formattedDate.day,
    year: formattedDate.year,
  } : null;

  return (
    <a
      class="events-card"
      href={href}
      target={href.startsWith("http") ? "_blank" : undefined}
      rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      onClick$={onNavigate$}
    >
      <div class="events-card__image-wrap">
        {imageUrl ? (
          <img src={imageUrl} alt={title} loading="lazy" width="320" height="180" />
        ) : (
          <span class="events-card__image-placeholder">No image</span>
        )}
      </div>
      <div class="events-card__body">
        <div class="events-card__header">
          {dateFirst && (
            <div class="events-card__date">
              <span class="events-card__date-month">{dateFirst.month}</span>
              <span class="events-card__date-day">{dateFirst.day}</span>
              <span class="events-card__date-year">{dateFirst.year}</span>
            </div>
          )}
          <div class="events-card__info">
            <h3 class="events-card__title">{title}</h3>
            {location && <div class="events-card__meta">{location}</div>}
            {buttonLabel && <span class="events-card__button">{buttonLabel}</span>}
          </div>
        </div>
      </div>
    </a>
  );
});

export default EventsCard;

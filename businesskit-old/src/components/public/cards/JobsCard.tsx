import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { designSystem } from "~/lib/design-system";

const { typography, borderRadius, shadows } = designSystem;

const JOBS_CARD_STYLES = `
  .jobs-card {
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

  .jobs-card:focus-visible {
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }

  .jobs-card__content {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1.25rem;
  }

  .jobs-card__title {
    margin: 0;
    font-size: ${typography.sizes.lg};
    font-weight: ${typography.weights.semibold};
    line-height: 1.3;
    color: var(--text-primary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .jobs-card__meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.25rem;
  }

  .jobs-card__meta-item {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
    text-transform: capitalize;
  }

  .jobs-card__meta-item svg {
    flex-shrink: 0;
    opacity: 0.7;
  }

  .jobs-card__excerpt {
    margin: 0;
    font-size: ${typography.sizes.sm};
    line-height: 1.5;
    color: var(--text-secondary);
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .jobs-card__footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem 1.25rem;
    border-top: 1px solid var(--border);
    background: var(--background);
  }

  .jobs-card__location {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: ${typography.sizes.xs};
    color: var(--text-secondary);
  }

  .jobs-card__apply {
    font-size: ${typography.sizes.xs};
    font-weight: ${typography.weights.medium};
    color: var(--accent);
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }
`;

export interface JobsCardProps {
  id: string;
  title: string;
  location: string;
  locationType: string;
  employmentType: string;
  salaryMin?: number;
  salaryMax?: number;
  salaryCurrency?: string;
  excerpt?: string;
  href: string;
}

export const JobsCard = component$<JobsCardProps>((props) => {
  useStylesScoped$(JOBS_CARD_STYLES);

  const formatSalary = (min?: number, max?: number, currency?: string) => {
    if (!min && !max) return null;
    const curr = currency || 'USD';
    if (min && max) return `${curr} ${min.toLocaleString()} - ${max.toLocaleString()}`;
    if (min) return `${curr} ${min.toLocaleString()}+`;
    if (max) return `Up to ${curr} ${max.toLocaleString()}`;
    return null;
  };

  const salary = formatSalary(props.salaryMin, props.salaryMax, props.salaryCurrency);

  return (
    <a href={props.href} class="jobs-card">
      <div class="jobs-card__content">
        <h3 class="jobs-card__title">{props.title}</h3>
        
        <div class="jobs-card__meta">
          {/* Location Type */}
          <span class="jobs-card__meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="7" width="20" height="14" rx="2" />
              <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2" />
            </svg>
            {props.locationType}
          </span>

          {/* Employment Type */}
          <span class="jobs-card__meta-item">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {props.employmentType}
          </span>

          {/* Salary */}
          {salary && (
            <span class="jobs-card__meta-item">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
              {salary}
            </span>
          )}
        </div>

        {props.excerpt && (
          <p class="jobs-card__excerpt">{props.excerpt}</p>
        )}
      </div>

      <div class="jobs-card__footer">
        <div class="jobs-card__location">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {props.location}
        </div>
        <span class="jobs-card__apply">
          View Job
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </span>
      </div>
    </a>
  );
});

export default JobsCard;

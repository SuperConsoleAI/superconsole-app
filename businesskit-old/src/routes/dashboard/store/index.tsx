import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import { designSystem } from "~/lib/design-system";
import { MobileAppDock } from "~/components/MobileAppDock";

const { spacing, typography, borderRadius, shadows } = designSystem;

const PAGE_STYLE = `
  .store-dashboard__landing {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: ${spacing.lg};
    background-color: var(--surface-1);
  }

  .store-dashboard__hero {
    display: flex;
    flex-direction: column;
    gap: ${spacing.sm};
    max-width: 680px;
  }

  .store-dashboard__hero h1 {
    margin: 0;
    font-size: ${typography.sizes["3xl"]};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
  }

  .store-dashboard__hero p {
    margin: 0;
    font-size: ${typography.sizes.base};
    color: var(--text-secondary);
  }

  .store-dashboard__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: ${spacing.lg};
  }

  .store-dashboard__card {
    display: flex;
    flex-direction: column;
    gap: ${spacing.sm};
    border: 1px solid var(--border);
    border-radius: ${borderRadius.xl};
    padding: ${spacing.lg};
    background: var(--surface-2);
    transition: border-color ${designSystem.transitions.fast}, box-shadow ${designSystem.transitions.fast};
  }

  .store-dashboard__card:hover,
  .store-dashboard__card:focus-visible {
    border-color: var(--accent);
    box-shadow: ${shadows.sm};
  }

  .store-dashboard__card h2 {
    margin: 0;
    font-size: ${typography.sizes.lg};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
  }

  .store-dashboard__card p {
    margin: 0;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }

`;

const ROUTE_CONFIG = [
  { route: "/dashboard/store/digital-download/", title: "Digital downloads", description: "Sell eBooks, PDFs, audio packs, templates, or any downloadable asset with secure delivery links." },
  { route: "/dashboard/store/listing/", title: "Listings", description: "Publish listings like job boards, directories, and marketplaces with SEO-friendly pages and lead capture." },
  { route: "/dashboard/store/courses/", title: "Courses", description: "Publish multi-lesson learning paths with progress tracking, video embeds, and gated resources." },
  { route: "/dashboard/store/meeting/", title: "1:1 meetings", description: "Offer paid consultation calls with calendar integrations for seamless scheduling and reminders." },
  { route: "/dashboard/store/webinar/", title: "Live webinars", description: "Host one-off live events, collect registrations, and deliver access links without manual follow-up." },
  { route: "/dashboard/store/service/", title: "Services", description: "Offer custom services like consulting, design, or development with detailed customer requirements." },
  { route: "/dashboard/store/sponsorship/", title: "Sponsorships", description: "Sell sponsored posts and shoutouts across your social media, newsletter, and blog platforms." },
  { route: "/dashboard/store/event/", title: "Events & Ticketing", description: "Host virtual or in-person events with capacity management, approval workflows, and automated waitlists." },
];

export default component$(() => {
  useStylesScoped$(PAGE_STYLE);
  return (
    <div class="store-dashboard__landing">
      <section class="store-dashboard__grid">
        {ROUTE_CONFIG.map((entry) => (
          <article key={entry.route} class="store-dashboard__card">
            <div>
              <h2>{entry.title}</h2>
              <p>{entry.description}</p>
            </div>
            <Link
              href={entry.route}
              style={`
                width: fit-content;
                height: 2rem;
                padding: 0 1.25rem;
                border-radius: 0.375rem;
                background: var(--surface-3);
                display: flex;
                align-items: center;
                justify-content: center;
                color: var(--text-primary);
                font-size: 0.75rem;
                font-weight: 500;
                text-decoration: none;
              `}
              class="hover:opacity-80 transition-opacity"
            >
              Open workspace
            </Link>
          </article>
        ))}
      </section>
      <MobileAppDock />
    </div>
  );
});

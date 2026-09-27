// src/routes/dashboard/shop/index.tsx
// Shop Landing Hub Page — Path: /dashboard/shop
// Styled identically to /dashboard/store/index.tsx

import { component$, useStylesScoped$ } from "@builder.io/qwik";
import { Link } from "@builder.io/qwik-city";
import type { DocumentHead } from "@builder.io/qwik-city";
import { designSystem } from "~/lib/design-system";
import { MobileAppDock } from "~/components/MobileAppDock";

const { spacing, typography, borderRadius, shadows } = designSystem;

const PAGE_STYLE = `
  .shop-dashboard__landing {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: ${spacing.lg};
    background-color: var(--surface-1);
  }

  .shop-dashboard__hero {
    display: flex;
    flex-direction: column;
    gap: ${spacing.sm};
    max-width: 680px;
    margin-bottom: ${spacing.md};
  }

  .shop-dashboard__hero h1 {
    margin: 0;
    font-size: ${typography.sizes["3xl"]};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
  }

  .shop-dashboard__hero p {
    margin: 0;
    font-size: ${typography.sizes.base};
    color: var(--text-secondary);
  }

  .shop-dashboard__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: ${spacing.lg};
  }

  .shop-dashboard__card {
    display: flex;
    flex-direction: column;
    gap: ${spacing.sm};
    border: 1px solid var(--border);
    border-radius: ${borderRadius.xl};
    padding: ${spacing.lg};
    background: var(--surface-2);
    transition: border-color ${designSystem.transitions.fast}, box-shadow ${designSystem.transitions.fast};
  }

  .shop-dashboard__card:hover,
  .shop-dashboard__card:focus-visible {
    border-color: var(--accent);
    box-shadow: ${shadows.sm};
  }

  .shop-dashboard__card h2 {
    margin: 0;
    font-size: ${typography.sizes.lg};
    font-weight: ${typography.weights.semibold};
    color: var(--text-primary);
  }

  .shop-dashboard__card p {
    margin: 0;
    font-size: ${typography.sizes.sm};
    color: var(--text-secondary);
  }
`;

const ROUTE_CONFIG = [
  {
    route: "/dashboard/shop/products/",
    title: "Products & Inventory",
    description: "Manage product catalogue, stock ledgers, reorder alerts, and warehouse positions.",
  },
  {
    route: "/dashboard/shop/restaurant/",
    title: "Restaurant & Café",
    description: "Table floor plan, live KOT kitchen display, dish recipes & waiter sales performance.",
  },
  {
    route: "/dashboard/shop/stays/",
    title: "Hotel & Stays",
    description: "Room layout grid, front desk check-in/out, guest ID proofs, running folios & RevPAR analytics.",
  },
  {
    route: "/dashboard/shop/customers/",
    title: "Customers",
    description: "Customer directory, contact history, ledger balances, and custom price list assignments.",
  },
  {
    route: "/dashboard/shop/vendors/",
    title: "Vendors & Suppliers",
    description: "Supplier database, item links, purchase history, and vendor-wise reorder rules.",
  },
  {
    route: "/dashboard/shop/collections/",
    title: "Collections",
    description: "Organize products into curated collections for storefront and POS organization.",
  },
  {
    route: "/dashboard/shop/categories/",
    title: "Categories",
    description: "Manage product categories and sub-categories hierarchy for easy navigation.",
  },
  {
    route: "/dashboard/shop/brands/",
    title: "Brands",
    description: "Maintain manufacturer brand registries and filter inventory by brand.",
  },
  {
    route: "/dashboard/shop/units/",
    title: "Units & Measurements",
    description: "Measurement units (pcs, kg, litre, hours) for stock counting, billing and price calculations.",
  },
  {
    route: "/dashboard/shop/settings/price-lists/",
    title: "Price Lists",
    description: "Tiered pricing rules, wholesale vs retail rates, and customer-specific discounts.",
  },
  {
    route: "/dashboard/shop/settings/discounts/",
    title: "Discount Codes & Coupons",
    description: "Promotional discount codes, percentage or flat discounts, and coupon validity.",
  },
  {
    route: "/dashboard/shop/settings/currency/",
    title: "Currency & Rates",
    description: "Multi-currency rates and international currency formatting settings.",
  },
];

export default component$(() => {
  useStylesScoped$(PAGE_STYLE);
  return (
    <div class="shop-dashboard__landing">
      <section class="shop-dashboard__grid">
        {ROUTE_CONFIG.map((entry) => (
          <article key={entry.route} class="shop-dashboard__card">
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
                margin-top: auto;
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

export const head: DocumentHead = {
  title: "Shop Workspaces | BusinessKit",
};

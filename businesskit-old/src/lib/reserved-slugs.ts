// Subdomains that run on separate servers (n8n, mail, etc.)
export const INFRA_SUBDOMAINS = new Set([
  "www", "app", "api", "admin", "mail", "smtp", "imap", "pop",
  "dev", "beta", "alpha", "preview", "staging",
  "n8n", "grafana", "prometheus", "redis", "postgres", "mysql",
  "cdn", "assets", "static", "status",
  "ftp", "ssh", "vpn", "proxy", "ns", "ns1", "ns2", "mx",
  "autoconfig", "autodiscover", "cpanel", "whm", "webmail",
]);

// Slugs reserved for product routes, branding, or abuse prevention.
// Users cannot register these as handles/usernames.
export const RESERVED_SLUGS = new Set([
  ...INFRA_SUBDOMAINS,

  // Product / marketing
  "blog", "news", "changelog", "pricing", "billing", "checkout",
  "login", "logout", "signup", "register", "auth", "oauth", "sso",
  "account", "dashboard", "settings", "profile", "profiles",
  "support", "help", "docs",

  // System / reserved
  "root", "system", "null", "undefined", "test", "staging",
  "production", "preview", "demo", "sandbox", "internal",
  "free", "pro", "business", "enterprise", "team", "teams",
  "store", "shop", "jobs", "forms", "kb",

  // Third-party platforms & brands
  "google", "facebook", "instagram", "linkedin", "notion", "youtube",
  "n8n", "make", "skool", "obsidian", "claude", "gemini", "chatgpt", "claudecode", "sonnet", "codex", "antigravity",
  "shopify", "gumroad", "webflow", "wix", "squarespace", "wordpress",
  "joomla", "duda",

  // Abuse prevention
  "abuse", "spam", "security", "postmaster", "webmaster", "hostmaster",
  "info", "contact", "noreply", "no-reply", "mailer-daemon",
]);

/**
 * Check if a given slug is reserved
 */
export function isReservedSlug(slug: string): boolean {
  if (!slug) return false;
  return RESERVED_SLUGS.has(slug.toLowerCase().trim());
}

/**
 * Check if a given subdomain is an infrastructure subdomain
 */
export function isInfraSubdomain(subdomain: string): boolean {
  if (!subdomain) return false;
  return INFRA_SUBDOMAINS.has(subdomain.toLowerCase().trim());
}

/**
 * Read all currently reserved slugs as an array
 */
export function getAllReservedSlugs(): string[] {
  return Array.from(RESERVED_SLUGS);
}

/**
 * Dynamically add a slug to the reserved list at runtime
 */
export function addReservedSlug(slug: string): void {
  if (slug && slug.trim()) {
    RESERVED_SLUGS.add(slug.toLowerCase().trim());
  }
}

/**
 * Dynamically remove a slug from the reserved list at runtime
 */
export function removeReservedSlug(slug: string): void {
  if (slug && slug.trim()) {
    RESERVED_SLUGS.delete(slug.toLowerCase().trim());
  }
}

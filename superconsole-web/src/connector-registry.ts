// Hardcoded connector registry (API key / token only for Phase 17).
// Mirrors src-tauri/src/connectors.rs and the desktop src/lib/api.ts registry:
// keep service ids, field keys, and scopes identical across all three.

export type ConnectorScope = "project" | "org";

export interface ConnectorFieldDef {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
}

export interface ConnectorDef {
  id: string;
  label: string;
  scopes: ConnectorScope[];
  fields: ConnectorFieldDef[];
}

export const CONNECTOR_REGISTRY: ConnectorDef[] = [
  {
    id: "gmail",
    label: "Gmail",
    scopes: ["project"],
    fields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "email", label: "Email address", secret: false },
    ],
  },
  {
    id: "google_drive",
    label: "Google Drive",
    scopes: ["project"],
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "shopify",
    label: "Shopify",
    scopes: ["project"],
    fields: [
      { key: "api_key", label: "Admin API token", secret: true },
      {
        key: "shop_domain",
        label: "Shop domain",
        secret: false,
        placeholder: "store.myshopify.com",
      },
    ],
  },
  {
    id: "beehiiv",
    label: "Beehiiv",
    scopes: ["project"],
    fields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "publication_id", label: "Publication ID", secret: false },
    ],
  },
  {
    id: "convertkit",
    label: "ConvertKit",
    scopes: ["project"],
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "stripe",
    label: "Stripe",
    scopes: ["project", "org"],
    fields: [{ key: "api_key", label: "Secret key", secret: true }],
  },
  {
    id: "buffer",
    label: "Buffer",
    scopes: ["project"],
    fields: [{ key: "access_token", label: "Access token", secret: true }],
  },
  {
    id: "ga4",
    label: "Google Analytics 4",
    scopes: ["project"],
    fields: [
      { key: "api_secret", label: "API secret", secret: true },
      { key: "measurement_id", label: "Measurement ID", secret: false },
    ],
  },
  {
    id: "turso",
    label: "Turso",
    scopes: ["project"],
    fields: [
      { key: "auth_token", label: "Auth token", secret: true },
      { key: "url", label: "Database URL", secret: false, placeholder: "libsql://..." },
    ],
  },
  {
    id: "supabase",
    label: "Supabase",
    scopes: ["project"],
    fields: [
      { key: "service_role_key", label: "Service role key", secret: true },
      { key: "url", label: "Project URL", secret: false },
    ],
  },
  {
    id: "notion",
    label: "Notion",
    scopes: ["project", "org"],
    fields: [{ key: "api_key", label: "Integration token", secret: true }],
  },
  {
    id: "airtable",
    label: "Airtable",
    scopes: ["project"],
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "telegram",
    label: "Telegram",
    scopes: ["project", "org"],
    fields: [{ key: "bot_token", label: "Bot token", secret: true }],
  },
  {
    id: "slack",
    label: "Slack",
    scopes: ["org"],
    fields: [{ key: "bot_token", label: "Bot token", secret: true }],
  },
  {
    id: "github",
    label: "GitHub",
    scopes: ["org"],
    fields: [{ key: "token", label: "Personal access token", secret: true }],
  },
];

export function connectorDef(service: string): ConnectorDef | undefined {
  return CONNECTOR_REGISTRY.find((d) => d.id === service);
}

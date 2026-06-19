// Hardcoded connector registry (API key / token only for Phase 17).
// Mirrors src-tauri/src/connectors.rs and the desktop src/lib/api.ts registry:
// keep service ids, field keys, and scopes identical across all three.

export type ConnectorScope = "account" | "project" | "org";

export type ConnectorCategory = "integrations" | "connectors";

const ALL_SCOPES: ConnectorScope[] = ["account", "org", "project"];

export interface ConnectorFieldDef {
  key: string;
  label: string;
  secret: boolean;
  placeholder?: string;
}

export interface ConnectorDef {
  id: string;
  label: string;
  category: ConnectorCategory;
  scopes: ConnectorScope[];
  fields: ConnectorFieldDef[];
}

export const CONNECTOR_REGISTRY: ConnectorDef[] = [
  {
    id: "github",
    label: "GitHub",
    category: "integrations",
    scopes: ALL_SCOPES,
    fields: [{ key: "token", label: "Personal access token", secret: true }],
  },
  {
    id: "slack",
    label: "Slack",
    category: "integrations",
    scopes: ALL_SCOPES,
    fields: [{ key: "bot_token", label: "Bot token", secret: true }],
  },
  {
    id: "linear",
    label: "Linear",
    category: "integrations",
    scopes: ALL_SCOPES,
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "gmail",
    label: "Gmail",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "email", label: "Email address", secret: false },
    ],
  },
  {
    id: "google_drive",
    label: "Google Drive",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "shopify",
    label: "Shopify",
    category: "connectors",
    scopes: ALL_SCOPES,
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
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [
      { key: "api_key", label: "API key", secret: true },
      { key: "publication_id", label: "Publication ID", secret: false },
    ],
  },
  {
    id: "convertkit",
    label: "ConvertKit",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "stripe",
    label: "Stripe",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [{ key: "api_key", label: "Secret key", secret: true }],
  },
  {
    id: "buffer",
    label: "Buffer",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [{ key: "access_token", label: "Access token", secret: true }],
  },
  {
    id: "ga4",
    label: "Google Analytics 4",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [
      { key: "api_secret", label: "API secret", secret: true },
      { key: "measurement_id", label: "Measurement ID", secret: false },
    ],
  },
  {
    id: "turso",
    label: "Turso",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [
      { key: "auth_token", label: "Auth token", secret: true },
      { key: "url", label: "Database URL", secret: false, placeholder: "libsql://..." },
    ],
  },
  {
    id: "supabase",
    label: "Supabase",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [
      { key: "service_role_key", label: "Service role key", secret: true },
      { key: "url", label: "Project URL", secret: false },
    ],
  },
  {
    id: "notion",
    label: "Notion",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [{ key: "api_key", label: "Integration token", secret: true }],
  },
  {
    id: "airtable",
    label: "Airtable",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [{ key: "api_key", label: "API key", secret: true }],
  },
  {
    id: "telegram",
    label: "Telegram",
    category: "connectors",
    scopes: ALL_SCOPES,
    fields: [{ key: "bot_token", label: "Bot token", secret: true }],
  },
  {
    id: "web_search",
    label: "Web Search",
    category: "integrations",
    scopes: ALL_SCOPES,
    fields: [{ key: "api_key", label: "Tavily API key", secret: true }],
  },
];

export function connectorDef(service: string): ConnectorDef | undefined {
  return CONNECTOR_REGISTRY.find((d) => d.id === service);
}

// src/components/agents/agent-commands.ts
// Central configuration for Agent Domains, Starter Commands, Slash Commands, and Suggestions.

import {
  LuLayers,
  LuPackage,
  LuUsers,
  LuFileText,
  LuLaptop,
  LuCpu,
  LuShare2,
  LuDatabase,
  LuMessageSquare,
} from "@qwikest/icons/lucide";

export interface DomainOption {
  id: string;
  name: string;
  shortName: string;
}

/**
 * Default always-available agent domains.
 * The rest are on-demand only if installed in installedApps.
 */
export const DEFAULT_AGENT_DOMAINS = ["system", "crm", "content", "pages"];

export const DOMAIN_OPTIONS: DomainOption[] = [
  { id: "all", name: "All Domains", shortName: "All" },
  { id: "system", name: "System & Core", shortName: "System" },
  { id: "crm", name: "CRM & Leads", shortName: "CRM" },
  { id: "content", name: "Content & Blog", shortName: "Content" },
  { id: "pages", name: "Website & Pages", shortName: "Pages" },
  // On-demand installable app domains
  { id: "shop", name: "Shop & Stock", shortName: "Shop" },
  { id: "tax", name: "Tax & Filing", shortName: "Tax" },
  { id: "accounts", name: "Accounting & Books", shortName: "Accounts" },
  { id: "payroll", name: "Payroll & Staff", shortName: "Payroll" },
  { id: "social", name: "Social Media", shortName: "Social" },
  { id: "community", name: "Community", shortName: "Community" },
  { id: "chat", name: "Chat Agent", shortName: "Chat" },
];

/**
 * Checks whether a domain is default or its corresponding app is installed.
 */
export function isDomainAvailable(domainId: string, installedApps?: string[] | null): boolean {
  if (domainId === "all") return true;
  if (DEFAULT_AGENT_DOMAINS.includes(domainId)) return true;
  const list = installedApps || [];
  if (list.includes(domainId)) return true;
  if (domainId === "chat" && (list.includes("chat") || list.includes("chat-agent") || list.includes("chat_agent"))) return true;
  return false;
}

export const getDomainIcon = (id: string) => {
  switch (id) {
    case "pages":
      return LuLaptop;
    case "system":
      return LuCpu;
    case "shop":
      return LuPackage;
    case "crm":
      return LuUsers;
    case "content":
      return LuFileText;
    case "accounts":
      return LuDatabase;
    case "tax":
      return LuFileText;
    case "social":
      return LuShare2;
    case "chat":
      return LuMessageSquare;
    default:
      return LuLayers;
  }
};

export interface StarterCommand {
  id: string;
  cmd: string;
  name: string;
  desc: string;
  iconType: "invoice" | "package" | "contact" | "post" | "sparkles";
  requiredTools?: string[];
}

export const DOMAIN_STARTER_COMMANDS: Record<string, StarterCommand[]> = {
  all: [
    { id: "cmd_create_page", cmd: "/create-page", name: "Create Website Page", desc: "Draft a new landing page or website page", iconType: "post", requiredTools: ["page_create"] },
    { id: "cmd_add_contact", cmd: "/add-contact", name: "Add CRM Contact", desc: "Register a new client, vendor, or lead", iconType: "contact", requiredTools: ["contact_create"] },
    { id: "cmd_draft_post", cmd: "/draft-post", name: "Draft Marketing Post", desc: "Write brand-aligned articles or announcements", iconType: "post", requiredTools: ["blog_post_create"] },
    { id: "cmd_capabilities", cmd: "/capabilities", name: "Discover Capabilities", desc: "Inspect platform tools and abilities", iconType: "sparkles", requiredTools: ["system_get_capabilities"] },
    { id: "cmd_add_inventory_from_invoice", cmd: "/add-inventory-from-invoice", name: "Receive Stock from Invoice", desc: "Scan purchase invoice or PDF to auto-restock items", iconType: "invoice", requiredTools: ["inventory_receive_purchase_invoice"] },
    { id: "cmd_check_stock", cmd: "/check-stock", name: "Check Stock Levels", desc: "Inspect inventory levels, reorder points & batches", iconType: "package", requiredTools: ["inventory_get_levels"] },
  ],
  pages: [
    { id: "cmd_create_page", cmd: "/create-page", name: "Create Website Page", desc: "Draft a new landing page or website page with title and slug", iconType: "post", requiredTools: ["page_create"] },
    { id: "cmd_publish_page", cmd: "/publish-page", name: "Publish Website Page", desc: "Publish a page or toggle draft status for website", iconType: "sparkles", requiredTools: ["page_publish"] },
    { id: "cmd_list_pages", cmd: "/list-pages", name: "List Website Pages", desc: "List all website pages, slugs, and publication statuses", iconType: "package", requiredTools: ["page_list"] },
  ],
  crm: [
    { id: "cmd_add_contact", cmd: "/add-contact", name: "Add CRM Contact", desc: "Register a new client, vendor, or lead with email/phone", iconType: "contact", requiredTools: ["contact_create"] },
    { id: "cmd_update_contact", cmd: "/update-contact", name: "Update Contact", desc: "Update details, tags, or company info for a contact", iconType: "contact", requiredTools: ["contact_update"] },
    { id: "cmd_view_customer", cmd: "/view-customer", name: "Customer Overview", desc: "Fetch customer profile, billing history & invoices", iconType: "contact" },
    { id: "cmd_crm_summary", cmd: "/crm-summary", name: "Pipeline Summary", desc: "Summarize recent deals, interactions & prospects", iconType: "contact" },
  ],
  content: [
    { id: "cmd_draft_post", cmd: "/draft-post", name: "Draft Blog Post", desc: "Create and draft a structured article with markdown", iconType: "post", requiredTools: ["blog_post_create"] },
    { id: "cmd_publish_page", cmd: "/publish-page", name: "Publish CMS Page", desc: "Create and publish a formatted page to the CMS", iconType: "post", requiredTools: ["blog_post_create"] },
    { id: "cmd_seo_audit", cmd: "/seo-audit", name: "SEO & Keyword Audit", desc: "Analyze title tags, meta description & keywords", iconType: "sparkles" },
  ],
  system: [
    { id: "cmd_capabilities", cmd: "/capabilities", name: "Platform Capabilities", desc: "Discover all available BusinessKit platform capabilities", iconType: "sparkles", requiredTools: ["system_get_capabilities"] },
  ],
  shop: [
    { id: "cmd_add_inventory_from_invoice", cmd: "/add-inventory-from-invoice", name: "Receive Stock from Invoice", desc: "Scan purchase invoice or PDF to auto-restock items", iconType: "invoice", requiredTools: ["inventory_receive_purchase_invoice"] },
    { id: "cmd_check_stock", cmd: "/check-stock", name: "Check Stock Levels", desc: "Inspect inventory levels, reorder points & batches", iconType: "package", requiredTools: ["inventory_get_levels"] },
    { id: "cmd_adjust_stock", cmd: "/adjust-stock", name: "Adjust Stock Quantity", desc: "Record damage, audit variances or stock corrections", iconType: "package", requiredTools: ["inventory_add_stock"] },
    { id: "cmd_create_invoice", cmd: "/create-invoice", name: "Create Customer Invoice", desc: "Draft a new retail or wholesale billing invoice", iconType: "invoice", requiredTools: ["invoice_create"] },
    { id: "cmd_send_invoice", cmd: "/send-invoice", name: "Send Invoice", desc: "Send an existing invoice to customer via email or link", iconType: "invoice", requiredTools: ["invoice_send"] },
    { id: "cmd_update_pricing", cmd: "/update-price", name: "Update Product Pricing", desc: "Modify cost price or selling price of an item", iconType: "package", requiredTools: ["product_update_pricing"] },
  ],
};

export interface SlashCommandItem {
  id: string;
  slash: string;
  name: string;
  desc: string;
  category: string;
  requiredTools?: string[];
}

export const SLASH_CATEGORIES: { id: string; name: string }[] = [
  { id: "crm", name: "CRM" },
  { id: "content", name: "Content" },
  { id: "pages", name: "Pages" },
  { id: "shop", name: "Shop" },
  { id: "system", name: "System" },
];

export const SLASH_COMMANDS: SlashCommandItem[] = [
  // ── Pages Domain (Default) ──
  {
    id: "cmd_create_page",
    slash: "/create-page",
    name: "Create Website Page",
    desc: "Draft a new landing page or website page with title and slug",
    category: "pages",
    requiredTools: ["page_create"],
  },
  {
    id: "cmd_publish_page",
    slash: "/publish-page",
    name: "Publish Website Page",
    desc: "Publish a page or toggle draft status for website",
    category: "pages",
    requiredTools: ["page_publish"],
  },
  {
    id: "cmd_list_pages",
    slash: "/list-pages",
    name: "List Website Pages",
    desc: "List all website pages, slugs, and publication statuses",
    category: "pages",
    requiredTools: ["page_list"],
  },

  // ── CRM Domain (Default) ──
  {
    id: "cmd_add_contact",
    slash: "/add-contact",
    name: "Add CRM Contact",
    desc: "Register a new client, vendor, or lead with email/phone",
    category: "crm",
    requiredTools: ["contact_create"],
  },
  {
    id: "cmd_update_contact",
    slash: "/update-contact",
    name: "Update CRM Contact",
    desc: "Update tags, phone number, company, or lifecycle stage",
    category: "crm",
    requiredTools: ["contact_update"],
  },
  {
    id: "cmd_view_customer",
    slash: "/view-customer",
    name: "Customer Overview",
    desc: "Fetch customer profile, billing history & invoices",
    category: "crm",
  },
  {
    id: "cmd_crm_summary",
    slash: "/crm-summary",
    name: "CRM Pipeline Summary",
    desc: "Summarize recent deals, interactions & follow-up tasks",
    category: "crm",
  },

  // ── Content Domain (Default) ──
  {
    id: "cmd_draft_post",
    slash: "/draft-post",
    name: "Draft Blog Post",
    desc: "Create and draft a structured article with markdown",
    category: "content",
    requiredTools: ["blog_post_create"],
  },
  {
    id: "cmd_seo_audit",
    slash: "/seo-audit",
    name: "SEO & Keyword Audit",
    desc: "Analyze title tags, meta description & keywords",
    category: "content",
  },

  // ── System Domain (Default) ──
  {
    id: "cmd_capabilities",
    slash: "/capabilities",
    name: "Platform Capabilities",
    desc: "Discover all available BusinessKit platform capabilities",
    category: "system",
    requiredTools: ["system_get_capabilities"],
  },

  // ── Shop Domain (On Demand / If Installed) ──
  {
    id: "cmd_add_inventory_from_invoice",
    slash: "/add-inventory-from-invoice",
    name: "Add Inventory from Invoice",
    desc: "Scan purchase invoice or PDF to auto-restock items as a Purchase",
    category: "shop",
    requiredTools: ["inventory_receive_purchase_invoice"],
  },
  {
    id: "cmd_check_stock",
    slash: "/check-stock",
    name: "Check Stock Levels",
    desc: "Query current inventory levels across catalog and warehouses",
    category: "shop",
    requiredTools: ["inventory_get_levels"],
  },
  {
    id: "cmd_adjust_stock",
    slash: "/adjust-stock",
    name: "Adjust Stock Quantity",
    desc: "Add or remove inventory units for a specific SKU",
    category: "shop",
    requiredTools: ["inventory_add_stock"],
  },
  {
    id: "cmd_create_invoice",
    slash: "/create-invoice",
    name: "Create Customer Invoice",
    desc: "Draft a new retail or wholesale billing invoice with line items",
    category: "shop",
    requiredTools: ["invoice_create"],
  },
  {
    id: "cmd_send_invoice",
    slash: "/send-invoice",
    name: "Send Invoice",
    desc: "Send an existing invoice to customer via email or link",
    category: "shop",
    requiredTools: ["invoice_send"],
  },
  {
    id: "cmd_update_pricing",
    slash: "/update-price",
    name: "Update Product Pricing",
    desc: "Modify cost price or selling price of an item in catalog",
    category: "shop",
    requiredTools: ["product_update_pricing"],
  },
];

export interface FollowupChip {
  id: string;
  label: string;
  text: string;
  requiredTools?: string[];
}

export const INVOICE_RESTOCK_TEMPLATE = `/add-inventory-from-invoice \n\nFor New Products:\nSelling Price (Rate) = Cost + % ?\nDiscount = % ?`;

export function getCommandInputText(cmdStr: string): string {
  if (cmdStr.startsWith("/add-inventory-from-invoice")) {
    return INVOICE_RESTOCK_TEMPLATE;
  }
  return cmdStr.endsWith(" ") ? cmdStr : `${cmdStr} `;
}

export const FOLLOWUP_CHIPS: FollowupChip[] = [
  { id: "cmd_create_page", label: "Create website page", text: "/create-page ", requiredTools: ["page_create"] },
  { id: "cmd_add_contact", label: "Add contact", text: "/add-contact ", requiredTools: ["contact_create"] },
  { id: "cmd_draft_post", label: "Draft post", text: "/draft-post ", requiredTools: ["blog_post_create"] },
  { id: "cmd_capabilities", label: "Capabilities", text: "/capabilities ", requiredTools: ["system_get_capabilities"] },
  { id: "cmd_add_inventory_from_invoice", label: "Restock from invoice", text: INVOICE_RESTOCK_TEMPLATE, requiredTools: ["inventory_receive_purchase_invoice"] },
  { id: "cmd_check_stock", label: "Check inventory", text: "/check-stock ", requiredTools: ["inventory_get_levels"] },
  { id: "cmd_create_invoice", label: "Create invoice", text: "/create-invoice ", requiredTools: ["invoice_create"] },
];

export function resolveCommandIdFromText(text: string): string | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;
  for (const cmd of SLASH_COMMANDS) {
    if (trimmed.startsWith(cmd.slash.toLowerCase())) {
      return cmd.id;
    }
  }
  return null;
}

/**
 * Real-time domain detector based on command prefix or slash token.
 */
export function detectDomainFromCommand(text: string): string | null {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return null;

  // 1. Check pages commands
  if (
    trimmed.startsWith("/create-page") ||
    trimmed.startsWith("/publish-page") ||
    trimmed.startsWith("/list-pages") ||
    trimmed.startsWith("/pages") ||
    trimmed.startsWith("/page") ||
    trimmed.startsWith("/website")
  ) {
    return "pages";
  }

  // 2. Check crm commands
  if (
    trimmed.startsWith("/add-contact") ||
    trimmed.startsWith("/update-contact") ||
    trimmed.startsWith("/create-lead") ||
    trimmed.startsWith("/view-customer") ||
    trimmed.startsWith("/crm-summary") ||
    trimmed.startsWith("/crm") ||
    trimmed.startsWith("/lead") ||
    trimmed.startsWith("/contact")
  ) {
    return "crm";
  }

  // 3. Check content commands
  if (
    trimmed.startsWith("/draft-post") ||
    trimmed.startsWith("/seo-audit") ||
    trimmed.startsWith("/post") ||
    trimmed.startsWith("/blog") ||
    trimmed.startsWith("/article")
  ) {
    return "content";
  }

  // 4. Check system commands
  if (
    trimmed.startsWith("/capabilities") ||
    trimmed.startsWith("/system") ||
    trimmed.startsWith("/tools")
  ) {
    return "system";
  }

  // 5. Check shop commands
  if (
    trimmed.startsWith("/add-inventory") ||
    trimmed.startsWith("/receive-stock") ||
    trimmed.startsWith("/update-price") ||
    trimmed.startsWith("/update-pricing") ||
    trimmed.startsWith("/set-price") ||
    trimmed.startsWith("/check-stock") ||
    trimmed.startsWith("/inventory") ||
    trimmed.startsWith("/adjust-stock") ||
    trimmed.startsWith("/stock-adjustment") ||
    trimmed.startsWith("/create-invoice") ||
    trimmed.startsWith("/send-invoice") ||
    trimmed.startsWith("/invoice") ||
    trimmed.startsWith("/bill")
  ) {
    return "shop";
  }

  // 6. Check if text contains any known slash command
  for (const cmd of SLASH_COMMANDS) {
    if (trimmed.includes(cmd.slash.toLowerCase())) {
      return cmd.category;
    }
  }

  return null;
}

/**
 * Real-time domain detector based on active route URL.
 */
export function detectDomainFromRoute(pathname: string): string | null {
  const p = (pathname || "").toLowerCase();
  if (p.includes("/pages") || p.includes("/website")) {
    return "pages";
  }
  if (p.includes("/shop") || p.includes("/store") || p.includes("/sales") || p.includes("/inventory") || p.includes("/pos")) {
    return "shop";
  }
  if (p.includes("/crm") || p.includes("/subscribers") || p.includes("/leads") || p.includes("/contacts")) {
    return "crm";
  }
  if (
    p.includes("/media") ||
    p.includes("/content") ||
    p.includes("/blog") ||
    p.includes("/pagex") ||
    p.includes("/links")
  ) {
    return "content";
  }
  return null;
}

/**
 * Resolves initial/default agent domain.
 * Priority:
 *   1. Active URL route context (Real-time route awareness)
 *   2. Default -> "crm" (always available)
 */
export function resolveDefaultDomain(installedApps?: string[] | null, pathname?: string): string {
  const path = pathname || (typeof window !== "undefined" ? window.location.pathname : "");
  const routeDomain = detectDomainFromRoute(path);
  if (routeDomain && isDomainAvailable(routeDomain, installedApps)) {
    return routeDomain;
  }

  if (Array.isArray(installedApps) && (installedApps.includes("shop") || installedApps.includes("store"))) {
    return "shop";
  }

  return "crm";
}

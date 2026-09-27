import {
  component$,
  useSignal,
  useStore,
  useTask$,
  useVisibleTask$,
  type Signal,
  type PropFunction,
  $,
  useComputed$,
} from "@builder.io/qwik";
import {
  LuSave,
  LuLoader,
  LuChevronDown,
  LuSearch,
  LuInfo,
  LuSparkles,
  LuCheck,
  LuRefreshCw,
} from "@qwikest/icons/lucide";
import { SlideOver } from "~/components/SlideOver";
import { invoke } from "@tauri-apps/api/core";
import composioLogoUrl from "~/assets/composio.svg?url";
import { normalizeAiProvider, getDefaultModelForProvider, isAiService } from "~/lib/agent-config";

export interface ModelOption {
  id: string;
  name: string;
  badge?: string;
  price?: string;
  isRecent?: boolean;
}

export const PROVIDER_MODELS: Record<string, ModelOption[]> = {
  gemini: [
    { id: "gemini-3.1-flash-lite", name: "Gemini 3.1 Flash Lite", badge: "Default" },
    { id: "gemini-3.1-flash", name: "Gemini 3.1 Flash", badge: "Fast" },
    { id: "gemini-3.1-pro", name: "Gemini 3.1 Pro", badge: "Pro Reasoning" },
    { id: "gemini-3.5-flash", name: "Gemini 3.5 Flash", badge: "Next-Gen" },
    { id: "gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", badge: "Sub-Second" },
    { id: "gemini-3.8-flash", name: "Gemini 3.8 Flash", badge: "Flagship Speed" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", badge: "Stable" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", badge: "Reasoning" },
  ],
  openrouter: [
    { id: "google/gemini-3.5-flash-lite", name: "Gemini 3.5 Flash Lite", badge: "Default" },
    { id: "anthropic/claude-5-sonnet", name: "Claude Sonnet 5", badge: "Flagship" },
    { id: "openai/gpt-5.4-nano", name: "GPT-5.4 Nano", badge: "Ultra Fast" },
    { id: "openai/gpt-5.4-mini", name: "GPT-5.4 Mini", badge: "Fast & Smart" },
    { id: "anthropic/claude-3.7-sonnet", name: "Claude 3.7 Sonnet", badge: "Hybrid Reasoning" },
    { id: "anthropic/claude-3.5-sonnet", name: "Claude 3.5 Sonnet", badge: "Most Popular" },
    { id: "google/gemini-3.1-pro", name: "Gemini 3.1 Pro", badge: "Google Pro" },
    { id: "google/gemini-3.1-flash", name: "Gemini 3.1 Flash", badge: "Google Fast" },
    { id: "openai/gpt-4o", name: "GPT-4o", badge: "Omnimodel" },
    { id: "openai/o3-mini", name: "o3-mini", badge: "Reasoning" },
    { id: "deepseek/deepseek-r1", name: "DeepSeek R1", badge: "Open Reasoning" },
    { id: "deepseek/deepseek-chat", name: "DeepSeek V3", badge: "High Speed" },
    { id: "meta-llama/llama-3.3-70b-instruct", name: "Llama 3.3 70B", badge: "Meta AI" },
    { id: "qwen/qwen-2.5-72b-instruct", name: "Qwen 2.5 72B", badge: "Top Coding" },
  ],
  anthropic: [
    { id: "claude-5-sonnet", name: "Sonnet 5", badge: "Default" },
    { id: "claude-3-7-sonnet-20250219", name: "Claude 3.7 Sonnet", badge: "Hybrid Reasoning" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet (v2)", badge: "Flagship" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", badge: "Fast & Affordable" },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus", badge: "Deep Analysis" },
  ],
  openai: [
    { id: "gpt-5.4-nano", name: "GPT-5.4 Nano", badge: "Default" },
    { id: "gpt-5.4-mini", name: "GPT-5.4 Mini", badge: "Fast & Smart" },
    { id: "gpt-5.4", name: "GPT-5.4", badge: "Flagship" },
    { id: "gpt-4o", name: "GPT-4o", badge: "Omnimodel" },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", badge: "Affordable" },
    { id: "o3-mini", name: "o3-mini", badge: "Reasoning" },
    { id: "o1", name: "o1", badge: "Deep Reasoning" },
  ],
  deepseek: [
    { id: "deepseek-chat", name: "DeepSeek-V3", badge: "Flagship" },
    { id: "deepseek-reasoner", name: "DeepSeek-R1", badge: "Reasoning" },
  ],
  groq: [
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", badge: "Default" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", badge: "Fast" },
    { id: "groq/compound", name: "Groq Compound", badge: "Compound AI" },
    { id: "groq/compound-mini", name: "Groq Compound Mini", badge: "Fast Compound" },
  ],
  mistral: [
    { id: "mistralai/mistral-small-4", name: "Mistral Small 4", badge: "Default" },
    { id: "mistralai/mistral-medium-3.5", name: "Mistral Medium 3.5", badge: "Balanced" },
    { id: "mistralai/mistral-small-3.1-24b-instruct", name: "Mistral Small 3.1 24B", badge: "Instruct" },
    { id: "mistralai/mistral-nemo", name: "Mistral Nemo", badge: "Fast" },
    { id: "mistralai/mistral-large-2512", name: "Mistral Large 2512", badge: "Flagship" },
    { id: "codestral-latest", name: "Codestral", badge: "Coding" },
  ],
  xai: [
    { id: "grok-4.3", name: "Grok 4.3", badge: "Default" },
    { id: "grok-4.5", name: "Grok 4.5", badge: "Reasoning" },
    { id: "grok-4.6", name: "Grok 4.6", badge: "Flagship" },
    { id: "grok-2-latest", name: "Grok 2", badge: "Stable" },
    { id: "grok-2-vision-1212", name: "Grok 2 Vision", badge: "Vision" },
  ],
  grok: [
    { id: "grok-4.3", name: "Grok 4.3", badge: "Default" },
    { id: "grok-4.5", name: "Grok 4.5", badge: "Reasoning" },
    { id: "grok-4.6", name: "Grok 4.6", badge: "Flagship" },
    { id: "grok-2-latest", name: "Grok 2", badge: "Stable" },
    { id: "grok-2-vision-1212", name: "Grok 2 Vision", badge: "Vision" },
  ],
  spacexai: [
    { id: "grok-4.3", name: "Grok 4.3", badge: "Default" },
    { id: "grok-4.5", name: "Grok 4.5", badge: "Reasoning" },
    { id: "grok-4.6", name: "Grok 4.6", badge: "Flagship" },
    { id: "grok-2-latest", name: "Grok 2", badge: "Stable" },
    { id: "grok-2-vision-1212", name: "Grok 2 Vision", badge: "Vision" },
  ],
};

const COMMON_SERVICES = [
  "openrouter", "gemini", "anthropic", "openai", "deepseek", "groq", "mistral", "xai", "grok", "spacexai",
  "zernio", "webflow", "composio", "gst_einvoice", "razorpay", "payu", "cashfree",
  "stripe", "paddle", "twilio", "sendgrid", "mailchimp", "google", "slack",
  "notion", "airtable", "hubspot", "salesforce", "zapier", "shopify", "github",
  "twitter", "instagram", "linkedin", "mcp"
];

const LOGO_TOKEN = "pk_IDWh7HGRQeK9H368zgbzTw";
const SERVICE_DOMAINS: Record<string, string> = {
  zernio:        "zernio.com",
  webflow:       "webflow.com",
  composio:      "composio.dev",
  openrouter:    "openrouter.ai",
  gemini:        "google.com",
  anthropic:     "anthropic.com",
  openai:        "openai.com",
  deepseek:      "deepseek.com",
  groq:          "groq.com",
  mistral:       "mistral.ai",
  xai:           "x.ai",
  grok:          "x.ai",
  spacexai:      "x.ai",
  gst_einvoice:  "gst.gov.in",
  razorpay:      "razorpay.com",
  payu:          "payu.in",
  cashfree:      "cashfree.com",
  stripe:        "stripe.com",
  paddle:        "paddle.com",
  twilio:        "twilio.com",
  sendgrid:      "sendgrid.com",
  mailchimp:     "mailchimp.com",
  google:        "google.com",
  slack:         "slack.com",
  notion:        "notion.so",
  airtable:      "airtable.com",
  hubspot:       "hubspot.com",
  salesforce:    "salesforce.com",
  zapier:        "zapier.com",
  shopify:       "shopify.com",
  github:        "github.com",
  twitter:       "twitter.com",
  instagram:     "instagram.com",
  linkedin:      "linkedin.com",
  youtube:       "youtube.com",
  tiktok:        "tiktok.com",
  pinterest:     "pinterest.com",
};

function logoUrl(service: string) {
  if (service === "other") return "";
  if (service === "composio") return composioLogoUrl;
  const domain = SERVICE_DOMAINS[service.toLowerCase()] ?? `${service.toLowerCase()}.com`;
  return `https://img.logo.dev/${domain}?token=${LOGO_TOKEN}`;
}

const getFieldConfig = (service: string) => {
  if (!service) return [];
  switch (service) {
    case "zernio":
      return [
        { id: "client_id", label: "Zernio API Key", type: "password", placeholder: "sk_..." }
      ];
    case "gemini":
      return [
        { id: "access_token", label: "Google Gemini API Key", type: "password", placeholder: "AIzaSy..." }
      ];
    case "openrouter":
      return [
        { id: "access_token", label: "OpenRouter API Key", type: "password", placeholder: "sk-or-v1-..." },
        { id: "url", label: "Custom Base URL (Optional)", type: "url", placeholder: "https://openrouter.ai/api/v1" }
      ];
    case "anthropic":
      return [
        { id: "access_token", label: "Anthropic API Key", type: "password", placeholder: "sk-ant-api03-..." }
      ];
    case "openai":
      return [
        { id: "access_token", label: "OpenAI API Key", type: "password", placeholder: "sk-proj-..." },
        { id: "url", label: "Custom Base URL (Optional)", type: "url", placeholder: "https://api.openai.com/v1" }
      ];
    case "deepseek":
      return [
        { id: "access_token", label: "DeepSeek API Key", type: "password", placeholder: "sk-..." },
        { id: "url", label: "Custom Base URL (Optional)", type: "url", placeholder: "https://api.deepseek.com/v1" }
      ];
    case "groq":
      return [
        { id: "access_token", label: "Groq API Key", type: "password", placeholder: "gsk_..." }
      ];
    case "mistral":
      return [
        { id: "access_token", label: "Mistral API Key", type: "password", placeholder: "Paste your Mistral API key" }
      ];
    case "xai":
    case "grok":
    case "spacexai":
      return [
        { id: "access_token", label: "SpaceXAI / Grok API Key", type: "password", placeholder: "xai-..." }
      ];
    case "gst_einvoice":
      return [
        { id: "client_id", label: "GSTIN / API Username", type: "text", placeholder: "e.g. 27AAPFU0939F1ZV or GSP Username" },
        { id: "client_secret", label: "API Password", type: "password", placeholder: "NIC / GSP Portal Password" },
        { id: "access_token", label: "Client ID / Auth Key", type: "password", placeholder: "GSP Client ID or Bearer Token" },
        { id: "url", label: "GSP / NIC Base URL (Optional)", type: "url", placeholder: "https://einvoice1.gst.gov.in or GSP endpoint" }
      ];
    case "razorpay":
      return [
        { id: "client_id", label: "Key ID", type: "text", placeholder: "rzp_live_..." },
        { id: "client_secret", label: "Key Secret", type: "password", placeholder: "Paste your Key Secret" }
      ];
    case "payu":
      return [
        { id: "client_id", label: "Merchant Key", type: "text", placeholder: "Paste Merchant Key" },
        { id: "client_secret", label: "Merchant Salt", type: "password", placeholder: "Paste Merchant Salt" }
      ];
    case "cashfree":
      return [
        { id: "client_id", label: "App ID", type: "text", placeholder: "Paste App ID" },
        { id: "client_secret", label: "Secret Key", type: "password", placeholder: "Paste Secret Key" }
      ];
    case "webflow":
      return [
        { id: "access_token", label: "Webflow API Token (Bearer)", type: "password", placeholder: "1537d6e21cbb2fd3..." },
        { id: "client_id", label: "Webflow Site ID", type: "text", placeholder: "5b9689b27794ec383d778e79" }
      ];
    case "mcp":
      return [
        { id: "mcp_server_url", label: "MCP Server URL", type: "text", placeholder: "http://localhost:8080/mcp" }
      ];
    case "stripe":
      return [
        { id: "client_id", label: "Publishable Key", type: "text", placeholder: "pk_..." },
        { id: "access_token", label: "Secret Key", type: "password", placeholder: "sk_..." }
      ];
    case "paddle":
      return [
        { id: "client_id", label: "Vendor ID", type: "text", placeholder: "Optional" },
        { id: "access_token", label: "API Key", type: "password", placeholder: "Paste your API key" }
      ];
    case "twilio":
      return [
        { id: "client_id", label: "Account SID", type: "text", placeholder: "AC..." },
        { id: "client_secret", label: "Auth Token", type: "password", placeholder: "Paste your auth token" }
      ];
    case "twitter":
    case "instagram":
    case "facebook":
    case "linkedin":
    case "tiktok":
    case "google":
    case "slack":
    case "github":
      return [
        { id: "client_id", label: "Client ID", type: "text", placeholder: "Paste your client ID" },
        { id: "client_secret", label: "Client Secret", type: "password", placeholder: "Paste your client secret" },
        { id: "access_token", label: "Access Token (Optional)", type: "password", placeholder: "For direct API access" }
      ];
    case "other":
      return [
        { id: "access_token", label: "API Key / Token", type: "password", placeholder: "Primary token or key" },
        { id: "client_id", label: "Client ID", type: "text", placeholder: "Optional" },
        { id: "client_secret", label: "Client Secret", type: "password", placeholder: "Optional" },
        { id: "username", label: "Username", type: "text", placeholder: "Optional" },
        { id: "password", label: "Password", type: "password", placeholder: "Optional" },
        { id: "url", label: "URL Endpoint", type: "url", placeholder: "https://..." }
      ];
    default:
      return [
        { id: "access_token", label: "API Key / Token", type: "password", placeholder: "Paste your API key here" }
      ];
  }
};

export interface ConnectionsModalProps {
  open: Signal<boolean>;
  editingConnection: Signal<any | null>;
  onSaved$: PropFunction<() => void>;
}

interface FormState {
  name: string;
  label: string;
  service: string;
  client_id: string;
  client_secret: string;
  access_token: string;
  url: string;
  username: string;
  password: string;
  mcp_server_url: string;
  external_profile_id: string;
  extra: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  label: "",
  service: "",
  client_id: "",
  client_secret: "",
  access_token: "",
  url: "",
  username: "",
  password: "",
  mcp_server_url: "",
  external_profile_id: "",
  extra: "{}",
};

const inputStyle = {
  width: "100%",
  padding: "0.5rem 0.75rem",
  background: "var(--field-fill)",
  border: "1px solid var(--border)",
  borderRadius: "0.375rem",
  color: "var(--text-primary)",
  fontSize: "0.875rem",
  outline: "none",
  transition: "border-color 150ms ease",
  boxSizing: "border-box" as const,
};

const labelStyle = {
  display: "block",
  fontSize: "0.8125rem",
  fontWeight: "500" as const,
  color: "var(--text-secondary)",
  marginBottom: "0.375rem",
};

export const ConnectionsModal = component$<ConnectionsModalProps>(({ open, editingConnection, onSaved$ }) => {
  const form = useStore<FormState>({ ...EMPTY_FORM });
  const saving = useSignal(false);
  const error = useSignal<string | null>(null);
  const isProfileDropdownOpen = useSignal(false);
  const profileSearch = useSignal("");
  const isEditMode = useSignal(false);
  const fields = useComputed$(() => getFieldConfig(form.service));
  
  const fetchingProfiles = useSignal(false);
  const availableProfiles = useSignal<{id: string, name: string}[] | null>(null);

  const serviceDropdownOpen = useSignal(false);
  const serviceSearch = useSignal("");

  // Model Selection Signals
  const selectedModel = useSignal<string>("");
  const modelDropdownOpen = useSignal(false);
  const modelSearch = useSignal("");
  const customModelInput = useSignal("");
  const isCustomModel = useSignal(false);
  const isPrimary = useSignal(false);

  // Live OpenRouter models
  const liveOpenRouterModels = useSignal<any[]>([]);
  const fetchingLiveModels = useSignal(false);
  const onlyLast6Months = useSignal(true);

  const filteredServices = useComputed$(() => {
    const query = serviceSearch.value.toLowerCase().trim();
    const services = [...COMMON_SERVICES, "other"];
    if (!query) return services;
    return services.filter(s => s.toLowerCase().includes(query));
  });

  // Close dropdowns when clicking outside
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const handleDocumentPointerDown = (e: MouseEvent | PointerEvent | TouchEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;

      if (serviceDropdownOpen.value && !target.closest("[data-connection-service-dropdown]")) {
        serviceDropdownOpen.value = false;
      }
      if (modelDropdownOpen.value && !target.closest("[data-connection-model-dropdown]")) {
        modelDropdownOpen.value = false;
      }
      if (isProfileDropdownOpen.value && !target.closest("[data-connection-profile-dropdown]")) {
        isProfileDropdownOpen.value = false;
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (serviceDropdownOpen.value || modelDropdownOpen.value || isProfileDropdownOpen.value) {
          serviceDropdownOpen.value = false;
          modelDropdownOpen.value = false;
          isProfileDropdownOpen.value = false;
        }
      }
    };

    if (typeof window !== "undefined") {
      window.addEventListener("pointerdown", handleDocumentPointerDown, true);
      window.addEventListener("keydown", handleKeyDown);
      cleanup(() => {
        window.removeEventListener("pointerdown", handleDocumentPointerDown, true);
        window.removeEventListener("keydown", handleKeyDown);
      });
    }
  });

  const fetchLiveOpenRouterModels$ = $(async () => {
    fetchingLiveModels.value = true;
    try {
      const key = form.access_token || form.client_id;
      const res = await invoke<any[]>("fetch_openrouter_models", {
        apiKey: key.trim() || null,
      });
      if (Array.isArray(res) && res.length > 0) {
        liveOpenRouterModels.value = res;
      }
    } catch (e) {
      console.warn("Could not fetch live OpenRouter models:", e);
    } finally {
      fetchingLiveModels.value = false;
    }
  });

  // Cross-provider pricing map from OpenRouter live data
  const pricingMap = useComputed$(() => {
    const map: Record<string, string> = {};
    for (const m of liveOpenRouterModels.value) {
      if (m.price_formatted) {
        const idLower = m.id.toLowerCase();
        map[idLower] = m.price_formatted;
        // Also map without provider prefix (e.g. "gemini-2.5-flash", "gpt-4o", "claude-3-7-sonnet")
        const slashIdx = idLower.indexOf("/");
        if (slashIdx >= 0) {
          const shortId = idLower.substring(slashIdx + 1);
          if (!map[shortId]) {
            map[shortId] = m.price_formatted;
          }
        }
      }
    }
    return map;
  });

  const availableModels = useComputed$(() => {
    const prices = pricingMap.value;

    if (form.service === "openrouter" && liveOpenRouterModels.value.length > 0) {
      const liveList = liveOpenRouterModels.value;
      const filtered = onlyLast6Months.value 
        ? liveList.filter(m => m.is_recent || m.id.includes("gemini") || m.id.includes("claude") || m.id.includes("gpt") || m.id.includes("deepseek"))
        : liveList;

      return filtered.map(m => ({
        id: m.id,
        name: m.name,
        badge: m.badge || (m.is_recent ? "Recent" : undefined),
        price: m.price_formatted || prices[m.id.toLowerCase()],
        isRecent: m.is_recent,
      }));
    }

    const presetList = PROVIDER_MODELS[form.service] || [];
    return presetList.map(m => {
      const matchedPrice = prices[m.id.toLowerCase()] || prices[`${form.service}/${m.id}`.toLowerCase()];
      return {
        ...m,
        price: matchedPrice || m.price,
      };
    });
  });

  const filteredModels = useComputed$(() => {
    const query = modelSearch.value.toLowerCase().trim();
    const models = availableModels.value;
    if (!query) return models;
    return models.filter(m => 
      m.name.toLowerCase().includes(query) || 
      m.id.toLowerCase().includes(query) || 
      (m.badge && m.badge.toLowerCase().includes(query)) ||
      (m.price && m.price.toLowerCase().includes(query))
    );
  });

  // Sync form when panel opens/closes or editing connection changes
  useTask$(({ track }) => {
    const conn = track(() => editingConnection.value);
    const isOpen = track(() => open.value);

    if (!isOpen) {
      Object.assign(form, EMPTY_FORM);
      error.value = null;
      saving.value = false;
      isEditMode.value = false;
      availableProfiles.value = null;
      serviceDropdownOpen.value = false;
      serviceSearch.value = "";
      modelDropdownOpen.value = false;
      modelSearch.value = "";
      selectedModel.value = "";
      customModelInput.value = "";
      isCustomModel.value = false;
      isPrimary.value = false;
      return;
    }

    if (conn) {
      isEditMode.value = !!conn.id;
      form.name = conn.name ?? "";
      form.label = conn.label ?? "";
      form.service = conn.service ?? "";
      form.client_id = conn.client_id ?? "";
      form.client_secret = conn.client_secret ?? "";
      form.access_token = conn.access_token ?? "";
      form.url = conn.url ?? "";
      form.username = conn.username ?? "";
      form.password = conn.password ?? "";
      form.mcp_server_url = conn.mcp_server_url ?? "";
      form.external_profile_id = conn.external_profile_id ?? "";
      form.extra = conn.extra ?? "{}";

      // Parse default model & is_primary if available
      let model = "";
      let primaryVal = false;
      try {
        const parsed = JSON.parse(conn.extra || "{}");
        if (parsed.default_model) {
          model = parsed.default_model;
        }
        if (parsed.is_primary === true || parsed.primary === true) {
          primaryVal = true;
        }
      } catch {
        // ignore parse error
      }

      isPrimary.value = primaryVal;

      if (!model && conn.label) {
        model = conn.label;
      }

      if (!model && form.service && PROVIDER_MODELS[form.service]?.length) {
        model = PROVIDER_MODELS[form.service][0].id;
      }

      selectedModel.value = model;
      const matchingPreset = form.service ? PROVIDER_MODELS[form.service]?.find(m => m.id === model) : null;
      if (!matchingPreset && model) {
        isCustomModel.value = true;
        customModelInput.value = model;
      } else {
        isCustomModel.value = false;
        customModelInput.value = "";
      }
    } else {
      isEditMode.value = false;
      Object.assign(form, EMPTY_FORM);
      availableProfiles.value = null;
      selectedModel.value = "";
      customModelInput.value = "";
      isCustomModel.value = false;
      isPrimary.value = false;
    }

    // Always fetch OpenRouter models in background for live pricing
    if (liveOpenRouterModels.value.length === 0) {
      fetchLiveOpenRouterModels$();
    }

    error.value = null;
  });

  const handleSelectService$ = $((s: string) => {
    form.service = s;
    serviceDropdownOpen.value = false;
    serviceSearch.value = "";
    if (PROVIDER_MODELS[s]?.length) {
      selectedModel.value = PROVIDER_MODELS[s][0].id;
      isCustomModel.value = false;
      customModelInput.value = "";
    } else {
      selectedModel.value = "";
    }
  });

  const handleSelectModel$ = $((modelId: string) => {
    selectedModel.value = modelId;
    isCustomModel.value = false;
    modelDropdownOpen.value = false;
    modelSearch.value = "";
    if (!form.label.trim()) {
      form.label = modelId;
    }
  });

  const handleApplyCustomModel$ = $(() => {
    const custom = customModelInput.value.trim();
    if (custom) {
      selectedModel.value = custom;
      isCustomModel.value = true;
      modelDropdownOpen.value = false;
      if (!form.label.trim()) {
        form.label = custom;
      }
    }
  });

  const handleSave$ = $(async () => {
    if (!form.name.trim() || !form.service.trim()) {
      error.value = "Name and Service are required.";
      return;
    }

    saving.value = true;
    error.value = null;

    if (form.service === "zernio") {
      const key = form.client_id || form.access_token;
      if (!key.trim()) {
        error.value = "Zernio API Key is required.";
        saving.value = false;
        return;
      }
      try {
        const profiles = await invoke<{id: string, name: string}[]>("fetch_external_profiles", {
          service: form.service,
          apiKey: key.trim(),
        });
        if (!form.external_profile_id && profiles.length > 0) {
          form.external_profile_id = profiles[0].id;
        }
      } catch (e) {
        error.value = "Connection Test Failed: " + String(e);
        saving.value = false;
        return;
      }
    }

    // Build extra JSON
    let extraObj: Record<string, any> = {};
    try {
      extraObj = JSON.parse(form.extra || "{}");
    } catch {
      // ignore parse error
    }
    if (selectedModel.value) {
      extraObj.default_model = selectedModel.value;
    }
    extraObj.is_primary = isPrimary.value;
    const extraJson = JSON.stringify(extraObj);

    // If label is not explicitly set for AI service, give it the model ID
    let finalLabel = form.label.trim();
    if (!finalLabel && selectedModel.value) {
      finalLabel = selectedModel.value;
    }

    try {
      const payload = {
        name: form.name.trim(),
        label: finalLabel || null,
        service: form.service.trim(),
        client_id: form.client_id.trim() || null,
        client_secret: form.client_secret.trim() || null,
        access_token: form.access_token.trim() || null,
        url: form.url.trim() || null,
        username: form.username.trim() || null,
        password: form.password.trim() || null,
        mcp_server_url: form.mcp_server_url.trim() || null,
        external_profile_id: form.external_profile_id.trim() || null,
        extra: extraJson,
      };

      if (isEditMode.value && editingConnection.value?.id) {
        await invoke("update_connection", {
          id: editingConnection.value.id,
          data: payload,
        });
      } else {
        await invoke("create_connection", {
          data: payload,
        });
      }

      // If set to primary, unmark other connections marked as primary
      if (isPrimary.value) {
        try {
          const conns: any[] = await invoke("list_connections");
          if (Array.isArray(conns)) {
            for (const c of conns) {
              if (c.id !== editingConnection.value?.id && c.extra) {
                try {
                  const parsed = typeof c.extra === "string" ? JSON.parse(c.extra) : c.extra;
                  if (parsed && (parsed.is_primary || parsed.primary)) {
                    parsed.is_primary = false;
                    parsed.primary = false;
                    await invoke("update_connection", {
                      id: c.id,
                      data: {
                        name: c.name,
                        label: c.label,
                        service: c.service,
                        client_id: c.client_id,
                        client_secret: c.client_secret,
                        access_token: c.access_token,
                        url: c.url,
                        username: c.username,
                        password: c.password,
                        mcp_server_url: c.mcp_server_url,
                        external_profile_id: c.external_profile_id,
                        extra: JSON.stringify(parsed),
                      },
                    });
                  }
                } catch {
                  // ignore individual connection update error
                }
              }
            }
          }
        } catch (e) {
          console.warn("Could not unmark other primary connections:", e);
        }
      }

      // If user saved an AI connection, update agent defaults accordingly
      if (isAiService(form.service)) {
        const prov = normalizeAiProvider(form.service);
        const model = selectedModel.value || finalLabel || getDefaultModelForProvider(prov);
        try {
          localStorage.setItem("bk-agent-provider", prov);
          localStorage.setItem("bk-agent-model", model);
          localStorage.removeItem("bk-agent-model-manual"); // Reset manual override so agent adopts the new connection default
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("bk-ai-connection-updated", {
                detail: { provider: prov, model },
              })
            );
          }
        } catch {
          // ignore localstorage/event error
        }
      }

      await onSaved$();
      open.value = false;
    } catch (e) {
      error.value = String(e);
    } finally {
      saving.value = false;
    }
  });

  const handleFetchProfiles$ = $(async () => {
    const key = form.client_id || form.access_token;
    if (!key.trim()) {
      error.value = "Please enter an API Key first to fetch profiles.";
      return;
    }
    
    fetchingProfiles.value = true;
    error.value = null;
    try {
      const profiles = await invoke<{id: string, name: string}[]>("fetch_external_profiles", {
        service: form.service,
        apiKey: key,
      });
      availableProfiles.value = profiles;
      if (profiles.length === 0) {
        error.value = "No profiles found for this key.";
      } else if (profiles.length === 1) {
        form.external_profile_id = profiles[0].id;
      }
    } catch (e) {
      error.value = "Failed to fetch profiles: " + String(e);
    } finally {
      fetchingProfiles.value = false;
    }
  });

  const currentModelDetails = useComputed$(() => {
    if (!selectedModel.value) return null;
    const list = availableModels.value;
    const found = list.find(m => m.id === selectedModel.value);
    if (found) return found;
    return {
      id: selectedModel.value,
      name: selectedModel.value,
      badge: "Custom Model",
      price: pricingMap.value[selectedModel.value.toLowerCase()],
    };
  });

  return (
    <SlideOver
      open={open}
      title={isEditMode.value ? "Edit Connection" : "Add Connection"}
      subtitle={isEditMode.value ? "Update connection details and API configuration." : "Add a new AI provider, API connection, or payment gateway."}
      width="480px"
    >
      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem", minHeight: "100%" }}>
        {error.value && (
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "0.375rem",
              color: "var(--error)",
              fontSize: "0.8125rem",
              lineHeight: "1.5",
            }}
          >
            {error.value}
          </div>
        )}

        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            
            {/* Service Selector */}
            <div data-connection-service-dropdown style={{ position: "relative" }}>
              <label style={labelStyle}>Service / Provider <span style="color:var(--error);">*</span></label>
              
              <div
                onClick$={() => { if (!isEditMode.value) serviceDropdownOpen.value = !serviceDropdownOpen.value; }}
                style={{
                  ...inputStyle,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  cursor: isEditMode.value ? "not-allowed" : "pointer",
                  opacity: isEditMode.value ? 0.7 : 1,
                  userSelect: "none",
                }}
              >
                <div style="display:flex;align-items:center;gap:0.75rem;">
                  {form.service && form.service !== "other" && logoUrl(form.service) ? (
                    <img 
                      src={logoUrl(form.service)} 
                      width={20} 
                      height={20} 
                      style="width:1.25rem;height:1.25rem;border-radius:0.25rem;object-fit:cover;background:white;" 
                      alt={form.service}
                    />
                  ) : (
                    <div style="width:1.25rem;height:1.25rem;border-radius:0.25rem;background:var(--surface-3);display:flex;align-items:center;justify-content:center;font-size:0.7rem;">🔌</div>
                  )}
                  <span style={{ textTransform: "capitalize", fontWeight: form.service ? "600" : "400", color: form.service ? "var(--text-primary)" : "var(--text-secondary)" }}>
                    {form.service || "Select a service or provider..."}
                  </span>
                  {form.service && PROVIDER_MODELS[form.service] && (
                    <span style="padding:0.1rem 0.4rem;border-radius:0.25rem;font-size:0.65rem;font-weight:600;background:var(--accent-soft, rgba(99,102,241,0.12));color:var(--accent);">
                      AI Provider
                    </span>
                  )}
                </div>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style={{ transform: serviceDropdownOpen.value ? "rotate(180deg)" : "none", transition: "transform 150ms" }}>
                  <path d="M6 9l6 6 6-6"/>
                </svg>
              </div>

              {serviceDropdownOpen.value && !isEditMode.value && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    right: 0,
                    marginTop: "0.25rem",
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    borderRadius: "0.5rem",
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.2), 0 4px 6px -2px rgba(0,0,0,0.1)",
                    zIndex: 50,
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style="padding:0.5rem;border-bottom:1px solid var(--border);">
                    <input
                      type="text"
                      placeholder="Search providers & services..."
                      value={serviceSearch.value}
                      onInput$={(e) => { serviceSearch.value = (e.target as HTMLInputElement).value; }}
                      style={{
                        width: "100%",
                        padding: "0.4rem 0.6rem",
                        background: "var(--surface-3)",
                        border: "1px solid var(--border)",
                        borderRadius: "0.25rem",
                        color: "var(--text-primary)",
                        fontSize: "0.8rem",
                        outline: "none",
                        boxSizing: "border-box",
                      }}
                      autoFocus
                    />
                  </div>
                  <div style={{ maxHeight: "220px", overflowY: "auto", padding: "0.25rem" }}>
                    {filteredServices.value.length === 0 ? (
                      <div style="padding:1rem;text-align:center;color:var(--text-secondary);font-size:0.8rem;">No services found.</div>
                    ) : (
                      filteredServices.value.map(s => (
                        <div
                          key={s}
                          onClick$={() => handleSelectService$(s)}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.5rem 0.75rem",
                            cursor: "pointer",
                            borderRadius: "0.25rem",
                            transition: "background 150ms",
                            background: form.service === s ? "var(--surface-3)" : "transparent",
                          }}
                          onMouseOver$={(e) => { if (form.service !== s) (e.currentTarget as HTMLElement).style.background = "var(--surface-3)"; }}
                          onMouseOut$={(e) => { if (form.service !== s) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                        >
                          <div style="display:flex;align-items:center;gap:0.75rem;">
                            {s !== "other" ? (
                              <img 
                                src={logoUrl(s)} 
                                width={20} 
                                height={20} 
                                style="width:1.25rem;height:1.25rem;border-radius:0.25rem;object-fit:cover;background:white;" 
                                alt={s}
                              />
                            ) : (
                              <div style="width:1.25rem;height:1.25rem;border-radius:0.25rem;background:var(--surface-1);display:flex;align-items:center;justify-content:center;font-size:0.7rem;">🔌</div>
                            )}
                            <span style="font-size:0.85rem;color:var(--text-primary);text-transform:capitalize;">{s}</span>
                          </div>
                          {PROVIDER_MODELS[s] && (
                            <span style="font-size:0.65rem;color:var(--accent);font-weight:600;">AI</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Default Model Selector for AI Providers */}
            {PROVIDER_MODELS[form.service] && (
              <div data-connection-model-dropdown style={{ position: "relative" }}>
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.375rem;">
                  <label style={{ ...labelStyle, marginBottom: 0, display: "flex", alignItems: "center", gap: "0.35rem" }}>
                    <LuSparkles style="width:0.875rem;height:0.875rem;color:var(--accent);" />
                    <span>Default Model Selection</span>
                  </label>
                  
                  <button
                    type="button"
                    onClick$={fetchLiveOpenRouterModels$}
                    title="Refresh live prices across all providers"
                    style="background:none;border:none;color:var(--accent);font-size:0.7rem;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:0.25rem;"
                  >
                    <LuRefreshCw style={`width:0.75rem;height:0.75rem;${fetchingLiveModels.value ? "animation:spin 1s linear infinite;" : ""}`} />
                    <span>Live Pricing</span>
                  </button>
                </div>

                <div
                  onClick$={() => modelDropdownOpen.value = !modelDropdownOpen.value}
                  style={{
                    ...inputStyle,
                    padding: "0.6rem 0.75rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: "pointer",
                    userSelect: "none",
                    borderColor: modelDropdownOpen.value ? "var(--accent)" : "var(--border)",
                  }}
                >
                  <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;">
                    {selectedModel.value ? (
                      <>
                        <span style="font-family:monospace;font-size:0.78rem;font-weight:600;color:var(--text-primary);background:var(--surface-1);padding:0.1rem 0.4rem;border-radius:0.25rem;border:1px solid var(--border);">
                          {selectedModel.value}
                        </span>
                        <span style="font-weight:600;font-size:0.875rem;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                          {currentModelDetails.value?.name || selectedModel.value}
                        </span>
                        {currentModelDetails.value?.price && (
                          <span style="padding:0.1rem 0.4rem;border-radius:0.25rem;font-size:0.68rem;font-weight:700;background:rgba(16,185,129,0.08);color:var(--success);border:1px solid rgba(16,185,129,0.2);flex-shrink:0;">
                            {currentModelDetails.value.price}
                          </span>
                        )}
                      </>
                    ) : (
                      <span style="font-size:0.875rem;color:var(--text-secondary);">
                        Select a model...
                      </span>
                    )}
                  </div>
                  <LuChevronDown style={{ width: "1rem", height: "1rem", color: "var(--text-secondary)", transform: modelDropdownOpen.value ? "rotate(180deg)" : "none", transition: "transform 150ms", flexShrink: 0 }} />
                </div>

                {modelDropdownOpen.value && (
                  <div
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      marginTop: "0.25rem",
                      background: "var(--surface-2)",
                      border: "1px solid var(--border)",
                      borderRadius: "0.5rem",
                      boxShadow: "0 10px 24px -3px rgba(0,0,0,0.3)",
                      zIndex: 60,
                      display: "flex",
                      flexDirection: "column",
                      maxHeight: "340px",
                    }}
                  >
                    <div style="padding:0.5rem;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:0.4rem;">
                      <div style="display:flex;align-items:center;gap:0.4rem;background:var(--surface-3);padding:0.35rem 0.5rem;border-radius:0.375rem;border:1px solid var(--border);">
                        <LuSearch style="width:0.875rem;height:0.875rem;color:var(--text-secondary);flex-shrink:0;" />
                        <input
                          type="text"
                          placeholder="Filter models or search by model ID..."
                          value={modelSearch.value}
                          onInput$={(e) => { modelSearch.value = (e.target as HTMLInputElement).value; }}
                          style="background:transparent;border:none;outline:none;font-size:0.8rem;color:var(--text-primary);width:100%;"
                          autoFocus
                        />
                      </div>

                      {form.service === "openrouter" && liveOpenRouterModels.value.length > 0 && (
                        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 0.25rem;">
                          <label style="display:flex;align-items:center;gap:0.35rem;font-size:0.7rem;color:var(--text-secondary);cursor:pointer;">
                            <input
                              type="checkbox"
                              checked={onlyLast6Months.value}
                              onChange$={(e) => { onlyLast6Months.value = (e.target as HTMLInputElement).checked; }}
                              style="cursor:pointer;"
                            />
                            <span>Last 6 months models only</span>
                          </label>
                          <span style="font-size:0.68rem;color:var(--text-secondary);">
                            {filteredModels.value.length} models
                          </span>
                        </div>
                      )}
                    </div>

                    <div style="overflow-y:auto;padding:0.35rem;display:flex;flex-direction:column;gap:0.25rem;">
                      {filteredModels.value.map((m) => {
                        const isSelected = selectedModel.value === m.id;
                        return (
                          <div
                            key={m.id}
                            onClick$={() => handleSelectModel$(m.id)}
                            style={{
                              padding: "0.5rem 0.65rem",
                              borderRadius: "0.375rem",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: "0.75rem",
                              background: isSelected ? "var(--surface-3)" : "transparent",
                              border: isSelected ? "1px solid var(--border)" : "1px solid transparent",
                              transition: "background 150ms",
                            }}
                            onMouseOver$={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "var(--surface-3)"; }}
                            onMouseOut$={(e) => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
                          >
                            {/* Model ID prominently on left end */}
                            <div style="display:flex;align-items:center;gap:0.5rem;min-width:0;flex:1;">
                              <span style="font-family:monospace;font-size:0.75rem;font-weight:600;color:var(--text-primary);background:var(--surface-1);padding:0.15rem 0.45rem;border-radius:0.25rem;border:1px solid var(--border);flex-shrink:0;">
                                {m.id}
                              </span>
                              <span style="font-size:0.8125rem;font-weight:500;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                                {m.name}
                              </span>
                            </div>

                            {/* Price & Badges on right end */}
                            <div style="display:flex;align-items:center;gap:0.35rem;flex-shrink:0;">
                              {m.price && (
                                <span style="font-size:0.68rem;font-weight:600;color:var(--success);background:rgba(16,185,129,0.08);padding:0.1rem 0.35rem;border-radius:0.25rem;border:1px solid rgba(16,185,129,0.2);">
                                  {m.price}
                                </span>
                              )}
                              {m.badge && (
                                <span style="font-size:0.65rem;font-weight:600;color:var(--accent);background:var(--accent-soft, rgba(99,102,241,0.12));padding:0.1rem 0.35rem;border-radius:0.25rem;">
                                  {m.badge}
                                </span>
                              )}
                              {isSelected && (
                                <LuCheck style="width:0.875rem;height:0.875rem;color:var(--accent);" />
                              )}
                            </div>
                          </div>
                        );
                      })}

                      {/* Custom Model Input Option */}
                      <div style="margin-top:0.4rem;padding:0.5rem;border-top:1px solid var(--border);">
                        <div style="font-size:0.72rem;font-weight:600;color:var(--text-secondary);margin-bottom:0.35rem;">
                          Or enter custom model ID:
                        </div>
                        <div style="display:flex;gap:0.4rem;">
                          <input
                            type="text"
                            placeholder="e.g. google/gemini-3.5-flash-lite"
                            value={customModelInput.value}
                            onInput$={(e) => { customModelInput.value = (e.target as HTMLInputElement).value; }}
                            style={{
                              ...inputStyle,
                              padding: "0.35rem 0.5rem",
                              fontSize: "0.78rem",
                              flex: 1,
                            }}
                          />
                          <button
                            type="button"
                            onClick$={handleApplyCustomModel$}
                            style="padding:0.35rem 0.65rem;background:var(--accent);color:var(--surface-1);border:none;border-radius:0.375rem;font-size:0.75rem;font-weight:600;cursor:pointer;"
                          >
                            Set
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label style={labelStyle}>Connection Name <span style="color:var(--error);">*</span></label>
              <input
                type="text"
                value={form.name}
                onInput$={(e) => { form.name = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. Google Gemini 3.1 Flash Lite or OpenRouter Gateway"
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>
            
            <div>
              <label style={labelStyle}>Label / Model Tag (Optional)</label>
              <input
                type="text"
                value={form.label}
                onInput$={(e) => { form.label = (e.target as HTMLInputElement).value; }}
                placeholder="e.g. Default Reasoning Model or gemini-3.1-flash-lite"
                style={inputStyle}
                onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
              />
            </div>
          </div>
        </div>

        <div>
          <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            {fields.value.map((field) => (
              <div key={field.id}>
                <label style={labelStyle}>{field.label}</label>
                <div style="display:flex;gap:0.5rem;align-items:center;">
                  <input
                    type={field.type}
                    value={(form as any)[field.id]}
                    onInput$={(e) => { (form as any)[field.id] = (e.target as HTMLInputElement).value; }}
                    placeholder={field.placeholder || ""}
                    style={{...inputStyle, flex: 1}}
                    onFocus$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--accent)"; }}
                    onBlur$={(e) => { (e.target as HTMLElement).style.borderColor = "var(--border)"; }}
                  />
                  {(field.id === "client_id" || field.id === "access_token") && (form.service === "zernio" || form.service === "webflow") && (
                    <button
                      type="button"
                      onClick$={handleFetchProfiles$}
                      disabled={fetchingProfiles.value}
                      style={{
                        background: "var(--surface-3)",
                        border: "1px solid var(--border)",
                        color: "var(--text-primary)",
                        padding: "0.5rem 0.75rem",
                        borderRadius: "0.375rem",
                        fontSize: "0.8125rem",
                        fontWeight: "600",
                        cursor: fetchingProfiles.value ? "not-allowed" : "pointer",
                        whiteSpace: "nowrap",
                        height: "2.375rem",
                      }}
                    >
                      {fetchingProfiles.value ? "Fetching..." : form.service === "webflow" ? "Fetch Sites" : "Fetch Profiles"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            
            {availableProfiles.value && availableProfiles.value.length > 0 ? (
              <div data-connection-profile-dropdown style={{ marginTop: "0.5rem", padding: "1rem", background: "rgba(16, 185, 129, 0.05)", border: "1px solid rgba(16, 185, 129, 0.2)", borderRadius: "0.5rem" }}>
                <label style={{...labelStyle, color: "var(--success, #10b981)"}}>Select Profile / Workspace</label>
                <div style={{ position: "relative" }}>
                  <button
                    type="button"
                    onClick$={() => isProfileDropdownOpen.value = !isProfileDropdownOpen.value}
                    style={{
                      ...inputStyle,
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      borderColor: "rgba(16, 185, 129, 0.4)",
                    }}
                  >
                    <span>
                      {form.external_profile_id 
                        ? availableProfiles.value?.find(p => p.id === form.external_profile_id)?.name || form.external_profile_id 
                        : "-- Select one --"}
                    </span>
                    <LuChevronDown style={{ width: "1.125rem", height: "1.125rem", color: "var(--text-secondary)", flexShrink: 0 }} />
                  </button>

                  {isProfileDropdownOpen.value && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "0.25rem", background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: "0.5rem", zIndex: 50, maxHeight: "15rem", display: "flex", flexDirection: "column", boxShadow: "var(--shadow-md)" }}>
                      <div style={{ padding: "0.5rem", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        <LuSearch style={{ color: "var(--text-secondary)", width: "1rem", height: "1rem", flexShrink: 0 }} />
                        <input
                          type="text"
                          placeholder="Search profile..."
                          value={profileSearch.value}
                          onInput$={(e) => profileSearch.value = (e.target as HTMLInputElement).value}
                          style={{ border: "none", background: "transparent", outline: "none", width: "100%", fontSize: "0.875rem", color: "var(--text-primary)" }}
                        />
                      </div>
                      <div style={{ overflowY: "auto", padding: "0.25rem 0" }}>
                        {availableProfiles.value
                          .filter(p => p.name.toLowerCase().includes(profileSearch.value.toLowerCase()) || p.id.toLowerCase().includes(profileSearch.value.toLowerCase()))
                          .map(p => (
                            <div
                              key={p.id}
                              onClick$={() => { form.external_profile_id = p.id; isProfileDropdownOpen.value = false; }}
                              style={{ padding: "0.5rem 1rem", cursor: "pointer", display: "flex", alignItems: "center", gap: "0.75rem", transition: "background-color 0.15s" }}
                              onMouseOver$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "var(--muted)"; }}
                              onMouseOut$={(e) => { (e.currentTarget as HTMLElement).style.backgroundColor = "transparent"; }}
                            >
                              <div style={{ width: "1.75rem", height: "1.75rem", borderRadius: "0.375rem", background: "var(--accent)", color: "var(--surface-1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: "bold", flexShrink: 0 }}>
                                {p.name.slice(0, 2).toUpperCase()}
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div style={{ fontSize: "0.875rem", fontWeight: "500", color: "var(--text-primary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.id}</div>
                              </div>
                            </div>
                          ))}
                        {availableProfiles.value.filter(p => p.name.toLowerCase().includes(profileSearch.value.toLowerCase()) || p.id.toLowerCase().includes(profileSearch.value.toLowerCase())).length === 0 && (
                          <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-secondary)", fontSize: "0.875rem" }}>No results found</div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : form.external_profile_id ? (
              <div>
                <label style={labelStyle}>Selected Profile / Workspace ID</label>
                <input
                  type="text"
                  value={form.external_profile_id}
                  readOnly
                  style={{...inputStyle, opacity: 0.6, cursor: "not-allowed"}}
                />
              </div>
            ) : null}

            {/* Provider Helper / Documentation Cards */}
            {form.service === "gemini" && (
              <div style={{ marginTop: "0.5rem", padding: "0.875rem 1rem", borderRadius: "0.5rem", background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.25)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.375rem", color: "var(--accent)" }}>
                  <LuSparkles style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                  <span>Google Gemini API Key (Google AI Studio)</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  Obtain your API Key from: <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline", fontWeight: "600" }}><strong>Google AI Studio (aistudio.google.com)</strong></a>. Supports Gemini 3.1 Flash Lite, 3.1 Flash, 3.1 Pro, 3.5 Flash, 3.5 Flash Lite, and 3.8 Flash.
                </div>
              </div>
            )}

            {form.service === "openrouter" && (
              <div style={{ marginTop: "0.5rem", padding: "0.875rem 1rem", borderRadius: "0.5rem", background: "rgba(99, 102, 241, 0.08)", border: "1px solid rgba(99, 102, 241, 0.25)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.375rem", color: "var(--accent)" }}>
                  <LuSparkles style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                  <span>OpenRouter Unified AI Gateway</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  Access frontier models with live pricing from <a href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline", fontWeight: "600" }}><strong>OpenRouter (openrouter.ai/keys)</strong></a>. Default set to <strong>Gemini 3.5 Flash Lite</strong>.
                </div>
              </div>
            )}

            {form.service === "anthropic" && (
              <div style={{ marginTop: "0.5rem", padding: "0.875rem 1rem", borderRadius: "0.5rem", background: "rgba(217, 119, 6, 0.08)", border: "1px solid rgba(217, 119, 6, 0.25)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.375rem", color: "var(--warning, #d97706)" }}>
                  <LuInfo style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                  <span>Anthropic API Credentials</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  Generate your API Key from: <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline", fontWeight: "600" }}><strong>Anthropic Console (console.anthropic.com)</strong></a>. Default set to <strong>Sonnet 5</strong>.
                </div>
              </div>
            )}

            {form.service === "openai" && (
              <div style={{ marginTop: "0.5rem", padding: "0.875rem 1rem", borderRadius: "0.5rem", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.375rem", color: "var(--success, #10b981)" }}>
                  <LuInfo style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                  <span>OpenAI API Credentials</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  Generate your API Key from: <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)", textDecoration: "underline", fontWeight: "600" }}><strong>OpenAI Platform (platform.openai.com/api-keys)</strong></a>. Default set to <strong>GPT-5.4 Nano</strong> with <strong>GPT-5.4 Mini</strong>.
                </div>
              </div>
            )}

            {form.service === "webflow" && (
              <div style={{ marginTop: "1rem", padding: "0.875rem 1rem", borderRadius: "0.5rem", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.375rem", color: "#3b82f6" }}>
                  <LuInfo style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                  <span>Webflow API Permissions Required</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.625rem", lineHeight: "1.4" }}>
                  Generate your API Token from: <strong>Webflow Dashboard → Site Settings → Apps & Integrations → API Access</strong>
                </div>
                <table style={{ width: "100%", fontSize: "0.75rem", borderCollapse: "collapse", textAlign: "left" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ padding: "0.35rem 0", color: "#3b82f6", fontWeight: "600" }}>Permission Needed</th>
                      <th style={{ padding: "0.35rem 0", color: "var(--text-secondary)", fontWeight: "600" }}>What it Allows</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                      <td style={{ padding: "0.35rem 0", fontWeight: "600" }}>Assets → Read & write</td>
                      <td style={{ padding: "0.35rem 0", color: "var(--text-secondary)" }}>Upload / delete images</td>
                    </tr>
                    <tr>
                      <td style={{ padding: "0.35rem 0", fontWeight: "600" }}>Sites → Read</td>
                      <td style={{ padding: "0.35rem 0", color: "var(--text-secondary)" }}>List sites / get Site ID</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}

            {form.service === "gst_einvoice" && (
              <div style={{ marginTop: "1rem", padding: "0.875rem 1rem", borderRadius: "0.5rem", background: "rgba(16, 185, 129, 0.08)", border: "1px solid rgba(16, 185, 129, 0.25)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.375rem", color: "#10b981" }}>
                  <LuInfo style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                  <span>How to Get Official GST API Credentials (Free)</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.5rem", lineHeight: "1.4" }}>
                  The Indian Government provides direct API access for GST E-Invoices and E-Way bills:
                </div>
                <ol style={{ margin: "0 0 0.75rem 1.25rem", padding: 0, fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.5" }}>
                  <li>Login to the <a href="https://einvoice1.gst.gov.in" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #3b82f6)", textDecoration: "underline" }}>GST E-Invoice Portal (einvoice1.gst.gov.in)</a> or <a href="https://ewaybillgst.gov.in" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #3b82f6)", textDecoration: "underline" }}>E-Way Bill Portal (ewaybillgst.gov.in)</a>.</li>
                  <li>Go to <strong>API Registration → User Credentials → Create API User</strong>.</li>
                  <li>Select your registered GSP or Direct ERP integration and set your <strong>API Username & Password</strong>.</li>
                  <li>Enter your <strong>GSTIN / Username</strong> and <strong>API Password</strong> above to enable live verification.</li>
                </ol>
                <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", background: "var(--surface-3)", padding: "0.375rem 0.5rem", borderRadius: "0.25rem" }}>
                  💡 <em>Note: Even without live API credentials, BusinessKit's offline engine generates 100% compliant SHA-256 IRNs and signed QR payloads locally.</em>
                </div>
              </div>
            )}

            {form.service === "razorpay" && (
              <div style={{ marginTop: "1rem", padding: "0.875rem 1rem", borderRadius: "0.5rem", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.375rem", color: "#3b82f6" }}>
                  <LuInfo style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                  <span>Razorpay API Keys Instructions</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  Generate your Key ID & Secret from: <a href="https://dashboard.razorpay.com/app/keys" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #3b82f6)", textDecoration: "underline" }}><strong>Razorpay Dashboard → Account & Settings → API Keys</strong></a>.
                </div>
              </div>
            )}

            {form.service === "payu" && (
              <div style={{ marginTop: "1rem", padding: "0.875rem 1rem", borderRadius: "0.5rem", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.375rem", color: "#3b82f6" }}>
                  <LuInfo style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                  <span>PayU Merchant Credentials</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  Obtain your Merchant Key & Salt from: <a href="https://onboarding.payu.in" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #3b82f6)", textDecoration: "underline" }}><strong>PayU Dashboard → Manage Account → Keys & Credentials</strong></a>.
                </div>
              </div>
            )}

            {form.service === "cashfree" && (
              <div style={{ marginTop: "1rem", padding: "0.875rem 1rem", borderRadius: "0.5rem", background: "rgba(59, 130, 246, 0.08)", border: "1px solid rgba(59, 130, 246, 0.25)", fontSize: "0.8125rem", color: "var(--text-primary)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: "600", marginBottom: "0.375rem", color: "#3b82f6" }}>
                  <LuInfo style={{ width: "1.125rem", height: "1.125rem", flexShrink: 0 }} />
                  <span>Cashfree API Credentials</span>
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", lineHeight: "1.4" }}>
                  Generate App ID & Secret Key from: <a href="https://merchant.cashfree.com" target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent, #3b82f6)", textDecoration: "underline" }}><strong>Cashfree Dashboard → Developers → API Keys</strong></a>.
                </div>
              </div>
            )}
            {/* Primary Connection Toggle Card */}
            {form.service && (
              <div
                onClick$={() => { isPrimary.value = !isPrimary.value; }}
                style={{
                  marginTop: "0.5rem",
                  padding: "0.75rem 1rem",
                  background: isPrimary.value ? "rgba(99, 102, 241, 0.08)" : "var(--surface-3)",
                  border: `1px solid ${isPrimary.value ? "var(--accent)" : "var(--border)"}`,
                  borderRadius: "0.5rem",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "1rem",
                  transition: "all 150ms ease",
                  userSelect: "none",
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: "0.2rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                    <span style={{ fontSize: "0.8125rem", fontWeight: "600", color: "var(--text-primary)" }}>
                      Set as Primary Connection
                    </span>
                    {isPrimary.value && (
                      <span style={{ fontSize: "0.65rem", fontWeight: "700", color: "var(--accent)", background: "var(--accent-soft, rgba(99,102,241,0.15))", padding: "0.1rem 0.35rem", borderRadius: "0.25rem" }}>
                        Primary
                      </span>
                    )}
                  </div>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-secondary)", lineHeight: "1.35" }}>
                    {isAiService(form.service)
                      ? "Set as default AI provider & model selection across Agent Chat and background tasks."
                      : "Set as the primary integration when multiple connections exist."}
                  </span>
                </div>

                <input
                  type="checkbox"
                  checked={isPrimary.value}
                  onChange$={(e) => { isPrimary.value = (e.target as HTMLInputElement).checked; }}
                  onClick$={(e) => e.stopPropagation()}
                  style={{
                    width: "1.125rem",
                    height: "1.125rem",
                    accentColor: "var(--accent)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                />
              </div>
            )}
          </div>
        </div>

        {/* Action Button Footer */}
        <div
          style={{
            position: "sticky",
            bottom: "-1.5rem",
            marginTop: "auto",
            marginInline: "-1.5rem",
            marginBottom: "-1.5rem",
            padding: "1rem 1.5rem",
            background: "var(--surface-2)",
            borderTop: "1px solid var(--border)",
            zIndex: 10,
          }}
        >
          <button
            onClick$={handleSave$}
            disabled={saving.value}
            style={{
              width: "100%",
              height: "2.625rem",
              background: saving.value ? "var(--muted)" : "var(--button-primary-bg)",
              color: saving.value ? "var(--text-secondary)" : "var(--button-primary-text)",
              border: "none",
              borderRadius: "0.375rem",
              fontSize: "0.875rem",
              fontWeight: "600",
              cursor: saving.value ? "not-allowed" : "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.5rem",
              transition: "background 150ms ease, opacity 150ms ease",
            }}
          >
            {saving.value ? (
              <>
                <LuLoader style="width:1rem;height:1rem;animation:spin 1s linear infinite;" stroke-width="1" />
                Testing & Saving…
              </>
            ) : (
              <>
                <LuSave style="width:1rem;height:1rem;" stroke-width="1" />
                {isEditMode.value ? "Save Changes" : "Save Connection"}
              </>
            )}
          </button>
        </div>
      </div>
    </SlideOver>
  );
});

/**
 * Models & API Keys Settings Tab — Manages API credentials per scope (account, org, project).
 * Enforces one key per provider per scope, verifies connections before saving with
 * interactive animations, displays provider brand icons, and prevents duplicates.
 * Also configures the default global chat provider and model using the ChatComposer modal design.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Brain,
  Check,
  ChevronDown,
  CircleAlert,
  Edit2,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProviderIcon } from "@/components/ProviderIcon";
import {
  ALLOWED_VENDORS,
  FLAGSHIP_PATTERNS,
  MAX_MODEL_AGE_DAYS,
  providerDisplayName,
  vendorFromProviderOrModel,
  vendorOf,
  providerOfModel,
  vendorLabel,
  shortName,
  formatModelDisplay,
  fmtCtx,
  fmtPrice,
} from "@/components/ChatComposer";
import { api, LLM_PROVIDERS, type LlmKeyView, type LlmScope, type OpenrouterModel } from "@/lib/api";
import { cn } from "@/lib/utils";

export const DEFAULT_PROVIDER_KEY = "superconsole_default_provider";
export const DEFAULT_MODEL_KEY = "superconsole_default_model";
export const DEFAULT_PROVIDER_CHANGE_EVENT = "superconsole-default-provider-change";

export function getGlobalDefaultProvider(): string {
  if (typeof window === "undefined") return "gemini";
  return localStorage.getItem(DEFAULT_PROVIDER_KEY) || "gemini";
}

export function getGlobalDefaultModel(provider?: string): string {
  const prov = provider || getGlobalDefaultProvider();
  if (typeof window !== "undefined") {
    const saved = localStorage.getItem(DEFAULT_MODEL_KEY);
    const savedProv = localStorage.getItem(DEFAULT_PROVIDER_KEY);
    if (saved && (!provider || provider === savedProv)) {
      return saved;
    }
  }
  if (prov === "anthropic") return "claude-sonnet-4-5";
  if (prov === "openai") return "gpt-5";
  if (prov === "openrouter") return "google/gemini-3.8-flash";
  if (prov === "local") return "llama3.2";
  return "gemini-3.8-flash";
}

// In-memory module caches so switching between settings tabs does not re-fetch or flicker
let cachedOrModels: OpenrouterModel[] = [];
const inMemoryKeysCache = new Map<string, LlmKeyView[]>();

export function DefaultModelSelector() {
  const [provider, setProvider] = useState<string>(() => getGlobalDefaultProvider());
  const [model, setModel] = useState<string>(() => getGlobalDefaultModel());
  const [orModels, setOrModels] = useState<OpenrouterModel[]>(() => cachedOrModels);
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeVendor, setActiveVendor] = useState<string>(() =>
    vendorFromProviderOrModel(getGlobalDefaultProvider(), getGlobalDefaultModel()),
  );
  const [modelQuery, setModelQuery] = useState("");
  const [customModel, setCustomModel] = useState(false);
  const [customInput, setCustomInput] = useState("");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (cachedOrModels.length === 0) {
      api
        .listOpenrouterModels()
        .then((list) => {
          cachedOrModels = list;
          setOrModels(list);
        })
        .catch(() => {});
    }
    api.getSettings().then((s) => {
      if (s.default_chat_provider) {
        setProvider(s.default_chat_provider);
        localStorage.setItem(DEFAULT_PROVIDER_KEY, s.default_chat_provider);
      }
      if (s.default_chat_model) {
        setModel(s.default_chat_model);
        localStorage.setItem(DEFAULT_MODEL_KEY, s.default_chat_model);
      }
    }).catch(console.error);
  }, []);

  const orModel = useMemo(() => {
    if (!model) return undefined;
    const target = model.toLowerCase();
    return (
      orModels.find((m) => m.id === model) ||
      orModels.find((m) => m.id.toLowerCase() === target) ||
      orModels.find((m) => m.id.toLowerCase() === `${provider}/${target}`.toLowerCase()) ||
      orModels.find((m) => m.id.toLowerCase().endsWith(`/${target}`)) ||
      orModels.find((m) => target.endsWith(`/${m.id.toLowerCase()}`))
    );
  }, [orModels, model, provider]);

  const vendorGroups = useMemo(() => {
    const cutoff = Date.now() / 1000 - MAX_MODEL_AGE_DAYS * 86400;
    const byCreatedDesc = (a: OpenrouterModel, b: OpenrouterModel) => b.created - a.created;
    const byVendor = new Map<string, OpenrouterModel[]>();
    for (const m of orModels) {
      const v = vendorOf(m.id);
      if (m.created && m.created < cutoff) continue;
      if (!byVendor.has(v)) byVendor.set(v, []);
      byVendor.get(v)!.push(m);
    }
    const flagship = orModels
      .filter((m) => FLAGSHIP_PATTERNS.some((p) => m.id.toLowerCase().includes(p)))
      .sort(byCreatedDesc);
    const out: [string, OpenrouterModel[]][] = [];
    for (const v of ALLOWED_VENDORS) {
      if (v === "openrouter") {
        if (flagship.length) {
          out.push(["openrouter", flagship]);
        } else {
          out.push([
            "openrouter",
            [
              { id: "google/gemini-3.8-flash", name: "Google: Gemini 3.8 Flash", context_length: 1000000, prompt_price: 0.15e-6, completion_price: 0.6e-6, supports_reasoning: true, created: Date.now() / 1000 },
              { id: "anthropic/claude-sonnet-4.5", name: "Anthropic: Claude Sonnet 5 / 4.5", context_length: 200000, prompt_price: 3e-6, completion_price: 15e-6, supports_reasoning: true, created: Date.now() / 1000 },
              { id: "openai/gpt-5", name: "OpenAI: GPT-5", context_length: 128000, prompt_price: 2.5e-6, completion_price: 10e-6, supports_reasoning: true, created: Date.now() / 1000 },
            ],
          ]);
        }
      } else if (byVendor.has(v) && byVendor.get(v)!.length > 0) {
        out.push([v, byVendor.get(v)!.sort(byCreatedDesc)]);
      } else if (v === "google") {
        out.push([
          "google",
          [
            { id: "gemini-3.8-flash", name: "Google: Gemini 3.8 Flash", context_length: 1000000, prompt_price: 0.15e-6, completion_price: 0.6e-6, supports_reasoning: true, created: Date.now() / 1000 },
            { id: "gemini-2.5-flash", name: "Google: Gemini 2.5 Flash", context_length: 1000000, prompt_price: 0.15e-6, completion_price: 0.6e-6, supports_reasoning: false, created: Date.now() / 1000 },
            { id: "gemini-2.5-pro", name: "Google: Gemini 2.5 Pro", context_length: 1000000, prompt_price: 1.25e-6, completion_price: 5e-6, supports_reasoning: true, created: Date.now() / 1000 },
          ],
        ]);
      } else if (v === "anthropic") {
        out.push([
          "anthropic",
          [
            { id: "claude-sonnet-4-5", name: "Anthropic: Claude Sonnet 5 / 4.5", context_length: 200000, prompt_price: 3e-6, completion_price: 15e-6, supports_reasoning: true, created: Date.now() / 1000 },
            { id: "claude-3-5-sonnet-latest", name: "Anthropic: Claude 3.5 Sonnet", context_length: 200000, prompt_price: 3e-6, completion_price: 15e-6, supports_reasoning: false, created: Date.now() / 1000 },
            { id: "claude-opus-4-1", name: "Anthropic: Claude Opus", context_length: 200000, prompt_price: 15e-6, completion_price: 75e-6, supports_reasoning: true, created: Date.now() / 1000 },
          ],
        ]);
      } else if (v === "openai") {
        out.push([
          "openai",
          [
            { id: "gpt-5", name: "OpenAI: GPT-5", context_length: 128000, prompt_price: 2.5e-6, completion_price: 10e-6, supports_reasoning: true, created: Date.now() / 1000 },
            { id: "gpt-4o", name: "OpenAI: GPT-4o", context_length: 128000, prompt_price: 2.5e-6, completion_price: 10e-6, supports_reasoning: false, created: Date.now() / 1000 },
            { id: "o3", name: "OpenAI: o3", context_length: 200000, prompt_price: 10e-6, completion_price: 40e-6, supports_reasoning: true, created: Date.now() / 1000 },
          ],
        ]);
      }
    }
    return out;
  }, [orModels]);

  const modelLabel = formatModelDisplay(model, orModel);

  const baseList =
    vendorGroups.find(([v]) => v === activeVendor)?.[1] ?? vendorGroups[0]?.[1] ?? [];

  const activeList = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return baseList;
    return baseList.filter(
      (m) =>
        m.id.toLowerCase().includes(q) ||
        m.name.toLowerCase().includes(q),
    );
  }, [baseList, modelQuery]);

  const persist = (nextProvider: string, nextModel: string) => {
    setProvider(nextProvider);
    setModel(nextModel);
    localStorage.setItem(DEFAULT_PROVIDER_KEY, nextProvider);
    localStorage.setItem(DEFAULT_MODEL_KEY, nextModel);
    api.setSetting("default_chat_provider", nextProvider).catch(console.error);
    api.setSetting("default_chat_model", nextModel).catch(console.error);
    window.dispatchEvent(
      new CustomEvent(DEFAULT_PROVIDER_CHANGE_EVENT, {
        detail: { provider: nextProvider, model: nextModel },
      }),
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const handleSelectModel = (id: string) => {
    const resolvedProvider =
      activeVendor === "openrouter"
        ? "openrouter"
        : activeVendor === "google"
          ? "gemini"
          : activeVendor === "anthropic"
            ? "anthropic"
            : activeVendor === "openai"
              ? "openai"
              : providerOfModel(id);
    persist(resolvedProvider, id);
    setMenuOpen(false);
  };

  const handleApplyCustom = () => {
    const trimmed = customInput.trim();
    if (!trimmed) return;
    persist(providerOfModel(trimmed), trimmed);
    setCustomModel(false);
    setMenuOpen(false);
  };

  return (
    <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">Default AI Model & Provider</h3>
            {saved && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-500 animate-in fade-in duration-200">
                <Check className="h-3 w-3" />
                Default Updated
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
            The primary model and provider initialized automatically in new chat sessions.
          </p>
        </div>

        {/* Simplified Model Selector Trigger (identical to ChatComposer.tsx) */}
        <div className="shrink-0">
          <DropdownMenu
            open={menuOpen}
            onOpenChange={(o) => {
              setMenuOpen(o);
              if (o) {
                setModelQuery("");
                setActiveVendor(vendorFromProviderOrModel(provider, model));
              }
            }}
          >
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="flex h-8 max-w-[340px] items-center gap-1.5 rounded-lg border border-border/80 bg-background/80 px-2.5 text-xs font-medium text-foreground hover:bg-accent hover:border-border transition-colors shadow-2xs cursor-pointer"
                title={`Default Provider: ${providerDisplayName(provider)} | Model: ${modelLabel}`}
              >
                <ProviderIcon provider={provider} className="h-4 w-4 shrink-0 opacity-90" />
                <span className="font-semibold text-foreground/90 shrink-0">
                  {providerDisplayName(provider)}
                </span>
                <span className="text-muted-foreground/40 font-mono text-[11px]">/</span>
                <ProviderIcon model={model} className="h-4 w-4 shrink-0 opacity-40 grayscale" />
                <span className="truncate text-muted-foreground font-mono text-xs">
                  {modelLabel}
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-50 ml-1" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="bottom" className="w-[34rem] p-0 shadow-lg">
              <div className="border-b p-2">
                <input
                  autoFocus
                  value={modelQuery}
                  onChange={(e) => setModelQuery(e.target.value)}
                  onKeyDown={(e) => e.stopPropagation()}
                  placeholder={
                    orModels.length
                      ? `Search ${vendorLabel(activeVendor)} models…`
                      : "Loading models…"
                  }
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-xs focus-visible:outline-none"
                />
              </div>
              {orModels.length === 0 ? (
                <div className="flex h-72 items-center justify-center p-3 text-xs text-muted-foreground">
                  <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                  Loading models…
                </div>
              ) : (
                <div className="flex h-72">
                  {/* Left column — providers */}
                  <div className="w-44 shrink-0 overflow-y-auto border-r p-1">
                    {vendorGroups.map(([vendor, list]) => (
                      <button
                        key={vendor}
                        type="button"
                        onMouseEnter={() => setActiveVendor(vendor)}
                        onClick={() => setActiveVendor(vendor)}
                        className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                          vendor === activeVendor
                            ? "bg-accent font-medium text-foreground"
                            : "hover:bg-accent/50 text-muted-foreground"
                        }`}
                      >
                        <ProviderIcon model={`${vendor}/x`} className="h-4 w-4 opacity-80" />
                        <span className="truncate">{vendorLabel(vendor)}</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {list.length}
                        </span>
                      </button>
                    ))}
                  </div>
                  {/* Right column — models for active provider */}
                  <div className="flex-1 overflow-y-auto p-1">
                    {activeList.length === 0 ? (
                      <div className="p-3 text-xs text-muted-foreground">No matching models found</div>
                    ) : (
                      activeList.map((m) => {
                        const selected = m.id === model;
                        return (
                          <DropdownMenuItem
                            key={m.id}
                            onClick={() => handleSelectModel(m.id)}
                            className={`flex flex-col items-start gap-0.5 py-1.5 cursor-pointer ${
                              selected ? "bg-accent font-medium" : ""
                            }`}
                          >
                            <span className="flex w-full items-center gap-1.5">
                              <ProviderIcon model={m.id} className="h-3.5 w-3.5 shrink-0 opacity-60" />
                              <span className="truncate text-xs">{shortName(m.name)}</span>
                              {m.supports_reasoning && (
                                <Brain className="h-3 w-3 shrink-0 opacity-50 text-primary" />
                              )}
                              {selected && <Check className="ml-auto h-3.5 w-3.5 shrink-0 text-primary" />}
                            </span>
                            <span className="pl-5 text-[10px] text-muted-foreground font-mono">
                              {fmtCtx(m.context_length)} ctx · in {fmtPrice(m.prompt_price)} / out{" "}
                              {fmtPrice(m.completion_price)} per 1M
                            </span>
                          </DropdownMenuItem>
                        );
                      })
                    )}
                  </div>
                </div>
              )}
              <div className="border-t p-1.5">
                {customModel ? (
                  <div className="flex items-center gap-2 px-1 py-0.5">
                    <input
                      value={customInput}
                      onChange={(e) => setCustomInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleApplyCustom()}
                      placeholder="e.g. gemini-3.8-flash, claude-3-7-sonnet, or openai/o3"
                      className="h-7 text-xs font-mono flex-1 rounded border bg-background px-2"
                    />
                    <Button size="sm" className="h-7 text-xs" onClick={handleApplyCustom} disabled={!customInput.trim()}>
                      Set
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setCustomModel(false)}>
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <DropdownMenuItem
                    onClick={() => {
                      setCustomModel(true);
                      setCustomInput("");
                    }}
                    className="text-xs text-muted-foreground cursor-pointer"
                  >
                    Custom model ID…
                  </DropdownMenuItem>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </div>
  );
}

interface ModelsSectionProps {
  scope: LlmScope;
  scopeId: string;
  description: string;
}

export function ModelsSection({ scope, scopeId, description }: ModelsSectionProps) {
  const cacheKey = `${scope}:${scopeId}`;
  const cachedKeys = inMemoryKeysCache.get(cacheKey) || [];

  const [keys, setKeys] = useState<LlmKeyView[]>(cachedKeys);
  const [loading, setLoading] = useState(cachedKeys.length === 0);
  const [provider, setProvider] = useState<string>("gemini");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [extraEnv, setExtraEnv] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [editingProvider, setEditingProvider] = useState<string | null>(null);

  // Verification & saving animation states: "idle" | "testing" | "saving" | "saved" | "error"
  const [saveStatus, setSaveStatus] = useState<"idle" | "testing" | "saving" | "saved" | "error">("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = async (background = false) => {
    try {
      if (!background) setLoading(true);
      const res = await api.listLlmKeys(scope, scopeId);
      inMemoryKeysCache.set(cacheKey, res);
      setKeys(res);
    } catch (e) {
      if (!background) setErrorMessage(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const existing = inMemoryKeysCache.get(cacheKey);
    setEditingProvider(null);
    setApiKey("");
    setBaseUrl("");
    setModel("");
    setExtraEnv("");
    setSaveStatus("idle");
    setErrorMessage(null);

    if (existing && existing.length > 0) {
      setKeys(existing);
      setLoading(false);
      // Silent background revalidation
      load(true);
    } else {
      setKeys([]);
      load(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cacheKey]);

  // Set of providers that already have a key configured at this level
  const configuredProviderIds = new Set(keys.filter((k) => k.has_key).map((k) => k.provider));

  // Filter out already added providers so users cannot add duplicate keys per level
  const availableProviders = LLM_PROVIDERS.filter((p) => {
    if (editingProvider === p.id) return true;
    return !configuredProviderIds.has(p.id);
  });

  // Keep selected provider aligned with available list
  useEffect(() => {
    if (!editingProvider && availableProviders.length > 0) {
      if (!availableProviders.some((p) => p.id === provider)) {
        setProvider(availableProviders[0].id);
      }
    }
  }, [availableProviders, provider, editingProvider]);

  const handleEdit = (k: LlmKeyView) => {
    setEditingProvider(k.provider);
    setProvider(k.provider);
    setApiKey("");
    setBaseUrl(k.base_url ?? "");
    setModel(k.model ?? "");
    setExtraEnv(k.extra_env ?? "");
    setSaveStatus("idle");
    setErrorMessage(null);
    setShowKey(false);
  };

  const handleCancelEdit = () => {
    setEditingProvider(null);
    setApiKey("");
    setBaseUrl("");
    setModel("");
    setExtraEnv("");
    setSaveStatus("idle");
    setErrorMessage(null);
    if (availableProviders.length > 0) {
      setProvider(availableProviders[0].id);
    }
  };

  const handleTestAndSave = async (skipTest = false) => {
    const trimmedKey = apiKey.trim();
    const existing = keys.find((k) => k.provider === provider);

    // If adding a new key, a key is required unless local
    if (!existing?.has_key && provider !== "local" && !trimmedKey) {
      setErrorMessage("Please enter an API key for " + provider);
      return;
    }

    setErrorMessage(null);

    // Step 1: Test before saving
    if (!skipTest && trimmedKey) {
      setSaveStatus("testing");
      setStatusMessage(`Testing connection to ${provider}...`);
      try {
        await api.testLlmKey(provider, trimmedKey, baseUrl || null);
      } catch (testErr) {
        setSaveStatus("error");
        setErrorMessage(String(testErr));
        return;
      }
    }

    // Step 2: Encrypt & save in SQLite / Turso cloud
    setSaveStatus("saving");
    setStatusMessage(`Encrypting and saving ${provider} credentials...`);
    try {
      await api.setLlmKey(
        scope,
        scopeId,
        provider,
        trimmedKey,
        baseUrl || null,
        model || null,
        extraEnv || null,
      );
      setSaveStatus("saved");
      setStatusMessage("Connection verified & key securely saved!");
      await load();
      setTimeout(() => {
        setSaveStatus("idle");
        setStatusMessage(null);
        setEditingProvider(null);
        setApiKey("");
        setBaseUrl("");
        setModel("");
        setExtraEnv("");
      }, 2000);
    } catch (saveErr) {
      setSaveStatus("error");
      setErrorMessage(String(saveErr));
    }
  };

  const handleRemove = async (prov: string) => {
    setErrorMessage(null);
    try {
      await api.deleteLlmKey(scope, scopeId, prov);
      await load();
      if (editingProvider === prov) {
        handleCancelEdit();
      }
    } catch (e) {
      setErrorMessage(String(e));
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Header description */}
      <div>
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Model Credentials & API Keys
        </h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          {description} Credentials are encrypted with zero-knowledge keys scoped to this level.
        </p>
      </div>

      {/* Global Default Model & Provider Configuration (Account Scope) */}
      {scope === "account" && <DefaultModelSelector />}

      {/* Configured Keys List */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-foreground">Active Providers</h3>
            <p className="text-xs text-muted-foreground">
              Configured providers ready for chat, agents, and tool execution.
            </p>
          </div>
          <span className="text-xs font-mono text-muted-foreground">
            {keys.filter((k) => k.has_key).length} configured
          </span>
        </div>

        {loading ? (
          <div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin mr-2" />
            Loading provider keys...
          </div>
        ) : keys.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-6 text-center">
            <KeyRound className="mx-auto h-7 w-7 text-muted-foreground/60 mb-2" />
            <p className="text-xs font-medium text-foreground">No API keys added yet</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Add your Google Gemini, Anthropic, OpenAI, or OpenRouter keys below.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-2.5">
            {keys.map((k) => {
              const preset = LLM_PROVIDERS.find((p) => p.id === k.provider);
              const isEditing = editingProvider === k.provider;

              return (
                <div
                  key={k.provider}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-3 transition-colors",
                    isEditing
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border/80 bg-card/60 hover:bg-muted/30",
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted/40">
                      <ProviderIcon provider={k.provider} className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground">
                          {preset?.label ?? k.provider}
                        </span>
                        {k.has_key ? (
                          <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-500">
                            <Check className="h-2.5 w-2.5 stroke-[2.5]" />
                            Configured & Active
                          </span>
                        ) : (
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            No Key
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] font-mono text-muted-foreground">
                        {k.model && <span>Model: {k.model}</span>}
                        {k.base_url && (
                          <span className="truncate max-w-xs">Base: {k.base_url}</span>
                        )}
                        {k.updated_at && (
                          <span className="text-muted-foreground/60 text-[10px]">
                            Updated {k.updated_at.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-3">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                      onClick={() => handleEdit(k)}
                    >
                      <Edit2 className="h-3 w-3 mr-1" />
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:bg-destructive/10"
                      onClick={() => handleRemove(k.provider)}
                      title="Delete key"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Key Form Card */}
      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">
              {editingProvider ? `Edit ${editingProvider} Configuration` : "Add Provider Key"}
            </h3>
            {saveStatus === "saved" && (
              <span className="flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-medium text-emerald-500 animate-in fade-in duration-200">
                <Check className="h-3 w-3" />
                Verified & Saved
              </span>
            )}
          </div>
          {editingProvider && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleCancelEdit}
              className="h-7 text-xs"
            >
              Cancel Edit
            </Button>
          )}
        </div>

        {!editingProvider && availableProviders.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border/80 p-4 text-center">
            <Check className="mx-auto h-5 w-5 text-emerald-500 mb-1" />
            <p className="text-xs font-medium text-foreground">
              All supported AI providers are configured for this level
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Only one key per provider is allowed at this scope. Click &quot;Edit&quot; on any card above to update its key or endpoint.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {/* Provider Selector with Icon */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Select AI Provider
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                {availableProviders.map((p) => {
                  const isSelected = provider === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!!editingProvider && editingProvider !== p.id}
                      onClick={() => {
                        setProvider(p.id);
                        setErrorMessage(null);
                        setSaveStatus("idle");
                      }}
                      className={cn(
                        "flex items-center gap-2 rounded-lg border p-2.5 text-left text-xs transition-colors",
                        isSelected
                          ? "border-primary bg-primary/10 text-primary font-medium ring-1 ring-primary/30"
                          : "border-border/80 bg-background hover:bg-muted/40 text-foreground",
                      )}
                    >
                      <ProviderIcon provider={p.id} className="h-4 w-4 shrink-0" />
                      <span className="truncate">{p.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* API Key Input */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                API Key
              </label>
              <div className="relative">
                <Input
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setErrorMessage(null);
                  }}
                  placeholder={
                    editingProvider
                      ? "•••••••• set (leave blank to keep current key)"
                      : `Enter ${provider} API key`
                  }
                  type={showKey ? "text" : "password"}
                  className="h-8 font-mono text-xs pr-8"
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Base URL & Default Model (Two Columns) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Custom Base URL <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder={
                    provider === "local"
                      ? "http://localhost:11434"
                      : "https://api.example.com/v1"
                  }
                  className="h-8 font-mono text-xs"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Default Model <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={
                    provider === "gemini"
                      ? "gemini-3.8-flash"
                      : provider === "anthropic"
                        ? "claude-sonnet-4-5"
                        : "e.g. gpt-5"
                  }
                  className="h-8 font-mono text-xs"
                />
              </div>
            </div>

            {/* Extra Environment Variables */}
            <div>
              <label className="block text-xs font-medium text-foreground mb-1">
                Extra Environment Variables <span className="text-muted-foreground font-normal">(optional, KEY=VALUE per line)</span>
              </label>
              <textarea
                value={extraEnv}
                onChange={(e) => setExtraEnv(e.target.value)}
                placeholder={"CUSTOM_HEADER=value\nTIMEOUT_SECONDS=60"}
                rows={2}
                className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 font-mono text-xs focus-visible:outline-none focus-within:ring-1 focus-within:ring-ring"
              />
            </div>

            {/* Error Banner */}
            {errorMessage && (
              <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive animate-in fade-in duration-150">
                <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium">Connection Test Failed</p>
                  <p className="mt-0.5 text-[11px] opacity-90 leading-relaxed font-mono">{errorMessage}</p>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleTestAndSave(true)}
                    className="h-6 mt-1.5 px-2 text-[11px] text-destructive hover:bg-destructive/20 underline"
                  >
                    Save anyway without verifying
                  </Button>
                </div>
              </div>
            )}

            {/* Test & Save Button with Interactive Feedback */}
            <div className="pt-2 flex items-center gap-3">
              <Button
                size="sm"
                onClick={() => handleTestAndSave(false)}
                disabled={saveStatus === "testing" || saveStatus === "saving"}
                className={cn(
                  "gap-1.5 transition-all",
                  saveStatus === "saved" && "bg-emerald-600 hover:bg-emerald-600 text-white",
                )}
              >
                {saveStatus === "testing" ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Testing connection...
                  </>
                ) : saveStatus === "saving" ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    Encrypting & saving...
                  </>
                ) : saveStatus === "saved" ? (
                  <>
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                    Verified & Saved!
                  </>
                ) : (
                  <>
                    <ShieldCheck className="h-3.5 w-3.5" />
                    Test Connection & Save
                  </>
                )}
              </Button>

              {statusMessage && saveStatus !== "error" && (
                <span className="text-xs text-muted-foreground animate-in fade-in duration-150">
                  {statusMessage}
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Alias for backwards compatibility
export const LlmKeyEditor = ModelsSection;

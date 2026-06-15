import { useEffect, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSessionUser } from "./server/auth";
import { errorText } from "./err";
import {
  deleteLlmKey,
  listLlmKeys,
  setLlmKey,
  type LlmKeyRow,
  type LlmScope,
} from "./server/llm";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "local", label: "Local" },
];

const fetchKeys = createServerFn({ method: "GET" })
  .validator((d: { scope: LlmScope; scopeId: string }) => d)
  .handler(async ({ data }): Promise<LlmKeyRow[]> => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return listLlmKeys(user, data.scope, data.scopeId);
  });

const saveKey = createServerFn({ method: "POST" })
  .validator(
    (d: {
      scope: LlmScope;
      scopeId: string;
      provider: string;
      apiKey: string;
      baseUrl: string | null;
      model: string | null;
      extraEnv: string | null;
    }) => d,
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await setLlmKey(user, data.scope, data.scopeId, {
      provider: data.provider,
      apiKey: data.apiKey,
      baseUrl: data.baseUrl,
      model: data.model,
      extraEnv: data.extraEnv,
    });
  });

const removeKey = createServerFn({ method: "POST" })
  .validator((d: { scope: LlmScope; scopeId: string; provider: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await deleteLlmKey(user, data.scope, data.scopeId, data.provider);
  });

export function LlmKeyEditor({
  scope,
  scopeId,
}: {
  scope: LlmScope;
  scopeId: string;
}) {
  const [keys, setKeys] = useState<LlmKeyRow[]>([]);
  const [provider, setProvider] = useState(PROVIDERS[0].id);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("");
  const [extraEnv, setExtraEnv] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    fetchKeys({ data: { scope, scopeId } })
      .then(setKeys)
      .catch((e) => setError(errorText(e)));
  };

  useEffect(() => {
    setKeys([]);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeId]);

  useEffect(() => {
    const existing = keys.find((k) => k.provider === provider);
    setApiKey("");
    setBaseUrl(existing?.baseUrl ?? "");
    setModel(existing?.model ?? "");
    setExtraEnv(existing?.extraEnv ?? "");
  }, [provider, keys]);

  const current = keys.find((k) => k.provider === provider);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await saveKey({
        data: {
          scope,
          scopeId,
          provider,
          apiKey,
          baseUrl: baseUrl || null,
          model: model || null,
          extraEnv: extraEnv || null,
        },
      });
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (p: string) => {
    setBusy(true);
    setError(null);
    try {
      await removeKey({ data: { scope, scopeId, provider: p } });
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {keys.length > 0 && (
        <div className="card">
          <div className="connector-list" style={{ marginTop: 0 }}>
            {keys.map((k) => (
              <div key={k.provider} className="connector-row">
                <span style={{ textTransform: "capitalize" }}>
                  {k.provider}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {" "}
                    · {k.hasKey ? "key set" : "no key"}
                    {k.baseUrl ? ` · ${k.baseUrl}` : ""}
                    {k.model ? ` · ${k.model}` : ""}
                  </span>
                </span>
                <button
                  className="btn ghost"
                  style={{ padding: "4px 10px", fontSize: 12 }}
                  disabled={busy}
                  onClick={() => remove(k.provider)}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="field">
          <select
            className="select"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            className="input mono"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={
              current?.hasKey ? "•••• set (leave blank to keep)" : "API key"
            }
          />
          <input
            className="input mono"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
            placeholder="Base URL (optional)"
          />
          <input
            className="input mono"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Default model (optional)"
          />
          <textarea
            className="textarea mono"
            rows={3}
            value={extraEnv}
            onChange={(e) => setExtraEnv(e.target.value)}
            placeholder="Extra env vars (KEY=VALUE per line, optional)"
          />
          <div className="row end">
            <button className="btn" disabled={busy} onClick={save}>
              {busy ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <p className="muted" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}
    </>
  );
}

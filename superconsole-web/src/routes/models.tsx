import { useEffect, useState } from "react";
import { Link, createFileRoute, redirect } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { getSessionUser } from "../server/auth";
import { loadDashboard } from "../server/data";
import {
  deleteLlmKey,
  listLlmKeys,
  setLlmKey,
  type LlmKeyRow,
  type LlmScope,
} from "../server/llm";

const PROVIDERS = [
  { id: "anthropic", label: "Anthropic" },
  { id: "openai", label: "OpenAI" },
  { id: "gemini", label: "Gemini" },
  { id: "openrouter", label: "OpenRouter" },
  { id: "local", label: "Local" },
];

const getMeta = createServerFn({ method: "GET" })
  .validator((orgId: string | undefined) => orgId)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return loadDashboard(user, data);
  });

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

export const Route = createFileRoute("/models")({
  validateSearch: (search: Record<string, unknown>) => ({
    org: typeof search.org === "string" ? search.org : undefined,
  }),
  loaderDeps: ({ search }) => ({ org: search.org }),
  loader: ({ deps }) => getMeta({ data: deps.org }),
  component: Models,
});

type Tab = LlmScope;

function Models() {
  const data = Route.useLoaderData();
  const [tab, setTab] = useState<Tab>("account");
  const [projectId, setProjectId] = useState<string>(
    data.projects[0]?.id ?? "",
  );

  const scopeId =
    tab === "account" ? "" : tab === "org" ? (data.activeOrg?.id ?? "") : projectId;

  return (
    <div className="shell">
      <div className="topbar">
        <span className="brand">SuperConsole</span>
        <div className="row" style={{ gap: 12 }}>
          <Link to="/" className="btn ghost">
            Dashboard
          </Link>
          <Link to="/logout" className="btn ghost">
            Sign out
          </Link>
        </div>
      </div>

      <div className="section-title">Model API keys</div>
      <p className="muted" style={{ fontSize: 13, marginTop: -4 }}>
        Keys are encrypted before storage. At session start the desktop app
        resolves them in order: project, then organization, then account, then
        the workspace .env file.
      </p>

      <div className="tabs">
        {(["account", "org", "project"] as Tab[]).map((t) => (
          <button
            key={t}
            className={tab === t ? "active" : ""}
            onClick={() => setTab(t)}
          >
            {t === "account"
              ? "Account"
              : t === "org"
                ? "Organization"
                : "Project"}
          </button>
        ))}
      </div>

      {tab === "project" && (
        <div className="card">
          <div className="field">
            <label className="muted" style={{ fontSize: 12 }}>
              Project
            </label>
            {data.projects.length === 0 ? (
              <span className="muted">No projects in this organization yet.</span>
            ) : (
              <select
                className="select"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                {data.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {tab === "org" && !data.activeOrg ? (
        <div className="empty">No organization found for this account.</div>
      ) : tab === "project" && !projectId ? (
        <div className="empty">Select a project to manage its keys.</div>
      ) : (
        <Editor scope={tab} scopeId={scopeId} />
      )}
    </div>
  );
}

function Editor({ scope, scopeId }: { scope: LlmScope; scopeId: string }) {
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
      .catch((e) => setError(String(e)));
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
      setError(String(e));
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
      setError(String(e));
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

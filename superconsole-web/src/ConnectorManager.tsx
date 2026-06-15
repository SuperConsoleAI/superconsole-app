import { useEffect, useState } from "react";
import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { getSessionUser } from "./server/auth";
import { errorText } from "./err";
import {
  deleteConnector,
  listConnectors,
  setConnector,
  type ConnectorView,
} from "./server/connectors";
import {
  CONNECTOR_REGISTRY,
  type ConnectorCategory,
  type ConnectorScope,
} from "./connector-registry";

const fetchConnectors = createServerFn({ method: "GET" })
  .validator((d: { scope: ConnectorScope; scopeId: string }) => d)
  .handler(async ({ data }): Promise<ConnectorView[]> => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    return listConnectors(user, data.scope, data.scopeId);
  });

const saveConnector = createServerFn({ method: "POST" })
  .validator(
    (d: {
      scope: ConnectorScope;
      scopeId: string;
      service: string;
      fields: Record<string, string>;
    }) => d,
  )
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await setConnector(user, data.scope, data.scopeId, data.service, data.fields);
  });

const removeConnector = createServerFn({ method: "POST" })
  .validator((d: { scope: ConnectorScope; scopeId: string; service: string }) => d)
  .handler(async ({ data }) => {
    const user = await getSessionUser();
    if (!user) throw redirect({ to: "/login" });
    await deleteConnector(user, data.scope, data.scopeId, data.service);
  });

export function ConnectorManager({
  scope,
  scopeId,
  category,
}: {
  scope: ConnectorScope;
  scopeId: string;
  category?: ConnectorCategory;
}) {
  const available = CONNECTOR_REGISTRY.filter(
    (d) => d.scopes.includes(scope) && (!category || d.category === category),
  );
  const inCategory = (svc: string) =>
    !category ||
    CONNECTOR_REGISTRY.find((d) => d.id === svc)?.category === category;
  const [list, setList] = useState<ConnectorView[]>([]);
  const [service, setService] = useState(available[0]?.id ?? "");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const def = CONNECTOR_REGISTRY.find((d) => d.id === service);
  const current = list.find((c) => c.service === service);

  const reload = () => {
    fetchConnectors({ data: { scope, scopeId } })
      .then(setList)
      .catch((e) => setError(errorText(e)));
  };

  useEffect(() => {
    setList([]);
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, scopeId]);

  useEffect(() => {
    if (!def) return;
    const existing = list.find((c) => c.service === service);
    const next: Record<string, string> = {};
    for (const f of def.fields) {
      const ev = existing?.fields.find((x) => x.key === f.key);
      next[f.key] = !f.secret && ev?.value ? ev.value : "";
    }
    setValues(next);
  }, [service, list, def]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const labelFor = (svc: string) =>
    CONNECTOR_REGISTRY.find((d) => d.id === svc)?.label ?? svc;

  const shown = list.filter((c) => inCategory(c.service));

  return (
    <>
      {shown.length > 0 && (
        <div className="card">
          <div className="connector-list" style={{ marginTop: 0 }}>
            {shown.map((c) => (
              <div key={c.service} className="connector-row">
                <span>
                  {labelFor(c.service)}
                  <span className="muted" style={{ fontSize: 12 }}>
                    {" "}
                    · {c.status ?? "connected"}
                    {c.fields
                      .filter((f) => !f.secret && f.value)
                      .map((f) => ` · ${f.value}`)
                      .join("")}
                  </span>
                </span>
                <span className="row" style={{ gap: 8 }}>
                  <button
                    className="btn ghost"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    onClick={() => setService(c.service)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn ghost"
                    style={{ padding: "4px 10px", fontSize: 12 }}
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        removeConnector({
                          data: { scope, scopeId, service: c.service },
                        }),
                      )
                    }
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card">
        <div className="field">
          <select
            className="select"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            {available.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          {def?.fields.map((f) => {
            const fieldSet = current?.fields.find((x) => x.key === f.key)?.hasValue;
            return (
              <input
                key={f.key}
                className="input mono"
                type={f.secret ? "password" : "text"}
                value={values[f.key] ?? ""}
                onChange={(e) =>
                  setValues((v) => ({ ...v, [f.key]: e.target.value }))
                }
                placeholder={
                  f.secret && fieldSet
                    ? `${f.label} •••• set (leave blank to keep)`
                    : (f.placeholder ?? f.label)
                }
              />
            );
          })}
          <div className="row end">
            <button
              className="btn"
              disabled={busy}
              onClick={() =>
                run(() =>
                  saveConnector({ data: { scope, scopeId, service, fields: values } }),
                )
              }
            >
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

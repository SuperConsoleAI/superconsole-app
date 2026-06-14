import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api, type AuthInfo, type CloudOrg } from "@/lib/api";

interface AuthContextValue {
  auth: AuthInfo | null;
  loading: boolean;
  pending: boolean;
  error: string | null;
  activeCloudOrgId: string | null;
  activeCloudOrg: CloudOrg | null;
  setActiveCloudOrgId: (id: string) => void;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const ORG_KEY = "superconsole-cloud-org";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuth] = useState<AuthInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCloudOrgId, setActiveCloudOrgIdState] = useState<string | null>(
    () => localStorage.getItem(ORG_KEY),
  );

  const applyAuth = useCallback((info: AuthInfo | null) => {
    setAuth(info);
    if (info && info.orgs.length > 0) {
      // Identity is now stored locally; refresh the scoped cloud cache.
      api.syncCloudCache().catch(() => {});
      setActiveCloudOrgIdState((prev) => {
        const valid = prev && info.orgs.some((o) => o.id === prev);
        const next = valid ? prev : info.orgs[0].id;
        if (next) localStorage.setItem(ORG_KEY, next);
        return next;
      });
    }
  }, []);

  useEffect(() => {
    api
      .authStatus()
      .then(applyAuth)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [applyAuth]);

  useEffect(() => {
    const changed = listen<AuthInfo>("auth-changed", (e) => {
      setPending(false);
      setError(null);
      applyAuth(e.payload);
    });
    const failed = listen<string>("auth-error", (e) => {
      setPending(false);
      setError(e.payload);
    });
    return () => {
      changed.then((fn) => fn());
      failed.then((fn) => fn());
    };
  }, [applyAuth]);

  const setActiveCloudOrgId = useCallback((id: string) => {
    setActiveCloudOrgIdState(id);
    localStorage.setItem(ORG_KEY, id);
    // Re-sync the new org scope only.
    api.syncOrgCache(id).catch(() => {});
  }, []);

  const signIn = useCallback(async () => {
    setError(null);
    setPending(true);
    try {
      const url = await api.signIn();
      await openUrl(url);
    } catch (e) {
      setPending(false);
      setError(String(e));
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.signOut();
    setAuth(null);
    setActiveCloudOrgIdState(null);
    localStorage.removeItem(ORG_KEY);
  }, []);

  const activeCloudOrg =
    auth?.orgs.find((o) => o.id === activeCloudOrgId) ?? auth?.orgs[0] ?? null;

  return (
    <AuthContext.Provider
      value={{
        auth,
        loading,
        pending,
        error,
        activeCloudOrgId,
        activeCloudOrg,
        setActiveCloudOrgId,
        signIn,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

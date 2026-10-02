import React, { useState, useEffect, useCallback } from "react";
import {
  Database,
  Shield,
  Check,
  ExternalLink,
  Lock,
  RefreshCw,
  Zap,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Globe,
  HardDrive,
  Layers,
  Server,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  api,
  type UserDbConfig,
  type UserDbStatus,
} from "@/lib/api";
import { cn } from "@/lib/utils";

export function UserDBSection() {
  const [config, setConfig] = useState<UserDbConfig | null>(null);
  const [status, setStatus] = useState<UserDbStatus | null>(null);
  const [loading, setLoading] = useState(true);

  // Form input state
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Action states
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [provisioning, setProvisioning] = useState(false);
  const [provisionResult, setProvisionResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  const [togglingOffPlatform, setTogglingOffPlatform] = useState(false);
  const [showTables, setShowTables] = useState(false);

  // Load config & status
  const loadData = useCallback(async () => {
    try {
      const cfg = await api.getUserDbConfig();
      setConfig(cfg);
      setUrl(cfg.url);

      const st = await api.getUserDbStatus();
      setStatus(st);
    } catch (e) {
      console.error("Failed to load UserDB state:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle saving credentials
  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!url.trim()) return;

    setSaving(true);
    setSaveSuccess(false);
    setTestResult(null);

    try {
      const updated = await api.saveUserDbConfig(url.trim(), token.trim());
      setConfig(updated);
      setToken(""); // Clear raw token from memory once saved
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);

      // Refresh live status
      const st = await api.getUserDbStatus();
      setStatus(st);
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSaving(false);
    }
  };

  // Test connection to Turso UserDB
  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testUserDbConnection(
        url.trim() || undefined,
        token.trim() || undefined
      );
      setTestResult({
        success: res.success,
        message: res.message,
      });
      if (res.success) {
        const st = await api.getUserDbStatus();
        setStatus(st);
      }
    } catch (err: unknown) {
      setTestResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setTesting(false);
    }
  };

  // Provision canonical schema
  const handleProvision = async () => {
    setProvisioning(true);
    setProvisionResult(null);
    try {
      const res = await api.provisionUserDb(
        url.trim() || undefined,
        token.trim() || undefined
      );
      setProvisionResult({
        success: res.success,
        message: res.message,
      });
      const st = await api.getUserDbStatus();
      setStatus(st);
    } catch (err: unknown) {
      setProvisionResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setProvisioning(false);
    }
  };

  // Sync all data (plugins, sessions, chats, usage) to UserDB
  const handleSyncAll = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.syncUserDbAll();
      setSyncResult({
        success: res.success,
        message: res.message,
      });
      const st = await api.getUserDbStatus();
      setStatus(st);
    } catch (err: unknown) {
      setSyncResult({
        success: false,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setSyncing(false);
    }
  };

  // Toggle off_platform between 0 and 1
  const handleToggleOffPlatform = async () => {
    if (!config || !config.isConfigured || togglingOffPlatform) return;

    const nextVal = config.offPlatform === 1 ? 0 : 1;
    setTogglingOffPlatform(true);
    try {
      const updated = await api.setUserDbOffPlatform(nextVal);
      setConfig(updated);
      const st = await api.getUserDbStatus();
      setStatus(st);
    } catch (err) {
      console.error("Failed to toggle off_platform:", err);
    } finally {
      setTogglingOffPlatform(false);
    }
  };

  const isConfigured = !!config?.isConfigured;
  const isOffPlatformActive = config?.offPlatform === 1;

  if (loading) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
        Loading UserDB settings…
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* ── Overview & Scope Banner ────────────────────────────────────────── */}
      <div className="rounded-xl border border-border/70 bg-gradient-to-br from-card/80 via-card/40 to-muted/20 p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary border border-primary/20">
              <HardDrive className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-base tracking-tight">
                  User Database (UserDB)
                </h3>
                <Badge variant="outline" className="text-[11px] gap-1 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Turso Cloud
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                Personal cloud database mirroring the Central architecture for user-owned storage.
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground cursor-pointer"
            onClick={() => openUrl("https://turso.tech/app")}
          >
            <span>Turso Console</span>
            <ExternalLink className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mt-4 rounded-lg bg-secondary/40 border border-border/40 px-3.5 py-2.5 flex items-center gap-2.5 text-xs text-muted-foreground">
          <Globe className="h-4 w-4 shrink-0 text-primary/80" />
          <span>
            <strong className="text-foreground font-medium">Single Account-Wide Configuration:</strong>{" "}
            You only configure UserDB once. It automatically powers and secures all your
            organizations, projects, and local workspaces.
          </span>
        </div>
      </div>

      {/* ── Off-Platform Credential Isolation Card ─────────────────────────── */}
      <div
        className={cn(
          "rounded-xl border transition-all duration-200 p-5 shadow-sm",
          isOffPlatformActive
            ? "border-emerald-500/30 bg-emerald-500/[0.03]"
            : "border-border/70 bg-card/60"
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Shield
                className={cn(
                  "h-4 w-4",
                  isOffPlatformActive ? "text-emerald-500" : "text-muted-foreground"
                )}
              />
              <h4 className="text-sm font-medium">
                Off-Platform Credential Isolation
              </h4>
              <Badge
                variant={isOffPlatformActive ? "default" : "secondary"}
                className={cn(
                  "text-[10px] font-mono uppercase tracking-wider",
                  isOffPlatformActive
                    ? "bg-emerald-600 text-white"
                    : "bg-muted text-muted-foreground"
                )}
              >
                {isOffPlatformActive ? "Active (1)" : "Standard Cloud (0)"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When enabled, your connector credentials and private workflows are stored
              strictly in your UserDB and LocalDB. Only a stub entry with the ULID ID is sent
              to CentralDB to maintain identity synchronization across all distributed databases.
            </p>
          </div>

          {/* Toggle Switch */}
          <div className="flex flex-col items-end gap-1.5 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={isOffPlatformActive}
              disabled={!isConfigured || togglingOffPlatform}
              onClick={handleToggleOffPlatform}
              className={cn(
                "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
                !isConfigured
                  ? "opacity-40 cursor-not-allowed bg-muted"
                  : isOffPlatformActive
                  ? "bg-emerald-600 cursor-pointer"
                  : "bg-muted hover:bg-muted/80 cursor-pointer"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-md ring-0 transition duration-200 ease-in-out",
                  isOffPlatformActive ? "translate-x-5" : "translate-x-0"
                )}
              />
            </button>
            <span className="text-[10px] font-mono text-muted-foreground">
              {isOffPlatformActive ? "off_platform: 1" : "off_platform: 0"}
            </span>
          </div>
        </div>

        {/* Informational Callout based on Configuration State */}
        {!isConfigured ? (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs text-amber-500">
            <Lock className="h-3.5 w-3.5 shrink-0" />
            <span>
              Toggle is locked. Add and connect your Turso UserDB credentials below to
              unlock off-platform isolation.
            </span>
          </div>
        ) : isOffPlatformActive ? (
          <div className="mt-4 space-y-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 text-xs text-emerald-400">
            <div className="flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Full Private Isolation Engaged</span>
            </div>
            <ul className="pl-5 list-disc space-y-0.5 text-[11px] text-emerald-300/80">
              <li>All connector secrets are encrypted and kept only in UserDB / LocalDB.</li>
              <li>CentralDB receives an empty credential shell with the ULID ID.</li>
              <li>Cloud synchronization will never overwrite or leak your local credentials.</li>
            </ul>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-muted/50 border border-border/50 px-3 py-2 text-xs text-muted-foreground">
            <Server className="h-3.5 w-3.5 shrink-0" />
            <span>
              UserDB is configured. You can toggle Off-Platform Isolation ON anytime to
              restrict sensitive keys to your private cloud instance.
            </span>
          </div>
        )}
      </div>

      {/* ── Turso Cloud Database Configuration Card ────────────────────────── */}
      <div className="rounded-xl border border-border/70 bg-card/60 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-sm font-medium">Turso UserDB Credentials</h4>
            <p className="text-xs text-muted-foreground mt-0.5">
              Connect your dedicated Turso database (URL + Auth Token).
            </p>
          </div>
          {isConfigured && (
            <Badge variant="outline" className="text-[11px] gap-1 text-emerald-500 border-emerald-500/30">
              <Check className="h-3 w-3" />
              Configured
            </Badge>
          )}
        </div>

        <form onSubmit={handleSave} className="space-y-3.5">
          {/* Database URL */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Database URL
            </label>
            <Input
              type="text"
              placeholder="libsql://your-user-db-name.turso.io"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="font-mono text-xs h-9 bg-background/60"
            />
            <p className="text-[11px] text-muted-foreground">
              Supports both <code className="text-[10px] px-1 py-0.5 rounded bg-muted">libsql://</code> and <code className="text-[10px] px-1 py-0.5 rounded bg-muted">https://</code> URLs.
            </p>
          </div>

          {/* Auth Token */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-foreground">
                Turso Auth Token
              </label>
              {config?.hasToken && (
                <span className="text-[11px] font-mono text-muted-foreground">
                  Current: {config.tokenMasked}
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                type={showToken ? "text" : "password"}
                placeholder={config?.hasToken ? "Enter new token to replace" : "eyJh..."}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                className="font-mono text-xs h-9 pr-9 bg-background/60"
              />
              <button
                type="button"
                className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={() => setShowToken(!showToken)}
              >
                {showToken ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Generate an auth token in the Turso CLI via <code className="text-[10px] px-1 py-0.5 rounded bg-muted">turso db tokens create &lt;db-name&gt;</code>.
            </p>
          </div>

          {/* Status / Feedback alerts */}
          {testResult && (
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-xs flex items-center gap-2",
                testResult.success
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              )}
            >
              {testResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{testResult.message}</span>
            </div>
          )}

          {provisionResult && (
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-xs flex items-center gap-2",
                provisionResult.success
                  ? "bg-primary/10 text-primary border border-primary/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              )}
            >
              {provisionResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{provisionResult.message}</span>
            </div>
          )}

          {syncResult && (
            <div
              className={cn(
                "rounded-lg px-3 py-2 text-xs flex items-center gap-2",
                syncResult.success
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20"
              )}
            >
              {syncResult.success ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{syncResult.message}</span>
            </div>
          )}

          {/* Action Button Toolbar */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <Button
              type="submit"
              size="sm"
              disabled={saving || !url.trim()}
              className="gap-1.5 h-8 text-xs cursor-pointer"
            >
              {saving ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : saveSuccess ? (
                <Check className="h-3.5 w-3.5 text-emerald-400" />
              ) : (
                <Zap className="h-3.5 w-3.5" />
              )}
              <span>{saveSuccess ? "Saved!" : "Save Credentials"}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={testing || (!config?.hasToken && !token.trim())}
              onClick={handleTestConnection}
              className="gap-1.5 h-8 text-xs cursor-pointer"
            >
              {testing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>Test Connection</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={provisioning || (!config?.hasToken && !token.trim())}
              onClick={handleProvision}
              className="gap-1.5 h-8 text-xs cursor-pointer"
            >
              {provisioning ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Layers className="h-3.5 w-3.5" />
              )}
              <span>Provision UserDB Schema</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncing || !config?.isConfigured}
              onClick={handleSyncAll}
              className="gap-1.5 h-8 text-xs cursor-pointer"
            >
              {syncing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              <span>Sync All Data</span>
            </Button>
          </div>
        </form>
      </div>

      {/* ── Live UserDB Health & Table Introspection Card ──────────────────── */}
      {status?.isConfigured && (
        <div className="rounded-xl border border-border/70 bg-card/60 p-5 shadow-sm space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-primary" />
              <h4 className="text-sm font-medium">Turso Remote Status</h4>
            </div>
            <div className="flex items-center gap-2">
              {status.isConnected ? (
                <Badge variant="outline" className="text-[11px] gap-1 text-emerald-500 border-emerald-500/30 font-mono">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Online ({status.latencyMs}ms)
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-[11px] gap-1 font-mono">
                  <AlertCircle className="h-3 w-3" />
                  Offline
                </Badge>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 pt-1">
            <div className="rounded-lg bg-secondary/30 border border-border/40 p-2.5">
              <span className="text-[10px] text-muted-foreground uppercase font-mono">Provisioned</span>
              <div className="text-sm font-semibold mt-0.5">
                {status.tableCount} / {status.canonicalTableCount} Tables
              </div>
            </div>
            <div className="rounded-lg bg-secondary/30 border border-border/40 p-2.5">
              <span className="text-[10px] text-muted-foreground uppercase font-mono">Latency</span>
              <div className="text-sm font-semibold mt-0.5">
                {status.latencyMs != null ? `${status.latencyMs} ms` : "—"}
              </div>
            </div>
            <div className="rounded-lg bg-secondary/30 border border-border/40 p-2.5 col-span-2 sm:col-span-1">
              <span className="text-[10px] text-muted-foreground uppercase font-mono">Isolation</span>
              <div className="text-sm font-semibold mt-0.5 text-foreground">
                {status.offPlatform === 1 ? "Off-Platform (1)" : "Standard (0)"}
              </div>
            </div>
          </div>

          {status.tables.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowTables(!showTables)}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 cursor-pointer"
              >
                <span>{showTables ? "Hide" : "View"} {status.tables.length} remote UserDB tables</span>
                <span className="text-[10px]">({showTables ? "▲" : "▼"})</span>
              </button>

              {showTables && (
                <div className="mt-2.5 flex flex-wrap gap-1.5 max-h-36 overflow-y-auto p-2 rounded-lg bg-background/50 border border-border/40">
                  {status.tables.map((tbl) => (
                    <Badge
                      key={tbl}
                      variant="outline"
                      className="text-[10px] font-mono px-2 py-0.5 bg-card/60"
                    >
                      {tbl}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )}

          {status.errorMessage && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{status.errorMessage}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

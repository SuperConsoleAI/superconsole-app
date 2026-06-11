import { useEffect, useState } from "react";
import { useRouter } from "@tanstack/react-router";
import { ArrowLeft, BookOpen, Check, Copy, Search } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

const SECTIONS: { group: string; items: string[] }[] = [
  { group: "Personal", items: ["Account", "Appearance", "Notifications"] },
  {
    group: "Editor & Workflow",
    items: ["General", "Keyboard", "Git & Worktrees", "Agents", "Terminal", "Links", "Models"],
  },
  {
    group: "Organization",
    items: ["Organization", "Teams", "Projects", "Hosts", "Integrations", "Billing", "API Keys"],
  },
];

export function SettingsPage() {
  const router = useRouter();
  const [section, setSection] = useState("Appearance");
  const [query, setQuery] = useState("");

  const filtered = SECTIONS.map((g) => ({
    ...g,
    items: g.items.filter((i) => i.toLowerCase().includes(query.toLowerCase())),
  })).filter((g) => g.items.length > 0);

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r bg-sidebar">
        <div className="px-4 pb-1 pt-4">
          <button
            className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => router.history.back()}
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back
          </button>
          <h1 className="font-display mt-3 text-lg font-semibold">Settings</h1>
          <div className="relative mt-2">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search settings..."
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 px-2 py-2">
          {filtered.map((group) => (
            <div key={group.group} className="mb-3">
              <p className="px-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {group.group}
              </p>
              {group.items.map((item) => (
                <button
                  key={item}
                  onClick={() => setSection(item)}
                  className={cn(
                    "block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                    section === item
                      ? "bg-accent font-medium text-accent-foreground"
                      : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          ))}
        </ScrollArea>

        <div className="border-t p-3">
          <button
            className="flex items-center gap-2 px-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => openUrl("https://github.com").catch(() => {})}
          >
            <BookOpen className="h-3.5 w-3.5" />
            Documentation
          </button>
        </div>
      </aside>

      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-2xl px-8 py-8">
          <h2 className="font-display text-xl font-semibold">{section}</h2>
          <div className="mt-6">
            <SectionContent section={section} />
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function SectionContent({ section }: { section: string }) {
  switch (section) {
    case "General":
      return <GeneralSection />;
    case "Appearance":
      return <AppearanceSection />;
    case "Integrations":
      return <IntegrationsSection />;
    case "API Keys":
      return <ApiKeysSection />;
    default:
      return (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="text-sm text-muted-foreground">
            {section} settings are coming soon.
          </p>
        </div>
      );
  }
}

function GeneralSection() {
  const [version, setVersion] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    import("@tauri-apps/api/app").then(({ getVersion }) =>
      getVersion().then(setVersion).catch(() => {}),
    );
  }, []);

  const checkUpdates = async () => {
    setChecking(true);
    setStatus(null);
    try {
      const { check } = await import("@tauri-apps/plugin-updater");
      const update = await check();
      if (update) {
        setStatus(`Update available: v${update.version}. Downloading...`);
        await update.downloadAndInstall();
        setStatus("Update installed. Restart Dockyard to apply.");
      } else {
        setStatus("You're on the latest version.");
      }
    } catch {
      setStatus(
        "Update check failed. Updates require a configured release endpoint and signing key.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-lg border bg-card px-4 py-3">
        <div>
          <p className="text-sm font-medium">Dockyard</p>
          <p className="text-xs text-muted-foreground">Version {version || "..."}</p>
        </div>
        <Button size="sm" variant="outline" onClick={checkUpdates} disabled={checking}>
          {checking ? "Checking..." : "Check for updates"}
        </Button>
      </div>
      {status && <p className="text-xs text-muted-foreground">{status}</p>}
    </div>
  );
}

function AppearanceSection() {
  const { theme, setTheme } = useTheme();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Theme</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Dockyard ships two themes tuned for long agent sessions.
        </p>
        <div className="flex gap-3">
          {(["light", "dark"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={cn(
                "flex-1 rounded-xl border p-1 transition-all",
                theme === t ? "border-primary ring-1 ring-primary" : "hover:border-foreground/30",
              )}
            >
              <div
                className={cn(
                  "flex h-20 items-center justify-center rounded-lg text-xs font-medium",
                  t === "light"
                    ? "bg-[#faf9f5] text-[#3d3929]"
                    : "bg-[#262624] text-[#f0eee7]",
                )}
              >
                {t === "light" ? "Cream" : "Charcoal"}
              </div>
              <p className="py-1.5 text-center text-xs capitalize">{t}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function useSettings() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  useEffect(() => {
    api.getSettings().then(setSettings).catch(console.error);
  }, []);
  const update = (key: string, value: string) =>
    setSettings((s) => ({ ...s, [key]: value }));
  return { settings, update };
}

function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
  const [saved, setSaved] = useState(false);
  return (
    <Button
      size="sm"
      onClick={async () => {
        await onSave();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }}
    >
      {saved && <Check className="h-3.5 w-3.5" />}
      {saved ? "Saved" : "Save"}
    </Button>
  );
}

function IntegrationsSection() {
  const { settings, update } = useSettings();
  return (
    <div className="flex flex-col gap-4">
      <div>
        <h3 className="text-sm font-medium">Telegram bot</h3>
        <p className="mb-3 text-xs leading-relaxed text-muted-foreground">
          Trigger agents from your phone and get job reports pushed back.
          Create a bot with @BotFather, paste the token, then message your bot
          once to pair. Restart Dockyard after changing the token.
        </p>
        <div className="flex flex-col gap-2">
          <Input
            value={settings.telegram_token ?? ""}
            onChange={(e) => update("telegram_token", e.target.value)}
            placeholder="Bot token"
            type="password"
            className="h-8 font-mono text-xs"
          />
          <Input
            value={settings.telegram_chat_id ?? ""}
            onChange={(e) => update("telegram_chat_id", e.target.value)}
            placeholder="Chat ID (auto-filled on first message)"
            className="h-8 font-mono text-xs"
          />
        </div>
      </div>
      <div>
        <SaveButton
          onSave={async () => {
            await api.setSetting("telegram_token", settings.telegram_token ?? "");
            await api.setSetting("telegram_chat_id", settings.telegram_chat_id ?? "");
          }}
        />
      </div>
    </div>
  );
}

function ApiKeysSection() {
  const { settings, update } = useSettings();
  const [copied, setCopied] = useState(false);
  const httpEnabled = settings.http_enabled === "1";

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Local HTTP server</h3>
          <button
            className={cn(
              "h-4 w-7 rounded-full transition-colors",
              httpEnabled ? "bg-primary" : "bg-muted",
            )}
            onClick={() => update("http_enabled", httpEnabled ? "0" : "1")}
          >
            <span
              className={cn(
                "block h-3 w-3 rounded-full bg-background transition-transform",
                httpEnabled ? "translate-x-3.5" : "translate-x-0.5",
              )}
            />
          </button>
        </div>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-muted-foreground">
          Binds 127.0.0.1 only. POST /trigger {"{ workspace, command }"} with the
          x-dockyard-token header. Expose via Cloudflare Tunnel for mobile.
          Restart Dockyard to apply.
        </p>
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <span className="w-10 text-xs text-muted-foreground">Port</span>
            <Input
              value={settings.http_port ?? "4665"}
              onChange={(e) => update("http_port", e.target.value)}
              className="h-8 w-24 font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 text-xs text-muted-foreground">Token</span>
            <Input
              readOnly
              value={settings.api_token ?? ""}
              type="password"
              className="h-8 flex-1 font-mono text-xs"
            />
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => {
                navigator.clipboard.writeText(settings.api_token ?? "");
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </Button>
          </div>
        </div>
      </div>
      <div>
        <SaveButton
          onSave={async () => {
            await api.setSetting("http_enabled", httpEnabled ? "1" : "0");
            await api.setSetting("http_port", settings.http_port || "4665");
          }}
        />
      </div>
    </div>
  );
}

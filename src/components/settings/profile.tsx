import { useEffect, useState } from "react";
import {
  Check,
  Database,
  Globe,
  HardDrive,
  Loader2,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type AuthUser, type UserDbConfig } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

export function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        checked ? "bg-primary" : "bg-muted",
      )}
    >
      <span
        className={cn(
          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-background shadow-lg ring-0 transition duration-200 ease-in-out",
          checked ? "translate-x-4" : "translate-x-0",
        )}
      />
    </button>
  );
}

export function ProfileSection({
  user: userProp,
  onNavigateSection,
}: {
  user?: AuthUser | null;
  onNavigateSection?: (section: string) => void;
}) {
  const { auth } = useAuth();
  const user = userProp ?? auth?.user;

  const [username, setUsername] = useState(user?.username ?? "");
  const [fullName, setFullName] = useState(user?.full_name ?? user?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatar_url ?? user?.logo_url ?? "");
  const [bio, setBio] = useState(user?.bio ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setUsername(user.username ?? "");
      setFullName(user.full_name ?? user.name ?? "");
      setAvatarUrl(user.avatar_url ?? user.logo_url ?? "");
      setBio(user.bio ?? "");
    }
  }, [user]);

  if (!user) {
    return (
      <div className="rounded-xl border border-dashed px-6 py-12 text-center">
        <p className="text-sm text-muted-foreground">Sign in to manage your profile.</p>
      </div>
    );
  }

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await api.updateUserProfile({
        username,
        fullName,
        avatarUrl,
        bio,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const initials = (fullName || user.email || "U")
    .split(" ")
    .map((s: string) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      {/* Top Banner & Avatar Header */}
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-border bg-muted/60 text-lg font-semibold text-muted-foreground shadow-inner">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="Avatar"
                className="h-full w-full object-cover"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = "none";
                }}
              />
            ) : (
              <span>{initials}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-display text-lg font-semibold truncate">
              {fullName || "Anonymous Agent"}
            </h3>
            <p className="font-mono text-xs text-muted-foreground">
              {username ? `@${username}` : user.email}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                <Shield className="h-3 w-3" />
                WorkOS Verified
              </span>
              {user.is_public === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-medium text-emerald-500">
                  <Globe className="h-3 w-3" />
                  Public Profile
                </span>
              )}
              {user.off_platform === 1 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-[11px] font-medium text-amber-500">
                  <ShieldAlert className="h-3 w-3" />
                  Off-Platform Mode
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* User Details Form */}
      <div className="rounded-xl border bg-card p-6 shadow-xs flex flex-col gap-4">
        <h4 className="text-sm font-semibold">User Details</h4>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Full Name</label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Alice Smith"
            className="text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Your display name shown across teams, projects, and comments.
          </p>
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground">Username</label>
            <span className="text-[10px] font-mono font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded border border-primary/20">
              unique
            </span>
          </div>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
              @
            </span>
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""))}
              placeholder="username"
              className="pl-7 font-mono text-xs"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Unique global handle across SuperConsole for mentions, invitations, and public URL.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Avatar Image URL</label>
          <Input
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            placeholder="https://example.com/avatar.png"
            className="text-xs font-mono"
          />
          <p className="text-[11px] text-muted-foreground">
            Provide a direct image URL for your profile picture.
          </p>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Bio</label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            placeholder="Write a brief bio about your projects, agent workflows, or background..."
            maxLength={300}
            rows={3}
            className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs shadow-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Shown on your public profile card</span>
            <span>{bio.length}/300</span>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">Email Address</label>
          <Input
            value={user.email}
            disabled
            className="text-xs bg-muted/40 cursor-not-allowed"
          />
          <p className="text-[11px] text-muted-foreground">
            Managed securely by your identity provider (WorkOS).
          </p>
        </div>

        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex items-center gap-3 pt-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={saving}
            className="cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : saved ? (
              <>
                <Check className="mr-2 h-3.5 w-3.5" />
                Saved
              </>
            ) : (
              "Save Profile"
            )}
          </Button>
          {saved && (
            <span className="text-xs text-emerald-500 font-medium animate-in fade-in">
              Profile updated successfully!
            </span>
          )}
        </div>
      </div>

      {/* Public Profile Visibility & Web Card Preview */}
      <PublicProfileSection user={user} />

      {/* Off-Platform Isolation Mode */}
      <OffPlatformSection user={user} onNavigateSection={onNavigateSection} />
    </div>
  );
}

export function PublicProfileSection({ user }: { user: AuthUser }) {
  const [isPublic, setIsPublic] = useState(user.is_public === 1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsPublic(user.is_public === 1);
  }, [user.is_public]);

  const togglePublic = async (next: boolean) => {
    setIsPublic(next);
    setSaving(true);
    setError(null);
    try {
      await api.updateUserProfile({ isPublic: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
      setIsPublic(!next);
    } finally {
      setSaving(false);
    }
  };

  const fullName = user.full_name ?? user.name ?? "Anonymous Agent";
  const username = user.username ?? "user";
  const avatarUrl = user.avatar_url ?? user.logo_url ?? "";
  const bio = user.bio ?? "Building autonomous systems and running multi-agent workflows with SuperConsole.";

  const initials = fullName
    .split(" ")
    .map((s: string) => s[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              Public Profile Visibility
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              When enabled, your public profile card and verified contributions can be shared with
              external teammates and viewed on the SuperConsole web directory.
            </p>
          </div>
          <Toggle checked={isPublic} onChange={togglePublic} disabled={saving} />
        </div>

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        {saved && (
          <p className="mt-3 text-xs text-emerald-500 font-medium">
            Visibility updated in CentralDB!
          </p>
        )}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Public Card Preview
          </h4>
          <span className="text-[11px] text-muted-foreground">
            {isPublic ? "Publicly Accessible" : "Private / Hidden"}
          </span>
        </div>

        <div className="relative rounded-2xl border bg-gradient-to-br from-card via-card to-muted/20 p-6 shadow-md overflow-hidden">
          <div className="absolute top-0 right-0 p-4">
            {isPublic ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-500 border border-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live on Web
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground">
                Private
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-primary/20 bg-muted text-base font-semibold shadow-inner">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="h-full w-full object-cover" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="min-w-0 pr-24">
              <h3 className="font-display text-lg font-semibold truncate">{fullName}</h3>
              <p className="font-mono text-xs text-muted-foreground">@{username}</p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-border/50">
            <p className="text-xs text-muted-foreground leading-relaxed italic">
              "{bio}"
            </p>
          </div>

          <div className="mt-4 flex items-center gap-4 text-[11px] text-muted-foreground">
            <span>Verified Identity: <strong>{user.email}</strong></span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OffPlatformSection({
  user,
  onNavigateSection,
}: {
  user: AuthUser;
  onNavigateSection?: (section: string) => void;
}) {
  const [userDbConfig, setUserDbConfig] = useState<UserDbConfig | null>(null);
  const [loadingDb, setLoadingDb] = useState(true);
  const [offPlatform, setOffPlatform] = useState(user.off_platform === 1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getUserDbConfig()
      .then((cfg) => {
        setUserDbConfig(cfg);
        if (!cfg.isConfigured && user.off_platform === 1) {
          setOffPlatform(false);
        }
      })
      .catch((err) => {
        console.error("Failed to load UserDB config", err);
      })
      .finally(() => {
        setLoadingDb(false);
      });
  }, [user.off_platform]);

  useEffect(() => {
    if (userDbConfig && !userDbConfig.isConfigured) {
      setOffPlatform(false);
    } else {
      setOffPlatform(user.off_platform === 1);
    }
  }, [user.off_platform, userDbConfig]);

  const toggleOffPlatform = async (next: boolean) => {
    if (next && (!userDbConfig || !userDbConfig.isConfigured)) {
      setError(
        "Cannot enable Off-Platform Privacy Mode without a configured UserDB. Please configure your private UserDB in Settings > UserDB first.",
      );
      return;
    }

    setOffPlatform(next);
    setSaving(true);
    setError(null);
    try {
      await api.updateUserProfile({ offPlatform: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(String(e));
      setOffPlatform(!next);
    } finally {
      setSaving(false);
    }
  };

  const isConfigured = Boolean(userDbConfig?.isConfigured);

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-500" />
              Off-Platform Privacy Mode
            </h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Enable strict local-first air-gapping. When off-platform mode is enabled, your agent chats,
              execution logs, and connector configurations bypass central telemetry and remain strictly
              isolated to this local device and your private Turso UserDB.
            </p>
          </div>
          <Toggle
            checked={offPlatform && isConfigured}
            onChange={toggleOffPlatform}
            disabled={saving || loadingDb || !isConfigured}
          />
        </div>

        {!isConfigured && !loadingDb && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-700 dark:text-amber-300 space-y-2">
            <div className="flex items-center gap-2 font-semibold">
              <ShieldAlert className="h-4 w-4 shrink-0 text-amber-500" />
              UserDB Configuration Required
            </div>
            <p className="leading-relaxed text-muted-foreground">
              Off-Platform Privacy Mode routes all agent chats, memory, and credentials strictly to your private UserDB. You cannot enable this mode until your private Turso UserDB credentials are configured.
            </p>
            {onNavigateSection && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => onNavigateSection("UserDB")}
                className="mt-2 text-xs border-amber-500/40 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300"
              >
                <Database className="h-3.5 w-3.5 mr-1.5" />
                Configure UserDB in Settings
              </Button>
            )}
          </div>
        )}

        {error && <p className="mt-3 text-xs text-destructive">{error}</p>}
        {saved && (
          <p className="mt-3 text-xs text-emerald-500 font-medium">
            Off-platform mode updated in CentralDB!
          </p>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <HardDrive className="h-4 w-4" />
          </div>
          <h4 className="text-xs font-semibold">Local-First Storage</h4>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            All chat sessions and execution histories are stored in local SQLite without syncing to CentralDB.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-500">
            <Database className="h-4 w-4" />
          </div>
          <h4 className="text-xs font-semibold">Private UserDB Only</h4>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Cloud sync communicates exclusively with your personal Turso database, unlocked in RAM.
          </p>
        </div>

        <div className="rounded-xl border bg-card p-4 space-y-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-500">
            <Shield className="h-4 w-4" />
          </div>
          <h4 className="text-xs font-semibold">No Central Telemetry</h4>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            No telemetry, agent conversation text, or connector secrets are forwarded to central servers.
          </p>
        </div>
      </div>
    </div>
  );
}

export const Profile = ProfileSection;
export default ProfileSection;

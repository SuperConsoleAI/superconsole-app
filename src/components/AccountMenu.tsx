import { Check, ChevronsUpDown, LogOut } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth-context";

function Avatar({
  label,
  logoUrl,
  className,
}: {
  label: string;
  logoUrl?: string | null;
  className?: string;
}) {
  const base =
    "flex items-center justify-center overflow-hidden rounded-full bg-primary/15 text-[11px] font-semibold text-primary";
  if (logoUrl) {
    return (
      <img
        src={logoUrl}
        alt=""
        className={`${base} object-cover ${className ?? ""}`}
      />
    );
  }
  return (
    <span className={`${base} ${className ?? ""}`}>
      {label.trim().charAt(0).toUpperCase() || "?"}
    </span>
  );
}

export function AccountMenu({ collapsed = false }: { collapsed?: boolean }) {
  const { auth, activeCloudOrg, setActiveCloudOrgId, signOut } = useAuth();
  if (!auth) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {collapsed ? (
          <button
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent/60"
            title={`${activeCloudOrg?.name ?? "Account"} — ${auth.user.email}`}
          >
            <Avatar
              label={auth.user.name ?? auth.user.email}
              logoUrl={auth.user.logo_url}
              className="h-6 w-6"
            />
          </button>
        ) : (
          <button className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors hover:bg-accent/60">
            <Avatar
              label={auth.user.name ?? auth.user.email}
              logoUrl={auth.user.logo_url}
              className="h-7 w-7 shrink-0"
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium leading-tight">
                {activeCloudOrg?.name ?? "No organization"}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {auth.user.email}
              </span>
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Organizations
        </DropdownMenuLabel>
        {auth.orgs.map((org) => (
          <DropdownMenuItem
            key={org.id}
            onClick={() => setActiveCloudOrgId(org.id)}
          >
            <Avatar label={org.name} logoUrl={org.logo_url} className="h-4 w-4 text-[9px]" />
            <span className="truncate">{org.name}</span>
            {org.id === activeCloudOrg?.id && (
              <Check className="ml-auto h-3.5 w-3.5" />
            )}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

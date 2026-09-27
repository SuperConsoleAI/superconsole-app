import { Inbox } from "lucide-react";

export function InboxNavbar() {
  return (
    <div className="flex h-7 items-center gap-2">
      <div className="flex items-center gap-1.5 font-medium text-xs">
        <Inbox className="h-3.5 w-3.5 text-primary" strokeWidth={1.5} />
        <span>Inbox</span>
      </div>
      <span className="text-[11px] text-muted-foreground hidden sm:inline">
        — Output from scheduled jobs across all workspaces
      </span>
    </div>
  );
}

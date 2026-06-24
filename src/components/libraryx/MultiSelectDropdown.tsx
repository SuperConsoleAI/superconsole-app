import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";

export function MultiSelectDropdown({
  label,
  options,
  selectedIds,
  onChange,
}: {
  label: string;
  options: { id: string; name: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="h-7 w-full justify-between px-2.5 text-xs font-normal">
            <span className="truncate">
              {selectedIds.length > 0 ? `${selectedIds.length} selected` : "Select options..."}
            </span>
            <ChevronRight className="h-3.5 w-3.5 rotate-90 opacity-50 shrink-0" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-64" align="start">
          <ScrollArea className="max-h-56">
            {options.map((opt) => (
              <DropdownMenuCheckboxItem
                key={opt.id}
                checked={selectedIds.includes(opt.id)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(c) => {
                  if (c) onChange([...selectedIds, opt.id]);
                  else onChange(selectedIds.filter(id => id !== opt.id));
                }}
              >
                {opt.name}
              </DropdownMenuCheckboxItem>
            ))}
            {options.length === 0 && (
              <div className="p-2 text-xs text-muted-foreground text-center">No items found</div>
            )}
          </ScrollArea>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

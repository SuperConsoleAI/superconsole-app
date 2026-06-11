import { SquareTerminal } from "lucide-react";
import { getPresetIcon } from "@/assets/icons/preset-icons";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";

interface PresetIconProps {
  preset: string;
  className?: string;
}

export function PresetIcon({ preset, className }: PresetIconProps) {
  const { theme } = useTheme();
  const src = getPresetIcon(preset, theme === "dark");
  if (!src) {
    return <SquareTerminal className={className} />;
  }
  return (
    <img
      src={src}
      alt={preset}
      draggable={false}
      className={cn("select-none object-contain", className)}
    />
  );
}

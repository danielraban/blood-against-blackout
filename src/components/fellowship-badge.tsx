import { Badge } from "@/components/ui/badge";
import {
  FELLOWSHIP_LABEL,
  type Fellowship,
  type FellowshipFilter,
} from "@/lib/fellowship";
import { cn } from "@/lib/utils";

export function fellowshipTone(fellowship: FellowshipFilter) {
  if (fellowship === "na") return "bg-hot text-accent-fg";
  if (fellowship === "ca") return "bg-black text-foreground";
  if (fellowship === "all") return "bg-hot text-accent-fg";
  return "bg-card text-foreground";
}

export function FellowshipBadge({
  fellowship,
  pressed,
  onClick,
}: {
  fellowship?: Fellowship | FellowshipFilter | null;
  pressed?: boolean;
  onClick?: () => void;
}) {
  const value: FellowshipFilter = fellowship ?? "aa";
  const label = value === "all" ? "all" : FELLOWSHIP_LABEL[value];
  const tone = pressed === false ? "bg-card text-foreground" : fellowshipTone(value);
  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={pressed}
        className={cn(
          "min-h-12 shrink-0 border-2 border-black px-3 text-sm font-semibold lowercase tracking-wide shadow-[3px_3px_0_0_#000]",
          tone,
        )}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }
  return (
    <Badge className={cn("border-black font-semibold lowercase", tone)}>
      {label}
    </Badge>
  );
}

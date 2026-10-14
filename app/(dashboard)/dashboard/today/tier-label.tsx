import { cn } from "@/lib/utils";

import { tierIcons, tierLabels, type Tier } from "./labels";

/** Why Arcli delivered a prospect: an icon plus the label, never colour alone. */
export function TierLabel({ tier, className }: { tier: Tier; className?: string }) {
  const Icon = tierIcons[tier];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs leading-5 font-medium text-navy-soft", className)}>
      <Icon className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
      {tierLabels[tier]}
    </span>
  );
}

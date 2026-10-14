import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Info,
  LoaderCircle,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";

export type StatusTone = "success" | "warning" | "danger" | "info" | "neutral" | "progress";

export type StatusBadgeProps = {
  tone: StatusTone;
  /** Always required: colour is never the only signal. Sentence case, short. */
  children: ReactNode;
  /** compact: 20px tall for table cells and dense lists. */
  size?: "default" | "compact";
  /** Override the tone's default icon when a more specific one exists. */
  icon?: LucideIcon;
  className?: string;
};

// Each tone pairs a text colour with its pale fill (>= 4.5:1, see globals.css).
const TONES: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  success: { className: "bg-success-pale text-success", icon: CheckCircle2 },
  warning: { className: "bg-warning-pale text-warning", icon: AlertTriangle },
  danger: { className: "bg-danger-pale text-danger", icon: XCircle },
  info: { className: "bg-info-pale text-info", icon: Info },
  neutral: { className: "bg-off-white text-muted-foreground ring-1 ring-inset ring-border", icon: Circle },
  progress: { className: "bg-info-pale text-info", icon: LoaderCircle },
};

/**
 * A status label with an icon, e.g. `<StatusBadge tone="success">Ready</StatusBadge>`.
 * Use one vocabulary per status across the product. The progress icon spins
 * only when motion is allowed.
 */
export function StatusBadge({ tone, children, size = "default", icon, className }: StatusBadgeProps) {
  const toneStyle = TONES[tone];
  const Icon = icon ?? toneStyle.icon;

  return (
    <span
      data-tone={tone}
      className={cn(
        "inline-flex w-fit shrink-0 items-center rounded-full font-medium whitespace-nowrap",
        size === "compact" ? "h-5 gap-1 px-2 text-xs" : "h-6 gap-1.5 px-2.5 text-[13px]",
        toneStyle.className,
        className,
      )}
    >
      <Icon
        className={cn(
          size === "compact" ? "size-3" : "size-3.5",
          "shrink-0",
          tone === "progress" && "motion-safe:animate-spin",
        )}
        aria-hidden="true"
      />
      {children}
    </span>
  );
}

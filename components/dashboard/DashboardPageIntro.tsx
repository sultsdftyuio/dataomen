import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { PageHeader } from "./PageHeader";

type DashboardPageIntroProps = {
  /** Ignored: the sidebar already shows where the page sits. */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Ignored: page headings carry no icon tile. */
  icon?: LucideIcon;
  /** Rendered in PageHeader's actions slot. */
  visual?: ReactNode;
};

/**
 * @deprecated Use `PageHeader` from "@/components/dashboard/PageHeader".
 * Kept as a thin wrapper so existing pages keep rendering while they move
 * over. A trailing full stop on the old marketing-style titles is dropped.
 */
export function DashboardPageIntro({ title, description, visual }: DashboardPageIntroProps) {
  return (
    <PageHeader
      title={title.replace(/\.\s*$/, "")}
      description={description}
      actions={visual}
      titleId="dashboard-page-title"
    />
  );
}

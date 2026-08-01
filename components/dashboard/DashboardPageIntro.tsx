import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { C } from "@/lib/tokens";

type DashboardPageIntroProps = {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  visual?: ReactNode;
};

/**
 * Compact dashboard heading with the editorial type treatment used by the
 * landing "Learn What You Sell" section.
 */
export function DashboardPageIntro({
  eyebrow,
  title,
  description,
  icon: Icon,
  visual,
}: DashboardPageIntroProps) {
  return (
    <section
      className={visual ? "grid shrink-0 gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center" : "max-w-3xl"}
      aria-labelledby="dashboard-page-title"
    >
      <div>
        <p
          className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.08em]"
          style={{ color: C.blue }}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {eyebrow}
        </p>
        <h1
          id="dashboard-page-title"
          className="pfd mt-2 text-2xl font-semibold sm:text-[28px]"
          style={{ color: C.navy, lineHeight: 1.08, letterSpacing: "-0.015em" }}
        >
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: C.navySoft }}>
          {description}
        </p>
      </div>

      {visual ? <div>{visual}</div> : null}
    </section>
  );
}

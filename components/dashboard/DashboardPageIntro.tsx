import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { C } from "@/lib/tokens";

type DashboardPageIntroProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  icon: LucideIcon;
  visual?: ReactNode;
};

export function DashboardPageIntro({
  eyebrow,
  title,
  description,
  icon: Icon,
  visual,
}: DashboardPageIntroProps) {
  return (
    <section
      className={visual ? "grid shrink-0 gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] sm:items-end sm:gap-5" : "max-w-3xl shrink-0"}
      aria-labelledby="dashboard-page-title"
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: C.blue }}>
            <Icon className="size-3" aria-hidden="true" />
            {eyebrow}
          </p>
        ) : null}
        <h1
          id="dashboard-page-title"
          className={`pfd text-[27px] font-semibold leading-tight sm:text-[31px] ${eyebrow ? "mt-1" : ""}`}
          style={{ color: C.navy }}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1 max-w-3xl text-[13px] leading-[1.6]" style={{ color: C.navySoft }}>
            {description}
          </p>
        ) : null}
      </div>

      {visual ? <aside>{visual}</aside> : null}
    </section>
  );
}

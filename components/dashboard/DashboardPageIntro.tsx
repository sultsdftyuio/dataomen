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
      className={visual ? "grid shrink-0 gap-4 border-b pb-3 sm:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] sm:items-center sm:gap-5" : "max-w-3xl border-b pb-3"}
      aria-labelledby="dashboard-page-title"
      style={{ borderColor: C.rule }}
    >
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border"
          style={{ borderColor: C.blueLight, backgroundColor: C.blueTint, color: C.blue }}
          aria-hidden="true"
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
        {eyebrow ? (
          <p
            className="text-[10px] font-bold uppercase tracking-[0.12em]"
            style={{ color: C.blue }}
          >
            {eyebrow}
          </p>
        ) : null}
        <h1
          id="dashboard-page-title"
          className={`pfd text-xl font-semibold leading-none sm:text-2xl ${eyebrow ? "mt-1" : ""}`}
          style={{ color: C.navy }}
        >
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-[13px] leading-5" style={{ color: C.navySoft }}>
            {description}
          </p>
        ) : null}
        </div>
      </div>

      {visual ? <aside className="border-t pt-3 sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0" style={{ borderColor: C.rule }}>{visual}</aside> : null}
    </section>
  );
}

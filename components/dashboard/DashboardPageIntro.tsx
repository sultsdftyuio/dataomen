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
 * Compact dashboard heading with the landing deep-dive surface treatment.
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
      className={visual ? "grid shrink-0 gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-center" : "max-w-3xl"}
      aria-labelledby="dashboard-page-title"
    >
      <div>
        <p
          className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: C.blue }}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {eyebrow}
        </p>
        <h1
          id="dashboard-page-title"
          className="mt-1.5 text-lg font-semibold tracking-tight"
          style={{ color: C.navy, lineHeight: 1.2 }}
        >
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-xs leading-5" style={{ color: C.navySoft }}>
          {description}
        </p>
      </div>

      {visual ? (
        <div className="relative pb-1.5 pr-1.5">
          <div
            className="relative z-10 rounded-md border bg-white p-3"
            style={{
              borderColor: "rgba(10, 22, 40, 0.08)",
              boxShadow: "0 1px 3px rgba(10, 22, 40, 0.08)",
            }}
          >
            {visual}
          </div>
          <div
            aria-hidden="true"
            className="absolute bottom-0 right-0 left-1.5 top-1.5 rounded-md border"
            style={{
              borderColor: "rgba(10, 22, 40, 0.08)",
              backgroundColor: C.bluePale,
            }}
          />
        </div>
      ) : null}
    </section>
  );
}

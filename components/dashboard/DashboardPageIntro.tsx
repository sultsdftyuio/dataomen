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
 * Shared dashboard introduction built from the landing deep-dive surfaces:
 * quiet typography, a bordered white panel, and one restrained blue offset.
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
      className={visual ? "grid gap-8 lg:grid-cols-[minmax(0,1fr)_390px] lg:items-center" : "max-w-3xl"}
      aria-labelledby="dashboard-page-title"
    >
      <div>
        <p
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]"
          style={{ color: C.blue }}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {eyebrow}
        </p>
        <h1
          id="dashboard-page-title"
          className="mt-3 text-3xl font-semibold tracking-[-0.02em] sm:text-4xl"
          style={{ color: C.navy, lineHeight: 1.06 }}
        >
          {title}
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-7" style={{ color: C.navySoft }}>
          {description}
        </p>
      </div>

      {visual ? (
        <div className="relative px-0 pb-2 pr-2 sm:px-2 sm:pb-3 sm:pr-3">
          <div
            className="relative z-10 rounded-lg border bg-white p-5"
            style={{
              borderColor: "rgba(10, 22, 40, 0.08)",
              boxShadow: "0 1px 3px rgba(10, 22, 40, 0.08)",
            }}
          >
            {visual}
          </div>
          <div
            aria-hidden="true"
            className="absolute bottom-0 right-0 left-3 top-3 rounded-lg border"
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

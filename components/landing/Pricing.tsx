"use client";

import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

import { C } from "@/lib/tokens";

const freeFeatures = [
  "Learn from one website",
  "One discovery domain",
  "A live count of matched conversations",
  "Standard email support",
];

const proFeatures = [
  "Ongoing discovery across public conversations",
  "Verified prospect queue and match evidence",
  "Buyer groups and reusable matching criteria",
  "Refresh your brief as your product evolves",
];

function FeatureList({ features, color = C.blue }: { features: string[]; color?: string }) {
  return (
    <ul className="mt-7 space-y-3" style={{ listStyle: "none" }}>
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2.5 text-sm font-medium" style={{ color: C.navy }}>
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color }} aria-hidden="true" />
          {feature}
        </li>
      ))}
    </ul>
  );
}

export default function ArcliPricingCards() {
  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 8px 28px rgba(10,22,40,0.05)";

  return (
    <section
      id="pricing"
      style={{
        padding: "140px 24px",
        background: "linear-gradient(180deg, #F7FBFF 0%, #FFFFFF 100%)",
        borderTop: surfaceBorder,
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <div style={{ textAlign: "center", maxWidth: 660, margin: "0 auto 56px" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: C.blue,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              marginBottom: 14,
            }}
          >
            <Activity size={14} /> SIMPLE PRICING
          </div>
          <h2
            className="pfd"
            style={{
              fontSize: 42,
              color: C.navy,
              lineHeight: 1.08,
              letterSpacing: "-0.015em",
              fontWeight: 600,
              marginBottom: 18,
            }}
          >
            Start free. Upgrade when a prospect is worth acting on.
          </h2>
          <p style={{ color: C.navySoft, fontSize: 17, lineHeight: 1.62 }}>
            One straightforward plan for turning public conversations into a focused prospect queue.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <article
            className="flex min-h-[460px] flex-col rounded-lg border bg-white p-7"
            style={{ borderColor: C.rule, boxShadow: surfaceShadow }}
          >
            <span
              className="inline-flex w-fit rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{ backgroundColor: C.offWhite, color: C.muted, border: surfaceBorder }}
            >
              Free
            </span>
            <h3 className="pfd mt-5 text-3xl leading-none" style={{ color: C.navy }}>
              See the signal.
            </h3>
            <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
              Let Arcli learn your offer and show you whether the right conversations are out there.
            </p>
            <div className="mt-7 border-b pb-6" style={{ borderColor: C.rule }}>
              <span className="text-5xl font-semibold tracking-tight" style={{ color: C.navy }}>$0</span>
              <span className="ml-1 text-sm font-semibold" style={{ color: C.muted }}>/ forever</span>
            </div>
            <FeatureList features={freeFeatures} />
            <Link
              href="/register?tier=free"
              className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors hover:bg-[#F7FBFF]"
              style={{ borderColor: C.ruleDark, color: C.navy, textDecoration: "none" }}
            >
              Get started free <ArrowRight className="size-4" />
            </Link>
          </article>

          <article
            className="relative flex min-h-[460px] flex-col overflow-hidden rounded-lg border bg-white p-7"
            style={{ borderColor: C.blueLight, boxShadow: "0 12px 32px rgba(27,110,191,0.12)" }}
          >
            <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: C.blue }} aria-hidden="true" />
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{ backgroundColor: C.bluePale, color: C.blue, border: "1px solid rgba(27,110,191,0.18)" }}
            >
              <Sparkles className="size-3" aria-hidden="true" /> Pro
            </span>
            <h3 className="pfd mt-5 text-3xl leading-none" style={{ color: C.navy }}>
              Act on the signal.
            </h3>
            <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
              Review the people, evidence, and matching reasons behind every prospect Arcli finds.
            </p>
            <div className="mt-7 border-b pb-6" style={{ borderColor: C.blueLight }}>
              <span className="text-5xl font-semibold tracking-tight" style={{ color: C.navy }}>$35</span>
              <span className="ml-1 text-sm font-semibold" style={{ color: C.muted }}>/ month</span>
              <p className="mt-2 text-xs font-semibold" style={{ color: C.blue }}>Cancel any time.</p>
            </div>
            <FeatureList features={proFeatures} color={C.green} />
            <Link
              href="/register?next=%2Fsettings%3Fupgrade%3Dpro"
              className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors hover:brightness-95"
              style={{ backgroundColor: C.blue, color: C.white, textDecoration: "none" }}
            >
              Get Pro <ArrowRight className="size-4" />
            </Link>
            <p className="mt-4 flex items-center justify-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em]" style={{ color: C.muted }}>
              <ShieldCheck className="size-3.5" style={{ color: C.blue }} aria-hidden="true" /> No commission on revenue
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}

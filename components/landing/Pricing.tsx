"use client";

import Link from "next/link";
import { Activity, ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

import { C } from "@/lib/tokens";
import { Reveal, RevealWords } from "@/components/landing/reveal";

const freeFeatures = [
  "Learn from one website",
  "Review and edit your matching brief",
  "Prepare one buyer and problem profile",
  "Standard email support",
];

const proFeatures = [
  "Ongoing search across supported public sources",
  "Source-linked conversation review queue",
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
        padding: "84px 24px",
        background: "linear-gradient(180deg, #F7FBFF 0%, #FFFFFF 100%)",
        borderTop: surfaceBorder,
        fontFamily: "var(--font-geist-sans), sans-serif",
      }}
    >
      <div style={{ maxWidth: 1040, margin: "0 auto" }}>
        <Reveal style={{ textAlign: "center", maxWidth: 620, margin: "0 auto 44px" }}>
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
            <span className="section-heading-icon" aria-hidden="true"><Activity size={14} /></span>
            SIMPLE PRICING
          </div>
          <h2
            className="pfd"
            style={{
              fontSize: 38,
              color: C.navy,
              lineHeight: 1.08,
              letterSpacing: "-0.015em",
              fontWeight: 600,
              marginBottom: 18,
            }}
          >
            <RevealWords text="Prepare your brief for free. Search public conversations on Pro." />
          </h2>
          <p style={{ color: C.navySoft, fontSize: 16, lineHeight: 1.62 }}>
            Free helps you describe your buyer and problem from your website. Pro runs public-source
            discovery and shows evidence when a conversation fits.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Reveal delay={100}>
            <article
              className="flex min-h-[420px] flex-col rounded-lg border bg-white p-6"
              style={{ borderColor: C.rule, boxShadow: surfaceShadow }}
            >
            <span
              className="inline-flex w-fit rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{ backgroundColor: C.offWhite, color: C.muted, border: surfaceBorder }}
            >
              Free
            </span>
            <h3 className="pfd mt-4 text-2xl leading-none" style={{ color: C.navy }}>
              Prepare your brief.
            </h3>
            <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
              Let Arcli read your public website, then correct its picture of your offer and buyer.
              Free does not search public conversations or show a live match count.
            </p>
            <div className="mt-6 border-b pb-5" style={{ borderColor: C.rule }}>
              <span className="text-4xl font-semibold tracking-tight" style={{ color: C.navy }}>$0</span>
              <span className="ml-1 text-sm font-semibold" style={{ color: C.muted }}>/ forever</span>
            </div>
            <FeatureList features={freeFeatures} />
            <Link
              href="/register?tier=free"
              className="mt-auto inline-flex h-10 items-center justify-center gap-2 rounded-lg border text-sm font-semibold transition-colors hover:bg-[#F7FBFF]"
              style={{ borderColor: C.ruleDark, color: C.navy, textDecoration: "none" }}
            >
              Build free brief <ArrowRight className="size-4" />
            </Link>
            </article>
          </Reveal>

          <Reveal delay={200}>
            <article
              className="relative flex min-h-[420px] flex-col overflow-hidden rounded-lg border bg-white p-6"
              style={{ borderColor: C.blueLight, boxShadow: "0 12px 32px rgba(27,110,191,0.12)" }}
            >
            <div className="absolute inset-x-0 top-0 h-1" style={{ backgroundColor: C.blue }} aria-hidden="true" />
            <span
              className="inline-flex w-fit items-center gap-1.5 rounded-md px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.08em]"
              style={{ backgroundColor: C.bluePale, color: C.blue, border: "1px solid rgba(27,110,191,0.18)" }}
            >
              <Sparkles className="size-3" aria-hidden="true" /> Pro
            </span>
            <h3 className="pfd mt-4 text-2xl leading-none" style={{ color: C.navy }}>
              Start evidence-backed discovery.
            </h3>
            <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
              Search supported public sources and review matched conversations with source context.
              The number of useful results depends on your market and source coverage.
            </p>
            <div className="mt-6 border-b pb-5" style={{ borderColor: C.blueLight }}>
              <span className="text-4xl font-semibold tracking-tight" style={{ color: C.navy }}>$35</span>
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
          </Reveal>
        </div>
      </div>
    </section>
  );
}

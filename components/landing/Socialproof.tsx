"use client";

import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

const stats = [
  { value: "1,200+", label: "Data teams" },
  { value: "4.2B",   label: "Rows analyzed" },
  { value: "< 5 min", label: "Avg. setup time" },
  { value: "99.9%",  label: "Uptime SLA" },
];

const testimonials = [
  {
    quote: "Replaced 80% of our BI dashboard work. Our analysts now spend time on strategy, not queries.",
    name: "Sarah Chen",
    role: "Head of Data",
    company: "Nexus Technologies",
    initials: "SC",
    color: C.blue,
  },
  {
    quote: "We caught a payment processor issue before a single customer noticed. That alone paid for a year.",
    name: "Marcus Webb",
    role: "VP Engineering",
    company: "Quantum Commerce",
    initials: "MW",
    color: C.green,
  },
  {
    quote: "Our CFO now pulls her own revenue breakdowns. That sentence wouldn't have made sense 6 months ago.",
    name: "Priya Nair",
    role: "CTO",
    company: "Vertex SaaS",
    initials: "PN",
    color: C.navySoft,
  },
];

export function SocialProof() {
  const [ref, vis] = useVisible(0.1);

  return (
    <section style={{ padding: "100px 24px", background: "#fff", borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }} ref={ref}>

        {/* ── Stats Row ── */}
        <div
          className={`fu ${vis ? "vis" : ""}`}
          style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 1, background: C.rule, border: `1px solid ${C.rule}`, borderRadius: 20, overflow: "hidden", marginBottom: 80 }}
        >
          {stats.map((s, i) => (
            <div key={i} style={{ background: "#fff", padding: "40px 32px", textAlign: "center" }}>
              <div className="pfd" style={{ fontSize: 44, fontWeight: 800, color: C.navy, marginBottom: 8 }}>
                {s.value}
              </div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>

        {/* ── Testimonials ── */}
        <div className={`fu ${vis ? "vis" : ""}`} style={{ transitionDelay: "120ms" }}>
          <p style={{ textAlign: "center", fontSize: 13, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 40 }}>
            What customers are saying
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 24 }}>
            {testimonials.map((t, i) => (
              <div
                key={i}
                style={{
                  background: C.offWhite, border: `1px solid ${C.rule}`, borderRadius: 20,
                  padding: 36, display: "flex", flexDirection: "column", gap: 24,
                  transition: "box-shadow 0.2s",
                }}
                onMouseOver={e => (e.currentTarget.style.boxShadow = "0 16px 40px rgba(10,22,40,0.06)")}
                onMouseOut={e  => (e.currentTarget.style.boxShadow = "none")}
              >
                {/* Stars */}
                <div style={{ display: "flex", gap: 4 }}>
                  {[1,2,3,4,5].map(s => (
                    <div key={s} style={{ fontSize: 16, color: C.amber }}>★</div>
                  ))}
                </div>

                <p style={{ fontSize: 17, color: C.navy, lineHeight: 1.65, fontStyle: "italic", flex: 1 }}>
                  "{t.quote}"
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: t.color,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 800, fontSize: 14, flexShrink: 0
                  }}>
                    {t.initials}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, color: C.navy, fontSize: 14 }}>{t.name}</div>
                    <div style={{ fontSize: 13, color: C.muted }}>{t.role} · {t.company}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </section>
  );
}
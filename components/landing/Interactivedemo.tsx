"use client";

import { useState, useEffect, useRef } from "react";
import { Search, Sparkles, TrendingUp, ArrowRight, BarChart2 } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

const QUERIES = [
  {
    q: "What was MRR last month?",
    headline: "MRR last month was $312,400.",
    detail: "That's up 8.7% month-over-month, driven by 43 new Enterprise subscriptions.",
    metric: "$312,400",
    delta: "+8.7%",
    bars: [55, 60, 58, 65, 70, 68, 75, 80, 78, 85, 90, 100],
    positive: true,
  },
  {
    q: "Which campaign drove the most revenue in Q3?",
    headline: "\"Product-Led Growth\" campaign led with $148K.",
    detail: "It outperformed the next campaign by 2.3× and had the lowest CAC at $42/customer.",
    metric: "$148,000",
    delta: "+2.3×",
    bars: [30, 45, 38, 60, 100, 55, 70, 48, 62, 75, 80, 68],
    positive: true,
  },
  {
    q: "What is churn by cohort this year?",
    headline: "Churn is highest in the Feb cohort at 6.4%.",
    detail: "Cohorts onboarded post-April show consistent improvement, averaging 2.1% monthly churn.",
    metric: "2.1% avg",
    delta: "↓ Improving",
    bars: [100, 88, 75, 64, 55, 50, 45, 40, 36, 32, 28, 25],
    positive: false,
  },
  {
    q: "Which features increase retention?",
    headline: "Users who activate 3+ integrations retain at 94%.",
    detail: "Integration depth is your #1 retention driver. Users with 1 integration retain at only 61%.",
    metric: "94% retention",
    delta: "+33pts",
    bars: [30, 40, 52, 61, 72, 80, 86, 90, 92, 93, 93, 94],
    positive: true,
  },
];

type QueryResult = typeof QUERIES[0];

export function InteractiveDemo() {
  const [secRef, secVis] = useVisible(0.15);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [typing, setTyping] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const runQuery = (idx: number) => {
    const q = QUERIES[idx];
    setActiveIdx(idx);
    setTyping(true);
    setResult(null);
    setInputVal(q.q);

    setTimeout(() => {
      setTyping(false);
      setResult(q);
    }, 900);
  };

  return (
    <section
      style={{ padding: "120px 24px", background: C.offWhite, borderTop: `1px solid ${C.rule}`, borderBottom: `1px solid ${C.rule}` }}
    >
      <div style={{ maxWidth: 1000, margin: "0 auto" }} ref={secRef}>

        {/* Header */}
        <div className={`fu ${secVis ? "vis" : ""}`} style={{ textAlign: "center", marginBottom: 56 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, background: C.bluePale, border: `1px solid ${C.ruleDark}`, padding: "6px 16px", borderRadius: 30, marginBottom: 24, color: C.blue }}>
            <Sparkles size={14} /> <span style={{ fontSize: 13, fontWeight: 700 }}>TRY IT LIVE</span>
          </div>
          <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 16, lineHeight: 1.1 }}>
            Ask your data a question.
          </h2>
          <p style={{ color: C.muted, fontSize: 18, maxWidth: 520, margin: "0 auto" }}>
            Click any example below and watch Arclis answer in real time.
          </p>
        </div>

        {/* Demo shell */}
        <div className={`fu ${secVis ? "vis" : ""}`} style={{ transitionDelay: "120ms" }}>

          {/* Suggestion chips */}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center", marginBottom: 28 }}>
            {QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => runQuery(i)}
                style={{
                  padding: "10px 20px", borderRadius: 30, fontWeight: 600, fontSize: 14,
                  border: `1.5px solid ${activeIdx === i ? C.blue : C.ruleDark}`,
                  background: activeIdx === i ? C.bluePale : "#fff",
                  color: activeIdx === i ? C.blue : C.muted,
                  cursor: "pointer", transition: "all 0.2s",
                }}
              >
                {q.q}
              </button>
            ))}
          </div>

          {/* App Window */}
          <div style={{ background: "#fff", border: `1.5px solid ${C.ruleDark}`, borderRadius: 20, overflow: "hidden", boxShadow: "0 20px 60px rgba(10,22,40,0.08)", minHeight: 420 }}>

            {/* Browser chrome */}
            <div style={{ height: 48, background: C.offWhite, borderBottom: `1.5px solid ${C.rule}`, display: "flex", alignItems: "center", padding: "0 20px", gap: 8 }}>
              {[1,2,3].map(i => <div key={i} style={{ width: 11, height: 11, borderRadius: "50%", background: C.ruleDark }} />)}
              <div style={{ flex: 1, height: 30, background: "#fff", borderRadius: 6, border: `1px solid ${C.rule}`, marginLeft: 20, display: "flex", alignItems: "center", padding: "0 14px", gap: 10 }}>
                <Search size={14} color={C.faint} />
                <span style={{ fontSize: 13, color: C.navy, fontWeight: 500, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>
                  {inputVal || "Click a question above to try the live demo..."}
                </span>
              </div>
            </div>

            {/* Response area */}
            <div style={{ padding: "40px 48px", minHeight: 372, display: "flex", alignItems: typing || !result ? "center" : "flex-start", justifyContent: typing || !result ? "center" : "flex-start" }}>

              {/* Idle state */}
              {!typing && !result && (
                <div style={{ textAlign: "center", color: C.faint }}>
                  <BarChart2 size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
                  <p style={{ fontSize: 15, fontWeight: 500 }}>Select a question to see Arclis in action</p>
                </div>
              )}

              {/* Typing indicator */}
              {typing && (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  {[0,1,2].map(i => (
                    <div key={i} style={{
                      width: 10, height: 10, borderRadius: "50%", background: C.blue,
                      animation: `float1 0.8s ease-in-out infinite`,
                      animationDelay: `${i * 0.15}s`,
                      opacity: 0.6,
                    }} />
                  ))}
                  <span style={{ marginLeft: 8, color: C.muted, fontSize: 14 }}>Analyzing your data…</span>
                </div>
              )}

              {/* Result */}
              {!typing && result && (
                <div style={{ width: "100%" }}>
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-start", marginBottom: 28 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 12, background: C.blue, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <Sparkles size={20} color="#fff" />
                    </div>
                    <div style={{ paddingTop: 4 }}>
                      <h4 style={{ fontSize: 19, fontWeight: 700, color: C.navy, marginBottom: 8 }}>{result.headline}</h4>
                      <p style={{ color: C.muted, fontSize: 15, lineHeight: 1.6 }}>{result.detail}</p>
                    </div>
                  </div>

                  <div style={{ background: C.offWhite, borderRadius: 16, padding: 28, border: `1px solid ${C.rule}` }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
                      <div className="pfd" style={{ fontSize: 30, fontWeight: 800, color: C.navy }}>{result.metric}</div>
                      <div style={{
                        display: "flex", alignItems: "center", gap: 6, fontWeight: 700, fontSize: 14,
                        color: result.positive ? C.green : C.blue,
                        background: result.positive ? C.greenPale : C.bluePale,
                        padding: "8px 16px", borderRadius: 20
                      }}>
                        {result.positive && <TrendingUp size={15} />} {result.delta}
                      </div>
                    </div>
                    <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 120 }}>
                      {result.bars.map((h, i) => (
                        <div key={i} style={{ flex: 1, height: "100%", display: "flex", alignItems: "flex-end" }}>
                          <div style={{
                            width: "100%", height: `${h}%`,
                            background: i > 8 ? C.blue : C.blueLight,
                            borderRadius: "4px 4px 0 0",
                            opacity: i > 8 ? 1 : 0.55,
                            transition: "height 0.5s ease",
                          }} />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* CTA below demo */}
          <div style={{ textAlign: "center", marginTop: 32 }}>
            <a href="/register" className="btn-blue" style={{ padding: "16px 40px", fontSize: 15 }}>
              Connect your own data <ArrowRight size={17} />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
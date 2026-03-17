"use client";

import { CheckCircle2, Zap, Activity, Bell, Sparkles } from "lucide-react";
import { C } from "@/lib/tokens";
import { useVisible } from "@/hooks/useVisible";

export function DeepDiveFeatures() {
  const [ref1, vis1] = useVisible(0.1);
  const [ref2, vis2] = useVisible(0.1);

  return (
    <section id="platform" style={{ padding: "140px 24px", background: C.offWhite, borderTop: `1px solid ${C.rule}` }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>

        {/* ── Segment A: Natural Language Engine ── */}
        <div className="grid-2" style={{ marginBottom: 160 }} ref={ref1 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 1 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.blue, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              <Zap size={18} /> AI DATA ANALYST
            </div>
            <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Stop waiting on data tickets.<br />Ask it yourself.
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              DataOmen's AI understands your unique business context. 
              Simply type your question in plain English, and it instantly translates it into perfectly optimized SQL, generating presentation-ready charts on the fly.
            </p>
            <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 16 }}>
              {["No SQL or Python required", "Understands your custom schema", "Exports directly to PDF/CSV"].map((item, i) => (
                <li key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 16, fontWeight: 600, color: C.navy }}>
                  <CheckCircle2 size={20} color={C.blue} /> {item}
                </li>
              ))}
            </ul>
          </div>

          <div className={`fu ${vis1 ? "vis" : ""}`} style={{ order: 2, background: C.offWhite, padding: 40, borderRadius: 24, border: `1px solid ${C.rule}`, position: "relative" }}>
            
            {/* Added: "Show, Don't Tell" User Input Bubble */}
            <div style={{ background: "#fff", border: `1px solid ${C.rule}`, borderRadius: 12, padding: "16px 20px", marginBottom: 16, display: "flex", gap: 12, alignItems: "center", boxShadow: "0 10px 30px rgba(0,0,0,0.05)", position: "relative", zIndex: 3 }}>
              <div style={{ width: 32, height: 32, borderRadius: "50%", background: "rgba(59,154,232,0.1)", display: "flex", alignItems: "center", justifyContent: "center", color: C.blue, flexShrink: 0 }}>
                <Sparkles size={16} />
              </div>
              <div style={{ fontWeight: 600, color: C.navy, fontSize: 15 }}>
                "Show me total revenue by month for captured transactions."
              </div>
            </div>

            <div className="jbm" style={{ background: "#1E1E1E", color: "#D4D4D4", padding: 20, borderRadius: 12, fontSize: 13, marginBottom: -20, position: "relative", zIndex: 2, boxShadow: "0 20px 40px rgba(0,0,0,0.2)", lineHeight: 1.8 }}>
              <span style={{ color: "#569CD6" }}>SELECT</span> date_trunc(<span style={{ color: "#CE9178" }}>'month'</span>, created_at),<br />
              <span style={{ color: "#569CD6" }}>SUM</span>(amount) <span style={{ color: "#569CD6" }}>AS</span> total_revenue<br />
              <span style={{ color: "#569CD6" }}>FROM</span> core_transactions<br />
              <span style={{ color: "#569CD6" }}>WHERE</span> status = <span style={{ color: "#CE9178" }}>'captured'</span><br />
              <span style={{ color: "#569CD6" }}>GROUP BY</span> 1 <span style={{ color: "#569CD6" }}>ORDER BY</span> 1 <span style={{ color: "#569CD6" }}>DESC</span>;
            </div>
            
            <div style={{ background: "#fff", padding: "40px 24px 24px", borderRadius: 12, border: `1px solid ${C.rule}`, position: "relative", zIndex: 1 }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 120 }}>
                {[20, 35, 30, 60, 80, 90, 100].map((h, i) => (
                  <div key={i} style={{ flex: 1, background: C.blueLight, height: `${h}%`, borderRadius: "4px 4px 0 0", transition: "height 1s ease-out" }} />
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Segment B: Proactive Monitoring ── */}
        <div className="grid-2" ref={ref2 as React.RefObject<HTMLDivElement>}>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 2 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, color: C.red, fontWeight: 700, fontSize: 14, marginBottom: 16 }}>
              <Activity size={18} /> PROACTIVE MONITORING
            </div>
            <h2 className="pfd" style={{ fontSize: 44, color: C.navy, marginBottom: 24, lineHeight: 1.1 }}>
              Know before your customers do.
            </h2>
            <p style={{ color: C.muted, fontSize: 18, lineHeight: 1.6, marginBottom: 32 }}>
              Don't just stare at dashboards waiting for lines to drop. DataOmen continuously monitors your metrics 24/7. 
              If conversion rates dip or API errors spike, you get an immediate alert with the root cause already diagnosed.
            </p>
            <a href="#agents" className="btn-ghost" style={{ padding: "14px 28px" }}>
              Explore AI Watchdogs
            </a>
          </div>

          <div className={`fu ${vis2 ? "vis" : ""}`} style={{ order: 1, position: "relative" }}>
            <div style={{ background: C.navy, borderRadius: 24, padding: 40, position: "relative", zIndex: 2, color: "#fff", boxShadow: "0 30px 60px rgba(10,22,40,0.2)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
                <div className="pulse-indicator pulse-red" />
                <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "0.05em" }}>LIVE SYSTEM LOG</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 20 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.redPale }}>
                      <Bell size={16} color={C.red} />
                      <span style={{ fontWeight: 600 }}>Anomaly Detected</span>
                    </div>
                    <span style={{ fontSize: 12, color: C.faint }}>Just now</span>
                  </div>
                  <h5 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>Checkout Conversion Drop</h5>
                  <p style={{ fontSize: 14, color: C.faint, lineHeight: 1.5 }}>
                    EMEA region conversion fell by 4.2% in the last hour. AI diagnosis correlates this with a spike in Stripe Gateway latency.
                  </p>
                </div>

                <div style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12, padding: 20, opacity: 0.6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, color: C.greenPale, marginBottom: 8 }}>
                    <CheckCircle2 size={16} color={C.green} />
                    <span style={{ fontWeight: 600 }}>Sync Complete</span>
                  </div>
                  <h5 style={{ fontSize: 15, fontWeight: 700 }}>PostgreSQL Replica Synced</h5>
                </div>
              </div>
            </div>
            <div style={{ position: "absolute", top: -20, left: -20, right: 20, bottom: 20, background: C.blue, borderRadius: 24, zIndex: 1, opacity: 0.08 }} />
          </div>
        </div>

      </div>
    </section>
  );
}
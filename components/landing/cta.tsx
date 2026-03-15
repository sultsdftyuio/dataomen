"use client";

import { CheckCircle2, ArrowRight, Calendar } from "lucide-react";
import { C } from "@/lib/tokens";

export function CTA() {
  return (
    <section style={{ padding: "120px 24px", background: C.blue, textAlign: "center", color: "#fff", position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, opacity: 0.1 }} className="dark-grid" />

      {/* Decorative blobs */}
      <div style={{ position: "absolute", top: "-20%", left: "-10%", width: 500, height: 500, background: C.navy, borderRadius: "50%", opacity: 0.2, filter: "blur(120px)" }} />
      <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: 400, height: 400, background: C.blueMid, borderRadius: "50%", opacity: 0.3, filter: "blur(100px)" }} />

      <div style={{ position: "relative", zIndex: 1, maxWidth: 720, margin: "0 auto" }}>
        <h2 className="pfd" style={{ fontSize: 56, marginBottom: 20, lineHeight: 1.08 }}>
          Stop guessing.<br />Start knowing.
        </h2>
        <p style={{ fontSize: 20, marginBottom: 48, opacity: 0.9, lineHeight: 1.6 }}>
          Connect your first source and deploy your first AI agent in under 5 minutes.
        </p>

        {/* CTA buttons */}
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 32 }}>
          <a
            href="/register"
            style={{
              background: "#fff", color: C.blue, padding: "20px 48px",
              borderRadius: 12, fontWeight: 800, textDecoration: "none",
              fontSize: 17, display: "inline-flex", alignItems: "center", gap: 10,
              boxShadow: "0 20px 40px rgba(0,0,0,0.2)", transition: "transform 0.2s",
            }}
            onMouseOver={e => (e.currentTarget.style.transform = "scale(1.02)")}
            onMouseOut={e  => (e.currentTarget.style.transform = "scale(1)")}
          >
            Start Free Trial <ArrowRight size={18} />
          </a>
          <a
            href="/demo"
            className="btn-ghost-white"
            style={{ padding: "20px 40px", fontSize: 17 }}
          >
            <Calendar size={18} /> Book a Demo
          </a>
        </div>

        {/* Trust nudges */}
        <div style={{ display: "flex", gap: 28, fontSize: 14, fontWeight: 600, opacity: 0.85, flexWrap: "wrap", justifyContent: "center" }}>
          {["14-day free trial", "No credit card required", "Setup in 5 minutes"].map((t, i) => (
            <span key={i} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <CheckCircle2 size={15} /> {t}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
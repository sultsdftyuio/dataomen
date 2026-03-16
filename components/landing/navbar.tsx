"use client";

import { useState, useEffect } from "react";
import { Database, Calendar } from "lucide-react";
import { C } from "@/lib/tokens";

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const h = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", h);
    return () => window.removeEventListener("scroll", h);
  }, []);

  const navLinks = ["Platform", "Agents", "Pricing", "Docs", "Security"];

  return (
    <nav
      className={scrolled ? "nav-scrolled" : ""}
      style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, transition: "all 0.3s" }}
    >
      <div style={{
        maxWidth: 1240, margin: "0 auto", padding: "0 24px",
        height: 80, display: "flex", alignItems: "center", justifyContent: "space-between"
      }}>
        {/* Logo */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10, background: C.navy,
            display: "flex", alignItems: "center", justifyContent: "center"
          }}>
            <Database size={18} color="#fff" />
          </div>
          <span style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 24,
            fontWeight: 800, color: C.navy, letterSpacing: "-0.03em", textTransform: "uppercase"
          }}>
            Arcli<span style={{ color: C.blue }}>.</span>
          </span>
        </div>

        {/* Nav Links */}
        <div className="hide-mobile" style={{ display: "flex", gap: 32 }}>
          {navLinks.map(n => (
            <a
              key={n}
              href={n === "Pricing" ? "#pricing" : `#${n.toLowerCase()}`}
              style={{ textDecoration: "none", color: C.muted, fontWeight: 600, fontSize: 15, transition: "color 0.2s" }}
              onMouseOver={e => (e.currentTarget.style.color = C.navy)}
              onMouseOut={e  => (e.currentTarget.style.color = C.muted)}
            >
              {n}
            </a>
          ))}
        </div>

        {/* CTA Buttons */}
        <div style={{ display: "flex", gap: 12 }}>
          <a
            href="/demo"
            className="btn-ghost hide-mobile"
            style={{ padding: "10px 20px", display: "inline-flex", alignItems: "center", gap: 8 }}
          >
            <Calendar size={15} /> Book Demo
          </a>
          <a href="/login" className="btn-ghost hide-mobile" style={{ padding: "10px 20px" }}>
            Log In
          </a>
          <a href="/register" className="btn-navy" style={{ padding: "10px 24px" }}>
            Start Free Trial
          </a>
        </div>
      </div>
    </nav>
  );
}
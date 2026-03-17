"use client";

import { useState, useEffect } from "react";
import { Play, User } from "lucide-react";
import { C } from "@/lib/tokens";
import { Logo } from "@/components/ui/logo";

/**
 * Navbar Component
 * * Provides the primary navigation interface for Arcli.
 * Incorporates a scroll-sensitive transition for the "nav-scrolled" state
 * and integrates the Product-Led Growth (PLG) CTA strategy.
 */
export function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { name: "Platform", href: "#platform" },
    { name: "Agents", href: "#agents" },
    { name: "Pricing", href: "#pricing" },
    { name: "Security", href: "#security" },
    { name: "Docs", href: "/docs" }
  ];

  return (
    <nav
      className={scrolled ? "nav-scrolled" : ""}
      style={{ 
        position: "fixed", 
        top: 0, 
        left: 0, 
        right: 0, 
        zIndex: 100, 
        transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
        backgroundColor: scrolled ? "rgba(255, 255, 255, 0.9)" : "transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none",
        borderBottom: scrolled ? `1px solid ${C.rule}` : "1px solid transparent"
      }}
    >
      <div style={{
        maxWidth: 1240, 
        margin: "0 auto", 
        padding: "0 24px",
        height: 80, 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "space-between"
      }}>
        {/* Logo Section */}
        <div 
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="transition-transform hover:scale-105"
          style={{ display: "flex", alignItems: "center", cursor: "pointer" }}
        >
          <Logo className="h-8 w-auto" />
        </div>

        {/* Navigation Links */}
        <div className="hide-mobile" style={{ display: "flex", gap: 32 }}>
          {navLinks.map(n => (
            <a
              key={n.name}
              href={n.href}
              style={{ 
                textDecoration: "none", 
                color: scrolled ? C.navy : C.muted, 
                fontWeight: 600, 
                fontSize: 14, 
                transition: "color 0.2s",
                letterSpacing: "0.02em"
              }}
              onMouseOver={e => (e.currentTarget.style.color = C.blue)}
              onMouseOut={e  => (e.currentTarget.style.color = scrolled ? C.navy : C.muted)}
            >
              {n.name}
            </a>
          ))}
        </div>

        {/* Action CTAs */}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <a
            href="#demo"
            className="btn-ghost hide-mobile"
            style={{ 
              padding: "10px 18px", 
              display: "inline-flex", 
              alignItems: "center", 
              gap: 8, 
              fontSize: 14,
              fontWeight: 700,
              color: C.navy
            }}
          >
            <Play size={14} fill={C.navy} /> Try Playground
          </a>
          
          <a 
            href="/login" 
            className="hide-mobile" 
            style={{ 
              fontSize: 14, 
              fontWeight: 700, 
              color: C.muted, 
              textDecoration: "none", 
              marginRight: 8,
              display: "inline-flex",
              alignItems: "center",
              gap: 6
            }}
          >
            <User size={16} /> Log In
          </a>

          <a 
            href="/register" 
            className="btn-navy" 
            style={{ 
              padding: "12px 24px", 
              fontSize: 14, 
              fontWeight: 800, 
              borderRadius: 10,
              boxShadow: scrolled ? "0 4px 12px rgba(10, 22, 40, 0.2)" : "none"
            }}
          >
            Start Free Trial
          </a>
        </div>
      </div>
    </nav>
  );
}
// app/(dashboard)/dashboard/StepCard.tsx
"use client";

import { CheckCircle2, Clock3, Lock } from "lucide-react";
import React from "react";
import { C } from "@/lib/tokens";

export interface StepProps {
  step: number;
  title: string;
  description: string;
  status: "complete" | "active" | "locked";
  icon: React.ReactNode;
  action?: React.ReactNode;
  helperText?: string;
}

export default function StepCard({
  step,
  title,
  description,
  status,
  icon,
  action,
  helperText,
}: StepProps) {
  const isComplete = status === "complete";
  const isActive   = status === "active";

  const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
  const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";

  const HelperIcon = isComplete ? CheckCircle2 : isActive ? Clock3 : Lock;
  
  const helperIconColor = isComplete
    ? "#10B981" 
    : isActive
      ? C.blue
      : C.faint;

  // Aesthetic mapping based on step status
  const cardStyle: React.CSSProperties = isActive 
    ? { background: "#FFFFFF", border: surfaceBorder, boxShadow: surfaceShadow, borderRadius: 12, padding: 24 }
    : isComplete
      ? { background: "#FAFAFA", border: surfaceBorder, borderRadius: 12, padding: 24 }
      : { background: "transparent", border: "1px solid transparent", borderRadius: 12, padding: 24, opacity: 0.5 };

  const iconBoxStyle: React.CSSProperties = isComplete
    ? { background: "rgba(16,185,129,0.1)", color: "#10B981" }
    : isActive
      ? { background: "rgba(59,130,246,0.1)", color: C.blue }
      : { background: "rgba(0,0,0,0.05)", color: C.faint };

  return (
    <li
      aria-current={isActive ? "step" : undefined}
      className="group relative flex gap-4 transition-all duration-300"
      style={cardStyle}
    >
      {/* Subtle Dashed Connector */}
      <div
        aria-hidden="true"
        className="absolute group-last:hidden"
        style={{
          left: 40, // 24px padding + 16px (half of 32px icon box)
          top: 64,  // Drops below the icon
          bottom: -16, // Extends into the gap between items
          borderLeft: "1px dashed rgba(0,0,0,0.08)",
          zIndex: 0
        }}
      />

      {/* Compact Tinted Icon Box */}
      <div
        className="relative z-10 flex shrink-0 items-center justify-center rounded-lg"
        style={{
          width: 32,
          height: 32,
          ...iconBoxStyle
        }}
      >
        {/* Force Lucide icons to size 16/18 dynamically without altering parent definition */}
        {icon}
      </div>

      {/* Content Block */}
      <div className="flex-1 min-w-0" style={{ paddingTop: 3 }}>
        
        {/* Step Label & Status Badge */}
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <span style={{ color: isActive ? C.blue : C.navySoft, fontWeight: 700, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            STEP 0{step}
          </span>

          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
              padding: "3px 8px",
              borderRadius: 6,
              background: isComplete ? "rgba(16,185,129,0.08)" : isActive ? "rgba(59,130,246,0.08)" : "rgba(0,0,0,0.04)",
              color: isComplete ? "#10B981" : isActive ? C.blue : C.faint,
              border: isComplete ? "1px solid rgba(16,185,129,0.12)" : isActive ? "1px solid rgba(59,130,246,0.12)" : surfaceBorder
            }}
          >
            {isComplete ? "Complete" : isActive ? "In Progress" : "Locked"}
          </span>
        </div>

        {/* Premium Display Title */}
        <h3 className="pfd" style={{ fontSize: 20, color: C.navy, marginBottom: 8, lineHeight: 1.08, letterSpacing: "-0.015em", fontWeight: 600 }}>
          {title}
        </h3>

        <p style={{ color: C.navySoft, fontSize: 14, lineHeight: 1.62, marginBottom: (helperText || action) ? 18 : 0, maxWidth: "600px" }}>
          {description}
        </p>

        {/* Data-Style Helper Readout */}
        {helperText && (
          <div 
            style={{ 
              display: "flex", 
              alignItems: "center", 
              gap: 8, 
              background: "#FAFAFA", 
              padding: "10px 14px", 
              borderRadius: 8, 
              border: surfaceBorder,
              marginBottom: action ? 20 : 0,
              width: "fit-content"
            }}
          >
            <HelperIcon
              aria-hidden="true"
              size={14}
              color={helperIconColor}
              style={{ flexShrink: 0 }}
            />
            <span style={{ fontSize: 13, fontWeight: 500, color: C.navySoft }}>
              {helperText}
            </span>
          </div>
        )}

        {/* Action Button Area */}
        {action && <div>{action}</div>}
      </div>
    </li>
  );
}
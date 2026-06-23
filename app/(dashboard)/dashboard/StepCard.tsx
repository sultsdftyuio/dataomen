// app/(dashboard)/dashboard/StepCard.tsx
"use client";

import React, { ReactNode } from "react";
import { CheckCircle2, Circle, Lock } from "lucide-react";
import { C } from "@/lib/tokens";

export interface StepProps {
  step: number;
  title: string;
  description: string;
  status: "complete" | "active" | "locked";
  icon: ReactNode;
  helperText?: string;
  action?: ReactNode;
  // Added the missing prop to the interface definition
  isHighlighted?: boolean; 
}

export default function StepCard({
  step,
  title,
  description,
  status,
  icon,
  helperText,
  action,
  isHighlighted = false, // Default to false if not provided
}: StepProps) {
  
  // Define visual states based on the step's status
  const isActive = status === "active";
  const isComplete = status === "complete";
  const isLocked = status === "locked";

  // Determine border color based on status and the new highlighted prop
  let borderColor = "rgba(0,0,0,0.08)";
  if (isHighlighted) {
    borderColor = "rgba(59,130,246,0.5)"; // Blue highlight ring
  } else if (isActive) {
    borderColor = "rgba(0,0,0,0.12)";
  }

  // Determine icon and colors based on state
  const IconComponent = isComplete ? CheckCircle2 : isLocked ? Lock : Circle;
  const iconColor = isComplete ? "#10B981" : isActive ? C.blue : "#9CA3AF";
  
  // Adjust opacity for locked state to indicate it's not ready
  const opacity = isLocked ? 0.6 : 1;

  return (
    <li
      style={{
        display: "flex",
        gap: 20,
        padding: 28,
        background: "#FFFFFF",
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        boxShadow: isHighlighted 
          ? "0 0 0 4px rgba(59,130,246,0.1)" // Outer glow when highlighted
          : "0 1px 3px rgba(0,0,0,0.08)",
        opacity,
        transition: "all 0.3s ease",
        position: "relative",
        overflow: "hidden"
      }}
    >
      {/* Optional: Add a subtle highlight background flash */}
      {isHighlighted && (
        <div style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "linear-gradient(90deg, rgba(59,130,246,0.05) 0%, transparent 100%)",
          pointerEvents: "none"
        }} />
      )}

      {/* Step Number / Status Icon Indicator */}
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <IconComponent size={24} color={iconColor} />
      </div>

      <div style={{ display: "flex", flexDirection: "column", flexGrow: 1 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
          <span style={{ 
            fontSize: 12, 
            fontWeight: 700, 
            color: C.navySoft, 
            textTransform: "uppercase", 
            letterSpacing: "0.06em" 
          }}>
            Step {step}
          </span>
          {/* Main feature Icon */}
          <div style={{ color: C.faint }}>
            {icon}
          </div>
        </div>

        <h3 style={{ 
          fontSize: 18, 
          fontWeight: 600, 
          color: C.navy, 
          marginBottom: 8, 
          letterSpacing: "-0.01em" 
        }}>
          {title}
        </h3>

        <p style={{ 
          fontSize: 15, 
          color: C.navySoft, 
          lineHeight: 1.6, 
          marginBottom: action || helperText ? 20 : 0 
        }}>
          {description}
        </p>

        {/* Render interactive action block if provided */}
        {action && (
          <div style={{ marginBottom: helperText ? 16 : 0 }}>
            {action}
          </div>
        )}

        {/* Render helper/status text if provided */}
        {helperText && (
          <div style={{ 
            fontSize: 13, 
            fontWeight: 500, 
            color: isComplete ? "#059669" : C.faint, 
            display: "flex", 
            alignItems: "center" 
          }}>
            {helperText}
          </div>
        )}
      </div>
    </li>
  );
}
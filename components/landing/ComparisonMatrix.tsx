"use client";

import React from "react";
import { useVisible } from "@/hooks/useVisible";

type MatrixRowInput = {
  category?: string;
  feature?: string;
  dimension?: string;
  traditional?: string;
  legacy?: string;
  legacyBI?: string;
  arcli?: string;
  arcliAdvantage?: string;
  arcliEvolution?: string;
};

interface ComparisonMatrixProps {
  matrix?: MatrixRowInput[];
  rows?: MatrixRowInput[];
  data?: {
    matrix?: MatrixRowInput[];
    rows?: MatrixRowInput[];
  };
}

function normalizeRow(row: MatrixRowInput | string, index: number) {
  if (typeof row === "string") {
    return {
      category: `Comparison ${index + 1}`,
      legacy: row,
      arcliAdvantage: "",
    };
  }

  if (!row || typeof row !== "object") {
    return null;
  }

  const category = row.category || row.feature || row.dimension || `Comparison ${index + 1}`;
  const legacy = row.legacy || row.traditional || row.legacyBI || "";
  const arcliAdvantage = row.arcliAdvantage || row.arcliEvolution || row.arcli || "";

  if (!legacy && !arcliAdvantage) return null;

  return {
    category,
    legacy,
    arcliAdvantage,
  };
}

export const ComparisonMatrix: React.FC<ComparisonMatrixProps> = (props) => {
  const [ref, vis] = useVisible(0.1);
  const source =
    (Array.isArray(props.matrix) && props.matrix) ||
    (Array.isArray(props.rows) && props.rows) ||
    (Array.isArray(props.data?.matrix) && props.data?.matrix) ||
    (Array.isArray(props.data?.rows) && props.data?.rows) ||
    [];

  const normalized = source
    .map((row, idx) => normalizeRow(row, idx))
    .filter(Boolean) as Array<{ category: string; legacy: string; arcliAdvantage: string }>;

  if (!normalized.length) return null;

  return (
    <section
      id="comparison"
      style={{
        padding: "140px 24px",
        background: "#FFFFFF",
        borderTop: "1px solid rgba(0,0,0,0.08)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        fontFamily: "var(--font-geist-sans), sans-serif"
      }}
    >
      <div style={{ maxWidth: 1160, margin: "0 auto" }} ref={ref as React.RefObject<HTMLDivElement>}>
        <div className={`fu ${vis ? "vis" : ""}`} style={{ textAlign: "center", marginBottom: 44 }}>
          <h2 style={{ fontSize: "clamp(34px, 5vw, 44px)", lineHeight: 1.1, letterSpacing: "-0.02em", color: "#0F172A", marginBottom: 14, fontWeight: 700 }}>
            The Competitive Edge
          </h2>
          <p style={{ fontSize: 16, lineHeight: 1.55, color: "#475569", maxWidth: 700, margin: "0 auto" }}>
            A side-by-side view of legacy BI behavior versus Arcli's autonomous analysis model.
          </p>
        </div>

        <div className={`fu ${vis ? "vis" : ""}`} style={{ display: "grid", gap: 10 }}>
          {normalized.map((item, i) => (
            <div
              key={i}
              style={{
                border: "1px solid rgba(0,0,0,0.08)",
                borderRadius: 8,
                overflow: "hidden",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)"
              }}
            >
              <div
                style={{
                  padding: "10px 12px",
                  background: "#FAFAFA",
                  borderBottom: "1px solid rgba(0,0,0,0.08)",
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  color: "#334155"
                }}
              >
                {item.category}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2">
                <div className="md:border-r" style={{ borderColor: "rgba(0,0,0,0.08)", padding: "12px" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#64748B", marginBottom: 6 }}>
                    Legacy Approach
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#334155", fontWeight: 500 }}>
                    {item.legacy}
                  </p>
                </div>

                <div style={{ padding: "12px", background: "#FAFAFA" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", color: "#1D4ED8", marginBottom: 6 }}>
                    Arcli Advantage
                  </div>
                  <p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: "#0F172A", fontWeight: 600 }}>
                    {item.arcliAdvantage}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default ComparisonMatrix;

"use client";

import React from "react";
import { Matrix } from "@/components/landing/seo-blocks-1";

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
  return <Matrix matrix={normalized as any} />;
};

export default ComparisonMatrix;

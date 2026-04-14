"use client";

import React from "react";
import { Features } from "@/components/landing/seo-blocks-2";

type FeatureItem = {
  title?: string;
  description?: string;
};

interface InformationGainProps {
  uniqueInsight?: string;
  structuralAdvantage?: string;
  features?: FeatureItem[];
  bullets?: string[];
  data?: {
    uniqueInsight?: string;
    structuralAdvantage?: string;
    features?: FeatureItem[];
    bullets?: string[];
  };
}

function toFeature(item: FeatureItem | string, index: number): FeatureItem | null {
  if (typeof item === "string") {
    const value = item.trim();
    if (!value) return null;
    return { title: `Insight ${index + 1}`, description: value };
  }

  if (!item || typeof item !== "object") return null;

  const title = typeof item.title === "string" ? item.title.trim() : "";
  const description = typeof item.description === "string" ? item.description.trim() : "";

  if (!title && !description) return null;
  return { title: title || `Insight ${index + 1}`, description };
}

export const InformationGain: React.FC<InformationGainProps> = (props) => {
  const data = props.data ?? {};

  const directFeatures = Array.isArray(props.features)
    ? props.features
    : Array.isArray(data.features)
    ? data.features
    : [];

  const bulletFeatures = [
    ...(Array.isArray(props.bullets) ? props.bullets : []),
    ...(Array.isArray(data.bullets) ? data.bullets : []),
  ].map((bullet, idx) => toFeature(bullet, idx)).filter(Boolean) as FeatureItem[];

  const derived: FeatureItem[] = [];
  const uniqueInsight = props.uniqueInsight || data.uniqueInsight;
  const structuralAdvantage = props.structuralAdvantage || data.structuralAdvantage;

  if (uniqueInsight) {
    derived.push({ title: "Unique Insight", description: uniqueInsight });
  }
  if (structuralAdvantage) {
    derived.push({ title: "Structural Advantage", description: structuralAdvantage });
  }

  const normalized = [
    ...directFeatures.map((item, idx) => toFeature(item, idx)).filter(Boolean) as FeatureItem[],
    ...bulletFeatures,
    ...derived,
  ];

  if (!normalized.length) return null;
  return <Features features={normalized as any} />;
};

export default InformationGain;

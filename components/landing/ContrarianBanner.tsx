"use client";

import React from "react";
import { ContrarianBanner as BaseContrarianBanner } from "@/components/landing/seo-blocks-3";

interface ContrarianBannerProps {
  statement?: string;
  subtext?: string;
  title?: string;
  h2?: string;
  heading?: string;
  copy?: string;
  text?: string;
  description?: string;
  data?: {
    statement?: string;
    subtext?: string;
    title?: string;
    heading?: string;
    description?: string;
  };
}

function pickFirstString(...values: Array<string | undefined>): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

export const ContrarianBanner: React.FC<ContrarianBannerProps> = (props) => {
  const statement = pickFirstString(
    props.statement,
    props.data?.statement,
    props.title,
    props.data?.title,
    props.h2,
    props.heading,
    props.data?.heading,
    props.text,
    props.copy,
  );

  const subtext = pickFirstString(
    props.subtext,
    props.data?.subtext,
    props.description,
    props.data?.description,
  );

  if (!statement) return null;
  return <BaseContrarianBanner statement={statement} subtext={subtext || undefined} />;
};

export default ContrarianBanner;

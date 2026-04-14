"use client";

import React from "react";
import { StrategicQuery } from "@/components/landing/seo-blocks-3";

type ScenarioInput = {
  title?: string;
  description?: string;
  dialect?: string;
  language?: string;
  sql?: string;
  code?: string;
  sqlSnippet?: string;
  businessOutcome?: string;
  outcome?: string;
};

interface AnalyticsDashboardProps {
  scenario?: ScenarioInput;
  scenarios?: ScenarioInput[];
  data?: {
    scenario?: ScenarioInput;
    scenarios?: ScenarioInput[];
  };
  title?: string;
  description?: string;
  sql?: string;
  code?: string;
  businessOutcome?: string;
}

function normalizeScenario(source?: ScenarioInput | null) {
  if (!source || typeof source !== "object") return null;

  const title = source.title || "Analytical Scenario";
  const description = source.description || "Generated analytical query path.";
  const dialect = source.dialect || source.language || "SQL";
  const sql = source.sql || source.code || source.sqlSnippet || "-- Query unavailable";
  const businessOutcome = source.businessOutcome || source.outcome || description;

  return { title, description, dialect, sql, businessOutcome };
}

export const AnalyticsDashboard: React.FC<AnalyticsDashboardProps> = (props) => {
  const candidates: Array<ScenarioInput | undefined> = [
    props.scenario,
    Array.isArray(props.scenarios) ? props.scenarios[0] : undefined,
    props.data?.scenario,
    Array.isArray(props.data?.scenarios) ? props.data?.scenarios[0] : undefined,
    {
      title: props.title,
      description: props.description,
      sql: props.sql || props.code,
      businessOutcome: props.businessOutcome,
    },
  ];

  const resolved = candidates.map((candidate) => normalizeScenario(candidate)).find(Boolean);
  if (!resolved) return null;

  return <StrategicQuery scenario={resolved} />;
};

export default AnalyticsDashboard;

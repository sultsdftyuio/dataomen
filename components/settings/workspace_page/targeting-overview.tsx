import { ArrowUpRight, Check, Globe2, Sparkles } from "lucide-react";

import type { ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import type { TargetingBriefView } from "@/lib/targeting-brief";

import "./targeting-overview.css";

type OverviewCardProps = {
  number: string;
  title: string;
  description: string;
  items: string[];
  empty: string;
  source: string;
  editHref: string;
};

function OverviewCard({ number, title, description, items, empty, source, editHref }: OverviewCardProps) {
  return (
    <article className="arc-brief-overview__card">
      <div className="arc-brief-overview__card-heading">
        <span className="arc-brief-overview__number">{number}</span>
        <h3>{title}</h3>
        <a href={editHref} aria-label={`Edit ${title.toLowerCase()}`}>
          Edit <ArrowUpRight size={13} aria-hidden="true" />
        </a>
      </div>
      <p className="arc-brief-overview__description">{description}</p>
      {items.length > 0 ? (
        <ul className="arc-brief-overview__items">
          {items.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
        </ul>
      ) : (
        <p className="arc-brief-overview__empty">{empty}</p>
      )}
      <p className="arc-brief-overview__source">{source}</p>
    </article>
  );
}

function domainFromUrl(value: string | null) {
  if (!value) return "No website connected";
  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value;
  }
}

export function TargetingOverview({
  profile,
  brief,
}: {
  profile: ServiceProfileView;
  brief: TargetingBriefView;
}) {
  if (!profile.hasProfile) return null;

  const fields = profile.fields;
  const cards: OverviewCardProps[] = [
    {
      number: "01",
      title: "Offer",
      description: "What you solve and how you are different.",
      items: [fields.core_problem, fields.unique_value_prop].filter(Boolean),
      empty: "Add the core problem and your value proposition.",
      source: "From your website profile",
      editHref: "#targeting-editor",
    },
    {
      number: "02",
      title: "Buyers",
      description: "The people and teams worth finding.",
      items: fields.target_audience,
      empty: "Add your target buyers.",
      source: "From your website profile",
      editHref: "#targeting-editor",
    },
    {
      number: "03",
      title: "Exclusions",
      description: "Who should stay outside your search.",
      items: [...brief.exclusions, ...fields.excluded_audiences, ...fields.negative_keywords],
      empty: "No exclusions added yet.",
      source: brief.exclusions.length ? "From your saved target universe" : "From your website profile",
      editHref: brief.exclusions.length ? "#targeting-universe-editor" : "#targeting-editor",
    },
    {
      number: "04",
      title: "Signals",
      description: "The public moments that call for a closer look.",
      items: [...brief.strongEvidenceDefinitions, ...fields.buying_triggers, ...fields.pain_points],
      empty: "Add buyer signals to guide discovery.",
      source: brief.strongEvidenceDefinitions.length ? "From your saved target universe" : "From your website profile",
      editHref: brief.strongEvidenceDefinitions.length ? "#targeting-universe-editor" : "#targeting-editor",
    },
  ];
  const filledCount = cards.filter((card) => card.items.length > 0).length;
  const updateDate = profile.updatedAt
    ? new Date(profile.updatedAt).toLocaleDateString("en", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <section className="arc-brief-overview" aria-labelledby="arc-brief-overview-title">
      <div className="arc-brief-overview__heading">
        <div>
          <p className="arc-brief-overview__eyebrow">YOUR WORKING BRIEF</p>
          <h2 id="arc-brief-overview-title">The shape of a good fit.</h2>
          <p>Review what Arcli learned and refine the details below.</p>
        </div>
        <a href="#targeting-editor" className="arc-brief-overview__edit">Edit brief <ArrowUpRight size={15} aria-hidden="true" /></a>
      </div>
      <div className="arc-brief-overview__layout">
        <div className="arc-brief-overview__grid">
          {cards.map((card) => <OverviewCard key={card.number} {...card} />)}
        </div>
        <aside className="arc-brief-overview__rail" aria-label="Brief context">
          <div className="arc-brief-overview__rail-card">
            <div className="arc-brief-overview__rail-icon"><Globe2 size={16} aria-hidden="true" /></div>
            <span className="arc-brief-overview__rail-label">WEBSITE</span>
            <strong>{domainFromUrl(profile.websiteUrl)}</strong>
            <p>The source for your starting brief.</p>
          </div>
          <div className="arc-brief-overview__rail-card">
            <div className="arc-brief-overview__rail-icon"><Sparkles size={16} aria-hidden="true" /></div>
            <span className="arc-brief-overview__rail-label">BRIEF STRENGTH</span>
            <strong>{filledCount} of 4 areas defined</strong>
            <div className="arc-brief-overview__progress" aria-hidden="true"><span style={{ width: `${filledCount * 25}%` }} /></div>
            <p>{filledCount === 4 ? "Ready to refine as you review results." : "Add detail to make discovery more focused."}</p>
          </div>
          <div className="arc-brief-overview__rail-card">
            <div className="arc-brief-overview__rail-icon"><Check size={16} aria-hidden="true" /></div>
            <span className="arc-brief-overview__rail-label">HISTORY</span>
            <strong>{updateDate ? `Updated ${updateDate}` : "Starting brief"}</strong>
            <p>{brief.hasBrief ? "Target universe saved" : "Target universe can be set below"}</p>
          </div>
        </aside>
      </div>
    </section>
  );
}

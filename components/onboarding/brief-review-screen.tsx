"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, Pencil, Plus, X } from "lucide-react";

import type {
  ProspectActionResult,
  ServiceProfileFields,
} from "@/app/(dashboard)/dashboard/prospect-types";
import type { CrawlPageSummary } from "@/lib/onboarding/crawl-pages";
import Logo from "@/components/ui/logo";
import { ProfileReviewState } from "./workspace-provisioning-profile";

import "./brief-review-screen.css";

type FieldKey =
  | "unique_value_prop"
  | "core_problem"
  | "use_cases"
  | "target_audience"
  | "excluded_audiences"
  | "negative_keywords"
  | "buying_triggers"
  | "pain_points";
type ArrayField = Exclude<FieldKey, "unique_value_prop" | "core_problem">;
type UpdateField = <Key extends keyof ServiceProfileFields>(
  key: Key,
  value: ServiceProfileFields[Key],
) => void;

type BriefReviewScreenProps = {
  websiteUrl: string;
  pages: CrawlPageSummary[];
  fields: ServiceProfileFields;
  isPending: boolean;
  result: ProspectActionResult | null;
  reviewJson: unknown;
  onUpdateField: UpdateField;
  onPersist: (intent: "save" | "approve") => void;
};

type BriefSection = {
  title: string;
  description: string;
  tone: string;
  fields: FieldKey[];
  addTo: ArrayField;
  placeholder: string;
};

const sections: BriefSection[] = [
  {
    title: "Offer",
    description: "What you sell and the problem it solves",
    tone: "blue",
    fields: ["unique_value_prop", "core_problem", "use_cases"],
    addTo: "use_cases",
    placeholder: "Add a use case",
  },
  {
    title: "Buyers",
    description: "The people and teams you help",
    tone: "green",
    fields: ["target_audience"],
    addTo: "target_audience",
    placeholder: "Add a buyer group",
  },
  {
    title: "Exclusions",
    description: "Who should stay outside your search",
    tone: "violet",
    fields: ["excluded_audiences", "negative_keywords"],
    addTo: "excluded_audiences",
    placeholder: "Add an exclusion",
  },
  {
    title: "Signals",
    description: "Problems and buying moments to watch for",
    tone: "amber",
    fields: ["buying_triggers", "pain_points"],
    addTo: "buying_triggers",
    placeholder: "Add a buying signal",
  },
];

function fieldItems(fields: ServiceProfileFields, keys: FieldKey[]) {
  return keys.flatMap((key) => {
    const value = fields[key];
    if (typeof value === "string") {
      return value.trim() ? [{ key, index: 0, text: value }] : [];
    }
    return value.map((text, index) => ({ key, index, text }));
  });
}

export function BriefReviewScreen({
  websiteUrl,
  pages,
  fields,
  isPending,
  result,
  reviewJson,
  onUpdateField,
  onPersist,
}: BriefReviewScreenProps) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [adding, setAdding] = useState<string | null>(null);
  const [addDraft, setAddDraft] = useState("");
  const [showAllFields, setShowAllFields] = useState(false);
  const domain = (() => {
    try {
      return new URL(websiteUrl).hostname.replace(/^www\./i, "");
    } catch {
      return websiteUrl.replace(/^https?:\/\//i, "");
    }
  })();
  const itemCount = sections.reduce(
    (count, section) => count + fieldItems(fields, section.fields).length,
    0,
  );

  const saveItem = (key: FieldKey, index: number) => {
    const next = draft.trim();
    if (typeof fields[key] === "string") {
      onUpdateField(key as "core_problem" | "unique_value_prop", next);
    } else {
      const arrayKey = key as ArrayField;
      onUpdateField(
        arrayKey,
        fields[arrayKey]
          .map((value, itemIndex) => itemIndex === index ? next : value)
          .filter(Boolean),
      );
    }
    setEditing(null);
  };

  const removeItem = (key: FieldKey, index: number) => {
    if (typeof fields[key] === "string") {
      onUpdateField(key as "core_problem" | "unique_value_prop", "");
    } else {
      const arrayKey = key as ArrayField;
      onUpdateField(arrayKey, fields[arrayKey].filter((_, itemIndex) => itemIndex !== index));
    }
    setEditing(null);
  };

  const addItem = (key: ArrayField) => {
    const next = addDraft.trim();
    if (!next) return;
    onUpdateField(key, [...fields[key], next]);
    setAdding(null);
    setAddDraft("");
  };

  return (
    <div className="arc-review-screen">
      <header className="arc-read-screen__topbar">
        <Link href="/" aria-label="Arcli home" className="arc-read-screen__logo">
          <Logo />
        </Link>
        <ol className="arc-read-screen__steps" aria-label="Setup progress">
          {["Website", "Read", "Review", "Ready"].map((label, index) => (
            <li
              key={label}
              className={index < 2 ? "is-complete" : index === 2 ? "is-current" : ""}
              aria-current={index === 2 ? "step" : undefined}
            >
              <span>{index < 2 ? <Check size={11} aria-hidden="true" /> : index + 1}</span>
              <b>{label}</b>
            </li>
          ))}
        </ol>
        <Link href="/dashboard" className="arc-read-screen__leave">Leave for now</Link>
      </header>

      <div className="arc-review-screen__content">
        <div className="arc-read-screen__intro">
          <div>
            <p className="arc-read-screen__eyebrow">REVIEW YOUR BRIEF</p>
            <h1>Make sure we got you right.</h1>
            <p className="arc-read-screen__detail">
              We drafted this from your website. Edit any line, then approve it to guide your prospect research.
            </p>
          </div>
          <span className="arc-read-screen__domain">{domain}</span>
        </div>

        <div className="arc-review-screen__source">
          <Check size={14} aria-hidden="true" />
          {pages.length > 0
            ? `${pages.length} public ${pages.length === 1 ? "page" : "pages"} captured`
            : "Website brief prepared"}
          <span> · </span>
          <a href={websiteUrl} target="_blank" rel="noopener noreferrer">View website</a>
        </div>

        <section className="arc-review-screen__brief" aria-label="Review targeting brief">
          <div className="arc-review-screen__brief-header">
            <strong>Targeting brief</strong>
            <span>{itemCount} {itemCount === 1 ? "line" : "lines"} in draft</span>
          </div>
          <div className="arc-review-screen__grid">
            {sections.map((section) => {
              const items = fieldItems(fields, section.fields);
              return (
                <div className="arc-review-screen__section" key={section.title}>
                  <div className="arc-review-screen__section-heading">
                    <span className={`arc-read-brief__dot arc-read-brief__dot--${section.tone}`} />
                    <div>
                      <strong>{section.title} <small>{items.length}</small></strong>
                      <p>{section.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAdding(section.title);
                        setAddDraft("");
                      }}
                    >
                      <Plus size={13} aria-hidden="true" /> Add
                    </button>
                  </div>
                  <div className="arc-review-screen__items">
                    {items.map((item) => {
                      const itemId = `${item.key}:${item.index}`;
                      return editing === itemId ? (
                        <div className="arc-review-screen__edit" key={itemId}>
                          <input
                            autoFocus
                            value={draft}
                            onChange={(event) => setDraft(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") saveItem(item.key, item.index);
                              if (event.key === "Escape") setEditing(null);
                            }}
                            aria-label={`Edit ${section.title} line`}
                          />
                          <button type="button" onClick={() => saveItem(item.key, item.index)}>Save</button>
                          <button type="button" onClick={() => setEditing(null)}>Cancel</button>
                        </div>
                      ) : (
                        <div className="arc-review-screen__item" key={itemId}>
                          <Check size={14} aria-hidden="true" />
                          <span>{item.text}</span>
                          <button
                            type="button"
                            title="Edit line"
                            aria-label={`Edit ${section.title} line`}
                            onClick={() => {
                              setEditing(itemId);
                              setDraft(item.text);
                            }}
                          >
                            <Pencil size={13} aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            title="Remove line"
                            aria-label={`Remove ${section.title} line`}
                            onClick={() => removeItem(item.key, item.index)}
                          >
                            <X size={14} aria-hidden="true" />
                          </button>
                        </div>
                      );
                    })}
                    {items.length === 0 ? (
                      <p className="arc-review-screen__empty">
                        Nothing here yet. Add a line if this matters for your search.
                      </p>
                    ) : null}
                    {adding === section.title ? (
                      <div className="arc-review-screen__edit">
                        <input
                          autoFocus
                          value={addDraft}
                          placeholder={section.placeholder}
                          onChange={(event) => setAddDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") addItem(section.addTo);
                            if (event.key === "Escape") setAdding(null);
                          }}
                          aria-label={section.placeholder}
                        />
                        <button type="button" onClick={() => addItem(section.addTo)}>Add</button>
                        <button type="button" onClick={() => setAdding(null)}>Cancel</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div className="arc-review-screen__more">
          <button
            type="button"
            aria-expanded={showAllFields}
            onClick={() => setShowAllFields((value) => !value)}
          >
            {showAllFields ? "Hide detailed matching settings" : "Review detailed matching settings"}
          </button>
          <p>Use cases, search phrases, competitors and urgency signals are available here.</p>
        </div>
        {showAllFields ? (
          <div className="arc-review-screen__advanced">
            <ProfileReviewState
              effectiveWebsiteUrl={websiteUrl}
              isProfilePending={isPending}
              profileFields={fields}
              profileResult={result}
              reviewJson={reviewJson}
              persistProfile={onPersist}
              updateField={onUpdateField}
              embedded
              showHeader={false}
              showStructuredPreview={false}
              showApproveAction={false}
              saveHelpText="Save your refinements, or approve the brief below to activate discovery."
            />
          </div>
        ) : null}
      </div>

      <div className="arc-review-screen__approval" aria-busy={isPending}>
        <div>
          <strong>Ready to use this brief?</strong>
          <span role={result && !result.ok ? "alert" : "status"}>
            {editing || adding
              ? "Finish or cancel your open edit before saving the brief."
              : result?.message ?? "You can edit it later from Targeting. Changes apply to future research."}
          </span>
        </div>
        <div className="arc-review-screen__approval-actions">
          <button
            type="button"
            className="arc-review-screen__save"
            disabled={isPending || editing !== null || adding !== null}
            onClick={() => onPersist("save")}
          >
            Save for later
          </button>
          <button
            type="button"
            disabled={isPending || editing !== null || adding !== null}
            onClick={() => onPersist("approve")}
          >
            {isPending ? "Saving..." : "Approve brief"}
            <Check size={15} aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

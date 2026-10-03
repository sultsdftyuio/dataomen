"use client";

import { useState } from "react";
import {
  ArrowRight,
  Check,
  FileSearch,
  MessageCircle,
  ShieldCheck,
  X,
} from "lucide-react";

const steps = [
  {
    label: "Understand",
    title: "Start with your website.",
    copy: "Arcli drafts your offer and likely audience. You correct it and approve the targeting brief.",
    foot: "Offer · buyers · exclusions",
  },
  {
    label: "Find",
    title: "Research fitting accounts.",
    copy: "The founding pilot checks permitted account sources and relevant public signals against your approved brief.",
    foot: "Accounts · source facts · signals",
  },
  {
    label: "Review",
    title: "Decide what to act on.",
    copy: "A reviewed prospect file explains the fit, links the evidence, and shows a practical way to approach the account.",
    foot: "Evidence · angle · route",
  },
];

const sources = [
  {
    name: "Official product page",
    kind: "Fit",
    date: "Current company fact",
    text: "A documented product matches your approved offer and account criteria.",
  },
  {
    name: "Dated company event",
    kind: "Timing",
    date: "Sep 18, 2026",
    text: "A relevant change creates a timely outreach angle.",
  },
  {
    name: "Public request",
    kind: "Stated intent",
    date: "Sep 30, 2026",
    text: "A person publicly describes the need or asks for a solution.",
  },
];

function StepPreview({ step }: { step: number }) {
  if (step === 0)
    return (
      <div className="aw-preview-card">
        <div className="aw-preview-url">
          https:// <b>yourcompany.com</b>
        </div>
        <div className="aw-preview-line">
          <span>Offer</span>
          <strong>Drafted from /product</strong>
        </div>
        <div className="aw-preview-line">
          <span>Buyers</span>
          <strong>Roles to approve</strong>
        </div>
        <div className="aw-preview-line">
          <span>Exclusions</span>
          <strong>Accounts to skip</strong>
        </div>
        <div className="aw-preview-banner">
          Targeting brief <span>Draft · you approve</span>
        </div>
      </div>
    );
  if (step === 1)
    return (
      <div className="aw-preview-card">
        <div className="aw-preview-title">
          <FileSearch size={18} /> Permitted sources only
        </div>
        <div className="aw-preview-line">
          <span>Official company page</span>
          <Check size={16} />
        </div>
        <div className="aw-preview-line">
          <span>Careers page</span>
          <Check size={16} />
        </div>
        <div className="aw-preview-line">
          <span>Public thread</span>
          <Check size={16} />
        </div>
        <div className="aw-preview-banner">
          Checked against your approved brief
        </div>
      </div>
    );
  return (
    <div className="aw-preview-card">
      <div className="aw-preview-title">
        Example software company{" "}
        <span className="ah-badge ah-badge-green">High-fit</span>
      </div>
      <div className="aw-preview-line">
        <span>Why it fits</span>
        <strong>Cited product fact</strong>
      </div>
      <div className="aw-preview-line">
        <span>Route</span>
        <strong>Contact page</strong>
      </div>
      <div className="aw-preview-line">
        <span>Still unknown</span>
        <strong>Tooling budget</strong>
      </div>
      <div className="aw-preview-banner">
        You decide the outreach <ArrowRight size={15} />
      </div>
    </div>
  );
}

function Workflow() {
  const [step, setStep] = useState(0);
  return (
    <section className="aw-workflow" id="workflow">
      <div className="ah-container aw-workflow-grid">
        <div className="aw-workflow-copy">
          <span className="ah-eyebrow">The workflow</span>
          <h2>A clear path from your website to a reviewed prospect.</h2>
          <p>
            Start with your offer, approve the accounts you want to reach, and
            review the evidence before you decide to act.
          </p>
          <div className="aw-step-list">
            {steps.map((item, index) => (
              <button
                type="button"
                key={item.label}
                className={step === index ? "active" : ""}
                onClick={() => setStep(index)}
                aria-pressed={step === index}
              >
                <span className="aw-step-number">0{index + 1}</span>
                <span>
                  <small>{item.label}</small>
                  <strong>{item.title}</strong>
                  <span className="aw-step-copy">{item.copy}</span>
                  <em>{item.foot}</em>
                </span>
              </button>
            ))}
          </div>
        </div>
        <div className="aw-workflow-visual">
          <div className="aw-visual-orbit" aria-hidden="true" />
          <div className="aw-preview-top">
            <span className="aw-orbit-dot" /> Illustrated workflow{" "}
            <span>0{step + 1} / 03</span>
          </div>
          <StepPreview step={step} />
          <div className="aw-preview-caption">{steps[step].copy}</div>
        </div>
      </div>
      <div className="ah-container aw-boundaries">
        <h3>What Arcli does not do</h3>
        <div>
          <span>
            <X size={16} /> Send mass messages
          </span>
          <span>
            <X size={16} /> Read your inbox
          </span>
          <span>
            <X size={16} /> Promise weekly volumes
          </span>
        </div>
        <p>We assess your market first and report shortfalls honestly.</p>
      </div>
    </section>
  );
}

function Standards() {
  const [attached, setAttached] = useState([true, false, false]);
  const label = attached[2]
    ? "Buyer-intent signal"
    : attached[1]
      ? "Timely prospect"
      : attached[0]
        ? "High-fit prospect"
        : "Not enough evidence";
  const reason = attached[2]
    ? "A linked public request states a need related to your offer."
    : attached[1]
      ? "A dated event creates an approach angle without proving buying intent."
      : attached[0]
        ? "Current source facts match your approved targeting brief; no recent buying signal is observed."
        : "A source-linked fact must match your brief before this account receives a prospect label.";
  function toggle(index: number) {
    setAttached((current) =>
      current.map((value, position) => (position === index ? !value : value)),
    );
  }

  return (
    <section className="aw-standards" id="standards">
      <div className="ah-container">
        <div className="aw-standards-heading">
          <span className="ah-eyebrow">Qualification standards</span>
          <h2>Same account. The label moves only when the evidence does.</h2>
          <p>
            Select a source to attach or remove it. The label follows the
            evidence.
          </p>
        </div>
        <div className="aw-standard-grid">
          <div className="aw-source-list">
            <div className="aw-source-list-head">
              <span>Evidence found</span>
              <small>{attached.filter(Boolean).length} of 3 attached</small>
            </div>
            {sources.map((source, index) => (
              <button
                type="button"
                key={source.name}
                className={attached[index] ? "attached" : ""}
                onClick={() => toggle(index)}
                aria-pressed={attached[index]}
              >
                <span className="aw-source-check">
                  {attached[index] && <Check size={15} />}
                </span>
                <span>
                  <small>
                    {source.kind} · {source.date}
                  </small>
                  <strong>{source.name}</strong>
                  <em>{source.text}</em>
                </span>
                <span className="aw-attach">
                  {attached[index] ? "Remove" : "Attach"}
                </span>
              </button>
            ))}
          </div>
          <div className="aw-label-card">
            <div className="aw-label-top">
              <div className="aw-company-symbol">N</div>
              <div>
                <strong>Northlane</strong>
                <small>Illustrative account · B2B software</small>
              </div>
            </div>
            <div className="aw-label-body">
              <span className="ah-eyebrow">Current label</span>
              <strong
                className={`aw-current-label aw-level-${attached[2] ? 3 : attached[1] ? 2 : attached[0] ? 1 : 0}`}
              >
                {label}
              </strong>
              <p>{reason}</p>
              <div className="aw-evidence-bars">
                <span className={attached[0] ? "on" : ""}>Fit</span>
                <span className={attached[1] ? "on" : ""}>Timing</span>
                <span className={attached[2] ? "on" : ""}>Stated intent</span>
              </div>
            </div>
            <div className="aw-label-foot">
              <ShieldCheck size={18} /> No made-up intent scores. Every label
              points to its evidence.
            </div>
          </div>
        </div>
        <div className="aw-label-note">
          <MessageCircle size={18} />
          <span>
            A high-fit account can be useful without a recent event. A timely
            event gives you an angle. A buyer-intent signal requires a linked
            public request or problem.
          </span>
        </div>
      </div>
    </section>
  );
}

export function ResearchWorkflow() {
  return (
    <>
      <Workflow />
      <Standards />
    </>
  );
}

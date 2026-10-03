"use client";

import { useState } from "react";
import { Check, ExternalLink } from "lucide-react";

const examples = [
  { name: "Northlane", source: "official page", color: "#1B6EBF" },
  { name: "kestrel", source: "careers page", color: "#0F766E" },
  { name: "Fieldwork", source: "public thread", color: "#B45309" },
  { name: "ORIEL", source: "press release", color: "#0A1628" },
  { name: "tallow", source: "documentation", color: "#6D5BD0" },
  { name: "Quarry Labs", source: "changelog", color: "#1D4ED8" },
];

const parts = [
  {
    name: "Fit",
    heading: "Why it fits",
    copy: "The reason this account matches your approved brief, in one plain sentence.",
    tone: "fit",
  },
  {
    name: "Source",
    heading: "The source behind it",
    copy: "The page the fact came from, plus the date it was checked.",
    tone: "source",
  },
  {
    name: "Route",
    heading: "How to act",
    copy: "A specific opening angle and a practical way to reach the account.",
    tone: "route",
  },
  {
    name: "Unknown",
    heading: "What’s still unknown",
    copy: "What we could not verify, stated clearly.",
    tone: "unknown",
  },
];

export function ProspectEvidence() {
  const [active, setActive] = useState<number | null>(null);
  const [verdict, setVerdict] = useState("Worth contacting");

  return (
    <>
      <div className="ae-ribbon" aria-label="Illustrative account sources">
        <div className="ae-ribbon-head">
          <strong>Accounts from an illustrative pilot</strong>
          <span>Each one arrives with the source behind it</span>
        </div>
        <div className="ae-ribbon-items">
          {examples.map((item) => (
            <div className="ae-ribbon-item" key={item.name}>
              <span
                className="ae-logo-mark"
                style={{ background: item.color }}
              />
              <strong>{item.name}</strong>
              <small>
                <span />
                {item.source}
              </small>
            </div>
          ))}
        </div>
      </div>
      <section id="evidence" className="ae-section">
        <div className="ah-container">
          <div className="ae-intro">
            <h2>
              Four questions every <em>prospect file</em> answers.
            </h2>
            <div className="ae-intro-row">
              <p>
                Why it fits, where that came from, how to act, and what we could
                not verify. Select a part of the file to read it.
              </p>
              <div className="ae-legend">
                {parts.map((part, index) => (
                  <button
                    type="button"
                    key={part.name}
                    className={`ae-legend-${part.tone} ${active === index ? "active" : ""}`}
                    onClick={() => setActive(active === index ? null : index)}
                    aria-pressed={active === index}
                  >
                    <span />
                    {part.name}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="ae-stage">
            <div className="ae-stage-glow" aria-hidden="true" />
            <div className="ae-anatomy">
              <div className="ae-callouts ae-callouts-left">
                <button
                  type="button"
                  className={active === 0 ? "active" : ""}
                  onClick={() => setActive(0)}
                >
                  <span>01</span>
                  <strong>Why it fits</strong>
                  <small>{parts[0].copy}</small>
                </button>
                <button
                  type="button"
                  className={active === 2 ? "active" : ""}
                  onClick={() => setActive(2)}
                >
                  <span>03</span>
                  <strong>How to act</strong>
                  <small>{parts[2].copy}</small>
                </button>
              </div>
              <div className="ae-file">
                <div className="ae-color-rule" />
                <div className="ae-file-head">
                  <div className="ae-company-mark">E</div>
                  <div>
                    <strong>Example software company</strong>
                    <small>Illustrative company · prospect file</small>
                  </div>
                  <span className="ah-badge ah-badge-green">
                    High-fit prospect
                  </span>
                </div>
                <div
                  className={`ae-file-part ae-fit ${active === 0 ? "active" : ""} ${active !== null && active !== 0 ? "dim" : ""}`}
                  onMouseEnter={() => setActive(0)}
                >
                  <h3>
                    <b>1</b> Why it fits
                  </h3>
                  <p>
                    A cited product fact{" "}
                    <mark>matches the offer and account criteria</mark> in your
                    approved targeting brief.
                  </p>
                </div>
                <div
                  className={`ae-file-part ae-source ${active === 1 ? "active" : ""} ${active !== null && active !== 1 ? "dim" : ""}`}
                  onMouseEnter={() => setActive(1)}
                >
                  <h3>
                    <b>2</b> Source{" "}
                    <span className="ae-source-label">
                      Fit source <ExternalLink size={12} />
                    </span>
                  </h3>
                  <div className="ae-quote">
                    <div>
                      example.com/product <small>illustrative source</small>
                    </div>
                    <p>
                      “Teams use the workflow builder to{" "}
                      <mark>route approvals across departments.</mark>”
                    </p>
                  </div>
                </div>
                <div
                  className={`ae-file-part ae-route ${active === 2 ? "active" : ""} ${active !== null && active !== 2 ? "dim" : ""}`}
                  onMouseEnter={() => setActive(2)}
                >
                  <h3>
                    <b>3</b> How to act
                  </h3>
                  <p>
                    Use the documented workflow as a specific opening angle.
                  </p>
                  <div className="ae-tags">
                    <span>Route · contact page</span>
                    <span>Buyer · Head of Operations</span>
                  </div>
                </div>
                <div
                  className={`ae-file-part ae-unknown ${active === 3 ? "active" : ""} ${active !== null && active !== 3 ? "dim" : ""}`}
                  onMouseEnter={() => setActive(3)}
                >
                  <h3>
                    <b>4</b> Still unknown
                  </h3>
                  <p>
                    <strong>No recent buying signal observed.</strong> This is a
                    fit-based prospect, not evidence of active buying intent.
                  </p>
                </div>
                <div className="ae-file-foot">
                  <div>
                    {["Worth contacting", "Wrong fit", "Not now"].map(
                      (item) => (
                        <button
                          key={item}
                          type="button"
                          className={verdict === item ? "selected" : ""}
                          onClick={() => setVerdict(item)}
                        >
                          {item}
                        </button>
                      ),
                    )}
                  </div>
                  <small>
                    <Check size={13} />{" "}
                    {verdict === "Worth contacting"
                      ? "You decide the outreach"
                      : `${verdict} marked`}
                  </small>
                </div>
              </div>
              <div className="ae-callouts ae-callouts-right">
                <button
                  type="button"
                  className={active === 1 ? "active" : ""}
                  onClick={() => setActive(1)}
                >
                  <span>02</span>
                  <strong>The source behind it</strong>
                  <small>{parts[1].copy}</small>
                </button>
                <button
                  type="button"
                  className={active === 3 ? "active" : ""}
                  onClick={() => setActive(3)}
                >
                  <span>04</span>
                  <strong>What’s still unknown</strong>
                  <small>{parts[3].copy}</small>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

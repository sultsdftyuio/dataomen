import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, Check, CircleAlert, LoaderCircle } from "lucide-react";

import type { CrawlJobView, ServiceProfileView } from "@/app/(dashboard)/dashboard/prospect-types";
import type { CrawlPageSummary } from "@/lib/onboarding/crawl-pages";
import Logo from "@/components/ui/logo";

import "./crawl-reading-screen.css";

type CrawlReadingScreenProps = {
  websiteUrl: string;
  crawlJob: CrawlJobView | null;
  serviceProfile: Pick<ServiceProfileView, "hasProfile" | "fields">;
  pages: CrawlPageSummary[];
  title: string;
  detail: string;
  eyebrow?: string;
  hasError?: boolean;
  children?: ReactNode;
};

const phaseProgress: Record<string, number> = {
  queued: 8,
  starting: 15,
  crawling: 38,
  crawl_persisted: 65,
  extracting_profile: 80,
  persisting_profile: 93,
};

const phaseActivity: Record<string, string> = {
  queued: "Waiting to read your website",
  starting: "Opening your website",
  crawling: "Reading public pages",
  crawl_persisted: "Preparing the page summary",
  extracting_profile: "Building your targeting brief",
  persisting_profile: "Saving your targeting brief",
};

function domainFor(value: string) {
  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }
}

function pathFor(value: string) {
  try {
    const url = new URL(value);
    return url.pathname === "/" ? "Homepage" : url.pathname.replace(/\/$/, "");
  } catch {
    return value;
  }
}

function briefSections(profile: Pick<ServiceProfileView, "hasProfile" | "fields">) {
  const fields = profile.fields;
  return [
    {
      title: "Offer",
      description: "What you sell and the problem it solves",
      items: [fields.unique_value_prop, fields.core_problem, ...fields.use_cases].filter(Boolean),
      placeholder: "Looking for your offer and value proposition",
      tone: "blue",
    },
    {
      title: "Buyers",
      description: "The people and teams you help",
      items: fields.target_audience,
      placeholder: "Identifying likely buyers",
      tone: "green",
    },
    {
      title: "Exclusions",
      description: "Who should stay outside your search",
      items: [...fields.excluded_audiences, ...fields.negative_keywords],
      placeholder: "Checking for audiences to leave out",
      tone: "violet",
    },
    {
      title: "Signals",
      description: "Public language worth reviewing",
      items: [...fields.buying_triggers, ...fields.pain_points],
      placeholder: "Finding problems and buying moments",
      tone: "amber",
    },
  ] as const;
}

export function CrawlReadingScreen({
  websiteUrl,
  crawlJob,
  serviceProfile,
  pages,
  title,
  detail,
  eyebrow = "READING YOUR WEBSITE",
  hasError = false,
  children,
}: CrawlReadingScreenProps) {
  const hasProfile = serviceProfile.hasProfile;
  const phase = crawlJob?.phase?.trim().toLowerCase() ?? "queued";
  const crawlActive = ["queued", "pending", "processing"].includes(crawlJob?.status?.trim().toLowerCase() ?? "");
  const progress = hasProfile && !crawlActive && !hasError ? 100 : phaseProgress[phase] ?? 12;
  const domain = domainFor(websiteUrl);
  const sections = briefSections(serviceProfile);
  const currentStep = hasProfile && !crawlActive && !hasError ? 2 : 1;
  const currentActivity = phaseActivity[phase] ?? "Reading your website";

  return (
    <main className="arc-read-screen">
      <header className="arc-read-screen__topbar">
        <Link href="/" aria-label="Arcli home" className="arc-read-screen__logo"><Logo /></Link>
        <ol className="arc-read-screen__steps" aria-label="Setup progress">
          {["Website", "Read", "Review", "Ready"].map((label, index) => (
            <li key={label} className={index < currentStep ? "is-complete" : index === currentStep ? "is-current" : ""} aria-current={index === currentStep ? "step" : undefined}>
              <span>{index < currentStep ? <Check size={11} aria-hidden="true" /> : index + 1}</span>
              <b>{label}</b>
            </li>
          ))}
        </ol>
        <Link href="/dashboard" className="arc-read-screen__leave">Leave for now</Link>
      </header>

      <div className="arc-read-screen__content">
        <div className="arc-read-screen__intro">
          <div>
            <p className="arc-read-screen__eyebrow">{eyebrow}</p>
            <h1>{title}</h1>
            <p className="arc-read-screen__detail">{detail}</p>
          </div>
          <span className="arc-read-screen__domain">{domain}</span>
        </div>

        <div className="arc-read-screen__progress" role="progressbar" aria-label="Website brief progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
          <span className={hasError ? "is-error" : ""} style={{ width: `${progress}%` }} />
        </div>

        <div className="arc-read-screen__grid">
          <section className="arc-read-pages" aria-label="Website pages">
            <div className="arc-read-pages__heading">
              <strong>{domain}</strong>
              <span>{pages.length > 0 ? `${pages.length} ${pages.length === 1 ? "page" : "pages"} captured` : "Checking pages"}</span>
            </div>
            {pages.length > 0 ? (
              <ol className="arc-read-pages__list" aria-live="polite">
                {pages.map((page) => (
                  <li key={page.sourceUrl}>
                    <span className="arc-read-pages__check"><Check size={11} aria-hidden="true" /></span>
                    <div><strong>{pathFor(page.sourceUrl)}</strong><small>{domainFor(page.sourceUrl)} · Public page captured</small></div>
                    <a href={page.sourceUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${pathFor(page.sourceUrl)} in a new tab`}>
                      <ArrowUpRight size={14} aria-hidden="true" />
                    </a>
                  </li>
                ))}
                {(!hasProfile || crawlActive) && !hasError ? (
                  <li className="arc-read-pages__activity">
                    <LoaderCircle className="arc-read-pages__spinner" size={15} aria-hidden="true" />
                    <div><strong>{currentActivity}</strong><small>We will update this brief as the read continues.</small></div>
                  </li>
                ) : null}
              </ol>
            ) : (
              <div className="arc-read-pages__waiting" aria-live="polite">
                <div className="arc-read-pages__waiting-row">
                  {hasError ? <CircleAlert size={15} aria-hidden="true" /> : <LoaderCircle className="arc-read-pages__spinner" size={15} aria-hidden="true" />}
                  <div><strong>{hasError ? "Page read needs attention" : currentActivity}</strong><small>{hasError ? "Check the message above and retry." : "Captured pages will appear here as they are saved."}</small></div>
                </div>
                <div className="arc-read-pages__skeleton" aria-hidden="true"><span /><span /></div>
                <div className="arc-read-pages__skeleton" aria-hidden="true"><span /><span /></div>
              </div>
            )}
            <p className="arc-read-pages__footer">{hasProfile ? "These public pages informed your brief." : "Public pages only. You can leave and return while the read continues."}</p>
          </section>

          <section className="arc-read-brief" aria-label="Targeting brief preview">
            <div className="arc-read-brief__heading"><strong>Targeting brief</strong><span>{hasProfile ? "Draft ready" : "Building draft"}</span></div>
            <div className="arc-read-brief__grid">
              {sections.map((section) => (
                <div className="arc-read-brief__section" key={section.title}>
                  <div className="arc-read-brief__section-heading">
                    <span className={`arc-read-brief__dot arc-read-brief__dot--${section.tone}`} />
                    <div><strong>{section.title}</strong><small>{section.description}</small></div>
                    {section.items.length > 0 ? <b>{section.items.length}</b> : null}
                  </div>
                  {section.items.length > 0 ? (
                    <ul>{section.items.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ul>
                  ) : (
                    <p className="arc-read-brief__placeholder">{section.placeholder}</p>
                  )}
                </div>
              ))}
            </div>
            <p className="arc-read-brief__footer">{hasProfile ? "This draft is ready for your review and edits." : "You can review and edit this brief once the website read is complete."}</p>
          </section>
        </div>
        {children ? <div className="arc-read-screen__actions">{children}</div> : null}
      </div>
    </main>
  );
}

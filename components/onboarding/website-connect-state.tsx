"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, Globe2, Loader2 } from "lucide-react";

import Logo from "@/components/ui/logo";
import LogoutButton from "@/components/dashboard/logout-button";
import type { ProspectActionResult } from "@/app/(dashboard)/dashboard/prospect-types";
import type { ResultEmailOffer } from "./result-email-prompt";
import { ResultText } from "./workspace-provisioning-states";
import "./website-connect-state.css";

type WebsiteConnectStateProps = {
  websiteUrl: string;
  websiteResult: ProspectActionResult | null;
  isWebsitePending: boolean;
  resultEmailOffer: ResultEmailOffer;
  emailPromptAnswered: boolean;
  onWebsiteUrlChange: (value: string) => void;
  onWebsiteSubmit: (event: FormEvent<HTMLFormElement>) => void;
};

const previewSections = [
  { title: "Offer", detail: "What you sell, in one line.", example: "e.g. Approval software for finance teams", tone: "blue" },
  { title: "Buyers", detail: "The people and companies who buy it.", example: "e.g. Head of Operations at B2B software companies", tone: "green" },
  { title: "Exclusions", detail: "Who we should never suggest.", example: "e.g. Agencies, your current customers", tone: "violet" },
  { title: "Signals", detail: "Public comments that suggest someone needs you.", example: "e.g. Someone asking how to replace spreadsheet approvals", tone: "amber" },
] as const;

function domainFor(value: string): string | null {
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

export function WebsiteConnectState({ websiteUrl, websiteResult, isWebsitePending, resultEmailOffer, emailPromptAnswered, onWebsiteUrlChange, onWebsiteSubmit }: WebsiteConnectStateProps) {
  const domain = domainFor(websiteUrl.trim());
  const emailDescription = resultEmailOffer.status === "on"
    ? `Result emails are on for ${resultEmailOffer.email}. Change this later in Settings.`
    : resultEmailOffer.status === "off" && !emailPromptAnswered
      ? "You can choose optional email updates after submitting your website."
      : resultEmailOffer.status === "off"
        ? "Result emails are off. You can turn them on later in Settings."
        : "You can manage optional result emails in Settings after setup.";

  return <main className="arc-onboarding">
    <header className="arc-onboarding__header"><Link href="/" aria-label="Arcli home"><Logo /></Link><nav aria-label="Setup progress"><span className="arc-onboarding__step arc-onboarding__step--active"><b>1</b> Website</span><i /><span className="arc-onboarding__step"><b>2</b> Read</span><i /><span className="arc-onboarding__step"><b>3</b> Review</span><i /><span className="arc-onboarding__step"><b>4</b> Ready</span></nav><LogoutButton /></header>
    <div className="arc-onboarding__content">
      <section className="arc-onboarding__start"><p className="arc-onboarding__eyebrow">Workspace setup</p><h1>Start with your website.</h1><p className="arc-onboarding__lead">Arcli reads your public pages and drafts a short targeting brief: what you sell, who buys it, and who to leave out. You check it before anything happens.</p>
        <form className="arc-onboarding__form" onSubmit={onWebsiteSubmit}><label htmlFor="website_url">Company website</label><div className="arc-onboarding__url"><Globe2 size={18} aria-hidden="true" />{!/^https?:\/\//i.test(websiteUrl.trim()) ? <span>https://</span> : null}<input id="website_url" name="website_url" type="text" inputMode="url" autoComplete="url" spellCheck={false} placeholder="yourcompany.com" value={websiteUrl} disabled={isWebsitePending} onChange={(event) => onWebsiteUrlChange(event.target.value)} /></div><p className="arc-onboarding__help">Use the site your customers visit. We start at the homepage.</p>
          {resultEmailOffer.status !== "ineligible" ? <p className="arc-onboarding__email">{emailDescription}</p> : null}
          <button className="arc-onboarding__submit" type="submit" disabled={isWebsitePending || !domain}>{isWebsitePending ? <Loader2 className="animate-spin" size={16} /> : null}{isWebsitePending ? "Reading your website..." : "Read my website"}{!isWebsitePending ? <ArrowRight size={16} /> : null}</button><p className="arc-onboarding__privacy">Public pages only. No login, no inbox access.</p><ResultText result={websiteResult} />
        </form>
      </section>
      <aside className="arc-onboarding__preview"><div className="arc-onboarding__preview-head"><div><strong>Your targeting brief</strong><small>{domain || "yourcompany.com"}</small></div><span>Preview</span></div><div className="arc-onboarding__preview-rows">{previewSections.map((section) => <div key={section.title} className="arc-onboarding__preview-row"><div><span className={`arc-onboarding__dot arc-onboarding__dot--${section.tone}`} /><strong>{section.title}</strong><small>{section.detail}</small></div><em>{section.example}</em></div>)}</div><ol className="arc-onboarding__next"><li><b>1</b><span><strong>We read your public pages.</strong> About a minute. You can leave and come back.</span></li><li><b>2</b><span><strong>You check a short draft.</strong> Every line can be edited.</span></li><li><b>3</b><span><strong>You approve it.</strong> Research begins only after that.</span></li></ol></aside>
    </div>
  </main>;
}

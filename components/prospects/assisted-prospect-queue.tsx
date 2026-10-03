"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ArrowUpRight, Building2, CheckCircle2, HelpCircle, MessageSquareText } from "lucide-react";

import type { AssistedProspect } from "@/app/(dashboard)/dashboard/today/data";
import { VerdictForm } from "@/app/(dashboard)/dashboard/today/verdict-form";
import "./assisted-prospect-queue.css";

type StatusFilter = "to_review" | "worth_contacting" | "not_now" | "all";
type TierFilter = "all" | AssistedProspect["tier"];

const tierLabels: Record<AssistedProspect["tier"], string> = {
  direct_intent: "Buyer-intent signal",
  timely: "Timely prospect",
  high_fit: "High-fit prospect",
};

function readableDate(value: string | null): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

function nameFor(prospect: AssistedProspect): string {
  return prospect.entity_title || new URL(prospect.entity_url).hostname;
}

function statusFor(prospect: AssistedProspect): StatusFilter {
  if (prospect.my_verdict === null) return "to_review";
  if (["worth_contacting", "contacted", "meeting"].includes(prospect.my_verdict)) return "worth_contacting";
  return "not_now";
}

function EvidenceSection({ number, tone, title, children }: { number: number; tone: string; title: string; children: ReactNode }) {
  return <section className={`arc-prospect__evidence arc-prospect__evidence--${tone}`}><span className="arc-prospect__number">{number}</span><div><h3>{title}</h3>{children}</div></section>;
}

export function AssistedProspectQueue({ prospects }: { prospects: AssistedProspect[] }) {
  const [status, setStatus] = useState<StatusFilter>("to_review");
  const [tier, setTier] = useState<TierFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(prospects[0]?.id ?? null);
  const [mobileDetail, setMobileDetail] = useState(false);
  const visible = useMemo(() => prospects.filter((prospect) =>
    (status === "all" || statusFor(prospect) === status) && (tier === "all" || prospect.tier === tier),
  ), [prospects, status, tier]);
  const selected = visible.find((prospect) => prospect.id === selectedId) ?? visible[0] ?? null;
  const selectedIndex = selected ? visible.findIndex((prospect) => prospect.id === selected.id) : -1;
  const counts = {
    to_review: prospects.filter((prospect) => statusFor(prospect) === "to_review").length,
    worth_contacting: prospects.filter((prospect) => statusFor(prospect) === "worth_contacting").length,
    not_now: prospects.filter((prospect) => statusFor(prospect) === "not_now").length,
    all: prospects.length,
  };

  const selectOffset = (offset: number) => {
    if (!visible.length) return;
    const nextIndex = Math.min(Math.max(selectedIndex + offset, 0), visible.length - 1);
    setSelectedId(visible[nextIndex].id);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey || ["INPUT", "TEXTAREA", "SELECT"].includes((event.target as HTMLElement)?.tagName)) return;
      if (event.key.toLowerCase() === "j") { event.preventDefault(); selectOffset(1); }
      if (event.key.toLowerCase() === "k") { event.preventDefault(); selectOffset(-1); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div className="arc-prospect">
      <div className="arc-prospect__heading">
        <div><h1>Prospects</h1><p>{counts.to_review} to review · delivered against your approved brief</p></div>
        <p className="arc-prospect__hint">Use J and K to move between prospect files</p>
      </div>
      <div className="arc-prospect__filters">
        <div className="arc-prospect__tabs" role="group" aria-label="Review status">
          {(["to_review", "worth_contacting", "not_now", "all"] as StatusFilter[]).map((filter) => <button type="button" key={filter} aria-pressed={status === filter} onClick={() => { setStatus(filter); setMobileDetail(false); }}>{filter === "to_review" ? "To review" : filter === "worth_contacting" ? "Worth contacting" : filter === "not_now" ? "Not now" : "All"} <span>{counts[filter]}</span></button>)}
        </div>
        <div className="arc-prospect__tiers" role="group" aria-label="Prospect signal">
          {(["all", "direct_intent", "timely", "high_fit"] as TierFilter[]).map((filter) => <button type="button" key={filter} aria-pressed={tier === filter} onClick={() => { setTier(filter); setMobileDetail(false); }}><span className={`arc-prospect__tier-dot arc-prospect__tier-dot--${filter}`} />{filter === "all" ? "All labels" : filter === "direct_intent" ? "Buyer intent" : filter === "timely" ? "Timely" : "High fit"}</button>)}
        </div>
      </div>
      <div className={`arc-prospect__workspace${mobileDetail ? " arc-prospect__workspace--detail" : ""}`}>
        <div className="arc-prospect__list" aria-label="Prospect list">
          {visible.length ? visible.map((prospect) => <button type="button" key={prospect.id} className="arc-prospect__row" aria-current={selected?.id === prospect.id ? "true" : undefined} onClick={() => { setSelectedId(prospect.id); setMobileDetail(true); }}>
            <span className="arc-prospect__mark"><Building2 size={17} /></span><span className="arc-prospect__row-copy"><span className="arc-prospect__row-top"><strong>{nameFor(prospect)}</strong><small>{readableDate(prospect.delivered_at)}</small></span><span className="arc-prospect__row-summary">{prospect.signal_summary || prospect.fit_summary}</span><span className={`arc-prospect__tier arc-prospect__tier--${prospect.tier}`}><span className={`arc-prospect__tier-dot arc-prospect__tier-dot--${prospect.tier}`} />{tierLabels[prospect.tier]}</span></span>
          </button>) : <div className="arc-prospect__empty"><CheckCircle2 size={24} /><strong>No prospects in this view</strong><p>Try another status or signal label.</p></div>}
        </div>
        <div className="arc-prospect__detail" aria-live="polite">
          {selected ? <>
            <div className="arc-prospect__detail-head"><button className="arc-prospect__back" type="button" onClick={() => setMobileDetail(false)} aria-label="Back to prospect list"><ArrowLeft size={18} /></button><span className="arc-prospect__mark arc-prospect__mark--large"><Building2 size={22} /></span><div className="arc-prospect__detail-title"><h2>{nameFor(selected)}</h2><p>Delivered {readableDate(selected.delivered_at)} · {selected.entity_kind}</p></div><div className="arc-prospect__step-buttons"><button type="button" aria-label="Previous prospect" title="Previous (K)" disabled={selectedIndex <= 0} onClick={() => selectOffset(-1)}><ArrowUp size={16} /></button><button type="button" aria-label="Next prospect" title="Next (J)" disabled={selectedIndex >= visible.length - 1} onClick={() => selectOffset(1)}><ArrowDown size={16} /></button></div></div>
            <div className="arc-prospect__document">
              <div className="arc-prospect__document-top"><span className={`arc-prospect__tier arc-prospect__tier--${selected.tier}`}><span className={`arc-prospect__tier-dot arc-prospect__tier-dot--${selected.tier}`} />{tierLabels[selected.tier]}</span><span>{selected.tier === "direct_intent" ? "A linked public request related to your offer." : selected.tier === "timely" ? "A timely event related to your brief." : "A strong fit based on public evidence."}</span><a href={selected.entity_url} target="_blank" rel="noopener noreferrer">View prospect <ArrowUpRight size={13} /></a></div>
              <EvidenceSection number={1} tone="blue" title="Why it fits"><p>{selected.fit_summary}</p><small>Likely buyer role · <strong>{selected.buyer_role}</strong></small></EvidenceSection>
              <EvidenceSection number={2} tone="green" title="Source"><div className="arc-prospect__source"><div><span>{new URL(selected.fit_source_url).hostname}</span><small>checked {readableDate(selected.source_checked_at)}</small></div><p>{selected.signal_summary || selected.fit_summary}</p></div><a href={selected.fit_source_url} target="_blank" rel="noopener noreferrer">Fit source <ArrowUpRight size={12} /></a>{selected.signal_summary && selected.signal_source_url ? <p className="arc-prospect__signal"><strong>Observed signal:</strong> {selected.signal_summary} <a href={selected.signal_source_url} target="_blank" rel="noopener noreferrer">Source ↗</a>{selected.signal_date ? <small> {readableDate(selected.signal_date)}</small> : null}</p> : <p className="arc-prospect__signal">No recent buying signal observed. This is a fit-based prospect, not evidence of active buying intent.</p>}</EvidenceSection>
              <EvidenceSection number={3} tone="violet" title="How to act"><p>{selected.angle}</p><a className="arc-prospect__route" href={selected.contact_route_url} target="_blank" rel="noopener noreferrer"><MessageSquareText size={14} /> Open {selected.contact_route_type.replaceAll("_", " ")} <ArrowUpRight size={13} /></a><small>Route checked {readableDate(selected.route_checked_at)}</small></EvidenceSection>
              <EvidenceSection number={4} tone="amber" title="Still unknown"><p className="arc-prospect__unknown"><HelpCircle size={15} />{selected.uncertainty_summary}</p></EvidenceSection>
              <div className="arc-prospect__decision"><h3>Your assessment</h3><p>Save a verdict to help focus the next review.</p><VerdictForm key={selected.id} deliveryId={selected.id} currentVerdict={selected.my_verdict} /></div>
            </div>
          </> : <div className="arc-prospect__empty"><CheckCircle2 size={26} /><strong>No prospect selected</strong><p>Choose a prospect from the list.</p></div>}
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { AssistedProspect, ProspectVerdict } from "@/app/(dashboard)/dashboard/today/data";
import { bucketFor, nameFor, type StatusFilter, type TierFilter } from "@/app/(dashboard)/dashboard/today/labels";
import { FILE_TITLE_ID, ProspectEvidence, ProspectFileHead } from "@/app/(dashboard)/dashboard/today/prospect-file";
import { ProspectList } from "@/app/(dashboard)/dashboard/today/prospect-list";
import { FirstDeliveryPending, QueueEmpty } from "@/app/(dashboard)/dashboard/today/queue-empty";
import { QueueFilters } from "@/app/(dashboard)/dashboard/today/queue-filters";
import { useVerdictSaves, type SaveNotice } from "@/app/(dashboard)/dashboard/today/use-verdict-saves";
import { SaveNoticeLine, VerdictBar } from "@/app/(dashboard)/dashboard/today/verdict-bar";
import { PageHeader } from "@/components/dashboard/PageHeader";
import "./assisted-prospect-queue.css";

// Must match the CSS breakpoint where the list and the file sit side by side.
// Below it one view shows at a time, so opening a file moves focus into it.
const SPLIT_QUERY = "(min-width: 1024px)";
const isSplitLayout = () => window.matchMedia(SPLIT_QUERY).matches;

/** Where focus goes after the next render: a row, the file's name, or wherever it already is if that still exists. */
type PendingFocus = "row" | "heading" | "keep" | null;

/** Scrolls just enough to bring the element's top into view when it sits above the fold. */
function revealTop(element: HTMLElement | null) {
  if (!element) return;
  const scroller = element.closest("main");
  const floor = scroller ? scroller.getBoundingClientRect().top : 0;
  if (element.getBoundingClientRect().top < floor) element.scrollIntoView({ block: "start" });
}

function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true'], [role='dialog']"));
}

const pageHeader = (
  <PageHeader
    title="Today's prospects"
    description="Hand-checked against your targeting brief. Give each one a verdict."
    meta={
      <span className="hidden lg:inline">
        Press <kbd className="rounded-sm border border-border bg-card px-1 font-sans">J</kbd> or{" "}
        <kbd className="rounded-sm border border-border bg-card px-1 font-sans">K</kbd> to move between prospects.
      </span>
    }
  />
);

export function AssistedProspectQueue({ prospects: delivered }: { prospects: AssistedProspect[] }) {
  const { prospects, save, savingIds, notice } = useVerdictSaves(delivered);
  const [status, setStatus] = useState<StatusFilter>("to_review");
  const [tier, setTier] = useState<TierFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileOpen, setFileOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const pendingFocus = useRef<PendingFocus>(null);
  const hasMounted = useRef(false);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const listPanelRef = useRef<HTMLElement>(null);
  const filePanelRef = useRef<HTMLElement>(null);
  const fileBodyRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  const inStatus = useMemo(
    () => prospects.filter((prospect) => status === "all" || bucketFor(prospect.my_verdict) === status),
    [prospects, status],
  );
  const visible = useMemo(
    () => inStatus.filter((prospect) => tier === "all" || prospect.tier === tier),
    [inStatus, tier],
  );
  const selected = visible.find((prospect) => prospect.id === selectedId) ?? visible[0] ?? null;
  const selectedIndex = selected ? visible.indexOf(selected) : -1;
  const selectedKey = selected?.id ?? null;
  const showFile = fileOpen && selected !== null;

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { to_review: 0, pursuing: 0, passed: 0, all: prospects.length };
    for (const prospect of prospects) counts[bucketFor(prospect.my_verdict)] += 1;
    return counts;
  }, [prospects]);
  const tierCounts = useMemo(() => {
    const counts: Record<TierFilter, number> = { all: inStatus.length, direct_intent: 0, timely: 0, high_fit: 0 };
    for (const prospect of inStatus) counts[prospect.tier] += 1;
    return counts;
  }, [inStatus]);

  // A newly shown file opens at its top, with its name in view, rather than at
  // the previous file's scroll offset; its row is scrolled into the list.
  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      return;
    }
    fileBodyRef.current?.scrollTo({ top: 0 });
    if (selectedKey) rowRefs.current.get(selectedKey)?.scrollIntoView({ block: "nearest" });
    if (showFile && !isSplitLayout()) revealTop(filePanelRef.current);
  }, [selectedKey, showFile]);

  // Runs after every render, but only acts when a handler asked for it.
  useEffect(() => {
    const target = pendingFocus.current;
    pendingFocus.current = null;
    if (target === "row" && selectedKey) rowRefs.current.get(selectedKey)?.focus({ preventScroll: true });
    if (target === "heading") headingRef.current?.focus({ preventScroll: true });
    if (target === "keep" && (!document.activeElement || document.activeElement === document.body)) {
      (headingRef.current ?? listPanelRef.current)?.focus({ preventScroll: true });
    }
  });

  const step = (offset: number) => {
    const next = visible[selectedIndex + offset];
    if (!next) return;
    const active = document.activeElement;
    pendingFocus.current = active instanceof HTMLElement && active.classList.contains("arc-today__row") ? "row" : null;
    setSelectedId(next.id);
    setAnnouncement(`${nameFor(next)}, ${selectedIndex + offset + 1} of ${visible.length}`);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || isTypingTarget(event.target)) return;
      const key = event.key.toLowerCase();
      if (key !== "j" && key !== "k") return;
      event.preventDefault();
      step(key === "j" ? 1 : -1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const openProspect = (prospect: AssistedProspect) => {
    setSelectedId(prospect.id);
    if (!isSplitLayout()) {
      setFileOpen(true);
      pendingFocus.current = "heading";
    }
  };

  const closeFile = () => {
    setFileOpen(false);
    pendingFocus.current = "row";
  };

  const saveVerdict = (prospect: AssistedProspect, verdict: ProspectVerdict) => {
    if (prospect.my_verdict === verdict || savingIds.has(prospect.id)) return;
    // When the verdict moves the prospect out of this view, advance to the
    // next row (not back to the top) and keep the confirmation with it.
    let showWith: string | null = prospect.id;
    if (status !== "all" && bucketFor(verdict) !== status) {
      const index = visible.findIndex((candidate) => candidate.id === prospect.id);
      showWith = (visible[index + 1] ?? visible[index - 1])?.id ?? null;
      setSelectedId(showWith);
      if (!showWith) setFileOpen(false);
      pendingFocus.current = "keep";
    }
    save(prospect, verdict, {
      showWith,
      onFailure: () => {
        setSelectedId(prospect.id);
        if (!isSplitLayout()) setFileOpen(true);
      },
    });
  };

  const viewSaved = (saved: SaveNotice) => {
    setStatus(bucketFor(saved.verdict));
    setTier("all");
    setSelectedId(saved.prospectId);
    pendingFocus.current = "heading";
  };

  if (delivered.length === 0) {
    return (
      <div className="arc-workspace-page arc-today">
        {pageHeader}
        <FirstDeliveryPending />
      </div>
    );
  }

  const fileNotice = notice && selected && notice.showWith === selected.id ? notice : null;
  const emptyListNotice = notice && notice.showWith === null && visible.length === 0 ? notice : null;

  return (
    <div className="arc-workspace-page arc-today">
      {pageHeader}
      <div
        className="arc-today__desk"
        data-view={showFile ? "file" : "list"}
        data-empty={visible.length === 0 ? "" : undefined}
      >
        <section
          ref={listPanelRef}
          tabIndex={-1}
          aria-label="Prospect list"
          className="arc-today__list rounded-lg border border-border bg-card outline-none lg:overflow-hidden"
        >
          <QueueFilters
            status={status}
            tier={tier}
            statusCounts={statusCounts}
            tierCounts={tierCounts}
            onStatusChange={setStatus}
            onTierChange={setTier}
          />
          <div className="arc-today__scroll">
            {visible.length ? (
              <ProspectList
                prospects={visible}
                selectedId={selectedKey}
                showVerdicts={status !== "to_review"}
                rowRefs={rowRefs}
                onSelect={openProspect}
                onStep={step}
              />
            ) : (
              <>
                <div role="status" className="px-4 empty:hidden">
                  {emptyListNotice ? <SaveNoticeLine notice={emptyListNotice} onView={viewSaved} /> : null}
                </div>
                <QueueEmpty
                  status={status}
                  tier={tier}
                  statusCounts={statusCounts}
                  onShowStatus={setStatus}
                  onClearTier={() => setTier("all")}
                />
              </>
            )}
          </div>
        </section>

        {selected ? (
          <section
            ref={filePanelRef}
            aria-labelledby={FILE_TITLE_ID}
            className="arc-today__file rounded-lg border border-border bg-card lg:overflow-hidden"
          >
            <ProspectFileHead
              prospect={selected}
              index={selectedIndex}
              total={visible.length}
              headingRef={headingRef}
              onStep={step}
              onBack={closeFile}
            />
            <div ref={fileBodyRef} className="arc-today__scroll">
              <ProspectEvidence prospect={selected} />
            </div>
            <VerdictBar
              verdict={selected.my_verdict}
              saving={savingIds.has(selected.id)}
              notice={fileNotice}
              onSave={(verdict) => saveVerdict(selected, verdict)}
              onViewSaved={viewSaved}
            />
          </section>
        ) : null}
      </div>
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}

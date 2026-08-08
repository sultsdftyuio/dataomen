"use client";

import { useEffect, useState, useTransition, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ExternalLink,
  Pause,
  Play,
  Plus,
  Radar,
  Search,
  SlidersHorizontal,
  Users,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { C } from "@/lib/tokens";
import type {
  ProspectActionResult,
  WatchlistAction,
  WatchlistCreateInput,
  WatchlistResultsView,
  WatchlistView,
} from "./prospect-types";

const SOURCE_OPTIONS = [
  { value: "hackernews", label: "Hacker News", detail: "Founder and builder discussions" },
  { value: "bluesky", label: "Bluesky", detail: "Public conversations and requests" },
  { value: "lemmy", label: "Lemmy", detail: "Independent public communities" },
  { value: "stackexchange", label: "Stack Exchange", detail: "Specific how-to problems" },
  { value: "github", label: "GitHub", detail: "Open-source issues and discussions" },
  { value: "x", label: "X (fallback)", detail: "Used only as a cost-controlled fallback" },
] as const;

const DEFAULT_SOURCES = SOURCE_OPTIONS.filter((source) => source.value !== "x").map(
  (source) => source.value,
);

function splitLines(value: string) {
  const seen = new Set<string>();
  return value
    .split(/\r?\n|,/)
    .map((item) => item.trim().replace(/\s+/g, " "))
    .filter((item) => {
      const key = item.toLowerCase();
      if (!item || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function formatDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date);
}

function sourceLabel(value: string) {
  return SOURCE_OPTIONS.find((source) => source.value === value)?.label ?? value;
}

function scanLabel(status: string | null) {
  switch (status?.toLowerCase()) {
    case "queued":
      return "Scanning";
    case "running":
      return "Preparing";
    case "completed":
      return "Checked";
    case "partial":
      return "Partial coverage";
    case "failed":
      return "Needs attention";
    default:
      return "Not scanned";
  }
}

function WatchlistResultCards({ result }: { result: WatchlistResultsView | undefined }) {
  const ready = result?.readyToAct ?? [];
  const watch = result?.discoveryCandidates ?? [];
  const signals = [...ready, ...watch];
  if (signals.length === 0) {
    return (
      <p className="text-sm leading-6" style={{ color: C.muted }}>
        No verifier-confirmed conversations for this group yet. A scan can still
        surface review-only evidence when the fit is plausible but incomplete.
      </p>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {signals.slice(0, 4).map((lead) => {
        const isReady = lead.matchStatus === "ready_for_review";
        return (
          <div
            key={lead.id}
            className="rounded-md border p-3"
            style={{
              borderColor: isReady ? C.green : C.amber,
              backgroundColor: C.white,
            }}
          >
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge
                variant="outline"
                className="rounded-md"
                style={{
                  borderColor: isReady ? C.green : C.amber,
                  backgroundColor: isReady ? C.greenPale : C.amberPale,
                  color: isReady ? C.green : C.amber,
                }}
              >
                {isReady ? "Ready to review" : "Review signal"}
              </Badge>
              <span style={{ color: C.muted }}>
                {sourceLabel(lead.sourcePost.source)} · verifier {Math.round(lead.verifierScore * 100)}%
              </span>
            </div>
            <p className="mt-2 text-sm font-semibold leading-6" style={{ color: C.navy }}>
              {lead.sourcePost.title}
            </p>
            <p className="mt-2 line-clamp-3 text-sm leading-6" style={{ color: C.navySoft }}>
              {lead.painDetected || lead.matchReason}
            </p>
            <div className="mt-3 flex items-center gap-2">
              {lead.sourcePost.url ? (
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  style={{ borderColor: C.blueLight, color: C.blue }}
                >
                  <a href={lead.sourcePost.url} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="size-3.5" />
                    View source
                  </a>
                </Button>
              ) : null}
              {!isReady ? (
                <span className="text-xs" style={{ color: C.muted }}>
                  Review-only; not sent to CRM.
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
      {signals.length > 4 ? (
        <p className="text-xs" style={{ color: C.muted }}>
          Showing the latest 4 signals. Open Prospects to work through the full queue.
        </p>
      ) : null}
    </div>
  );
}

function WatchlistForm({
  onCreate,
  pending,
}: {
  onCreate: WatchlistAction;
  pending: boolean;
}) {
  const [name, setName] = useState("");
  const [targetBuyer, setTargetBuyer] = useState("");
  const [problemToSolve, setProblemToSolve] = useState("");
  const [includeTerms, setIncludeTerms] = useState("");
  const [excludeTerms, setExcludeTerms] = useState("");
  const [suggestedPlaces, setSuggestedPlaces] = useState("");
  const [sources, setSources] = useState<string[]>(DEFAULT_SOURCES);
  const [showSignalDetails, setShowSignalDetails] = useState(false);
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toggleSource = (source: string) => {
    setSources((current) =>
      current.includes(source)
        ? current.filter((value) => value !== source)
        : [...current, source],
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sources.length === 0) {
      setFormError("Choose at least one public source before starting a scan.");
      return;
    }
    setFormError(null);
    const input: WatchlistCreateInput = {
      name,
      targetBuyer,
      problemToSolve,
      includeTerms: splitLines(includeTerms),
      excludeTerms: splitLines(excludeTerms),
      sourcePreferences: sources,
      suggestedPlaces: splitLines(suggestedPlaces),
    };
    setIsSubmitting(true);
    try {
      const result = await onCreate(input);
      if (result.ok) {
        setName("");
        setTargetBuyer("");
        setProblemToSolve("");
        setIncludeTerms("");
        setExcludeTerms("");
        setSuggestedPlaces("");
        setSources(DEFAULT_SOURCES);
      } else {
        setFormError(result.message);
      }
    } catch {
      setFormError("Could not save this buyer group. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border p-4 shadow-sm"
      style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="pfd text-lg leading-none" style={{ color: C.navy }}>
            Start a new watch
          </p>
          <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>
            Begin with the audience and situation worth paying attention to.
          </p>
        </div>
        <span
          className="rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
          style={{ borderColor: C.blueLight, backgroundColor: C.white, color: C.blue }}
        >
          Step 1 of 3
        </span>
      </div>
      <section className="rounded-lg border bg-white p-3" style={{ borderColor: C.rule }}>
        <p className="pfd text-base leading-none" style={{ color: C.navy }}>
          1. Define the audience
        </p>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs font-medium" style={{ color: C.navy }}>
          Group name
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} className="h-8 bg-white px-2.5 text-xs" placeholder="Early-stage SaaS founders" />
        </label>
        <label className="space-y-1 text-xs font-medium" style={{ color: C.navy }}>
          Who do you want to find?
          <Input value={targetBuyer} onChange={(event) => setTargetBuyer(event.target.value)} required maxLength={500} className="h-8 bg-white px-2.5 text-xs" placeholder="SaaS founders with small sales teams" />
        </label>
      </div>
      <label className="mt-3 block space-y-1 text-xs font-medium" style={{ color: C.navy }}>
        Their problem or desired outcome
        <Textarea value={problemToSolve} onChange={(event) => setProblemToSolve(event.target.value)} required maxLength={700} className="min-h-16 bg-white p-2 text-xs" placeholder="They need a dependable way to get more trial users without doing every outreach task by hand." />
      </label>
      </section>
      <section className="rounded-lg border bg-white p-3" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="pfd text-base leading-none" style={{ color: C.navy }}>
              2. Refine the signal
            </p>
            <p className="mt-1 text-[11px]" style={{ color: C.muted }}>
              Optional: add language and places only when they will improve the scan.
            </p>
          </div>
          <Button type="button" size="xs" variant="outline" aria-expanded={showSignalDetails} onClick={() => setShowSignalDetails((current) => !current)} style={{ borderColor: C.ruleDark, color: C.navySoft }}>
            <SlidersHorizontal className="size-3" />
            {showSignalDetails ? "Hide detail" : "Add detail"}
          </Button>
        </div>
        {showSignalDetails ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <label className="space-y-1 text-xs font-medium" style={{ color: C.navy }}>
              Words people might use
              <Textarea value={includeTerms} onChange={(event) => setIncludeTerms(event.target.value)} className="min-h-16 bg-white p-2 text-xs" placeholder="new trial signups dropped&#10;how are founders finding users" />
            </label>
            <label className="space-y-1 text-xs font-medium" style={{ color: C.navy }}>
              Exclude conversations about
              <Textarea value={excludeTerms} onChange={(event) => setExcludeTerms(event.target.value)} className="min-h-16 bg-white p-2 text-xs" placeholder="job hunting&#10;consumer coupon codes" />
            </label>
            <label className="block space-y-1 text-xs font-medium md:col-span-2" style={{ color: C.navy }}>
              Public communities or places to prioritise
              <Textarea value={suggestedPlaces} onChange={(event) => setSuggestedPlaces(event.target.value)} className="min-h-16 bg-white p-2 text-xs" placeholder="Indie Hackers growth discussions&#10;a public founder community URL" />
            </label>
          </div>
        ) : null}
      </section>
      <section className="rounded-lg border bg-white p-3" style={{ borderColor: C.rule }}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="pfd text-base leading-none" style={{ color: C.navy }}>
              3. Coverage
            </p>
            <p className="mt-1 text-[11px]" style={{ color: C.muted }}>
              {sources.length} public {sources.length === 1 ? "source" : "sources"} enabled for this watch.
            </p>
          </div>
          <Button type="button" size="xs" variant="outline" aria-expanded={showSourcePicker} onClick={() => setShowSourcePicker((current) => !current)} style={{ borderColor: C.ruleDark, color: C.navySoft }}>
            {showSourcePicker ? "Hide sources" : "Change sources"}
          </Button>
        </div>
        {showSourcePicker ? (
          <fieldset className="mt-3">
            <legend className="sr-only">Choose public sources</legend>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {SOURCE_OPTIONS.map((source) => (
                <label
                  key={source.value}
                  className="flex cursor-pointer items-start gap-2 rounded-md border bg-white p-2 text-xs transition-colors"
                  style={{
                    borderColor: sources.includes(source.value) ? C.blueLight : C.rule,
                    color: C.navySoft,
                  }}
                >
                  <Checkbox checked={sources.includes(source.value)} onCheckedChange={() => toggleSource(source.value)} />
                  <span>
                    <span className="block font-medium" style={{ color: C.navy }}>{source.label}</span>
                    <span className="mt-0.5 block text-[10px] leading-4" style={{ color: C.muted }}>{source.detail}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
      </section>
      <p className="text-xs leading-5" style={{ color: C.muted }}>
        New watches use public sources only. You can refine the signal later without changing your product brief.
      </p>
      {formError ? (
        <p role="alert" className="text-xs font-medium" style={{ color: C.red }}>
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || isSubmitting || sources.length === 0} className="h-9 px-3 text-xs" style={{ backgroundColor: C.blue, color: C.white }}>
        <Search className="size-3.5" />
        {pending || isSubmitting ? "Saving…" : "Save buyer group & start scan"}
      </Button>
    </form>
  );
}

function WatchlistDetail({
  watchlist,
  result,
  busy,
  onRun,
  onSetActive,
}: {
  watchlist: WatchlistView;
  result: WatchlistResultsView | undefined;
  busy: boolean;
  onRun: (watchlistId: string) => void;
  onSetActive: (watchlistId: string, isActive: boolean) => void;
}) {
  const [showCoverage, setShowCoverage] = useState(false);
  const [showSignals, setShowSignals] = useState(false);
  const readyCount = result?.readyToAct.length ?? 0;
  const reviewCount = result?.discoveryCandidates.length ?? 0;
  const signalCount = readyCount + reviewCount;
  const lastScan = formatDate(watchlist.lastScanAt);

  useEffect(() => {
    setShowCoverage(false);
    setShowSignals(false);
  }, [watchlist.id]);

  return (
    <section
      aria-labelledby={`watchlist-brief-${watchlist.id}`}
      className="flex min-h-0 flex-col overflow-hidden rounded-xl border bg-[#F6FAFE]"
      style={{ borderColor: C.rule, backgroundColor: C.offWhite, boxShadow: "0 8px 28px rgba(10, 22, 40, 0.06)" }}
    >
      <div className="border-b px-4 py-4" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
              Buyer group
            </p>
            <h2 id={`watchlist-brief-${watchlist.id}`} className="pfd mt-1 text-2xl leading-none" style={{ color: C.navy }}>
              {watchlist.name}
            </h2>
          </div>
          <Badge
            variant="outline"
            className="h-6 rounded px-2 text-[10px]"
            style={{
              borderColor: watchlist.isActive ? C.green : C.ruleDark,
              backgroundColor: watchlist.isActive ? C.greenPale : C.white,
              color: watchlist.isActive ? C.green : C.muted,
            }}
          >
            <Radar className="size-3" />
            {watchlist.isActive ? scanLabel(watchlist.scanStatus) : "Paused"}
          </Badge>
        </div>
        <p className="mt-3 text-xs" style={{ color: C.muted }}>
          {lastScan ? `Last scanned ${lastScan}` : "No scan has run yet"}
        </p>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
        <section className="rounded-lg border bg-white p-3.5" style={{ borderColor: C.rule }}>
          <p className="pfd text-lg leading-none" style={{ color: C.navy }}>
            The brief
          </p>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
                Looking for
              </dt>
              <dd className="mt-1 leading-5" style={{ color: C.navy }}>
                {watchlist.targetBuyer}
              </dd>
            </div>
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: C.muted }}>
                Their problem
              </dt>
              <dd className="mt-1 leading-5" style={{ color: C.navy }}>
                {watchlist.problemToSolve}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-lg border bg-white p-3.5" style={{ borderColor: C.rule }}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="pfd text-lg leading-none" style={{ color: C.navy }}>
                Coverage
              </p>
              <p className="mt-1 text-xs" style={{ color: C.muted }}>
                {watchlist.sourcePreferences.length} public {watchlist.sourcePreferences.length === 1 ? "source" : "sources"} enabled
              </p>
            </div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              aria-expanded={showCoverage}
              onClick={() => setShowCoverage((current) => !current)}
              style={{ borderColor: C.ruleDark, color: C.navySoft }}
            >
              {showCoverage ? "Hide sources" : "See sources"}
            </Button>
          </div>
          {showCoverage ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {watchlist.sourcePreferences.map((source) => (
                <Badge key={source} variant="outline" className="h-5 rounded px-1.5 text-[10px]" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
                  {sourceLabel(source)}
                </Badge>
              ))}
            </div>
          ) : null}
        </section>

        <section className="rounded-lg border bg-white p-3.5" style={{ borderColor: C.rule }}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="pfd text-lg leading-none" style={{ color: C.navy }}>
                Latest signals
              </p>
              <p className="mt-1 text-xs" style={{ color: C.muted }}>
                {readyCount} ready · {reviewCount} for review
              </p>
            </div>
            <Button
              type="button"
              size="xs"
              variant="outline"
              aria-expanded={showSignals}
              onClick={() => setShowSignals((current) => !current)}
              style={{ borderColor: C.ruleDark, color: C.navySoft }}
            >
              {showSignals ? "Hide signals" : signalCount ? "View signals" : "Explain status"}
            </Button>
          </div>
          {showSignals ? (
            <div className="mt-3 space-y-3">
              <WatchlistResultCards result={result} />
              {signalCount > 0 ? (
                <Button asChild size="sm" variant="outline" style={{ borderColor: C.blueLight, color: C.blue }}>
                  <Link href="/dashboard">
                    Open Prospects
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>

        {watchlist.lastScanError ? (
          <p className="rounded-md border p-3 text-xs leading-5" style={{ borderColor: C.red, backgroundColor: C.redPale, color: C.red }}>
            {watchlist.lastScanError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2 border-t bg-white p-3" style={{ borderColor: C.rule }}>
        {watchlist.isActive ? (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => onRun(watchlist.id)} style={{ backgroundColor: C.blue, color: C.white }}>
              <Search className="size-3.5" />
              {busy ? "Starting…" : lastScan ? "Scan again" : "Start scan"}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSetActive(watchlist.id, false)} style={{ borderColor: C.ruleDark, color: C.navySoft }}>
              <Pause className="size-3.5" />
              Pause group
            </Button>
          </>
        ) : (
          <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => onSetActive(watchlist.id, true)} style={{ borderColor: C.blueLight, color: C.blue }}>
            <Play className="size-3.5" />
            Resume group
          </Button>
        )}
      </div>
    </section>
  );
}

function BuyerGroupsGuide() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
          <BookOpen className="size-3.5" />
          How it works
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 overflow-y-auto p-0 sm:max-w-md" style={{ backgroundColor: C.white, borderColor: C.rule }}>
        <SheetHeader className="border-b" style={{ borderColor: C.rule, backgroundColor: C.blueTint }}>
          <SheetTitle className="pfd text-xl" style={{ color: C.navy }}>
            Buyer groups, simply
          </SheetTitle>
          <SheetDescription style={{ color: C.muted }}>
            Keep the group specific enough that a useful signal is easy to recognise.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 p-4">
          {[
            {
              title: "Start with a real situation",
              detail: "Describe the outcome people want and the frustration they would actually use when asking for help.",
            },
            {
              title: "Use the coverage you need",
              detail: "Public sources are selected by default. Open coverage only when you need to focus or exclude a source.",
            },
            {
              title: "Review the evidence",
              detail: "Verified matches become ready to review; plausible signals remain clearly separated for your judgement.",
            },
          ].map((item, index) => (
            <section key={item.title} className="rounded-lg border p-3" style={{ borderColor: C.rule }}>
              <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: C.blue }}>
                Step {index + 1}
              </p>
              <h2 className="pfd mt-1 text-lg leading-none" style={{ color: C.navy }}>
                {item.title}
              </h2>
              <p className="mt-2 text-xs leading-5" style={{ color: C.navySoft }}>
                {item.detail}
              </p>
            </section>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export default function WatchlistsPanel({
  watchlists,
  results,
  createWatchlist,
  runWatchlistDiscovery,
  setWatchlistActive,
}: {
  watchlists: WatchlistView[];
  results: WatchlistResultsView[];
  createWatchlist: WatchlistAction;
  runWatchlistDiscovery: (watchlistId: string) => Promise<ProspectActionResult>;
  setWatchlistActive: (watchlistId: string, isActive: boolean) => Promise<ProspectActionResult>;
}) {
  const [showForm, setShowForm] = useState(watchlists.length === 0);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(
    watchlists[0]?.id ?? null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resultByWatchlist = new Map(results.map((result) => [result.watchlistId, result]));
  const selectedWatchlist =
    watchlists.find((watchlist) => watchlist.id === selectedWatchlistId) ?? null;

  useEffect(() => {
    if (!watchlists.some((watchlist) => watchlist.id === selectedWatchlistId)) {
      setSelectedWatchlistId(watchlists[0]?.id ?? null);
    }
  }, [selectedWatchlistId, watchlists]);

  const create = async (input: WatchlistCreateInput) => {
    const result = await createWatchlist(input);
    setNotice(result.message);
    if (result.ok) setShowForm(false);
    return result;
  };

  const run = (watchlistId: string) => {
    setPendingId(watchlistId);
    startTransition(async () => {
      try {
        const result = await runWatchlistDiscovery(watchlistId);
        setNotice(result.message);
      } catch {
        setNotice("Could not start this scan. Please try again.");
      } finally {
        setPendingId(null);
      }
    });
  };

  const setActive = (watchlistId: string, isActive: boolean) => {
    setPendingId(watchlistId);
    startTransition(async () => {
      try {
        const result = await setWatchlistActive(watchlistId, isActive);
        setNotice(result.message);
      } catch {
        setNotice("Could not update this buyer group. Please try again.");
      } finally {
        setPendingId(null);
      }
    });
  };

  return (
    <section id="watchlists" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="pfd text-xl leading-none" style={{ color: C.navy }}>
            Your watches
          </h2>
          <p className="mt-1 max-w-2xl text-xs leading-5" style={{ color: C.muted }}>
            Keep each audience tied to one clear situation. Select a watch to see its brief and latest signals.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BuyerGroupsGuide />
          <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setShowForm((current) => !current)} style={{ borderColor: C.blueLight, color: C.blue }}>
            <Plus className="size-3.5" />
            {showForm ? "Close form" : "New buyer group"}
          </Button>
        </div>
      </div>
      {showForm ? <WatchlistForm onCreate={create} pending={isPending} /> : null}
      {notice ? <p role="status" className="rounded-md border px-3 py-2 text-xs" style={{ borderColor: C.rule, backgroundColor: C.white, color: C.navySoft }}>{notice}</p> : null}
      <div className="grid gap-4 xl:min-h-0 xl:grid-cols-[minmax(300px,0.72fr)_minmax(520px,1.45fr)]">
        <section
          aria-labelledby="watch-list-heading"
          className="overflow-hidden rounded-xl border bg-white"
          style={{ borderColor: C.rule, boxShadow: "0 8px 28px rgba(10, 22, 40, 0.05)" }}
        >
          <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: C.rule, backgroundColor: C.offWhite }}>
            <h2 id="watch-list-heading" className="pfd text-lg leading-none" style={{ color: C.navy }}>
              On your radar
            </h2>
            <span className="rounded-full px-2 py-1 text-[10px] font-bold" style={{ color: C.blue, backgroundColor: C.bluePale }}>
              {watchlists.length} {watchlists.length === 1 ? "group" : "groups"}
            </span>
          </div>

          {watchlists.length > 0 ? (
            <div role="list">
              {watchlists.map((watchlist) => {
                const result = resultByWatchlist.get(watchlist.id);
                const readyCount = result?.readyToAct.length ?? 0;
                const reviewCount = result?.discoveryCandidates.length ?? 0;
                const selected = watchlist.id === selectedWatchlistId;

                return (
                  <button
                    key={watchlist.id}
                    type="button"
                    role="listitem"
                    aria-pressed={selected}
                    onClick={() => setSelectedWatchlistId(watchlist.id)}
                    className="w-full border-b border-l-[3px] px-4 py-3.5 text-left transition-colors hover:bg-[#F7FBFF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B6EBF]"
                    style={{
                      borderColor: C.rule,
                      borderLeftColor: selected ? C.blue : "transparent",
                      backgroundColor: selected ? C.blueTint : C.white,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="pfd truncate text-lg leading-none" style={{ color: C.navy }}>
                          {watchlist.name}
                        </p>
                        <p className="mt-2 line-clamp-2 text-xs leading-5" style={{ color: C.navySoft }}>
                          {watchlist.targetBuyer}
                        </p>
                      </div>
                      <ArrowRight className="mt-1 size-4 shrink-0" style={{ color: selected ? C.blue : C.faint }} aria-hidden="true" />
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
                      <span className="font-semibold" style={{ color: watchlist.isActive ? C.green : C.muted }}>
                        {watchlist.isActive ? scanLabel(watchlist.scanStatus) : "Paused"}
                      </span>
                      <span style={{ color: C.muted }}>
                        {readyCount} ready · {reviewCount} review
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-64 flex-col items-center justify-center px-6 text-center" style={{ backgroundColor: C.blueTint }}>
              <Users className="size-5" style={{ color: C.blue }} aria-hidden="true" />
              <h3 className="pfd mt-3 text-xl leading-none" style={{ color: C.navy }}>
                Begin with one audience
              </h3>
              <p className="mt-2 max-w-xs text-xs leading-5" style={{ color: C.navySoft }}>
                A clear buyer group gives the next scan a useful place to start.
              </p>
            </div>
          )}
        </section>

        {selectedWatchlist ? (
          <WatchlistDetail
            watchlist={selectedWatchlist}
            result={resultByWatchlist.get(selectedWatchlist.id)}
            busy={isPending && pendingId === selectedWatchlist.id}
            onRun={run}
            onSetActive={setActive}
          />
        ) : (
          <section
            aria-label="Selected buyer group"
            className="relative flex min-h-72 items-center justify-center overflow-hidden rounded-xl border px-6 text-center"
            style={{ borderColor: C.rule, backgroundColor: C.blueTint }}
          >
            <div className="absolute -left-10 -top-10 size-40 rounded-full" style={{ backgroundColor: "rgba(59, 154, 232, 0.12)" }} aria-hidden="true" />
            <div className="relative max-w-sm">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
                Buyer groups
              </p>
              <h2 className="pfd mt-3 text-2xl leading-tight" style={{ color: C.navy }}>
                Choose an audience worth watching
              </h2>
              <p className="mt-3 text-sm leading-6" style={{ color: C.navySoft }}>
                Your group brief and its signals will appear here when you are ready.
              </p>
            </div>
          </section>
        )}
      </div>

   </section>
  );
}

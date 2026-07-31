"use client";

import { useState, useTransition, type FormEvent } from "react";
import { ExternalLink, Pause, Play, Plus, Radar, Search, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { C } from "@/lib/tokens";
import type {
  ProspectActionResult,
  WatchlistAction,
  WatchlistCreateInput,
  WatchlistResultsView,
  WatchlistView,
} from "./prospect-types";

const SOURCE_OPTIONS = [
  { value: "hackernews", label: "Hacker News" },
  { value: "bluesky", label: "Bluesky" },
  { value: "lemmy", label: "Lemmy" },
  { value: "stackexchange", label: "Stack Exchange" },
  { value: "github", label: "GitHub" },
  { value: "x", label: "X (fallback)" },
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
  if (ready.length === 0 && watch.length === 0) {
    return (
      <p className="text-sm leading-6" style={{ color: C.muted }}>
        No verifier-confirmed conversations for this group yet. A scan can still
        surface review-only evidence when the fit is plausible but incomplete.
      </p>
    );
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {[...ready, ...watch].map((lead) => {
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
  const [isSubmitting, setIsSubmitting] = useState(false);

  const toggleSource = (source: string) => {
    setSources((current) =>
      current.includes(source)
        ? current.filter((value) => value !== source)
        : [...current, source],
    );
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (sources.length === 0) return;
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
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-md border p-4" style={{ borderColor: C.blueLight }}>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium" style={{ color: C.navy }}>
          Group name
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} placeholder="Early-stage SaaS founders" />
        </label>
        <label className="space-y-1.5 text-sm font-medium" style={{ color: C.navy }}>
          Who do you want to find?
          <Input value={targetBuyer} onChange={(event) => setTargetBuyer(event.target.value)} required maxLength={500} placeholder="SaaS founders with small sales teams" />
        </label>
      </div>
      <label className="block space-y-1.5 text-sm font-medium" style={{ color: C.navy }}>
        What problem are they trying to solve?
        <Textarea value={problemToSolve} onChange={(event) => setProblemToSolve(event.target.value)} required maxLength={700} className="min-h-20 bg-white" placeholder="They need a dependable way to get more trial users without doing every outreach task by hand." />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="space-y-1.5 text-sm font-medium" style={{ color: C.navy }}>
          Words people might use (optional)
          <Textarea value={includeTerms} onChange={(event) => setIncludeTerms(event.target.value)} className="min-h-20 bg-white" placeholder="new trial signups dropped&#10;how are founders finding users" />
        </label>
        <label className="space-y-1.5 text-sm font-medium" style={{ color: C.navy }}>
          Exclude conversations about (optional)
          <Textarea value={excludeTerms} onChange={(event) => setExcludeTerms(event.target.value)} className="min-h-20 bg-white" placeholder="job hunting&#10;consumer coupon codes" />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium" style={{ color: C.navy }}>
          Where should we look?
        </legend>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
          {SOURCE_OPTIONS.map((source) => (
            <label key={source.value} className="flex items-center gap-2 text-sm" style={{ color: C.navySoft }}>
              <Checkbox checked={sources.includes(source.value)} onCheckedChange={() => toggleSource(source.value)} />
              {source.label}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="block space-y-1.5 text-sm font-medium" style={{ color: C.navy }}>
        Public communities or places to prioritize (optional)
        <Textarea value={suggestedPlaces} onChange={(event) => setSuggestedPlaces(event.target.value)} className="min-h-20 bg-white" placeholder="Indie Hackers growth discussions&#10;a public founder community URL" />
      </label>
      <p className="text-xs leading-5" style={{ color: C.muted }}>
        We use your selected public sources now. Suggested places are saved for
        prioritization; private groups are never accessed without a supported integration.
      </p>
      <Button type="submit" disabled={pending || isSubmitting || sources.length === 0} style={{ backgroundColor: C.blue, color: C.white }}>
        <Search className="size-4" />
        {pending || isSubmitting ? "Saving…" : "Create and scan Watchlist"}
      </Button>
    </form>
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
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const resultByWatchlist = new Map(results.map((result) => [result.watchlistId, result]));

  const create = async (input: WatchlistCreateInput) => {
    const result = await createWatchlist(input);
    setNotice(result.message);
    if (result.ok) setShowForm(false);
    return result;
  };

  const run = (watchlistId: string) => {
    setPendingId(watchlistId);
    startTransition(async () => {
      const result = await runWatchlistDiscovery(watchlistId);
      setNotice(result.message);
      setPendingId(null);
    });
  };

  const setActive = (watchlistId: string, isActive: boolean) => {
    setPendingId(watchlistId);
    startTransition(async () => {
      const result = await setWatchlistActive(watchlistId, isActive);
      setNotice(result.message);
      setPendingId(null);
    });
  };

  return (
    <section id="watchlists" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold" style={{ color: C.navy }}>
            <Users className="size-5" />
            Buyer Watchlists
          </h2>
          <p className="mt-1 max-w-3xl text-sm leading-6" style={{ color: C.muted }}>
            Define the buyer group and real-world problem you want to watch. Each
            Watchlist has its own source choices and results, while your website
            profile remains the evidence for what you offer.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setShowForm((current) => !current)} style={{ borderColor: C.blueLight, color: C.blue }}>
          <Plus className="size-4" />
          {showForm ? "Close" : "New Watchlist"}
        </Button>
      </div>
      {showForm ? <WatchlistForm onCreate={create} pending={isPending} /> : null}
      {notice ? <p role="status" className="text-sm" style={{ color: C.navySoft }}>{notice}</p> : null}
      {watchlists.length === 0 && !showForm ? (
        <Card className="rounded-lg shadow-sm" style={{ borderColor: C.rule }}>
          <CardContent className="p-4 text-sm leading-6" style={{ color: C.navySoft }}>
            Add a Watchlist to focus on one buyer group rather than relying only on a broad product-wide scan.
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-4">
        {watchlists.map((watchlist) => {
          const lastScan = formatDate(watchlist.lastScanAt);
          const busy = isPending && pendingId === watchlist.id;
          return (
            <Card key={watchlist.id} className="rounded-lg shadow-sm" style={{ borderColor: watchlist.isActive ? C.rule : C.ruleDark }}>
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardTitle className="text-base" style={{ color: C.navy }}>{watchlist.name}</CardTitle>
                    <p className="mt-1 text-sm leading-6" style={{ color: C.navySoft }}>
                      <span className="font-medium">Looking for:</span> {watchlist.targetBuyer}
                      <br />
                      <span className="font-medium">Who need:</span> {watchlist.problemToSolve}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline" className="rounded-md" style={{ borderColor: watchlist.isActive ? C.green : C.ruleDark, color: watchlist.isActive ? C.green : C.muted }}>
                      <Radar className="size-3" />
                      {watchlist.isActive ? scanLabel(watchlist.scanStatus) : "Paused"}
                    </Badge>
                    {lastScan ? <span className="self-center text-xs" style={{ color: C.muted }}>Last scan {lastScan}</span> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-wrap gap-2">
                  {watchlist.sourcePreferences.map((source) => (
                    <Badge key={source} variant="outline" className="rounded-md" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
                      {sourceLabel(source)}
                    </Badge>
                  ))}
                </div>
                {watchlist.lastScanError ? <p className="text-sm" style={{ color: C.red }}>{watchlist.lastScanError}</p> : null}
                <WatchlistResultCards result={resultByWatchlist.get(watchlist.id)} />
                <div className="flex flex-wrap gap-2 border-t pt-3" style={{ borderColor: C.rule }}>
                  {watchlist.isActive ? (
                    <>
                      <Button type="button" size="sm" disabled={busy} onClick={() => run(watchlist.id)} style={{ backgroundColor: C.blue, color: C.white }}>
                        <Search className="size-4" />
                        {busy ? "Starting…" : "Scan now"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setActive(watchlist.id, false)} style={{ borderColor: C.ruleDark, color: C.navySoft }}>
                        <Pause className="size-4" /> Pause
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setActive(watchlist.id, true)} style={{ borderColor: C.blueLight, color: C.blue }}>
                      <Play className="size-4" /> Resume
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

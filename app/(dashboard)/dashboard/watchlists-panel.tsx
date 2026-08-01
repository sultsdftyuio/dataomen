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
      className="space-y-3 rounded-md border p-3 shadow-sm"
      style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}
    >
      <div>
        <p className="text-xs font-semibold" style={{ color: C.navy }}>
          Who to find
        </p>
        <p className="mt-1 text-xs leading-5" style={{ color: C.muted }}>
          Write the problem in the words a real person might use when asking for help.
        </p>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs font-medium" style={{ color: C.navy }}>
          Group name
          <Input value={name} onChange={(event) => setName(event.target.value)} required maxLength={120} className="h-8 bg-white px-2.5 text-xs" placeholder="Early-stage SaaS founders" />
        </label>
        <label className="space-y-1 text-xs font-medium" style={{ color: C.navy }}>
          Who do you want to find?
          <Input value={targetBuyer} onChange={(event) => setTargetBuyer(event.target.value)} required maxLength={500} className="h-8 bg-white px-2.5 text-xs" placeholder="SaaS founders with small sales teams" />
        </label>
      </div>
      <label className="block space-y-1 text-xs font-medium" style={{ color: C.navy }}>
        What outcome or problem are they talking about?
        <Textarea value={problemToSolve} onChange={(event) => setProblemToSolve(event.target.value)} required maxLength={700} className="min-h-16 bg-white p-2 text-xs" placeholder="They need a dependable way to get more trial users without doing every outreach task by hand." />
      </label>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="space-y-1 text-xs font-medium" style={{ color: C.navy }}>
          Words people might use (optional)
          <Textarea value={includeTerms} onChange={(event) => setIncludeTerms(event.target.value)} className="min-h-16 bg-white p-2 text-xs" placeholder="new trial signups dropped&#10;how are founders finding users" />
        </label>
        <label className="space-y-1 text-xs font-medium" style={{ color: C.navy }}>
          Exclude conversations about (optional)
          <Textarea value={excludeTerms} onChange={(event) => setExcludeTerms(event.target.value)} className="min-h-16 bg-white p-2 text-xs" placeholder="job hunting&#10;consumer coupon codes" />
        </label>
      </div>
      <fieldset>
        <legend className="text-xs font-medium" style={{ color: C.navy }}>
          Pick sources
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
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
      <label className="block space-y-1 text-xs font-medium" style={{ color: C.navy }}>
        Public communities or places to prioritize (optional)
        <Textarea value={suggestedPlaces} onChange={(event) => setSuggestedPlaces(event.target.value)} className="min-h-16 bg-white p-2 text-xs" placeholder="Indie Hackers growth discussions&#10;a public founder community URL" />
      </label>
      <p className="text-xs leading-5" style={{ color: C.muted }}>
        We use your selected public sources now. Suggested places are saved for
        prioritization; private groups are never accessed without a supported integration.
      </p>
      {formError ? (
        <p role="alert" className="text-xs font-medium" style={{ color: C.red }}>
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || isSubmitting || sources.length === 0} className="h-8 px-2.5 text-xs" style={{ backgroundColor: C.blue, color: C.white }}>
        <Search className="size-3.5" />
        {pending || isSubmitting ? "Saving…" : "Save buyer group & start scan"}
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
    <section id="watchlists" className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: C.navy }}>
            <Users className="size-3.5" />
            Your buyer groups
          </h2>
          <p className="mt-1 max-w-3xl text-xs leading-5" style={{ color: C.muted }}>
            Define the buyer group and real-world problem you want to watch. Each
            group has its own source choices and results, while your website
            profile remains the evidence for what you offer.
          </p>
        </div>
        <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" onClick={() => setShowForm((current) => !current)} style={{ borderColor: C.blueLight, color: C.blue }}>
          <Plus className="size-3.5" />
          {showForm ? "Close" : "New buyer group"}
        </Button>
      </div>
      {showForm ? <WatchlistForm onCreate={create} pending={isPending} /> : null}
      {notice ? <p role="status" className="text-xs" style={{ color: C.navySoft }}>{notice}</p> : null}
      {watchlists.length === 0 && !showForm ? (
        <Card className="rounded-md shadow-sm" style={{ borderColor: C.rule }}>
          <CardContent className="p-3 text-xs leading-5" style={{ color: C.navySoft }}>
            Add a buyer group to focus on one audience instead of relying only on a broad product-wide scan.
          </CardContent>
        </Card>
      ) : null}
      <div className="grid gap-3">
        {watchlists.map((watchlist) => {
          const lastScan = formatDate(watchlist.lastScanAt);
          const busy = isPending && pendingId === watchlist.id;
          return (
            <Card key={watchlist.id} className="rounded-md shadow-sm" style={{ borderColor: watchlist.isActive ? C.rule : C.ruleDark }}>
              <CardHeader className="gap-2 p-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <CardTitle className="text-xs font-semibold" style={{ color: C.navy }}>{watchlist.name}</CardTitle>
                    <p className="mt-1 text-xs leading-5" style={{ color: C.navySoft }}>
                      <span className="font-medium">Looking for:</span> {watchlist.targetBuyer}
                      <br />
                      <span className="font-medium">Who need:</span> {watchlist.problemToSolve}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <Badge variant="outline" className="h-5 rounded px-1.5 text-[10px]" style={{ borderColor: watchlist.isActive ? C.green : C.ruleDark, color: watchlist.isActive ? C.green : C.muted }}>
                      <Radar className="size-3" />
                      {watchlist.isActive ? scanLabel(watchlist.scanStatus) : "Paused"}
                    </Badge>
                    {lastScan ? <span className="self-center text-xs" style={{ color: C.muted }}>Last scan {lastScan}</span> : null}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3 p-3 pt-0">
                <div className="flex flex-wrap gap-1.5">
                  {watchlist.sourcePreferences.map((source) => (
                    <Badge key={source} variant="outline" className="h-5 rounded px-1.5 text-[10px]" style={{ borderColor: C.ruleDark, color: C.navySoft }}>
                      {sourceLabel(source)}
                    </Badge>
                  ))}
                </div>
                {watchlist.lastScanError ? <p className="text-xs" style={{ color: C.red }}>{watchlist.lastScanError}</p> : null}
                <WatchlistResultCards result={resultByWatchlist.get(watchlist.id)} />
                <div className="flex flex-wrap gap-2 border-t pt-2" style={{ borderColor: C.rule }}>
                  {watchlist.isActive ? (
                    <>
                      <Button type="button" size="sm" className="h-8 px-2.5 text-xs" disabled={busy} onClick={() => run(watchlist.id)} style={{ backgroundColor: C.blue, color: C.white }}>
                        <Search className="size-3.5" />
                        {busy ? "Starting…" : "Scan now"}
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={busy} onClick={() => setActive(watchlist.id, false)} style={{ borderColor: C.ruleDark, color: C.navySoft }}>
                        <Pause className="size-3.5" /> Pause
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" variant="outline" className="h-8 px-2.5 text-xs" disabled={busy} onClick={() => setActive(watchlist.id, true)} style={{ borderColor: C.blueLight, color: C.blue }}>
                      <Play className="size-3.5" /> Resume
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

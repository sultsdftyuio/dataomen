"use client";

import { useEffect, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { UsersRound } from "lucide-react";

import { EmptyState } from "@/components/dashboard/EmptyState";
import { Button } from "@/components/ui/button";
import type {
  ProspectActionResult,
  WatchlistAction,
  WatchlistResultsView,
  WatchlistView,
} from "./prospect-types";
import { WatchlistDetail, detailHeadingId } from "./watchlist-detail";
import {
  activeOutcome,
  scanOutcome,
  thrownOutcome,
  type ActionOutcome,
} from "./watchlists/action-outcome";
import { FirstBuyerGroupSetup } from "./watchlists/first-group-setup";
import { GroupList, groupRowId } from "./watchlists/group-list";
import { scanState } from "./watchlists/scan-status";
import { useCreateGroup } from "./watchlists/use-create-group";
import { useScanRefresh } from "./watchlists/use-scan-refresh";
import "./watchlists-panel.css";

// Matches the breakpoint in watchlists-panel.css where the detail stacks
// below the list.
const STACKED_LAYOUT_QUERY = "(max-width: 1050px)";

function NoGroupsYet({
  onCreate,
  hasSuggestedBuyerGroups,
}: {
  onCreate: ReturnType<typeof useCreateGroup>;
  hasSuggestedBuyerGroups: boolean;
}) {
  const [isCreating, setIsCreating] = useState(false);

  if (isCreating) {
    return <FirstBuyerGroupSetup onCreate={onCreate} onCancel={() => setIsCreating(false)} />;
  }

  return (
    <EmptyState
      variant="never-used"
      icon={UsersRound}
      title="No buyer groups yet"
      description={
        hasSuggestedBuyerGroups
          ? "A buyer group pairs one audience with the problem they describe, and Arcli looks for public conversations that match. Start from a suggestion below, or create one for a market you already know."
          : "A buyer group pairs one audience with the problem they describe, and Arcli looks for public conversations that match."
      }
      action={
        <Button type="button" onClick={() => setIsCreating(true)}>
          {hasSuggestedBuyerGroups ? "Create custom buyer group" : "Create a buyer group"}
        </Button>
      }
    />
  );
}

export default function WatchlistsPanel({
  watchlists,
  results,
  resultsUnavailable = false,
  now,
  createWatchlist,
  runWatchlistDiscovery,
  setWatchlistActive,
  hasSuggestedBuyerGroups,
  suggestions,
}: {
  watchlists: WatchlistView[];
  results: WatchlistResultsView[];
  /** Matches failed to load; the groups themselves are still shown. */
  resultsUnavailable?: boolean;
  /** Server render time, so scan freshness reads the same on server and client. */
  now: number;
  createWatchlist: WatchlistAction;
  runWatchlistDiscovery: (watchlistId: string) => Promise<ProspectActionResult>;
  setWatchlistActive: (watchlistId: string, isActive: boolean) => Promise<ProspectActionResult>;
  hasSuggestedBuyerGroups: boolean;
  /** Suggested buyer groups, placed after the list (or the first-group setup). */
  suggestions?: ReactNode;
}) {
  const router = useRouter();
  const create = useCreateGroup(createWatchlist);
  const [selectedWatchlistId, setSelectedWatchlistId] = useState<string | null>(
    watchlists[0]?.id ?? null,
  );
  const [outcome, setOutcome] = useState<{ watchlistId: string; outcome: ActionOutcome } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ watchlistId: string } | null>(null);
  const [, startTransition] = useTransition();

  // Select a group as soon as it appears (created from the sheet, the setup
  // or a suggestion), so people land on what they just made.
  const idsKey = watchlists.map((watchlist) => watchlist.id).join("|");
  const [seenIdsKey, setSeenIdsKey] = useState(idsKey);
  if (idsKey !== seenIdsKey) {
    const seen = new Set(seenIdsKey.split("|"));
    const added = watchlists.find((watchlist) => !seen.has(watchlist.id));
    setSeenIdsKey(idsKey);
    if (added) setSelectedWatchlistId(added.id);
  }

  const selectedWatchlist =
    watchlists.find((watchlist) => watchlist.id === selectedWatchlistId) ?? watchlists[0] ?? null;
  const resultByWatchlist = new Map(results.map((result) => [result.watchlistId, result]));
  const anyScanning = watchlists.some((watchlist) => scanState(watchlist, now).isScanning);
  useScanRefresh(anyScanning);

  // On narrow screens the detail sits below the list, so a tap would show no
  // visible change. Bring the detail into view and move focus to its heading.
  useEffect(() => {
    if (!reveal) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("buyer-group-detail")?.scrollIntoView({
      block: "start",
      behavior: reduceMotion ? "auto" : "smooth",
    });
    document.getElementById(detailHeadingId(reveal.watchlistId))?.focus({ preventScroll: true });
  }, [reveal]);

  const select = (watchlistId: string) => {
    setSelectedWatchlistId(watchlistId);
    setOutcome(null);
    if (window.matchMedia(STACKED_LAYOUT_QUERY).matches) setReveal({ watchlistId });
  };

  const backToList = () => {
    if (!selectedWatchlist) return;
    const row = document.getElementById(groupRowId(selectedWatchlist.id));
    row?.scrollIntoView({ block: "center" });
    row?.focus({ preventScroll: true });
  };

  const runAction = (
    watchlistId: string,
    action: () => Promise<ProspectActionResult>,
    describe: (result: ProspectActionResult) => ActionOutcome,
    failureTitle: string,
  ) => {
    setOutcome(null);
    setPendingId(watchlistId);
    startTransition(async () => {
      try {
        const result = await action();
        setOutcome({ watchlistId, outcome: describe(result) });
        if (result.ok) router.refresh();
      } catch {
        setOutcome({ watchlistId, outcome: thrownOutcome(failureTitle) });
      } finally {
        setPendingId(null);
      }
    });
  };

  const run = (watchlistId: string) =>
    runAction(watchlistId, () => runWatchlistDiscovery(watchlistId), scanOutcome, "Couldn't start the scan");

  const setActive = (watchlistId: string, isActive: boolean) =>
    runAction(
      watchlistId,
      () => setWatchlistActive(watchlistId, isActive),
      (result) => activeOutcome(result, isActive),
      isActive ? "Couldn't resume the buyer group" : "Couldn't pause the buyer group",
    );

  if (!selectedWatchlist) {
    return (
      <div id="watchlists" className="space-y-4">
        <NoGroupsYet onCreate={create} hasSuggestedBuyerGroups={hasSuggestedBuyerGroups} />
        {suggestions}
      </div>
    );
  }

  return (
    <div id="watchlists" className="space-y-4">
      <div className="arc-buyer-groups__layout">
        <GroupList
          watchlists={watchlists}
          resultByWatchlist={resultByWatchlist}
          resultsUnavailable={resultsUnavailable}
          selectedId={selectedWatchlist.id}
          now={now}
          onSelect={select}
        />
        <WatchlistDetail
          key={selectedWatchlist.id}
          watchlist={selectedWatchlist}
          result={resultByWatchlist.get(selectedWatchlist.id)}
          resultsUnavailable={resultsUnavailable}
          now={now}
          busy={pendingId === selectedWatchlist.id}
          outcome={outcome?.watchlistId === selectedWatchlist.id ? outcome.outcome : null}
          onRun={run}
          onSetActive={setActive}
          onBack={backToList}
        />
      </div>
      {suggestions}
    </div>
  );
}

import type { DiscoveryRunSummaryView } from "./buyer-demand-report";

type LatestScan = {
  status: string | null;
  isTerminal: boolean;
  summary: DiscoveryRunSummaryView;
};

export type EmptyDiscoveryOutcome = {
  title: string;
  detail: string;
};

/** A zero in the review queue is not enough to diagnose market demand. */
export function describeEmptyDiscovery(scan: LatestScan | null): EmptyDiscoveryOutcome {
  if (!scan) {
    return {
      title: "No source report is available yet",
      detail: "We cannot tell from this empty queue whether public conversations were searched. Check the latest scan activity before changing your brief.",
    };
  }

  if (!scan.isTerminal) {
    return {
      title: "Potential matches are still being checked",
      detail: "Source collection and lead verification finish separately. An empty review queue is not a final zero while checks remain pending.",
    };
  }

  if (scan.status === "skipped") {
    return {
      title: "The latest public search did not run",
      detail: "A skipped run is not a finding about your market. Check the scan activity for the recorded reason.",
    };
  }

  if (scan.status === "failed" || scan.status === "dead_lettered") {
    return {
      title: "The latest source search failed",
      detail: "This empty queue does not measure demand. Review source failures in the scan activity and retry after the issue is resolved.",
    };
  }

  if (["partial", "degraded"].includes(scan.status ?? "") || (scan.summary.sourceFailures ?? 0) > 0) {
    return {
      title: "The latest search had incomplete coverage",
      detail: scan.summary.verifierPending
        ? "Some sources did not finish and candidate checks may still be pending. Review the source-by-source report before changing your brief."
        : "Some sources did not finish. Review the source-by-source report before deciding whether to change your brief.",
    };
  }

  if (scan.summary.verifierPending) {
    return {
      title: "Potential matches are still being checked",
      detail: "Source collection and lead verification finish separately. An empty review queue is not a final zero while checks remain pending.",
    };
  }

  if (scan.summary.totalHits === 0) {
    return {
      title: "Searched sources returned no posts",
      detail: "This says something about the selected sources, queries, and search window—not whether your market has no demand.",
    };
  }

  if (scan.summary.totalHits === null) {
    return {
      title: "The latest scan has no complete source count",
      detail: "We cannot explain the empty queue from available scan data. Check source activity or try again later.",
    };
  }

  if (scan.summary.plausibleHits === 0) {
    return {
      title: "Posts were found, but none became candidates",
      detail: "The source report shows posts, but none passed the early relevance checks. Review the source mix and matching brief before changing either.",
    };
  }

  return {
    title: "Candidates were found, but none are review-ready",
    detail: "A candidate is not a verified lead. Check the scan report and screened-out audit for what happened before assuming there is no demand.",
  };
}

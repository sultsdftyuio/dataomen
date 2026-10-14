import { StatusBadge } from "@/components/ui/status-badge";

/** Covers the brief handoff before the live discovery route can read a job. */
export function StartingDiscoveryScreen() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 px-4 text-center backdrop-blur-sm"
      role="status"
      aria-live="polite"
    >
      <div className="flex max-w-sm flex-col items-center">
        <StatusBadge tone="progress">Starting</StatusBadge>
        <p className="mt-3 text-base leading-6 font-semibold text-foreground">Starting a new scan</p>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Saving your workspace and queuing a search of public conversations.
        </p>
      </div>
    </div>
  );
}

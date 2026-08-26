import { Loader2, Radar } from "lucide-react";

import { C } from "@/lib/tokens";

/** Covers the brief handoff before the live discovery route can read a job. */
export function StartingDiscoveryScreen() {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-white/95 px-6 text-center backdrop-blur-sm"
      role="status"
      aria-live="polite"
      aria-label="Starting lead discovery"
    >
      <div className="max-w-sm">
        <div
          className="mx-auto flex size-14 items-center justify-center rounded-2xl"
          style={{ backgroundColor: C.bluePale, color: C.blue }}
        >
          <Radar className="size-7" aria-hidden="true" />
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold" style={{ color: C.navy }}>
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          Starting a new discovery
        </div>
        <p className="mt-2 text-sm leading-6" style={{ color: C.navySoft }}>
          Saving your workspace and queuing a fresh search for buyer signals.
        </p>
      </div>
    </div>
  );
}

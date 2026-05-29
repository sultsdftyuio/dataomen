"use client";

import { useEffect, useRef, useState } from "react";

const MAX_POLLING_DURATION_MS = 45_000;

export type WorkspacePhase = "PROVISIONING" | "INTEGRATION" | "BACKFILLING" | "READY" | "FAILED";

type WorkspaceStatusPayload = {
  status?: WorkspacePhase;
  phase?: WorkspacePhase;
  message?: string;
  hasStripeConnection?: boolean;
  hasBaselineData?: boolean;
};

export function useAsyncProvisioning() {
  const [status, setStatus] = useState<WorkspacePhase>("PROVISIONING");
  const [phase, setPhase] = useState<WorkspacePhase>("PROVISIONING");
  const [message, setMessage] = useState("Provisioning your workspace.");
  const isPolling = useRef(true);

  useEffect(() => {
    const startTime = Date.now();

    const checkStatus = async () => {
      if (!isPolling.current) {
        return;
      }

      if (Date.now() - startTime > MAX_POLLING_DURATION_MS) {
        setStatus("FAILED");
        setPhase("FAILED");
        setMessage("Provisioning timed out.");
        isPolling.current = false;

        return;
      }

      try {
        const res = await fetch("/api/account/workspace");

        if (res.ok) {
          const data = (await res.json().catch(() => null)) as WorkspaceStatusPayload | null;

          if (data?.status) {
            const nextStatus = data.status;
            setStatus(nextStatus);
            setPhase(data.phase ?? nextStatus);
            setMessage(data.message ?? (nextStatus === "READY" ? "Workspace secured." : "Provisioning your workspace."));

            if (nextStatus === "READY") {
              isPolling.current = false;
              return;
            }
          }
        }
      } catch (error) {
        console.warn("Provisioning poll failed, retrying...", error);
      }

      if (isPolling.current) {
        setTimeout(checkStatus, 3_000);
      }
    };

    void checkStatus();

    return () => {
      isPolling.current = false;
    };
  }, []);

  return { status, phase, message };
}

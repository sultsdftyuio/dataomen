"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";

import { upgradeToProPlan } from "@/app/actions/billing";

export default function AutoStartProCheckout({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const hasStarted = useRef(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!enabled || hasStarted.current) return;

    hasStarted.current = true;
    startTransition(async () => {
      try {
        const result = await upgradeToProPlan();

        if (result.url) {
          window.location.assign(result.url);
          return;
        }

        if (result.status === "already_active") {
          router.replace("/dashboard");
        }
      } catch (error) {
        console.error("[Billing] Automatic Pro checkout could not start", error);
        router.replace("/settings");
      }
    });
  }, [enabled, router, startTransition]);

  return null;
}

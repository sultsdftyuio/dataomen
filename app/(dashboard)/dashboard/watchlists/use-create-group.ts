"use client";

import { useRouter } from "next/navigation";

import { toast } from "@/components/ui/use-toast";
import type { WatchlistAction, WatchlistCreateInput } from "../prospect-types";
import { createOutcome, thrownOutcome, type ActionOutcome } from "./action-outcome";

export type CreateGroupResult = { ok: boolean; outcome: ActionOutcome };
export type CreateGroup = (input: WatchlistCreateInput) => Promise<CreateGroupResult>;

/**
 * Wraps the createWatchlist action for every create path. Success is
 * confirmed with a toast because the form that triggered it closes or is
 * replaced by the new group; failures are returned for the form to show inline.
 */
export function useCreateGroup(createWatchlist: WatchlistAction): CreateGroup {
  const router = useRouter();

  return async (input) => {
    try {
      const result = await createWatchlist(input);
      const outcome = createOutcome(result);
      if (result.ok) {
        toast({ title: outcome.title, description: outcome.description });
        router.refresh();
      }
      return { ok: result.ok, outcome };
    } catch {
      return { ok: false, outcome: thrownOutcome("Couldn't save the buyer group") };
    }
  };
}

"use client";

import { BookOpen } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { WatchlistAction } from "../prospect-types";
import { NewBuyerGroupSheet } from "./group-form";
import { useCreateGroup } from "./use-create-group";

const GUIDE_STEPS = [
  {
    title: "Describe a real situation",
    detail: "Name the audience and the problem in the words they would use when asking for help.",
  },
  {
    title: "Arcli scans public sources",
    detail: "It checks saved conversations first, then the sources you chose. All sources are on unless you change them.",
  },
  {
    title: "Review what it finds",
    detail: "Verified matches are ready to review. Plausible ones are kept separate so you can judge them yourself.",
  },
];

function BuyerGroupsGuide() {
  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button type="button" variant="outline">
          <BookOpen className="size-4" aria-hidden="true" />
          How it works
        </Button>
      </SheetTrigger>
      <SheetContent className="gap-0 overflow-y-auto bg-card p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border px-5 py-4">
          <SheetTitle className="text-lg leading-7 font-semibold text-foreground">How buyer groups work</SheetTitle>
          <SheetDescription className="text-sm leading-6 text-muted-foreground">
            Keep each group specific enough that you would recognise the right conversation.
          </SheetDescription>
        </SheetHeader>
        <ol className="space-y-5 px-5 py-5">
          {GUIDE_STEPS.map((step, index) => (
            <li key={step.title} className="flex gap-3">
              <span
                className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-pale text-xs font-semibold text-primary tabular-nums"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <div>
                <h3 className="text-sm leading-6 font-semibold text-foreground">{step.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{step.detail}</p>
              </div>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  );
}

/**
 * Page-level actions for the Buyer groups header. Creating from the sheet is
 * offered only once a group exists; a new workspace uses the first-group setup.
 */
export function BuyerGroupsHeaderActions({
  createWatchlist,
  canCreate,
}: {
  createWatchlist: WatchlistAction;
  canCreate: boolean;
}) {
  const create = useCreateGroup(createWatchlist);

  return (
    <>
      <BuyerGroupsGuide />
      {canCreate ? <NewBuyerGroupSheet onCreate={create} /> : null}
    </>
  );
}

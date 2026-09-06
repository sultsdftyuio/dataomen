"use client";

import { useState, type ComponentType } from "react";
import {
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  MessagesSquare,
  Radar,
  RefreshCw,
  ShieldCheck,
  Target,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { C } from "@/lib/tokens";

type GuideStep = {
  title: string;
  description: string;
  instruction: string;
  check: string;
  icon: ComponentType<{ className?: string }>;
};

const GUIDE_STEPS: readonly GuideStep[] = [
  {
    title: "Define the buyer",
    description:
      "Start with the person or team that can recognise the problem and act on it.",
    instruction:
      "In The match, describe their role, company type, or situation. Be specific enough that you could recognise them in a public post.",
    check: "You can name who should see value before mentioning your product.",
    icon: Target,
  },
  {
    title: "Name the painful situation",
    description:
      "Explain the frustrating outcome that makes this buyer look for help now.",
    instruction:
      "Write the problem in the buyer's words. Focus on the cost, delay, risk, or manual work they want to remove—not your feature list.",
    check: "The problem sounds urgent and familiar to the buyer, not like marketing copy.",
    icon: Radar,
  },
  {
    title: "Add the signals to look for",
    description:
      "Give the brief real language and events that reveal buying intent.",
    instruction:
      "Add pain points, use cases, buying triggers, and phrases people use when asking for help. Keep each phrase likely to appear in a conversation.",
    check: "Every signal is something you could realistically find in a post or reply.",
    icon: MessagesSquare,
  },
  {
    title: "Set matching rules",
    description:
      "Remove the common false positives before they reach your prospect list.",
    instruction:
      "In Matching rules, add negative keywords and excluded audiences. Start with obvious non-buyers, competitors, and meanings you do not want matched.",
    check: "You have ruled out the conversations that would waste review time.",
    icon: ShieldCheck,
  },
  {
    title: "Save, then choose one update",
    description:
      "Once the brief is clear, use the refresh controls for the change you actually made.",
    instruction:
      "Use Refresh brief after editing the brief, Re-crawl only when the website changed, or Scan demand when you are ready to find new conversations.",
    check: "Choose one action at a time so the result is easy to understand.",
    icon: RefreshCw,
  },
];

export function MatchingBriefGuide() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const activeStep = GUIDE_STEPS[activeStepIndex];
  const isFirstStep = activeStepIndex === 0;
  const isLastStep = activeStepIndex === GUIDE_STEPS.length - 1;
  const StepIcon = activeStep.icon;

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);

    if (!open) {
      setActiveStepIndex(0);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-fit border bg-white text-xs shadow-sm"
          style={{ borderColor: C.rule, color: C.navy }}
        >
          <BookOpen />
          How to build your matching brief
        </Button>
      </DialogTrigger>

      <DialogContent
        className="max-h-[calc(100vh-2rem)] max-w-xl gap-0 overflow-y-auto border bg-white p-0 sm:max-w-xl"
        style={{ borderColor: C.rule }}
      >
        <DialogHeader className="border-b px-5 py-5 pr-12" style={{ borderColor: C.rule }}>
          <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: C.blue }}>
            Step {activeStepIndex + 1} of {GUIDE_STEPS.length}
          </p>
          <DialogTitle className="pfd text-2xl" style={{ color: C.navy }}>
            Build a matching brief
          </DialogTitle>
          <DialogDescription className="text-xs leading-5" style={{ color: C.muted }}>
            Follow these steps in order, then return here whenever you need to refine your targeting.
          </DialogDescription>
        </DialogHeader>

        <div className="px-5 pt-4">
          <div className="flex gap-1.5" aria-label={`Guide step ${activeStepIndex + 1} of ${GUIDE_STEPS.length}`}>
            {GUIDE_STEPS.map((step, index) => (
              <span
                key={step.title}
                className="h-1.5 flex-1 rounded-full"
                style={{ backgroundColor: index <= activeStepIndex ? C.blue : C.rule }}
              />
            ))}
          </div>
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex items-start gap-3">
            <div
              className="flex size-10 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: C.bluePale, color: C.blue }}
            >
              <StepIcon className="size-5" />
            </div>
            <div>
              <h2 className="pfd text-xl leading-tight" style={{ color: C.navy }}>
                {activeStep.title}
              </h2>
              <p className="mt-1.5 text-sm leading-6" style={{ color: C.muted }}>
                {activeStep.description}
              </p>
            </div>
          </div>

          <div className="rounded-lg border px-4 py-3" style={{ backgroundColor: C.blueTint, borderColor: C.rule }}>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em]" style={{ color: C.blue }}>
              What to do
            </p>
            <p className="mt-1.5 text-sm leading-6" style={{ color: C.navy }}>
              {activeStep.instruction}
            </p>
          </div>

          <div className="flex gap-2.5 rounded-lg px-1 py-1">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0" style={{ color: C.green }} />
            <p className="text-xs leading-5" style={{ color: C.muted }}>
              <span className="font-semibold" style={{ color: C.navy }}>
                Good check: 
              </span>
              {activeStep.check}
            </p>
          </div>
        </div>

        <DialogFooter className="border-t px-5 py-4 sm:justify-between" style={{ borderColor: C.rule }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isFirstStep}
            onClick={() => setActiveStepIndex((index) => index - 1)}
            style={{ color: C.muted }}
          >
            <ChevronLeft />
            Back
          </Button>

          {isLastStep ? (
            <DialogClose asChild>
              <Button type="button" size="sm" style={{ backgroundColor: C.blue, color: C.white }}>
                Got it
                <CheckCircle2 />
              </Button>
            </DialogClose>
          ) : (
            <Button
              type="button"
              size="sm"
              onClick={() => setActiveStepIndex((index) => index + 1)}
              style={{ backgroundColor: C.blue, color: C.white }}
            >
              Next step
              <ChevronRight />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

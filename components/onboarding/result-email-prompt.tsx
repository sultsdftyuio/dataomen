"use client";

import Link from "next/link";
import { BellRing, Loader2, MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { C } from "@/lib/tokens";

export type ResultEmailOffer = {
  status: "off" | "on" | "ineligible" | "unavailable";
  email: string | null;
};

type ResultEmailPromptProps = {
  open: boolean;
  domain: string;
  email: string;
  pending: boolean;
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onContinue: () => void;
  onEnable: () => void;
};

export function ResultEmailPrompt({
  open,
  domain,
  email,
  pending,
  error,
  onOpenChange,
  onContinue,
  onEnable,
}: ResultEmailPromptProps) {
  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !pending && onOpenChange(nextOpen)}>
      <DialogContent showCloseButton={!pending} className="gap-5 sm:max-w-md">
        <DialogHeader className="text-left">
          <div
            className="mb-1 flex size-11 items-center justify-center rounded-xl"
            style={{ backgroundColor: C.bluePale, color: C.blue }}
          >
            <BellRing className="size-5" aria-hidden="true" />
          </div>
          <DialogTitle className="text-xl" style={{ color: C.navy }}>
            Get result updates by email?
          </DialogTitle>
          <DialogDescription className="leading-6">
            We can email you when the website brief for <strong>{domain}</strong> is ready,
            when a Pro scan reports a checkpoint, or if we cannot read the site.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-xl border px-4 py-3" style={{ borderColor: C.blueLight, backgroundColor: C.blueTint }}>
          <div className="flex items-start gap-2.5">
            <MailCheck className="mt-0.5 size-4 shrink-0" style={{ color: C.blue }} aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-xs font-semibold" style={{ color: C.navy }}>Sent to your account email</p>
              <p className="mt-0.5 break-all text-sm" style={{ color: C.navySoft }}>{email}</p>
            </div>
          </div>
        </div>

        <p className="text-xs leading-5" style={{ color: C.muted }}>
          This is optional and off unless you choose it. Updates contain aggregate results,
          not public post text or contact details, and include no promotions. They may not arrive for every scan and
          depend on email delivery being active. Turn them off at any time in Settings.
          See our <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-semibold underline underline-offset-2">Privacy Policy</Link>.
        </p>

        {error ? (
          <p role="alert" className="rounded-lg border px-3 py-2 text-xs leading-5" style={{ borderColor: C.amber, backgroundColor: C.amberPale, color: C.amber }}>
            {error} You can try again or continue without email updates.
          </p>
        ) : null}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" className="h-11 flex-1" disabled={pending} onClick={onContinue}>
            Continue without emails
          </Button>
          <Button type="button" className="h-11 flex-1" disabled={pending} onClick={onEnable} style={{ backgroundColor: C.navy, color: C.white }}>
            {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
            Email me updates
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

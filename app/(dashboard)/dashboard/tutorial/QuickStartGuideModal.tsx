"use client";

import { ShieldAlert } from "lucide-react";
import React from "react";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";

interface QuickStartGuideModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onKeyGenerated: () => void;
  onDone: () => void;
}

const sans = "var(--font-geist-sans), sans-serif";

export function QuickStartGuideModal({
  isOpen,
  onOpenChange,
  onKeyGenerated,
  onDone,
}: QuickStartGuideModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-3xl p-0 border-slate-200 shadow-xl overflow-hidden rounded-xl"
        style={{ fontFamily: sans }}
      >
        <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-white">
          <DialogTitle className="flex items-center gap-2.5 text-lg text-slate-900 tracking-tight">
            <ShieldAlert className="h-5 w-5 text-blue-600" />
            API Credentials
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 mt-1.5">
            Generate and store your API keys securely. Raw keys are only
            displayed once.
          </DialogDescription>
        </DialogHeader>

        <div className="p-6 bg-slate-50/50 max-h-[60vh] overflow-y-auto">
          <div className="bg-white border border-slate-200 rounded-xl p-2 shadow-sm">
            <ApiKeysManager onKeyGenerated={onKeyGenerated} />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-white flex justify-end">
          <button
            onClick={onDone}
            style={{
              height: 36,
              padding: "0 16px",
              borderRadius: 6,
              background: "#1a1a2e",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              display: "inline-flex",
              alignItems: "center",
              border: "none",
              cursor: "pointer",
            }}
          >
            Done
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
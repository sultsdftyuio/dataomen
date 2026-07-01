"use client";

import React, { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { EmailTemplate } from "@/lib/types";
import { CreateTemplateForm } from "./create-template-form";

interface CreateTemplateModalProps {
  onTemplateCreated: (template: EmailTemplate) => void;
}

// Exact shadows mapped from your snippet
const surfaceBorder = "border border-black/[0.08]";

export function CreateTemplateModal({ onTemplateCreated }: CreateTemplateModalProps) {
  // Isolated Modal State
  const [isOpen, setIsOpen] = useState(false);

  const handleSuccess = (template: EmailTemplate) => {
    onTemplateCreated(template);
    setIsOpen(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="h-9 px-4 bg-[#0B1120] hover:bg-slate-800 text-white text-[13px] font-bold shadow-[0_2px_4px_rgba(0,0,0,0.12)] transition-all rounded-lg">
          <Plus className="h-3.5 w-3.5 mr-2" />
          Create Template
        </Button>
      </DialogTrigger>

      {/* Adding overflow-hidden and p-0 ensures the inner form backgrounds map perfectly to the rounded edges */}
      <DialogContent className={`sm:max-w-[480px] p-0 overflow-hidden ${surfaceBorder} shadow-[0_4px_20px_rgba(0,0,0,0.08)] rounded-xl font-sans gap-0`}>
        
        {/* Header matched to the #FAFAFA canvas background for contrast against the white form */}
        <DialogHeader className={`px-5 py-4 bg-[#FAFAFA] border-b border-black/[0.08]`}>
          <DialogTitle className="text-[16px] font-semibold text-[#0B1120] tracking-[-0.01em]">
            New Recovery Template
          </DialogTitle>
          <DialogDescription className="text-[13px] text-slate-500 mt-1.5 leading-relaxed">
            Draft a personalized template sequence. Placeholders like{" "}
            <code className={`text-[11px] font-mono bg-white px-1.5 py-0.5 rounded text-slate-600 ${surfaceBorder}`}>
              {"{{first_name}}"}
            </code>{" "}
            will be injected dynamically at send-time.
          </DialogDescription>
        </DialogHeader>

        <CreateTemplateForm 
          onSuccess={handleSuccess} 
          onCancel={() => setIsOpen(false)} 
        />
      </DialogContent>
    </Dialog>
  );
}
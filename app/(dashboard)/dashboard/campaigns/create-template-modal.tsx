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
        <Button className="bg-[#0A192F] hover:bg-slate-800 text-white shadow-sm transition-all">
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </DialogTrigger>

      {/* Adding overflow-hidden and p-0 ensures the inner form backgrounds map perfectly to the rounded edges */}
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-slate-200 shadow-xl rounded-xl">
        <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
          <DialogTitle className="text-lg text-slate-900 tracking-tight">
            New Recovery Template
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-500 mt-1.5">
            Draft a personalized template sequence. Placeholders like{" "}
            {"{{first_name}}"} will be injected dynamically at send-time.
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
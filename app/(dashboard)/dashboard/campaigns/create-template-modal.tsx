"use client";

import React, { useState } from "react";
import { Plus, RefreshCw, Workflow, FileCode2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { EmailTemplate } from "@/lib/types";

interface CreateTemplateModalProps {
  onTemplateCreated: (template: EmailTemplate) => void;
}

export function CreateTemplateModal({ onTemplateCreated }: CreateTemplateModalProps) {
  const { toast } = useToast();

  // Isolated Modal State
  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateSubject, setNewTemplateSubject] = useState("");

  // Reusable styling constants to match the deterministic aesthetic
  const surfaceBorder = "border border-black/5";
  const inputBorder = "border border-black/10 focus-visible:border-blue-500 focus-visible:ring-1 focus-visible:ring-blue-500";
  const surfaceShadow = "shadow-[0_1px_3px_rgba(0,0,0,0.08)]";

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim() || !newTemplateSubject.trim()) return;

    setIsCreating(true);

    try {
      // RULE 2: Async Enrichment Boundary.
      // Simulate network request to POST /api/templates
      // Maps to an actual Supabase RPC insert ensuring tenant isolation.
      await new Promise((resolve) => setTimeout(resolve, 800));

      const generatedId = `tpl_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

      const newTemplate: EmailTemplate = {
        id: generatedId,
        name: newTemplateName.trim(),
        subject: newTemplateSubject.trim(),
        type: "recovery_sequence",
      };

      // Pass the constructed template back to the parent component
      onTemplateCreated(newTemplate);

      toast({
        title: "Configuration Saved",
        description: `Template entity "${newTemplateName}" is now available in your workflow pipeline.`,
      });

      // Reset internal form state and close modal
      setNewTemplateName("");
      setNewTemplateSubject("");
      setIsOpen(false);
    } catch (error) {
      toast({
        title: "System Error",
        description: "A pipeline error prevented saving the configuration.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          className={`bg-white hover:bg-[#FAFAFA] text-[#0B1120] font-semibold ${surfaceBorder} ${surfaceShadow} transition-all`}
        >
          <Plus className="h-4 w-4 mr-2 text-slate-500" />
          Configure Template
        </Button>
      </DialogTrigger>

      {/* Override default padding (p-0) to allow full-bleed internal sections */}
      <DialogContent className="sm:max-w-[520px] p-0 gap-0 border-black/10 shadow-[0_4px_24px_rgba(0,0,0,0.12)] rounded-xl overflow-hidden font-sans bg-white">
        <form onSubmit={handleCreateTemplate}>
          
          {/* Technical Header */}
          <DialogHeader className="px-6 py-6 border-b border-black/5 bg-[#FAFAFA]">
            <div className="flex items-center gap-2 text-blue-600 font-bold text-[11px] mb-3 tracking-[0.08em] uppercase">
              <Workflow size={14} /> System Configuration
            </div>
            <DialogTitle className="text-[22px] font-semibold text-[#0B1120] tracking-tight leading-tight">
              Define Recovery Template
            </DialogTitle>
            <DialogDescription className="text-[14px] text-slate-600 mt-2 leading-relaxed">
              Construct a deterministic email sequence. Dynamic variables like{" "}
              <code className="font-mono text-[12px] bg-black/5 px-1.5 py-0.5 rounded text-[#0B1120] font-semibold border border-black/5">
                {"{{first_name}}"}
              </code>{" "}
              are injected via telemetry at execution time.
            </DialogDescription>
          </DialogHeader>

          {/* Form Body */}
          <div className="px-6 py-7 space-y-6 bg-white">
            <div className="space-y-3">
              <Label
                htmlFor="tpl-name"
                className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 flex items-center justify-between"
              >
                <span>Internal Entity Name</span>
                <span className="text-[10px] text-slate-400 font-mono tracking-normal normal-case">req</span>
              </Label>
              <div className="relative">
                <Input
                  id="tpl-name"
                  value={newTemplateName}
                  onChange={(e) => setNewTemplateName(e.target.value)}
                  placeholder="e.g. High Risk Dunning - Day 3"
                  disabled={isCreating}
                  className={`bg-[#FAFAFA] text-[14px] text-[#0B1120] h-11 pl-10 ${inputBorder}`}
                  autoFocus
                  required
                />
                <FileCode2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              </div>
            </div>

            <div className="space-y-3">
              <Label
                htmlFor="tpl-subj"
                className="text-[11px] font-bold uppercase tracking-[0.08em] text-slate-500 flex items-center justify-between"
              >
                <span>Subject Line Payload</span>
                <span className="text-[10px] text-slate-400 font-mono tracking-normal normal-case">req</span>
              </Label>
              <Input
                id="tpl-subj"
                value={newTemplateSubject}
                onChange={(e) => setNewTemplateSubject(e.target.value)}
                placeholder="e.g. Action Required: Subscription Paused"
                disabled={isCreating}
                className={`bg-[#FAFAFA] text-[14px] text-[#0B1120] font-mono text-sm h-11 ${inputBorder}`}
                required
              />
            </div>
          </div>

          {/* Action Footer */}
          <DialogFooter className="px-6 py-4 border-t border-black/5 bg-[#FAFAFA] sm:justify-between items-center flex-row-reverse">
            <Button
              type="submit"
              disabled={
                isCreating || !newTemplateName.trim() || !newTemplateSubject.trim()
              }
              className="bg-blue-600 hover:bg-blue-700 text-white min-w-[140px] transition-all font-bold tracking-[0.02em] shadow-[0_0_15px_rgba(37,99,235,0.2)] h-10"
            >
              {isCreating ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Writing...
                </>
              ) : (
                "Save Configuration"
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setIsOpen(false)}
              disabled={isCreating}
              className="text-slate-500 hover:text-[#0B1120] hover:bg-black/5 font-semibold text-[13px] h-10 px-4"
            >
              Cancel Setup
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
"use client";

import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { EmailTemplate } from "@/lib/types";

interface CreateTemplateFormProps {
  onSuccess: (template: EmailTemplate) => void;
  onCancel: () => void;
}

export function CreateTemplateForm({ onSuccess, onCancel }: CreateTemplateFormProps) {
  const { toast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateSubject, setNewTemplateSubject] = useState("");

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTemplateName.trim() || !newTemplateSubject.trim()) return;

    setIsCreating(true);

    try {
      // RULE 2: Async Enrichment Boundary.
      // Simulate network request to POST /api/templates
      await new Promise((resolve) => setTimeout(resolve, 800));

      const generatedId = `tpl_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;

      const newTemplate: EmailTemplate = {
        id: generatedId,
        name: newTemplateName.trim(),
        subject: newTemplateSubject.trim(),
        type: "recovery_sequence",
      };

      toast({
        title: "Template Saved",
        description: `"${newTemplateName}" is now available in your workflow.`,
      });

      // Pass the constructed template back to close modal & update parent
      onSuccess(newTemplate);
    } catch (error) {
      toast({
        title: "Creation Failed",
        description: "A system error prevented saving the template.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <form onSubmit={handleCreateTemplate} className="font-sans">
      <div className="px-5 py-5 space-y-4 bg-white">
        
        <div className="space-y-1.5">
          <Label
            htmlFor="tpl-name"
            className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500"
          >
            Template Name
          </Label>
          <Input
            id="tpl-name"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="e.g. High Risk Dunning - Day 3"
            disabled={isCreating}
            className="h-9 text-[13px] bg-[#FAFAFA] border-black/[0.08] shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 transition-colors"
            autoFocus
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label
            htmlFor="tpl-subj"
            className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500"
          >
            Email Subject Line
          </Label>
          <Input
            id="tpl-subj"
            value={newTemplateSubject}
            onChange={(e) => setNewTemplateSubject(e.target.value)}
            placeholder="e.g. Action Required: Subscription Paused"
            disabled={isCreating}
            className="h-9 text-[13px] bg-[#FAFAFA] border-black/[0.08] shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-blue-500/50 focus-visible:border-blue-500 transition-colors"
            required
          />
        </div>

      </div>

      <DialogFooter className="px-5 py-3.5 border-t border-black/[0.08] bg-[#FAFAFA]">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isCreating}
          className="h-8 px-4 text-[13px] font-semibold bg-white border border-black/[0.08] text-slate-600 hover:bg-slate-50 shadow-none"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isCreating || !newTemplateName.trim() || !newTemplateSubject.trim()}
          className="h-8 px-4 min-w-[120px] text-[13px] font-bold bg-[#0B1120] hover:bg-slate-800 text-white shadow-[0_2px_4px_rgba(0,0,0,0.12)] transition-all"
        >
          {isCreating ? (
            <RefreshCw className="h-3.5 w-3.5 animate-spin" />
          ) : (
            "Save Template"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
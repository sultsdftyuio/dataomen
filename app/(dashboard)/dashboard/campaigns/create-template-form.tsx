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
    <form onSubmit={handleCreateTemplate}>
      <div className="px-6 py-6 space-y-5 bg-white">
        <div className="space-y-2.5">
          <Label
            htmlFor="tpl-name"
            className="text-xs font-bold uppercase tracking-wide text-slate-600"
          >
            Template Name
          </Label>
          <Input
            id="tpl-name"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="e.g. High Risk Dunning - Day 3"
            disabled={isCreating}
            className="border-slate-200 shadow-sm focus-visible:ring-blue-500/20 text-sm"
            autoFocus
            required
          />
        </div>
        <div className="space-y-2.5">
          <Label
            htmlFor="tpl-subj"
            className="text-xs font-bold uppercase tracking-wide text-slate-600"
          >
            Email Subject Line
          </Label>
          <Input
            id="tpl-subj"
            value={newTemplateSubject}
            onChange={(e) => setNewTemplateSubject(e.target.value)}
            placeholder="e.g. Action Required: Subscription Paused"
            disabled={isCreating}
            className="border-slate-200 shadow-sm focus-visible:ring-blue-500/20 text-sm"
            required
          />
        </div>
      </div>

      <DialogFooter className="px-6 py-4 border-t border-slate-100 bg-slate-50">
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={isCreating}
          className="bg-white"
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={isCreating || !newTemplateName.trim() || !newTemplateSubject.trim()}
          className="bg-blue-600 hover:bg-blue-700 text-white min-w-[120px] transition-all"
        >
          {isCreating ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            "Save Template"
          )}
        </Button>
      </DialogFooter>
    </form>
  );
}
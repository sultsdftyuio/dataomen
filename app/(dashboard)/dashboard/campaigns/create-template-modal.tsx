"use client";

import React, { useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
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
        title: "Template Saved",
        description: `"${newTemplateName}" is now available in your workflow.`,
      });

      // Reset internal form state and close modal
      setNewTemplateName("");
      setNewTemplateSubject("");
      setIsOpen(false);
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
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button className="bg-[#0A192F] hover:bg-slate-800 text-white shadow-sm transition-all">
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[500px] border-slate-200 shadow-xl rounded-xl">
        <form onSubmit={handleCreateTemplate}>
          <DialogHeader className="px-6 py-5 border-b border-slate-100 bg-slate-50/50">
            <DialogTitle className="text-lg text-slate-900 tracking-tight">
              New Recovery Template
            </DialogTitle>
            <DialogDescription className="text-sm text-slate-500 mt-1.5">
              Draft a personalized template sequence. Placeholders like{" "}
              {"{{first_name}}"} will be injected dynamically at send-time.
            </DialogDescription>
          </DialogHeader>

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
              onClick={() => setIsOpen(false)}
              disabled={isCreating}
              className="bg-white"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={
                isCreating || !newTemplateName.trim() || !newTemplateSubject.trim()
              }
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
      </DialogContent>
    </Dialog>
  );
}
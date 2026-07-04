"use client";

import React, { useState } from "react";
import { RefreshCw, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { EmailTemplate } from "@/lib/types";
import { saveRecoveryTemplate } from "@/app/actions/campaigns";

interface CreateTemplateFormProps {
  onSuccess: (template: EmailTemplate) => void;
  onCancel: () => void;
}

// Starter boilerplate that satisfies CAN-SPAM/GDPR variables & min-length validation rules
const DEFAULT_HTML_BODY = `<p>Hi {{first_name}},</p>
<p>We noticed your payment method for <strong>{{company_name}}</strong> failed during our last renewal attempt.</p>
<p>Please update your billing details securely to avoid service interruption: <a href="{{checkout_url}}">Update Payment Method</a>.</p>
<hr />
<p style="font-size: 11px; color: #666;">Need help? Reply directly to this email or reach out to {{support_email}}.</p>`;

export function CreateTemplateForm({ onSuccess, onCancel }: CreateTemplateFormProps) {
  const { toast } = useToast();

  const [isCreating, setIsCreating] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");
  const [newTemplateSubject, setNewTemplateSubject] = useState("");
  const [bodyHtml, setBodyHtml] = useState(DEFAULT_HTML_BODY);

  // Pre-trim variables once for clean reuse across validation and submission
  const name = newTemplateName.trim();
  const subject = newTemplateSubject.trim();
  const html = bodyHtml.trim();

  // Unified trimmed validation matching server requirements
  const isValid = name.length >= 2 && subject.length >= 5 && html.length >= 20;

  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!isValid) {
      toast({
        title: "Validation Error",
        description: "Please check that name (min 2 chars), subject (min 5 chars), and HTML body (min 20 chars) are valid.",
        variant: "destructive",
      });
      return;
    }

    setIsCreating(true);

    try {
      // 1. Invoke authoritative Server Action
      // Note: Using schema-satisfying zero UUID while server schema requires UUID format.
      // Server auth boundary safely derives and overrides this with the authenticated session tenant_id.
      const result = await saveRecoveryTemplate({
        tenant_id: "00000000-0000-0000-0000-000000000000",
        name,
        subject,
        type: "recovery",
        body_html: html,
        body_text: undefined, // Omitted cleanly; server auto-derives plain text from HTML
        is_active: true,
      });

      if (!result.success || !result.template) {
        throw new Error("Server failed to return persisted template data.");
      }

      toast({
        title: "Template Saved",
        description: `"${result.template.name}" is now saved to your workspace database.`,
      });

      // 2. Explicitly map server record to client type to avoid unsafe double casting
      const returnedTemplate: EmailTemplate = {
        id: result.template.id,
        name: result.template.name,
        subject: result.template.subject,
        type: result.template.type as EmailTemplate["type"],
      };

      onSuccess(returnedTemplate);
    } catch (error: unknown) {
      toast({
        title: "Creation Failed",
        description: error instanceof Error ? error.message : "A database error prevented saving the template.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <form onSubmit={handleCreateTemplate} className="font-sans">
      <div className="px-5 py-5 space-y-4 bg-white max-h-[70vh] overflow-y-auto">
        
        <div className="space-y-1.5">
          <Label htmlFor="tpl-name" className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
            Template Name
          </Label>
          <Input
            id="tpl-name"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
            placeholder="e.g. High Risk Dunning - Day 3"
            disabled={isCreating}
            className="h-9 text-[13px] bg-[#FAFAFA] border-black/[0.08] shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-blue-500/50"
            autoFocus
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="tpl-subj" className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
            Email Subject Line
          </Label>
          <Input
            id="tpl-subj"
            value={newTemplateSubject}
            onChange={(e) => setNewTemplateSubject(e.target.value)}
            placeholder="e.g. Action Required: {{company_name}} Subscription Paused"
            disabled={isCreating}
            className="h-9 text-[13px] bg-[#FAFAFA] border-black/[0.08] shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-blue-500/50"
            required
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="tpl-body" className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500 flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5" /> HTML Body Content
            </Label>
            <span className="text-[10px] text-slate-400 font-mono">Supports {"{{company_name}}"}</span>
          </div>
          <Textarea
            id="tpl-body"
            value={bodyHtml}
            onChange={(e) => setBodyHtml(e.target.value)}
            rows={6}
            disabled={isCreating}
            className="text-[12px] font-mono bg-[#FAFAFA] border-black/[0.08] shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-blue-500/50 leading-relaxed"
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
          disabled={isCreating || !isValid}
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
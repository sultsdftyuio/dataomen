"use client";

import React, { useState, useMemo } from "react";
import { RefreshCw, Code, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { EmailTemplate } from "@/lib/types";
import { saveRecoveryTemplate } from "@/app/actions/campaigns";
import { useTemplatePreview } from "@/app/(dashboard)/dashboard/campaigns/templates/use-template-preview";
import { type TemplateDefinition } from "@/app/(dashboard)/dashboard/campaigns/templates/security";

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

  // ── Live Preview: map form state -> TemplateDefinition ──
  const draftTemplate = useMemo<TemplateDefinition | undefined>(() => {
    if (!isValid) return undefined;
    return {
      id: "draft",
      name: name || "Draft",
      subject,
      rawHtml: html,
      trigger: "manual",
      cooldownDays: 0,
    } as TemplateDefinition;
  }, [name, subject, html, isValid]);

  const {
    sanitizedHtml,
    hydratedSubject,
    missingVariables,
    renderError,
  } = useTemplatePreview({
    selectedTemplateKey: "",
    customTemplate: draftTemplate,
  });

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
      // Clean contract: tenant_id omitted cleanly; server enforces boundary via session auth.
      // body_text omitted cleanly; server auto-derives plain text from HTML.
      const result = await saveRecoveryTemplate({
        name,
        subject,
        type: "recovery",
        body_html: html,
        body_text: undefined,
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
    <form onSubmit={handleCreateTemplate} aria-busy={isCreating} className="font-sans">
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

        {/* ── Live Preview Panel ── */}
        {isValid && draftTemplate && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500 flex items-center gap-1.5">
                <Eye className="w-3.5 h-3.5" /> Live Preview
              </Label>
              {missingVariables.length > 0 && (
                <span className="text-[10px] text-amber-600 font-medium">
                  Missing: {missingVariables.join(", ")}
                </span>
              )}
            </div>

            {renderError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md text-[12px] text-red-700">
                <strong>Render Error:</strong> {renderError}
              </div>
            )}

            <div className="p-3 bg-[#FAFAFA] border border-black/[0.08] rounded-md space-y-2">
              <div className="text-[12px] font-semibold text-slate-700 pb-2 border-b border-black/[0.06]">
                Subject: {hydratedSubject}
              </div>
              <div
                className="text-[12px] leading-relaxed"
                dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
              />
            </div>
          </div>
        )}
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
          aria-busy={isCreating}
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
"use client";

import React, { useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CheckCircle2,
  Code,
  Eye,
  Library,
  PenLine,
  RefreshCw,
} from "lucide-react";
import { useForm } from "react-hook-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { EmailTemplate } from "@/lib/types";
import {
  TemplateSaveSchema,
  type TemplateSaveInput,
  type TemplateType,
} from "@/lib/schemas/template";
import { saveRecoveryTemplate } from "@/app/actions/campaigns";
import {
  TEMPLATE_CATALOG,
  TEMPLATE_CATALOG_ENTRIES,
  type RecoveryTemplate,
  type TemplateKey,
} from "@/app/(dashboard)/dashboard/campaigns/templates/template-catalog";
import {
  useTemplatePreview,
  type WorkspaceSettings,
} from "@/app/(dashboard)/dashboard/campaigns/templates/use-template-preview";
import { type TemplateDefinition } from "@/app/(dashboard)/dashboard/campaigns/templates/security";

interface CreateTemplateFormProps {
  onSuccess: (template: EmailTemplate) => void;
  onCancel: () => void;
  settings?: WorkspaceSettings;
}

type AuthorMode = "preset" | "custom";

const DEFAULT_HTML_BODY = `<p>Hi {{first_name}},</p>
<p>We noticed your <strong>{{company_name}}</strong> workspace needs attention.</p>
<p>Please sign in to your workspace and review your billing details to keep service active.</p>
<hr />
<p>Need help? Reply directly to this email and our team will help.</p>`;

const DEFAULT_VALUES: TemplateSaveInput = {
  name: "",
  subject: "",
  campaign_type: "recovery",
  body_html: DEFAULT_HTML_BODY,
  is_active: true,
};

export function CreateTemplateForm({
  onSuccess,
  onCancel,
  settings,
}: CreateTemplateFormProps) {
  const { toast } = useToast();
  const [authorMode, setAuthorMode] = useState<AuthorMode>("preset");
  const [selectedPresetKey, setSelectedPresetKey] =
    useState<TemplateKey | null>(null);

  const form = useForm<TemplateSaveInput>({
    resolver: zodResolver(TemplateSaveSchema),
    mode: "onChange",
    defaultValues: DEFAULT_VALUES,
  });

  const {
    control,
    formState: { errors, isSubmitting, isValid },
    handleSubmit,
    register,
    setValue,
    watch,
  } = form;

  const watchedName = watch("name") ?? "";
  const watchedSubject = watch("subject") ?? "";
  const watchedBodyHtml = watch("body_html") ?? "";
  const watchedCampaignType = watch("campaign_type") ?? watch("type") ?? "recovery";

  const draftTemplate = useMemo<TemplateDefinition>(
    () => ({
      catalogKey: selectedPresetKey ?? undefined,
      name: watchedName.trim() || "Untitled Recovery Template",
      subject: watchedSubject,
      rawHtml: watchedBodyHtml,
      trigger: "manual",
      cooldownDays: 0,
      campaignType: watchedCampaignType as TemplateType,
    }),
    [
      selectedPresetKey,
      watchedBodyHtml,
      watchedCampaignType,
      watchedName,
      watchedSubject,
    ]
  );

  const {
    sanitizedHtml,
    hydratedSubject,
    missingVariables,
    renderError,
    fromEmail,
    recipientEmail,
    recipientName,
    unsupportedVariables,
  } = useTemplatePreview({
    selectedTemplateKey: selectedPresetKey ?? "",
    settings,
    customTemplate: draftTemplate,
  });

  const canSave = isValid && !renderError && !isSubmitting;

  const applyPreset = (key: TemplateKey) => {
    const preset = TEMPLATE_CATALOG[key];
    setSelectedPresetKey(key);
    setValue("name", preset.name, { shouldDirty: true, shouldValidate: true });
    setValue("subject", preset.subject, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("body_html", preset.rawHtml, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue("campaign_type", preset.campaignType, {
      shouldDirty: true,
      shouldValidate: true,
    });
  };

  const onSubmit = async (values: TemplateSaveInput) => {
    if (renderError) {
      toast({
        title: "Preview Error",
        description: renderError,
        variant: "destructive",
      });
      return;
    }

    const result = await saveRecoveryTemplate({
      ...values,
      campaign_type: values.campaign_type ?? values.type ?? "recovery",
      is_active: values.is_active ?? true,
    });

    if (!result.success) {
      toast({
        title: "Creation Failed",
        description: result.error,
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Template Saved",
      description: `"${result.template.name}" is ready for this workspace.`,
    });

    onSuccess({
      id: result.template.id,
      name: result.template.name,
      subject: result.template.subject,
      type: result.template.type,
      campaign_type: result.template.campaign_type,
      body_html: result.template.body_html,
      body_text: result.template.body_text,
      is_active: result.template.is_active,
    });
  };

  return (
    <Form {...form}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        aria-busy={isSubmitting}
        className="font-sans"
      >
        <input type="hidden" {...register("campaign_type")} />

        <div className="max-h-[76vh] overflow-y-auto bg-white px-5 py-5">
          <Tabs
            value={authorMode}
            onValueChange={(value) => setAuthorMode(value as AuthorMode)}
            className="mb-5"
          >
            <TabsList className="grid h-9 w-full grid-cols-2 rounded-lg bg-slate-100 p-1">
              <TabsTrigger
                value="preset"
                className="h-7 gap-1.5 rounded-md text-[12px] font-bold"
              >
                <Library className="h-3.5 w-3.5" />
                Choose Preset
              </TabsTrigger>
              <TabsTrigger
                value="custom"
                className="h-7 gap-1.5 rounded-md text-[12px] font-bold"
              >
                <PenLine className="h-3.5 w-3.5" />
                Write Custom
              </TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]">
            <div className="min-w-0 space-y-4">
              {authorMode === "preset" && (
                <PresetPicker
                  selectedPresetKey={selectedPresetKey}
                  onSelect={applyPreset}
                />
              )}

              <FormField
                control={control}
                name="name"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
                      Template Name
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="High Risk Dunning - Day 3"
                        disabled={isSubmitting}
                        autoFocus
                        className="h-9 bg-[#FAFAFA] text-[13px] shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-blue-500/50"
                      />
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="subject"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <FormLabel className="text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
                      Email Subject Line
                    </FormLabel>
                    <FormControl>
                      <Input
                        {...field}
                        placeholder="Action required for {{company_name}}"
                        disabled={isSubmitting}
                        className="h-9 bg-[#FAFAFA] text-[13px] shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-blue-500/50"
                      />
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              <FormField
                control={control}
                name="body_html"
                render={({ field }) => (
                  <FormItem className="space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <FormLabel className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
                        <Code className="h-3.5 w-3.5" />
                        HTML Body Content
                      </FormLabel>
                      <VariableBadges />
                    </div>
                    <FormControl>
                      <Textarea
                        {...field}
                        rows={14}
                        disabled={isSubmitting}
                        className="min-h-[320px] resize-y bg-[#FAFAFA] font-mono text-[12px] leading-relaxed shadow-none focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-blue-500/50"
                      />
                    </FormControl>
                    <FormMessage className="text-[11px]" />
                  </FormItem>
                )}
              />

              {errors.root?.message && (
                <p className="text-[12px] font-medium text-red-600">
                  {errors.root.message}
                </p>
              )}
            </div>

            <EmailClientPreview
              fromEmail={fromEmail}
              hydratedSubject={hydratedSubject}
              missingVariables={missingVariables}
              recipientEmail={recipientEmail}
              recipientName={recipientName}
              renderError={renderError}
              sanitizedHtml={sanitizedHtml}
              unsupportedVariables={unsupportedVariables}
            />
          </div>
        </div>

        <DialogFooter className="border-t border-black/[0.08] bg-[#FAFAFA] px-5 py-3.5">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={isSubmitting}
            className="h-8 border border-black/[0.08] bg-white px-4 text-[13px] font-semibold text-slate-600 shadow-none hover:bg-slate-50"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={!canSave}
            aria-busy={isSubmitting}
            className="h-8 min-w-[132px] bg-[#0B1120] px-4 text-[13px] font-bold text-white shadow-[0_2px_4px_rgba(0,0,0,0.12)] transition-all hover:bg-slate-800"
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                Saving...
              </>
            ) : (
              "Save Template"
            )}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

function PresetPicker({
  selectedPresetKey,
  onSelect,
}: {
  selectedPresetKey: TemplateKey | null;
  onSelect: (key: TemplateKey) => void;
}) {
  return (
    <div className="grid gap-2">
      {TEMPLATE_CATALOG_ENTRIES.map(([key, preset]) => (
        <PresetCard
          key={key}
          presetKey={key}
          preset={preset}
          isSelected={selectedPresetKey === key}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

function PresetCard({
  presetKey,
  preset,
  isSelected,
  onSelect,
}: {
  presetKey: TemplateKey;
  preset: RecoveryTemplate<TemplateKey>;
  isSelected: boolean;
  onSelect: (key: TemplateKey) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(presetKey)}
      className={`w-full rounded-lg border p-3 text-left transition ${
        isSelected
          ? "border-blue-500 bg-blue-50"
          : "border-black/[0.08] bg-white hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-bold text-slate-950">
            {preset.name}
          </div>
          <p className="mt-1 text-[12px] leading-5 text-slate-500">
            {preset.description}
          </p>
        </div>
        {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0 text-blue-600" />}
      </div>
      <div className="mt-2 truncate rounded-md bg-slate-50 px-2 py-1.5 font-mono text-[11px] text-slate-500">
        {preset.subject}
      </div>
    </button>
  );
}

function VariableBadges() {
  return (
    <div className="hidden flex-wrap justify-end gap-1 sm:flex">
      {["{{first_name}}", "{{company_name}}"].map((variable) => (
        <Badge
          key={variable}
          variant="outline"
          className="rounded-md bg-white px-1.5 py-0 text-[10px] font-mono text-slate-500"
        >
          {variable}
        </Badge>
      ))}
    </div>
  );
}

function EmailClientPreview({
  fromEmail,
  hydratedSubject,
  missingVariables,
  recipientEmail,
  recipientName,
  renderError,
  sanitizedHtml,
  unsupportedVariables,
}: {
  fromEmail: string;
  hydratedSubject: string;
  missingVariables: string[];
  recipientEmail: string;
  recipientName: string;
  renderError: string | null;
  sanitizedHtml: string;
  unsupportedVariables: string[];
}) {
  return (
    <aside className="min-w-0 space-y-3 lg:sticky lg:top-0 lg:self-start">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-slate-500">
          <Eye className="h-3.5 w-3.5" />
          Live Preview
        </div>
        <Badge variant="secondary" className="rounded-md bg-slate-100 text-[10px] text-slate-600">
          Debounced
        </Badge>
      </div>

      {(renderError || missingVariables.length > 0) && (
        <div className="space-y-2">
          {renderError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
              <strong>Render Error:</strong> {renderError}
            </div>
          )}
          {missingVariables.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-[12px] text-amber-700">
              <strong>Missing variables:</strong> {missingVariables.join(", ")}
            </div>
          )}
          {unsupportedVariables.length > 0 && !renderError && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-[12px] text-red-700">
              <strong>Unsupported variables:</strong> {unsupportedVariables.join(", ")}
            </div>
          )}
        </div>
      )}

      <div className="overflow-hidden rounded-lg border border-black/[0.08] bg-slate-50 shadow-[0_1px_3px_rgba(10,22,40,0.04)]">
        <div className="flex h-9 items-center justify-between border-b border-black/[0.08] bg-slate-100 px-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
          </div>
          <span className="text-[11px] font-bold text-slate-500">Inbox</span>
        </div>

        <div className="space-y-2 border-b border-black/[0.08] bg-white p-3 text-[12px] text-slate-600">
          <PreviewHeaderRow label="From" value={fromEmail} />
          <PreviewHeaderRow
            label="To"
            value={`${recipientName} <${recipientEmail}>`}
          />
          <PreviewHeaderRow label="Subject" value={hydratedSubject || "No subject"} />
        </div>

        <div className="p-3 sm:p-4">
          <div
            className="mx-auto min-h-[300px] max-w-[520px] rounded-lg border border-black/[0.08] bg-white p-5 text-[14px] leading-7 text-slate-900 shadow-sm"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        </div>
      </div>
    </aside>
  );
}

function PreviewHeaderRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-2">
      <span className="font-bold text-slate-900">{label}:</span>
      <span className="min-w-0 truncate">{value}</span>
    </div>
  );
}

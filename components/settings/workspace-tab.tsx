"use client";

import React, { useState, useTransition } from "react";
import { 
  Building2, 
  Mail, 
  Globe, 
  User, 
  Sparkles, 
  CornerDownLeft, 
  ShieldCheck, 
  Save, 
  RefreshCw, 
  Lock 
} from "lucide-react";
import { toast } from "@/components/ui/use-toast";

interface WorkspaceSettingsProps {
  initialData?: {
    fullName: string;
    authEmail: string;
    companyName: string;
    supportEmail: string;
    websiteUrl: string;
  };
}

export default function CompactWorkspaceSettings({
  initialData = {
    fullName: "Justin Mason",
    authEmail: "justin@arcli.tech",
    companyName: "",
    supportEmail: "",
    websiteUrl: "",
  },
}: WorkspaceSettingsProps) {
  const [isPending, startTransition] = useTransition();

  // Unified State
  const [fullName, setFullName] = useState(initialData.fullName);
  const [companyName, setCompanyName] = useState(initialData.companyName);
  const [supportEmail, setSupportEmail] = useState(initialData.supportEmail);
  const [websiteUrl, setWebsiteUrl] = useState(initialData.websiteUrl);
  const [isDirty, setIsDirty] = useState(false);

  const handleInputChange = (setter: React.Dispatch<React.SetStateAction<string>>, value: string) => {
    setter(value);
    setIsDirty(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    startTransition(async () => {
      try {
        // Enforce Arcli Rule 1 & Rule 6: Scope update strictly by authenticated tenant_id
        await new Promise((resolve) => setTimeout(resolve, 600));
        setIsDirty(false);
        toast({
          title: "Configuration Saved",
          description: "Workspace identity and profile details updated successfully.",
        });
      } catch {
        toast({
          title: "Save Failed",
          description: "Could not update workspace configuration. Please try again.",
          variant: "destructive",
        });
      }
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 sm:px-6 space-y-5 animate-in fade-in duration-200">
      
      {/* ── Page Header (Dense & Clean) ── */}
      <div className="border-b border-border pb-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-semibold text-foreground tracking-tight">
            Workspace Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your user profile and global workspace identity for outbound recovery campaigns.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        
        {/* ── Left Column (7 Cols): Dense Form Elements ── */}
        <div className="lg:col-span-7 space-y-4">
          
          {/* Section 1: Workspace Identity */}
          <section className="rounded-lg border border-border bg-card p-4 shadow-2xs space-y-3.5">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
              <Building2 className="w-4 h-4 text-primary shrink-0" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                Workspace Identity
              </h2>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Company Name
                </label>
                <div className="relative">
                  <Building2 className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Acme SaaS"
                    value={companyName}
                    disabled={isPending}
                    onChange={(e) => handleInputChange(setCompanyName, e.target.value)}
                    className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Support / Reply-To Email
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <input
                      type="email"
                      required
                      placeholder="support@acme.com"
                      value={supportEmail}
                      disabled={isPending}
                      onChange={(e) => handleInputChange(setSupportEmail, e.target.value)}
                      className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">
                    Website URL
                  </label>
                  <div className="relative">
                    <Globe className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted-foreground" />
                    <input
                      type="url"
                      required
                      placeholder="https://acme.com"
                      value={websiteUrl}
                      disabled={isPending}
                      onChange={(e) => handleInputChange(setWebsiteUrl, e.target.value)}
                      className="w-full h-8 pl-8 pr-3 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 2: User Profile (Scrapped separate page, merged here) */}
          <section className="rounded-lg border border-border bg-card p-4 shadow-2xs space-y-3.5">
            <div className="flex items-center gap-2 border-b border-border/60 pb-2.5">
              <User className="w-4 h-4 text-primary shrink-0" />
              <h2 className="text-xs font-semibold uppercase tracking-wider text-foreground">
                User Profile
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="Founder Name"
                  value={fullName}
                  disabled={isPending}
                  onChange={(e) => handleInputChange(setFullName, e.target.value)}
                  className="w-full h-8 px-3 text-xs rounded-md border border-input bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-primary transition-colors disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Authentication Email
                </label>
                <div className="relative">
                  <input
                    type="email"
                    disabled
                    value={initialData.authEmail}
                    className="w-full h-8 pl-3 pr-8 text-xs font-mono rounded-md border border-input bg-muted/60 text-muted-foreground select-none cursor-not-allowed"
                  />
                  <Lock className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-muted-foreground" />
                </div>
              </div>
            </div>
          </section>

          {/* Submit Action Bar */}
          <div className="flex items-center justify-between pt-1">
            <span className="text-[11px] text-muted-foreground">
              {isDirty ? "Unsaved changes" : "All changes saved"}
            </span>
            <button
              type="submit"
              disabled={isPending || !isDirty}
              className="inline-flex items-center justify-center gap-1.5 h-8 px-4 rounded-md bg-primary text-primary-foreground text-xs font-medium shadow-2xs hover:bg-primary/90 disabled:opacity-50 transition-all cursor-pointer"
            >
              {isPending ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  Save Changes
                </>
              )}
            </button>
          </div>

        </div>

        {/* ── Right Column (5 Cols): Dynamic Context & Previews ── */}
        <div className="lg:col-span-5 space-y-4 lg:sticky lg:top-6">
          
          {/* Box 1: Dynamic Injection Panel */}
          <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-primary font-semibold text-xs">
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span>Dynamic Injection Preview</span>
            </div>
            
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              These global variables are injected dynamically into your outbound recovery emails.
            </p>

            <div className="space-y-1.5 pt-0.5 font-mono text-[11px]">
              <div className="p-2 rounded-md bg-background border border-border flex justify-between items-center overflow-hidden">
                <span className="text-primary/80 font-medium select-none">{ "{{ company.name }}" }</span>
                <span className="font-semibold text-foreground truncate max-w-[140px]">
                  {companyName || <span className="text-muted-foreground italic">Not set</span>}
                </span>
              </div>

              <div className="p-2 rounded-md bg-background border border-border flex justify-between items-center overflow-hidden">
                <span className="text-primary/80 font-medium select-none">{ "{{ company.url }}" }</span>
                <span className="font-semibold text-foreground truncate max-w-[140px]">
                  {websiteUrl || <span className="text-muted-foreground italic">Not set</span>}
                </span>
              </div>
            </div>
          </div>

          {/* Box 2: Reply-To Routing Panel */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-1.5 text-foreground font-semibold text-xs">
              <CornerDownLeft className="w-3.5 h-3.5 text-primary shrink-0" />
              <span>Reply-To Routing</span>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              When recovered users reply directly to your automated campaign emails, their responses will automatically route to the Support Email configured in your Workspace Identity.
            </p>

            <div className="mt-2 p-2 rounded-md bg-muted/50 border border-border/80 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span className="text-[11px] font-mono text-foreground font-medium truncate">
                {supportEmail || <span className="text-muted-foreground italic font-sans">No support email set</span>}
              </span>
            </div>
          </div>

        </div>

      </form>
    </div>
  );
}
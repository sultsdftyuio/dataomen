"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Mail,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Save,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CreateTemplateModal } from "./create-template-modal";
import { TargetUsersTable } from "./target-users-table";
import { useCampaigns } from "@/hooks/use-campaigns";
import { type CampaignsClientProps } from "@/lib/types";

// Design tokens mapped from the DeepDiveFeatures snippet
const surfaceBorder = "border border-black/[0.08]";
const surfaceShadow = "shadow-[0_1px_3px_rgba(0,0,0,0.08)]";

export default function CampaignsClient({
  atRiskUsers,
  emailTemplates,
  initialSenderEmail,
}: CampaignsClientProps) {
  const router = useRouter();
  const {
    senderEmail,
    selectedTemplate,
    selectedUsers,
    isSending,
    senderInput,
    isSavingSender,
    sortedAtRiskUsers,
    allSelected,
    activeTemplate,
    setSelectedTemplate,
    setSenderInput,
    handleSaveSenderEmail,
    onNewTemplateCreated,
    toggleUser,
    toggleAll,
    handleSendCampaign,
  } = useCampaigns({
    atRiskUsers,
    emailTemplates,
    initialSenderEmail,
  });

  return (
    <div className="flex flex-col h-full w-full max-w-[1240px] mx-auto space-y-6 pb-12 animate-in fade-in duration-300 relative font-sans text-[13px]">
      
      {/* Header Container */}
      <div className="flex items-center justify-between">
        <div>
          <div className="inline-flex items-center gap-2 text-blue-600 font-bold text-[12px] mb-2 tracking-[0.08em] uppercase">
            <AlertTriangle size={14} /> Immediate Recovery
          </div>
          <h1 className="text-[28px] font-semibold tracking-[-0.015em] text-[#0B1120] leading-tight">
            Campaign Dispatch
          </h1>
        </div>

        {/* Guardrail: Only allow template creation if a sender email exists */}
        {senderEmail ? (
          <CreateTemplateModal onTemplateCreated={onNewTemplateCreated} />
        ) : (
          <Button 
            disabled 
            variant="outline" 
            className={`opacity-50 cursor-not-allowed h-9 px-4 text-[13px] bg-[#FAFAFA] text-slate-500 font-semibold rounded-lg ${surfaceBorder} shadow-none`}
          >
            <Mail className="h-3.5 w-3.5 mr-2" />
            Create Template
          </Button>
        )}
      </div>

      {/* --- Campaign Blocker Alert --- */}
      {!senderEmail && (
        <div className={`flex flex-col gap-3 p-4 bg-red-50/50 border border-red-200/60 rounded-lg ${surfaceShadow}`}>
          <div className="flex items-center gap-2 text-[14px] font-semibold text-red-800">
            <AlertCircle className="h-4 w-4 text-red-600" />
            Sender Configuration Required
          </div>
          <p className="text-[13px] text-red-700 leading-relaxed max-w-3xl">
            You cannot create or execute recovery campaigns until you configure
            a verified sender email address. This protects your domain
            reputation and prevents spam failures.
          </p>
          <div className="mt-1 flex items-center gap-3 max-w-md">
            <Input
              placeholder="e.g., Arcli Recovery <recovery@yourdomain.com>"
              value={senderInput}
              onChange={(e) => setSenderInput(e.target.value)}
              className="bg-white border-red-200 h-9 text-[13px] focus-visible:ring-red-500/20"
            />
            <Button
              onClick={handleSaveSenderEmail}
              disabled={
                isSavingSender ||
                !senderInput.trim() ||
                senderInput.trim() === senderEmail
              }
              className={`h-9 px-4 bg-red-600 hover:bg-red-700 text-white font-bold text-[13px] rounded-lg ${surfaceShadow}`}
            >
              {isSavingSender ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-2" />
              )}
              {isSavingSender ? "Saving..." : "Save"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left Column: Email Templates */}
        <div className="lg:col-span-1 space-y-3">
          <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.05em] flex items-center justify-between">
            1. Select Template
          </h2>

          {emailTemplates.length === 0 ? (
            <div className={`text-[13px] text-slate-500 border border-dashed rounded-lg p-6 text-center bg-[#FAFAFA] border-black/[0.08]`}>
              No templates found. <br />
              {senderEmail ? (
                <span className="text-blue-600 font-semibold cursor-pointer mt-1 block hover:underline">
                  Create one now
                </span>
              ) : (
                <span className="text-slate-400 mt-1 block">
                  Configure sender to unlock.
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {emailTemplates.map((tpl) => {
                const isSelected = selectedTemplate === tpl.id;
                const isDisabled = !senderEmail;

                return (
                  <div
                    key={tpl.id}
                    role={isDisabled ? "presentation" : "button"}
                    tabIndex={isDisabled ? -1 : 0}
                    onKeyDown={(e) => {
                      if (isDisabled) return;
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedTemplate(tpl.id);
                      }
                    }}
                    className={`transition-all rounded-lg p-3 outline-none
                      ${isDisabled ? `opacity-50 cursor-not-allowed bg-[#FAFAFA] ${surfaceBorder}` : "cursor-pointer"}
                      ${
                        isSelected && !isDisabled
                          ? "bg-blue-50/40 border border-blue-500 ring-1 ring-blue-500"
                          : `bg-white hover:border-blue-300 ${surfaceBorder} ${surfaceShadow}`
                      }
                    `}
                    onClick={() => {
                      if (!isDisabled) setSelectedTemplate(tpl.id);
                    }}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-2.5">
                        <div className={`p-1.5 rounded-md ${isSelected ? "bg-blue-100/50" : "bg-[#FAFAFA] border border-black/[0.04]"}`}>
                          <Mail className={`h-3.5 w-3.5 ${isSelected ? "text-blue-600" : "text-slate-500"}`} />
                        </div>
                        <h3 className={`text-[13px] font-semibold ${isSelected ? "text-blue-900" : "text-[#0B1120]"}`}>
                          {tpl.name}
                        </h3>
                      </div>
                      {isSelected && !isDisabled && (
                        <CheckCircle2 className="h-4 w-4 text-blue-600" />
                      )}
                    </div>
                    <div className="text-[11px] mt-2.5 truncate font-mono text-slate-500 bg-[#FAFAFA] p-1.5 rounded border border-black/[0.04]">
                      {tpl.subject}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Target Users (Extracted component will be restyled next) */}
        <TargetUsersTable
          sortedAtRiskUsers={sortedAtRiskUsers}
          selectedUsers={selectedUsers}
          allSelected={allSelected}
          senderEmail={senderEmail}
          toggleUser={toggleUser}
          toggleAll={toggleAll}
        />
      </div>

      {/* Action Footer */}
      <div className={`mt-6 sticky bottom-0 z-10 flex justify-between items-center p-4 bg-white/95 backdrop-blur-md rounded-lg ${surfaceBorder} ${surfaceShadow}`}>
        <div className="text-[12px] font-semibold text-slate-600 flex items-center gap-2.5">
          {!senderEmail ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              <span className="text-red-700">Action Required: Set up sender email to unlock dispatch.</span>
            </>
          ) : activeTemplate ? (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>
                Queueing <strong className="text-[#0B1120]">{activeTemplate.name}</strong> for{" "}
                <strong className="text-[#0B1120]">{selectedUsers.size}</strong> operators.
              </span>
            </>
          ) : (
            <>
              <div className="w-1.5 h-1.5 rounded-full bg-slate-300" />
              <span>Awaiting template selection.</span>
            </>
          )}
        </div>
        <Button
          disabled={!senderEmail || !selectedTemplate || selectedUsers.size === 0 || isSending}
          onClick={handleSendCampaign}
          className={`h-9 px-5 rounded-lg text-[13px] font-bold tracking-wide transition-all ${
            !senderEmail || selectedUsers.size === 0 || !selectedTemplate
              ? "bg-[#FAFAFA] text-slate-400 border border-black/[0.08] shadow-none"
              : "bg-[#0B1120] hover:bg-slate-800 text-white shadow-[0_2px_4px_rgba(0,0,0,0.12)]"
          }`}
        >
          {isSending ? (
            <><RefreshCw className="h-3.5 w-3.5 mr-2 animate-spin" /> Orchestrating...</>
          ) : (
            <><Send className="h-3.5 w-3.5 mr-2" /> Execute Campaign</>
          )}
        </Button>
      </div>
    </div>
  );
}
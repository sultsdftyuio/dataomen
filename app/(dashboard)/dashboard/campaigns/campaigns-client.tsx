"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  Send,
  Mail,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Save,
  ShieldAlert,
  Workflow,
  Activity,
  Zap
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { CreateTemplateModal } from "./create-template-modal";
import { useCampaigns } from "@/hooks/use-campaigns";
import {
  type CampaignsClientProps,
  getRiskBadgeProps,
} from "@/lib/types";

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

  // Reusable strict border/shadow styles mimicking the DeepDiveFeatures aesthetic
  const surfaceBorder = "border border-black/5";
  const surfaceShadow = "shadow-[0_1px_3px_rgba(0,0,0,0.08)]";

  return (
    <div className="flex flex-col h-full space-y-10 pb-12 animate-in fade-in duration-300 font-sans">
      
      {/* Header Container */}
      <div className="flex items-start justify-between">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 text-blue-600 font-bold text-xs mb-3 tracking-[0.08em] uppercase">
            <Workflow size={14} /> Recovery Pipeline
          </div>
          <h1 className="text-[32px] md:text-[42px] font-semibold text-[#0B1120] leading-[1.06] tracking-[-0.015em]">
            Automate churn recovery.
          </h1>
          <p className="text-slate-600 text-[17px] leading-[1.62] mt-4">
            Route at-risk accounts into idempotent recovery flows. Select a deterministic template and execute targeted interventions to win back MRR.
          </p>
        </div>

        {/* Guardrail: Only allow template creation if a sender email exists */}
        <div className="mt-2">
          {senderEmail ? (
            <CreateTemplateModal onTemplateCreated={onNewTemplateCreated} />
          ) : (
            <Button disabled variant="outline" className={`opacity-50 cursor-not-allowed ${surfaceBorder} ${surfaceShadow}`}>
              <Mail className="h-4 w-4 mr-2" />
              Configure Template
            </Button>
          )}
        </div>
      </div>

      {/* --- Campaign Blocker Alert --- */}
      {!senderEmail && (
        <div className={`bg-[#FAFAFA] rounded-lg p-6 relative overflow-hidden ${surfaceBorder} ${surfaceShadow}`}>
          <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
          <div className="flex items-center gap-2 mb-3">
            <ShieldAlert className="h-4 w-4 text-red-600" />
            <span className="text-xs font-bold text-red-600 tracking-[0.08em] uppercase">System Safety Lock</span>
          </div>
          <h3 className="text-lg font-semibold text-[#0B1120] mb-2">Sender Identity Required</h3>
          <p className="text-[15px] text-slate-600 mb-5 max-w-3xl">
            You cannot initialize recovery workflows until a verified sender email is configured. This strictly protects your domain reputation and prevents pipeline failures.
          </p>

          <div className="flex items-center gap-3 max-w-md">
            <Input
              placeholder="e.g., Arcli Recovery <recovery@yourdomain.com>"
              value={senderInput}
              onChange={(e) => setSenderInput(e.target.value)}
              className={`bg-white focus-visible:ring-blue-600 ${surfaceBorder}`}
            />
            <Button
              onClick={handleSaveSenderEmail}
              disabled={
                isSavingSender ||
                !senderInput.trim() ||
                senderInput.trim() === senderEmail
              }
              className="bg-blue-600 hover:bg-blue-700 text-white font-semibold tracking-wide shadow-sm"
            >
              {isSavingSender ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {isSavingSender ? "Saving..." : "Verify Identity"}
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Email Templates */}
        <div className="lg:col-span-1 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em]">
              1. Template Configuration
            </h2>
          </div>

          {emailTemplates.length === 0 ? (
            <div className={`text-sm text-slate-500 rounded-lg p-8 text-center bg-[#FAFAFA] ${surfaceBorder}`}>
              No deterministic templates found. <br />
              {senderEmail ? (
                <span className="text-blue-600 font-semibold mt-2 block">Configure a new template to begin.</span>
              ) : (
                <span className="text-slate-400 mt-2 block">
                  Verify sender identity to unlock configuration.
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {emailTemplates.map((tpl) => {
                const isSelected = selectedTemplate === tpl.id;
                const isDisabled = !senderEmail;

                return (
                  <Card
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
                    className={`transition-all outline-none p-4 ${surfaceShadow}
                      ${
                        isDisabled
                          ? "opacity-50 cursor-not-allowed bg-slate-50 border-black/5"
                          : "cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600"
                      }
                      ${
                        isSelected && !isDisabled
                          ? "border-blue-500 bg-blue-50/20 ring-1 ring-blue-500"
                          : "border-black/5 hover:border-black/15 bg-white"
                      }
                    `}
                    onClick={() => {
                      if (!isDisabled) setSelectedTemplate(tpl.id);
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-8 h-8 rounded flex items-center justify-center ${
                            isSelected ? "bg-blue-100 text-blue-600" : "bg-[#FAFAFA] border border-black/5 text-slate-500"
                          }`}
                        >
                          <Activity size={14} />
                        </div>
                        <h3 className="text-[14px] font-semibold text-[#0B1120]">
                          {tpl.name}
                        </h3>
                      </div>
                      {isSelected && !isDisabled && (
                        <CheckCircle2 className="h-5 w-5 text-blue-600" />
                      )}
                    </div>
                    <div className="text-[12px] mt-2 truncate font-mono text-slate-500 bg-[#FAFAFA] p-2 rounded border border-black/5">
                      <span className="text-slate-400 mr-2">SUBJ:</span>{tpl.subject}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Target Users */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.08em]">
              2. Target Cohort
            </h2>
            <div className="flex gap-2 items-center">
              <span className="text-[11px] font-bold text-[#EF4444] bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.1)] px-2 py-1 rounded-md uppercase">
                {sortedAtRiskUsers.length} Thresholds Breached
              </span>
            </div>
          </div>

          <div
            className={`bg-white rounded-lg overflow-hidden transition-opacity ${surfaceBorder} ${surfaceShadow} ${
              !senderEmail ? "opacity-60 pointer-events-none" : ""
            }`}
          >
            <Table>
              <TableHeader className="bg-[#FAFAFA] border-b border-black/5">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[50px] text-center">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      disabled={
                        sortedAtRiskUsers.length === 0 || !senderEmail
                      }
                      className="border-slate-300 data-[state=checked]:bg-blue-600"
                    />
                  </TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 tracking-[0.05em] uppercase">
                    User
                  </TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 tracking-[0.05em] uppercase">
                   Risk Signal 
                  </TableHead>
                  <TableHead className="text-[11px] font-bold text-slate-500 tracking-[0.05em] uppercase">
                    Risk Score
                  </TableHead>
                  <TableHead className="text-right text-[11px] font-bold text-slate-500 tracking-[0.05em] uppercase">
                    Last Telemetry
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAtRiskUsers.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center h-32 text-slate-500 bg-white text-[14px]"
                    >
                      Zero at-risk telemetry detected.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedAtRiskUsers.map((user) => (
                    <TableRow
                      key={user.id}
                      className={`transition-colors border-b border-black/5 hover:bg-[#FAFAFA] ${
                        selectedUsers.has(user.id)
                          ? "bg-[rgba(59,154,232,0.04)]"
                          : "bg-white"
                      }`}
                    >
                      <TableCell className="text-center">
                        <Checkbox
                          checked={selectedUsers.has(user.id)}
                          onCheckedChange={() => toggleUser(user.id)}
                          disabled={!senderEmail}
                          className="border-slate-300 data-[state=checked]:bg-blue-600"
                        />
                      </TableCell>
                      <TableCell className="font-medium text-[#0B1120] text-[13px]">
                        {user.email}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 px-2 py-1.5 bg-[rgba(245,158,11,0.04)] border border-[rgba(245,158,11,0.1)] rounded w-fit">
                          <div className="w-1.5 h-1.5 rounded-full bg-[#F59E0B]" />
                          <span className="text-[12px] font-medium text-[#0B1120] font-mono">
                            {user.signal}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="font-bold text-[14px] text-[#EF4444]">
                          {user.riskScore} <span className="text-slate-400 font-normal text-[12px]">/ 100</span>
                        </span>
                      </TableCell>
                      <TableCell className="text-right text-slate-500 text-[12px]">
                        {user.lastActive}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Action Footer (Command Center Vibe) */}
      <div className={`mt-8 sticky bottom-0 z-10 flex justify-between items-center p-4 bg-[#0B1120] border border-[rgba(255,255,255,0.12)] rounded-xl ${surfaceShadow}`}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-[rgba(59,154,232,0.18)] border border-[rgba(96,165,250,0.28)] flex items-center justify-center text-blue-400">
             <Zap size={18} />
          </div>
          <div className="text-[13px] text-slate-400">
            {!senderEmail ? (
              <div className="flex items-center gap-2">
                <span className="text-[#F59E0B] font-semibold tracking-wide">SYSTEM LOCK:</span>
                <span>Sender configuration required to initialize flows.</span>
              </div>
            ) : activeTemplate ? (
              <div className="flex flex-col">
                <span className="text-white font-semibold mb-0.5">Pipeline Ready</span>
                <span>
                  Routing <strong className="text-blue-400">{selectedUsers.size} entities</strong> via <strong className="text-slate-200">{activeTemplate.name}</strong> flow.
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-slate-300 font-semibold tracking-wide">AWAITING INPUT:</span>
                <span>Select deterministic template to unlock engine.</span>
              </div>
            )}
          </div>
        </div>

        <Button
          disabled={
            !senderEmail ||
            !selectedTemplate ||
            selectedUsers.size === 0 ||
            isSending
          }
          onClick={handleSendCampaign}
          className={`${
            !senderEmail || !selectedTemplate || selectedUsers.size === 0
              ? "bg-[rgba(255,255,255,0.08)] text-slate-400 border border-[rgba(255,255,255,0.05)] hover:bg-[rgba(255,255,255,0.08)]"
              : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.4)]"
          } h-11 px-6 rounded-lg transition-all font-bold tracking-[0.02em]`}
        >
          {isSending ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Processing Pipeline...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" /> Initialize Workflow
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { CreateTemplateModal } from "./create-template-modal";
import { TargetUsersTable } from "./target-users-table";
import { useCampaigns } from "@/hooks/use-campaigns";
import { type CampaignsClientProps } from "@/lib/types";

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
    <div className="flex flex-col h-full space-y-6 pb-12 animate-in fade-in duration-300 relative">
      {/* Header Container */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Immediate Recovery
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Select an email template and dispatch it to at-risk users.
          </p>
        </div>

        {/* Guardrail: Only allow template creation if a sender email exists */}
        {senderEmail ? (
          <CreateTemplateModal onTemplateCreated={onNewTemplateCreated} />
        ) : (
          <Button disabled variant="outline" className="opacity-50 cursor-not-allowed">
            <Mail className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        )}
      </div>

      {/* --- Campaign Blocker Alert --- */}
      {!senderEmail && (
        <Alert
          variant="destructive"
          className="bg-red-50/50 border-red-200 text-red-900 shadow-sm"
        >
          <AlertCircle className="h-5 w-5 text-red-600" />
          <AlertTitle className="font-semibold text-red-800">
            Sender Configuration Required
          </AlertTitle>
          <AlertDescription className="mt-2 text-sm text-red-700">
            You cannot create or execute recovery campaigns until you configure
            a verified sender email address. This protects your domain
            reputation and prevents spam failures.

            <div className="mt-4 flex items-center space-x-3 max-w-md">
              <Input
                placeholder="e.g., Arcli Recovery <recovery@yourdomain.com>"
                value={senderInput}
                onChange={(e) => setSenderInput(e.target.value)}
                className="bg-white border-red-200 focus-visible:ring-red-500"
              />
              <Button
                onClick={handleSaveSenderEmail}
                disabled={
                  isSavingSender ||
                  !senderInput.trim() ||
                  senderInput.trim() === senderEmail
                }
                className="bg-red-600 hover:bg-red-700 text-white shadow-sm"
              >
                {isSavingSender ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                {isSavingSender ? "Saving..." : "Save Sender"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Email Templates */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider flex items-center justify-between">
            1. Select Template
          </h2>

          {emailTemplates.length === 0 ? (
            <div className="text-sm text-slate-500 border border-dashed rounded-xl p-8 text-center bg-slate-50/50">
              No templates found. <br />
              {senderEmail ? (
                <span className="text-blue-600 font-medium">Create one</span>
              ) : (
                <span className="text-slate-400">
                  Configure sender to create templates.
                </span>
              )}
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {emailTemplates.map((tpl) => {
                const isSelected = selectedTemplate === tpl.id;
                // Hard visual lock if no sender
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
                    className={`transition-all border outline-none
                      ${
                        isDisabled
                          ? "opacity-50 cursor-not-allowed bg-slate-50 border-slate-200"
                          : "cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
                      }
                      ${
                        isSelected && !isDisabled
                          ? "ring-2 ring-blue-600 border-blue-600 bg-blue-50/50"
                          : "border-slate-200 hover:border-blue-300 bg-white shadow-sm"
                      }
                    `}
                    onClick={() => {
                      if (!isDisabled) setSelectedTemplate(tpl.id);
                    }}
                  >
                    <CardHeader className="p-4">
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2.5">
                          <div
                            className={`p-1.5 rounded-md ${
                              isSelected ? "bg-blue-100" : "bg-slate-100"
                            }`}
                          >
                            <Mail
                              className={`h-4 w-4 ${
                                isSelected ? "text-blue-600" : "text-slate-600"
                              }`}
                            />
                          </div>
                          <CardTitle className="text-sm font-medium text-slate-900">
                            {tpl.name}
                          </CardTitle>
                        </div>
                        {isSelected && !isDisabled && (
                          <CheckCircle2 className="h-5 w-5 text-blue-600" />
                        )}
                      </div>
                      <CardDescription className="text-xs mt-2 truncate font-mono text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-100">
                        {tpl.subject}
                      </CardDescription>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Target Users (Extracted) */}
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
      <div className="mt-8 sticky bottom-0 z-10 flex justify-between items-center p-5 border border-slate-200 bg-white/95 backdrop-blur-sm rounded-xl shadow-md">
        <div className="text-sm text-slate-600 flex items-center gap-2">
          {!senderEmail ? (
            <>
              <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></div>
              <span className="text-red-700 font-medium">
                Action Required: Set up sender email to unlock dispatch.
              </span>
            </>
          ) : activeTemplate ? (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span>
                Template: <strong>{activeTemplate.name}</strong> queued for{" "}
                <strong>{selectedUsers.size}</strong> operators.
              </span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-slate-300"></div>
              <span>Awaiting template selection to unlock dispatch engine.</span>
            </>
          )}
        </div>
        <Button
          // Guardrail logic enforced here natively
          disabled={
            !senderEmail ||
            !selectedTemplate ||
            selectedUsers.size === 0 ||
            isSending
          }
          onClick={handleSendCampaign}
          className={`${
            !senderEmail
              ? "bg-slate-300 text-slate-500"
              : "bg-blue-600 hover:bg-blue-700 text-white"
          } min-w-[180px] shadow-sm transition-all font-medium`}
        >
          {isSending ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />{" "}
              Orchestrating...
            </>
          ) : (
            <>
              <Send className="h-4 w-4 mr-2" /> Execute Campaign
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
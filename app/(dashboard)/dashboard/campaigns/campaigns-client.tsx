"use client";

import React, { useState } from "react";
import { Send, Plus, Mail, AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";

// Define the exact shapes expected from your database
export interface RiskUser {
  id: string;
  email: string;
  riskScore: number;
  signal: string;
  lastActive: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  type: string;
}

interface CampaignsClientProps {
  atRiskUsers: RiskUser[];
  emailTemplates: EmailTemplate[];
}

export default function CampaignsClient({ atRiskUsers, emailTemplates }: CampaignsClientProps) {
  const { toast } = useToast();
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  // Toggle individual user selection
  const toggleUser = (userId: string) => {
    const newSet = new Set(selectedUsers);
    if (newSet.has(userId)) newSet.delete(userId);
    else newSet.add(userId);
    setSelectedUsers(newSet);
  };

  // Toggle all users
  const toggleAll = () => {
    if (selectedUsers.size === atRiskUsers.length) {
      setSelectedUsers(new Set());
    } else {
      setSelectedUsers(new Set(atRiskUsers.map((u) => u.id)));
    }
  };

  // Handle secure, idempotent dispatch
  const handleSendCampaign = async () => {
    if (!selectedTemplate || selectedUsers.size === 0) return;

    // 1. Map selected IDs back to the user payload required by the API
    const targets = atRiskUsers
      .filter((user) => selectedUsers.has(user.id))
      .map((user) => ({
        id: user.id,
        email: user.email,
        signal: user.signal,
        riskScore: user.riskScore,
      }));

    if (targets.length > 500) {
      toast({
        title: "Selection Limit Exceeded",
        description: "Select up to 500 users per dispatch.",
        variant: "destructive",
      });
      return;
    }

    setIsSending(true);

    // 2. Generate a unique key for this exact button click (Native Browser Crypto)
    const idempotencyKey = `req_dispatch_${crypto.randomUUID()}`;

    try {
      const response = await fetch("/api/campaigns/dispatch", {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId: selectedTemplate,
          targets: targets,
          idempotencyKey: idempotencyKey
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 400 && payload?.issues?.length) {
          const issueText = payload.issues
            .map((issue: { path: Array<string | number>; message: string }) => {
              const path = issue.path?.length ? issue.path.join(".") : "request";
              return `${path}: ${issue.message}`;
            })
            .join(" | ");

          toast({
            title: "Validation Error",
            description: issueText,
            variant: "destructive",
          });
          return;
        }

        const message = payload?.error || "Failed to queue campaign.";
        throw new Error(message);
      }

      const result = payload || {};

      const queuedCount = typeof result.queued === "number" ? result.queued : targets.length;

      // Clear selections on success
      setSelectedUsers(new Set());
      setSelectedTemplate(null);
      
      toast({
        title: "Campaign Dispatched 🚀",
        description: result.note === "deduplicated" 
          ? "Request already processed safely." 
          : `Successfully queued ${queuedCount} recovery emails.`,
      });

    } catch (error) {
      console.error("Dispatch Error:", error);
      toast({
        title: "Dispatch Failed",
        description: "An error occurred while queuing your campaign. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col h-full space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Immediate Recovery</h1>
          <p className="text-sm text-slate-500 mt-1">Select an email template and dispatch it to at-risk users.</p>
        </div>
        <Button variant="outline" className="shadow-sm">
          <Plus className="h-4 w-4 mr-2" />
          Create Template
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Email Templates */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">1. Select Template</h2>
          
          {emailTemplates.length === 0 ? (
             <div className="text-sm text-slate-500 border border-dashed rounded-lg p-6 text-center">
               No templates found. Create one first.
             </div>
          ) : (
            <div className="space-y-3">
              {emailTemplates.map((tpl) => (
                <Card 
                  key={tpl.id} 
                  className={`cursor-pointer transition-all ${selectedTemplate === tpl.id ? 'ring-2 ring-blue-600 border-transparent bg-blue-50/50' : 'hover:border-blue-300'}`}
                  onClick={() => setSelectedTemplate(tpl.id)}
                >
                  <CardHeader className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-2">
                        <Mail className={`h-4 w-4 ${selectedTemplate === tpl.id ? 'text-blue-600' : 'text-slate-400'}`} />
                        <CardTitle className="text-sm font-medium">{tpl.name}</CardTitle>
                      </div>
                      {selectedTemplate === tpl.id && <CheckCircle2 className="h-4 w-4 text-blue-600" />}
                    </div>
                    <CardDescription className="text-xs mt-1.5 truncate">
                      Subj: "{tpl.subject}"
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Right Column: Target Users */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">2. Select Target Users</h2>
            <Badge variant="secondary" className="bg-orange-100 text-orange-800 hover:bg-orange-100">
              {atRiskUsers.length} High Risk Detected
            </Badge>
          </div>
          
          <Card className="shadow-sm overflow-hidden">
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-[50px] text-center">
                    <Checkbox 
                      checked={selectedUsers.size === atRiskUsers.length && atRiskUsers.length > 0}
                      onCheckedChange={toggleAll}
                      disabled={atRiskUsers.length === 0}
                    />
                  </TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Risk Signal</TableHead>
                  <TableHead>Score</TableHead>
                  <TableHead className="text-right">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {atRiskUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-24 text-slate-500">
                      No high-risk users currently detected.
                    </TableCell>
                  </TableRow>
                ) : (
                  atRiskUsers.map((user) => (
                    <TableRow key={user.id} className={selectedUsers.has(user.id) ? "bg-blue-50/30" : ""}>
                      <TableCell className="text-center">
                        <Checkbox 
                          checked={selectedUsers.has(user.id)}
                          onCheckedChange={() => toggleUser(user.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center text-slate-600 text-sm">
                          <AlertTriangle className="h-3.5 w-3.5 text-orange-500 mr-1.5" />
                          {user.signal}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.riskScore > 90 ? "destructive" : "secondary"}>
                          {user.riskScore}/100
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right text-slate-500 text-sm">{user.lastActive}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>

      {/* Action Footer */}
      <div className="mt-8 flex justify-end items-center p-4 border-t border-slate-200 bg-slate-50 rounded-xl shadow-sm">
        <div className="mr-4 text-sm text-slate-600">
          {selectedTemplate ? (
            <span>Selected <strong>1</strong> template, <strong>{selectedUsers.size}</strong> users.</span>
          ) : (
            <span>Please select a template to continue.</span>
          )}
        </div>
        <Button 
          disabled={!selectedTemplate || selectedUsers.size === 0 || isSending}
          onClick={handleSendCampaign}
          className="bg-[#0A192F] hover:bg-blue-900 text-white min-w-[160px] transition-all"
        >
          {isSending ? "Dispatching..." : (
            <>
              <Send className="h-4 w-4 mr-2" />
              Send {selectedUsers.size > 0 ? selectedUsers.size : ""} Emails Now
            </>
          )}
        </Button>
      </div>

    </div>
  );
}
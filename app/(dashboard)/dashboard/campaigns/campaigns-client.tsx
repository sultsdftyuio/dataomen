"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Send, Mail, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { CreateTemplateModal } from "./create-template-modal";

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
  const router = useRouter();
  const { toast } = useToast();
  
  // High-level App State
  const [templates, setTemplates] = useState<EmailTemplate[]>(emailTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  // Abort controller for pending requests on unmount/re-triggers
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup: abort any pending fetches if the user navigates away
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, []);

  // Memoized derived states
  const sortedAtRiskUsers = useMemo(() => {
    return [...atRiskUsers].sort((a, b) => b.riskScore - a.riskScore);
  }, [atRiskUsers]);

  const allSelected = useMemo(() => {
    return sortedAtRiskUsers.length > 0 && sortedAtRiskUsers.every((u) => selectedUsers.has(u.id));
  }, [sortedAtRiskUsers, selectedUsers]);

  const activeTemplate = useMemo(() => {
    return templates.find(t => t.id === selectedTemplate);
  }, [templates, selectedTemplate]);

  // Optimistic Insertion Logic
  const onNewTemplateCreated = useCallback((newTemplate: EmailTemplate) => {
    setTemplates((prev) => [newTemplate, ...prev]);
    setSelectedTemplate(newTemplate.id);
    router.refresh();
  }, [router]);

  // Functional state updates to prevent stale closures
  const toggleUser = useCallback((userId: string) => {
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedUsers((prev) => {
      if (allSelected) return new Set();
      return new Set(sortedAtRiskUsers.map((u) => u.id));
    });
  }, [allSelected, sortedAtRiskUsers]);

  const handleSendCampaign = async () => {
    if (!selectedTemplate || selectedUsers.size === 0) return;

    const targets = sortedAtRiskUsers
      .filter((user) => selectedUsers.has(user.id))
      .map((user) => ({
        id: user.id,
        email: user.email,
        signal: user.signal,
        riskScore: user.riskScore,
      }));

    // Prevent accidental huge requests
    if (targets.length > 500) {
      toast({ title: "Selection Limit Exceeded", description: "Select up to 500 users.", variant: "destructive" });
      return;
    }

    // Common SaaS confirmation for mass dispatch
    if (targets.length >= 50) {
      const confirmed = window.confirm(`Are you sure you want to dispatch this campaign to ${targets.length} users?`);
      if (!confirmed) return;
    }

    setIsSending(true);
    const idempotencyKey = `req_dispatch_${crypto.randomUUID()}`;

    // Refresh abort controller
    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/campaigns/dispatch", {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Idempotency-Key': idempotencyKey // Added header for robust backend idempotency
        },
        body: JSON.stringify({
          templateId: selectedTemplate,
          targets: targets,
          idempotencyKey: idempotencyKey
        }),
        signal: abortControllerRef.current.signal,
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) throw new Error(payload?.error || "Failed to queue campaign.");

      setSelectedUsers(new Set());
      setSelectedTemplate(null);
      
      toast({
        title: "Campaign Dispatched 🚀",
        description: payload?.note === "deduplicated" 
          ? "Request already processed safely." 
          : `Successfully queued ${typeof payload?.queued === "number" ? payload.queued : targets.length} recovery emails.`,
      });

    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return; // Component unmounted or request aborted, fail silently
      }
      
      // Surfacing actual backend error messages for better debugging
      toast({
        title: "Dispatch Failed",
        description: err instanceof Error ? err.message : "An unexpected error occurred while queuing your campaign.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
    }
  };

  // UX Polish: Risk color mapping
  const getRiskBadgeProps = (score: number) => {
    if (score >= 95) return { variant: "destructive" as const, className: "bg-red-500 hover:bg-red-600 shadow-sm" };
    if (score >= 80) return { variant: "secondary" as const, className: "bg-orange-100 text-orange-800 hover:bg-orange-200 border-orange-200 shadow-sm" };
    if (score >= 60) return { variant: "secondary" as const, className: "bg-yellow-100 text-yellow-800 hover:bg-yellow-200 border-yellow-200 shadow-sm" };
    return { variant: "secondary" as const, className: "shadow-sm" };
  };

  return (
    <div className="flex flex-col h-full space-y-6 pb-12 animate-in fade-in duration-300 relative">
      
      {/* Header Container */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Immediate Recovery</h1>
          <p className="text-sm text-slate-500 mt-1">Select an email template and dispatch it to at-risk users.</p>
        </div>
        
        {/* Modal Injection */}
        <CreateTemplateModal onTemplateCreated={onNewTemplateCreated} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Email Templates */}
        <div className="lg:col-span-1 space-y-4">
          <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">1. Select Template</h2>
          
          {templates.length === 0 ? (
             <div className="text-sm text-slate-500 border border-dashed rounded-xl p-8 text-center bg-slate-50/50">
               No templates found. <br/><span className="text-blue-600 font-medium">Create one</span> to get started.
             </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-1">
              {templates.map((tpl) => (
                <Card 
                  key={tpl.id} 
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedTemplate(tpl.id);
                    }
                  }}
                  className={`cursor-pointer transition-all border outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2 ${selectedTemplate === tpl.id ? 'ring-2 ring-blue-600 border-blue-600 bg-blue-50/50' : 'border-slate-200 hover:border-blue-300 bg-white shadow-sm'}`}
                  onClick={() => setSelectedTemplate(tpl.id)}
                >
                  <CardHeader className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center space-x-2.5">
                        <div className={`p-1.5 rounded-md ${selectedTemplate === tpl.id ? 'bg-blue-100' : 'bg-slate-100'}`}>
                          <Mail className={`h-4 w-4 ${selectedTemplate === tpl.id ? 'text-blue-600' : 'text-slate-600'}`} />
                        </div>
                        <CardTitle className="text-sm font-medium text-slate-900">{tpl.name}</CardTitle>
                      </div>
                      {selectedTemplate === tpl.id && <CheckCircle2 className="h-5 w-5 text-blue-600" />}
                    </div>
                    <CardDescription className="text-xs mt-2 truncate font-mono text-slate-500 bg-slate-50 p-1.5 rounded border border-slate-100">
                      {tpl.subject}
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
            <Badge variant="secondary" className="bg-orange-100 text-orange-800 border border-orange-200/50 shadow-sm font-semibold">
              {sortedAtRiskUsers.length} High Risk Detected
            </Badge>
          </div>
          
          <Card className="shadow-sm overflow-hidden border-slate-200">
            <Table>
              <TableHeader className="bg-slate-50 border-b border-slate-100">
                <TableRow>
                  <TableHead className="w-[50px] text-center">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} disabled={sortedAtRiskUsers.length === 0} />
                  </TableHead>
                  <TableHead className="font-semibold text-slate-700">User Context</TableHead>
                  <TableHead className="font-semibold text-slate-700">Risk Signal</TableHead>
                  <TableHead className="font-semibold text-slate-700">Score</TableHead>
                  <TableHead className="text-right font-semibold text-slate-700">Last Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedAtRiskUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center h-32 text-slate-500 bg-white">
                      No high-risk users currently detected.
                    </TableCell>
                  </TableRow>
                ) : (
                  sortedAtRiskUsers.map((user) => (
                    <TableRow key={user.id} className={`transition-colors ${selectedUsers.has(user.id) ? "bg-blue-50/40" : "bg-white"}`}>
                      <TableCell className="text-center">
                        <Checkbox checked={selectedUsers.has(user.id)} onCheckedChange={() => toggleUser(user.id)} />
                      </TableCell>
                      <TableCell className="font-medium text-slate-900">{user.email}</TableCell>
                      <TableCell>
                        <div className="flex items-center text-slate-600 text-sm">
                          <AlertTriangle className="h-3.5 w-3.5 text-orange-500 mr-2" />
                          {user.signal}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge {...getRiskBadgeProps(user.riskScore)}>
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

      {/* Action Footer - Now sticky for better long-table UX */}
      <div className="mt-8 sticky bottom-0 z-10 flex justify-between items-center p-5 border border-slate-200 bg-white/95 backdrop-blur-sm rounded-xl shadow-md">
        <div className="text-sm text-slate-600 flex items-center gap-2">
          {activeTemplate ? (
            <>
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span>Template: <strong>{activeTemplate.name}</strong> queued for <strong>{selectedUsers.size}</strong> operators.</span>
            </>
          ) : (
            <>
              <div className="w-2 h-2 rounded-full bg-slate-300"></div>
              <span>Awaiting template selection to unlock dispatch engine.</span>
            </>
          )}
        </div>
        <Button 
          disabled={!selectedTemplate || selectedUsers.size === 0 || isSending}
          onClick={handleSendCampaign}
          className="bg-blue-600 hover:bg-blue-700 text-white min-w-[180px] shadow-sm transition-all font-medium"
        >
          {isSending ? (
            <><RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Orchestrating...</>
          ) : (
            <><Send className="h-4 w-4 mr-2" /> Execute Campaign</>
          )}
        </Button>
      </div>
    </div>
  );
}
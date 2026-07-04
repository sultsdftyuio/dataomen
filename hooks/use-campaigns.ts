// hooks/use-campaigns.ts
"use client";

import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/hooks/use-toast";
import {
  type RiskUser,
  type EmailTemplate,
  type CampaignsClientProps,
  SENDER_EMAIL_REGEX,
} from "@/lib/types";

export function useCampaigns({
  atRiskUsers,
  emailTemplates,
  initialSenderEmail,
  isProTier = true,
  restrictionMessage,
}: CampaignsClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const upgradeMessage =
    restrictionMessage ??
    "Upgrade to Pro to unlock customer lists, campaign sending, and custom templates.";

  // High-level App State
  const [senderEmail, setSenderEmail] = useState<string | null>(
    initialSenderEmail?.trim() || null
  );
  const [templates, setTemplates] = useState<EmailTemplate[]>(emailTemplates);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());
  const [isSending, setIsSending] = useState(false);

  // Inline Sender Configuration State
  const [senderInput, setSenderInput] = useState("");
  const [isSavingSender, setIsSavingSender] = useState(false);

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
    if (!isProTier) return [];
    return [...atRiskUsers].sort((a, b) => b.riskScore - a.riskScore);
  }, [atRiskUsers, isProTier]);

  const userIds = useMemo(
    () => sortedAtRiskUsers.map((u) => u.id),
    [sortedAtRiskUsers]
  );

  const allSelected = useMemo(() => {
    return (
      sortedAtRiskUsers.length > 0 &&
      sortedAtRiskUsers.every((u) => selectedUsers.has(u.id))
    );
  }, [sortedAtRiskUsers, selectedUsers]);

  const activeTemplate = useMemo(() => {
    return templates.find((t) => t.id === selectedTemplate);
  }, [templates, selectedTemplate]);

  // --- Inline Sender Config Logic ---
  const handleSaveSenderEmail = async () => {
    // Guard against duplicate submissions while state is settling
    if (isSavingSender) return;

    if (!isProTier) {
      toast({
        title: "Pro Plan Required",
        description: upgradeMessage,
        variant: "destructive",
      });
      return;
    }

    const trimmedInput = senderInput.trim();
    if (!SENDER_EMAIL_REGEX.test(trimmedInput)) {
      toast({
        title: "Invalid Format",
        description:
          "Must be a valid email address or 'Name <email@example.com>'",
        variant: "destructive",
      });
      return;
    }

    setIsSavingSender(true);
    try {
      const response = await fetch("/api/settings/workspace", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderEmail: trimmedInput }),
      });

      if (!response.ok) throw new Error("Failed to save sender settings.");

      // Immediately unlock the UI; no need to wait for router.refresh()
      setSenderEmail(trimmedInput);
      setSenderInput("");

      toast({
        title: "Sender Configured",
        description: "Campaign dispatch is now unlocked.",
      });
      router.refresh();
    } catch (err) {
      toast({
        title: "Configuration Failed",
        description:
          err instanceof Error ? err.message : "An error occurred.",
        variant: "destructive",
      });
    } finally {
      setIsSavingSender(false);
    }
  };

  // --- Campaign Dispatch Logic ---
  const onNewTemplateCreated = useCallback(
    (newTemplate: EmailTemplate) => {
      setTemplates((prev) => [newTemplate, ...prev]);
      setSelectedTemplate(newTemplate.id);
      router.refresh();
    },
    [router]
  );

  const toggleUser = useCallback((userId: string) => {
    if (!isProTier) return;
    setSelectedUsers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, [isProTier]);

  const toggleAll = useCallback(() => {
    if (!isProTier) return;
    setSelectedUsers((prev) => {
      if (allSelected) return new Set();
      return new Set(userIds);
    });
  }, [allSelected, isProTier, userIds]);

  const handleSendCampaign = async () => {
    // Guard against duplicate submissions while state is settling
    if (isSending) return;

    if (!isProTier) {
      toast({
        title: "Pro Plan Required",
        description: upgradeMessage,
        variant: "destructive",
      });
      return;
    }

    // Hard architectural block: NEVER dispatch without sender email configured
    if (!senderEmail || !selectedTemplate || selectedUsers.size === 0) return;

    const targets = sortedAtRiskUsers
      .filter((user) => selectedUsers.has(user.id))
      .map((user) => ({
        id: user.id,
        email: user.email,
        signal: user.signal,
        riskScore: user.riskScore,
      }));

    // Frontend limit; backend must independently enforce this too
    if (targets.length > 500) {
      toast({
        title: "Selection Limit Exceeded",
        description: "Select up to 500 users.",
        variant: "destructive",
      });
      return;
    }

    if (targets.length >= 50) {
      const confirmed = window.confirm(
        `Are you sure you want to dispatch this campaign to ${targets.length} users?`
      );
      if (!confirmed) return;
    }

    setIsSending(true);
    const idempotencyKey = `req_dispatch_${crypto.randomUUID()}`;

    if (abortControllerRef.current) abortControllerRef.current.abort();
    abortControllerRef.current = new AbortController();

    try {
      const response = await fetch("/api/campaigns/dispatch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          templateId: selectedTemplate,
          targets: targets,
          idempotencyKey: idempotencyKey,
        }),
        signal: abortControllerRef.current.signal,
      });

      // Better response parsing: handle non-JSON gracefully
      let payload: any = null;
      try {
        payload = await response.json();
      } catch {
        // Server returned non-JSON (likely HTML error page)
        // Leave payload as null to fall through to generic error
      }

      if (!response.ok)
        throw new Error(payload?.error || "Failed to queue campaign.");

      setSelectedUsers(new Set());
      setSelectedTemplate(null);

      toast({
        title: "Campaign Dispatched 🚀",
        description:
          payload?.note === "deduplicated"
            ? "Request already processed safely."
            : `Successfully queued ${
                typeof payload?.queued === "number"
                  ? payload.queued
                  : targets.length
              } recovery emails.`,
      });
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // If the user navigated away, the abort is expected.
        // The backend idempotency key guarantees retries won't duplicate.
        return;
      }

      toast({
        title: "Dispatch Failed",
        description:
          err instanceof Error
            ? err.message
            : "An unexpected error occurred while queuing your campaign.",
        variant: "destructive",
      });
    } finally {
      setIsSending(false);
      // Reset ref so it doesn't point to a completed controller forever
      abortControllerRef.current = null;
    }
  };

  return {
    // State
    senderEmail,
    templates,
    selectedTemplate,
    selectedUsers,
    isSending,
    senderInput,
    isSavingSender,
    isProTier,
    restrictionMessage: upgradeMessage,
    // Derived
    sortedAtRiskUsers,
    userIds,
    allSelected,
    activeTemplate,
    // Setters
    setSelectedTemplate,
    setSenderInput,
    // Handlers
    handleSaveSenderEmail,
    onNewTemplateCreated,
    toggleUser,
    toggleAll,
    handleSendCampaign,
  };
}

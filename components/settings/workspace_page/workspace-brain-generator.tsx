"use client";

import React, { useRef, useState } from "react";
import {
  Brain,
  CheckCircle2,
  Globe2,
  Loader2,
  WandSparkles,
} from "lucide-react";

import { generateWorkspaceBrain } from "@/app/actions/workspace";
import { toast } from "@/components/ui/use-toast";
import { C } from "@/lib/tokens";

export type WorkspaceBrainProfile = {
  company_name: string;
  one_liner: string;
  target_audience: string[];
  core_problem_solved: string;
  key_value_propositions: string[];
  ideal_customer_pain_points: string[];
  negative_keywords: string[];
};

type WorkspaceBrainGeneratorProps = {
  tenantId: string | null;
  companyName: string;
  websiteUrl: string;
  isPending: boolean;
  onWebsiteUrlChange: (value: string) => void;
  onApplyProfile?: (profile: WorkspaceBrainProfile) => void;
  onSaveAndActivate?: (profile: WorkspaceBrainProfile) => void;
};

type GeneratorStatus = "idle" | "queueing" | "queued";

function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("Add your company website URL before generating the Arcli Brain.");
  }

  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const parsed = new URL(candidate);

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error("Enter a valid website URL.");
  }

  parsed.hash = "";
  return parsed.toString();
}

export default function WorkspaceBrainGenerator({
  tenantId,
  companyName,
  websiteUrl,
  isPending,
  onWebsiteUrlChange,
}: WorkspaceBrainGeneratorProps) {
  const [status, setStatus] = useState<GeneratorStatus>("idle");
  const [queuedUrl, setQueuedUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generationInFlightRef = useRef(false);

  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow =
    "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  const draftWebsiteUrl = websiteUrl.trim();
  const isQueueing = status === "queueing";
  const canGenerate =
    Boolean(tenantId) && draftWebsiteUrl.length > 0 && !isPending && !isQueueing;
  const badgeLabel =
    status === "queued" ? "Queued" : isQueueing ? "Queueing" : "Workspace-aware";
  const badgeColor = status === "queued" ? C.green : C.blue;
  const badgeBackground = status === "queued" ? C.greenPale : C.bluePale;
  const previewTitle = companyName || "Workspace Intelligence";

  const showErrorToast = (message: string) => {
    toast({
      title: "Brain generation failed",
      description: message,
      variant: "destructive",
    });
  };

  const generateBrain = async () => {
    if (generationInFlightRef.current) {
      return;
    }

    setError(null);

    if (!tenantId) {
      const message = "Workspace access could not be verified.";
      setError(message);
      showErrorToast(message);
      return;
    }

    let normalizedWebsiteUrl: string;
    try {
      normalizedWebsiteUrl = normalizeWebsiteUrl(draftWebsiteUrl);
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "A valid company website URL is required.";
      setError(message);
      showErrorToast(message);
      return;
    }

    if (normalizedWebsiteUrl !== websiteUrl) {
      onWebsiteUrlChange(normalizedWebsiteUrl);
    }

    setStatus("queueing");
    generationInFlightRef.current = true;

    try {
      const result = await generateWorkspaceBrain(tenantId, normalizedWebsiteUrl);

      if (!result.ok) {
        throw new Error(result.message);
      }

      setQueuedUrl(result.websiteUrl);
      setStatus("queued");
      toast({
        title: "Brain generation queued",
        description: "Queued in the workspace intelligence pipeline.",
      });
    } catch (caughtError) {
      const message =
        caughtError instanceof Error
          ? caughtError.message
          : "Arcli could not queue workspace brain generation.";
      setStatus("idle");
      setError(message);
      showErrorToast(message);
    } finally {
      generationInFlightRef.current = false;
    }
  };

  return (
    <section
      style={{
        background: C.white,
        borderRadius: 8,
        border: surfaceBorder,
        boxShadow: surfaceShadow,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          borderBottom: `1px solid ${C.rule}`,
          paddingBottom: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <Brain size={16} color={C.blue} />
          <h2
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: C.navySoft,
              margin: 0,
            }}
          >
            Arcli Brain
          </h2>
        </div>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: badgeColor,
            background: badgeBackground,
            border: `1px solid ${
              status === "queued" ? "rgba(16,185,129,0.2)" : "rgba(27,110,191,0.2)"
            }`,
            borderRadius: 999,
            padding: "3px 8px",
            whiteSpace: "nowrap",
          }}
        >
          {badgeLabel}
        </span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: C.navy }}>
          Company Website URL
        </label>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0 }}>
            <Globe2
              size={14}
              color={C.muted}
              style={{ position: "absolute", left: 10, top: 9 }}
            />
            <input
              type="url"
              placeholder="https://..."
              value={websiteUrl}
              disabled={isPending || isQueueing}
              onChange={(event) => {
                onWebsiteUrlChange(event.target.value);
                if (status === "queued") {
                  setStatus("idle");
                  setQueuedUrl(null);
                }
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  generateBrain();
                }
              }}
              style={{
                width: "100%",
                height: 32,
                padding: "0 12px 0 32px",
                borderRadius: 6,
                border: surfaceBorder,
                background: C.white,
                fontSize: 13,
                color: C.navy,
                outline: "none",
                boxShadow: surfaceShadow,
                opacity: isPending || isQueueing ? 0.6 : 1,
              }}
            />
          </div>
          <button
            type="button"
            disabled={!canGenerate}
            onClick={generateBrain}
            style={{
              height: 32,
              padding: "0 12px",
              border: 0,
              borderRadius: 6,
              background: canGenerate ? C.navy : C.offWhite,
              color: canGenerate ? C.white : C.faint,
              fontSize: 11,
              fontWeight: 700,
              cursor: canGenerate ? "pointer" : "not-allowed",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              boxShadow: canGenerate ? surfaceShadow : "none",
            }}
          >
            {isQueueing ? (
              <Loader2 size={13} className="animate-spin" />
            ) : status === "queued" ? (
              <CheckCircle2 size={13} />
            ) : (
              <WandSparkles size={13} />
            )}
            {isQueueing ? "Queueing..." : "Generate Arcli Brain"}
          </button>
        </div>
      </div>

      {error ? (
        <div
          style={{
            borderRadius: 6,
            border: "1px solid rgba(239,68,68,0.25)",
            background: C.redPale,
            color: "#B91C1C",
            padding: "8px 10px",
            fontSize: 11,
            lineHeight: 1.45,
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      ) : null}

      <div
        style={{
          borderRadius: 8,
          border:
            status === "queued"
              ? `1px solid rgba(16,185,129,0.25)`
              : `1px dashed ${C.ruleDark}`,
          background: status === "queued" ? C.greenPale : C.offWhite,
          padding: 14,
          color: status === "queued" ? C.green : C.muted,
          fontSize: 12,
          lineHeight: 1.5,
        }}
      >
        {status === "queued" ? (
          <>
            <strong style={{ color: C.green }}>Brain generation queued.</strong>{" "}
            {queuedUrl ?? draftWebsiteUrl}
          </>
        ) : isQueueing ? (
          `Queueing ${draftWebsiteUrl || "workspace website"}...`
        ) : (
          <>{previewTitle}: ready to queue.</>
        )}
      </div>
    </section>
  );
}

import React from "react";
import { Activity, AlertTriangle, Clock, Users, RefreshCcw } from "lucide-react";
import { C } from "@/lib/tokens";
import CustomerOperationsClient, {
  type CustomerOperationsPage,
} from "./risk-queue-client";

const surfaceBorder = "1px solid rgba(0,0,0,0.08)";
const surfaceShadow = "0 1px 3px rgba(0,0,0,0.08)";
const sans = "var(--font-geist-sans), sans-serif";

interface ShellProps {
  page: CustomerOperationsPage;
}

export function RiskQueueShell({ page }: ShellProps) {
  const { metrics } = page;

  return (
    <div className="flex-1 space-y-6 p-8 pt-6 w-full" style={{ fontFamily: sans }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        {/* ── Section Header ── */}
        <div style={{ marginBottom: 48 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: C.blue,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.08em",
              marginBottom: 14,
              textTransform: "uppercase",
            }}
          >
            <Activity size={14} /> LIVE DASHBOARD
          </div>
          <h2
            style={{
              fontSize: 42,
              color: C.navy,
              marginBottom: 16,
              lineHeight: 1.08,
              letterSpacing: "-0.015em",
              fontWeight: 600,
            }}
          >
            Accounts that need you.
          </h2>
          <p
            style={{
              color: C.navySoft,
              fontSize: 17,
              lineHeight: 1.62,
              maxWidth: 560,
            }}
          >
            Catch warning signs early, reach out with the right context, and bring
            customers back before they churn.
          </p>
        </div>

        {/* ── Metrics Grid ── */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 20,
            marginBottom: 40,
          }}
        >
          <MetricCard
            label="Critical"
            value={metrics.critical_count}
            subtitle="Immediate outreach needed"
            color="#EF4444"
            icon={<AlertTriangle size={18} />}
          />
          <MetricCard
            label="Dead Letters"
            value={metrics.dead_letter_count}
            subtitle="Failed recovery attempts"
            color="#F59E0B"
            icon={<Clock size={18} />}
          />
          <MetricCard
            label="Pending"
            value={metrics.pending_count}
            subtitle="Queued for outreach"
            color="#3B9AE8"
            icon={<Clock size={18} />}
          />
          <MetricCard
            label="At Risk"
            value={metrics.at_risk_count}
            subtitle="Showing warning signals"
            color="#64748B"
            icon={<Users size={18} />}
          />
        </div>

        {/* ── The Radar Screen ── */}
        <div style={{ position: "relative" }}>
          <div
            style={{
              background: "#FFFFFF",
              borderRadius: 8,
              border: surfaceBorder,
              position: "relative",
              zIndex: 2,
              boxShadow: surfaceShadow,
              overflow: "hidden",
            }}
          >
            {/* Card Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "20px 24px",
                borderBottom: surfaceBorder,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: `${C.blue}12`,
                    border: `1px solid ${C.blue}28`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: C.blue,
                  }}
                >
                  <RefreshCcw size={16} />
                </div>
                <div>
                  <div
                    style={{ fontSize: 14, fontWeight: 700, color: C.navy }}
                  >
                    Recovery Queue
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: C.faint,
                      fontWeight: 500,
                    }}
                  >
                    Real-time customer health monitor
                  </div>
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  fontSize: 12,
                  fontWeight: 600,
                  color: "#047857",
                  background: "rgba(16,185,129,0.08)",
                  padding: "4px 10px",
                  borderRadius: 8,
                  border: surfaceBorder,
                }}
              >
                <Activity size={14} /> LIVE
              </div>
            </div>

            {/* Table Area */}
            <div style={{ padding: 24 }}>
              <CustomerOperationsClient page={page} />
            </div>
          </div>

          {/* Offset Background Accent */}
          <div
            style={{
              position: "absolute",
              top: 12,
              left: 12,
              right: -12,
              bottom: -12,
              background: "#F3F4F6",
              borderRadius: 8,
              zIndex: 1,
              opacity: 0.9,
              border: surfaceBorder,
            }}
          />
        </div>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  subtitle,
  color,
  icon,
}: {
  label: string;
  value: number;
  subtitle: string;
  color: string;
  icon: React.ReactNode;
}) {
  const isAlert = color === "#EF4444";

  return (
    <div style={{ position: "relative" }}>
      <div
        style={{
          background: "#FFFFFF",
          padding: 24,
          borderRadius: 8,
          border: surfaceBorder,
          position: "relative",
          zIndex: 2,
          boxShadow: surfaceShadow,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 18,
          }}
        >
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.faint,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            {label}
          </span>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: 8,
              background: `${color}12`,
              border: `1px solid ${color}20`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: color,
            }}
          >
            {icon}
          </div>
        </div>
        <div
          style={{
            fontSize: 34,
            fontWeight: 700,
            color: isAlert ? color : C.navy,
            letterSpacing: "-0.03em",
            lineHeight: 1.1,
            marginBottom: 6,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {value}
        </div>
        <div
          style={{
            fontSize: 13,
            color: C.navySoft,
            fontWeight: 500,
            lineHeight: 1.4,
          }}
        >
          {subtitle}
        </div>
      </div>

      {/* Colored offset shadow */}
      <div
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          right: -8,
          bottom: -8,
          background: `${color}08`,
          borderRadius: 8,
          zIndex: 1,
          border: `1px solid ${color}12`,
        }}
      />
    </div>
  );
}

export function QueueErrorState() {
  return (
    <div className="flex-1 space-y-6 p-8 pt-6 w-full" style={{ fontFamily: sans }}>
      <div style={{ maxWidth: 1240, margin: "0 auto" }}>
        <div style={{ marginBottom: 48 }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              color: C.blue,
              fontWeight: 700,
              fontSize: 12,
              letterSpacing: "0.08em",
              marginBottom: 14,
              textTransform: "uppercase",
            }}
          >
            <Activity size={14} /> LIVE DASHBOARD
          </div>
          <h2
            style={{
              fontSize: 42,
              color: C.navy,
              marginBottom: 16,
              lineHeight: 1.08,
              letterSpacing: "-0.015em",
              fontWeight: 600,
            }}
          >
            Accounts that need you.
          </h2>
        </div>

        <div style={{ position: "relative" }}>
          <div
            style={{
              background: C.navy,
              borderRadius: 8,
              padding: 48,
              position: "relative",
              zIndex: 2,
              color: "#fff",
              boxShadow: surfaceShadow,
              border: "1px solid rgba(255,255,255,0.12)",
              textAlign: "center",
            }}
          >
            <div
              style={{
                margin: "0 auto 20px",
                width: 56,
                height: 56,
                borderRadius: "50%",
                background: "rgba(239,68,68,0.15)",
                border: "1px solid rgba(239,68,68,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={28} color="#EF4444" />
            </div>
            <h3
              style={{
                fontSize: 22,
                fontWeight: 600,
                marginBottom: 10,
                color: "#fff",
              }}
            >
              Unable to load accounts
            </h3>
            <p
              style={{
                color: "#94A3B8",
                fontSize: 15,
                lineHeight: 1.62,
                maxWidth: 480,
                margin: "0 auto 24px",
              }}
            >
              The database connection failed. This could be temporary downtime or
              a network issue. Refresh to try again.
            </p>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                background: "rgba(239,68,68,0.1)",
                border: "1px solid rgba(239,68,68,0.25)",
                padding: "10px 18px",
                borderRadius: 8,
                fontSize: 13,
                color: "#FCA5A5",
                fontWeight: 600,
              }}
            >
              Do not assume the queue is empty. This is a failure state, not a
              clear state.
            </div>
          </div>

          {/* Offset Background Accent */}
          <div
            style={{
              position: "absolute",
              top: -12,
              left: -12,
              right: 12,
              bottom: 12,
              background: "#F3F4F6",
              borderRadius: 8,
              zIndex: 1,
              opacity: 0.95,
              border: surfaceBorder,
            }}
          />
        </div>
      </div>
    </div>
  );
}
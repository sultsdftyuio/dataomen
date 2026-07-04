"use client";

import React from "react";
import { Lock } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { C } from "@/lib/tokens";
import UpgradeButton from "@/components/ui/UpgradeButton";

interface TargetUsersTableProps {
  sortedAtRiskUsers: any[];
  selectedUsers: Set<string>;
  allSelected: boolean;
  senderEmail: string | null;
  isProTier: boolean;
  restrictionMessage: string;
  toggleUser: (id: string) => void;
  toggleAll: (checked: boolean) => void;
}

export function TargetUsersTable({
  sortedAtRiskUsers,
  selectedUsers,
  allSelected,
  senderEmail,
  isProTier,
  restrictionMessage,
  toggleUser,
  toggleAll,
}: TargetUsersTableProps) {
  const sans = "var(--font-geist-sans), sans-serif";
  const surfaceBorder = `1px solid ${C.rule}`;
  const surfaceShadow = "0 1px 3px rgba(10, 22, 40, 0.04), 0 1px 2px rgba(10, 22, 40, 0.02)";

  if (!isProTier) {
    return (
      <div style={{ fontFamily: sans, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
            2. Target Roster
          </h2>
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: C.blueMid,
              background: C.bluePale,
              border: `1px solid rgba(27, 110, 191, 0.25)`,
              padding: "2px 8px",
              borderRadius: 6,
            }}
          >
            Pro
          </div>
        </div>

        <div
          style={{
            background: C.white,
            borderRadius: 8,
            border: surfaceBorder,
            boxShadow: surfaceShadow,
            padding: 32,
            minHeight: 220,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: 420 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: 8,
                background: C.bluePale,
                color: C.blue,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                border: `1px solid rgba(27, 110, 191, 0.25)`,
              }}
            >
              <Lock size={18} />
            </div>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: C.navy }}>
                Customer list locked
              </div>
              <p style={{ fontSize: 13, color: C.navySoft, margin: "6px 0 0" }}>
                {restrictionMessage}
              </p>
            </div>
            <UpgradeButton className="h-9 px-4 rounded-md bg-[#0B1120] hover:bg-slate-800" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: sans, display: "flex", flexDirection: "column", gap: 12 }}>
      
      {/* ── Section Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
          2. Target Roster
        </h2>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.amber,
            background: C.amberPale,
            border: `1px solid rgba(245, 158, 11, 0.3)`,
            padding: "2px 8px",
            borderRadius: 6,
          }}
        >
          {sortedAtRiskUsers.length} High Risk
        </div>
      </div>

      {/* ── Table Container ── */}
      <div
        style={{
          background: C.white,
          borderRadius: 8,
          border: surfaceBorder,
          boxShadow: surfaceShadow,
          overflow: "hidden",
          opacity: !senderEmail ? 0.6 : 1,
          pointerEvents: !senderEmail ? "none" : "auto",
        }}
      >
        <table style={{ width: "100%", textAlign: "left", fontSize: 13, borderCollapse: "collapse" }}>
          <thead style={{ background: C.offWhite, borderBottom: surfaceBorder }}>
            <tr>
              <th style={{ width: 40, padding: 10, textAlign: "center" }}>
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  disabled={sortedAtRiskUsers.length === 0 || !senderEmail}
                  className="w-3.5 h-3.5 rounded-[3px]"
                />
              </th>
              <th style={{ padding: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft }}>
                User Entity
              </th>
              <th style={{ padding: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft }}>
                Primary Signal
              </th>
              <th style={{ padding: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft }}>
                Score
              </th>
              <th style={{ padding: 10, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: C.navySoft, textAlign: "right" }}>
                Active
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedAtRiskUsers.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: "center", padding: 48, fontSize: 13, color: C.muted }}>
                  No high-risk users currently detected.
                </td>
              </tr>
            ) : (
              sortedAtRiskUsers.map((user) => {
                const isChecked = selectedUsers.has(user.id);
                return (
                  <tr
                    key={user.id}
                    style={{
                      background: isChecked ? C.bluePale : C.white,
                      borderBottom: `1px solid rgba(221, 232, 242, 0.5)`,
                      transition: "background 0.15s ease",
                    }}
                  >
                    <td style={{ padding: 10, textAlign: "center" }}>
                      <Checkbox
                        checked={isChecked}
                        onCheckedChange={() => toggleUser(user.id)}
                        disabled={!senderEmail}
                        className="w-3.5 h-3.5 rounded-[3px]"
                      />
                    </td>
                    <td style={{ padding: 10, fontWeight: 600, color: C.navy }}>
                      {user.email}
                    </td>
                    <td style={{ padding: 10 }}>
                      <div
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 6,
                          padding: "4px 8px",
                          background: C.amberPale,
                          border: `1px solid rgba(245, 158, 11, 0.3)`,
                          borderRadius: 4,
                          fontSize: 11,
                          fontFamily: "monospace",
                          color: "#92400E",
                        }}
                      >
                        <div style={{ width: 6, height: 6, borderRadius: "50%", background: C.amber }} />
                        {user.signal}
                      </div>
                    </td>
                    <td style={{ padding: 10 }}>
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          padding: "2px 6px",
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          background: C.offWhite,
                          color: C.navySoft,
                          border: surfaceBorder,
                        }}
                      >
                        {user.riskScore}
                      </span>
                    </td>
                    <td style={{ padding: 10, textAlign: "right", color: C.muted, fontSize: 12, fontWeight: 500 }}>
                      {user.lastActive}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

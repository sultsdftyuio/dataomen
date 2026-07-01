"use client";

import React from "react";
import { Checkbox } from "@/components/ui/checkbox";

interface TargetUsersTableProps {
  sortedAtRiskUsers: any[]; // Replace 'any' with your actual User type if exported from types
  selectedUsers: Set<string>;
  allSelected: boolean;
  senderEmail: string | null;
  toggleUser: (id: string) => void;
  toggleAll: (checked: boolean) => void;
}

// Design tokens mapped from the DeepDiveFeatures snippet
const surfaceBorder = "border border-black/[0.08]";
const surfaceShadow = "shadow-[0_1px_3px_rgba(0,0,0,0.08)]";

export function TargetUsersTable({
  sortedAtRiskUsers,
  selectedUsers,
  allSelected,
  senderEmail,
  toggleUser,
  toggleAll,
}: TargetUsersTableProps) {
  return (
    <div className="lg:col-span-2 space-y-3 font-sans">
      
      {/* Header Container */}
      <div className="flex items-center justify-between">
        <h2 className="text-[11px] font-bold text-slate-500 uppercase tracking-[0.05em]">
          2. Target Roster
        </h2>
        <div className="text-[11px] font-bold text-orange-600 bg-orange-50 border border-orange-200/50 px-2 py-0.5 rounded-md">
          {sortedAtRiskUsers.length} High Risk
        </div>
      </div>

      {/* Tightly Packed Data Table */}
      <div 
        className={`bg-white rounded-lg overflow-hidden ${surfaceBorder} ${surfaceShadow} ${
          !senderEmail ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        <table className="w-full text-left text-[13px] border-collapse">
          <thead className="bg-[#FAFAFA] border-b border-black/[0.04]">
            <tr>
              <th className="w-[40px] p-2.5 text-center font-medium">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  disabled={sortedAtRiskUsers.length === 0 || !senderEmail}
                  className="w-3.5 h-3.5 rounded-[3px] data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                />
              </th>
              <th className="p-2.5 font-semibold text-slate-600 text-[11px] uppercase tracking-[0.05em]">
                User Entity
              </th>
              <th className="p-2.5 font-semibold text-slate-600 text-[11px] uppercase tracking-[0.05em]">
                Primary Signal
              </th>
              <th className="p-2.5 font-semibold text-slate-600 text-[11px] uppercase tracking-[0.05em]">
                Score
              </th>
              <th className="p-2.5 font-semibold text-slate-600 text-[11px] uppercase tracking-[0.05em] text-right">
                Active
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-black/[0.04]">
            {sortedAtRiskUsers.length === 0 ? (
              <tr>
                <td colSpan={5} className="text-center py-12 text-[13px] text-slate-500">
                  No high-risk users currently detected.
                </td>
              </tr>
            ) : (
              sortedAtRiskUsers.map((user) => (
                <tr
                  key={user.id}
                  className={`transition-colors ${
                    selectedUsers.has(user.id) ? "bg-blue-50/30" : "hover:bg-[#FAFAFA]"
                  }`}
                >
                  <td className="p-2.5 text-center">
                    <Checkbox
                      checked={selectedUsers.has(user.id)}
                      onCheckedChange={() => toggleUser(user.id)}
                      disabled={!senderEmail}
                      className="w-3.5 h-3.5 rounded-[3px] data-[state=checked]:bg-blue-600 data-[state=checked]:border-blue-600"
                    />
                  </td>
                  <td className="p-2.5 font-semibold text-[#0B1120]">
                    {user.email}
                  </td>
                  <td className="p-2.5">
                    {/* Deterministic Signal Pill */}
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 bg-orange-50/50 border border-orange-100 rounded text-[11px] font-mono text-orange-800">
                      <div className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                      {user.signal}
                    </div>
                  </td>
                  <td className="p-2.5">
                    {/* Compact Score Indicator */}
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200/60">
                      {user.riskScore}
                    </span>
                  </td>
                  <td className="p-2.5 text-right text-slate-500 text-[12px] font-medium">
                    {user.lastActive}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
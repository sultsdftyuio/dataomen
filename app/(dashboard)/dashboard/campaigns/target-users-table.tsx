"use client";

import React from "react";
import { AlertTriangle } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { getRiskBadgeProps } from "@/lib/types";

interface TargetUsersTableProps {
  sortedAtRiskUsers: any[]; // Replace 'any' with your actual User type if exported from types
  selectedUsers: Set<string>;
  allSelected: boolean;
  senderEmail: string | null;
  toggleUser: (id: string) => void;
  toggleAll: (checked: boolean) => void;
}

export function TargetUsersTable({
  sortedAtRiskUsers,
  selectedUsers,
  allSelected,
  senderEmail,
  toggleUser,
  toggleAll,
}: TargetUsersTableProps) {
  return (
    <div className="lg:col-span-2 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 uppercase tracking-wider">
          2. Select Target Users
        </h2>
        <Badge
          variant="secondary"
          className="bg-orange-100 text-orange-800 border border-orange-200/50 shadow-sm font-semibold"
        >
          {sortedAtRiskUsers.length} High Risk Detected
        </Badge>
      </div>

      <Card
        className={`shadow-sm overflow-hidden border-slate-200 transition-opacity ${
          !senderEmail ? "opacity-60 pointer-events-none" : ""
        }`}
      >
        <Table>
          <TableHeader className="bg-slate-50 border-b border-slate-100">
            <TableRow>
              <TableHead className="w-[50px] text-center">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleAll}
                  disabled={sortedAtRiskUsers.length === 0 || !senderEmail}
                />
              </TableHead>
              <TableHead className="font-semibold text-slate-700">
                User Context
              </TableHead>
              <TableHead className="font-semibold text-slate-700">
                Risk Signal
              </TableHead>
              <TableHead className="font-semibold text-slate-700">
                Score
              </TableHead>
              <TableHead className="text-right font-semibold text-slate-700">
                Last Active
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedAtRiskUsers.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center h-32 text-slate-500 bg-white"
                >
                  No high-risk users currently detected.
                </TableCell>
              </TableRow>
            ) : (
              sortedAtRiskUsers.map((user) => (
                <TableRow
                  key={user.id}
                  className={`transition-colors ${
                    selectedUsers.has(user.id) ? "bg-blue-50/40" : "bg-white"
                  }`}
                >
                  <TableCell className="text-center">
                    <Checkbox
                      checked={selectedUsers.has(user.id)}
                      onCheckedChange={() => toggleUser(user.id)}
                      disabled={!senderEmail}
                    />
                  </TableCell>
                  <TableCell className="font-medium text-slate-900">
                    {user.email}
                  </TableCell>
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
                  <TableCell className="text-right text-slate-500 text-sm">
                    {user.lastActive}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
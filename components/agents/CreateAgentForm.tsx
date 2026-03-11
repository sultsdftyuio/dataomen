"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Bot, Target, Activity, Clock, Sparkles, Database, ShieldAlert, Cpu } from "lucide-react";
import { Badge } from "@/components/ui/badge";

// Updated to match the backend AgentRuleCreate schema
export interface AgentCreatePayload {
  name: string;
  dataset_id: string;
  metric_column: string;
  time_column: string;
  cron_schedule: string;
  sensitivity_threshold: number;
}

interface CreateAgentFormProps {
  onSubmit: (payload: AgentCreatePayload) => Promise<void>;
  isLoading?: boolean;
}

export function CreateAgentForm({ onSubmit, isLoading = false }: CreateAgentFormProps) {
  // 1. Identity
  const [name, setName] = useState("");
  
  // 2. Data Target
  const [datasetId, setDatasetId] = useState("");
  const [metricColumn, setMetricColumn] = useState("");
  const [timeColumn, setTimeColumn] = useState("created_at"); // Default common time column

  // 3. Orchestration & Sensitivity
  const [schedule, setSchedule] = useState("0 * * * *"); // Default: Hourly
  const [sensitivity, setSensitivity] = useState<number[]>([2.0]); // Default: 2 standard deviations

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const payload: AgentCreatePayload = {
      name,
      dataset_id: datasetId,
      metric_column: metricColumn,
      time_column: timeColumn,
      cron_schedule: schedule,
      sensitivity_threshold: sensitivity[0],
    };

    await onSubmit(payload);

    // Reset form upon successful orchestration
    setName("");
    setDatasetId("");
    setMetricColumn("");
    setTimeColumn("created_at");
    setSchedule("0 * * * *");
    setSensitivity([2.0]);
  };

  // Helper to explain the sensitivity slider to the user
  const getSensitivityLabel = (val: number) => {
    if (val < 1.5) return "High (Alerts on minor changes)";
    if (val <= 2.5) return "Balanced (Recommended)";
    return "Low (Only critical spikes/drops)";
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8 py-4 px-2">
      
      {/* SECTION 1: Identity */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <Bot className="h-5 w-5 text-primary" />
          <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Agent Identity</h3>
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="name">Agent Name</Label>
          <Input 
            id="name" 
            placeholder="e.g., EU Revenue Watchdog" 
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isLoading}
            required 
            className="bg-background"
          />
        </div>
      </div>

      {/* SECTION 2: Data Target */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b pb-2">
          <Database className="h-5 w-5 text-blue-500" />
          <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Data Target</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="dataset">Source Dataset</Label>
            <Select required value={datasetId} onValueChange={setDatasetId} disabled={isLoading}>
              <SelectTrigger className="bg-background">
                <SelectValue placeholder="Select dataset" />
              </SelectTrigger>
              <SelectContent>
                {/* In a real app, map over actual fetched datasets */}
                <SelectItem value="ds_stripe_prod">Stripe Transactions (Prod)</SelectItem>
                <SelectItem value="ds_app_events">App Analytics (Events)</SelectItem>
                <SelectItem value="ds_postgres_users">Postgres User DB</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="metric">Metric to Monitor</Label>
            <Input 
              id="metric" 
              placeholder="e.g., amount, mrr, duration" 
              value={metricColumn}
              onChange={(e) => setMetricColumn(e.target.value)}
              disabled={isLoading}
              required 
              className="bg-background font-mono text-sm"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="time_col">Time Column <span className="text-muted-foreground font-normal">(for chronological sorting)</span></Label>
          <Input 
            id="time_col" 
            placeholder="e.g., created_at, timestamp" 
            value={timeColumn}
            onChange={(e) => setTimeColumn(e.target.value)}
            disabled={isLoading}
            required 
            className="bg-background font-mono text-sm"
          />
        </div>
      </div>

      {/* SECTION 3: Orchestration Rules */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 border-b pb-2">
          <Activity className="h-5 w-5 text-emerald-500" />
          <h3 className="text-sm font-semibold tracking-tight uppercase text-muted-foreground">Detection Rules</h3>
        </div>

        {/* Sensitivity Slider */}
        <div className="space-y-4 bg-muted/30 p-4 rounded-lg border border-border">
          <div className="flex justify-between items-end">
            <Label className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              Anomaly Sensitivity (Z-Score)
            </Label>
            <span className="text-xs font-medium bg-background px-2 py-1 rounded border">
              {getSensitivityLabel(sensitivity[0])}
            </span>
          </div>
          
          <Slider
            value={sensitivity}
            onValueChange={setSensitivity}
            max={4.0}
            min={1.0}
            step={0.1}
            disabled={isLoading}
            className="py-2"
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Lower thresholds catch smaller deviations (more alerts). Higher thresholds require massive spikes/drops to trigger the RAG diagnostic pipeline (fewer, higher-signal alerts).
          </p>
        </div>

        {/* Schedule Selector */}
        <div className="space-y-2">
          <Label htmlFor="schedule" className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            Evaluation Schedule
          </Label>
          <Select required value={schedule} onValueChange={setSchedule} disabled={isLoading}>
            <SelectTrigger className="bg-background">
              <SelectValue placeholder="Select cron schedule" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="*/15 * * * *">Every 15 Minutes (High Priority)</SelectItem>
              <SelectItem value="0 * * * *">Hourly (Standard)</SelectItem>
              <SelectItem value="0 0 * * *">Daily at Midnight (Reporting)</SelectItem>
              <SelectItem value="0 0 * * 1">Weekly on Monday</SelectItem>
            </SelectContent>
          </Select>
        </div>
        
        {/* Supervisor Note */}
        <div className="flex items-center justify-between p-3 border rounded-md bg-primary/5 shadow-sm">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium tracking-tight">Supervisor Engine</span>
          </div>
          <Badge variant="secondary" className="text-[10px] font-mono uppercase tracking-wider bg-primary/10 text-primary">
            Math + LLM
          </Badge>
        </div>
      </div>

      {/* Action Footer */}
      <div className="pt-4 flex items-center justify-end border-t mt-6">
        <Button type="submit" disabled={isLoading || !datasetId || !metricColumn} className="w-full gap-2 font-medium group h-12">
          {isLoading ? (
            "Provisioning Agent..."
          ) : (
            <>
              <Sparkles className="h-5 w-5 fill-current group-hover:animate-pulse" />
              Deploy Autonomous Agent
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
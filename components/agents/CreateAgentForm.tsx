"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Target, Zap, Sparkles, Code2, AlignLeft } from "lucide-react";
import { AgentCreatePayload } from "@/types/agent";

interface CreateAgentFormProps {
  onSubmit: (payload: AgentCreatePayload) => Promise<void>;
  isLoading?: boolean;
}

export function CreateAgentForm({ onSubmit, isLoading = false }: CreateAgentFormProps) {
  // Core Configuration
  const [agentName, setAgentName] = useState("");
  const [description, setDescription] = useState("");
  const [dataset, setDataset] = useState("");
  
  // Logic Configuration
  const [promptMode, setPromptMode] = useState<string>("natural-language");
  const [nlPrompt, setNlPrompt] = useState("");
  const [sqlCondition, setSqlCondition] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    // Contextual LLM Framing: Compile the logic into a strict system prompt
    const systemPrompt = promptMode === "natural-language"
      ? `You are an autonomous analytical agent. Monitor the assigned dataset based on these instructions: ${nlPrompt}. Generate necessary DuckDB SQL to evaluate this continuously.`
      : `You are a strict SQL execution agent. Evaluate the following DuckDB condition to detect anomalies: \n\n${sqlCondition}\n\nTrigger actions only when this query returns rows.`;

    const payload: AgentCreatePayload = {
      name: agentName,
      description: description || undefined,
      system_prompt: systemPrompt,
      dataset_ids: dataset ? [dataset] : [],
    };

    await onSubmit(payload);

    // Reset form upon successful orchestration
    setAgentName("");
    setDescription("");
    setDataset("");
    setNlPrompt("");
    setSqlCondition("");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 py-2 px-1">
      {/* General Configuration */}
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name" className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-muted-foreground" />
            Agent Name
          </Label>
          <Input 
            id="name" 
            placeholder="e.g., Revenue Drop Monitor" 
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            disabled={isLoading}
            required 
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="description" className="flex items-center gap-2">
            <AlignLeft className="h-4 w-4 text-muted-foreground" />
            Description (Optional)
          </Label>
          <Input 
            id="description" 
            placeholder="Briefly describe the agent's purpose" 
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dataset" className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            Target Dataset
          </Label>
          <Select required value={dataset} onValueChange={setDataset} disabled={isLoading}>
            <SelectTrigger>
              <SelectValue placeholder="Select target data source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stripe_prod">Stripe_Transactions_Prod</SelectItem>
              <SelectItem value="user_events">User_Events_Log</SelectItem>
              <SelectItem value="postgres_replica">Postgres_Replica_DB</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="h-px bg-border/60 my-2" />

      {/* Agent Logic Configuration (No-Code vs Code) */}
      <div className="space-y-3">
        <Label>Execution Logic</Label>
        
        <Tabs value={promptMode} onValueChange={setPromptMode} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="natural-language" disabled={isLoading} className="gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Describe (AI)
            </TabsTrigger>
            <TabsTrigger value="sql" disabled={isLoading} className="gap-2">
              <Code2 className="h-4 w-4 text-muted-foreground" />
              Advanced (SQL)
            </TabsTrigger>
          </TabsList>

          {/* No-Code / Non-Technical Interface */}
          <TabsContent value="natural-language" className="space-y-2 fade-in-0 animate-in">
            <Textarea 
              placeholder="e.g., Alert me immediately if daily active users drop below 10,000 or if the error rate exceeds 2%." 
              className="resize-none h-28 bg-primary/5 border-primary/20 focus-visible:ring-primary/50 text-sm"
              value={nlPrompt}
              onChange={(e) => setNlPrompt(e.target.value)}
              required={promptMode === "natural-language"}
              disabled={isLoading}
            />
            <p className="text-[11px] text-muted-foreground">
              Our semantic router will dynamically translate your instructions into a vectorized DuckDB query.
            </p>
          </TabsContent>

          {/* Data Engineer / Technical Interface */}
          <TabsContent value="sql" className="space-y-2 fade-in-0 animate-in">
            <Textarea 
              placeholder="SELECT * FROM target_dataset WHERE anomaly_score > 0.95" 
              className="font-mono text-xs resize-none h-28 bg-muted/30 border-border focus-visible:ring-muted-foreground"
              value={sqlCondition}
              onChange={(e) => setSqlCondition(e.target.value)}
              required={promptMode === "sql"}
              disabled={isLoading}
            />
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3 text-amber-500" />
              Actions fire when this query evaluates to true (returns >= 1 row).
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Footer */}
      <div className="pt-4 flex items-center justify-end border-t mt-6">
        <Button type="submit" disabled={isLoading || !dataset} className="w-full gap-2 font-medium">
          {isLoading ? (
            "Provisioning Instance..."
          ) : promptMode === "natural-language" ? (
            <>
              <Sparkles className="h-4 w-4 fill-current" />
              Generate & Deploy Agent
            </>
          ) : (
            <>
              <Bot className="h-4 w-4" />
              Deploy SQL Agent
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
"use client";

import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Bot, Target, Zap, AlertCircle, Sparkles, Code2 } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

interface CreateAgentFormProps {
  onSuccess?: () => void;
}

export function CreateAgentForm({ onSuccess }: CreateAgentFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // State for the payload
  const [agentName, setAgentName] = useState("");
  const [dataset, setDataset] = useState("");
  const [promptMode, setPromptMode] = useState("natural-language");
  const [nlPrompt, setNlPrompt] = useState("");
  const [sqlCondition, setSqlCondition] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Payload construction: If in NL mode, the backend's semantic router 
    // will intercept this and compile the SQL dynamically before saving.
    const payload = {
      name: agentName,
      dataset: dataset,
      mode: promptMode,
      logic: promptMode === "natural-language" ? nlPrompt : sqlCondition
    };

    try {
      // Simulate API transit time 
      await new Promise(resolve => setTimeout(resolve, 1200));
      console.log("Deploying agent payload:", payload);
      if (onSuccess) onSuccess();
    } catch (err) {
      setError("Failed to deploy agent. Please check your connection.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 py-4">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Deployment Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* General Configuration */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
            required 
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="dataset" className="flex items-center gap-2">
            <Target className="h-4 w-4 text-muted-foreground" />
            Target Dataset
          </Label>
          <Select required value={dataset} onValueChange={setDataset}>
            <SelectTrigger>
              <SelectValue placeholder="Select dataset" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stripe_prod">Stripe_Transactions_Prod</SelectItem>
              <SelectItem value="user_events">User_Events_Log</SelectItem>
              <SelectItem value="postgres_replica">Postgres_Replica_DB</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="h-px bg-border my-2" />

      {/* Agent Logic Configuration (No-Code vs Code) */}
      <div className="space-y-3">
        <Label>When should this agent trigger?</Label>
        
        <Tabs value={promptMode} onValueChange={setPromptMode} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="natural-language" className="gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Describe (AI)
            </TabsTrigger>
            <TabsTrigger value="sql" className="gap-2">
              <Code2 className="h-4 w-4 text-muted-foreground" />
              Advanced (SQL)
            </TabsTrigger>
          </TabsList>

          {/* No-Code / Non-Technical Interface */}
          <TabsContent value="natural-language" className="space-y-2">
            <Textarea 
              placeholder="e.g., Alert me immediately if daily active users drop below 10,000 or if the error rate exceeds 2%." 
              className="resize-none h-24 bg-primary/5 border-primary/20 focus-visible:ring-primary/50"
              value={nlPrompt}
              onChange={(e) => setNlPrompt(e.target.value)}
              required={promptMode === "natural-language"}
            />
            <p className="text-[11px] text-muted-foreground">
              Our AI will translate your instructions into an autonomous monitoring script.
            </p>
          </TabsContent>

          {/* Data Engineer / Technical Interface */}
          <TabsContent value="sql" className="space-y-2">
            <Textarea 
              placeholder="SELECT * FROM target WHERE anomaly_score > 0.9" 
              className="font-mono text-sm resize-none h-24 bg-muted/50 border-border focus-visible:ring-muted-foreground"
              value={sqlCondition}
              onChange={(e) => setSqlCondition(e.target.value)}
              required={promptMode === "sql"}
            />
            <p className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Zap className="h-3 w-3" />
              Actions fire when this query returns one or more rows.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      {/* Action Footers */}
      <div className="pt-4 flex items-center justify-end gap-3 border-t mt-4">
        <Button type="button" variant="ghost" onClick={onSuccess}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !dataset} className="min-w-[120px] gap-2">
          {isSubmitting ? (
            "Deploying..."
          ) : promptMode === "natural-language" ? (
            <>
              <Sparkles className="h-4 w-4 fill-current" />
              Generate & Deploy
            </>
          ) : (
            "Deploy Agent"
          )}
        </Button>
      </div>
    </form>
  );
}
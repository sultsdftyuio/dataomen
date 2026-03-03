"use client";

import React, { useState } from 'react';
import { AgentRuleCreate } from '@/types/agent';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface CreateAgentFormProps {
  onSubmit: (agent: AgentRuleCreate) => Promise<void>;
  isLoading: boolean;
}

export const CreateAgentForm: React.FC<CreateAgentFormProps> = ({ onSubmit, isLoading }) => {
  const [formData, setFormData] = useState<AgentRuleCreate>({
    dataset_id: '',
    metric_column: '',
    time_column: '',
    cron_schedule: '0 8 * * *', // Default: 8 AM Daily
    sensitivity_threshold: 2.0,
    notification_channels: [{ provider: 'slack', target: '', enabled: true }]
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6 bg-card p-6 rounded-lg border shadow-sm">
      <div>
        <h3 className="text-lg font-medium">Create Autonomous Agent</h3>
        <p className="text-sm text-muted-foreground">Set up proactive monitoring for your datasets.</p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="dataset_id">Dataset ID</Label>
          <Input 
            id="dataset_id" 
            required 
            placeholder="e.g., sales_data_q3"
            value={formData.dataset_id}
            onChange={(e) => setFormData({...formData, dataset_id: e.target.value})}
          />
        </div>
        
        <div className="space-y-2">
          <Label htmlFor="cron_schedule">Schedule (Cron)</Label>
          <Input 
            id="cron_schedule" 
            required 
            placeholder="0 8 * * *"
            value={formData.cron_schedule}
            onChange={(e) => setFormData({...formData, cron_schedule: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="metric_column">Metric to Monitor</Label>
          <Input 
            id="metric_column" 
            required 
            placeholder="e.g., total_revenue"
            value={formData.metric_column}
            onChange={(e) => setFormData({...formData, metric_column: e.target.value})}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="time_column">Time Dimension</Label>
          <Input 
            id="time_column" 
            required 
            placeholder="e.g., transaction_date"
            value={formData.time_column}
            onChange={(e) => setFormData({...formData, time_column: e.target.value})}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="slack_webhook">Slack Webhook URL</Label>
        <Input 
          id="slack_webhook" 
          required 
          placeholder="https://hooks.slack.com/services/..."
          value={formData.notification_channels[0].target}
          onChange={(e) => setFormData({
            ...formData, 
            notification_channels: [{ provider: 'slack', target: e.target.value, enabled: true }]
          })}
        />
      </div>

      <Button type="submit" disabled={isLoading} className="w-full">
        {isLoading ? 'Deploying Agent...' : 'Deploy Agent'}
      </Button>
    </form>
  );
};
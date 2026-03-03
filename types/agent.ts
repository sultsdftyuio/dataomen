export interface NotificationChannel {
  provider: 'slack' | 'teams' | 'email';
  target: string;
  enabled: boolean;
}

export interface AgentRuleBase {
  dataset_id: string;
  metric_column: string;
  time_column: string;
  cron_schedule: string;
  sensitivity_threshold: number;
  notification_channels: NotificationChannel[];
}

export interface AgentRuleCreate extends AgentRuleBase {}

export interface AgentRuleInDB extends AgentRuleBase {
  id: string;
  tenant_id: string;
  created_at: string;
  last_run_at: string | null;
  is_active: boolean;
}
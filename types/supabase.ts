export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json }
  | Json[];

type GenericTable = {
  Row: Record<string, Json>;
  Insert: Record<string, Json>;
  Update: Record<string, Json>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          tenant_id: string;
          display_name: string | null;
          status: string;
          plan: string | null;
          created_at: string | null;
          updated_at: string | null;
        };
        Insert: {
          tenant_id: string;
          display_name?: string | null;
          status?: string;
          plan?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Update: {
          tenant_id?: string;
          display_name?: string | null;
          status?: string;
          plan?: string | null;
          created_at?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      tenant_settings: {
        Row: {
          tenant_id: string;
          company_name: string | null;
          reply_to_email: string | null;
          sender_email: string | null;
          stripe_account_id: string | null;
          email_provider_status: boolean | null;
          api_key: string | null;
          key_last_updated: string | null;
          updated_at: string | null;
        };
        Insert: {
          tenant_id: string;
          company_name?: string | null;
          reply_to_email?: string | null;
          sender_email?: string | null;
          stripe_account_id?: string | null;
          email_provider_status?: boolean | null;
          api_key?: string | null;
          key_last_updated?: string | null;
          updated_at?: string | null;
        };
        Update: {
          tenant_id?: string;
          company_name?: string | null;
          reply_to_email?: string | null;
          sender_email?: string | null;
          stripe_account_id?: string | null;
          email_provider_status?: boolean | null;
          api_key?: string | null;
          key_last_updated?: string | null;
          updated_at?: string | null;
        };
        Relationships: [];
      };
      tenant_users: {
        Row: {
          tenant_id: string;
          user_id: string;
          role: string;
          created_at: string | null;
        };
        Insert: {
          tenant_id: string;
          user_id: string;
          role?: string;
          created_at?: string | null;
        };
        Update: {
          tenant_id?: string;
          user_id?: string;
          role?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      api_keys: {
        Row: {
          id: string;
          tenant_id: string;
          key_id: string;
          key_hash: string;
          key_last4: string;
          created_at: string | null;
          created_by: string | null;
          revoked_at: string | null;
          last_used_at: string | null;
          label: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          key_id: string;
          key_hash: string;
          key_last4: string;
          created_at?: string | null;
          created_by?: string | null;
          revoked_at?: string | null;
          last_used_at?: string | null;
          label?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          key_id?: string;
          key_hash?: string;
          key_last4?: string;
          created_at?: string | null;
          created_by?: string | null;
          revoked_at?: string | null;
          last_used_at?: string | null;
          label?: string | null;
        };
        Relationships: [];
      };
      events: {
        Row: {
          id: string;
          tenant_id: string;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id: string;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string;
          created_at?: string | null;
        };
        Relationships: [];
      };
      anomaly_states: {
        Row: {
          id: string;
          tenant_id: string | null;
          agent_id: string | null;
          metric: string | null;
          date: string | null;
          filters: Json[] | null;
          diagnostic_summary: string | null;
          status: string | null;
          created_at: string | null;
        };
        Insert: {
          id?: string;
          tenant_id?: string | null;
          agent_id?: string | null;
          metric?: string | null;
          date?: string | null;
          filters?: Json[] | null;
          diagnostic_summary?: string | null;
          status?: string | null;
          created_at?: string | null;
        };
        Update: {
          id?: string;
          tenant_id?: string | null;
          agent_id?: string | null;
          metric?: string | null;
          date?: string | null;
          filters?: Json[] | null;
          diagnostic_summary?: string | null;
          status?: string | null;
          created_at?: string | null;
        };
        Relationships: [];
      };
      manual_interventions: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
      churn_risk_state: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
      recovery_emails: {
        Row: Record<string, any>;
        Insert: Record<string, any>;
        Update: Record<string, any>;
        Relationships: [];
      };
    } & Record<string, GenericTable>;
    Views: Record<string, never>;
    Functions: Record<string, { Args: Record<string, Json>; Returns: Json }>;
    Enums: Record<string, string>;
    CompositeTypes: Record<string, unknown>;
  };
};
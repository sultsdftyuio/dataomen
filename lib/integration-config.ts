import { z } from 'zod'
import {
  Database, CheckCircle2, AlertCircle, ShoppingBag, 
  CreditCard, Zap, Droplet, Server, Box, 
  TrendingDown, DollarSign, Users, CheckSquare, 
  Wifi, KeyRound, Layers, Sparkles, BarChart2
} from 'lucide-react'

import type { IntegrationConfig, BackendPhaseKey, PhaseMeta } from '@/types/integration'

// ═════════════════════════════════════════════════════════════════════════════
// CENTRALIZED VALIDATION (Zod)
// ═════════════════════════════════════════════════════════════════════════════

export const Validation = {
  stripe: z.object({
    api_key: z.string().min(10).regex(/^(sk|rk)_/, 'Must start with sk_ or rk_')
  }),
  supabase: z.object({
    connection_string: z.string().min(10).regex(/^postgres(ql)?:\/\//, 'Must start with postgres://')
  }),
  vercel: z.object({
    connection_string: z.string().min(10).regex(/^postgres(ql)?:\/\//, 'Must start with postgres://')
  }),
  lemonsqueezy: z.object({
    api_key: z.string().min(20)
  }),
  railway: z.object({
    connection_string: z.string().min(10).regex(/^postgres(ql)?:\/\//, 'Must start with postgres://')
  }),
  shopify: z.object({
    shop_url: z.string().min(3).refine(v => v.endsWith('.myshopify.com') || !v.includes('.'), {
      message: 'Enter store name or full .myshopify.com domain'
    })
  }),
}

export function validateField(schema: z.ZodObject<any>, name: string, value: string): string | null {
  const result = schema.safeParse({ [name]: value })
  if (!result.success) {
    const error = result.error.errors.find(e => e.path[0] === name)
    return error?.message || null
  }
  return null
}

export function validateForm(schema: z.ZodObject<any>, data: Record<string, string>): Record<string, string> {
  const result = schema.safeParse(data)
  if (!result.success) {
    const errors: Record<string, string> = {}
    result.error.errors.forEach(err => {
      errors[err.path[0] as string] = err.message
    })
    return errors
  }
  return {}
}

// ═════════════════════════════════════════════════════════════════════════════
// ENHANCED PHASE METADATA - Emotional & Technical Feedback
// ═════════════════════════════════════════════════════════════════════════════

export const PHASE_META: Record<BackendPhaseKey, PhaseMeta> = {
  connecting: {
    label: 'Connecting…',
    message: 'Establishing secure connection…',
    subMessage: 'Encrypting credentials with AES-256-GCM',
    icon: Wifi,
    color: 'text-blue-500',
    progress: 15,
  },
  authenticating: {
    label: 'Authenticating…',
    message: 'Verifying your credentials…',
    subMessage: 'Checking read-only access permissions',
    icon: KeyRound,
    color: 'text-amber-500',
    progress: 30,
  },
  validating_schema: {
    label: 'Validating schema…',
    message: 'Analyzing your database structure…',
    subMessage: 'Detecting tables, columns, and relationships',
    icon: Database,
    color: 'text-purple-500',
    progress: 50,
  },
  mapping_tables: {
    label: 'Mapping tables…',
    message: 'Understanding your data model…',
    subMessage: 'Matching tables to analytics patterns',
    icon: Layers,
    color: 'text-indigo-500',
    progress: 75,
  },
  generating_insights: {
    label: 'Generating insights…',
    message: 'Building your dashboards…',
    subMessage: 'Creating personalized analytics views',
    icon: Sparkles,
    color: 'text-emerald-500',
    progress: 90,
  },
  done: {
    label: 'Done',
    message: 'Connection successful!',
    subMessage: 'Your data is ready for analysis',
    icon: CheckCircle2,
    color: 'text-emerald-500',
    progress: 100,
  },
  error: {
    label: 'Error',
    message: 'Connection failed',
    subMessage: "We'll help you fix this",
    icon: AlertCircle,
    color: 'text-red-500',
    progress: 100,
  },
}

// ═════════════════════════════════════════════════════════════════════════════
// CATEGORIES & INTEGRATION CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════════

export const CATEGORIES = ['Database', 'Payment Provider', 'E-commerce'] as const

export const INTEGRATIONS: IntegrationConfig[] = [
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'Payment Provider',
    authType: 'credentials',
    description: '1-click connect for MRR, churn, and subscription RAG dashboards.',
    icon: CreditCard,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    isPopular: true,
    validationSchema: Validation.stripe,
    insights: [
      { label: 'MRR dashboard', icon: DollarSign, color: 'text-emerald-600', description: 'Track monthly recurring revenue trends' },
      { label: 'Churn analysis', icon: TrendingDown, color: 'text-red-500', description: 'Identify at-risk customers' },
      { label: 'Revenue trends', icon: BarChart2, color: 'text-blue-600', description: 'Visualize growth patterns' },
    ],
    tableInsights: {
      customers: { purpose: 'Customer lifecycle tracking', dashboards: ['LTV Analysis', 'Cohort Retention'], confidence: 'high' },
      subscriptions: { purpose: 'Revenue & churn analytics', dashboards: ['MRR Trends', 'Churn Prediction'], confidence: 'high' },
      charges: { purpose: 'Transaction analysis', dashboards: ['Revenue Breakdown', 'Payment Failures'], confidence: 'medium' },
    },
    fields: [{
      name: 'api_key',
      label: 'Restricted API Key',
      type: 'password',
      placeholder: 'rk_live_…',
      helperText: 'Create a restricted key in Stripe with read-only access.',
      whyWeNeedThis: 'Used to fetch subscription lifecycle events, customer churn signals, and MRR data. We never store your full secret key.',
      validationHint: 'Must start with rk_ or sk_',
      autoDetectPattern: /^(sk|rk)_(live|test)_/,
    }]
  },
  {
    id: 'supabase',
    name: 'Supabase',
    category: 'Database',
    authType: 'uri',
    description: 'Instantly connect your production Supabase PostgreSQL database.',
    icon: Box,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    isPopular: true,
    validationSchema: Validation.supabase,
    insights: [
      { label: 'User growth', icon: Users, color: 'text-blue-600', description: 'Track signup and activation metrics' },
      { label: 'Event funnels', icon: BarChart2, color: 'text-purple-600', description: 'Analyze user journey paths' },
      { label: 'Retention curves', icon: TrendingDown, color: 'text-amber-500', description: 'Measure user stickiness' },
    ],
    tableInsights: {
      users: { purpose: 'User growth & segmentation', dashboards: ['User Growth', 'Activation Funnel'], confidence: 'high' },
      subscriptions: { purpose: 'Subscription analytics', dashboards: ['MRR Tracking', 'Plan Distribution'], confidence: 'high' },
      events: { purpose: 'Product analytics', dashboards: ['Event Funnels', 'Feature Usage'], confidence: 'medium' },
    },
    fields: [{
      name: 'connection_string',
      label: 'Connection String (URI)',
      type: 'password',
      placeholder: 'postgresql://postgres.[ref]:[password]@aws-0-region.pooler.supabase.com:6543/postgres',
      helperText: 'Found in Supabase → Settings → Database → Connection string.',
      whyWeNeedThis: 'We run read-only queries to map your schema and auto-generate analytics dashboards. We never write to your database.',
      validationHint: 'Must start with postgres://',
      autofillSource: true,
      autoDetectPattern: /^postgres(ql)?:\/\/postgres\./,
    }]
  },
  {
    id: 'vercel',
    name: 'Vercel Postgres',
    category: 'Database',
    authType: 'uri',
    description: 'Sync users and events directly from your Vercel-hosted DB.',
    icon: Zap,
    color: 'text-slate-900 bg-slate-100 border-slate-200',
    isPopular: true,
    validationSchema: Validation.vercel,
    insights: [
      { label: 'Account activity', icon: Users, color: 'text-blue-600', description: 'Monitor user engagement' },
      { label: 'Purchase trends', icon: DollarSign, color: 'text-emerald-600', description: 'Track revenue patterns' },
    ],
    tableInsights: {
      accounts: { purpose: 'User account analytics', dashboards: ['User Activity', 'Account Health'], confidence: 'high' },
      sessions: { purpose: 'Engagement tracking', dashboards: ['Session Duration', 'Active Users'], confidence: 'medium' },
      purchases: { purpose: 'Revenue analysis', dashboards: ['Sales Trends', 'Purchase Funnel'], confidence: 'high' },
    },
    fields: [{
      name: 'connection_string',
      label: 'POSTGRES_URL',
      type: 'password',
      placeholder: 'postgres://default:***@ep-mute-***.us-east-1.aws.neon.tech:5432/verceldb',
      helperText: 'Copy POSTGRES_URL from Vercel → Storage → your DB → .env.local tab.',
      whyWeNeedThis: 'Allows Arcli to query your Neon-backed Vercel DB in read-only mode to power dashboards.',
      validationHint: 'Must start with postgres://',
      autofillSource: true,
      autoDetectPattern: /^postgres(ql)?:\/\/default:/,
    }]
  },
  {
    id: 'lemonsqueezy',
    name: 'Lemon Squeezy',
    category: 'Payment Provider',
    authType: 'credentials',
    description: 'Sync software sales, licenses, and affiliate data.',
    icon: Droplet,
    color: 'text-purple-600 bg-purple-50 border-purple-100',
    validationSchema: Validation.lemonsqueezy,
    insights: [
      { label: 'Revenue by product', icon: DollarSign, color: 'text-emerald-600', description: 'See top-performing products' },
      { label: 'License activations', icon: CheckSquare, color: 'text-blue-600', description: 'Track software usage' },
    ],
    tableInsights: {
      orders: { purpose: 'Sales analytics', dashboards: ['Revenue Overview', 'Product Performance'], confidence: 'high' },
      licenses: { purpose: 'License management', dashboards: ['Activation Rate', 'License Health'], confidence: 'high' },
    },
    fields: [{
      name: 'api_key',
      label: 'API Key',
      type: 'password',
      placeholder: 'eyJ0eXAiOiJKV1QiLCJhbG…',
      helperText: 'Generate from Lemon Squeezy → Settings → API.',
      whyWeNeedThis: 'Used to pull order history, license activations, and subscription data for your revenue dashboard.',
      autoDetectPattern: /^eyJ/,
    }]
  },
  {
    id: 'railway',
    name: 'Railway / Render',
    category: 'Database',
    authType: 'uri',
    description: 'Connect standard managed PostgreSQL databases instantly.',
    icon: Server,
    color: 'text-blue-600 bg-blue-50 border-blue-100',
    validationSchema: Validation.railway,
    tableInsights: {
      customers: { purpose: 'Customer data analytics', dashboards: ['Customer Insights', 'Segmentation'], confidence: 'high' },
      orders: { purpose: 'Order & revenue tracking', dashboards: ['Order Volume', 'Revenue Trends'], confidence: 'high' },
    },
    fields: [{
      name: 'connection_string',
      label: 'External Database URL',
      type: 'password',
      placeholder: 'postgresql://user:pass@host:port/db',
      helperText: 'Found in Railway/Render database settings under "External URL".',
      whyWeNeedThis: 'Powers read-only schema detection and dashboard generation. Ensure Arcli IPs are allowlisted.',
      validationHint: 'Must start with postgres://',
      autofillSource: true,
      autoDetectPattern: /^postgres(ql)?:\/\//,
    }]
  },
  {
    id: 'shopify',
    name: 'Shopify',
    category: 'E-commerce',
    authType: 'oauth',
    description: 'Sync high-frequency e-commerce orders and customers.',
    icon: ShoppingBag,
    color: 'text-green-600 bg-green-50 border-green-100',
    validationSchema: Validation.shopify,
    insights: [
      { label: 'Order volume', icon: BarChart2, color: 'text-green-600', description: 'Track daily sales performance' },
      { label: 'Customer LTV', icon: Users, color: 'text-blue-600', description: 'Analyze customer value over time' },
      { label: 'Revenue trends', icon: DollarSign, color: 'text-emerald-600', description: 'Monitor business growth' },
    ],
    tableInsights: {
      orders: { purpose: 'Sales & order analytics', dashboards: ['Order Dashboard', 'Sales Trends'], confidence: 'high' },
      customers: { purpose: 'Customer analytics', dashboards: ['Customer LTV', 'Repeat Purchase Rate'], confidence: 'high' },
      products: { purpose: 'Product performance', dashboards: ['Top Products', 'Inventory Insights'], confidence: 'medium' },
    },
    fields: [{
      name: 'shop_url',
      label: 'Shop Domain',
      type: 'text',
      placeholder: 'my-store.myshopify.com',
      helperText: 'Enter your exact myshopify.com domain.',
      whyWeNeedThis: 'We use OAuth to securely access your order and customer data — no passwords stored.',
      validationHint: 'e.g. my-store or my-store.myshopify.com',
      autoDetectPattern: /\.myshopify\.com$/,
    }]
  }
]
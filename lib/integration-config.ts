// lib/integration-config.ts
import { z } from 'zod'
import {
  Database, CheckCircle2, AlertCircle, ShoppingBag,
  CreditCard, Zap, Droplet, Server, Box,
  TrendingDown, DollarSign, Users, CheckSquare,
  Wifi, KeyRound, Layers, Sparkles, BarChart2
} from 'lucide-react'

import type {
  IntegrationConfig,
  BackendPhaseKey,
  PhaseMeta,
  IntegrationField,
  InsightPreview,
  TableInsight,
  IntegrationType,
  AuthParadigm
} from '@/types/integration'

// ═════════════════════════════════════════════════════════════════════════════
// DOMAIN LAYER & TYPES (Pure, Backend-Shareable)
// ═════════════════════════════════════════════════════════════════════════════

export const CATEGORIES = ['Database', 'Payment Provider', 'E-commerce'] as const
const CATEGORY_SET = new Set(CATEGORIES)

export type SecurityPolicy = {
  encryption: 'AES-256' | 'OAuth'
  ephemeral: boolean
  readOnly: boolean
  enforce: (ctx: unknown) => void
}

export type IntegrationHooks = {
  transform?: (rawData: unknown) => unknown
  postConnect?: () => Promise<void>
  onError?: (error: unknown) => void
}

type TableName = string

export type DomainConfig = {
  id: IntegrationType
  category: typeof CATEGORIES[number]
  authType: AuthParadigm
  security: SecurityPolicy
  tableInsights?: Record<TableName, TableInsight>
  hooks?: IntegrationHooks
}

// FIX 1: Make enforcement explicit, not implicit. Eliminates latent kill switches.
const noopEnforce: SecurityPolicy['enforce'] = () => { }

export const createSecurity = (
  policy: Omit<SecurityPolicy, 'enforce'> & { enforce?: SecurityPolicy['enforce'] }
): SecurityPolicy => ({
  ...policy,
  enforce: policy.enforce ?? noopEnforce,
})

// FIX 3: True type locking. Prevents accidental keys and guarantees closed-world consistency.
type SupportedIntegrations = 'stripe' | 'supabase' | 'vercel' | 'lemonsqueezy' | 'railway' | 'shopify'

export const INTEGRATION_DOMAIN = {
  stripe: {
    id: 'stripe' as IntegrationType,
    category: 'Payment Provider',
    authType: 'credentials',
    security: createSecurity({ encryption: 'AES-256', ephemeral: true, readOnly: true }),
    tableInsights: {
      customers: { purpose: 'Customer lifecycle tracking', dashboards: ['LTV Analysis', 'Cohort Retention'], confidence: 'high' },
      subscriptions: { purpose: 'Revenue & churn analytics', dashboards: ['MRR Trends', 'Churn Prediction'], confidence: 'high' },
      charges: { purpose: 'Transaction analysis', dashboards: ['Revenue Breakdown', 'Payment Failures'], confidence: 'medium' },
    },
  },
  supabase: {
    id: 'supabase' as IntegrationType,
    category: 'Database',
    authType: 'uri',
    security: createSecurity({ encryption: 'AES-256', ephemeral: false, readOnly: true }),
    tableInsights: {
      users: { purpose: 'User growth & segmentation', dashboards: ['User Growth', 'Activation Funnel'], confidence: 'high' },
      subscriptions: { purpose: 'Subscription analytics', dashboards: ['MRR Tracking', 'Plan Distribution'], confidence: 'high' },
      events: { purpose: 'Product analytics', dashboards: ['Event Funnels', 'Feature Usage'], confidence: 'medium' },
    },
  },
  vercel: {
    id: 'vercel' as IntegrationType,
    category: 'Database',
    authType: 'uri',
    security: createSecurity({ encryption: 'AES-256', ephemeral: false, readOnly: true }),
    tableInsights: {
      accounts: { purpose: 'User account analytics', dashboards: ['User Activity', 'Account Health'], confidence: 'high' },
      sessions: { purpose: 'Engagement tracking', dashboards: ['Session Duration', 'Active Users'], confidence: 'medium' },
      purchases: { purpose: 'Revenue analysis', dashboards: ['Sales Trends', 'Purchase Funnel'], confidence: 'high' },
    },
  },
  lemonsqueezy: {
    id: 'lemonsqueezy' as IntegrationType,
    category: 'Payment Provider',
    authType: 'credentials',
    security: createSecurity({ encryption: 'AES-256', ephemeral: true, readOnly: true }),
    tableInsights: {
      orders: { purpose: 'Sales analytics', dashboards: ['Revenue Overview', 'Product Performance'], confidence: 'high' },
      licenses: { purpose: 'License management', dashboards: ['Activation Rate', 'License Health'], confidence: 'high' },
    },
  },
  railway: {
    id: 'railway' as IntegrationType,
    category: 'Database',
    authType: 'uri',
    security: createSecurity({ encryption: 'AES-256', ephemeral: false, readOnly: true }),
    tableInsights: {
      customers: { purpose: 'Customer data analytics', dashboards: ['Customer Insights', 'Segmentation'], confidence: 'high' },
      orders: { purpose: 'Order & revenue tracking', dashboards: ['Order Volume', 'Revenue Trends'], confidence: 'high' },
    },
  },
  shopify: {
    id: 'shopify' as IntegrationType,
    category: 'E-commerce',
    authType: 'oauth',
    security: createSecurity({ encryption: 'OAuth', ephemeral: false, readOnly: true }),
    tableInsights: {
      orders: { purpose: 'Sales & order analytics', dashboards: ['Order Dashboard', 'Sales Trends'], confidence: 'high' },
      customers: { purpose: 'Customer analytics', dashboards: ['Customer LTV', 'Repeat Purchase Rate'], confidence: 'high' },
      products: { purpose: 'Product performance', dashboards: ['Top Products', 'Inventory Insights'], confidence: 'medium' },
    },
  }
} as const satisfies Record<SupportedIntegrations, DomainConfig>

export type IntegrationKey = keyof typeof INTEGRATION_DOMAIN

// ═════════════════════════════════════════════════════════════════════════════
// CENTRALIZED VALIDATION (Zod)
// ═════════════════════════════════════════════════════════════════════════════

const REGEX = {
  STRIPE_KEY: /^(sk|rk)_(live|test)_[A-Za-z0-9]{16,}$/,
  SHOPIFY_DOMAIN: /^[a-zA-Z0-9-]+\.myshopify\.com$/,
}

const isValidPostgresUri = (val: string) => {
  try {
    const url = new URL(val)

    const validProtocol = url.protocol === 'postgres:' || url.protocol === 'postgresql:'
    const hasHost = Boolean(url.hostname)
    const hasDb = Boolean(url.pathname && url.pathname.length > 1)
    const hasUser = Boolean(url.username)
    const validPort = !url.port || (Number(url.port) > 0 && Number(url.port) < 65536)

    return validProtocol && hasHost && hasDb && hasUser && validPort
  } catch {
    return false
  }
}

// FIX 4: Removed Record casting to retain strict Zod schema type inference.
export const Validation = {
  stripe: z.object({
    api_key: z.string().regex(REGEX.STRIPE_KEY, 'Invalid Stripe key format (must be sk_ or rk_ followed by live/test and 16+ chars)')
  }),
  supabase: z.object({
    connection_string: z.string().refine(isValidPostgresUri, 'Invalid Postgres URI (must contain valid credentials, host, and db)')
  }),
  vercel: z.object({
    connection_string: z.string().refine(isValidPostgresUri, 'Invalid Postgres URI (must contain valid credentials, host, and db)')
  }),
  lemonsqueezy: z.object({
    api_key: z.string().min(20, 'API key must be at least 20 characters')
  }),
  railway: z.object({
    connection_string: z.string().refine(isValidPostgresUri, 'Invalid Postgres URI (must contain valid credentials, host, and db)')
  }),
  shopify: z.object({
    shop_url: z.string().regex(REGEX.SHOPIFY_DOMAIN, 'Enter valid .myshopify.com domain')
  }),
}

export type ValidationMap = typeof Validation

export function validateField<
  T extends z.ZodRawShape,
  K extends keyof T
>(schema: z.ZodObject<T>, name: K, value: unknown): string | null {
  const fieldSchema = schema.shape[name]
  const result = fieldSchema.safeParse(value)

  if (!result.success) {
    return result.error.errors[0]?.message || null
  }
  return null
}

export function validateForm<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
  data: Record<string, unknown>
): Record<string, string> {
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
// ENHANCED PHASE METADATA
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
// UI LAYER (Presentation, Icons, Forms)
// ═════════════════════════════════════════════════════════════════════════════

export type IntegrationUI = {
  name: string
  description: string
  icon: React.ElementType
  color: string
  isPopular?: boolean
  insights?: InsightPreview[]
  fields: IntegrationField[]
}

const INTEGRATION_UI: Record<IntegrationKey, IntegrationUI> = {
  stripe: {
    name: 'Stripe',
    description: '1-click connect for MRR, churn, and subscription RAG dashboards.',
    icon: CreditCard,
    color: 'text-indigo-600 bg-indigo-50 border-indigo-100',
    isPopular: true,
    insights: [
      { label: 'MRR dashboard', icon: DollarSign, color: 'text-emerald-600', description: 'Track monthly recurring revenue trends' },
      { label: 'Churn analysis', icon: TrendingDown, color: 'text-red-500', description: 'Identify at-risk customers' },
      { label: 'Revenue trends', icon: BarChart2, color: 'text-blue-600', description: 'Visualize growth patterns' },
    ],
    fields: [{
      name: 'api_key',
      label: 'Restricted API Key',
      type: 'password',
      placeholder: 'rk_live_…',
      helperText: 'Create a restricted key in Stripe with read-only access.',
      whyWeNeedThis: 'Used to fetch subscription lifecycle events, customer churn signals, and MRR data.',
      validationHint: 'Must start with rk_live_ or sk_live_',
    }]
  },
  supabase: {
    name: 'Supabase',
    description: 'Instantly connect your production Supabase PostgreSQL database.',
    icon: Box,
    color: 'text-emerald-600 bg-emerald-50 border-emerald-100',
    isPopular: true,
    insights: [
      { label: 'User growth', icon: Users, color: 'text-blue-600', description: 'Track signup and activation metrics' },
      { label: 'Event funnels', icon: BarChart2, color: 'text-purple-600', description: 'Analyze user journey paths' },
      { label: 'Retention curves', icon: TrendingDown, color: 'text-amber-500', description: 'Measure user stickiness' },
    ],
    fields: [{
      name: 'connection_string',
      label: 'Connection String (URI)',
      type: 'password',
      placeholder: 'postgresql://postgres.[ref]:[password]@aws-0-region.pooler.supabase.com:6543/postgres',
      helperText: 'Found in Supabase → Settings → Database → Connection string.',
      whyWeNeedThis: 'Allows Arcli to securely map your schema and auto-generate analytics dashboards.',
      validationHint: 'Must start with postgres://',
      autofillSource: true,
    }]
  },
  vercel: {
    name: 'Vercel Postgres',
    description: 'Sync users and events directly from your Vercel-hosted DB.',
    icon: Zap,
    color: 'text-slate-900 bg-slate-100 border-slate-200',
    isPopular: true,
    insights: [
      { label: 'Account activity', icon: Users, color: 'text-blue-600', description: 'Monitor user engagement' },
      { label: 'Purchase trends', icon: DollarSign, color: 'text-emerald-600', description: 'Track revenue patterns' },
    ],
    fields: [{
      name: 'connection_string',
      label: 'POSTGRES_URL',
      type: 'password',
      placeholder: 'postgres://default:***@ep-mute-***.us-east-1.aws.neon.tech:5432/verceldb',
      helperText: 'Copy POSTGRES_URL from Vercel → Storage → your DB → .env.local tab.',
      whyWeNeedThis: 'Allows Arcli to query your Neon-backed Vercel DB to power dynamic dashboards.',
      validationHint: 'Must start with postgres://',
      autofillSource: true,
    }]
  },
  lemonsqueezy: {
    name: 'Lemon Squeezy',
    description: 'Sync software sales, licenses, and affiliate data.',
    icon: Droplet,
    color: 'text-purple-600 bg-purple-50 border-purple-100',
    insights: [
      { label: 'Revenue by product', icon: DollarSign, color: 'text-emerald-600', description: 'See top-performing products' },
      { label: 'License activations', icon: CheckSquare, color: 'text-blue-600', description: 'Track software usage' },
    ],
    fields: [{
      name: 'api_key',
      label: 'API Key',
      type: 'password',
      placeholder: 'eyJ0eXAiOiJKV1QiLCJhbG…',
      helperText: 'Generate from Lemon Squeezy → Settings → API.',
      whyWeNeedThis: 'Used to pull order history, license activations, and subscription data for your revenue dashboard.',
    }]
  },
  railway: {
    name: 'Railway / Render',
    description: 'Connect standard managed PostgreSQL databases instantly.',
    icon: Server,
    color: 'text-blue-600 bg-blue-50 border-blue-100',
    fields: [{
      name: 'connection_string',
      label: 'External Database URL',
      type: 'password',
      placeholder: 'postgresql://user:pass@host:port/db',
      helperText: 'Found in Railway/Render database settings under "External URL".',
      whyWeNeedThis: 'Powers schema detection and dashboard generation. Ensure Arcli IPs are allowlisted.',
      validationHint: 'Must start with postgres://',
      autofillSource: true,
    }]
  },
  shopify: {
    name: 'Shopify',
    description: 'Sync high-frequency e-commerce orders and customers.',
    icon: ShoppingBag,
    color: 'text-green-600 bg-green-50 border-green-100',
    insights: [
      { label: 'Order volume', icon: BarChart2, color: 'text-green-600', description: 'Track daily sales performance' },
      { label: 'Customer LTV', icon: Users, color: 'text-blue-600', description: 'Analyze customer value over time' },
      { label: 'Revenue trends', icon: DollarSign, color: 'text-emerald-600', description: 'Monitor business growth' },
    ],
    fields: [{
      name: 'shop_url',
      label: 'Shop Domain',
      type: 'text',
      placeholder: 'my-store.myshopify.com',
      helperText: 'Enter your exact myshopify.com domain.',
      whyWeNeedThis: 'Connects securely via OAuth to securely access your order and customer data.',
      validationHint: 'e.g. my-store.myshopify.com',
    }]
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// COMPOSITION & SAFETY INVARIANTS
// ═════════════════════════════════════════════════════════════════════════════

// FIX 5: Runtime guard for category drift mapping
function assertValidCategory(category: string) {
  if (!CATEGORY_SET.has(category as any)) {
    throw new Error(`Invalid or drifted category encountered: ${category}`)
  }
}

// FIX 2: Bidirectional Invariant. Ensures UI strictly mirrors underlying Validation schemas.
function assertFieldCoverage(fields: IntegrationField[], schema: z.ZodObject<any>) {
  const schemaKeys = Object.keys(schema.shape)
  const fieldNames = fields.map(f => f.name)

  // Verify UI fields exist in schema
  for (const field of fieldNames) {
    if (!schemaKeys.includes(field)) {
      throw new Error(`Missing Zod validation for UI field: ${field}`)
    }
  }

  // Verify all schema keys are represented in UI fields
  for (const key of schemaKeys) {
    if (!fieldNames.includes(key)) {
      throw new Error(`Missing UI field to satisfy Zod schema key: ${key}`)
    }
  }
}

// FIX 7: Hard invariant check to prevent silent UI/Validation drift during composition
const integrationKeys = Object.keys(INTEGRATION_DOMAIN) as Array<IntegrationKey>

for (const key of integrationKeys) {
  if (!(key in INTEGRATION_UI)) {
    throw new Error(`Integration Drift: Missing UI config for ${key}`)
  }
  if (!(key in Validation)) {
    throw new Error(`Integration Drift: Missing Zod validation schema for ${key}`)
  }
}

// Safe composition of domain structure + presentation layer + strictly typed validation
export const INTEGRATIONS: IntegrationConfig[] = integrationKeys.map(key => {
  const domain = INTEGRATION_DOMAIN[key]
  const ui = INTEGRATION_UI[key]
  const validation = Validation[key] as z.ZodObject<any>

  assertValidCategory(domain.category)
  assertFieldCoverage(ui.fields, validation)

  return {
    // Explicit domain state
    id: domain.id,
    category: domain.category,
    authType: domain.authType,
    security: domain.security,
    tableInsights: domain.tableInsights,
    ...(domain.hooks ? { hooks: domain.hooks } : {}),

    // Injected UI elements
    name: ui.name,
    description: ui.description,
    icon: ui.icon,
    color: ui.color,
    isPopular: ui.isPopular,
    insights: ui.insights,
    fields: ui.fields,

    // Validation Reference
    validationSchema: validation,
  } as IntegrationConfig
})
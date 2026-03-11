// cloudflare_workers/webhook_catcher/src/index.ts

import type { Queue, MessageBatch, ExecutionContext, R2Bucket } from '@cloudflare/workers-types';

export interface Env {
  // Bindings
  INGESTION_QUEUE: Queue<any>;
  DLQ_BUCKET: R2Bucket; // Phase 8.2: Zero-Data-Loss Fallback Storage
  
  // Edge Auth Secrets
  STRIPE_WEBHOOK_SECRET: string;
  SHOPIFY_WEBHOOK_SECRET: string;
  SALESFORCE_WEBHOOK_SECRET: string;
  
  // Backend Routing
  CORE_API_URL: string;
  CORE_API_KEY: string;
}

// -----------------------------------------------------------------------------
// Cryptographic Edge Verification Methods (Sub-ms Web Crypto API)
// -----------------------------------------------------------------------------

async function verifyStripeSignature(payload: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  try {
    const sigParts = signatureHeader.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = sigParts['t'];
    const v1Sig = sigParts['v1'];
    if (!timestamp || !v1Sig) return false;

    // Prevent Replay Attacks (5 min window)
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp - parseInt(timestamp, 10) > 300) return false;

    const signedPayload = `${timestamp}.${payload}`;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    
    const sigBytes = new Uint8Array(v1Sig.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
    return await crypto.subtle.verify('HMAC', key, sigBytes, encoder.encode(signedPayload));
  } catch (error) {
    return false;
  }
}

async function verifyShopifySignature(payload: string, signatureHeader: string | null, secret: string): Promise<boolean> {
  if (!signatureHeader || !secret) return false;
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
    );
    // Shopify uses Base64 encoded HMAC
    const signatureBytes = Uint8Array.from(atob(signatureHeader), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(payload));
  } catch (error) {
    return false;
  }
}

function verifySalesforceSignature(signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader || !secret) return false;
  // Constant time comparison for tokens to prevent timing attacks
  if (signatureHeader.length !== secret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < signatureHeader.length; ++i) {
    mismatch |= (signatureHeader.charCodeAt(i) ^ secret.charCodeAt(i));
  }
  return mismatch === 0;
}

// -----------------------------------------------------------------------------
// The Worker: Producer (fetch) & Consumer (queue)
// -----------------------------------------------------------------------------

export default {
  /**
   * Phase 7.3: Main Edge Handler (The Producer)
   * Receives webhooks, verifies them geographically close to the source, and queues them.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Route: /webhooks/<provider>/<tenant_id>
    if (pathParts.length !== 3 || pathParts[0] !== 'webhooks') {
      return new Response('Not Found', { status: 404 });
    }

    const provider = pathParts[1];
    const tenantId = pathParts[2];

    try {
      const rawBody = await request.text();
      let isAuthentic = false;

      // 1. Dynamic Provider Authentication Matrix
      if (provider === 'stripe') {
        isAuthentic = await verifyStripeSignature(rawBody, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
      } else if (provider === 'shopify') {
        isAuthentic = await verifyShopifySignature(rawBody, request.headers.get('X-Shopify-Hmac-Sha256'), env.SHOPIFY_WEBHOOK_SECRET);
      } else if (provider === 'salesforce') {
        isAuthentic = verifySalesforceSignature(request.headers.get('X-Salesforce-Token'), env.SALESFORCE_WEBHOOK_SECRET);
      } else {
        return new Response('Unsupported Provider', { status: 400 });
      }

      if (!isAuthentic) {
        console.warn(`🚨 Unauthorized ${provider} webhook attempt for tenant: ${tenantId}`);
        return new Response('Unauthorized: Invalid Signature', { status: 401 });
      }

      // 2. Queue Envelopment (Safe Parsing)
      let parsedPayload;
      try {
        parsedPayload = JSON.parse(rawBody);
      } catch (e) {
        // XML or malformed JSON from old systems
        parsedPayload = { raw_text: rawBody }; 
      }

      const queueMessage = {
        tenant_id: tenantId,
        provider: provider,
        received_at: new Date().toISOString(),
        payload: parsedPayload,
        // Capture specific headers for downstream routing
        topic: request.headers.get('X-Shopify-Topic') || request.headers.get('Stripe-Event-Type') || 'unknown'
      };

      // 3. Drop into Cloudflare Queue
      await env.INGESTION_QUEUE.send(queueMessage);

      // 4. Sub-10ms Acknowledgment to the SaaS provider
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error(`Edge routing error for tenant ${tenantId}:`, error);
      return new Response('Internal Server Error', { status: 500 });
    }
  },

  /**
   * Phase 8.2: Event-Driven Consumer & DLQ Routing
   * Batches queue messages, pushes to Render backend, and uses R2 as a safety net if backend dies.
   */
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
    // 1. Group messages by tenant AND provider to optimize vectorized backend inserts
    const batches: Record<string, any[]> = {};

    for (const message of batch.messages) {
      const { tenant_id, provider, payload, received_at, topic } = message.body;
      const key = `${tenant_id}|${provider}`;
      
      if (!batches[key]) batches[key] = [];
      batches[key].push({ payload, received_at, topic });
    }

    // 2. Push to Python backend
    for (const [routeKey, events] of Object.entries(batches)) {
      const [tenantId, provider] = routeKey.split('|');
      
      try {
        const response = await fetch(`${env.CORE_API_URL}/api/ingest/${provider}/webhook-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${env.CORE_API_KEY}`,
            'X-Trigger-Agents': 'true'
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            events: events
          })
        });

        if (!response.ok) {
          throw new Error(`Backend rejected payload: ${response.status} ${response.statusText}`);
        }

        console.log(`✅ Synced ${events.length} events for ${tenantId} via ${provider}`);
        
        // Acknowledge all messages in this batch slice
        batch.messages.filter(m => m.body.tenant_id === tenantId && m.body.provider === provider).forEach(m => m.ack());

      } catch (error) {
        // -------------------------------------------------------------------------
        // Phase 8.2: The Dead Letter Queue (DLQ) Fallback
        // If the Render compute node is down, deploying, or rate-limited, we DO NOT 
        // let the message loop infinitely or disappear. We save it to Cloudflare R2.
        // -------------------------------------------------------------------------
        const errorMsg = error instanceof Error ? error.message : 'Unknown network error';
        console.error(`❌ Backend unreachable for ${tenantId}. Routing to DLQ. Error: ${errorMsg}`);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dlqKey = `dlq/${tenantId}/${provider}/${timestamp}_${crypto.randomUUID()}.json`;

        // Write the failed batch to R2 for the Python Watchdog service to replay later
        await env.DLQ_BUCKET.put(dlqKey, JSON.stringify({
          error: errorMsg,
          failed_at: new Date().toISOString(),
          batch_size: events.length,
          events: events
        }));

        // Because we successfully secured the data in our Data Lake (R2), we ACK the message
        // so it leaves the active Queue. This prevents "poison pills" from clogging the pipeline.
        batch.messages.filter(m => m.body.tenant_id === tenantId && m.body.provider === provider).forEach(m => m.ack());
      }
    }
  }
};
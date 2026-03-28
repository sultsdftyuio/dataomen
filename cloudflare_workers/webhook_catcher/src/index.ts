/**
 * ARCLI.TECH - Managed Edge Ingestion Router
 * Component: Cloudflare Worker (Webhooks + Telemetry)
 * Strategy: Phase 3 (Top-of-Funnel Visibility & Zero-ETL Consolidation)
 * * HOW IT WORKS FOR THE FOUNDER:
 * They drop this single line into their Next.js layout.tsx or HTML <head>:
 * <script defer data-tenant="YOUR_TENANT_ID" src="https://edge.arcli.tech/script.js"></script>
 */

import type { Queue, MessageBatch, ExecutionContext, R2Bucket, Request as CFRequest } from '@cloudflare/workers-types';

export interface Env {
  INGESTION_QUEUE: Queue<QueueMessage>;
  DLQ_BUCKET: R2Bucket; 
  
  STRIPE_WEBHOOK_SECRET: string;
  SHOPIFY_WEBHOOK_SECRET: string;
  
  CORE_API_URL: string;
  INTERNAL_ROUTING_SECRET: string;
}

export interface QueueMessage {
  tenant_id: string;
  provider: string;
  stream_name: string;
  received_at: string;
  payload: Record<string, any>;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, Stripe-Signature, X-Shopify-Hmac-Sha256, X-Shopify-Topic',
};

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

    // Reject payloads older than 5 minutes to prevent replay attacks
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
    const signatureBytes = Uint8Array.from(atob(signatureHeader), c => c.charCodeAt(0));
    return await crypto.subtle.verify('HMAC', key, signatureBytes, encoder.encode(payload));
  } catch (error) {
    return false;
  }
}

// -----------------------------------------------------------------------------
// Core Route Handlers
// -----------------------------------------------------------------------------

function handleScriptDelivery(request: CFRequest): Response {
  const trackerScript = `
    (function(){
      const t = document.currentScript.getAttribute('data-tenant');
      if(!t) { console.error('Arcli: Missing data-tenant attribute'); return; }
      const endpoint = new URL('/telemetry/' + t, document.currentScript.src).href;
      
      const sendEvent = () => {
        fetch(endpoint, {
          method: 'POST',
          headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({
            path: window.location.pathname,
            url: window.location.href,
            referrer: document.referrer,
            title: document.title,
            utm_source: new URLSearchParams(window.location.search).get('utm_source'),
            utm_medium: new URLSearchParams(window.location.search).get('utm_medium'),
            utm_campaign: new URLSearchParams(window.location.search).get('utm_campaign'),
            screen_width: window.innerWidth
          }),
          keepalive: true
        }).catch(()=>{});
      };
      
      sendEvent(); // Fire on initial load
      
      // SPA Support: Fire on Next.js / React Router navigation
      let lastUrl = location.href;
      new MutationObserver(() => {
        const url = location.href;
        if (url !== lastUrl) {
          lastUrl = url;
          sendEvent();
        }
      }).observe(document, {subtree: true, childList: true});
    })();
  `;
  return new Response(trackerScript, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=86400',
      ...CORS_HEADERS
    }
  });
}

async function handleTelemetry(request: CFRequest, tenantId: string, env: Env): Promise<Response> {
  if (!tenantId) return new Response('Missing Tenant ID', { status: 400, headers: CORS_HEADERS });

  try {
    const payload = await request.json<Record<string, any>>();
    
    // Enrich payload with Cloudflare Edge properties (Privacy-friendly Geo-IP)
    const enrichedPayload = {
      ...payload,
      country: request.cf?.country || 'Unknown',
      city: request.cf?.city || 'Unknown',
      device_type: request.headers.get('user-agent')?.includes('Mobi') ? 'Mobile' : 'Desktop'
    };

    await env.INGESTION_QUEUE.send({
      tenant_id: tenantId,
      provider: 'arcli_telemetry',
      stream_name: 'pageviews',
      received_at: new Date().toISOString(),
      payload: enrichedPayload,
    });

    return new Response(JSON.stringify({ queued: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  } catch (error) {
    return new Response('Invalid Telemetry Payload', { status: 400, headers: CORS_HEADERS });
  }
}

async function handleWebhooks(request: CFRequest, provider: string, tenantId: string, env: Env): Promise<Response> {
  try {
    const rawBody = await request.text();
    let isAuthentic = false;
    let eventTopic = 'unknown';

    if (provider === 'stripe') {
      isAuthentic = await verifyStripeSignature(rawBody, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
      const parsed = JSON.parse(rawBody);
      eventTopic = parsed.type || 'unknown';
    } else if (provider === 'shopify') {
      isAuthentic = await verifyShopifySignature(rawBody, request.headers.get('X-Shopify-Hmac-Sha256'), env.SHOPIFY_WEBHOOK_SECRET);
      eventTopic = request.headers.get('X-Shopify-Topic') || 'unknown';
    } else {
      return new Response('Unsupported Provider', { status: 400, headers: CORS_HEADERS });
    }

    if (!isAuthentic) return new Response('Unauthorized Webhook Signature', { status: 401, headers: CORS_HEADERS });

    let parsedPayload: Record<string, any>;
    try { 
      parsedPayload = JSON.parse(rawBody); 
    } catch (e) { 
      parsedPayload = { raw_text: rawBody }; 
    }

    await env.INGESTION_QUEUE.send({
      tenant_id: tenantId,
      provider: provider,
      stream_name: eventTopic,
      received_at: new Date().toISOString(),
      payload: parsedPayload,
    });

    return new Response(JSON.stringify({ received: true, queued: true }), { 
      status: 200, 
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS } 
    });
  } catch (error) {
    console.error(`Webhook processing error for ${provider}:`, error);
    return new Response('Internal Edge Error', { status: 500, headers: CORS_HEADERS });
  }
}

// -----------------------------------------------------------------------------
// The Worker: Producer (fetch) & Consumer (queue)
// -----------------------------------------------------------------------------

export default {
  async fetch(request: CFRequest, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 0. Handle CORS Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const pathParts = url.pathname.split('/').filter(Boolean);

    // Route 1: Dynamic Script Delivery
    if (request.method === 'GET' && pathParts[0] === 'script.js') {
      return handleScriptDelivery(request);
    }

    // Route 2: Telemetry Ingestion
    if (request.method === 'POST' && pathParts[0] === 'telemetry') {
      return handleTelemetry(request, pathParts[1], env);
    }

    // Route 3: External Webhooks
    if (request.method === 'POST' && pathParts[0] === 'webhooks' && pathParts.length === 3) {
      return handleWebhooks(request, pathParts[1].toLowerCase(), pathParts[2], env);
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },

  /**
   * Event-Driven Consumer & DLQ Routing
   * Processes batches concurrently. Uses R2 as a safety net if the Python backend is down.
   */
  async queue(batch: MessageBatch<QueueMessage>, env: Env, ctx: ExecutionContext): Promise<void> {
    // 1. Group messages by route key to optimize vectorized backend inserts
    const batches = new Map<string, { events: any[], messages: any[] }>();

    for (const message of batch.messages) {
      const { tenant_id, provider, stream_name, payload, received_at } = message.body;
      const key = `${tenant_id}|${provider}|${stream_name}`;
      
      if (!batches.has(key)) {
        batches.set(key, { events: [], messages: [] });
      }
      
      const group = batches.get(key)!;
      group.events.push({ payload, received_at });
      group.messages.push(message);
    }

    // 2. Process groups concurrently to maximize throughput
    const dispatchPromises = Array.from(batches.entries()).map(async ([routeKey, group]) => {
      const [tenantId, provider, streamName] = routeKey.split('|');
      
      try {
        const response = await fetch(`${env.CORE_API_URL}/api/ingest/${provider}/webhook-batch`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': env.INTERNAL_ROUTING_SECRET 
          },
          body: JSON.stringify({
            tenant_id: tenantId,
            stream_name: streamName,
            events: group.events
          })
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        
        // Success: Ack all messages in this group
        group.messages.forEach(m => m.ack());

      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : 'Unknown network error';
        console.error(`❌ Backend unreachable for ${tenantId}/${provider}. Routing to DLQ. Error: ${errorMsg}`);

        // 3. Dead Letter Queue Fallback
        try {
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
          const dlqKey = `dlq/${tenantId}/${provider}/${streamName}/${timestamp}_${crypto.randomUUID()}.json`;

          await env.DLQ_BUCKET.put(dlqKey, JSON.stringify({
            error: errorMsg,
            failed_at: new Date().toISOString(),
            batch_size: group.events.length,
            stream: streamName,
            events: group.events
          }));

          // We successfully saved to R2, so we can ack the queue (Data is safe)
          group.messages.forEach(m => m.ack());
        } catch (dlqError) {
          console.error(`CRITICAL: R2 DLQ Failed for ${tenantId}. Retrying messages.`, dlqError);
          // If even R2 fails, instruct the Cloudflare Queue to retry later
          group.messages.forEach(m => m.retry());
        }
      }
    });

    await Promise.allSettled(dispatchPromises);
  }
};
/**
 * ARCLI.TECH - Managed Edge Ingestion Router
 * Component: Cloudflare Worker (Webhooks + Telemetry)
 * Strategy: Phase 3 (Top-of-Funnel Visibility & Zero-ETL Consolidation)
 * * HOW IT WORKS FOR THE FOUNDER:
 * They drop this single line into their Next.js layout.tsx or HTML <head>:
 * <script defer data-tenant="YOUR_TENANT_ID" src="https://edge.arcli.tech/script.js"></script>
 * * The worker dynamically serves a tiny (0-dependency) tracking script, catches
 * the resulting POST requests, enriches them with Cloudflare Geo-IP data, 
 * and routes them directly to the Python SyncEngine queue.
 */

// FIX: Imported Request as CFRequest from workers-types
import type { Queue, MessageBatch, ExecutionContext, R2Bucket, Request as CFRequest } from '@cloudflare/workers-types';

export interface Env {
  // Bindings
  INGESTION_QUEUE: Queue<any>;
  DLQ_BUCKET: R2Bucket; 
  
  // Edge Auth Secrets
  STRIPE_WEBHOOK_SECRET: string;
  SHOPIFY_WEBHOOK_SECRET: string;
  SALESFORCE_WEBHOOK_SECRET: string;
  
  // Backend Routing
  CORE_API_URL: string;
  INTERNAL_ROUTING_SECRET: string;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
// The Worker: Producer (fetch) & Consumer (queue)
// -----------------------------------------------------------------------------

export default {
  /**
   * Main Edge Handler (The Producer)
   */
  // FIX: Applied CFRequest type here
  async fetch(request: CFRequest, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // 0. Handle CORS Preflight for Telemetry scripts injected on remote domains
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const pathParts = url.pathname.split('/').filter(Boolean);

    // -------------------------------------------------------------------------
    // PHASE 3: Dynamic Script Delivery (The Arcli JS Snippet)
    // -------------------------------------------------------------------------
    if (request.method === 'GET' && pathParts[0] === 'script.js') {
      const trackerScript = `
        (function(){
          const t = document.currentScript.getAttribute('data-tenant');
          if(!t) { console.error('DataFast: Missing data-tenant attribute'); return; }
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

    // -------------------------------------------------------------------------
    // PHASE 3: Lightweight Telemetry Ingestion (Pageviews)
    // -------------------------------------------------------------------------
    if (request.method === 'POST' && pathParts[0] === 'telemetry') {
      const tenantId = pathParts[1];
      if (!tenantId) return new Response('Missing Tenant ID', { status: 400, headers: CORS_HEADERS });

      try {
        const payload = await request.json() as Record<string, any>;
        
        // Enrich payload with Cloudflare Edge properties (Privacy-friendly Geo-IP)
        const enrichedPayload = {
          ...payload,
          country: request.cf?.country || 'Unknown',
          city: request.cf?.city || 'Unknown',
          device_type: request.headers.get('user-agent')?.includes('Mobi') ? 'Mobile' : 'Desktop'
        };

        const queueMessage = {
          tenant_id: tenantId,
          provider: 'arcli_telemetry',
          stream_name: 'pageviews',
          received_at: new Date().toISOString(),
          payload: enrichedPayload,
        };

        await env.INGESTION_QUEUE.send(queueMessage);

        return new Response(JSON.stringify({ queued: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
        });
      } catch (error) {
        return new Response('Invalid Telemetry Payload', { status: 400, headers: CORS_HEADERS });
      }
    }

    // -------------------------------------------------------------------------
    // PHASE 1: SaaS Webhook Ingestion (Stripe, Supabase, etc.)
    // -------------------------------------------------------------------------
    if (request.method === 'POST' && pathParts[0] === 'webhooks') {
      if (pathParts.length !== 3) return new Response('Not Found', { status: 404 });
      
      const provider = pathParts[1].toLowerCase();
      const tenantId = pathParts[2];

      try {
        const rawBody = await request.text();
        let isAuthentic = false;

        // Verify webhooks
        if (provider === 'stripe') {
          isAuthentic = await verifyStripeSignature(rawBody, request.headers.get('Stripe-Signature'), env.STRIPE_WEBHOOK_SECRET);
        } else if (provider === 'shopify') {
          isAuthentic = await verifyShopifySignature(rawBody, request.headers.get('X-Shopify-Hmac-Sha256'), env.SHOPIFY_WEBHOOK_SECRET);
        } else {
          return new Response('Unsupported Provider', { status: 400 });
        }

        if (!isAuthentic) return new Response('Unauthorized', { status: 401 });

        let parsedPayload: any;
        try { parsedPayload = JSON.parse(rawBody); } catch (e) { parsedPayload = { raw_text: rawBody }; }

        let eventTopic = 'unknown';
        if (provider === 'shopify') eventTopic = request.headers.get('X-Shopify-Topic') || 'unknown';
        else if (provider === 'stripe') eventTopic = parsedPayload.type || 'unknown';

        const queueMessage = {
          tenant_id: tenantId,
          provider: provider,
          stream_name: eventTopic,
          received_at: new Date().toISOString(),
          payload: parsedPayload,
        };

        await env.INGESTION_QUEUE.send(queueMessage);

        return new Response(JSON.stringify({ received: true, queued: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      } catch (error) {
        return new Response('Internal Edge Error', { status: 500 });
      }
    }

    return new Response('Not Found', { status: 404, headers: CORS_HEADERS });
  },

  /**
   * Event-Driven Consumer & DLQ Routing
   * Pushes batches to Python backend, and uses R2 as a safety net.
   */
  async queue(batch: MessageBatch<any>, env: Env, ctx: ExecutionContext): Promise<void> {
    // Group messages by tenant, provider, AND stream to optimize vectorized backend inserts
    const batches: Record<string, any[]> = {};

    for (const message of batch.messages) {
      const { tenant_id, provider, payload, received_at, stream_name } = message.body;
      const key = `${tenant_id}|${provider}|${stream_name}`;
      
      if (!batches[key]) batches[key] = [];
      batches[key].push({ payload, received_at });
    }

    for (const [routeKey, events] of Object.entries(batches)) {
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
            events: events
          })
        });

        if (!response.ok) throw new Error(`Backend rejected payload: HTTP ${response.status}`);
        
        batch.messages
          .filter(m => m.body.tenant_id === tenantId && m.body.provider === provider && m.body.stream_name === streamName)
          .forEach(m => m.ack());

      } catch (error) {
        // Dead Letter Queue Fallback to R2
        const errorMsg = error instanceof Error ? error.message : 'Unknown network error';
        console.error(`❌ Backend unreachable for ${tenantId}. Routing to DLQ. Error: ${errorMsg}`);

        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const dlqKey = `dlq/${tenantId}/${provider}/${streamName}/${timestamp}_${crypto.randomUUID()}.json`;

        await env.DLQ_BUCKET.put(dlqKey, JSON.stringify({
          error: errorMsg,
          failed_at: new Date().toISOString(),
          batch_size: events.length,
          stream: streamName,
          events: events
        }));

        batch.messages
          .filter(m => m.body.tenant_id === tenantId && m.body.provider === provider && m.body.stream_name === streamName)
          .forEach(m => m.ack());
      }
    }
  }
};
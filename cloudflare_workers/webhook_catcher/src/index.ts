// cloudflare_workers/webhook_catcher/src/index.ts

import type { Queue, ExecutionContext } from '@cloudflare/workers-types';

export interface Env {
  // Binding to Cloudflare Queues
  INGESTION_QUEUE: Queue<any>;
  // Environment variable strictly for Edge auth
  STRIPE_WEBHOOK_SECRET: string;
}

/**
 * Validates the Stripe webhook signature using native Web Crypto API for sub-ms execution.
 * @param payload - The raw text body of the request
 * @param signatureHeader - The 'Stripe-Signature' header
 * @param secret - The Stripe endpoint secret
 * @returns boolean indicating if the signature is valid and recent
 */
async function verifyStripeSignature(
  payload: string,
  signatureHeader: string | null,
  secret: string
): Promise<boolean> {
  if (!signatureHeader || !secret) return false;

  try {
    // Parse the Stripe signature header (format: t=timestamp,v1=signature)
    const sigParts = signatureHeader.split(',').reduce((acc, part) => {
      const [key, value] = part.split('=');
      acc[key] = value;
      return acc;
    }, {} as Record<string, string>);

    const timestamp = sigParts['t'];
    const v1Sig = sigParts['v1'];

    if (!timestamp || !v1Sig) return false;

    // Prevent Replay Attacks: Reject payloads older than 5 minutes (300 seconds)
    const currentTimestamp = Math.floor(Date.now() / 1000);
    if (currentTimestamp - parseInt(timestamp, 10) > 300) return false;

    // Reconstruct the signed payload string
    const signedPayload = `${timestamp}.${payload}`;

    // Import the secret key for HMAC SHA-256
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    // Convert the hex signature to a Uint8Array
    const sigBytes = new Uint8Array(
      v1Sig.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
    );

    // Verify the signature
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      encoder.encode(signedPayload)
    );

    return isValid;
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

export default {
  /**
   * Main Edge Handler for incoming HTTP requests
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 });
    }

    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);

    // Route structure: /webhooks/<provider>/<tenant_id>
    // Example: /webhooks/stripe/tenant_abc123
    if (pathParts.length !== 3 || pathParts[0] !== 'webhooks') {
      return new Response('Not Found', { status: 404 });
    }

    const provider = pathParts[1];
    const tenantId = pathParts[2];

    try {
      // 1. Read the raw body (required for exact signature matching)
      const rawBody = await request.text();

      // 2. Route based on provider & Authenticate
      if (provider === 'stripe') {
        const signatureHeader = request.headers.get('Stripe-Signature');
        
        const isAuthentic = await verifyStripeSignature(
          rawBody, 
          signatureHeader, 
          env.STRIPE_WEBHOOK_SECRET
        );

        if (!isAuthentic) {
          return new Response('Unauthorized: Invalid Signature', { status: 401 });
        }
      } else {
        return new Response('Unsupported Provider', { status: 400 });
      }

      // 3. Construct the normalized ingestion envelope
      const queueMessage = {
        tenant_id: tenantId,
        provider: provider,
        received_at: new Date().toISOString(),
        payload: JSON.parse(rawBody)
      };

      // 4. Drop into the Cloudflare Queue (Non-blocking async drop)
      await env.INGESTION_QUEUE.send(queueMessage);

      // 5. Acknowledge the webhook instantly (Sub-10ms response to Stripe)
      return new Response(JSON.stringify({ received: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });

    } catch (error) {
      console.error(`Webhook processing error for tenant ${tenantId}:`, error);
      // Return 500 so Stripe knows to retry the webhook later if we fail to queue it
      return new Response('Internal Server Error', { status: 500 });
    }
  },
};
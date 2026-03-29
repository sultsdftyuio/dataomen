// app/api/chat/orchestrate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";
import { Redis } from "@upstash/redis";

export const runtime = "edge"; // Maximize performance & minimize latency
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_API_URL || "https://api.arcli.tech";

// Initialize Upstash Redis (Lazy evaluation for Edge compatibility)
const redis = Redis.fromEnv();

// ---------------------------------------------------------------------------
// Context Typing for Edge Runtime (App Router)
// ---------------------------------------------------------------------------
interface EdgeRouteContext {
  params?: Record<string, string | string[]>;
  waitUntil?: (promise: Promise<any>) => void;
}

// ---------------------------------------------------------------------------
// Utility: Redis Timeout Wrapper (Strictly Typed)
// ---------------------------------------------------------------------------
const withTimeout = async <T>(promise: Promise<T>, ms: number = 300): Promise<T> => {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("Operation timed out.")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
};

// ---------------------------------------------------------------------------
// Structured Event Typing
// ---------------------------------------------------------------------------
type StreamPacket = 
  | { type: "status"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "narrative_chunk"; content: string }
  | { type: "data"; content: any }
  | { type: "sql"; content: string }
  | { type: "error"; content: string; retryable?: boolean } 
  | { type: "plan"; content: any }
  | { type: "insights"; content: any }
  | { type: "job_queued"; content: string; job_id?: string }
  | { type: "predictive_insights"; content: any }
  | { type: "diagnostics"; content: any }
  | { type: "done"; content: string; usage?: { tokens: number } }
  | { type: "cache_hit"; content: any };

// ---------------------------------------------------------------------------
// Strict Gateway Schema (Frontend -> Next.js)
// ---------------------------------------------------------------------------
const PayloadSchema = z.object({
  prompt: z.string().min(1, "Prompt cannot be empty.").max(3000, "Prompt exceeds maximum allowed length."),
  agent_id: z.string().optional(),
  active_dataset_ids: z.array(z.string().uuid("Invalid Dataset ID.")).max(10).optional().default([]),
  active_document_ids: z.array(z.string().uuid("Invalid Document ID.")).max(20).optional().default([]),
  history: z.array(z.object({
    role: z.enum(["user", "assistant", "system", "data"]),
    content: z.any()
  })).max(20).optional().default([]), 
  predictive_config: z.any().optional(),
  ab_test_config: z.any().optional(),
});

// ---------------------------------------------------------------------------
// Multi-Tenant Lossless Cache Fingerprinting
// ---------------------------------------------------------------------------
async function generateCacheKey(payload: z.infer<typeof PayloadSchema>, tenant_id: string): Promise<string> {
  const safeConfigHash = (obj: any) => obj ? JSON.stringify(obj, Object.keys(obj).sort()) : "null";
  
  const stablePayload = {
    tenant: tenant_id,
    prompt: payload.prompt.trim().toLowerCase(),
    datasets: [...payload.active_dataset_ids].sort(),
    documents: [...payload.active_document_ids].sort(),
    agent: payload.agent_id || "default",
    config_pred: safeConfigHash(payload.predictive_config),
    config_ab: safeConfigHash(payload.ab_test_config),
  };
  
  const data = new TextEncoder().encode(JSON.stringify(stablePayload));
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `cache:query:${hashArray.map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

export async function POST(req: NextRequest, context: any) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  let tenant_id = "anonymous";
  
  let shouldDecrementConcurrency = false;

  const log = (level: "info" | "warn" | "error", event: string, data: any = {}) => {
    console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, requestId, tenant_id, event, ...data }));
  };

  // Centralized Concurrency Cleanup Helper
  const releaseConcurrency = async (tenantId: string) => {
    if (!shouldDecrementConcurrency) return;
    try {
      await Promise.allSettled([
        withTimeout<number>(redis.decr("concurrency:backend:active")).catch(() => 0),
        withTimeout<number>(redis.decr(`concurrency:tenant:${tenantId}:active`)).catch(() => 0)
      ]);
    } catch (e) {
      log("error", "failed_to_release_concurrency", { error: String(e) });
    } finally {
      shouldDecrementConcurrency = false; // Prevent double-decrementing
    }
  };

  try {
    // 1. STRICT INTERNAL SECURITY GUARD
    const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY;
    if (!INTERNAL_SERVICE_KEY) {
      log("error", "critical_startup_failure", { error: "Missing INTERNAL_SERVICE_KEY" });
      return NextResponse.json(
        { type: "error", message: "Critical configuration error. Aborting to prevent unauthenticated calls. Please contact support@arcli.tech." },
        { status: 500, headers: { "X-Request-ID": requestId } }
      );
    }

    // 2. Global Circuit Breaker (Half-Open Native Pattern)
    const isTripped: string | null = await withTimeout<string | null>(redis.get("cb:global_tripped")).catch((): null => null);
    if (isTripped) {
      log("warn", "global_circuit_breaker_active_fast_reject");
      return NextResponse.json(
        { type: "error", message: "Cluster is at capacity. Please try again in 30 seconds or contact support@arcli.tech." },
        { status: 503, headers: { "Retry-After": "30", "X-Request-ID": requestId } }
      );
    }

    // Header Payload Shedding
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 25000) { 
      return NextResponse.json({ type: "error", message: "Payload too large." }, { status: 413, headers: { "X-Request-ID": requestId } });
    }

    // 3. Parallel Preflight (Auth & Parsing)
    const [authResult, bodyResult] = await Promise.allSettled([
      (async () => {
        const supabase = await createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !session) throw new Error("Unauthorized");
        return { user, session };
      })(),
      req.json()
    ]);

    if (authResult.status === "rejected") {
      log("warn", "unauthorized_access_attempt");
      return NextResponse.json({ type: "error", message: "Unauthorized: Session expired or invalid." }, { status: 401, headers: { "X-Request-ID": requestId } });
    }
    if (bodyResult.status === "rejected") {
      log("warn", "malformed_json_payload");
      return NextResponse.json({ type: "error", message: "Invalid JSON payload sent to orchestration layer." }, { status: 400, headers: { "X-Request-ID": requestId } });
    }

    const { user, session } = authResult.value;
    const rawBody = bodyResult.value;

    tenant_id = user.app_metadata?.tenant_id || user.id;
    const access_token = session.access_token;
    const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

    const validationResult = PayloadSchema.safeParse(rawBody);
    if (!validationResult.success) {
      return NextResponse.json({ type: "error", message: "Invalid schema.", details: validationResult.error.errors }, { status: 400, headers: { "X-Request-ID": requestId } });
    }

    const parsedPayload = validationResult.data;
    const { agent_id, prompt, active_dataset_ids, active_document_ids, history, predictive_config, ab_test_config } = parsedPayload;

    // 4. Semantic Interception (Edge Fast-Path for Greetings)
    const normalizedPrompt = prompt.trim().toLowerCase();
    const isBasicGreeting = /^(hi|hello|hey|yo|greetings|howdy)\b/i.test(normalizedPrompt) || 
                            /^(how are you\??|help|what can you do\??|who are you\??)$/i.test(normalizedPrompt);

    if (isBasicGreeting && normalizedPrompt.length < 30) {
      log("info", "edge_greeting_intercept");
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (packet: StreamPacket) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
          
          send({ type: "status", content: "Connected to Copilot." });
          await new Promise(r => setTimeout(r, 200)); 
          
          const reply = (active_dataset_ids.length > 0 || active_document_ids.length > 0)
            ? "Hello! I see you have some data connected. What would you like to know about it?"
            : "Hello! I'm your DataOmen Copilot. To get started, please connect a dataset or activate an agent!";
          
          const words = reply.split(" ");
          for (const word of words) {
            if (req.signal.aborted) break; 
            send({ type: "narrative_chunk", content: word + " " });
            await new Promise(r => setTimeout(r, 25)); 
          }
          send({ type: "done", content: "Complete" });
          controller.close();
        }
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive", "X-Request-ID": requestId } });
    }

    // 5. Lossless Semantic Stream Replay Caching
    const cacheKey = await generateCacheKey(parsedPayload, tenant_id);
    const cachedResultStr: string | null = await withTimeout<string | null>(redis.get(cacheKey)).catch((): null => null);
    
    if (cachedResultStr && typeof cachedResultStr === "string") {
      log("info", "redis_semantic_cache_hit_lossless", { cacheKey });
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (packet: StreamPacket) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
          
          send({ type: "status", content: "Retrieving cached analysis..." });
          await new Promise(r => setTimeout(r, 150)); 
          
          try {
            const cachedPackets: StreamPacket[] = JSON.parse(cachedResultStr);
            for (const packet of cachedPackets) {
              if (req.signal.aborted) break;
              send(packet);
              if (packet.type === "narrative_chunk") await new Promise(r => setTimeout(r, 5)); // Natural pacing
            }
          } catch (e) {
            log("error", "cache_replay_failed", { error: String(e) });
          } finally {
            send({ type: "done", content: "Complete", usage: { tokens: 0 } });
            controller.close();
          }
        }
      });
      return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Request-ID": requestId } });
    }

    // 6. Global + Tenant Concurrency Guard (FAIL-CLOSED)
    const [activeGlobalReqs, activeTenantReqs]: [number, number] = await Promise.all([
      withTimeout<number>(redis.incr("concurrency:backend:active")).catch((): number => 9999),
      withTimeout<number>(redis.incr(`concurrency:tenant:${tenant_id}:active`)).catch((): number => 9999)
    ]);
    
    shouldDecrementConcurrency = true; 
    
    await Promise.allSettled([
      withTimeout<number>(redis.expire("concurrency:backend:active", 120)).catch((): number => 0),
      withTimeout<number>(redis.expire(`concurrency:tenant:${tenant_id}:active`, 120)).catch((): number => 0)
    ]);

    if (activeGlobalReqs > 50 || activeTenantReqs > 10) {
      log("warn", "concurrency_limit_exceeded_rollback", { activeGlobalReqs, activeTenantReqs });
      await releaseConcurrency(tenant_id);
      
      return NextResponse.json(
        { type: "error", message: "Capacity reached for this workspace. Please wait a moment and try again." },
        { status: 503, headers: { "Retry-After": "10", "X-Request-ID": requestId } }
      );
    }

    // 7. HEAVY PIPELINE (Gateway Orchestrator & Polling)
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let actualTokens = 0; 
        let rawByteCount = 0;
        const lossLessCacheBuffer: StreamPacket[] = []; 

        const sendPacket = (packet: StreamPacket) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
            if (packet.type !== "status" && packet.type !== "error") {
               lossLessCacheBuffer.push(packet); 
            }
          } catch (e) {
            log("error", "enqueue_failed", { error: String(e) });
          }
        };

        let backendResponse: Response | null = null;
        let retries = 0;
        const MAX_RETRIES = 6; 

        const combinedController = new AbortController();
        const globalTimeout = setTimeout(() => {
          log("error", "global_pipeline_timeout_exceeded");
          combinedController.abort();
        }, 120000); // 120s Hard Timeout
        
        const abortHandler = () => combinedController.abort();
        req.signal.addEventListener("abort", abortHandler);

        while (retries < MAX_RETRIES) {
          if (combinedController.signal.aborted) {
             controller.close();
             return; 
          }

          try {
            // Send request exactly mapped to Python Orchestrator schema requirements
            backendResponse = await fetch(`${BACKEND_URL}/api/chat/orchestrate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${access_token}`,
                "X-Tenant-ID": tenant_id,
                "X-Request-ID": requestId,
                "X-Forwarded-For": clientIp,
                "Connection": "keep-alive"
              },
              body: JSON.stringify({
                prompt,
                agent_id: agent_id || null, // Explicitly pass agent_id for Persona constraints
                active_dataset_ids,         // Required for Semantic Router target boundaries
                active_document_ids,
                history,                    // Enables multi-turn memory
                stream: true, 
              }),
              signal: combinedController.signal,
            });

            if (backendResponse.ok) {
              await withTimeout<number>(redis.del(`cb:fails:${tenant_id}`)).catch((): number => 0);
              break; 
            } else if (backendResponse.status >= 500) {
              const fails: number = await withTimeout<number>(redis.incr(`cb:fails:${tenant_id}`)).catch((): number => 0);
              if (fails === 1) await withTimeout<number>(redis.expire(`cb:fails:${tenant_id}`, 60)).catch((): number => 0);
              
              if (fails >= 5) {
                await withTimeout<string | null>(redis.setex(`cb:tripped:${tenant_id}`, 30, "true")).catch((): null => null); 
                throw new Error("Tenant Circuit Breaker Tripped (OPEN).");
              }
              throw new Error(`Backend 5xx (HTTP ${backendResponse.status})`);
            } else {
              const errData = await backendResponse.text().catch(() => "Unknown error");
              sendPacket({ type: "error", content: `Analysis Error: ${errData}`, retryable: false });
              controller.close();
              return;
            }
          } catch (err: any) {
            if (err.name === 'AbortError') {
              controller.close();
              return; 
            }

            retries++;
            if (retries >= MAX_RETRIES) {
              sendPacket({ type: "error", content: "Engine took too long to wake up. Contact support@arcli.tech if this persists.", retryable: true });
              controller.close();
              return;
            }

            if (retries === 3) sendPacket({ type: "diagnostics", content: { status: "cold_start_detected", retries } });

            // Exponential backoff with jitter
            const baseDelay = Math.min(5000 * (2 ** (retries - 1)), 15000);
            const delayMs = baseDelay + (baseDelay * 0.3 * Math.random());
            
            if (retries === 1) sendPacket({ type: "status", content: "Warming up your data environment..." });
            else if (retries === 2) sendPacket({ type: "status", content: "Allocating memory for your datasets..." });

            await new Promise((resolve) => setTimeout(resolve, delayMs));
          }
        }

        if (!backendResponse || !backendResponse.body) {
          sendPacket({ type: "error", content: "Failed to connect to the Analytical Engine.", retryable: true });
          controller.close();
          return;
        }

        const heartbeatInterval = setInterval(() => {
          sendPacket({ type: "status", content: "Crunching data..." });
        }, 15000);

        const reader = backendResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            while (controller.desiredSize !== null && controller.desiredSize <= 0) {
               await new Promise(r => setTimeout(r, 5)); 
            }

            buffer += decoder.decode(value, { stream: true });
            
            // 8. Robust JSON Line Parsing (Ignores internal newlines inside strings)
            let boundary;
            while ((boundary = buffer.indexOf("\n\n")) !== -1) {
              const rawChunk = buffer.slice(0, boundary).trim();
              buffer = buffer.slice(boundary + 2);
              if (!rawChunk) continue;

              let jsonStr = rawChunk;
              if (jsonStr.startsWith("data:")) {
                jsonStr = jsonStr.substring(5).trim();
              }
              
              try {
                const parsed = JSON.parse(jsonStr) as StreamPacket;
                if (parsed.type === "done" && parsed.usage?.tokens) {
                  actualTokens = parsed.usage.tokens;
                } else if (parsed.type === "narrative_chunk") {
                  rawByteCount += jsonStr.length; 
                }
                sendPacket(parsed); 
              } catch (parseErr) {
                // If it fails to parse, it might be a split packet. Push back to buffer and wait for next read.
                buffer = rawChunk + "\n\n" + buffer; 
                break;
              }
            }
          }
        } catch (err: any) {
          if (err.name !== 'AbortError') {
             log("error", "stream_interrupted", { error: String(err) });
             sendPacket({ type: "error", content: "The data stream was interrupted.", retryable: true });
          }
        } finally {
          // 9. Memory Leak & Resource Cleanup
          clearInterval(heartbeatInterval);
          clearTimeout(globalTimeout);
          req.signal.removeEventListener("abort", abortHandler);
          reader.releaseLock();
          controller.close();
          
          const finalTokens = actualTokens > 0 ? actualTokens : Math.round(rawByteCount / 4);
          const latency = Date.now() - startTime;
          log("info", "orchestration_closed", { latency, tokens: finalTokens });

          // Non-blocking cleanup execution
          const cleanupTask = async () => {
            try {
              await releaseConcurrency(tenant_id);

              const cachePayloadStr = JSON.stringify(lossLessCacheBuffer);
              if (lossLessCacheBuffer.length > 3 && latency < 60000 && cachePayloadStr.length < 150000) {
                 await withTimeout<string | null>(redis.setex(cacheKey, 300, cachePayloadStr)).catch((): null => null);
              }

              if (finalTokens > 0) {
                await withTimeout<Response>(
                  fetch(`${BACKEND_URL}/api/internal/billing/deduct`, {
                    method: "POST",
                    headers: { 
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${INTERNAL_SERVICE_KEY}` 
                    },
                    body: JSON.stringify({ 
                      tenant_id, request_id: requestId, 
                      tokens_estimated: finalTokens, feature: "analytical_chat" 
                    })
                  }), 5000
                ).catch(e => {
                  log("error", "billing_hook_failed", { error: String(e) });
                  return new Response(); 
                });
              }
            } catch (e) {
              log("error", "async_cleanup_tasks_failed", { error: String(e) });
            }
          };

          // Use Vercel's Edge waitUntil if available, otherwise fire-and-forget
          if (context?.waitUntil) {
            context.waitUntil(cleanupTask());
          } else {
            cleanupTask();
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
        "X-Request-ID": requestId
      },
    });

  } catch (error: any) {
    log("error", "fatal_route_error", { error: String(error) });
    
    // Absolute Last Resort Concurrency Cleanup
    const emergencyCleanup = releaseConcurrency(tenant_id);
    if (context?.waitUntil) {
       context.waitUntil(emergencyCleanup);
    }

    return NextResponse.json(
      { type: "error", message: "A critical error occurred in the orchestration gateway. Contact support@arcli.tech." }, 
      { status: 500, headers: { "X-Request-ID": requestId } }
    );
  }
}
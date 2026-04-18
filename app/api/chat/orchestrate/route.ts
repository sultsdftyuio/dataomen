// app/api/chat/orchestrate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { z } from "zod";

export const runtime = "edge"; // Maximize performance & minimize latency
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_API_URL || "https://api.arcli.tech";

// ---------------------------------------------------------------------------
// Context Typing for Edge Runtime (App Router)
// ---------------------------------------------------------------------------
interface EdgeRouteContext {
  params?: Record<string, string | string[]>;
  waitUntil?: (promise: Promise<any>) => void;
}

// ---------------------------------------------------------------------------
// Utility: Timeout Wrapper (Strictly Typed)
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

export async function GET() {
  return NextResponse.json(
    {
      status: "ok",
      message: "Orchestration endpoint is online. Use POST to start a stream.",
    },
    { status: 200 }
  );
}

export async function POST(req: NextRequest, context: any) {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();
  let tenant_id = "anonymous";
  
  const log = (level: "info" | "warn" | "error", event: string, data: any = {}) => {
    console[level](JSON.stringify({ timestamp: new Date().toISOString(), level, requestId, tenant_id, event, ...data }));
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

    // Header Payload Shedding
    const contentLength = req.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > 25000) { 
      return NextResponse.json({ type: "error", message: "Payload too large." }, { status: 413, headers: { "X-Request-ID": requestId } });
    }

    // 2. Parallel Preflight (Auth & Parsing)
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
    const { agent_id, prompt, active_dataset_ids, active_document_ids, history } = parsedPayload;

    // 3. Semantic Interception (Edge Fast-Path for Greetings)
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

    // 4. HEAVY PIPELINE (Gateway Orchestrator & Polling)
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let actualTokens = 0; 
        let rawByteCount = 0;

        const sendPacket = (packet: StreamPacket) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
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
              break; 
            } else if (backendResponse.status >= 500) {
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
            
            // 5. Robust JSON Line Parsing (Ignores internal newlines inside strings)
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
          // 6. Memory Leak & Resource Cleanup
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

    return NextResponse.json(
      { type: "error", message: "A critical error occurred in the orchestration gateway. Contact support@arcli.tech." }, 
      { status: 500, headers: { "X-Request-ID": requestId } }
    );
  }
}
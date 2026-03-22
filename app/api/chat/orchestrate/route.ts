// app/api/chat/orchestrate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "edge"; // Maximize performance & minimize latency
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";

/**
 * Protocol: Analytical Stream Event
 * Upgraded for Phase 8: Hybrid Engine (Structured Math + Unstructured Document RAG)
 */
interface StreamPacket {
  type: 
    | "status" 
    | "reasoning" 
    | "data" 
    | "error" 
    | "job_queued" 
    | "predictive_insights"
    | "plan"          // Hybrid query plan
    | "sql"           // Generated DuckDB SQL
    | "insights"      // Polars mathematical insights
    | "diagnostics"   // Root cause anomalies
    | "narrative"     // LLM synthesized text (from DB or PDFs)
    | "cache_hit";
  content?: string | any;
  job_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication & Tenant Isolation (Secure Method)
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (userError || !user || !session) {
      return NextResponse.json(
        { type: "error", message: "Unauthorized: Session expired or invalid." }, 
        { status: 401 }
      );
    }

    const tenant_id = user.id;
    const access_token = session.access_token;

    // 2. Parse Incoming Payload Safely
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { type: "error", message: "Invalid JSON payload sent to orchestration layer." },
        { status: 400 }
      );
    }

    // Extracted Hybrid Pipeline Configurations
    const { 
      agent_id, 
      prompt, 
      active_dataset_ids,    // Structured Parquet Assets
      active_document_ids,   // Unstructured PDF/Text Assets (NEW)
      history,
      predictive_config, 
      ab_test_config     
    } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Analytical prompt is required." }, { status: 400 });
    }

    // 3. Resilient Streaming with Cold Start Polling
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        // Helper to push formatted SSE packets to the client safely
        const sendPacket = (packet: StreamPacket) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
          } catch (e) {
            console.error("[Orchestrator] Failed to enqueue packet (client disconnected):", e);
          }
        };

        // YIELD IMMEDIATELY: Prevents Vercel Edge Runtime from dropping the connection
        sendPacket({ type: "status", content: "Establishing secure connection to Hybrid Engine..." });

        let backendResponse: Response | null = null;
        let retries = 0;
        const MAX_RETRIES = 8; // Max ~40 seconds of polling
        const RETRY_DELAY_MS = 5000; 

        // Active Polling Loop for Render Cold Starts & Network Drops
        while (retries < MAX_RETRIES) {
          try {
            backendResponse = await fetch(`${BACKEND_URL}/api/chat/orchestrate`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${access_token}`,
                "X-Tenant-ID": tenant_id,
              },
              body: JSON.stringify({
                tenant_id, 
                agent_id: agent_id || "default-router",
                prompt,
                active_dataset_ids: active_dataset_ids || [],
                active_document_ids: active_document_ids || [], // Pass RAG context to Python
                history: history || [],
                predictive_config, 
                ab_test_config,    
                stream: true, 
              }),
            });

            if (backendResponse.ok) {
              break; // Backend is awake and accepted the request
            } else if (backendResponse.status >= 500) {
              throw new Error(`Backend starting up (HTTP ${backendResponse.status})`);
            } else {
              const errData = await backendResponse.text().catch(() => "Unknown error");
              sendPacket({ type: "error", content: `Analytical Engine Error: ${errData}` });
              controller.close();
              return;
            }
          } catch (err: any) {
            // Catches "Network connection lost" and other fetch-level socket drops
            console.warn(`[Orchestrator] Backend network issue. Retry ${retries + 1}/${MAX_RETRIES}. Error:`, err.message);
            retries++;
            
            if (retries >= MAX_RETRIES) {
              sendPacket({ 
                type: "error", 
                content: "The Analytical Engine timed out during startup. Please try again." 
              });
              controller.close();
              return;
            }

            // Emit contextual status updates to the UI
            if (retries === 1) {
              sendPacket({ 
                type: "status", 
                content: "Waking up the Hybrid Compute Engine (this can take ~30 seconds)..." 
              });
            } else if (retries === 4) {
              sendPacket({ 
                type: "status", 
                content: "Engine is booting up memory and loading context pipelines..." 
              });
            }

            // Await delay before next poll
            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }

        // 4. Transform Stream from Awake Backend
        if (!backendResponse || !backendResponse.body) {
          sendPacket({ type: "error", content: "Failed to connect to the Analytical Engine." });
          controller.close();
          return;
        }

        const reader = backendResponse.body.getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Stream chunks directly to the UI
            // Python backend emits exact `data: {"type": "...", "content": "..."}\n\n` formats
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          console.error("[Orchestrator] Stream Interrupted:", err);
          sendPacket({ 
            type: "error", 
            content: "The data stream was interrupted during computation." 
          });
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    // 5. Return the Response with proper SSE headers IMMEDIATELY
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Prevent Vercel/Cloudflare from buffering the stream
      },
    });

  } catch (error: any) {
    console.error("[Orchestrator] Fatal Route Error:", error);
    return NextResponse.json(
      { 
        type: "error", 
        message: "A critical error occurred in the orchestration layer.",
        ...(process.env.NODE_ENV === "development" && { details: error.message })
      },
      { status: 500 }
    );
  }
}
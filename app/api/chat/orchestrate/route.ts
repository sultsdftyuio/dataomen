// app/api/chat/orchestrate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "edge"; // Maximize performance & minimize latency
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";

/**
 * Protocol: Analytical Stream Event
 */
interface StreamPacket {
  type: 
    | "status" 
    | "reasoning" 
    | "data" 
    | "error" 
    | "job_queued" 
    | "predictive_insights"
    | "plan"          
    | "sql"           
    | "insights"      
    | "diagnostics"   
    | "narrative"     
    | "narrative_chunk"
    | "done"
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

    const { 
      agent_id, 
      prompt, 
      active_dataset_ids,    
      active_document_ids,   
      history,
      predictive_config, 
      ab_test_config     
    } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Analytical prompt is required." }, { status: 400 });
    }

    // ============================================================================
    // 3. EDGE-LEVEL SEMANTIC INTERCEPTION (Fast-Path)
    // Avoids waking up the heavy Python/DuckDB engine for basic greetings.
    // ============================================================================
    const normalizedPrompt = prompt.trim().toLowerCase();
    const isBasicGreeting = /^(hi|hello|hey|yo|greetings|howdy|good (morning|afternoon|evening)|how are you\??|help|what can you do\??|who are you\??)$/i.test(normalizedPrompt);

    if (isBasicGreeting) {
      const stream = new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          const send = (packet: StreamPacket) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
          
          send({ type: "status", content: "Connected to Copilot." });
          await new Promise(r => setTimeout(r, 300)); // Simulate natural typing latency
          
          const reply = active_dataset_ids?.length > 0 
            ? "Hello! I see you have some data connected. What would you like to know about it? You can ask things like 'Show me the revenue trend' or 'Are there any anomalies?'"
            : "Hello! I'm your DataOmen Copilot. To get started, please connect or select a dataset, then ask me a question about your metrics!";
          
          // Stream words naturally to mimic the LLM pipeline
          const words = reply.split(" ");
          for (const word of words) {
            send({ type: "narrative_chunk", content: word + " " });
            await new Promise(r => setTimeout(r, 25)); 
          }
          
          send({ type: "done", content: "Complete" });
          controller.close();
        }
      });

      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      });
    }

    // ============================================================================
    // 4. HEAVY ANALYTICAL PIPELINE (Cold-Start Resilient Polling)
    // ============================================================================
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        const decoder = new TextDecoder();

        const sendPacket = (packet: StreamPacket) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(packet)}\n\n`));
          } catch (e) {
            console.error("[Orchestrator] Failed to enqueue packet:", e);
          }
        };

        // YIELD IMMEDIATELY: Prevents Vercel Edge Runtime from dropping the connection
        sendPacket({ type: "status", content: "Connecting to your analytical workspace..." });

        let backendResponse: Response | null = null;
        let retries = 0;
        const MAX_RETRIES = 12; // Increased to 60 seconds to comfortably handle Render/Heroku cold starts
        const RETRY_DELAY_MS = 5000; 

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
                active_document_ids: active_document_ids || [],
                history: history || [],
                predictive_config, 
                ab_test_config,    
                stream: true, 
              }),
            });

            if (backendResponse.ok) {
              break; 
            } else if (backendResponse.status >= 500) {
              throw new Error(`Backend starting up (HTTP ${backendResponse.status})`);
            } else {
              const errData = await backendResponse.text().catch(() => "Unknown error");
              sendPacket({ type: "error", content: `Analysis Error: ${errData}` });
              controller.close();
              return;
            }
          } catch (err: any) {
            retries++;
            
            if (retries >= MAX_RETRIES) {
              sendPacket({ 
                type: "error", 
                content: "The analytical engine took too long to wake up. Please try your request again." 
              });
              controller.close();
              return;
            }

            // Non-technical, reassuring status updates for the founder UX
            if (retries === 1) {
              sendPacket({ type: "status", content: "Warming up your data environment..." });
            } else if (retries === 3) {
              sendPacket({ type: "status", content: "Allocating memory for your datasets..." });
            } else if (retries === 6) {
              sendPacket({ type: "status", content: "Almost ready! Finalizing engine connection..." });
            } else if (retries === 9) {
              sendPacket({ type: "status", content: "Engine boot taking slightly longer than usual. Hold tight..." });
            }

            await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
          }
        }

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

            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          console.error("[Orchestrator] Stream Interrupted:", err);
          sendPacket({ type: "error", content: "The data stream was interrupted during computation." });
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", 
      },
    });

  } catch (error: any) {
    console.error("[Orchestrator] Fatal Route Error:", error);
    return NextResponse.json(
      { type: "error", message: "A critical error occurred in the orchestration layer." },
      { status: 500 }
    );
  }
}
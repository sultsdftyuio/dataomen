// app/api/chat/orchestrate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const runtime = "edge"; // Maximize performance & minimize latency
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";

/**
 * Protocol: Analytical Stream Event
 * Ensures the frontend knows exactly what state the engine is in.
 */
interface StreamPacket {
  type: "status" | "reasoning" | "data" | "error";
  content: string | any;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authentication & Tenant Isolation
    // We derive identity from the Supabase session to prevent tenant spoofing.
    const supabase = await createClient();
    const { data: { session }, error: authError } = await supabase.auth.getSession();
    
    if (authError || !session) {
      return NextResponse.json(
        { type: "error", message: "Unauthorized: Session expired or invalid." }, 
        { status: 401 }
      );
    }

    const tenant_id = session.user.id;
    const access_token = session.access_token;

    // 2. Parse Incoming Payload Safely
    // Prevents 500 errors if the frontend sends a malformed or empty body
    let body;
    try {
      body = await req.json();
    } catch (parseError) {
      return NextResponse.json(
        { type: "error", message: "Invalid JSON payload sent to orchestration layer." },
        { status: 400 }
      );
    }

    const { agent_id, prompt, active_dataset_ids, history } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Analytical prompt is required." }, { status: 400 });
    }

    // 3. Initiate Stream from Python Backend (Render)
    // Isolated try/catch to properly handle Cold Starts / Render spin-downs.
    let backendResponse: Response;
    try {
      backendResponse = await fetch(`${BACKEND_URL}/api/chat/orchestrate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${access_token}`,
          "X-Tenant-ID": tenant_id, // Secondary header for backend logging
        },
        body: JSON.stringify({
          tenant_id, 
          agent_id: agent_id || "default-router",
          prompt,
          active_dataset_ids: active_dataset_ids || [],
          history: history || [],
          stream: true, // Tell the backend to emit SSE
        }),
      });
    } catch (fetchError) {
      console.error("[Orchestrator] Backend Network Error (e.g., Render cold start):", fetchError);
      return NextResponse.json(
        { 
          type: "error", 
          message: "The Analytical Engine is currently starting up or unreachable. Please try again in a few seconds." 
        },
        { status: 503 } // 503 Service Unavailable is much more descriptive than 500
      );
    }

    if (!backendResponse.ok || !backendResponse.body) {
      const errorData = await backendResponse.text().catch(() => "Unknown backend error");
      console.error(`[Orchestrator] Backend Connection Failed (${backendResponse.status}):`, errorData);
      return NextResponse.json(
        { type: "error", message: "The Analytical Engine refused the connection or failed to process." },
        // If the backend 500s, tell the client it's a Bad Gateway (502)
        { status: backendResponse.status >= 500 ? 502 : backendResponse.status }
      );
    }

    // 4. Transform Stream (Hybrid Performance Paradigm)
    const stream = new ReadableStream({
      async start(controller) {
        const reader = backendResponse.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // We decode/encode to allow the potential injection of mid-stream Next.js metadata in the future
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(encoder.encode(chunk));
          }
        } catch (err) {
          console.error("[Orchestrator] Stream Interrupted:", err);
          const errorPacket: StreamPacket = { 
            type: "error", 
            content: "The data stream was interrupted during computation." 
          };
          // Emit standard SSE format for the fallback error
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(errorPacket)}\n\n`));
        } finally {
          reader.releaseLock();
          controller.close();
        }
      },
    });

    // 5. Return the response with proper SSE headers
    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no", // Prevent Cloudflare/Nginx from buffering the stream
      },
    });

  } catch (error: any) {
    console.error("[Orchestrator] Fatal Route Error:", error);
    return NextResponse.json(
      { 
        type: "error", 
        message: "A critical error occurred in the orchestration layer.",
        // Optionally provide slightly more debug info in development
        ...(process.env.NODE_ENV === "development" && { details: error.message })
      },
      { status: 500 }
    );
  }
}
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
    // FIX: createClient() is now async, so we must await it.
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

    // 2. Parse Incoming Payload
    const body = await req.json();
    const { agent_id, prompt, active_dataset_ids, history } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Analytical prompt is required." }, { status: 400 });
    }

    // 3. Initiate Stream from Python Backend (Render)
    // We proxy the request to our high-performance Python engine.
    const backendResponse = await fetch(`${BACKEND_URL}/api/chat/orchestrate`, {
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

    if (!backendResponse.ok || !backendResponse.body) {
      const errorData = await backendResponse.text();
      console.error("[Orchestrator] Backend Connection Failed:", errorData);
      return NextResponse.json(
        { type: "error", message: "The Analytical Engine is currently unavailable." },
        { status: 502 }
      );
    }

    // 4. Transform Stream (Hybrid Performance Paradigm)
    // We pipe the backend's Uint8Array stream directly through a transform to the client.
    // This allows us to inject mid-stream metadata if needed in the future.
    const stream = new ReadableStream({
      async start(controller) {
        const reader = backendResponse.body!.getReader();
        const decoder = new TextDecoder();

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Forward the raw chunk (assuming backend sends valid JSON chunks or SSE)
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(new TextEncoder().encode(chunk));
          }
        } catch (err) {
          console.error("[Orchestrator] Stream Interrupted:", err);
          const errorPacket: StreamPacket = { 
            type: "error", 
            content: "The data stream was interrupted during computation." 
          };
          controller.enqueue(new TextEncoder().encode(JSON.stringify(errorPacket)));
        } finally {
          controller.close();
        }
      },
    });

    // 5. Return the response with SSE headers
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
        message: "A critical error occurred in the orchestration layer." 
      },
      { status: 500 }
    );
  }
}
// app/api/chat/orchestrate/route.ts

import { NextResponse } from "next/server";
// Assuming you have a standard Supabase server client utility
// import { createClient } from "@/utils/supabase/server";

const BACKEND_URL = process.env.BACKEND_API_URL || "http://127.0.0.1:8000";

export async function POST(req: Request) {
  try {
    // 1. Parse the incoming payload from ChatLayout.tsx
    const body = await req.json();
    const { agent_id, prompt, active_dataset_ids, history } = body;

    if (!prompt) {
      return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
    }

    // 2. Authentication & Tenant Isolation (Supabase)
    // In production, you MUST verify the user's session before hitting your data engine.
    /*
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const tenant_id = session.user.id;
    const access_token = session.access_token;
    */
   
    // MOCK TENANT FOR DEVELOPMENT (Remove in prod)
    const tenant_id = "tenant_123";
    const access_token = "mock_token";

    // 3. Forward the request to the Python FastAPI Backend
    console.log(`[Next.js] Proxying chat request to Python Engine for tenant: ${tenant_id}`);
    
    const response = await fetch(`${BACKEND_URL}/api/chat/orchestrate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Pass the auth token so the FastAPI backend can verify it via dependency injection
        "Authorization": `Bearer ${access_token}`,
      },
      body: JSON.stringify({
        tenant_id: tenant_id, // Safely injected by the server, NEVER trust the client
        agent_id: agent_id || "default-router",
        prompt: prompt,
        active_dataset_ids: active_dataset_ids || [],
        history: history || [],
      }),
    });

    // 4. Handle Backend Errors Gracefully
    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Next.js] Python Backend Error:", errorText);
      
      // Return a formatted ExecutionPayload error so DynamicChartFactory renders it beautifully
      return NextResponse.json(
        {
          type: "error",
          message: "The Analytical Engine encountered an error while processing your request.",
        },
        { status: response.status }
      );
    }

    // 5. Stream the ExecutionPayload back to the Frontend
    const data = await response.json();
    return NextResponse.json(data);

  } catch (error: any) {
    console.error("[Next.js] API Route Exception:", error);
    return NextResponse.json(
      { 
        type: "error", 
        message: "An internal server error occurred while connecting to the data engine." 
      },
      { status: 500 }
    );
  }
}
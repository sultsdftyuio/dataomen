// app/api/account/change-password/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createStatelessClient } from "@supabase/supabase-js";
import { z } from "zod";

// 1. Strict Validation Schema
const PasswordChangeSchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8, "New password must be at least 8 characters"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = PasswordChangeSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid payload", details: parsed.error.format() },
        { status: 400 }
      );
    }

    const { currentPassword, newPassword } = parsed.data;
    
    // Main client handles active session via cookies
    const supabase = await createClient();
    const { data: { user }, error: userError } = await supabase.auth.getUser();

    if (userError || !user || !user.email) {
      return NextResponse.json({ error: "Unauthorized or invalid session." }, { status: 401 });
    }

    // 2. Verify current password (if not in recovery mode)
    if (currentPassword) {
      // Initialize a stateless client that DOES NOT modify cookies
      const verifyClient = createStatelessClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
          auth: {
            persistSession: false, // CRITICAL: prevents overwriting the active session
            autoRefreshToken: false,
          },
        }
      );

      const { error: verifyError } = await verifyClient.auth.signInWithPassword({
        email: user.email,
        password: currentPassword,
      });

      if (verifyError) {
        return NextResponse.json(
          { error: "Current password incorrect." },
          { status: 403 }
        );
      }
    }

    // 3. Execute the cryptographic update on the main authenticated client
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPassword,
    });

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    return NextResponse.json({ 
      success: true, 
      message: "Credentials updated securely." 
    });

  } catch (error: any) {
    console.error("[AUTH_UPDATE_ERROR]", error);
    return NextResponse.json(
      { error: "Internal server error during cryptographic update." },
      { status: 500 }
    );
  }
}
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const INVALID_CREDENTIALS_MESSAGES = ["invalid login credentials", "invalid_grant"];

export async function POST(request: Request) {
  let body: { email?: string; password?: string };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ detail: "Invalid JSON payload." }, { status: 400 });
  }

  const email = (body.email || "").trim().toLowerCase();
  const password = body.password || "";

  if (!email || !password) {
    return NextResponse.json({ detail: "Email and password are required." }, { status: 400 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    const detail = error?.message || "Could not sign in.";
    const isInvalidCredentials = INVALID_CREDENTIALS_MESSAGES.some((token) =>
      detail.toLowerCase().includes(token)
    );

    return NextResponse.json(
      { detail },
      { status: isInvalidCredentials ? 401 : 400 }
    );
  }

  return NextResponse.json({ success: true }, { status: 200 });
}

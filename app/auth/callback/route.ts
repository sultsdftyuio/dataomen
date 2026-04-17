import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

const DEFAULT_REDIRECT_PATH = "/chat";
const RECOVERY_REDIRECT_PATH = "/settings?recovery=1";

const isSafeRedirectPath = (value: string | null): value is string => {
  return Boolean(value && value.startsWith("/") && !value.startsWith("//"));
};

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const { searchParams, origin } = requestUrl;

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const rawType = searchParams.get("type");
  const callbackError = searchParams.get("error");
  const requestedNext = searchParams.get("next");

  const isRecoveryFlow = rawType === "recovery";
  const redirectPath = isSafeRedirectPath(requestedNext)
    ? requestedNext
    : isRecoveryFlow
      ? RECOVERY_REDIRECT_PATH
      : DEFAULT_REDIRECT_PATH;

  if (callbackError) {
    return NextResponse.redirect(new URL("/login?error=oauth_callback_failed", origin));
  }

  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL("/login?error=oauth_callback_failed", origin));
    }
  } else if (tokenHash && rawType) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    });

    if (error) {
      return NextResponse.redirect(new URL("/forgot-password?error=recovery_link_invalid", origin));
    }
  }

  return NextResponse.redirect(new URL(redirectPath, origin));
}

import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Reset Password | Arcli",
  description: "Request a password reset link for your Arcli account.",
  robots: { index: false, follow: false },
};

export default function ForgotPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}

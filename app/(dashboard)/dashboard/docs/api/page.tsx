import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { createClient } from "@/utils/supabase/server";

import { ApiDocsClient } from "./api-docs-client";

export const metadata: Metadata = {
  title: "API Documentation | Arcli",
  description: "Authenticate and send high-intent churn signals to Arcli.",
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ApiDocumentationPage() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login?next=/dashboard/docs/api");
  }

  return <ApiDocsClient />;
}

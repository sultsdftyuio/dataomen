import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import FileUploadZone from "@/components/ingestion/FileUploadZone"; // Make sure this path matches your folder structure
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export const metadata = {
  title: "Dashboard | DataOmen",
  description: "Upload and manage your analytical datasets.",
};

export default async function DashboardPage() {
  // 1. Await the cookies promise (Next.js 15 requirement)
  const cookieStore = await cookies();
  
  // Initialize the read-only Supabase client for Server Components
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );

  // Fetch the active user session securely from the backend
  const { data: { user }, error } = await supabase.auth.getUser();

  // Failsafe: If no user is returned, bounce them back to login
  if (error || !user) {
    redirect("/login");
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      {/* Minimal Dashboard Navigation */}
      <header className="bg-white border-b border-gray-200 dark:bg-gray-900 dark:border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            DataOmen
          </h1>
          <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-md dark:bg-gray-800">
            Workspace: {user.email}
          </span>
        </div>
        
        {/* Inline Server Action for Secure Logout */}
        <form action={async () => {
          "use server";
          
          // Next.js 15: Must await cookies inside the server action too
          const actionCookieStore = await cookies();
          
          const supabaseAction = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            { 
              cookies: { 
                getAll() { return actionCookieStore.getAll(); }, 
                setAll() {} // Keep setAll empty since we are just signing out
              } 
            }
          );
          
          await supabaseAction.auth.signOut();
          redirect("/login");
        }}>
          <Button variant="ghost" size="sm" type="submit">
            <LogOut className="w-4 h-4 mr-2" />
            Sign Out
          </Button>
        </form>
      </header>

      {/* Main Workspace Area */}
      <main className="max-w-5xl mx-auto py-12 px-6">
        <div className="mb-8">
          <h2 className="text-3xl font-semibold text-gray-900 dark:text-white mb-2">
            Data Ingestion Engine
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Drop your raw CSV files below. Our engine will automatically sanitize, compress to Parquet, and prepare them for AI analysis.
          </p>
        </div>

        {/* The client-side File Dropzone component we built earlier */}
        <FileUploadZone />
        
      </main>
    </div>
  );
}
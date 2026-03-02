"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardOrchestrator } from '@/components/dashboard/DashboardOrchestrator';
import { supabase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LogOut, User, Activity } from 'lucide-react';
import { toast } from 'sonner';

export default function DashboardPage() {
  const router = useRouter();
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Client-Side Route Protection
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error || !session) {
          toast.error("Please log in to access the dashboard.");
          router.push('/login');
          return;
        }

        setUserEmail(session.user.email || 'Analyst');
      } catch (err) {
        console.error('Auth Check Error:', err);
        router.push('/login');
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Logged out successfully");
    router.push('/login'); // Redirect to login or landing page
  };

  // Prevent flashing the dashboard UI before confirming the user is authenticated
  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Activity className="w-8 h-8 text-primary animate-pulse" />
      </div>
    );
  }

  return (
    <main className="flex h-screen flex-col bg-background overflow-hidden">
      {/* SaaS Dashboard Header */}
      <header className="px-6 py-3 border-b border-border flex items-center justify-between bg-card shrink-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center shadow-inner">
            <Activity className="w-5 h-5 text-primary-foreground" />
          </div>
          <h1 className="text-lg font-bold tracking-tight text-foreground">DataOmen Workspace</h1>
        </div>
        
        <div className="flex items-center gap-4">
          {userEmail && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/30 px-3 py-1.5 rounded-full border border-border">
              <User className="w-4 h-4" />
              <span className="font-medium">{userEmail}</span>
            </div>
          )}
          
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={handleLogout} 
            className="flex items-center gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </Button>
        </div>
      </header>
      
      {/* Main Workspace Area 
        The orchestrator handles the file uploads, querying, and dynamic chart rendering cleanly.
      */}
      <div className="flex-1 w-full h-[calc(100vh-3.5rem)] overflow-hidden">
        <DashboardOrchestrator />
      </div>
    </main>
  );
}
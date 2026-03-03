"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardOrchestrator } from '@/components/dashboard/DashboardOrchestrator';
import { supabase } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LogOut, LayoutDashboard, Activity } from 'lucide-react';
import { toast } from 'sonner';

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState<any>(null);

    // Security & State Management: Ensure user is authenticated before mounting the dashboard
    useEffect(() => {
        const checkUser = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                router.replace('/login');
            } else {
                setUser(session.user);
            }
        };
        checkUser();
    }, [router]);

    // Handle seamless session termination
    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            toast.success("Successfully logged out");
            router.replace('/login');
        } catch (error) {
            toast.error("Failed to log out");
        }
    };

    // Clean loading state while session hydrates
    if (!user) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="animate-pulse flex flex-col items-center gap-4">
                    <div className="bg-primary/10 p-3 rounded-xl">
                        <Activity className="w-8 h-8 text-primary" />
                    </div>
                    <p className="text-muted-foreground font-medium">Authenticating workspace...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background flex flex-col overflow-hidden">
            {/* High-Performance Header
              Strictly configured to h-16 (4rem) to ensure the DashboardOrchestrator's
              h-[calc(100vh-4rem)] fills the exact remaining screen space without scrolling.
            */}
            <header className="h-16 border-b flex items-center justify-between px-6 bg-card shrink-0">
                <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg">
                        <LayoutDashboard className="w-5 h-5 text-primary" />
                    </div>
                    <h1 className="font-bold text-lg tracking-tight text-foreground">
                        Proactive Analytics
                    </h1>
                </div>

                <div className="flex items-center gap-4">
                    <div className="text-sm font-medium text-muted-foreground hidden md:block px-3 py-1 bg-muted rounded-md border border-border">
                        {user.email}
                    </div>
                    <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={handleLogout} 
                        className="text-muted-foreground hover:text-foreground hover:bg-muted"
                    >
                        <LogOut className="w-4 h-4 mr-2" />
                        Sign Out
                    </Button>
                </div>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden">
                {/* The Suspense boundary is strictly required by Next.js App Router 
                  when using `useSearchParams` (which we do inside useAnomalyDeepLink).
                  It guarantees safe static/client rendering handoffs. 
                */}
                <Suspense fallback={
                    <div className="h-full flex items-center justify-center flex-col gap-4 p-8">
                        <Activity className="w-8 h-8 text-primary/50 animate-bounce" />
                        <p className="text-muted-foreground">Loading Analytical Context...</p>
                    </div>
                }>
                    <DashboardOrchestrator />
                </Suspense>
            </main>
        </div>
    );
}
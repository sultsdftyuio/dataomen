// hooks/useAnomalyDeepLink.ts
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

// Instantiate Supabase client (ensure your env vars are prefixed with NEXT_PUBLIC_)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export interface AnomalyState {
    id: string;
    agent_id: string;
    metric: string;
    date: string;
    filters: any[]; // These are the Top Variance Drivers we discovered in Phase 3
    diagnostic_summary: string;
    status: string;
}

export function useAnomalyDeepLink() {
    const searchParams = useSearchParams();
    const anomalyId = searchParams.get('anomaly_id');

    const [anomalyContext, setAnomalyContext] = useState<AnomalyState | null>(null);
    const [isHydrating, setIsHydrating] = useState<boolean>(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // If there's no anomaly_id in the URL, exit fast (standard dashboard load)
        if (!anomalyId) return;

        const hydrateAnomalyState = async () => {
            setIsHydrating(true);
            try {
                // Fetch the exact state the AI generated in Phase 3
                const { data, error } = await supabase
                    .from('anomaly_states')
                    .select('*')
                    .eq('id', anomalyId)
                    .single();

                if (error) throw error;
                
                if (data) {
                    setAnomalyContext(data as AnomalyState);
                }
            } catch (err: any) {
                console.error("Failed to hydrate anomaly context:", err);
                setError(err.message || "Could not load anomaly details.");
            } finally {
                setIsHydrating(false);
            }
        };

        hydrateAnomalyState();
    }, [anomalyId]);

    const clearAnomalyContext = () => {
        // Allows the user to "dismiss" the investigation and return to default view
        setAnomalyContext(null);
        // Optional: Remove query param from URL without reloading using router.replace()
    };

    return { anomalyContext, isHydrating, error, clearAnomalyContext };
}
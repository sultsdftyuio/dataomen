import { useState, useEffect, useRef } from 'react';

// Interaction Guidelines: Ensure we never default to localhost in a Vercel production build.
// Vercel exposes NODE_ENV automatically.
const isProd = process.env.NODE_ENV === 'production';

// Fallback to exactly your Render backend or local backend. 
// NOTE: Make sure NEXT_PUBLIC_API_URL is configured in your Vercel Project Settings!
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || (isProd ? 'https://dataomen-api.onrender.com' : 'http://localhost:10000');

export interface JobState {
  status: 'idle' | 'waking_server' | 'loading' | 'success' | 'error';
  // Note: Replace `any` with your specific DuckDB/Polars return type interface later
  data: any | null; 
  error: string | null;
}

export function useAsyncJob(jobId: string | null): JobState {
  const [state, setState] = useState<JobState>({
    status: 'idle',
    data: null,
    error: null
  });

  // We use AbortController to cancel out-of-date requests if the jobId changes
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!jobId) {
        setState(prev => ({ ...prev, status: 'idle' }));
        return;
    }

    let mounted = true;
    
    const fetchJob = async () => {
      // Step 1: Indicate potential cold-start to the UI immediately
      setState(prev => ({ ...prev, status: 'waking_server' }));
      
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      abortControllerRef.current = new AbortController();

      try {
        const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            // If you need to pass JWT to the backend for tenant security, do it here:
            // 'Authorization': `Bearer ${sessionToken}` 
          },
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) {
          throw new Error(`HTTP Error: ${response.status} - ${response.statusText}`);
        }

        const result = await response.json();
        
        if (mounted) {
          setState({ status: 'success', data: result, error: null });
        }
      } catch (err: any) {
        // Ignore errors caused by the fetch being aborted intentionally
        if (err.name === 'AbortError') return;
        
        console.error("[Analytical Engine Error]", err);
        
        if (mounted) {
          // If the error message mentions fetching, it's likely a CORS or URL issue
          const isNetworkError = err.message.includes('fetch');
          
          setState({ 
            status: 'error', 
            data: null, 
            error: isNetworkError 
                ? `Network connection failed. Verify NEXT_PUBLIC_API_URL is set correctly to the Render URL.` 
                : err.message || 'Failed to connect to the analytical engine.' 
          });
        }
      }
    };

    fetchJob();

    return () => {
      mounted = false;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [jobId]);

  return state;
}
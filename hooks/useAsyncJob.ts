import { useState, useEffect } from 'react';

// Strict type interfaces for robust state management
export type JobStatus = 'idle' | 'processing' | 'completed' | 'failed';

export interface JobState<T> {
  status: JobStatus;
  data: T | null;
  error: string | null;
}

/**
 * Custom React Hook to offload heavy analytical tracking to the client side.
 * Automatically polls the backend until the worker queue resolves the job.
 */
export function useAsyncJob<T>(jobId: string | null, pollIntervalMs: number = 2000): JobState<T> {
  const [state, setState] = useState<JobState<T>>({
    status: 'idle',
    data: null,
    error: null,
  });

  useEffect(() => {
    // If there is no active job, remain idle.
    if (!jobId) {
      setState({ status: 'idle', data: null, error: null });
      return;
    }

    let isMounted = true;
    let intervalId: NodeJS.Timeout;

    const pollJobStatus = async () => {
      try {
        // Assume API endpoint: GET /api/v1/jobs/{jobId}
        const response = await fetch(`/api/v1/jobs/${jobId}`);
        if (!response.ok) throw new Error('Failed to fetch job status');

        const result = await response.json();

        if (isMounted) {
          if (result.status === 'completed') {
            setState({ status: 'completed', data: result.data, error: null });
            clearInterval(intervalId); // Terminate polling
          } else if (result.status === 'failed') {
            setState({ status: 'failed', data: null, error: result.error_message });
            clearInterval(intervalId); // Terminate polling
          } else {
            // Still processing
            setState((prev) => ({ ...prev, status: 'processing' }));
          }
        }
      } catch (err: any) {
        if (isMounted) {
          setState({ status: 'failed', data: null, error: err.message });
          clearInterval(intervalId);
        }
      }
    };

    // Initiate the polling lifecycle
    setState({ status: 'processing', data: null, error: null });
    pollJobStatus(); // First check immediate
    intervalId = setInterval(pollJobStatus, pollIntervalMs);

    // Cleanup phase: prevent state updates on unmounted components
    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [jobId, pollIntervalMs]);

  return state;
}
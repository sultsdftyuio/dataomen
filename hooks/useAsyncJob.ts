"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "@/components/ui/use-toast";

// -----------------------------------------------------------------------------
// Type Definitions
// -----------------------------------------------------------------------------

export type JobStatus = "idle" | "pending" | "processing" | "success" | "error";

interface AsyncJobResponse<T> {
  status: string; // From the backend (e.g., 'pending', 'success', 'failed')
  message?: string; // Optional progress or error message
  data?: T; // The final payload once successful
  
  // Specific to Datasets API
  schema_metadata?: {
    error?: string;
    [key: string]: any;
  };
}

interface UseAsyncJobOptions<T> {
  token: string | null;
  endpoint: string | null; // The API URL to poll. If null, polling is disabled.
  intervalMs?: number; // Base polling interval (defaults to 3 seconds)
  maxAttempts?: number; // Kill switch to prevent infinite polling (defaults to 100)
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseAsyncJobReturn<T> {
  data: T | null;
  status: JobStatus;
  progressMessage: string;
  error: Error | null;
  cancelJob: () => void;
}

// -----------------------------------------------------------------------------
// The Hook
// -----------------------------------------------------------------------------

export function useAsyncJob<T = any>({
  token,
  endpoint,
  intervalMs = 3000,
  maxAttempts = 100,
  onSuccess,
  onError
}: UseAsyncJobOptions<T>): UseAsyncJobReturn<T> {
  
  // Internal State
  const [data, setData] = useState<T | null>(null);
  const [status, setStatus] = useState<JobStatus>("idle");
  const [progressMessage, setProgressMessage] = useState<string>("");
  const [error, setError] = useState<Error | null>(null);

  // Refs for tracking mutable loop state without triggering re-renders
  const attemptsRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // FIXED: Corrected useCallback syntax with arguments and dependency array
  const cleanUp = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  }, []);

  const pollEndpoint = useCallback(async () => {
    if (!endpoint || !token) return;

    attemptsRef.current += 1;
    abortControllerRef.current = new AbortController();

    try {
      const res = await fetch(endpoint, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        signal: abortControllerRef.current.signal
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}: ${res.statusText}`);
      }

      const rawData: AsyncJobResponse<T> = await res.json();
      const backendStatus = rawData.status.toLowerCase();

      // Handle Database/Dataset Error States
      if (backendStatus === "failed" || backendStatus === "error") {
        const errorMsg = rawData.message || rawData.schema_metadata?.error || "Background task failed.";
        throw new Error(errorMsg);
      }

      // Handle Success State
      if (backendStatus === "success" || backendStatus === "ready") {
        setStatus("success");
        setProgressMessage("Complete.");
        
        // Final data might be nested or at root depending on endpoint
        const finalData = rawData.data || (rawData as unknown as T);
        setData(finalData);
        cleanUp();
        
        if (onSuccess) {
          onSuccess(finalData);
        }
        return;
      }

      // Handle In-Progress State
      setStatus(backendStatus === "pending" ? "pending" : "processing");
      if (rawData.message) {
        setProgressMessage(rawData.message);
      }

      // Queue next poll (Dynamic Backoff: Increase interval slightly after 20 attempts)
      if (attemptsRef.current >= maxAttempts) {
        throw new Error("Task timed out. The operation took too long to complete.");
      }

      const nextInterval = attemptsRef.current > 20 ? intervalMs * 1.5 : intervalMs;
      timeoutRef.current = setTimeout(pollEndpoint, nextInterval);

    } catch (err: any) {
      if (err.name === "AbortError") {
        return; // safely ignore
      }
      
      cleanUp();
      setStatus("error");
      setError(err);
      
      toast({
        title: "Background Task Failed",
        description: err.message || "Could not retrieve task status.",
        variant: "destructive"
      });

      if (onError) onError(err);
    }
  }, [endpoint, token, intervalMs, maxAttempts, onSuccess, onError, cleanUp]);

  // Main Orchestration Effect
  useEffect(() => {
    // Reset state when the endpoint changes
    attemptsRef.current = 0;
    setError(null);
    
    if (endpoint && token) {
      setStatus("pending");
      pollEndpoint();
    } else {
      setStatus("idle");
      cleanUp();
    }

    return () => {
      cleanUp();
    };
  }, [endpoint, token, pollEndpoint, cleanUp]);

  // Expose a manual cancel function for the UI
  const cancelJob = useCallback(() => {
    cleanUp();
    setStatus("idle");
    setProgressMessage("Operation cancelled by user.");
  }, [cleanUp]);

  return { data, status, progressMessage, error, cancelJob };
}
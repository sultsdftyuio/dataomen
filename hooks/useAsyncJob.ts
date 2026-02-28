import { useState, useEffect } from 'react';

// Modular Strategy: Resolve API base URL based on environment variables
// Falls back to localhost for development to prevent connection errors
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

export function useAsyncJob(jobId: string | null) {
  const [status, setStatus] = useState<string>('idle');
  const [result, setResult] = useState<any>(null);

  useEffect(() => {
    if (!jobId) return;

    const checkStatus = async () => {
      try {
        // Engineering Excellence: Use environment-aware URLs
        const response = await fetch(`${API_BASE_URL}/api/v1/datasets/job/${jobId}`);
        if (!response.ok) throw new Error('Failed to fetch job status');
        
        const data = await response.json();
        setStatus(data.status);
        if (data.status === 'completed') {
          setResult(data.result);
        }
      } catch (error) {
        console.error('Job polling error:', error);
        setStatus('error');
      }
    };

    const interval = setInterval(checkStatus, 3000);
    return () => clearInterval(interval);
  }, [jobId]);

  return { status, result };
}
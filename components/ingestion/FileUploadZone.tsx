// components/ingestion/FileUploadZone.tsx
"use client";

import React, { useState, useCallback } from 'react';
import { UploadCloud, File as FileIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

export interface UploadSuccessData {
  datasetId?: string;
  ephemeralPath?: string;
  datasetName: string;
}

interface FileUploadZoneProps {
  isEphemeral?: boolean; // True for "Try it out" landing page, False for Dashboard
  token?: string; // JWT/Supabase token if authenticated
  onUploadSuccess: (data: UploadSuccessData) => void;
}

export default function FileUploadZone({ 
  isEphemeral = false, 
  token, 
  onUploadSuccess 
}: FileUploadZoneProps) {
  
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    // Prevent massive files from choking the browser memory immediately
    if (file.size > 100 * 1024 * 1024) { // 100MB limit for UI protection
        setError("File exceeds 100MB UI limit. Please use the API directly for larger files.");
        return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const formData = new FormData();
      formData.append('file', file);
      
      // Dynamic Endpoint Routing
      const endpoint = isEphemeral ? '/api/datasets/ephemeral-upload' : '/api/datasets/upload';
      
      // Persistent uploads require metadata
      if (!isEphemeral) {
        formData.append('name', file.name.replace(/\.[^/.]+$/, ""));
        formData.append('description', 'Uploaded via Web Dropzone');
      }

      // Dynamic Headers
      const headers: HeadersInit = {};
      if (!isEphemeral && token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || 'Network response was not ok.');
      }

      const data = await res.json();
      setSuccess(true);
      
      // Bubble the state up to the Page/Orchestrator so the Chat UI can open
      onUploadSuccess({
        datasetId: data.dataset?.id,
        ephemeralPath: data.ephemeral_path,
        datasetName: data.dataset?.name || file.name
      });

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during upload.');
    } finally {
      setIsUploading(false);
      setIsDragging(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) processFile(droppedFile);
  }, [isEphemeral, token]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) processFile(selectedFile);
  };

  return (
    <div 
      className={`relative flex flex-col items-center justify-center w-full max-w-2xl p-10 border-2 border-dashed rounded-2xl transition-all duration-200 
        ${isDragging ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10' : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900'}
        ${isUploading ? 'opacity-50 pointer-events-none' : ''}
      `}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input 
        type="file" 
        accept=".csv,.json,.parquet" 
        onChange={handleFileChange} 
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isUploading || success}
        aria-label="Upload Dataset"
      />
      
      {isUploading ? (
        <div className="flex flex-col items-center text-blue-500">
          <Loader2 className="w-12 h-12 mb-4 animate-spin" />
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Optimizing & Compressing...</p>
          <p className="text-sm text-gray-500 mt-2">Converting to columnar Parquet format</p>
        </div>
      ) : success ? (
        <div className="flex flex-col items-center text-emerald-500">
          <CheckCircle2 className="w-12 h-12 mb-4" />
          <p className="text-lg font-semibold text-gray-700 dark:text-gray-300">Data Ready!</p>
          <p className="text-sm text-gray-500 mt-2">Connecting to analytical engine...</p>
        </div>
      ) : (
        <div className="flex flex-col items-center text-gray-500 dark:text-gray-400">
          <UploadCloud className="w-16 h-16 mb-4 text-gray-400 transition-transform group-hover:scale-110" />
          <p className="text-xl font-bold text-gray-700 dark:text-gray-200">
            Drag & Drop to {isEphemeral ? 'Try it Out' : 'Upload'}
          </p>
          <p className="text-sm mt-2">or click anywhere to browse</p>
          <div className="flex items-center gap-4 mt-6 text-xs text-gray-400 font-medium">
            <span className="flex items-center gap-1"><FileIcon className="w-4 h-4"/> CSV</span>
            <span className="flex items-center gap-1"><FileIcon className="w-4 h-4"/> JSON</span>
            <span className="flex items-center gap-1"><FileIcon className="w-4 h-4"/> PARQUET</span>
          </div>
        </div>
      )}

      {error && (
        <div className="absolute -bottom-16 left-0 w-full flex items-center justify-center gap-2 text-red-500 text-sm font-medium bg-red-50 dark:bg-red-900/20 p-3 rounded-lg border border-red-200 dark:border-red-800 shadow-sm animate-in fade-in slide-in-from-bottom-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="text-center">{error}</span>
        </div>
      )}
    </div>
  );
}
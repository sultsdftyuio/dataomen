"use client";

import React, { useState, useCallback, useRef } from 'react';
import { UploadCloud, File as FileIcon, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

export interface UploadSuccessData {
  datasetId?: string;
  ephemeralPath?: string;
  datasetName: string;
}

interface FileUploadZoneProps {
  isEphemeral?: boolean;
  onUploadSuccess?: (data: UploadSuccessData) => void;
  className?: string;
}

export default function FileUploadZone({ 
  isEphemeral = false, 
  onUploadSuccess, 
  className 
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    setUploadStatus('idle');
    setErrorMessage('');

    const formData = new FormData();
    formData.append('file', file);
    // Explicitly let the backend know if this is an ephemeral (sandbox) dataset or persistent multi-tenant dataset
    formData.append('is_ephemeral', String(isEphemeral));

    try {
      // EXACT ROUTE MATCHING: No trailing slash!
      // This prevents the FastAPI 307 Temporary Redirect that drops the POST body and causes a 405 Method Not Allowed.
      // Note: We deliberately do NOT set 'Content-Type' headers. The browser automatically injects 'multipart/form-data' with the boundary.
      const response = await fetch('/api/datasets/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Ingestion failed with status ${response.status}`);
      }

      const data = await response.json();
      
      setUploadStatus('success');
      toast({
        title: "Ingestion Complete",
        description: `${data.filename || file.name} has been securely staged.`,
      });

      if (onUploadSuccess) {
        onUploadSuccess({
          datasetId: data.dataset_id || data.id, // Handles both ephemeral and persistent schema responses
          datasetName: data.filename || file.name,
          ephemeralPath: data.file_path,
        });
      }

    } catch (error: any) {
      console.error("Upload error:", error);
      setUploadStatus('error');
      setErrorMessage(error.message || "An unexpected error occurred during ingestion.");
      toast({
        title: "Upload Failed",
        description: error.message || "Could not stage dataset.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      // Prioritize vectorized analytical formats
      const allowedTypes = ['.csv', '.parquet', '.json'];
      const fileName = files[0].name.toLowerCase();
      const isValid = allowedTypes.some(ext => fileName.endsWith(ext));

      if (!isValid) {
        setUploadStatus('error');
        setErrorMessage("Unsupported file type. Please upload CSV, Parquet, or JSON.");
        return;
      }

      uploadFile(files[0]);
    }
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      uploadFile(files[0]);
    }
  }, []);

  // Automatically reset UI after a few seconds of success
  React.useEffect(() => {
    if (uploadStatus === 'success') {
      const timer = setTimeout(() => {
        setUploadStatus('idle');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [uploadStatus]);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={() => !isUploading && fileInputRef.current?.click()}
      className={cn(
        "relative flex flex-col items-center justify-center w-full max-w-2xl p-12 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ease-in-out",
        isDragging 
          ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20 shadow-inner" 
          : "border-slate-300 hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-600 bg-white/50 dark:bg-slate-900/50",
        isUploading && "pointer-events-none opacity-80",
        uploadStatus === 'error' && "border-red-400 bg-red-50/50 dark:bg-red-900/10",
        uploadStatus === 'success' && "border-green-400 bg-green-50/50 dark:bg-green-900/10",
        className
      )}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept=".csv,.parquet,.json"
      />
      
      <div className="flex flex-col items-center gap-4 text-center">
        {isUploading && <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />}
        {!isUploading && uploadStatus === 'idle' && <UploadCloud className={cn("w-12 h-12 transition-colors", isDragging ? "text-blue-500" : "text-slate-400")} />}
        {!isUploading && uploadStatus === 'success' && <CheckCircle2 className="w-12 h-12 text-green-500" />}
        {!isUploading && uploadStatus === 'error' && <AlertCircle className="w-12 h-12 text-red-500" />}
        
        <div className="space-y-1">
          <h3 className={cn(
            "text-lg font-semibold tracking-tight",
            uploadStatus === 'error' ? "text-red-600 dark:text-red-400" : "text-slate-900 dark:text-slate-100"
          )}>
            {isUploading && 'Ingesting data...'}
            {!isUploading && uploadStatus === 'idle' && (isDragging ? 'Drop file to ingest' : 'Upload your dataset')}
            {!isUploading && uploadStatus === 'success' && 'Ingestion successful'}
            {!isUploading && uploadStatus === 'error' && 'Upload failed'}
          </h3>
          
          <p className={cn(
            "text-sm max-w-sm",
            uploadStatus === 'error' ? "text-red-500" : "text-slate-500 dark:text-slate-400"
          )}>
            {uploadStatus === 'error' 
              ? errorMessage 
              : "Drag and drop your file here, or click to browse. Max size 5GB."}
          </p>
        </div>

        {uploadStatus === 'idle' && !isUploading && (
          <div className="flex items-center gap-2 mt-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="px-2 py-1 border border-slate-200 dark:border-slate-800 rounded bg-slate-100/50 dark:bg-slate-800/50">CSV</span>
            <span className="px-2 py-1 border border-slate-200 dark:border-slate-800 rounded bg-slate-100/50 dark:bg-slate-800/50 text-blue-600 dark:text-blue-400">Parquet</span>
            <span className="px-2 py-1 border border-slate-200 dark:border-slate-800 rounded bg-slate-100/50 dark:bg-slate-800/50">JSON</span>
          </div>
        )}
      </div>
    </div>
  );
}
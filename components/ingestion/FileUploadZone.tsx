"use client";

import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, File as FileIcon, X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { createClient } from '@/utils/supabase/client';

export default function FileUploadZone() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [datasetId, setDatasetId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  const handleFileChange = useCallback((selectedFile: File | null) => {
    setError(null);
    if (selectedFile) {
      // Basic validation
      const validTypes = ['text/csv', 'application/json'];
      if (!validTypes.includes(selectedFile.type) && !selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.json')) {
        setError("Invalid format. Please upload CSV or JSON for Parquet conversion.");
        return;
      }
      setFile(selectedFile);
      setDatasetId(null);
    }
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  }, [handleFileChange]);

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setProgress(10);
    setError(null);
    
    try {
      // 1. Enforce Security by Design
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Unauthenticated tenant session.");

      // 2. Hybrid Performance Paradigm: Simulated Ingestion -> S3/R2 -> Parquet via Backend
      // In a real implementation, you would use a presigned URL or chunked upload to your FastAPI backend here.
      const uploadInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + Math.floor(Math.random() * 20);
        });
      }, 400);

      // Simulating network and compute latency for DuckDB/Parquet validation
      await new Promise(resolve => setTimeout(resolve, 2500));
      clearInterval(uploadInterval);
      setProgress(100);

      // 3. Return the isolated pointer
      const mockGeneratedId = `ds_${Math.random().toString(36).substring(2, 11)}`;
      setDatasetId(mockGeneratedId);
      setFile(null); 

    } catch (err: any) {
      console.error("Ingestion Pipeline Error:", err);
      setError(err.message || "Failed to ingest and vectorize data.");
    } finally {
      setIsUploading(false);
    }
  };

  const resetZone = () => {
    setFile(null);
    setDatasetId(null);
    setProgress(0);
    setError(null);
  };

  return (
    <div className="w-full flex flex-col gap-3 font-sans">
      {/* Upload Dropzone */}
      {!file && !datasetId && (
        <div 
          onDragOver={onDragOver}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-neutral-300 dark:border-neutral-700 rounded-lg p-5 flex flex-col items-center justify-center text-center cursor-pointer bg-white dark:bg-neutral-900 hover:bg-blue-50 dark:hover:bg-blue-900/10 hover:border-blue-400 transition-all group"
        >
          <div className="h-10 w-10 rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <UploadCloud className="h-5 w-5 text-neutral-500 group-hover:text-blue-500 transition-colors" />
          </div>
          <p className="text-xs text-neutral-600 dark:text-neutral-400 leading-relaxed">
            <span className="font-semibold text-neutral-900 dark:text-neutral-200">Click</span> or drag & drop<br/>
            CSV or JSON payload
          </p>
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => handleFileChange(e.target.files ? e.target.files[0] : null)} 
            className="hidden" 
            accept=".csv,.json" 
          />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-md p-2.5 flex items-start gap-2 text-red-700 dark:text-red-400 text-xs">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{error}</span>
        </div>
      )}

      {/* Selected File State */}
      {file && !isUploading && (
        <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-md p-2.5 flex items-center justify-between shadow-sm group">
          <div className="flex items-center gap-2 overflow-hidden">
            <div className="p-1.5 bg-blue-50 dark:bg-blue-900/30 rounded text-blue-600 dark:text-blue-400 shrink-0">
              <FileIcon className="h-4 w-4" />
            </div>
            <div className="flex flex-col truncate">
              <span className="text-xs font-medium truncate text-neutral-900 dark:text-neutral-200">{file.name}</span>
              <span className="text-[10px] text-neutral-500">{(file.size / 1024).toFixed(1)} KB</span>
            </div>
          </div>
          <button onClick={resetZone} className="text-neutral-400 hover:text-red-500 shrink-0 p-1 transition-colors">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Uploading State */}
      {isUploading && (
        <div className="space-y-3 bg-white dark:bg-neutral-900 p-3.5 rounded-md border border-neutral-200 dark:border-neutral-800 shadow-sm">
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300">
            <span className="flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
              Converting to Parquet...
            </span>
            <span className="font-mono text-[11px]">{progress}%</span>
          </div>
          <Progress value={progress} className="h-1.5 bg-neutral-100 dark:bg-neutral-800" />
        </div>
      )}

      {/* Success State */}
      {datasetId && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 rounded-md p-3 flex flex-col gap-2">
          <div className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400 font-semibold text-xs">
            <CheckCircle2 className="h-4 w-4" /> 
            Ingestion Complete
          </div>
          <p className="text-[10px] text-emerald-600/80 dark:text-emerald-400/80 leading-tight">
            Data has been vectorized and partitioned. Use this pointer in the Analytical Engine:
          </p>
          <div className="text-[11px] text-neutral-800 dark:text-neutral-200 font-mono bg-white dark:bg-black px-2 py-1.5 rounded border border-emerald-200/50 dark:border-emerald-800/50 select-all cursor-text break-all flex items-center justify-between shadow-sm">
            {datasetId}
          </div>
          <button onClick={resetZone} className="text-[10px] font-medium text-emerald-700 hover:text-emerald-800 dark:text-emerald-400 mt-1 text-left">
            + Ingest another file
          </button>
        </div>
      )}

      {/* Trigger */}
      {file && !isUploading && (
        <Button onClick={handleUpload} size="sm" className="w-full text-xs font-semibold shadow-sm bg-blue-600 hover:bg-blue-700 text-white">
          Ingest & Vectorize
        </Button>
      )}
    </div>
  );
}
"use client";

import React, { useState, useRef, useCallback } from 'react';
import { UploadCloud, File as FileIcon, X, Loader2 } from 'lucide-react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';

// 1. Strict Type Safety: Adding the missing prop to IntrinsicAttributes
interface FileUploadZoneProps {
  onUploadSuccess?: (fileId: string) => void;
}

export function FileUploadZone({ onUploadSuccess }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    setProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress(10);

    const formData = new FormData();
    formData.append('file', file);

    try {
      // API call to the backend for ingestion (adapt URL as necessary)
      const response = await axios.post('/api/datasets/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setProgress(percentCompleted);
          }
        },
      });

      toast.success('Upload Successful', {
        description: 'Your dataset has been ingested successfully.',
      });

      // 2. Safely call the onUploadSuccess prop if provided
      const returnedId = response.data?.file_id || response.data?.dataset_id || response.data?.id;
      if (onUploadSuccess && returnedId) {
        onUploadSuccess(returnedId);
      }
      
      setTimeout(() => {
        clearFile();
        setUploading(false);
      }, 1500);

    } catch (error: any) {
      console.error('Upload error:', error);
      toast.error('Upload Failed', {
        description: error.response?.data?.detail || error.message || 'An error occurred during upload.',
      });
      setUploading(false);
      setProgress(0);
    }
  };

  return (
    <div className="w-full p-4 border rounded-xl bg-card">
      <div
        className={`relative flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
          isDragging ? 'border-primary bg-primary/10' : 'border-muted-foreground/25 hover:border-primary/50'
        } ${file ? 'bg-muted/50' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !file && fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          accept=".csv,.json,.parquet"
        />

        {!file ? (
          <div className="space-y-4 pointer-events-none">
            <div className="flex justify-center">
              <div className="p-4 bg-primary/10 rounded-full">
                <UploadCloud className="w-10 h-10 text-primary" />
              </div>
            </div>
            <div>
              <p className="text-lg font-semibold">Click or drag file to this area to upload</p>
              <p className="text-sm text-muted-foreground mt-2">Support for CSV, JSON, Parquet up to 50MB</p>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-sm flex items-center justify-between p-4 bg-background border rounded-lg shadow-sm">
            <div className="flex items-center space-x-4 overflow-hidden">
              <div className="p-2 bg-blue-500/10 rounded">
                <FileIcon className="w-6 h-6 text-blue-500 shrink-0" />
              </div>
              <div className="flex flex-col items-start truncate">
                <span className="text-sm font-medium truncate max-w-[200px]">{file.name}</span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </span>
              </div>
            </div>
            {!uploading && (
              <Button variant="ghost" size="icon" className="shrink-0" onClick={(e) => { e.stopPropagation(); clearFile(); }}>
                <X className="w-4 h-4 text-muted-foreground hover:text-foreground" />
              </Button>
            )}
          </div>
        )}
      </div>

      {file && uploading && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-primary" /> Ingesting Data...
            </span>
            <span className="font-medium">{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {file && !uploading && (
        <div className="mt-6 flex justify-end">
          <Button onClick={handleUpload} className="w-full sm:w-auto">
            Upload Dataset
          </Button>
        </div>
      )}
    </div>
  );
}
"use client";

import React, { useState, useRef } from 'react';
import { UploadCloud, File as FileIcon, X, Loader2 } from 'lucide-react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { createBrowserClient } from '@supabase/ssr';
import { toast } from 'sonner';

export function FileUploadZone() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 🚀 ENGINEERING EXCELLENCE: 
  // Always initialize the Supabase client using @supabase/ssr in Client Components. 
  // This ensures it reads the secure HttpOnly cookies set by the middleware, 
  // bypassing the "Not authenticated" race-condition bug.
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setUploadProgress(0);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      setUploadProgress(0);
    }
  };

  const clearFile = () => {
    setFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // 1. Security by Design: Cryptographically fetch the active session from cookies
      const { data: { session }, error: authError } = await supabase.auth.getSession();

      if (authError || !session?.access_token) {
        throw new Error("Not authenticated. Please log in.");
      }

      // 2. Prepare Vectorized Data Payload
      const formData = new FormData();
      formData.append('file', file);

      // 3. Orchestration: Injecting JWT for multi-tenant isolation
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      
      await axios.post(`${backendUrl}/api/datasets/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${session.access_token}`
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / (progressEvent.total ?? 1)
          );
          setUploadProgress(percentCompleted);
        },
      });

      toast.success("Dataset successfully ingested and vectorized.");
      clearFile();

    } catch (error: any) {
      console.error('Upload Error:', error);
      toast.error(error.response?.data?.detail || error.message || "Failed to process dataset.");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="w-full p-6 border-2 border-dashed border-border rounded-xl bg-card transition-colors hover:border-primary/50">
      {!file ? (
        <div 
          className="flex flex-col items-center justify-center py-10 cursor-pointer"
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center mb-4">
            <UploadCloud className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-semibold mb-1">Upload Dataset</h3>
          <p className="text-sm text-muted-foreground text-center max-w-sm">
            Drag & drop your CSV or Parquet file here, or click to browse. Data will be converted to a columnar format for analytical efficiency.
          </p>
        </div>
      ) : (
        <div className="flex flex-col space-y-4">
          <div className="flex items-center justify-between p-4 bg-muted/50 rounded-lg border border-border">
            <div className="flex items-center space-x-3 overflow-hidden">
              <div className="w-10 h-10 bg-primary/10 text-primary rounded-lg flex items-center justify-center shrink-0">
                <FileIcon className="w-5 h-5" />
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-medium truncate">{file.name}</p>
                <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
            </div>
            
            {!isUploading && (
              <Button variant="ghost" size="icon" onClick={clearFile} className="text-muted-foreground hover:text-destructive shrink-0">
                <X className="w-4 h-4" />
              </Button>
            )}
          </div>

          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-medium text-muted-foreground">
                <span>Ingesting...</span>
                <span>{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          <div className="flex justify-end gap-3 mt-4">
            <Button variant="outline" onClick={clearFile} disabled={isUploading}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={isUploading} className="min-w-[120px]">
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Processing
                </>
              ) : (
                'Upload Data'
              )}
            </Button>
          </div>
        </div>
      )}
      
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept=".csv,.xlsx,.xls,.parquet"
      />
    </div>
  );
}
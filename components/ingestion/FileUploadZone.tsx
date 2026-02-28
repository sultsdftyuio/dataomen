"use client";

import React, { useState, useCallback, useRef } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// 1. Strict TypeScript Interface to resolve the IntrinsicAttributes error
export interface FileUploadZoneProps {
  tenantId: string;
  onUploadSuccess?: (datasetPath: string) => void;
}

// 2. Named export to match your dashboard import
export function FileUploadZone({ tenantId, onUploadSuccess }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // In production, sync this with your Next.js env variables
  const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:10000";

  const handleUpload = async (file: File) => {
    if (!file) return;

    // Validate file type
    const allowedTypes = ["text/csv", "application/vnd.apache.parquet", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"];
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    
    if (!allowedTypes.includes(file.type) && !['csv', 'parquet', 'json', 'xlsx'].includes(fileExt || '')) {
      toast({
        title: "Invalid file type",
        description: "Please upload a CSV, JSON, XLSX, or Parquet file.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);

    try {
      // ====================================================================
      // PHASE 1: Request Cloudflare R2 Presigned URL from FastAPI Backend
      // ====================================================================
      setUploadProgress(20);
      const urlRes = await fetch(`${API_BASE_URL}/api/datasets/upload-url?filename=${encodeURIComponent(file.name)}&tenant_id=${encodeURIComponent(tenantId)}`);
      
      if (!urlRes.ok) {
        throw new Error("Failed to provision secure storage allocation.");
      }
      
      const { url, fields, storage_path } = await urlRes.json();

      // ====================================================================
      // PHASE 2: Direct-to-Storage Upload (Bypasses Vercel Limit completely)
      // ====================================================================
      setUploadProgress(40);
      const formData = new FormData();
      
      // AWS S3/Cloudflare R2 requires these specific fields attached BEFORE the file
      Object.entries(fields).forEach(([key, value]) => {
        formData.append(key, value as string);
      });
      formData.append("file", file);

      // Raw POST to Cloudflare R2 edge network
      const uploadRes = await fetch(url, {
        method: "POST",
        body: formData,
      });

      if (!uploadRes.ok) {
        throw new Error("Direct storage upload rejected by Edge network.");
      }

      // ====================================================================
      // PHASE 3: Notify Backend that Dataset is ready for DuckDB Vectorization
      // ====================================================================
      setUploadProgress(80);
      const registerRes = await fetch(`${API_BASE_URL}/api/datasets/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenant_id: tenantId,
          file_path: storage_path,
          original_name: file.name,
          file_size: file.size,
        }),
      });

      if (!registerRes.ok) {
        throw new Error("Backend failed to register and vectorize dataset.");
      }

      setUploadProgress(100);
      toast({
        title: "Upload Complete",
        description: "Dataset successfully converted and registered.",
      });

      // Pass the resulting identifier up to the DashboardOrchestrator
      if (onUploadSuccess) onUploadSuccess(storage_path);

    } catch (error: any) {
      console.error("Upload workflow failed:", error);
      toast({
        title: "Ingestion Error",
        description: error.message || "An unexpected error occurred during ingestion.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // --- Drag and Drop Handlers ---
  const onDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0]);
    }
  }, [tenantId]);

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ease-in-out cursor-pointer ${
        isDragging 
          ? "border-primary bg-primary/5 scale-[1.02]" 
          : "border-border hover:border-primary/50 hover:bg-muted/30"
      }`}
      onClick={() => !isUploading && fileInputRef.current?.click()}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={(e) => e.target.files && handleUpload(e.target.files[0])}
        className="hidden"
        accept=".csv,.parquet,.json,.xlsx"
      />
      
      {isUploading ? (
        <div className="flex flex-col items-center space-y-4 animate-in fade-in duration-300">
          <Loader2 className="w-12 h-12 animate-spin text-primary" />
          <div className="space-y-2 w-full max-w-xs">
            <p className="text-sm font-medium text-foreground">Optimizing & Vectorizing...</p>
            <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-300 ease-out" 
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground text-right">{uploadProgress}%</p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-4 pointer-events-none">
          <div className="p-4 bg-primary/10 rounded-full text-primary">
            <UploadCloud className="w-8 h-8" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              Click or drag a file to orchestrate
            </p>
            <p className="text-sm text-muted-foreground">
              Supports CSV, XLSX, JSON, and Parquet. Securely isolated for Tenant: <span className="font-mono text-xs">{tenantId.slice(0, 8)}...</span>
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
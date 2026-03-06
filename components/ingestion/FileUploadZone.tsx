"use client";

import React, { useState, useCallback } from "react";
import { UploadCloud, CheckCircle, AlertCircle, FileType } from "lucide-react";
import { cn } from "@/lib/utils";

export interface UploadSuccessData {
  dataset_id?: string;
  filename: string;
  status: string;
  row_count?: number;
  columns?: string[];
  [key: string]: any;
}

export interface FileUploadZoneProps {
  isEphemeral?: boolean;
  token?: string; // Added token to fix the TypeScript error
  onUploadSuccess?: (data: UploadSuccessData) => void;
  className?: string;
}

export default function FileUploadZone({
  isEphemeral = false,
  token,
  onUploadSuccess,
  className,
}: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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
    setError(null);
    setSuccess(false);
    setUploadProgress(0);

    // Simulated progress for UI UX
    const interval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 10, 90));
    }, 100);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (isEphemeral) {
        formData.append("ephemeral", "true");
      }

      const headers: HeadersInit = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      // Forward to backend ingestion route
      const response = await fetch("/api/datasets/upload", {
        method: "POST",
        headers,
        body: formData,
      });

      clearInterval(interval);
      setUploadProgress(100);

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.detail || "Upload failed");
      }

      const data = await response.json();
      setSuccess(true);
      
      if (onUploadSuccess) {
        onUploadSuccess(data);
      }
    } catch (err: any) {
      clearInterval(interval);
      setError(err.message || "An error occurred during the data upload.");
    } finally {
      setIsUploading(false);
      // Reset the success state after a few seconds
      setTimeout(() => {
        if (success) setSuccess(false);
        setUploadProgress(0);
      }, 4000);
    }
  };

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        const file = e.dataTransfer.files[0];
        uploadFile(file);
      }
    },
    [isEphemeral, token, onUploadSuccess]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        const file = e.target.files[0];
        uploadFile(file);
      }
    },
    [isEphemeral, token, onUploadSuccess]
  );

  return (
    <div
      className={cn(
        "relative flex flex-col items-center justify-center w-full p-10 border-2 border-dashed rounded-xl transition-all duration-200",
        isDragging
          ? "border-primary bg-primary/5 scale-[1.01]"
          : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50",
        isUploading && "opacity-75 pointer-events-none",
        className
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <input
        type="file"
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        onChange={handleFileInput}
        disabled={isUploading}
        accept=".csv,.json,.parquet"
      />

      <div className="flex flex-col items-center text-center space-y-4">
        <div className="p-4 bg-background rounded-full shadow-sm border transition-transform">
          {success ? (
            <CheckCircle className="w-8 h-8 text-green-500 animate-in zoom-in" />
          ) : error ? (
            <AlertCircle className="w-8 h-8 text-destructive animate-in zoom-in" />
          ) : isUploading ? (
            <FileType className="w-8 h-8 text-primary animate-pulse" />
          ) : (
            <UploadCloud className="w-8 h-8 text-muted-foreground" />
          )}
        </div>

        <div className="space-y-1">
          <p className="text-sm font-medium">
            {isUploading ? (
              "Ingesting Data..."
            ) : success ? (
              "Ingestion Complete!"
            ) : error ? (
              <span className="text-destructive">{error}</span>
            ) : (
              <>
                <span className="text-primary font-semibold">Click to upload</span> or drag and
                drop your dataset
              </>
            )}
          </p>
          {!isUploading && !success && !error && (
            <p className="text-xs text-muted-foreground">
              Supports CSV, JSON, or Parquet (Columnar highly recommended for speed)
            </p>
          )}
        </div>

        {isUploading && (
          <div className="w-full max-w-xs h-2 bg-secondary rounded-full overflow-hidden mt-4">
            <div
              className="h-full bg-primary transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
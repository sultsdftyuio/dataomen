"use client";

import React, { useState, useCallback, useRef } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// 1. Strict Type Definitions
interface FileUploadZoneProps {
  onUploadSuccess: (datasetId: string) => void;
}

export default function FileUploadZone({ onUploadSuccess }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // 2. Interaction & Computation Handler
  const handleUpload = async (file: File) => {
    if (!file) return;

    // Validate analytical file formats
    const validTypes = [".csv", ".parquet"];
    if (!validTypes.some((ext) => file.name.toLowerCase().endsWith(ext))) {
      toast({
        variant: "destructive",
        title: "Invalid file format",
        description: "For analytical efficiency, please upload a CSV or Parquet file.",
      });
      return;
    }

    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      // Supabase Auth Integration: Grab the current session token to pass to the backend.
      // (Adjust 'sb-access-token' to match whatever local storage key Supabase uses in your setup, 
      // or if using a fetch wrapper/interceptor, you can remove the headers config).
      const token = localStorage.getItem("sb-access-token") || localStorage.getItem("auth_token");
      
      const response = await fetch("/api/datasets/upload", {
        method: "POST",
        headers: {
          ...(token && { Authorization: `Bearer ${token}` })
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Upload failed");
      }

      const data = await response.json();
      
      toast({
        title: "Upload Successful",
        description: `${file.name} is ready for analysis.`,
      });

      // The Orchestration Layer: Alert the DashboardOrchestrator to swap states
      onUploadSuccess(data.dataset_id);
      
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Upload Error",
        description: error.message,
      });
    } finally {
      setIsUploading(false);
    }
  };

  // 3. Drag and Drop Interaction Event Handlers
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleUpload(e.dataTransfer.files[0]);
    }
  }, []);

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onClick={() => fileInputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-12 text-center transition-all duration-200 ${
        isUploading ? "cursor-not-allowed opacity-80" : "cursor-pointer"
      } ${
        isDragging
          ? "border-blue-500 bg-blue-50"
          : "border-gray-300 hover:border-gray-400 hover:bg-gray-50"
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".csv,.parquet"
        onChange={(e) => {
          if (e.target.files) handleUpload(e.target.files[0]);
        }}
        disabled={isUploading}
      />
      
      <div className="flex flex-col items-center justify-center space-y-4">
        {isUploading ? (
          <>
            <Loader2 className="h-10 w-10 text-blue-500 animate-spin" />
            <div className="space-y-1">
              <p className="text-lg font-medium text-gray-900">Uploading securely...</p>
              <p className="text-sm text-gray-500">Preparing zero-copy processing via DuckDB</p>
            </div>
          </>
        ) : (
          <>
            <div className="p-4 bg-blue-100 rounded-full">
              <UploadCloud className="h-8 w-8 text-blue-600" />
            </div>
            <div className="space-y-1">
              <p className="text-lg font-medium text-gray-900">
                Click or drag file to this area to upload
              </p>
              <p className="text-sm text-gray-500">Supports CSV and Parquet datasets</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
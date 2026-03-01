"use client";

import React, { useState, useCallback } from "react";
import { UploadCloud, Loader2, FileCheck2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Strict Interface for Component Props
interface FileUploadZoneProps {
  tenantId: string;
  onUploadComplete: (fileKey: string, fileName: string) => void;
}

export default function FileUploadZone({ tenantId, onUploadComplete }: FileUploadZoneProps) {
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "success" | "error">("idle");
  const { toast } = useToast();

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    setUploadStatus("uploading");

    try {
      const backendUrl = process.env.NEXT_PUBLIC_API_URL || "https://dataomen.onrender.com";
      
      // Step 1: Security by Design - Request a Pre-Signed URL
      // Fix: Removed 'Content-Type' header to prevent browser from sending an OPTIONS preflight
      const presignedRes = await fetch(
        `${backendUrl}/api/datasets/upload-url?filename=${encodeURIComponent(file.name)}&tenant_id=${encodeURIComponent(tenantId)}`,
        { method: "GET" }
      );

      if (!presignedRes.ok) {
        const errorData = await presignedRes.json().catch(() => ({}));
        throw new Error(errorData.detail || `API Error: HTTP ${presignedRes.status}`);
      }

      const { upload_url, file_key } = await presignedRes.json();

      // Step 2: Hybrid Performance Paradigm - Direct Client-to-Cloud Push
      const uploadRes = await fetch(upload_url, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
      });

      if (!uploadRes.ok) {
        throw new Error("Direct cloud storage upload failed. Verify bucket CORS policy allows PUT from this origin.");
      }

      setUploadStatus("success");
      toast({
        title: "Ingestion Successful",
        description: `${file.name} securely streamed to cloud.`,
      });

      // Step 3: Trigger analytical pipeline downstream
      onUploadComplete(file_key, file.name);

    } catch (error: any) {
      console.error("Upload workflow failed:", error);
      setUploadStatus("error");
      toast({
        title: "Upload Pipeline Error",
        description: error.message || "Failed to stream dataset.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
      setTimeout(() => {
        setUploadStatus("idle");
      }, 3000);
    }
  }, [tenantId, onUploadComplete, toast]);

  return (
    <div className="w-full">
      <label 
        className={`relative flex flex-col items-center justify-center w-full p-12 transition-all border-2 border-dashed rounded-xl cursor-pointer
          ${isUploading ? 'border-blue-400 bg-blue-50/50' : 'border-gray-300 bg-gray-50 hover:bg-gray-100 hover:border-gray-400'}
          ${uploadStatus === 'error' ? 'border-red-400 bg-red-50' : ''}
          ${uploadStatus === 'success' ? 'border-green-400 bg-green-50' : ''}
        `}
      >
        <input 
          type="file" 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          onChange={handleUpload}
          disabled={isUploading}
          accept=".csv,.xlsx,.json,.parquet"
        />
        
        {uploadStatus === "idle" && (
          <div className="flex flex-col items-center space-y-3">
            <div className="p-3 bg-white rounded-full shadow-sm">
              <UploadCloud className="w-8 h-8 text-gray-500" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-700">Click or drag dataset here</p>
              <p className="mt-1 text-xs text-gray-500">
                Analytical engines optimized for <span className="font-medium text-gray-700">Parquet</span>, CSV, and Excel.
              </p>
            </div>
          </div>
        )}

        {uploadStatus === "uploading" && (
          <div className="flex flex-col items-center space-y-3">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <span className="text-sm font-medium text-blue-700 animate-pulse">Streaming direct-to-cloud...</span>
          </div>
        )}

        {uploadStatus === "success" && (
          <div className="flex flex-col items-center space-y-3">
            <div className="p-3 bg-white rounded-full shadow-sm">
              <FileCheck2 className="w-8 h-8 text-green-500" />
            </div>
            <span className="text-sm font-medium text-green-700">Dataset Secured</span>
          </div>
        )}

        {uploadStatus === "error" && (
          <div className="flex flex-col items-center space-y-3">
            <div className="p-3 bg-white rounded-full shadow-sm">
              <AlertCircle className="w-8 h-8 text-red-500" />
            </div>
            <span className="text-sm font-medium text-red-700">Pipeline Handshake Failed</span>
          </div>
        )}
      </label>
    </div>
  );
}
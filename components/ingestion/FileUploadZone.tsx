"use client";

import React, { useState, useCallback, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { UploadCloud, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type UploadState = "idle" | "uploading" | "success" | "error";

interface FileUploadZoneProps {
  onUploadSuccess?: (datasetId: string) => void;
}

export default function FileUploadZone({ onUploadSuccess }: FileUploadZoneProps) {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  
  // 1. Modular Strategy: Utilize the SSR package's browser client for Next.js App Router
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setUploadState("idle");
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
      setUploadState("idle");
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setUploadState("uploading");

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
    console.log("Targeting API:", API_URL);

    try {
      // 2. Security by Design: Retrieve JWT for Tenant Isolation
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      
      if (authError || !session) {
        throw new Error("Authentication session missing. Please log in.");
      }

      // 3. Prepare Payload natively (letting the browser handle multi-part boundaries)
      const formData = new FormData();
      formData.append("file", file);

      // 4. Orchestration: Environment-agnostic endpoint
      const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
      
      const response = await fetch(`${API_URL}/api/v1/datasets/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`
          // WARNING: Do NOT manually set 'Content-Type': 'multipart/form-data'. 
          // The browser automatically sets it with the proper boundary string.
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || `Upload failed with status: ${response.status}`);
      }

      const data = await response.json();
      setUploadState("success");
      
      toast({
        title: "Upload Successful",
        description: `${file.name} has been securely ingested.`,
        variant: "default"
      });

      if (onUploadSuccess && data.dataset_id) {
        onUploadSuccess(data.dataset_id);
      }
      
    } catch (error: any) {
      console.error("Upload error:", error);
      setUploadState("error");
      
      toast({
        title: "Upload Failed",
        description: error.message || "A network error occurred. Ensure the backend is running.",
        variant: "destructive"
      });
    }
  }, [file, supabase, onUploadSuccess, toast]);

  return (
    <div 
      className="w-full max-w-md p-8 border-2 border-dashed border-gray-300 rounded-xl bg-white text-center flex flex-col items-center transition-all hover:border-blue-400"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".csv,.parquet,.json"
      />
      
      {file ? (
        <div className="flex flex-col items-center space-y-4 w-full">
          <FileText className="w-12 h-12 text-blue-500" />
          <div className="w-full truncate px-4">
            <p className="font-medium text-gray-700 truncate">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
        </div>
      ) : (
        <div 
          className="flex flex-col items-center space-y-4 cursor-pointer w-full group"
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloud className="w-12 h-12 text-gray-400 group-hover:text-blue-500 transition-colors" />
          <p className="font-medium text-gray-600">Click to browse or drag and drop</p>
          <p className="text-sm text-gray-400">CSV, Parquet, or JSON (max 50MB)</p>
        </div>
      )}

      {uploadState === "error" && (
        <div className="mt-4 flex items-center text-red-500 text-sm font-medium">
          <AlertCircle className="w-4 h-4 mr-2" />
          Connection Refused / Unauthorized
        </div>
      )}

      {uploadState === "success" && (
        <div className="mt-4 flex items-center text-green-500 text-sm font-medium">
          <CheckCircle className="w-4 h-4 mr-2" />
          Dataset ready for analysis
        </div>
      )}

      <button
        onClick={handleUpload}
        disabled={!file || uploadState === "uploading"}
        className="mt-6 w-full py-2.5 px-4 bg-slate-900 text-white rounded-lg font-medium hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
      >
        {uploadState === "uploading" ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            Ingesting Data...
          </>
        ) : (
          "Upload Dataset"
        )}
      </button>
    </div>
  );
}
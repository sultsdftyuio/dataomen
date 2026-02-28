"use client";

import React, { useState, useCallback, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { UploadCloud, CheckCircle, AlertCircle, Loader2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type UploadState = "idle" | "uploading" | "success" | "error";

export default function FileUploadZone() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
      setFile(e.dataTransfer.files[0]);
      setUploadState("idle");
    }
  }, []);

  const handleUpload = useCallback(async () => {
    if (!file) return;

    setUploadState("uploading");
    
    try {
      const { data: { session }, error: authError } = await supabase.auth.getSession();
      
      if (authError || !session) {
        throw new Error("Authentication required. Please log in.");
      }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);

      // --- DYNAMIC ENVIRONMENT ROUTING ---
      // Automatically uses your Render URL in production (if set in Vercel Env Vars)
      // Falls back to localhost:10000 for local development.
      const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:10000";
      
      const response = await fetch(`${API_BASE_URL}/api/v1/datasets/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `Upload failed with status: ${response.status}`);
      }

      setUploadState("success");
      toast({
        title: "Ingestion Complete",
        description: `${file.name} has been securely processed.`,
      });
      
    } catch (error) {
      console.error("Upload error:", error);
      setUploadState("error");
      const msg = error instanceof Error ? error.message : "Failed to connect to ingestion engine.";
      setErrorMessage(msg);
      toast({
        variant: "destructive",
        title: "Ingestion Failed",
        description: msg,
      });
    }
  }, [file, supabase.auth, toast]);

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div 
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center p-10 border-2 border-dashed rounded-xl transition-colors duration-200 ${
          isDragging 
            ? "border-blue-500 bg-blue-50" 
            : "border-gray-300 bg-gray-50 hover:bg-gray-100"
        }`}
      >
        <div className="flex items-center justify-center w-16 h-16 bg-white shadow-sm border border-gray-100 text-blue-600 rounded-full mb-6">
          {uploadState === "uploading" ? (
            <Loader2 className="w-8 h-8 animate-spin" />
          ) : uploadState === "success" ? (
            <CheckCircle className="w-8 h-8 text-green-500" />
          ) : uploadState === "error" ? (
            <AlertCircle className="w-8 h-8 text-red-500" />
          ) : file ? (
            <FileText className="w-8 h-8" />
          ) : (
            <UploadCloud className="w-8 h-8 text-gray-400" />
          )}
        </div>

        <h3 className="text-xl font-semibold mb-2 text-gray-900">
          {file ? file.name : "Upload analytical dataset"}
        </h3>
        
        <p className="text-sm text-gray-500 mb-8 text-center max-w-sm">
          {!file && "Drag and drop your Parquet, CSV, or JSON files here for high-performance processing."}
          {file && `Ready to ingest ${(file.size / 1024 / 1024).toFixed(2)} MB into the analytical engine.`}
          {uploadState === "error" && <span className="block mt-2 font-medium text-red-600">{errorMessage}</span>}
        </p>

        <input
          type="file"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept=".csv,.parquet,.json"
        />

        <div className="flex gap-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadState === "uploading"}
            className="px-6 py-2.5 font-medium border border-gray-300 text-gray-700 bg-white rounded-lg shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-200 disabled:opacity-50 transition-all"
          >
            {file ? "Change Dataset" : "Browse Local Files"}
          </button>

          {file && (
            <button
              onClick={handleUpload}
              disabled={uploadState === "uploading" || uploadState === "success"}
              className="px-6 py-2.5 font-medium border border-transparent text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-all flex items-center"
            >
              {uploadState === "uploading" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Vectorizing Data...
                </>
              ) : uploadState === "success" ? (
                "Dataset Ingested"
              ) : (
                "Initialize Engine"
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
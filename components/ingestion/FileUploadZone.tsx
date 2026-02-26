"use client";

import React, { useState, useCallback, useRef } from "react";
import { UploadCloud, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type UploadState = "idle" | "uploading" | "success" | "error";

interface FileUploadZoneProps {
  onUploadSuccess?: (datasetId: string) => void;
}

export function FileUploadZone({ onUploadSuccess }: FileUploadZoneProps) {
  const [dragActive, setDragActive] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (file: File) => {
    // Phase 1 MVP strict requirement: CSV only
    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a valid CSV file.",
        variant: "destructive",
      });
      return;
    }
    
    // Optional: Max 50MB restriction (can adjust based on your FastAPI limits)
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload a file smaller than 50MB.",
        variant: "destructive",
      });
      return;
    }

    setSelectedFile(file);
    setUploadState("idle");
  };

  const uploadFile = async () => {
    if (!selectedFile) return;

    setUploadState("uploading");

    const formData = new FormData();
    formData.append("file", selectedFile);
    // You can hardcode a tenant_id or fetch it from the user session here
    formData.append("tenant_id", "default_tenant"); 

    // The crucial Vercel fix:
    const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

    try {
      const response = await fetch(`${API_URL}/api/datasets/upload`, {
        method: "POST",
        // Do NOT set 'Content-Type' manually when sending FormData
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Upload failed");
      }

      const data = await response.json();
      
      setUploadState("success");
      toast({
        title: "Upload Complete!",
        description: `${selectedFile.name} was successfully converted to Parquet.`,
      });

      if (onUploadSuccess && data.dataset_id) {
        onUploadSuccess(data.dataset_id);
      }

      // Reset after 3 seconds
      setTimeout(() => {
        setUploadState("idle");
        setSelectedFile(null);
      }, 3000);

    } catch (error: any) {
      console.error("Upload error:", error);
      setUploadState("error");
      toast({
        title: "Upload Failed",
        description: error.message || "Could not connect to the processing engine.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <div
        className={`relative flex flex-col items-center justify-center p-12 text-center border-2 border-dashed rounded-xl transition-all duration-200 ease-in-out ${
          dragActive ? "border-primary bg-primary/5" : "border-border bg-card"
        } ${uploadState === "uploading" ? "opacity-50 pointer-events-none" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={handleChange}
          className="hidden"
        />

        {uploadState === "idle" && !selectedFile && (
          <>
            <div className="p-4 rounded-full bg-primary/10 mb-4 text-primary">
              <UploadCloud size={32} />
            </div>
            <h3 className="text-xl font-semibold mb-2">Upload your dataset</h3>
            <p className="text-muted-foreground mb-6">
              Drag and drop your CSV file here, or click to browse
            </p>
            <button
              onClick={() => inputRef.current?.click()}
              className="px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors"
            >
              Select CSV File
            </button>
          </>
        )}

        {selectedFile && uploadState === "idle" && (
          <>
            <div className="p-4 rounded-full bg-primary/10 mb-4 text-primary">
              <FileText size={32} />
            </div>
            <h3 className="text-xl font-semibold mb-2">{selectedFile.name}</h3>
            <p className="text-sm text-muted-foreground mb-6">
              {(selectedFile.size / (1024 * 1024)).toFixed(2)} MB
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => setSelectedFile(null)}
                className="px-6 py-2.5 bg-secondary text-secondary-foreground font-medium rounded-md hover:bg-secondary/80 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={uploadFile}
                className="px-6 py-2.5 bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors"
              >
                Process & Compress
              </button>
            </div>
          </>
        )}

        {uploadState === "uploading" && (
          <div className="flex flex-col items-center text-primary">
            <Loader2 size={48} className="animate-spin mb-4" />
            <h3 className="text-xl font-semibold">Sanitizing Data...</h3>
            <p className="text-sm text-muted-foreground mt-2">Converting to Parquet format</p>
          </div>
        )}

        {uploadState === "success" && (
          <div className="flex flex-col items-center text-green-600 dark:text-green-400">
            <CheckCircle size={48} className="mb-4" />
            <h3 className="text-xl font-semibold">Processing Complete</h3>
            <p className="text-sm text-muted-foreground mt-2">Ready for analysis via DuckDB</p>
          </div>
        )}

        {uploadState === "error" && (
          <div className="flex flex-col items-center text-red-600 dark:text-red-400">
            <AlertCircle size={48} className="mb-4" />
            <h3 className="text-xl font-semibold">Processing Failed</h3>
            <p className="text-sm text-muted-foreground mt-2 mb-6">
              There was an issue with your CSV schema.
            </p>
            <button
              onClick={() => setUploadState("idle")}
              className="px-6 py-2.5 bg-secondary text-secondary-foreground font-medium rounded-md hover:bg-secondary/80 transition-colors"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
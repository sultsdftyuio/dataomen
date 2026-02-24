"use client";

import React, { useState, useCallback } from "react";
import { UploadCloud, FileType, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast"; //

// Aligned with the DatasetStatus enum in models.py
type UploadState = "idle" | "uploading" | "success" | "error";

export default function FileUploadZone() {
  const { toast } = useToast();
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const validateAndSetFile = (file: File) => {
    setErrorMessage(null);
    
    // Phase 1 Security: Strict CSV validation
    if (file.type !== "text/csv" && !file.name.endsWith(".csv")) {
      setUploadState("error");
      setErrorMessage("Strictly CSV files are allowed for Phase 1.");
      return;
    }

    // Tier-based limit to prevent server memory exhaustion
    if (file.size > 50 * 1024 * 1024) {
      setUploadState("error");
      setErrorMessage("File exceeds the 50MB limit.");
      return;
    }

    setSelectedFile(file);
    setUploadState("idle");
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;

    setUploadState("uploading");
    setErrorMessage(null);

    // Prepare multipart/form-data as expected by api/routes/datasets.py
    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("dataset_name", selectedFile.name.replace(".csv", ""));

    try {
      const response = await fetch("http://localhost:8000/api/v1/datasets/upload", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "The ingestion pipeline failed to initialize.");
      }

      setUploadState("success");
      
      toast({
        title: "Upload Successful",
        description: `Dataset ${data.dataset_id} is now being processed in the background.`,
      });

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Connection to DataOmen engine lost.";
      setUploadState("error");
      setErrorMessage(message);
      
      toast({
        variant: "destructive",
        title: "Ingestion Error",
        description: message,
      });
    }
  };

  return (
    <div className="max-w-xl mx-auto mt-10 p-6 bg-white border border-gray-200 rounded-xl shadow-sm dark:bg-gray-950 dark:border-gray-800">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">Initialize Data Pipeline</h2>
        <p className="text-sm text-gray-500">Upload your raw CSV. Our engine will sanitize and compress it into Parquet.</p>
      </div>

      <div
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg cursor-pointer transition-colors 
          ${uploadState === "error" ? "border-red-400 bg-red-50/50 dark:bg-red-900/10" : "border-gray-300 hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-900/50"}
          ${uploadState === "success" ? "border-green-400 bg-green-50/50 dark:bg-green-900/10" : ""}
        `}
      >
        <input 
          type="file" 
          accept=".csv" 
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" 
          onChange={handleFileChange}
          disabled={uploadState === "uploading" || uploadState === "success"}
        />

        <div className="flex flex-col items-center justify-center pt-5 pb-6 pointer-events-none text-center px-4">
          {uploadState === "idle" && !selectedFile && (
            <>
              <UploadCloud className="w-10 h-10 mb-3 text-gray-400" />
              <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                <span className="font-semibold">Click to upload</span> or drag and drop
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">CSV (MAX. 50MB)</p>
            </>
          )}

          {uploadState === "idle" && selectedFile && (
            <>
              <FileType className="w-10 h-10 mb-3 text-blue-500" />
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedFile.name}</p>
              <p className="text-xs text-gray-500">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
            </>
          )}

          {uploadState === "uploading" && (
            <>
              <Loader2 className="w-10 h-10 mb-3 text-blue-500 animate-spin" />
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Transmitting to DataOmen Engine...</p>
            </>
          )}

          {uploadState === "success" && (
            <>
              <CheckCircle className="w-10 h-10 mb-3 text-green-500" />
              <p className="text-sm font-medium text-green-700 dark:text-green-400">Upload Complete</p>
              <p className="text-xs text-gray-500 mt-1">Check your dashboard for processing status.</p>
            </>
          )}

          {uploadState === "error" && (
            <>
              <AlertCircle className="w-10 h-10 mb-3 text-red-500" />
              <p className="text-sm font-medium text-red-600 dark:text-red-400">{errorMessage}</p>
            </>
          )}
        </div>
      </div>

      {selectedFile && uploadState === "idle" && (
        <div className="mt-4 flex justify-end">
          <button
            onClick={handleUpload}
            className="w-full sm:w-auto px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
          >
            Process Dataset
          </button>
        </div>
      )}
    </div>
  );
}
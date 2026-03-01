"use client";

import React, { useState, useCallback, useRef } from "react";
import { UploadCloud, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// 1. Strict Type Definitions
interface FileUploadZoneProps {
  onUploadSuccess: (datasetId: string) => void;
}

export default function FileUploadZone({ onUploadSuccess }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  
  // Ref to programmatically trigger the hidden native file input
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // 2. Drag Event Handlers (Must prevent default to stop browser from opening files)
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

  // 3. File Processing & Upload Logic
  const processFile = async (file: File) => {
    // Validate file type (CSV or Parquet)
    const validTypes = [
      "text/csv", 
      "application/vnd.apache.parquet",
      "application/octet-stream" // Fallback for some OS Parquet bindings
    ];
    const validExtensions = [".csv", ".parquet"];
    
    const isValidType = validTypes.includes(file.type) || 
                        validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

    if (!isValidType) {
      toast({
        title: "Invalid file type",
        description: "Only CSV and Parquet datasets are supported.",
        variant: "destructive"
      });
      return;
    }

    setIsUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      // Sending to your FastAPI/Next.js ingestion route
      const response = await fetch("/api/datasets/upload", {
        method: "POST",
        body: formData,
        // Include authorization headers here if necessary for multi-tenant isolation
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.detail || "Upload failed on the server.");
      }

      const data = await response.json();
      
      toast({
        title: "Upload Successful",
        description: `${file.name} has been securely uploaded and is ready for analysis.`,
      });

      // Trigger the parent callback to refresh data/navigate
      if (data.dataset_id) {
        onUploadSuccess(data.dataset_id);
      }
    } catch (error: any) {
      console.error("Upload error:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "An unexpected error occurred during upload.",
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
      // Reset input to allow consecutive uploads of the same file if needed
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0]);
    }
  };

  const handleZoneClick = () => {
    // Simulate a click on the hidden file input
    fileInputRef.current?.click();
  };

  return (
    <div
      onClick={handleZoneClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        relative flex flex-col items-center justify-center w-full h-64 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-all duration-200 ease-in-out
        ${isDragging ? "border-blue-500 bg-blue-50/50 dark:bg-blue-900/20" : "border-slate-300 dark:border-slate-700 hover:border-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50"}
        ${isUploading ? "opacity-50 pointer-events-none" : ""}
      `}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        accept=".csv,.parquet,text/csv,application/vnd.apache.parquet"
      />
      
      {isUploading ? (
        <div className="flex flex-col items-center justify-center space-y-4">
          <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            Ingesting dataset into the analytical engine...
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="p-4 rounded-full bg-slate-100 dark:bg-slate-800">
            <UploadCloud className="w-10 h-10 text-slate-500 dark:text-slate-400" />
          </div>
          <div className="space-y-1">
            <p className="text-base font-semibold text-slate-700 dark:text-slate-200">
              Click or drag file to this area to upload
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Supports CSV and Parquet datasets
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
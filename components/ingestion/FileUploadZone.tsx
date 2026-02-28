"use client";

import React, { useState, useCallback, useRef, useEffect } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { UploadCloud, FileText, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type UploadState = "idle" | "uploading" | "success" | "error";

export default function FileUploadZone() {
  const [dragActive, setDragActive] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  // ==========================================
  // DEBUGGING: Check environment on mount
  // ==========================================
  useEffect(() => {
    console.log("🚀 [DEBUG] FileUploadZone Mounted");
    console.log("🌍 [DEBUG] Window Origin:", typeof window !== "undefined" ? window.location.origin : "SSR");
  }, []);

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
      handleFileSelection(e.dataTransfer.files[0]);
    }
  }, []);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      handleFileSelection(e.target.files[0]);
    }
  }, []);

  const handleFileSelection = (selectedFile: File) => {
    console.log("📂 [DEBUG] File Selected:", selectedFile.name, "Size:", selectedFile.size);
    const validTypes = [
      "text/csv",
      "application/vnd.ms-excel",
      "application/octet-stream", // Fallback for parquet
    ];
    const isParquet = selectedFile.name.toLowerCase().endsWith(".parquet");
    const isCsv = selectedFile.name.toLowerCase().endsWith(".csv");

    if (!validTypes.includes(selectedFile.type) && !isParquet && !isCsv) {
      console.warn("⚠️ [DEBUG] Invalid file type:", selectedFile.type);
      toast({
        variant: "destructive",
        title: "Invalid file type",
        description: "Please upload a CSV or Parquet file.",
      });
      return;
    }

    setFile(selectedFile);
    setUploadState("idle");
  };

  const onButtonClick = () => {
    inputRef.current?.click();
  };

  const uploadFile = async () => {
    if (!file) return;

    console.log("=========================================");
    console.log("📤 [DEBUG] STARTING UPLOAD PROCESS");

    setUploadState("uploading");

    try {
      // 1. Session Check
      console.log("🔐 [DEBUG] Fetching session...");
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error("❌ [DEBUG] Auth Error");
        throw new Error("Authentication required. Please log in.");
      }

      // 2. Prepare FormData
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name.replace(/\.[^/.]+$/, "")); 
      console.log("📦 [DEBUG] FormData prepared.");

      // 3. Target URL - USING RELATIVE PATH FOR PROXY
      // This is the magic! This forces the browser to send it to Vercel, not localhost!
      const targetUrl = "/api/v1/datasets/upload";
      
      console.log("🌐 [DEBUG] Firing fetch request to:", targetUrl);

      // 4. Execute Fetch
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      console.log("📡 [DEBUG] Response Status:", response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error("❌ [DEBUG] Server responded with:", errorText);
        throw new Error(`Upload failed (${response.status})`);
      }

      const result = await response.json();
      console.log("✅ [DEBUG] Upload successful:", result);

      setUploadState("success");
      toast({
        title: "Upload Successful",
        description: `Dataset "${result.name}" has been ingested.`,
      });

      setTimeout(() => {
        setFile(null);
        setUploadState("idle");
        if (inputRef.current) inputRef.current.value = "";
      }, 3000);
      
    } catch (error: any) {
      console.error("🚨 [DEBUG] ERROR:", error.message);

      setUploadState("error");
      toast({
        variant: "destructive",
        title: "Upload Failed",
        description: error.message || "An unexpected error occurred. Check console.",
      });
    } finally {
      console.log("🏁 [DEBUG] PROCESS FINISHED");
      console.log("=========================================");
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto mt-8">
      <form
        className={`relative flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-lg transition-colors duration-200 ease-in-out ${
          dragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 bg-background hover:bg-muted/50"
        } ${uploadState === "success" ? "border-green-500 bg-green-50 dark:bg-green-950/20" : ""}`}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onSubmit={(e) => e.preventDefault()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".csv,.parquet"
          onChange={handleChange}
          disabled={uploadState === "uploading"}
        />

        <div className="flex flex-col items-center justify-center p-6 text-center">
          {uploadState === "success" ? (
            <>
              <CheckCircle className="w-12 h-12 mb-4 text-green-500" />
              <p className="mb-2 text-lg font-semibold text-green-700 dark:text-green-400">
                Upload Complete
              </p>
              <p className="text-sm text-green-600/80 dark:text-green-500/80">
                {file?.name}
              </p>
            </>
          ) : uploadState === "uploading" ? (
            <>
              <Loader2 className="w-12 h-12 mb-4 text-primary animate-spin" />
              <p className="mb-2 text-lg font-semibold text-foreground">
                Ingesting Dataset...
              </p>
              <p className="text-sm text-muted-foreground">
                Processing {file?.name}
              </p>
            </>
          ) : (
            <>
              {file ? (
                <FileText className="w-12 h-12 mb-4 text-primary" />
              ) : (
                <UploadCloud className="w-12 h-12 mb-4 text-muted-foreground" />
              )}
              <p className="mb-2 text-lg font-semibold text-foreground">
                {file ? file.name : "Drag and drop your file here"}
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                {file
                  ? `${(file.size / (1024 * 1024)).toFixed(2)} MB`
                  : "Supports CSV or Parquet"}
              </p>
              
              {!file && (
                <button
                  type="button"
                  onClick={onButtonClick}
                  className="px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
                >
                  Select a file
                </button>
              )}
            </>
          )}
        </div>
      </form>

      {file && uploadState !== "success" && (
        <div className="flex justify-end mt-4 space-x-3">
          <button
            type="button"
            onClick={() => {
              setFile(null);
              setUploadState("idle");
              if (inputRef.current) inputRef.current.value = "";
            }}
            disabled={uploadState === "uploading"}
            className="px-4 py-2 text-sm font-medium text-foreground bg-secondary rounded-md hover:bg-secondary/80 focus:outline-none disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={uploadFile}
            disabled={uploadState === "uploading"}
            className="flex items-center px-4 py-2 text-sm font-medium text-primary-foreground bg-primary rounded-md hover:bg-primary/90 focus:outline-none disabled:opacity-50"
          >
            {uploadState === "uploading" ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Uploading
              </>
            ) : (
              "Upload Dataset"
            )}
          </button>
        </div>
      )}
      
      {uploadState === "error" && (
        <div className="flex items-center mt-4 p-3 text-sm text-red-800 bg-red-100 rounded-md dark:bg-red-900/30 dark:text-red-300">
          <AlertCircle className="w-4 h-4 mr-2 flex-shrink-0" />
          There was a problem uploading your dataset. Check developer tools.
        </div>
      )}
    </div>
  );
}
"use client";

import React, { useState, useCallback, useRef } from "react";
import { createBrowserClient } from "@supabase/ssr";
import { UploadCloud, CheckCircle, AlertCircle, Loader2, FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type UploadState = "idle" | "uploading" | "success" | "error";

export function FileUploadZone() {
  const [file, setFile] = useState<File | null>(null);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      console.log("[DEBUG] File selected:", selectedFile.name, "| Size:", selectedFile.size, "bytes | Type:", selectedFile.type);
      
      // Basic client-side validation
      if (!selectedFile.name.endsWith('.csv') && !selectedFile.name.endsWith('.json')) {
         console.warn("[DEBUG] Invalid file type selected.");
         toast({ title: "Invalid File", description: "Only CSV or JSON files are currently supported.", variant: "destructive" });
         return;
      }
      setFile(selectedFile);
      setUploadState("idle");
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setUploadState("uploading");
    setProgress(10); 

    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError || !session) {
        throw new Error("You must be logged in to upload data.");
      }
      setProgress(30);

      const formData = new FormData();
      formData.append("file", file);
      
      // 🚀 THE BRUTE-FORCE OVERRIDE:
      // Bypass the environment variables entirely so Vercel caching cannot break this.
      const targetEndpoint = "https://dataomen.onrender.com/api/v1/datasets/upload";
      
      console.log("🔥 FORCE-ROUTING TRAFFIC TO:", targetEndpoint);

      setProgress(50);
      const response = await fetch(targetEndpoint, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${session.access_token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`shServer Error ${response.status}: ${errorText}`);
      }

      setProgress(100);
      setUploadState("success");
      toast({ title: "Upload Complete", description: "Your dataset has been securely stored." });

    } catch (error: any) {
      console.error(error);
      setUploadState("error");
      toast({ title: "Upload Failed", description: error.message, variant: "destructive" });
    }
  };
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:10000";
console.log("🔥 THE FRONTEND IS POINTING TO:", apiUrl);

  // ... (Rest of the UI component remains exactly the same)
  return (
    <div className="w-full max-w-xl mx-auto p-6 bg-card rounded-xl border border-border shadow-sm">
      <div 
        className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors
          ${file ? 'border-primary/50 bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
        `}
      >
        <input 
          type="file" 
          ref={fileInputRef}
          onChange={handleFileChange} 
          accept=".csv,.json"
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
          disabled={uploadState === "uploading"}
        />
        
        <div className="flex flex-col items-center justify-center space-y-4 pointer-events-none">
          {file ? (
             <div className="flex items-center space-x-3 text-primary">
                <FileText className="w-8 h-8" />
                <div className="text-left">
                  <p className="text-sm font-semibold">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </div>
             </div>
          ) : (
            <>
              <div className="p-4 bg-muted rounded-full">
                <UploadCloud className="w-8 h-8 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">Click or drag file to this area to upload</p>
                <p className="text-xs text-muted-foreground mt-1">Support for a single CSV or JSON upload.</p>
              </div>
            </>
          )}
        </div>
      </div>

      {file && (
        <div className="mt-6 flex flex-col space-y-4">
          <button
            onClick={handleUpload}
            disabled={uploadState === "uploading" || uploadState === "success"}
            className="w-full inline-flex justify-center items-center py-2.5 px-4 rounded-md bg-primary text-primary-foreground font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {uploadState === "uploading" && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {uploadState === "idle" || uploadState === "error" ? "Upload Dataset" : ""}
            {uploadState === "uploading" ? "Processing..." : ""}
            {uploadState === "success" ? "Ready for Analysis" : ""}
          </button>

          {uploadState === "uploading" && (
            <div className="w-full bg-secondary rounded-full h-1.5">
              <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
            </div>
          )}

          {uploadState === "error" && (
            <div className="flex items-center text-sm text-destructive bg-destructive/10 p-3 rounded-md">
               <AlertCircle className="w-4 h-4 mr-2" />
               Check the console logs for detailed debug information.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
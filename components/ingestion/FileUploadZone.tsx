"use client";

import React, { useCallback, useState } from "react";
import { UploadCloud, File as FileIcon, AlertCircle, CheckCircle2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/utils/supabase/client"; // 🚀 Added: Secure local session resolution

// 1. Export the Success Data interface so the Orchestrator can use it
export interface UploadSuccessData {
  datasetId?: string;
  fileName: string;
  rowCount?: number;
  columns?: any[];
  message?: string;
  isDocument?: boolean;
}

// 2. Explicitly define the props the component accepts
export interface FileUploadZoneProps {
  isEphemeral?: boolean;
  token?: string; // Kept for backwards compatibility, but no longer strictly required
  onUploadSuccess?: (data: UploadSuccessData) => void;
}

interface FileUploadState {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  id: string;
  isDocument: boolean;
}

// 3. Named export matching the strict import in DashboardOrchestrator
export const FileUploadZone: React.FC<FileUploadZoneProps> = ({ 
  isEphemeral = false, 
  token, 
  onUploadSuccess 
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileUploadState[]>([]);
  const { toast } = useToast();

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFiles = useCallback((newFiles: File[]) => {
    const validFiles = newFiles.filter(file => {
      const fileName = file.name.toLowerCase();
      
      const isStructured = fileName.endsWith('.csv') || fileName.endsWith('.json') || fileName.endsWith('.parquet');
      const isUnstructured = fileName.endsWith('.pdf') || fileName.endsWith('.txt') || fileName.endsWith('.md') || fileName.endsWith('.docx');
      
      const isValidType = isStructured || isUnstructured;
      const isValidSize = file.size <= 50 * 1024 * 1024; // 50MB limits

      if (!isValidType) {
        toast({ 
          title: "Invalid file type", 
          description: `${file.name} is not supported. Use analytical formats (CSV, Parquet) or Documents (PDF, TXT, MD).`, 
          variant: "destructive" 
        });
      }
      if (!isValidSize) {
        toast({ 
          title: "File too large", 
          description: `${file.name} exceeds the 50MB ingestion limit.`, 
          variant: "destructive" 
        });
      }
      
      return isValidType && isValidSize;
    }).map(file => {
      const isDoc = file.name.toLowerCase().match(/\.(pdf|txt|md|docx)$/) !== null;
      return {
        file,
        id: Math.random().toString(36).substring(7),
        progress: 0,
        status: 'pending' as const,
        isDocument: isDoc
      };
    });

    setFiles(prev => [...prev, ...validFiles]);
  }, [toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    }
  }, [handleFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadFiles = async () => {
    const pendingFiles = files.filter(f => f.status === 'pending');
    
    // 🚀 CRITICAL FIX: Autonomously fetch the session token
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    const activeToken = token || session?.access_token;

    if (!activeToken) {
      toast({
        title: "Authentication Error",
        description: "Your session has expired. Please log in again.",
        variant: "destructive"
      });
      return;
    }
    
    for (const fileObj of pendingFiles) {
      setFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { ...f, status: 'uploading', progress: 0 } : f
      ));

      try {
        // 1. Prepare the Payload
        const formData = new FormData();
        formData.append('file', fileObj.file);
        formData.append('name', fileObj.file.name); // Aligned to datasets.py schema `name` field

        // 2. Real Network Request using XHR for Native Progress Events
        const response: any = await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          
          // Route to the backend datasets upload endpoint.
          xhr.open('POST', '/api/datasets/upload', true);
          
          // Inject dynamic token
          xhr.setRequestHeader('Authorization', `Bearer ${activeToken}`);

          // Real-time progress tracking
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
              const percentComplete = Math.round((event.loaded / event.total) * 100);
              setFiles(prev => prev.map(f => 
                f.id === fileObj.id ? { ...f, progress: percentComplete } : f
              ));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              try {
                resolve(JSON.parse(xhr.responseText));
              } catch (e) {
                resolve({});
              }
            } else {
              reject(new Error(xhr.responseText || `Upload failed with status ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error during upload connection.'));
          
          // Execute the request
          xhr.send(formData);
        });

        // 3. Handle Success
        setFiles(prev => prev.map(f => 
          f.id === fileObj.id ? { ...f, status: 'completed', progress: 100 } : f
        ));
        
        toast({
          title: "Upload Complete",
          description: `${fileObj.file.name} has been processed ${fileObj.isDocument ? 'into semantic vectors' : 'into a structured data frame'}.`
        });

        // 4. Pass the actual backend response data to the parent orchestrator
        if (onUploadSuccess) {
          // Fallbacks handle variances between unstructured and structured ingestion return payloads
          const parsedId = response.storage_path?.split('/').pop() || response.id;

          onUploadSuccess({
            datasetId: parsedId,
            fileName: fileObj.file.name,
            rowCount: response.row_count || 0,
            columns: response.columns || [],
            message: "Upload completed successfully.",
            isDocument: fileObj.isDocument
          });
        }

      } catch (error: any) {
        // 5. Handle Failure gracefully
        console.error(`[Upload Error] ${fileObj.file.name}:`, error);
        
        setFiles(prev => prev.map(f => 
          f.id === fileObj.id ? { ...f, status: 'error' } : f
        ));
        
        toast({
          title: "Upload Blocked",
          description: error.message || `The Data Engine refused processing for ${fileObj.file.name}.`,
          variant: "destructive"
        });
      }
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <label 
        className={`cursor-pointer flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-all group relative overflow-hidden ${
          isDragging 
            ? 'border-blue-500 bg-blue-50/50' 
            : 'bg-white border-slate-200 hover:border-blue-400 hover:bg-slate-50/50'
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        htmlFor="file-upload"
      >
        <UploadCloud className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-blue-500' : 'text-slate-400 group-hover:text-blue-500'}`} />
        <p className="text-sm text-slate-700 font-bold mb-1 tracking-tight">
          Drag and drop files here or click to browse
        </p>
        <p className="text-xs text-slate-500 mb-4 font-medium">
          Structured (CSV, JSON, Parquet) & Documents (PDF, TXT, MD, DOCX)
        </p>
        
        <input
          id="file-upload"
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept=".csv,text/csv,application/csv,.json,application/json,.parquet,application/vnd.apache.parquet,.pdf,application/pdf,.txt,text/plain,.md,text/markdown,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
        />
        
        <div className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-colors shadow-sm shadow-blue-500/20">
          Select Files
        </div>
      </label>

      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          {files.map((fileObj) => (
            <div 
              key={fileObj.id}
              className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <div className="flex items-center space-x-4 flex-1 min-w-0">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-2">
                    {fileObj.file.name}
                    {fileObj.isDocument && (
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md">RAG Doc</span>
                    )}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs font-medium text-slate-500">
                      {(fileObj.file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    {fileObj.status === 'uploading' && (
                      <>
                        <span className="text-xs text-slate-300">•</span>
                        <span className="text-xs font-bold text-blue-600">{fileObj.progress}%</span>
                      </>
                    )}
                  </div>
                  {fileObj.status === 'uploading' && (
                    <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2.5 overflow-hidden">
                      <div 
                        className="h-full bg-blue-600 transition-all duration-300 rounded-full"
                        style={{ width: `${fileObj.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center ml-4 space-x-2">
                {fileObj.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {fileObj.status === 'error' && <AlertCircle className="w-5 h-5 text-rose-500" />}
                {fileObj.status === 'pending' && (
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      removeFile(fileObj.id);
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className="flex justify-end pt-4 border-t border-slate-100">
            <button
              onClick={uploadFiles}
              disabled={!files.some(f => f.status === 'pending')}
              className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm transition-colors shadow-sm"
            >
              Upload Pending Files
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
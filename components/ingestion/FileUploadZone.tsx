// components/ingestion/FileUploadZone.tsx
"use client";

import React, { useCallback, useState } from "react";
import { UploadCloud, File as FileIcon, AlertCircle, CheckCircle2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface FileUploadState {
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  id: string;
}

export const FileUploadZone = () => {
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
    // Validate files and handle case-insensitive extensions
    const validFiles = newFiles.filter(file => {
      const fileName = file.name.toLowerCase();
      const isValidType = fileName.endsWith('.csv') || fileName.endsWith('.json') || fileName.endsWith('.parquet');
      const isValidSize = file.size <= 50 * 1024 * 1024; // 50MB

      if (!isValidType) {
        toast({ 
          title: "Invalid file type", 
          description: `${file.name} is not supported.`, 
          variant: "destructive" 
        });
      }
      if (!isValidSize) {
        toast({ 
          title: "File too large", 
          description: `${file.name} exceeds 50MB limit.`, 
          variant: "destructive" 
        });
      }
      
      return isValidType && isValidSize;
    }).map(file => ({
      file,
      id: Math.random().toString(36).substring(7),
      progress: 0,
      status: 'pending' as const
    }));

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
      // Reset input value to allow selecting the same file again if removed
      e.target.value = '';
    }
  };

  const removeFile = (id: string) => {
    setFiles(prev => prev.filter(f => f.id !== id));
  };

  const uploadFiles = async () => {
    // Mock upload process
    const pendingFiles = files.filter(f => f.status === 'pending');
    
    for (const fileObj of pendingFiles) {
      setFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { ...f, status: 'uploading' } : f
      ));

      // Simulate progress
      for (let i = 0; i <= 100; i += 10) {
        await new Promise(r => setTimeout(r, 100));
        setFiles(prev => prev.map(f => 
          f.id === fileObj.id ? { ...f, progress: i } : f
        ));
      }

      setFiles(prev => prev.map(f => 
        f.id === fileObj.id ? { ...f, status: 'completed' } : f
      ));
      
      toast({
        title: "Upload complete",
        description: `${fileObj.file.name} has been processed successfully.`
      });
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto p-4">
      <label 
        className={`cursor-pointer flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-lg transition-all group relative overflow-hidden ${
          isDragging 
            ? 'border-indigo-500 bg-indigo-500/10' 
            : 'bg-zinc-900 border-zinc-800 hover:border-indigo-500 hover:bg-zinc-800/50'
        }`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        htmlFor="file-upload"
      >
        <UploadCloud className={`w-12 h-12 mb-4 transition-colors ${isDragging ? 'text-indigo-400' : 'text-zinc-500 group-hover:text-indigo-400'}`} />
        <p className="text-sm text-zinc-300 font-medium mb-1">
          Drag and drop files here or click to browse
        </p>
        <p className="text-xs text-zinc-500 mb-4">
          Supported formats: CSV, JSON, Parquet (Max 50MB)
        </p>
        
        <input
          id="file-upload"
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          // Added extensive MIME types to fix OS-level greyed out files
          accept=".csv,text/csv,application/csv,.json,application/json,.parquet,application/vnd.apache.parquet"
          multiple
        />
        
        {/* Changed from <button> to <div> to avoid nested interactive elements issues in forms/labels */}
        <div className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-medium text-sm transition-colors shadow-sm">
          Select Files
        </div>
      </label>

      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          {files.map((fileObj) => (
            <div 
              key={fileObj.id}
              className="flex items-center justify-between p-3 rounded-lg border border-zinc-800 bg-zinc-900/50"
            >
              <div className="flex items-center space-x-3 flex-1 min-w-0">
                <FileIcon className="w-5 h-5 text-indigo-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {fileObj.file.name}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs text-zinc-500">
                      {(fileObj.file.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    {fileObj.status === 'uploading' && (
                      <>
                        <span className="text-xs text-zinc-600">•</span>
                        <span className="text-xs text-indigo-400">{fileObj.progress}%</span>
                      </>
                    )}
                  </div>
                  {fileObj.status === 'uploading' && (
                    <div className="h-1 w-full bg-zinc-800 rounded-full mt-2 overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 transition-all duration-300"
                        style={{ width: `${fileObj.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center ml-4 space-x-2">
                {fileObj.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {fileObj.status === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
                {fileObj.status === 'pending' && (
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      removeFile(fileObj.id);
                    }}
                    className="p-1 hover:bg-zinc-800 rounded text-zinc-400 hover:text-zinc-200 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          <div className="flex justify-end pt-4">
            <button
              onClick={uploadFiles}
              disabled={!files.some(f => f.status === 'pending')}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded font-medium text-sm transition-colors shadow-sm"
            >
              Upload Pending Files
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
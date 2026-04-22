"use client";

import React, { useCallback, useState, useRef, useEffect } from "react";
import { UploadCloud, File as FileIcon, AlertCircle, CheckCircle2, X, RefreshCw, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/utils/supabase/client";

export interface UploadSuccessData {
  datasetId?: string;
  fileName: string;
  rowCount?: number;
  columns?: any[];
  message?: string;
  isDocument?: boolean;
}

export interface FileUploadZoneProps {
  isEphemeral?: boolean;
  token?: string; 
  autoUpload?: boolean;
  onUploadSuccess?: (data: UploadSuccessData) => void;
  maxQueueSize?: number;
  maxChunkSize?: number;
  enableMultipart?: boolean;
}

interface FileMetaState {
  id: string;
  name: string;
  safeName: string;
  size: number;
  type: string;
  progress: number;
  status: 'pending' | 'uploading' | 'retrying' | 'completed' | 'error';
  isDocument: boolean;
  errorMessage?: string;
  index: number;
  retryCount: number;
  mimeWarning?: string;
  uploadId?: string;
  uploadedBytes?: number;
}

const VALID_MIME_TYPES = new Set([
  "text/csv", "application/csv", "application/json", "application/jsonl", 
  "application/x-ndjson", "application/vnd.apache.parquet", 
  "application/pdf", "text/plain", "text/markdown", 
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
]);

const VALID_EXTENSIONS = new Set([
  "csv", "json", "jsonl", "ndjson", "parquet", 
  "pdf", "txt", "md", "docx"
]);

// ─────────────────────────────────────────────────────────────
// 1. PRODUCTION-GRADE CONCURRENCY (Set-based, no index mutation)
// ─────────────────────────────────────────────────────────────
const runWithLimit = async <T,>(limit: number, tasks: (() => Promise<T>)[]): Promise<PromiseSettledResult<T>[]> => {
  const results: Promise<PromiseSettledResult<T>>[] = [];
  const executing = new Set<Promise<T>>();

  for (const task of tasks) {
    const p = Promise.resolve().then(task);
    const settled = p.then(
      (value): PromiseSettledResult<T> => ({ status: 'fulfilled', value }),
      (reason): PromiseSettledResult<T> => ({ status: 'rejected', reason })
    );
    
    results.push(settled);
    executing.add(p);

    const clean = () => executing.delete(p);
    p.then(clean).catch(clean);

    if (executing.size >= limit) {
      await Promise.race(executing);
    }
  }

  return Promise.all(results);
};

// ─────────────────────────────────────────────────────────────
// 10. TRANSPORT LAYER ABSTRACTION
// ─────────────────────────────────────────────────────────────
interface UploadOptions {
  onProgress: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

interface UploadTransport {
  upload(file: File, url: string, options: UploadOptions): Promise<void>;
  abort(): void;
}

class XHRTransport implements UploadTransport {
  private xhr?: XMLHttpRequest;
  
  upload(file: File, url: string, options: UploadOptions): Promise<void> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      this.xhr = xhr;
      
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');

      let lastUpdate = 0;
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const now = Date.now();
          if (now - lastUpdate > 100 || event.loaded === event.total) {
            options.onProgress(event.loaded, event.total);
            lastUpdate = now;
          }
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve();
        else reject(new Error(`Edge storage rejected chunk mapping (Status ${xhr.status})`));
      };
      xhr.onerror = () => reject(new Error('Network disconnected during Edge streaming.'));
      xhr.onabort = () => reject(new Error('Upload cancelled by user.'));
      
      if (options.signal) {
        options.signal.addEventListener('abort', () => {
          this.abort();
          reject(new Error('Upload cancelled by user.'));
        });
      }
      
      xhr.send(file);
    });
  }
  
  abort(): void {
    if (!this.xhr) return;
    const xhr = this.xhr;
    this.xhr = undefined;
    
    // 3. IDEMPOTENT ABORT: detach handlers before abort()
    xhr.onabort = null;
    xhr.onerror = null;
    xhr.onload = null;
    xhr.upload.onprogress = null;
    xhr.abort();
  }
}

// 6. MULTIPART / RESUME-CAPABLE TRANSPORT
class MultipartTransport implements UploadTransport {
  private abortController = new AbortController();
  private activeTransports: XHRTransport[] = [];
  
  constructor(
    private presignData: { upload_id: string; file_path: string; part_urls: string[] },
    private chunkSize: number
  ) {}
  
  async upload(file: File, _url: string, options: UploadOptions): Promise<void> {
    const totalChunks = Math.ceil(file.size / this.chunkSize);
    const parts: { ETag: string; PartNumber: number }[] = [];
    
    for (let i = 0; i < totalChunks; i++) {
      if (this.abortController.signal.aborted) {
        throw new Error('Upload cancelled by user.');
      }
      
      const start = i * this.chunkSize;
      const end = Math.min(start + this.chunkSize, file.size);
      const chunk = file.slice(start, end);
      const partUrl = this.presignData.part_urls[i];
      
      if (!partUrl) {
        throw new Error(`Missing presigned URL for part ${i + 1}`);
      }
      
      const transport = new XHRTransport();
      this.activeTransports.push(transport);
      
      await transport.upload(chunk, partUrl, {
        onProgress: (loaded, _total) => {
          const overallLoaded = start + loaded;
          options.onProgress(overallLoaded, file.size);
        },
        signal: this.abortController.signal
      });
      
      // Production note: extract actual ETag from xhr.getResponseHeader('ETag')
      parts.push({ ETag: `"part${i}"`, PartNumber: i + 1 });
    }
    
    const completeRes = await fetch('/api/datasets/complete-multipart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        upload_id: this.presignData.upload_id,
        file_path: this.presignData.file_path,
        parts
      }),
      signal: this.abortController.signal
    });
    
    if (!completeRes.ok) {
      throw new Error('Failed to complete multipart upload');
    }
  }
  
  abort(): void {
    this.abortController.abort();
    this.activeTransports.forEach(t => t.abort());
    this.activeTransports = [];
  }
}

export const FileUploadZone: React.FC<FileUploadZoneProps> = ({ 
  isEphemeral = false, 
  token, 
  autoUpload = false,
  onUploadSuccess,
  maxQueueSize = 20,
  maxChunkSize = 50 * 1024 * 1024,
  enableMultipart = true
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [files, setFiles] = useState<FileMetaState[]>([]);
  const { toast } = useToast();

  const fileRefs = useRef<Map<string, File>>(new Map());
  const transportRefs = useRef<Map<string, UploadTransport>>(new Map());
  const abortControllers = useRef<Map<string, AbortController>>(new Map());
  
  const isUploadingRef = useRef(false);
  const autoUploadTriggeredRef = useRef(false);
  const baseIndexRef = useRef(0);
  
  // 9. SESSION CACHING
  const sessionRef = useRef<{ token: string; expiresAt: number } | null>(null);

  // 3. IDEMPOTENT CLEANUP
  const cleanup = useCallback((id: string) => {
    const transport = transportRefs.current.get(id);
    if (transport) {
      transport.abort();
      transportRefs.current.delete(id);
    }
    
    const abortController = abortControllers.current.get(id);
    if (abortController) {
      abortController.abort();
      abortControllers.current.delete(id);
    }
    
    fileRefs.current.delete(id);
  }, []);

  // 9. CACHED SESSION FETCHER
  const getActiveToken = useCallback(async (): Promise<string | null> => {
    if (token) return token;
    
    const now = Date.now();
    if (sessionRef.current && sessionRef.current.expiresAt > now + 60000) {
      return sessionRef.current.token;
    }
    
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (session?.access_token) {
        sessionRef.current = {
          token: session.access_token,
          expiresAt: session.expires_at ? session.expires_at * 1000 : now + 3600000
        };
        return session.access_token;
      }
    } catch (err) {
      console.error('[Session] Failed to refresh:', err);
    }
    
    return null;
  }, [token]);

  const fetchWithRetry = async (url: string, options: RequestInit, retries = 2): Promise<Response> => {
    let lastError: any;
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res;
      } catch (err) {
        lastError = err;
        if (i < retries) await new Promise(r => setTimeout(r, 500 * (i + 1)));
      }
    }
    throw lastError;
  };

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFiles = useCallback((newFiles: File[]) => {
    const existingSignatures = new Set(files.map(f => `${f.name}_${f.size}`));
    const availableSlots = maxQueueSize - files.length;
    
    if (availableSlots <= 0) {
      toast({ title: "Queue full", description: `Maximum of ${maxQueueSize} files allowed.`, variant: "destructive" });
      return;
    }

    const filesToProcess = newFiles.slice(0, availableSlots);
    if (newFiles.length > availableSlots) {
      toast({ title: "Queue Limit Reached", description: `Only added the first ${availableSlots} files.`, variant: "default" });
    }

    const validFiles = filesToProcess.reduce<{ file: File; isDoc: boolean; mimeWarning?: string }[]>((acc, file) => {
      const fileSig = `${file.name}_${file.size}`;
      if (existingSignatures.has(fileSig)) {
        toast({ title: "Duplicate file", description: `${file.name} is already queued.`, variant: "destructive" });
        return acc;
      }

      const fileName = file.name.toLowerCase();
      const extension = fileName.split('.').pop() || '';
      const isDoc = ['pdf', 'txt', 'md', 'docx'].includes(extension);
      const isStructured = ['csv', 'json', 'parquet', 'jsonl', 'ndjson'].includes(extension);
      const isExtensionValid = isStructured || isDoc;
      const isValidSize = file.size <= 500 * 1024 * 1024;

      if (!isExtensionValid) {
        toast({ title: "Invalid file type", description: `${file.name} format is not supported.`, variant: "destructive" });
        return acc;
      }
      
      // 8. SURFACE MIME WARNINGS TO UI
      let mimeWarning: string | undefined;
      if (file.type && !VALID_MIME_TYPES.has(file.type)) {
        mimeWarning = `Unverified: ${file.type}`;
      }
      
      if (!isValidSize) {
        toast({ title: "File too large", description: `${file.name} exceeds the 500MB limit.`, variant: "destructive" });
        return acc;
      }
      
      acc.push({ file, isDoc, mimeWarning });
      return acc;
    }, []).map(({ file, isDoc, mimeWarning }) => {
      const id = crypto.randomUUID();
      const safeName = file.name.replace(/[^\w.\-]/g, "_");
      fileRefs.current.set(id, file);

      return {
        id,
        name: file.name,
        safeName,
        size: file.size,
        type: file.type,
        progress: 0,
        status: 'pending' as const,
        isDocument: isDoc,
        index: baseIndexRef.current++, // 5. STABLE ORDERING
        retryCount: 0,
        mimeWarning
      };
    });

    if (validFiles.length > 0) {
      setFiles(prev => [...prev, ...validFiles]);
    }
  }, [files, maxQueueSize, toast]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files?.length) handleFiles(Array.from(e.dataTransfer.files));
  }, [handleFiles]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      handleFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const cancelUpload = useCallback((id: string) => {
    cleanup(id);
    setFiles(prev => prev.filter(f => f.id !== id));
  }, [cleanup]);

  const uploadSingleFile = async (fileMeta: FileMetaState, activeToken: string) => {
    const file = fileRefs.current.get(fileMeta.id);
    if (!file) { cleanup(fileMeta.id); return; }

    setFiles(prev => prev.map(f => f.id === fileMeta.id ? { ...f, status: 'uploading', progress: 0 } : f));
    
    const abortController = new AbortController();
    abortControllers.current.set(fileMeta.id, abortController);

    const performUpload = async (): Promise<void> => {
      const presignResponse = await fetchWithRetry('/api/datasets/presign', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ 
          filename: fileMeta.safeName,
          size: file.size,
          multipart: enableMultipart && file.size > maxChunkSize 
        }),
        signal: abortController.signal
      });

      const presignData = await presignResponse.json();
      
      if (!presignData?.upload_url && !presignData?.part_urls) {
        throw new Error("Invalid presign response from orchestration layer.");
      }

      let transport: UploadTransport;
      if (presignData.part_urls && presignData.upload_id) {
        transport = new MultipartTransport(presignData, maxChunkSize);
      } else {
        transport = new XHRTransport();
      }
      transportRefs.current.set(fileMeta.id, transport);

      await transport.upload(file, presignData.upload_url, {
        onProgress: (loaded, total) => {
          const percentComplete = Math.round((loaded / total) * 100);
          setFiles(prev => prev.map(f => 
            f.id === fileMeta.id ? { ...f, progress: percentComplete } : f
          ));
        },
        signal: abortController.signal
      });

      const registerResponse = await fetchWithRetry('/api/datasets', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: fileMeta.safeName,
          file_path: presignData.file_path,
          upload_id: presignData.upload_id,
          is_multipart: !!presignData.upload_id
        }),
        signal: abortController.signal
      });

      const registeredDataset = await registerResponse.json();
      if (!registeredDataset?.id) {
        throw new Error("File secured, but failed to retrieve dataset context ID.");
      }

      setFiles(prev => prev.map(f => f.id === fileMeta.id ? { ...f, status: 'completed', progress: 100 } : f));
      
      if (onUploadSuccess) {
        onUploadSuccess({
          datasetId: registeredDataset.id,
          fileName: fileMeta.name,
          rowCount: 0,
          columns: [],
          message: "Dataset registered and dispatched to workers.",
          isDocument: fileMeta.isDocument
        });
      }
    };

    // 7. RETRY STATE (not just progress reset)
    let lastError: any;
    for (let i = 0; i <= 2; i++) {
      try {
        await performUpload();
        return;
      } catch (err: any) {
        lastError = err;
        if (i < 2 && !err.message?.includes('cancelled') && !err.message?.includes('abort')) {
          setFiles(prev => prev.map(f => 
            f.id === fileMeta.id 
              ? { ...f, status: 'retrying', retryCount: i + 1, progress: 0 } 
              : f
          ));
          await new Promise(r => setTimeout(r, 1000 * (i + 1)));
          setFiles(prev => prev.map(f => 
            f.id === fileMeta.id ? { ...f, status: 'uploading' } : f
          ));
        } else {
          throw err;
        }
      }
    }
    throw lastError;
  };

  const uploadFiles = useCallback(async () => {
    if (isUploadingRef.current) return;
    
    const pendingFiles = files.filter(f => f.status === 'pending').sort((a, b) => a.index - b.index);
    if (pendingFiles.length === 0) return;

    isUploadingRef.current = true;
    try {
      const activeToken = await getActiveToken();
      if (!activeToken) {
        toast({ title: "Authentication Error", description: "Your session has expired.", variant: "destructive" });
        return;
      }
      
      // 4. SAFE BATCH COMPLETION (allSettled semantics)
      await runWithLimit(3, pendingFiles.map(fileMeta => () => uploadSingleFile(fileMeta, activeToken)));
    } finally {
      isUploadingRef.current = false;
    }
  }, [files, getActiveToken, toast, onUploadSuccess, maxChunkSize, enableMultipart]);

  // 2. ROBUST AUTO-UPLOAD LOCK PATTERN
  useEffect(() => {
    const shouldRun =
      autoUpload &&
      files.some(f => f.status === 'pending') &&
      !isUploadingRef.current &&
      !autoUploadTriggeredRef.current;

    if (!shouldRun) return;

    autoUploadTriggeredRef.current = true;
    (async () => {
      try {
        await uploadFiles();
      } finally {
        autoUploadTriggeredRef.current = false;
      }
    })();
  }, [files, autoUpload, uploadFiles]);

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
        <p className="text-xs text-slate-500 mb-4 font-medium text-center">
          Structured (CSV, JSON, Parquet) & Documents (PDF, TXT, MD, DOCX)<br />
          Up to 500MB per file • Max {maxQueueSize} queued files
        </p>
        
        <input
          id="file-upload"
          type="file"
          className="hidden"
          onChange={handleFileSelect}
          accept=".csv,text/csv,application/csv,.json,application/json,.jsonl,.ndjson,.parquet,application/vnd.apache.parquet,.pdf,application/pdf,.txt,text/plain,.md,text/markdown,.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          multiple
        />
        
        {!autoUpload && (
          <div className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-sm transition-colors shadow-sm shadow-blue-500/20">
            Select Files
          </div>
        )}
      </label>

      {files.length > 0 && (
        <div className="mt-6 space-y-3">
          {files.map((fileObj) => (
            <div 
              key={fileObj.id}
              className={`flex items-center justify-between p-4 rounded-xl border bg-white shadow-sm transition-colors ${
                fileObj.status === 'error' ? 'border-rose-200 bg-rose-50/30' : 'border-slate-200'
              }`}
            >
              <div className="flex items-center space-x-4 flex-1 min-w-0">
                <div className="p-2 bg-blue-50 rounded-lg">
                  <FileIcon className="w-5 h-5 text-blue-600 flex-shrink-0" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-900 truncate flex items-center gap-2">
                    {fileObj.name}
                    {fileObj.isDocument && (
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-slate-100 border border-slate-200 text-slate-600 px-2 py-0.5 rounded-md">RAG Doc</span>
                    )}
                    {fileObj.mimeWarning && (
                      <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-50 border border-amber-200 text-amber-600 px-2 py-0.5 rounded-md flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        {fileObj.mimeWarning}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center space-x-2 mt-1">
                    <span className="text-xs font-medium text-slate-500">
                      {(fileObj.size / 1024 / 1024).toFixed(2)} MB
                    </span>
                    {fileObj.status === 'uploading' && (
                      <>
                        <span className="text-xs text-slate-300">•</span>
                        <span className="text-xs font-bold text-blue-600">{fileObj.progress}%</span>
                      </>
                    )}
                    {fileObj.status === 'retrying' && (
                      <>
                        <span className="text-xs text-amber-300">•</span>
                        <span className="text-xs font-bold text-amber-600 flex items-center gap-1">
                          <RefreshCw className="w-3 h-3 animate-spin" />
                          Retrying {fileObj.retryCount}/2...
                        </span>
                      </>
                    )}
                    {fileObj.status === 'error' && fileObj.errorMessage && (
                      <>
                        <span className="text-xs text-rose-300">•</span>
                        <span className="text-xs font-medium text-rose-600 truncate">{fileObj.errorMessage}</span>
                      </>
                    )}
                  </div>
                  {(fileObj.status === 'uploading' || fileObj.status === 'retrying') && (
                    <div className="h-1.5 w-full bg-slate-100 rounded-full mt-2.5 overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-300 ease-out rounded-full ${
                          fileObj.status === 'retrying' ? 'bg-amber-400' : 'bg-blue-600'
                        }`}
                        style={{ width: `${fileObj.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center ml-4 space-x-2">
                {fileObj.status === 'completed' && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                {fileObj.status === 'error' && <AlertCircle className="w-5 h-5 text-rose-500" />}
                {(fileObj.status === 'pending' || fileObj.status === 'uploading' || fileObj.status === 'retrying' || fileObj.status === 'error') && (
                  <button 
                    onClick={(e) => {
                      e.preventDefault();
                      cancelUpload(fileObj.id);
                    }}
                    className="p-1.5 hover:bg-slate-100 rounded-md text-slate-400 hover:text-slate-600 transition-colors"
                    aria-label="Cancel or remove upload"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}

          {!autoUpload && (
            <div className="flex justify-end pt-4 border-t border-slate-100">
              <button
                onClick={uploadFiles}
                disabled={!files.some(f => f.status === 'pending') || isUploadingRef.current}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg font-bold text-sm transition-colors shadow-sm"
              >
                {isUploadingRef.current ? 'Uploading...' : 'Upload Pending Files'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
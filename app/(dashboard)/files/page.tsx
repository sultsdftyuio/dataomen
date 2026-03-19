'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { 
  UploadCloud, 
  FileText, 
  FileSpreadsheet, 
  Image as ImageIcon, 
  File as FileIcon,
  Trash2,
  Download,
  MessageSquare,
  Clock,
  CheckCircle2,
  Plus
} from 'lucide-react'

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/components/ui/use-toast"
import { useRouter } from 'next/navigation'

// -----------------------------------------------------------------------------
// Mock Data & Types
// -----------------------------------------------------------------------------
interface FileRecord {
  id: string;
  name: string;
  size: number; // in bytes
  type: string;
  uploadedAt: Date;
}

const MOCK_FILES: FileRecord[] = [
  { id: 'f_1', name: 'Q3_Financial_Report.csv', size: 1024 * 450, type: 'text/csv', uploadedAt: new Date(Date.now() - 1000 * 60 * 5) },
  { id: 'f_2', name: 'user_churn_analysis.parquet', size: 1024 * 1024 * 2.4, type: 'application/octet-stream', uploadedAt: new Date(Date.now() - 1000 * 60 * 30) },
  { id: 'f_3', name: 'architecture_diagram.png', size: 1024 * 850, type: 'image/png', uploadedAt: new Date(Date.now() - 1000 * 60 * 60 * 2) },
]

const formatBytes = (bytes: number) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const getTimeAgo = (date: Date) => {
  const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds} seconds ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} minutes ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hours ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

const getFileIcon = (type: string, className = "w-5 h-5") => {
  if (type.includes('csv') || type.includes('excel') || type.includes('spreadsheet')) return <FileSpreadsheet className={`${className} text-emerald-500`} />;
  if (type.includes('image')) return <ImageIcon className={`${className} text-blue-500`} />;
  if (type.includes('pdf') || type.includes('text')) return <FileText className={`${className} text-rose-500`} />;
  return <FileIcon className={`${className} text-muted-foreground`} />;
}

// -----------------------------------------------------------------------------
// Main Component
// -----------------------------------------------------------------------------
export default function FilesPage() {
  const router = useRouter()
  const [files, setFiles] = useState<FileRecord[]>(MOCK_FILES)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDragging, setIsDragging] = useState(false)
  
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragCounter = useRef(0)

  // ── Drag & Drop Logic ──
  useEffect(() => {
    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      dragCounter.current += 1;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) setIsDragging(true);
    };
    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      dragCounter.current -= 1;
      if (dragCounter.current === 0) setIsDragging(false);
    };
    const handleDragOver = (e: DragEvent) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e: DragEvent) => {
      e.preventDefault(); e.stopPropagation();
      setIsDragging(false);
      dragCounter.current = 0;
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        handleFilesAdded(Array.from(e.dataTransfer.files));
      }
    };

    window.addEventListener("dragenter", handleDragEnter);
    window.addEventListener("dragleave", handleDragLeave);
    window.addEventListener("dragover", handleDragOver);
    window.addEventListener("drop", handleDrop);
    return () => {
      window.removeEventListener("dragenter", handleDragEnter);
      window.removeEventListener("dragleave", handleDragLeave);
      window.removeEventListener("dragover", handleDragOver);
      window.removeEventListener("drop", handleDrop);
    };
  }, []);

  const handleFilesAdded = (newFiles: File[]) => {
    const formattedFiles: FileRecord[] = newFiles.map(f => ({
      id: `file_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      name: f.name,
      size: f.size,
      type: f.type || 'application/octet-stream',
      uploadedAt: new Date()
    }));
    
    setFiles(prev => [...formattedFiles, ...prev]);
    toast({ title: "Files Uploaded", description: `Successfully added ${newFiles.length} file(s) to your workspace.` });
  }

  // ── Selection Logic ──
  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  }

  const toggleAll = () => {
    if (selectedIds.size === files.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(files.map(f => f.id)));
  }

  // ── Bulk Actions ──
  const handleDeleteSelected = () => {
    setFiles(prev => prev.filter(f => !selectedIds.has(f.id)));
    setSelectedIds(new Set());
    toast({ title: "Files Deleted", description: "Selected files have been removed from your workspace." });
  }

  const handleChatWithFiles = () => {
    // In a real app, you would pass the file IDs in the URL or via state management
    // router.push(`/chat?files=${Array.from(selectedIds).join(',')}`)
    router.push('/chat');
  }

  return (
    <div className="flex flex-col h-full container mx-auto p-6 md:p-10 max-w-7xl animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* ── HEADER ── */}
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">My Files</h1>
        <p className="text-muted-foreground text-base">Uploads and datasets created by Arcli's ingestion engine.</p>
      </div>

      {/* ── MASSIVE DROPZONE ── */}
      <div 
        className={`relative w-full rounded-2xl border-2 border-dashed transition-all duration-300 flex flex-col items-center justify-center p-12 text-center mb-6 overflow-hidden
          ${isDragging 
            ? 'border-primary bg-primary/5 shadow-inner scale-[1.01]' 
            : 'border-border bg-card hover:bg-muted/30 hover:border-primary/50'
          }`}
      >
        {isDragging && (
          <div className="absolute inset-0 bg-primary/5 backdrop-blur-[2px] z-10 flex flex-col items-center justify-center">
            <UploadCloud className="w-16 h-16 text-primary animate-bounce shadow-xl rounded-full bg-background p-2" />
            <p className="text-2xl font-bold text-primary mt-4 tracking-tight drop-shadow-sm">Drop files here to analyze instantly</p>
          </div>
        )}

        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 border border-border/50 shadow-sm">
          <UploadCloud className="w-8 h-8 text-muted-foreground" />
        </div>
        <h3 className="text-xl font-bold text-foreground mb-2 tracking-tight">Drag files to upload</h3>
        <p className="text-muted-foreground mb-6">Supports CSV, Parquet, Excel, PDF, and Images.</p>
        
        <input 
          type="file" 
          multiple 
          className="hidden" 
          ref={fileInputRef} 
          onChange={(e) => {
            if (e.target.files) handleFilesAdded(Array.from(e.target.files));
            e.target.value = ''; 
          }}
        />
        <Button onClick={() => fileInputRef.current?.click()} className="rounded-full shadow-sm px-8" size="lg">
          <Plus className="w-4 h-4 mr-2" /> Upload File
        </Button>
      </div>

      {/* ── RETENTION WARNING ── */}
      <div className="flex items-center justify-center gap-2 mb-8 text-sm text-muted-foreground bg-muted/30 py-2.5 rounded-lg border border-border">
        <Clock className="w-4 h-4 text-amber-500" />
        <span>All unused files are securely deleted after <strong className="text-foreground font-semibold">1 hour</strong> of inactivity.</span>
        <a href="/billing" className="text-primary hover:underline font-medium ml-1">Upgrade to increase this →</a>
      </div>

      {/* ── ACTION BAR ── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-4 pb-4 border-b border-border/60 sticky top-0 bg-background/95 backdrop-blur-sm z-20 py-2">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Checkbox 
            checked={files.length > 0 && selectedIds.size === files.length} 
            onCheckedChange={toggleAll}
            className="data-[state=checked]:bg-primary"
          />
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} selected
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
          <Button 
            variant="outline" 
            size="sm" 
            disabled={selectedIds.size === 0}
            className="bg-background shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4 mr-2" /> Download ({selectedIds.size})
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            disabled={selectedIds.size === 0}
            onClick={handleDeleteSelected}
            className="bg-background shadow-sm text-destructive hover:bg-destructive/10 hover:text-destructive hover:border-destructive/30 disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4 mr-2" /> Delete ({selectedIds.size})
          </Button>
          <Button 
            size="sm" 
            disabled={selectedIds.size === 0}
            onClick={handleChatWithFiles}
            className="shadow-sm disabled:opacity-50 transition-all"
          >
            <MessageSquare className="w-4 h-4 mr-2" /> Chat with files ({selectedIds.size})
          </Button>
        </div>
      </div>

      {/* ── FILE GRID ── */}
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <FileIcon className="w-12 h-12 mb-4 opacity-20" />
          <p>Your workspace is empty.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
          {files.map(file => (
            <div 
              key={file.id} 
              className={`relative flex flex-col p-4 rounded-2xl border transition-all duration-200 cursor-pointer group
                ${selectedIds.has(file.id) 
                  ? 'border-primary bg-primary/5 shadow-sm' 
                  : 'border-border bg-card hover:border-primary/40 hover:shadow-md'
                }`}
              onClick={() => toggleSelection(file.id)}
            >
              {/* Checkbox overlay */}
              <div className="absolute top-4 right-4 z-10">
                <Checkbox 
                  checked={selectedIds.has(file.id)} 
                  onCheckedChange={() => toggleSelection(file.id)}
                  className={`transition-opacity ${selectedIds.has(file.id) ? 'opacity-100 data-[state=checked]:bg-primary' : 'opacity-0 group-hover:opacity-100 bg-background'}`}
                />
              </div>

              {/* Icon & Details */}
              <div className="w-12 h-12 rounded-xl bg-background border border-border shadow-sm flex items-center justify-center mb-4">
                {getFileIcon(file.type, "w-6 h-6")}
              </div>
              
              <div className="flex-1">
                <h3 className="font-semibold text-sm text-foreground truncate pr-6" title={file.name}>
                  {file.name}
                </h3>
                <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground font-medium">
                  <span>{formatBytes(file.size)}</span>
                  <span className="w-1 h-1 rounded-full bg-border" />
                  <span>{getTimeAgo(file.uploadedAt)}</span>
                </div>
              </div>

              {selectedIds.has(file.id) && (
                <div className="absolute bottom-4 right-4 animate-in fade-in zoom-in duration-200">
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
import React, { useState } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, File as FileIcon } from 'lucide-react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/lib/utils';
import { toast } from 'sonner';

export const FileUploadZone = ({ onUploadSuccess }: { onUploadSuccess: (datasetId: string) => void }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };

  const uploadFile = async () => {
    if (!file) return;

    setUploadStatus('uploading');
    setUploadProgress(0);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Not authenticated. Please log in.');
      }

      const formData = new FormData();
      formData.append('file', file);

      // Clean the API URL securely to avoid double-slashes resolving to 404
      const API_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000').replace(/\/$/, '');
      
      const response = await axios.post(`${API_URL}/api/datasets/upload`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'Authorization': `Bearer ${session.access_token}`
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / (progressEvent.total ?? file.size));
          setUploadProgress(percentCompleted);
        }
      });

      setUploadStatus('success');
      toast.success('Dataset uploaded successfully!');
      
      if (response.data && response.data.dataset_id) {
        onUploadSuccess(response.data.dataset_id);
      }
    } catch (error: any) {
      console.error('Upload Error:', error);
      setUploadStatus('error');
      setErrorMessage(error.response?.data?.detail || error.message || 'An error occurred during upload.');
      toast.error('Upload failed. Please try again.');
    }
  };

  return (
    <div className="w-full">
      <div 
        className={`border-2 border-dashed rounded-xl p-8 text-center transition-all duration-200 ease-in-out ${
          isDragging ? 'border-primary bg-primary/5 scale-[1.02]' : 'border-muted-foreground/30 hover:border-primary/50'
        }`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {uploadStatus === 'success' ? (
          <div className="flex flex-col items-center justify-center space-y-3 py-6">
            <CheckCircle className="w-12 h-12 text-green-500 animate-in zoom-in" />
            <h3 className="text-lg font-medium">Upload Complete</h3>
            <p className="text-sm text-muted-foreground">{file?.name}</p>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center space-y-4">
            <div className="p-4 rounded-full bg-muted/50 text-primary">
              {file ? <FileIcon className="w-8 h-8" /> : <UploadCloud className="w-8 h-8" />}
            </div>
            
            <div>
              <h3 className="text-lg font-medium mb-1">
                {file ? file.name : 'Drag & drop your dataset here'}
              </h3>
              <p className="text-sm text-muted-foreground">
                {file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : 'Supports CSV, Excel, and Parquet files up to 50MB'}
              </p>
            </div>

            {!file && (
              <>
                <div className="flex items-center w-full max-w-xs my-2">
                  <div className="flex-1 border-t border-muted"></div>
                  <span className="px-3 text-xs text-muted-foreground uppercase">Or</span>
                  <div className="flex-1 border-t border-muted"></div>
                </div>
                <Button variant="outline" onClick={() => document.getElementById('file-upload')?.click()}>
                  Browse Files
                </Button>
                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  accept=".csv,.xlsx,.xls,.parquet"
                  onChange={handleFileSelect}
                />
              </>
            )}

            {file && uploadStatus === 'idle' && (
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={() => setFile(null)}>Cancel</Button>
                <Button onClick={uploadFile}>Process Dataset</Button>
              </div>
            )}

            {uploadStatus === 'uploading' && (
              <div className="w-full max-w-xs space-y-2 pt-4">
                <div className="flex justify-between text-sm font-medium">
                  <span>Uploading...</span>
                  <span>{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {uploadStatus === 'error' && (
              <div className="flex items-center gap-2 text-destructive text-sm mt-4 bg-destructive/10 px-4 py-2 rounded-md">
                <AlertTriangle className="w-4 h-4" />
                <span>{errorMessage}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
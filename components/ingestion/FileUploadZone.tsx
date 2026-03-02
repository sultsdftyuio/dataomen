'use client'

import React, { useState, useCallback } from 'react'
import { UploadCloud, AlertCircle, Loader2 } from 'lucide-react'
import { useDropzone } from 'react-dropzone'
import { createBrowserClient } from '@supabase/ssr'

interface FileUploadZoneProps {
  // FIX: Renamed to match the parent component's exact prop and type signature
  onUploadSuccess: (datasetId: string) => void
}

export default function FileUploadZone({ onUploadSuccess }: FileUploadZoneProps) {
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const handleUpload = useCallback(async (file: File) => {
    setIsUploading(true)
    setError(null)
    setUploadProgress(0)

    try {
      // 1. Initialize Supabase client securely on the client-side
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      
      const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey)
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      if (sessionError || !session) {
        throw new Error('Authentication required to upload datasets.')
      }

      // 2. Prepare Payload
      const formData = new FormData()
      formData.append('file', file)

      // 3. Execute the upload via XMLHttpRequest for native progress events
      const baseUrl = process.env.NEXT_PUBLIC_API_URL || ''
      const endpoint = `${baseUrl}/api/datasets/upload`

      const result = await new Promise<any>((resolve, reject) => {
        const xhr = new XMLHttpRequest()

        // Track upload progress
        xhr.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable) {
            const progress = Math.round((event.loaded * 100) / event.total)
            setUploadProgress(progress)
          }
        })

        // Handle completion
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            try {
              resolve(JSON.parse(xhr.responseText))
            } catch (e) {
              resolve(xhr.responseText)
            }
          } else {
            try {
              const errorResponse = JSON.parse(xhr.responseText)
              reject(new Error(errorResponse.detail || 'Upload failed'))
            } catch (e) {
              reject(new Error(`Upload failed with status ${xhr.status}`))
            }
          }
        })

        // Handle network errors
        xhr.addEventListener('error', () => {
          reject(new Error('Network error occurred during upload'))
        })

        xhr.open('POST', endpoint)
        
        // Inject the Supabase JWT for FastAPI's `get_current_user` dependency
        xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`)
        
        // Let the browser automatically set Content-Type with the correct multipart boundary
        xhr.send(formData)
      })

      // 4. Pass the datasetId back to the orchestrator to trigger polling/refresh
      const finalDatasetId = result.dataset_id || result.id
      if (!finalDatasetId) {
         throw new Error("Backend did not return a valid dataset ID.")
      }
      
      onUploadSuccess(finalDatasetId)

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred during ingestion.')
      console.error('Upload Error:', err)
    } finally {
      setIsUploading(false)
      if (error) setUploadProgress(0)
    }
  }, [onUploadSuccess, error])

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      if (acceptedFiles.length > 0) {
        handleUpload(acceptedFiles[0])
      }
    },
    [handleUpload]
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.apache.parquet': ['.parquet'],
    },
    maxFiles: 1,
    multiple: false,
    disabled: isUploading
  })

  return (
    <div className="w-full">
      <div
        {...getRootProps()}
        className={`relative flex flex-col items-center justify-center w-full p-12 border-2 border-dashed rounded-xl transition-all duration-200 ease-in-out ${
          isUploading ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'
        } ${
          isDragActive
            ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
            : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800/50'
        }`}
      >
        <input {...getInputProps()} />

        {isUploading ? (
          <div className="flex flex-col items-center space-y-4">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <div className="flex flex-col items-center space-y-1">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Transferring to analytical engine...
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {uploadProgress}%
              </p>
              <div className="w-48 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden mt-2">
                <div
                  className="h-full bg-blue-500 transition-all duration-300 ease-out"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-4 text-center">
            <div className="p-4 bg-slate-100 dark:bg-slate-800 rounded-full">
              <UploadCloud className="w-8 h-8 text-slate-500 dark:text-slate-400" />
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

      {error && (
        <div className="mt-4 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-800 dark:text-red-200">Upload failed</h4>
            <p className="text-sm text-red-600 dark:text-red-300 mt-1">{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}
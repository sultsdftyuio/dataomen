"use client";

import React, { useState } from "react";
import FileUploadZone from "@/components/ingestion/FileUploadZone";
import { DataPreview } from "@/components/dashboard/DataPreview";
import { LayoutDashboard } from "lucide-react";

export default function DashboardOrchestrator() {
  // State to track which dataset the user is currently working with
  const [activeDatasetId, setActiveDatasetId] = useState<string | null>(null);

  // Interaction Handler: Triggered from the DataPreview component 
  // when the user is ready to begin the Natural Language analysis.
  const handleStartAnalysis = (datasetId: string) => {
    console.log(`Starting AI analysis for dataset: ${datasetId}`);
    // Next Step Integration: 
    // Here you would typically toggle a state boolean (e.g., setChatMode(true))
    // to mount your Chat/NL2SQL interface next to or below the data preview.
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-8 animate-in fade-in duration-500">
      
      {/* Header Section */}
      <div className="flex items-center gap-3 border-b border-gray-200 pb-4">
        <div className="p-2 bg-blue-50 rounded-lg">
          <LayoutDashboard className="h-6 w-6 text-blue-600" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">Workspace</h1>
          <p className="text-gray-500 mt-1">
            Upload your analytical data to begin exploring and chatting instantly.
          </p>
        </div>
      </div>

      {/* The Modular Strategy: 
        Render the ingestion zone. It operates as a black box and alerts 
        the orchestrator via the callback when it finishes successfully.
      */}
      {!activeDatasetId && (
        <div className="mt-8">
          <FileUploadZone 
            onUploadSuccess={(datasetId: string) => setActiveDatasetId(datasetId)} 
          />
        </div>
      )}

      {/* The Hybrid Performance Paradigm:
        Once we have an active dataset, mount the preview component.
        This component natively handles rendering massive DOM tables 
        using the sticky headers and constrained viewport heights we built earlier.
      */}
      {activeDatasetId && (
        <div className="mt-8 flex flex-col space-y-6">
          <DataPreview 
            datasetId={activeDatasetId} 
            onStartAnalysis={handleStartAnalysis} 
          />
          
          {/* A soft reset option to clear the workspace */}
          <div className="flex justify-end">
            <button 
              onClick={() => setActiveDatasetId(null)}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Clear workspace and upload a new file
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
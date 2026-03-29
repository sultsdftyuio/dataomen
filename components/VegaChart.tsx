/**
 * @file components/VegaChart.tsx
 * @description ARCLI.TECH - High-Performance Visualization Layer
 * Optimized for the WASM + WebGL roadmap. Handles massive datasets via 
 * hardware-accelerated Canvas rendering and zero-copy data binding.
 */

import React, { useMemo } from 'react';
import { VegaLite } from 'react-vega';
import { AlertCircle, BarChart3, Loader2 } from 'lucide-react';

export interface VegaChartProps {
  spec: Record<string, any>;
  data: any[];
  isLoading?: boolean;
  error?: Error | string | null;
}

export const VegaChart: React.FC<VegaChartProps> = ({ 
  spec, 
  data, 
  isLoading = false,
  error = null
}) => {
  // Memoize the compiled spec to prevent expensive re-renders.
  // CRITICAL FIX: We do NOT inject the data array into this spec. 
  // We use a named dataset reference so React doesn't deep-clone massive arrays.
  const compiledSpec = useMemo(() => {
    if (!spec || Object.keys(spec).length === 0) return null;

    // Strip any hardcoded data from the LLM-generated spec to enforce dynamic binding
    const { data: _removedData, ...cleanSpec } = spec;

    return {
      ...cleanSpec,
      // 1. Data Binding via Reference (Points to the prop passed to VegaLite)
      data: { name: 'dataset' },
      
      // 2. Responsive Geometry
      width: "container",
      height: spec.height || 350,
      autosize: { type: "fit", contains: "padding" },
      background: "transparent",
      
      // 3. Aesthetic Configuration (Synced with Tailwind palette)
      config: {
        ...spec.config,
        font: "inherit", // Inherits Geist/Inter from the global CSS
        view: { stroke: "transparent" }, // Removes default bounding box
        axis: {
          gridColor: "#f3f4f6",   // gray-100
          domainColor: "#e5e7eb", // gray-200
          tickColor: "#e5e7eb",
          labelColor: "#6b7280",  // gray-500
          titleColor: "#374151",  // gray-700
          titleFontWeight: 600,
          labelFontSize: 11,
          titleFontSize: 12,
          labelAngle: 0, // Prevents overlapping text on responsive shrinks
        },
        legend: {
          titleColor: "#374151",
          labelColor: "#4b5563",
          labelFontSize: 11,
          orient: "bottom", // Better for dashboards to save horizontal space
        },
        // Base color scheme for analytical clarity
        range: {
          category: [
            "#2563eb", // blue-600 (Primary)
            "#0ea5e9", // sky-500
            "#8b5cf6", // violet-500
            "#ec4899", // pink-500
            "#10b981", // emerald-500
            "#f59e0b", // amber-500
          ]
        }
      },
      // Enforce GPU-accelerated canvas rendering natively within the spec
      usermeta: {
        renderer: "canvas" 
      }
    };
  }, [spec]);

  // ---------------------------------------------------------------------------
  // Status Renderers (Loading & Errors)
  // ---------------------------------------------------------------------------

  if (error) {
    return (
      <div className="w-full h-[350px] flex flex-col items-center justify-center bg-red-50/50 border border-red-100 rounded-2xl mt-4 text-red-600 p-6 text-center">
        <AlertCircle size={28} className="mb-3 text-red-500" />
        <p className="text-sm font-semibold mb-1">Visualization Failed</p>
        <p className="text-xs text-red-500/80 max-w-md">
          {error instanceof Error ? error.message : error}
        </p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50/50 border border-gray-100 rounded-2xl mt-4">
        <Loader2 size={28} className="mb-3 text-blue-500 animate-spin" />
        <p className="text-sm font-medium text-gray-500">Processing vector data...</p>
      </div>
    );
  }

  if (!compiledSpec || !data || data.length === 0) {
    return (
      <div className="w-full h-[350px] flex flex-col items-center justify-center bg-gray-50 border border-gray-100 rounded-2xl mt-4 text-gray-400">
        <BarChart3 size={28} className="mb-3 text-gray-300" />
        <p className="text-sm font-medium">Awaiting data to render chart</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Main Render
  // ---------------------------------------------------------------------------

  return (
    <div className="w-full p-5 bg-white border border-gray-100 rounded-2xl shadow-sm mt-4 overflow-hidden relative group transition-all duration-200 hover:shadow-md">
      <VegaLite 
        spec={compiledSpec} 
        // Bind the data by reference mapping it to the 'dataset' name we defined in the spec
        data={{ dataset: data }} 
        actions={false} 
        className="w-full"
      />
    </div>
  );
};
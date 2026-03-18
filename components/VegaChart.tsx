// components/VegaChart.tsx

import React, { useMemo } from 'react';
import { VegaLite } from 'react-vega';
import { AlertCircle } from 'lucide-react';

export interface VegaChartProps {
  spec: Record<string, any>;
  data: any[];
}

/**
 * ARCLI.TECH - Visualization Layer
 * Enterprise-grade Vega-Lite wrapper with responsive scaling and 
 * Tailwind-synced aesthetic overrides.
 */
export const VegaChart: React.FC<VegaChartProps> = ({ spec, data }) => {
  // Memoize the compiled spec to prevent expensive canvas re-renders 
  // when the parent ChatInterface state updates.
  const compiledSpec = useMemo(() => {
    if (!spec || Object.keys(spec).length === 0) return null;

    return {
      ...spec,
      // 1. Data Injection: Bind the DuckDB execution payload
      data: { values: data },
      
      // 2. Responsive Geometry
      width: "container",
      height: spec.height || 300,
      autosize: { type: "fit", contains: "padding" },
      background: "transparent",
      
      // 3. Aesthetic Configuration (Synced with Tailwind gray palette)
      config: {
        ...spec.config,
        font: "inherit", // Inherits the application's primary font (e.g., Inter/Geist)
        view: { stroke: "transparent" }, // Removes the default bounding box
        axis: {
          gridColor: "#f3f4f6",   // tailwind gray-100
          domainColor: "#e5e7eb", // tailwind gray-200
          tickColor: "#e5e7eb",
          labelColor: "#6b7280",  // tailwind gray-500
          titleColor: "#374151",  // tailwind gray-700
          titleFontWeight: 600,
          labelFontSize: 11,
          titleFontSize: 12,
        },
        legend: {
          titleColor: "#374151",
          labelColor: "#4b5563",
          labelFontSize: 11,
        },
        // Base color scheme for marks if the LLM doesn't explicitly define one
        range: {
          category: [
            "#2563eb", // blue-600
            "#0ea5e9", // sky-500
            "#8b5cf6", // violet-500
            "#ec4899", // pink-500
            "#10b981", // emerald-500
          ]
        }
      }
    };
  }, [spec, data]);

  // Fallback for malformed specifications
  if (!compiledSpec) {
    return (
      <div className="w-full h-[300px] flex flex-col items-center justify-center bg-gray-50 border border-gray-100 rounded-2xl mt-4 text-gray-400">
        <AlertCircle size={24} className="mb-2 text-gray-300" />
        <p className="text-sm font-medium">Visualization spec unavailable</p>
      </div>
    );
  }

  return (
    <div className="w-full p-5 bg-white border border-gray-100 rounded-2xl shadow-sm mt-4 overflow-hidden relative group">
      <VegaLite 
        spec={compiledSpec} 
        actions={false} // Hides the default Vega export/editor menu for a cleaner SaaS UI
        className="w-full"
      />
    </div>
  );
};
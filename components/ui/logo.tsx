import React from "react";
import { cn } from "@/lib/utils";

interface LogoProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  iconOnly?: boolean;
}

/**
 * Data Omen "Prism" Logo
 * Represents: Structural integrity, Columnar storage, and Multi-tenant isolation.
 * Style: The Geometric Prism (Navy Infrastructure Series)
 */
export const Logo = ({ className, iconOnly = false, ...props }: LogoProps) => {
  return (
    <div className={cn("flex items-center gap-3 select-none", className)}>
      {/* Icon: The Prism */}
      <div className="relative flex-shrink-0">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-8 h-8 text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]"
          {...props}
        >
          {/* Hexagonal Outer Frame */}
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
          
          {/* Internal Geometric Facets */}
          <polyline points="3.27 6.96 12 12.01 20.73 6.96" className="opacity-80" />
          <line x1="12" y1="22.08" x2="12" y2="12" className="opacity-80" />
        </svg>
      </div>

      {/* Wordmark: DATA OMEN */}
      {!iconOnly && (
        <span className="text-xl font-black tracking-tight uppercase text-slate-100">
          Data<span className="text-blue-500">Omen</span>
        </span>
      )}
    </div>
  );
};

export default Logo;